import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pc from 'picocolors';
import type {
  PromptSubmitPayload,
  StatusUpdatePayload,
  WebSocketMessage,
} from '@insy/shared';

import { InsyWSServer } from './ws/server.js';
import { AdapterRegistry } from './adapters/registry.js';
import { OpenCodeError } from './adapters/opencode.js';
import type { CLIToolAdapter } from './adapters/interface.js';
import { buildContextOnlyPrompt } from './prompts/builder.js';

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
  private defaultProjectRoot: string;
  private adapterRegistry: AdapterRegistry;
  private currentAdapter?: CLIToolAdapter;

  constructor(private options: ServerOptions = {}) {
    this.app = new Hono();
    this.defaultProjectRoot = options.projectRoot || process.cwd();
    this.wsServer = new InsyWSServer();
    this.adapterRegistry = new AdapterRegistry();

    this.setupRoutes();
    this.setupWebSocketHandlers();
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
    this.app.get('/config', (c) => {
      const projectRoot = this.options.projectRoot || process.cwd();
      return c.json({
        version: '1.0',
        tool: 'opencode',
        project: {
          path: projectRoot,
          name: path.basename(projectRoot),
        },
        server: {
          port: this.options.port || 7777,
          host: this.options.host || 'localhost',
        },
      });
    });

    // Serve client script with injected config
    this.app.get('/client.js', async (c) => {
      try {
        // Try to resolve @insy/client package (works in both monorepo and published)
        let clientPath: string;
        try {
          // Modern Node.js (16.17+) - resolve the package
          const clientPackagePath = await import.meta.resolve('@insy/client');
          const clientPackageDir = path.dirname(fileURLToPath(clientPackagePath));
          clientPath = path.join(clientPackageDir, 'dist/client.js');
        } catch {
          // Fallback to relative path (for development/monorepo)
          clientPath = path.join(__dirname, '../../client/dist/client.js');
        }

        const content = await readFile(clientPath, 'utf-8');

        // Inject config into the client script
        const projectRoot = this.options.projectRoot || process.cwd();
        const host = this.options.host || 'localhost';
        const port = this.options.port || 7777;

        const injectedConfig = `
;(function() {
  window.__INSY_CONFIG__ = {
    projectPath: ${JSON.stringify(projectRoot)},
    host: ${JSON.stringify(host)},
    port: ${port},
    projectName: ${JSON.stringify(path.basename(projectRoot))}
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

      // Use sessionId from payload (unique per chat) or fallback to default
      const sessionId = payload.sessionId || 'insy-default';
      console.log(`[Server] Using session: ${sessionId}`);
      if (payload.attachments?.length) {
        console.log(`[Server] Including ${payload.attachments.length} image attachment(s)`);
      }

      await this.currentAdapter.run(prompt, {
        session: sessionId,
        continueSession: true,
        cwd: projectPath,
        attachments: payload.attachments,
      })

      this.sendStatus(clientId, payload.instanceId, 'success', 'Done', 100);
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
    // Setup adapters - register all available CLI tools
    console.log(pc.dim('Checking for available CLI tools...'));
    this.adapterRegistry.registerDefaultAdapters();

    // Detect available tools with priority ordering
    const available = await this.adapterRegistry.getAvailableWithPriority();

    if (available.length === 0) {
      console.error();
      console.error(pc.red('✗ No CLI tools found'));
      console.error();
      console.error('Insy requires OpenCode to be installed.');
      console.error();
      console.error('Supported CLI tools (in order of priority):');
      console.error(pc.cyan('  1. OpenCode:        https://opencode.ai'));
      console.error();
      process.exit(1);
    }

    // Use first available adapter (by priority)
    this.currentAdapter = available[0];

    if (this.currentAdapter && this.currentAdapter.getVersion) {
      const version = await this.currentAdapter.getVersion();
      console.log(pc.green(`✓ Found ${this.currentAdapter.name} v${version}`));
    } else if (this.currentAdapter) {
      console.log(pc.green(`✓ Found ${this.currentAdapter.name}`));
    }

    const port = this.options.port || 7777;
    const host = this.options.host || 'localhost';

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
        console.log();
        console.log();
        console.log(pc.dim(`Using: ${this.currentAdapter?.name}`));
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
        console.error();
        process.exit(1);
        return;
      }
      // Re-throw other errors
      throw err;
    });
  }
}
