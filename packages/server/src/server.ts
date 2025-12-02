import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pc from 'picocolors';
import type { WebSocket } from 'ws';
import type {
  Message,
  ElementContext,
  PromptSubmitPayload,
  DiffApprovalPayload,
  StatusUpdatePayload,
} from '@pixelcode/shared';

import { PixelCodeWebSocketServer } from './websocket/server.js';
import { SourceFileFinder } from './analyzer/finder.js';
import { DiffGenerator } from './modifier/diff.js';
import { FileWriter } from './filesystem/writer.js';
import { ConfigLoader } from './config/loader.js';
import { AdapterRegistry } from './adapters/registry.js';
import { OpenCodeCLIAdapter } from './adapters/opencode-cli.js';
import { buildOpenCodePrompt, parseOpenCodeResponse } from './prompts/builder.js';
import type { CLIToolAdapter } from './adapters/interface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port?: number;
  host?: string;
  projectRoot?: string;
}

export class PixelCodeServer {
  private app: Hono;
  private wsServer?: PixelCodeWebSocketServer;
  private configLoader: ConfigLoader;
  private sourceFinder: SourceFileFinder;
  private diffGenerator: DiffGenerator;
  private fileWriter: FileWriter;
  private adapterRegistry: AdapterRegistry;
  private currentAdapter?: CLIToolAdapter;
  private elementContexts = new Map<string, ElementContext>();
  private pendingDiffs = new Map<string, any>();

  constructor(private options: ServerOptions = {}) {
    this.app = new Hono();
    const projectRoot = options.projectRoot || process.cwd();

    this.configLoader = new ConfigLoader(projectRoot);
    this.sourceFinder = new SourceFileFinder(projectRoot);
    this.diffGenerator = new DiffGenerator();
    this.fileWriter = new FileWriter(projectRoot);
    this.adapterRegistry = new AdapterRegistry();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // CORS
    this.app.use('/*', cors());

    // Health check
    this.app.get('/health', (c) => c.json({ status: 'ok' }));

    // Serve client script
    this.app.get('/client.js', async (c) => {
      try {
        const clientPath = path.join(__dirname, '../../client/dist/client.js');
        const content = await readFile(clientPath, 'utf-8');
        return c.text(content, 200, {
          'Content-Type': 'application/javascript',
        });
      } catch (error) {
        console.error('Failed to serve client:', error);
        return c.text('// Client not found. Run `pnpm build` first.', 404);
      }
    });
  }

  private setupWebSocket(server: any): void {
    this.wsServer = new PixelCodeWebSocketServer(server);

    // Element selection
    this.wsServer.on('element:select', async (ws, message) => {
      const payload = message.payload as any;
      const elementId = payload.elementId || crypto.randomUUID();

      this.elementContexts.set(elementId, payload);
      console.log(`[Server] Element selected: ${elementId}`);
    });

    // Prompt submission
    this.wsServer.on('prompt:submit', async (ws, message) => {
      await this.handlePrompt(ws, message);
    });

    // Diff approval
    this.wsServer.on('diff:approve', async (ws, message) => {
      await this.handleDiffApproval(ws, message);
    });
  }

  private async handlePrompt(ws: WebSocket, message: Message): Promise<void> {
    const payload = message.payload as PromptSubmitPayload;
    const context = this.elementContexts.get(payload.elementId);

    if (!context) {
      this.wsServer?.sendError(ws, 'CONTEXT_NOT_FOUND', 'Element context not found');
      return;
    }

    try {
      // Stage 1: Finding source file
      this.sendStatus(ws, 'analyzing', 'Finding source file...', 10);
      console.log('[Server] Searching for source file...');
      console.log('[Server] Framework:', context.framework.type);
      console.log(
        '[Server] Element:',
        context.element.tagName,
        context.element.id ? `#${context.element.id}` : '',
        context.element.className ? `.${context.element.className.split(' ')[0]}` : ''
      );

      const sourceFiles = await this.sourceFinder.findSourceFiles(context);

      if (sourceFiles.length === 0) {
        console.error('[Server] No source files found for element');
        console.error('[Server] Project root:', this.options.projectRoot || process.cwd());
        this.wsServer?.sendError(
          ws,
          'SOURCE_NOT_FOUND',
          'Could not find source file for this element. Make sure your HTML/source files are in the project directory.'
        );
        return;
      }

      const primarySource = sourceFiles[0];
      console.log(
        '[Server] Found source file:',
        primarySource.path,
        `(relevance: ${primarySource.relevance})`
      );
      this.sendStatus(ws, 'analyzing', `Found: ${path.basename(primarySource.path)}`, 30);

      // Stage 2: Read source code
      const sourceCode = await readFile(primarySource.path, 'utf-8');

      // Stage 3: Build prompt for OpenCode
      this.sendStatus(ws, 'ai_processing', 'Building prompt for OpenCode...', 40);

      // Add user's prompt to context
      const contextWithPrompt = { ...context, prompt: payload.prompt };
      const prompt = buildOpenCodePrompt(contextWithPrompt, sourceCode, primarySource.path);

      // Stage 4: Execute OpenCode CLI
      if (!this.currentAdapter) {
        this.wsServer?.sendError(ws, 'NO_ADAPTER', 'No CLI tool adapter available');
        return;
      }

      this.sendStatus(
        ws,
        'ai_processing',
        `Asking ${this.currentAdapter.name} to generate changes...`,
        50
      );

      const config = this.configLoader.get();
      const openCodeResponse = await this.currentAdapter.run(prompt, {
        session: config.opencode?.session,
        model: config.opencode?.model,
        continueSession: config.opencode?.continueSession,
        cwd: this.options.projectRoot || process.cwd(),
      });

      // Stage 5: Parse response
      this.sendStatus(ws, 'generating_diff', 'Parsing AI response...', 70);
      const { code: modifiedCode } = parseOpenCodeResponse(openCodeResponse);

      // Stage 6: Generate diff
      this.sendStatus(ws, 'generating_diff', 'Generating diff...', 85);
      const diff = this.diffGenerator.generate(primarySource.path, sourceCode, modifiedCode);

      // Store diff for approval
      this.pendingDiffs.set(diff.id, diff);

      // Send diff to client
      this.wsServer?.send(ws, {
        id: crypto.randomUUID(),
        type: 'diff:generated',
        payload: {
          diffId: diff.id,
          elementId: payload.elementId,
          file: diff.file,
          diff: diff.unifiedDiff,
          preview: {
            before: diff.originalCode,
            after: diff.modifiedCode,
          },
        },
        timestamp: Date.now(),
      });

      this.sendStatus(ws, 'complete', 'Ready for review', 100);
    } catch (error) {
      console.error('[Server] Error handling prompt:', error);
      this.wsServer?.sendError(
        ws,
        'PROCESSING_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async handleDiffApproval(ws: WebSocket, message: Message): Promise<void> {
    const payload = message.payload as DiffApprovalPayload;
    const diff = this.pendingDiffs.get(payload.diffId);

    if (!diff) {
      this.wsServer?.sendError(ws, 'DIFF_NOT_FOUND', 'Diff not found');
      return;
    }

    if (payload.action === 'reject') {
      this.pendingDiffs.delete(payload.diffId);
      return;
    }

    // Apply changes
    try {
      const result = await this.fileWriter.applyDiff(diff);

      if (result.success) {
        this.wsServer?.send(ws, {
          id: crypto.randomUUID(),
          type: 'diff:applied',
          payload: {
            diffId: payload.diffId,
            file: diff.file,
            success: true,
            backupPath: result.backupPath,
          },
          timestamp: Date.now(),
        });

        this.pendingDiffs.delete(payload.diffId);
      } else {
        this.wsServer?.sendError(ws, 'WRITE_ERROR', result.error || 'Failed to write file');
      }
    } catch (error) {
      console.error('[Server] Error applying diff:', error);
      this.wsServer?.sendError(
        ws,
        'WRITE_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private sendStatus(ws: WebSocket, stage: string, message: string, progress?: number): void {
    this.wsServer?.send(ws, {
      id: crypto.randomUUID(),
      type: 'status:update',
      payload: { stage, message, progress } as StatusUpdatePayload,
      timestamp: Date.now(),
    });
  }

  async start(): Promise<void> {
    // Load config
    await this.configLoader.load();
    const config = this.configLoader.get();

    // Setup adapters
    const openCodeConfig = config.opencode || {};
    const openCodeAdapter = new OpenCodeCLIAdapter(openCodeConfig);
    this.adapterRegistry.register(openCodeAdapter);

    // Detect available tools
    console.log(pc.dim('Checking for available CLI tools...'));
    const available = await this.adapterRegistry.detectAvailable();

    if (available.length === 0) {
      console.error();
      console.error(pc.red('✗ No CLI tools found'));
      console.error();
      console.error('PixelCode requires OpenCode to be installed.');
      console.error();
      console.error('Install OpenCode:');
      console.error(pc.cyan('  https://opencode.ai'));
      console.error();
      console.error('Or use Homebrew:');
      console.error(pc.cyan('  brew install opencode'));
      console.error();
      process.exit(1);
    }

    // Use configured tool or first available
    const toolName = config.tool || 'opencode';
    this.currentAdapter = this.adapterRegistry.get(toolName) || available[0];

    if (this.currentAdapter && this.currentAdapter.getVersion) {
      const version = await this.currentAdapter.getVersion();
      console.log(pc.green(`✓ Found ${this.currentAdapter.name} v${version}`));
    } else {
      console.log(pc.green(`✓ Found ${this.currentAdapter?.name}`));
    }

    const port = this.options.port || config.server?.port || 7777;
    const host = this.options.host || config.server?.host || 'localhost';

    // Start HTTP server
    const server = serve(
      {
        fetch: this.app.fetch,
        port,
        hostname: host,
      },
      (info: any) => {
        console.log();
        console.log(pc.bold(pc.cyan('🎨 PixelCode Server')));
        console.log();
        console.log(`${pc.green('✓')} Server running at ${pc.cyan(`http://${host}:${port}`)}`);
        console.log(`${pc.green('✓')} WebSocket ready at ${pc.cyan(`ws://${host}:${port}`)}`);
        console.log();
        console.log(pc.dim('Add this script tag to your app:'));
        console.log(pc.yellow(`  <script src="http://${host}:${port}/client.js"></script>`));
        console.log();
        console.log(
          pc.dim('Or use the keyboard shortcut: ⌘+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)')
        );
        console.log();
        console.log(pc.dim(`CLI Tool: ${this.currentAdapter?.name}`));
        console.log(pc.dim(`Project: ${this.options.projectRoot || process.cwd()}`));
        console.log();
      }
    );

    // Setup WebSocket
    this.setupWebSocket(server);
  }
}
