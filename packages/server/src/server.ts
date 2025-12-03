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
  ToolInfo,
  ToolsListPayload,
  ModelsListPayload,
  ToolConfigPayload,
  CodeChangeAction,
} from '@pixelcode/shared';

import { PixelCodeWebSocketServer } from './websocket/server.js';
import { SourceFileFinder } from './analyzer/finder.js';
import { DiffGenerator } from './modifier/diff.js';
import { FileWriter } from './filesystem/writer.js';
import { ConfigLoader } from './config/loader.js';
import { AdapterRegistry } from './adapters/registry.js';
import { buildContextOnlyPrompt, buildOpenCodePrompt, parseOpenCodeResponse } from './prompts/builder.js';
import { parseStructuredResponse, isStructuredResponse } from './prompts/parser.js';
import type { CLIToolAdapter } from './adapters/interface.js';
import { OpenCodeError } from './adapters/opencode-cli.js';

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
  private defaultProjectRoot: string;
  private adapterRegistry: AdapterRegistry;
  private currentAdapter?: CLIToolAdapter;
  private elementContexts = new Map<string, ElementContext & { projectPath?: string }>();
  private pendingDiffs = new Map<string, any>();
  
  // Per-project service cache
  private projectServices = new Map<string, {
    sourceFinder: SourceFileFinder;
    diffGenerator: DiffGenerator;
    fileWriter: FileWriter;
  }>();

  constructor(private options: ServerOptions = {}) {
    this.app = new Hono();
    this.defaultProjectRoot = options.projectRoot || process.cwd();

    this.configLoader = new ConfigLoader(this.defaultProjectRoot);
    this.adapterRegistry = new AdapterRegistry();

    this.setupRoutes();
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

  private setupWebSocket(server: any): void {
    this.wsServer = new PixelCodeWebSocketServer(server);

    // List available tools
    this.wsServer.on('tools:list', async (ws, message) => {
      await this.handleToolsList(ws, message);
    });

    // List models for a specific tool
    this.wsServer.on('models:list', async (ws, message) => {
      await this.handleModelsList(ws, message);
    });

    // Update tool/model configuration
    this.wsServer.on('config:update', async (ws, message) => {
      await this.handleConfigUpdate(ws, message);
    });

    // Element selection
    this.wsServer.on('element:select', async (ws, message) => {
      const payload = message.payload as any;
      const elementId = payload.elementId || crypto.randomUUID();

      // Extract context and store projectPath
      const { elementId: _, projectPath, ...context } = payload;
      this.elementContexts.set(elementId, { ...context, projectPath });
      console.log(`[Server] Element selected: ${elementId}${projectPath ? ` (project: ${projectPath})` : ''}`);
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

    // Get project path from payload or context, fallback to default
    const projectPath = payload.projectPath || context.projectPath || this.defaultProjectRoot;
    const { diffGenerator } = this.getProjectServices(projectPath);

    try {
      // Stage 1: Prepare context for AI
      this.sendStatus(ws, 'analyzing', 'Preparing element context...', 10);
      console.log('[Server] Processing element context...');
      console.log('[Server] Project:', projectPath);
      console.log('[Server] Framework:', context.framework.type);
      console.log(
        '[Server] Element:',
        context.element.tagName,
        context.element.id ? `#${context.element.id}` : '',
        context.element.className ? `.${context.element.className.split(' ')[0]}` : ''
      );

      // Get component info from React context
      const reactContext = context.frameworkContext as any;
      if (reactContext?.componentName) {
        console.log('[Server] Component:', reactContext.componentName);
      }
      if (reactContext?.fiberPath?.length > 0) {
        console.log('[Server] Component path:', reactContext.fiberPath.slice(-5).join(' → '));
      }

      // Stage 2: Build prompt with full context (no source file needed)
      this.sendStatus(ws, 'ai_processing', 'Building prompt...', 30);

      // Add user's prompt to context
      const contextWithPrompt = { ...context, prompt: payload.prompt };
      const prompt = buildContextOnlyPrompt(
        contextWithPrompt, 
        payload.conversationHistory
      );

      // Log conversation history if present
      if (payload.conversationHistory && payload.conversationHistory.length > 0) {
        console.log(`[Server] Including ${payload.conversationHistory.length} messages in conversation history`);
      }

      // Stage 3: Execute CLI - Use tool from payload or fallback to current adapter
      let adapter = this.currentAdapter;
      if (payload.tool) {
        const requestedAdapter = await this.adapterRegistry.getAdapter(payload.tool);
        if (requestedAdapter) {
          adapter = requestedAdapter;
          console.log(`[Server] Using requested tool: ${adapter.name}`);
        }
      }

      if (!adapter) {
        this.wsServer?.sendError(ws, 'NO_ADAPTER', 'No CLI tool adapter available');
        return;
      }

      this.sendStatus(
        ws,
        'ai_processing',
        `Asking ${adapter.name} to find and edit files...`,
        50
      );

      const config = this.configLoader.get();
      // Use sessionId from payload (unique per chat) or fallback to config
      const sessionId = payload.sessionId || config.opencode?.session || 'pixelcode-default';
      console.log(`[Server] Using session: ${sessionId}`);
      
      const cliResponse = await adapter.run(prompt, {
        session: sessionId,
        model: payload.model || config.opencode?.model,  // Use model from payload or config
        continueSession: config.opencode?.continueSession,
        cwd: projectPath,
      });

      // Stage 4: Parse response
      this.sendStatus(ws, 'generating_diff', 'Parsing AI response...', 70);
      
      // Check if response is in structured XML format
      if (isStructuredResponse(cliResponse)) {
        // New structured format - can handle multiple files
        const structured = parseStructuredResponse(cliResponse);
        
        // Stage 5: Generate diffs for all changes
        this.sendStatus(ws, 'generating_diff', 'Generating diffs...', 85);
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
        
        for (const diff of multiDiff.results) {
          this.pendingDiffs.set(diff.id, { ...diff, projectPath });
          
          // Find the corresponding action from changes
          const change = structured.changes.find(c => c.filePath === diff.file);
          
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
        
        // Send multi-diff to client
        console.log(`[Server] Sending multi_diff:generated with ${diffPayloads.length} diff(s)`);
        for (const dp of diffPayloads) {
          console.log(`[Server]   - ${dp.file} (${dp.action}): before=${dp.preview.before.length} bytes, after=${dp.preview.after.length} bytes`);
        }
        
        this.wsServer?.send(ws, {
          id: crypto.randomUUID(),
          type: 'multi_diff:generated',
          payload: {
            elementId: payload.elementId,
            summary: structured.summary,
            diffs: diffPayloads,
          },
          timestamp: Date.now(),
        });
        
        // Note: Not sending status:complete here as the multi_diff:generated message 
        // already transitions the client to diff review state
      } else {
        // Legacy format - AI didn't return structured XML
        // This shouldn't happen with the new context-only prompt, but handle gracefully
        console.warn('[Server] AI response not in structured format, raw response received');
        this.wsServer?.sendError(
          ws,
          'PARSE_ERROR',
          'AI response was not in the expected format. The AI should search for and edit files directly.'
        );
        this.sendStatus(ws, 'error', 'Unexpected response format', 0);
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
        
        this.wsServer?.sendError(ws, errorCode, userMessage, {
          errorName: error.errorName,
          providerID: error.providerID,
        });
        
        // Also send a status update to clear the loading state
        this.sendStatus(ws, 'error', userMessage, 0);
        return;
      }
      
      this.wsServer?.sendError(
        ws,
        'PROCESSING_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      // Send error status to clear loading state
      this.sendStatus(ws, 'error', error instanceof Error ? error.message : 'An error occurred', 0);
    }
  }

  private async handleDiffApproval(ws: WebSocket, message: Message): Promise<void> {
    const payload = message.payload as DiffApprovalPayload;
    const storedDiff = this.pendingDiffs.get(payload.diffId);

    if (!storedDiff) {
      this.wsServer?.sendError(ws, 'DIFF_NOT_FOUND', 'Diff not found');
      return;
    }

    // Extract projectPath and diff data
    const { projectPath, ...diff } = storedDiff;

    if (payload.action === 'reject') {
      this.pendingDiffs.delete(payload.diffId);
      return;
    }

    // Get fileWriter for the correct project
    const { fileWriter } = this.getProjectServices(projectPath);

    // Apply changes
    try {
      const result = await fileWriter.applyDiff(diff);

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

  private async handleToolsList(ws: WebSocket, message: Message): Promise<void> {
    try {
      const available = await this.adapterRegistry.getAvailableWithPriority();
      
      const tools: ToolInfo[] = await Promise.all(
        available.map(async (adapter) => ({
          name: adapter.name,
          identifier: adapter.name.toLowerCase().replace(/\s+/g, '-'),
          version: adapter.getVersion ? await adapter.getVersion() : undefined,
          available: true,
        }))
      );

      this.wsServer?.send(ws, {
        id: crypto.randomUUID(),
        type: 'tools:list:response',
        payload: { tools } as ToolsListPayload,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[Server] Error listing tools:', error);
      this.wsServer?.sendError(ws, 'TOOLS_LIST_ERROR', 'Failed to list tools');
    }
  }

  private async handleModelsList(ws: WebSocket, message: Message): Promise<void> {
    const payload = message.payload as { tool: string };
    
    try {
      const adapter = await this.adapterRegistry.getAdapter(payload.tool);
      
      if (!adapter) {
        this.wsServer?.sendError(ws, 'TOOL_NOT_FOUND', `Tool '${payload.tool}' not found`);
        return;
      }

      const models = adapter.getAvailableModels 
        ? await adapter.getAvailableModels() 
        : [];

      this.wsServer?.send(ws, {
        id: crypto.randomUUID(),
        type: 'models:list:response',
        payload: { tool: payload.tool, models } as ModelsListPayload,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[Server] Error listing models:', error);
      this.wsServer?.sendError(ws, 'MODELS_LIST_ERROR', 'Failed to list models');
    }
  }

  private async handleConfigUpdate(ws: WebSocket, message: Message): Promise<void> {
    const payload = message.payload as ToolConfigPayload;
    
    try {
      // Update current adapter if tool changed
      if (payload.tool) {
        const adapter = await this.adapterRegistry.getAdapter(payload.tool);
        if (adapter) {
          this.currentAdapter = adapter;
          console.log(`[Server] Switched to ${adapter.name}`);
        }
      }

      // Store model preference (could persist to config file later)
      if (payload.model) {
        const config = this.configLoader.get();
        if (!config.opencode) {
          config.opencode = {};
        }
        config.opencode.model = payload.model;
      }

      this.wsServer?.send(ws, {
        id: crypto.randomUUID(),
        type: 'config:update:response',
        payload: { success: true },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[Server] Error updating config:', error);
      this.wsServer?.sendError(ws, 'CONFIG_UPDATE_ERROR', 'Failed to update config');
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

    // Setup adapters - register all available CLI tools
    console.log(pc.dim('Checking for available CLI tools...'));
    this.adapterRegistry.registerDefaultAdapters();

    // Detect available tools with priority ordering
    const available = await this.adapterRegistry.getAvailableWithPriority();

    if (available.length === 0) {
      console.error();
      console.error(pc.red('✗ No CLI tools found'));
      console.error();
      console.error('PixelCode requires at least one AI CLI tool to be installed.');
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
    this.currentAdapter = toolName 
      ? await this.adapterRegistry.getAdapter(toolName)
      : available[0];

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
        console.log(pc.dim(`Default Project: ${this.defaultProjectRoot}`));
        console.log();
      }
    );

    // Setup WebSocket
    this.setupWebSocket(server);
  }
}
