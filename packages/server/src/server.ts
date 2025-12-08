import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pc from 'picocolors';
import type {
  PromptSubmitPayload,
  DiffApprovalPayload,
  StatusUpdatePayload,
  CodeChangeAction,
  WebSocketMessage,
} from '@insy/shared';

import { InsyWSServer } from './ws/server.js';
import { SourceFileFinder } from './analyzer/finder.js';
import { DiffGenerator } from './modifier/diff.js';
import { FileWriter } from './filesystem/writer.js';
import { ConfigLoader } from './config/loader.js';
import { AdapterRegistry } from './adapters/registry.js';
import { OpenCodeError } from './adapters/opencode.js';
import type { CLIToolAdapter } from './adapters/interface.js';
import { buildContextOnlyPrompt } from './prompts/builder.js';
import { parseStructuredResponse, isStructuredResponse } from './prompts/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Start the Insy server (for use by framework plugins)
 * If server is already running on the port, silently registers the project and returns.
 */
export async function startServer(options: ServerOptions = {}): Promise<void> {
  const port = options.port || 7777;
  const host = options.host || 'localhost';

  // Check if server is already running
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    const data = (await response.json()) as { status?: string };
    if (data.status === 'ok') {
      // Server already running, register project if provided
      if (options.projectRoot) {
        await fetch(`http://${host}:${port}/register`, {
          method: 'POST',
          body: JSON.stringify({ projectRoot: options.projectRoot }),
          headers: { 'Content-Type': 'application/json' },
        });
        console.log(pc.dim(`[insy] Registered project: ${options.projectRoot}`));
      }
      return;
    }
  } catch {
    // Server not running, continue to start
  }

  // Create and start server
  const server = new InsyServer(options);
  await server.start();
}

export interface ServerOptions {
  port?: number;
  host?: string;
  projectRoot?: string;
}

export class InsyServer {
  private app: Hono;
  private wsServer: InsyWSServer;
  private configLoader: ConfigLoader;
  private defaultProjectRoot: string;
  private adapterRegistry: AdapterRegistry;
  private currentAdapter?: CLIToolAdapter;
  private pendingDiffs = new Map<string, any>();

  // Per-project service cache
  private projectServices = new Map<
    string,
    {
      sourceFinder: SourceFileFinder;
      diffGenerator: DiffGenerator;
      fileWriter: FileWriter;
    }
  >();

  constructor(private options: ServerOptions = {}) {
    this.app = new Hono();
    this.defaultProjectRoot = options.projectRoot || process.cwd();
    this.configLoader = new ConfigLoader(this.defaultProjectRoot);
    this.wsServer = new InsyWSServer();
    this.adapterRegistry = new AdapterRegistry();

    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  // Get or create services for a specific project path
  private getProjectServices(projectPath?: string) {
    const root = projectPath || this.defaultProjectRoot;

    let services = this.projectServices.get(root);
    if (!services) {
      console.log(`[Server] Creating services for project: ${root}`);
      services = {
        sourceFinder: new SourceFileFinder(root),
        diffGenerator: new DiffGenerator(root),
        fileWriter: new FileWriter(root),
      };
      this.projectServices.set(root, services);
    }

    return services;
  }

  private setupRoutes(): void {
    // CORS
    this.app.use('/*', cors());

    // Health check
    this.app.get('/health', (c) => c.json({ status: 'ok' }));

    // Register project (used by framework plugins)
    this.app.post('/register', async (c) => {
      try {
        const { projectRoot } = await c.req.json();
        if (projectRoot) {
          console.log(pc.dim(`[Server] Project registered: ${projectRoot}`));
        }
        return c.json({ success: true });
      } catch {
        return c.json({ success: false, error: 'Invalid request' }, 400);
      }
    });

    // Get project config
    this.app.get('/config', async (c) => {
      try {
        const config = await this.configLoader.load();
        const projectRoot = this.options.projectRoot || process.cwd();
        return c.json({
          ...config,
          project: {
            ...config.project,
            path: config.project?.path || projectRoot,
          },
        });
      } catch (error) {
        console.error('Failed to load config:', error);
        return c.json({ error: 'Failed to load config' }, 500);
      }
    });

    // Serve client script with injected config
    this.app.get('/client.js', async (c) => {
      try {
        const clientPath = path.join(__dirname, '../../client/dist/client.js');
        const content = await readFile(clientPath, 'utf-8');

        // Load config and inject it into the client script
        const config = await this.configLoader.load();
        const projectRoot = config.project?.path || this.options.projectRoot || process.cwd();
        const host = config.server?.host || this.options.host || 'localhost';
        const port = config.server?.port || this.options.port || 7777;

        const injectedConfig = `
;(function() {
  window.__PIXELCODE_CONFIG__ = {
    projectPath: ${JSON.stringify(projectRoot)},
    host: ${JSON.stringify(host)},
    port: ${port},
    projectName: ${JSON.stringify(config.project?.name || path.basename(projectRoot))}
  };
})();
`;

        return c.text(injectedConfig + content, 200, {
          'Content-Type': 'application/javascript',
        });
      } catch (error) {
        console.error('Failed to serve client:', error);
        return c.text('// Client not found. Run `pnpm build` first.', 404);
      }
    });
  }

  /**
   * Setup WebSocket message handlers
   */
  private setupWebSocketHandlers(): void {
    this.wsServer.onMessage((clientId: string, message: WebSocketMessage) => {
      switch (message.type) {
        case 'prompt/submit':
          this.handlePromptMessage(clientId, message.payload as PromptSubmitPayload);
          break;
        case 'diff/approve':
          this.handleDiffApproval(clientId, message.payload as DiffApprovalPayload);
          break;
        case 'diff/undo':
          this.handleDiffUndo(clientId, message.payload as { diffId: string });
          break;
        case 'diff/toggle':
          this.handleDiffToggle(clientId, message.payload as { diffId: string });
          break;
        default:
          console.warn(`[Server] Unknown message type: ${message.type}`);
      }
    });
  }

  /**
   * Handle prompt submission from WebSocket
   */
  private handlePromptMessage(clientId: string, payload: PromptSubmitPayload): void {
    // Validate required fields
    if (!payload.instanceId || !payload.element || !payload.framework || !payload.prompt) {
      this.wsServer.send(clientId, 'error', {
        code: 'INVALID_REQUEST',
        message: 'Missing required fields: instanceId, element, framework, prompt',
      });
      return;
    }

    // Start async processing
    this.handlePrompt(clientId, payload).catch((error) => {
      console.error('[Server] Error in prompt handling:', error);
      this.wsServer.send(clientId, 'error', {
        code: 'PROCESSING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  private async handlePrompt(clientId: string, payload: PromptSubmitPayload): Promise<void> {
    // Extract context directly from payload (no separate element:select step)
    const {
      element,
      framework,
      frameworkContext,
      sourceHints,
      projectPath: payloadProjectPath,
    } = payload;

    // Build context object
    const context = {
      element,
      framework,
      frameworkContext,
      sourceHints,
      prompt: payload.prompt,
    };

    // Get project path from payload, fallback to default
    const projectPath = payloadProjectPath || this.defaultProjectRoot;
    const { diffGenerator } = this.getProjectServices(projectPath);

    try {
      // Stage 1: Prepare context for AI
      this.sendStatus(
        clientId,
        payload.instanceId,
        'analyzing',
        'Preparing element context...',
        10
      );
      console.log('[Server] Processing element context...');
      console.log('[Server] Project:', projectPath);
      console.log('[Server] Framework:', framework.type);
      console.log(
        '[Server] Element:',
        element.tagName,
        element.id ? `#${element.id}` : '',
        element.className ? `.${element.className.split(' ')[0]}` : ''
      );

      // Get component info from React context
      const reactContext = frameworkContext as any;
      if (reactContext?.componentName) {
        console.log('[Server] Component:', reactContext.componentName);
      }
      if (reactContext?.fiberPath?.length > 0) {
        console.log('[Server] Component path:', reactContext.fiberPath.slice(-5).join(' → '));
      }

      // Stage 2: Build prompt with full context
      this.sendStatus(clientId, payload.instanceId, 'ai_processing', 'Building prompt...', 30);

      const prompt = buildContextOnlyPrompt(context, payload.conversationHistory, projectPath);

      // Log conversation history if present
      if (payload.conversationHistory && payload.conversationHistory.length > 0) {
        console.log(
          `[Server] Including ${payload.conversationHistory.length} messages in conversation history`
        );
      }

      // Stage 3: Execute CLI via adapter
      if (!this.currentAdapter) {
        this.wsServer.send(clientId, 'error', {
          code: 'NO_ADAPTER',
          message: 'No CLI tool adapter available',
        });
        return;
      }

      this.sendStatus(
        clientId,
        payload.instanceId,
        'ai_processing',
        `Asking ${this.currentAdapter.name} to find and edit files...`,
        50
      );

      const config = this.configLoader.get();
      // Use sessionId from payload (unique per chat) or fallback to config
      const sessionId = payload.sessionId || config.opencode?.session || 'insy-default';
      console.log(`[Server] Using session: ${sessionId}`);
      if (payload.attachments?.length) {
        console.log(`[Server] Including ${payload.attachments.length} image attachment(s)`);
      }

      const cliResponse = await this.currentAdapter.run(prompt, {
        session: sessionId,
        model: config.opencode?.model,
        continueSession: config.opencode?.continueSession,
        cwd: projectPath,
        attachments: payload.attachments,
      });

      // Log full AI response
      console.log('[Server] ===== FULL AI RESPONSE =====');
      console.log(cliResponse);
      console.log('[Server] ===== END AI RESPONSE =====');

      // Stage 4: Parse response
      this.sendStatus(
        clientId,
        payload.instanceId,
        'generating_diff',
        'Parsing AI response...',
        70
      );

      // Check if response is in structured XML format
      if (isStructuredResponse(cliResponse)) {
        // New structured format - can handle multiple files
        const structured = parseStructuredResponse(cliResponse);

        // Stage 5: Generate diffs for all changes
        this.sendStatus(clientId, payload.instanceId, 'generating_diff', 'Generating diffs...', 85);
        const multiDiff = await diffGenerator.generateMultiple(
          structured.changes,
          structured.summary
        );

        // Store all diffs for approval (include projectPath for later use)
        const diffPayloads: Array<{
          diffId: string;
          file: string;
          action: CodeChangeAction;
          diff: string;
          preview: { before: string; after: string };
        }> = [];

        // Get fileWriter for auto-applying
        const { fileWriter } = this.getProjectServices(projectPath);

        // Auto-apply all diffs immediately
        this.sendStatus(clientId, payload.instanceId, 'generating_diff', 'Applying changes...', 90);

        for (const diff of multiDiff.results) {
          this.pendingDiffs.set(diff.id, { ...diff, projectPath });

          // Auto-apply the diff (creates backup automatically)
          const applyResult = await fileWriter.applyDiff(diff);

          // Handle conflicts
          if (!applyResult.success && applyResult.conflict) {
            console.error(
              `[Server] CONFLICT detected when auto-applying ${diff.file}: ${applyResult.error}`
            );

            // Send conflict error to client
            this.wsServer.send(clientId, 'error', {
              code: 'CONFLICT',
              message: `Cannot apply changes to ${diff.file}: file was modified by another edit`,
              conflict: {
                diffId: diff.id,
                file: diff.file,
                expectedHash: applyResult.conflict.expectedHash,
                actualHash: applyResult.conflict.actualHash,
              },
            });

            // Don't add this diff to the payload - it failed
            continue;
          }

          if (!applyResult.success) {
            console.error(
              `[Server] Failed to auto-apply diff for ${diff.file}: ${applyResult.error}`
            );
            // Don't add failed diffs to payload
            continue;
          }

          // Find the corresponding action from changes
          const change = structured.changes.find((c) => c.filePath === diff.file);

          diffPayloads.push({
            diffId: diff.id,
            file: diff.file,
            action: change?.action || 'modify',
            diff: diff.unifiedDiff,
            preview: {
              before: diff.originalCode,
              after: diff.modifiedCode,
            },
          });
        }

        // Send multi-diff to client via WebSocket
        console.log(
          `[Server] Sending diff event with ${diffPayloads.length} diff(s) (auto-applied)`
        );
        for (const dp of diffPayloads) {
          console.log(
            `[Server]   - ${dp.file} (${dp.action}): before=${dp.preview.before.length} bytes, after=${dp.preview.after.length} bytes`
          );
        }

        this.wsServer.send(clientId, 'diff', {
          instanceId: payload.instanceId,
          summary: structured.summary,
          diffs: diffPayloads,
          autoApplied: true,
        });
      } else {
        // Legacy format - AI didn't return structured XML
        console.warn('[Server] AI response not in structured format, raw response received');
        this.wsServer.send(clientId, 'error', {
          code: 'PARSE_ERROR',
          message:
            'AI response was not in the expected XML format. Expected <file_changes> with file content for diff generation.',
        });
        this.sendStatus(clientId, payload.instanceId, 'error', 'Unexpected response format', 0);
      }
    } catch (error) {
      console.error('[Server] Error handling prompt:', error);

      // Handle OpenCode-specific errors with more context
      if (error instanceof OpenCodeError) {
        let errorCode = 'AI_ERROR';
        let userMessage = error.message;

        // Provide more user-friendly messages for common errors
        if (error.errorName === 'ProviderAuthError') {
          errorCode = 'AUTH_ERROR';
          userMessage = `Authentication failed: ${error.message}`;
        } else if (error.errorName === 'RateLimitError') {
          errorCode = 'RATE_LIMIT';
          userMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        } else if (error.errorName === 'ProviderError') {
          errorCode = 'PROVIDER_ERROR';
          userMessage = `AI provider error: ${error.message}`;
        }

        this.wsServer.send(clientId, 'error', {
          code: errorCode,
          message: userMessage,
          details: {
            errorName: error.errorName,
            providerID: error.providerID,
          },
        });

        // Also send a status update to clear the loading state
        this.sendStatus(clientId, payload.instanceId, 'error', userMessage, 0);
        return;
      }

      this.wsServer.send(clientId, 'error', {
        code: 'PROCESSING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      // Send error status to clear loading state
      this.sendStatus(
        clientId,
        payload.instanceId,
        'error',
        error instanceof Error ? error.message : 'An error occurred',
        0
      );
    }
  }

  private async handleDiffApproval(clientId: string, payload: DiffApprovalPayload): Promise<void> {
    const storedDiff = this.pendingDiffs.get(payload.diffId);

    if (!storedDiff) {
      this.wsServer.send(clientId, 'error', {
        code: 'DIFF_NOT_FOUND',
        message: 'Diff not found',
      });
      return;
    }

    // Extract projectPath and diff data
    const { projectPath, ...diff } = storedDiff;

    // Get fileWriter for the correct project
    const { fileWriter } = this.getProjectServices(projectPath);

    if (payload.action === 'reject') {
      // Permanent reject - restore from backup, delete backup, remove from pending
      await fileWriter.undo(payload.diffId);
      await fileWriter.deleteBackup(payload.diffId);
      this.pendingDiffs.delete(payload.diffId);
      console.log(`[Server] Rejected diff ${payload.diffId} - restored and cleaned up`);
      return;
    }

    if (payload.action === 'accept') {
      // Permanent accept - keep changes, delete backup only, remove from pending
      await fileWriter.deleteBackup(payload.diffId);
      this.pendingDiffs.delete(payload.diffId);

      this.wsServer.send(clientId, 'accepted', {
        diffId: payload.diffId,
        file: diff.file,
        success: true,
      });

      console.log(`[Server] Accepted diff ${payload.diffId} - backup deleted, changes kept`);
      return;
    }

    // Legacy: Apply changes (action === 'apply') - for backward compatibility
    try {
      const result = await fileWriter.applyDiff(diff);

      if (result.success) {
        this.wsServer.send(clientId, 'applied', {
          diffId: payload.diffId,
          file: diff.file,
          success: true,
          backupPath: result.backupPath,
        });

        // DON'T delete from pendingDiffs - keep it for undo capability
        console.log(`[Server] Applied diff ${payload.diffId}, keeping in memory for undo`);
      } else {
        // Check if it's a conflict
        if (result.conflict) {
          this.wsServer.send(clientId, 'error', {
            code: 'CONFLICT',
            message: `Cannot apply changes to ${diff.file}: file was modified by another edit`,
            conflict: {
              diffId: payload.diffId,
              file: diff.file,
              expectedHash: result.conflict.expectedHash,
              actualHash: result.conflict.actualHash,
            },
          });
        } else {
          this.wsServer.send(clientId, 'error', {
            code: 'WRITE_ERROR',
            message: result.error || 'Failed to write file',
          });
        }
      }
    } catch (error) {
      console.error('[Server] Error applying diff:', error);
      this.wsServer.send(clientId, 'error', {
        code: 'WRITE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleDiffUndo(clientId: string, payload: { diffId: string }): Promise<void> {
    const storedDiff = this.pendingDiffs.get(payload.diffId);

    if (!storedDiff) {
      this.wsServer.send(clientId, 'error', {
        code: 'DIFF_NOT_FOUND',
        message: 'Diff not found',
      });
      return;
    }

    // Extract projectPath
    const { projectPath } = storedDiff;

    // Get fileWriter for the correct project
    const { fileWriter } = this.getProjectServices(projectPath);

    // Undo changes (restore from backup)
    try {
      const success = await fileWriter.undo(payload.diffId);

      if (success) {
        this.wsServer.send(clientId, 'undone', {
          diffId: payload.diffId,
          success: true,
        });

        console.log(`[Server] Undid changes for diff ${payload.diffId}`);
      } else {
        this.wsServer.send(clientId, 'error', {
          code: 'UNDO_ERROR',
          message: 'Failed to undo changes',
        });
      }
    } catch (error) {
      console.error('[Server] Error undoing diff:', error);
      this.wsServer.send(clientId, 'error', {
        code: 'UNDO_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleDiffToggle(
    clientId: string,
    payload: { diffId: string }
  ): Promise<{ success: boolean; isApplied: boolean }> {
    const storedDiff = this.pendingDiffs.get(payload.diffId);

    if (!storedDiff) {
      this.wsServer.send(clientId, 'error', {
        code: 'DIFF_NOT_FOUND',
        message: 'Diff not found',
      });
      return { success: false, isApplied: false };
    }

    // Extract projectPath
    const { projectPath } = storedDiff;

    // Get fileWriter for the correct project
    const { fileWriter } = this.getProjectServices(projectPath);

    // Toggle changes on/off
    try {
      const result = await fileWriter.toggle(payload.diffId);

      if (result.success) {
        this.wsServer.send(clientId, 'toggled', {
          diffId: payload.diffId,
          isApplied: result.isApplied,
        });

        console.log(
          `[Server] Toggled diff ${payload.diffId} - now ${result.isApplied ? 'ON' : 'OFF'}`
        );
      }

      return result;
    } catch (error) {
      console.error('[Server] Error toggling diff:', error);
      this.wsServer.send(clientId, 'error', {
        code: 'TOGGLE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false, isApplied: false };
    }
  }

  private sendStatus(
    clientId: string,
    instanceId: string,
    stage: string,
    message: string,
    progress?: number
  ): void {
    this.wsServer.send(clientId, 'status', {
      instanceId,
      stage,
      message,
      progress,
    } as StatusUpdatePayload);
  }

  private async checkExistingServer(host: string, port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}:${port}/health`);
      const data = (await response.json()) as { status?: string };
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    // Load config
    await this.configLoader.load();
    const config = this.configLoader.get();

    // Setup adapters - register all available CLI tools
    console.log(pc.dim('Checking for available CLI tools...'));
    this.adapterRegistry.registerDefaultAdapters();

    // Detect available tools with priority ordering
    const available = await this.adapterRegistry.getAvailableWithPriority();

    if (available.length === 0) {
      console.error();
      console.error(pc.red('✗ No CLI tools found'));
      console.error();
      console.error('Insy requires at least one AI CLI tool to be installed.');
      console.error();
      console.error('Supported CLI tools (in order of priority):');
      console.error(pc.cyan('  1. OpenCode:        https://opencode.ai'));
      console.error(pc.cyan('  2. Claude Code:     https://code.claude.com'));
      console.error(pc.cyan('  3. Gemini CLI:      npm install -g @google/gemini-cli'));
      console.error(pc.cyan('  4. GitHub Copilot:  npm install -g @github/copilot'));
      console.error();
      process.exit(1);
    }

    // Use configured tool or first available (by priority)
    const toolName = config.tool;
    this.currentAdapter = toolName ? await this.adapterRegistry.getAdapter(toolName) : available[0];

    if (this.currentAdapter && this.currentAdapter.getVersion) {
      const version = await this.currentAdapter.getVersion();
      console.log(pc.green(`✓ Found ${this.currentAdapter.name} v${version}`));
    } else if (this.currentAdapter) {
      console.log(pc.green(`✓ Found ${this.currentAdapter.name}`));
    }

    const port = this.options.port || config.server?.port || 7777;
    const host = this.options.host || config.server?.host || 'localhost';

    // Check if server is already running before attempting to start
    const isAlreadyRunning = await this.checkExistingServer(host, port);
    if (isAlreadyRunning) {
      console.log();
      console.log(pc.yellow(`Insy server already running at http://${host}:${port}`));
      console.log(pc.dim('Using existing server instance.'));
      console.log();
      return;
    }

    // Start HTTP server
    const server = serve(
      {
        fetch: this.app.fetch,
        port,
        hostname: host,
      },
      () => {
        console.log();
        console.log(pc.bold(pc.cyan('🎨 Insy Server')));
        console.log();
        console.log(`${pc.green('✓')} Server running at ${pc.cyan(`http://${host}:${port}`)}`);
        console.log(`${pc.green('✓')} WebSocket endpoint at ${pc.cyan(`ws://${host}:${port}/ws`)}`);
        console.log();
        console.log(pc.dim('Add this script tag to your app:'));
        console.log(pc.yellow(`  <script src="http://${host}:${port}/client.js"></script>`));
        console.log();
        console.log(
          pc.dim('Or use the keyboard shortcut: ⌘+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)')
        );
        console.log();
        console.log(pc.dim(`CLI Tool: ${this.currentAdapter?.name}`));
        console.log(pc.dim(`Default Project: ${this.defaultProjectRoot}`));
        console.log();
      }
    );

    // Attach WebSocket server to the HTTP server
    this.wsServer.attach(server);

    // Handle port already in use - shouldn't happen with pre-check, but keep as fallback
    server.on('error', async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error();
        console.error(pc.red(`✗ Port ${port} is already in use by another application.`));
        console.error(
          pc.dim(
            `Run: lsof -i :${port} (macOS/Linux) or netstat -ano | findstr :${port} (Windows) to find what's using it.`
          )
        );
        console.error();
        process.exit(1);
        return;
      }
      // Re-throw other errors
      throw err;
    });
  }
}
