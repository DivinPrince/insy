// Use inline types to avoid Vite version mismatch issues in monorepos
// This ensures the plugin works regardless of the Vite version in the consumer project
interface VitePlugin {
  name: string;
  apply?: 'serve' | 'build' | ((config: any, env: any) => boolean);
  config?: (config: any, env: any) => any;
  configureServer?: (server: any) => void;
  transformIndexHtml?: (html: string) => { html: string; tags: HtmlTagDescriptor[] } | string;
}

interface HtmlTagDescriptor {
  tag: string;
  attrs?: Record<string, string | boolean>;
  children?: string;
  injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend';
}

export interface InsyPluginOptions {
  /**
   * Port for the Insy server
   * @default 7777
   */
  port?: number;

  /**
   * Host for the Insy server
   * @default 'localhost'
   */
  host?: string;
}

/**
 * Vite plugin for Insy - AI-powered visual editing
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import react from '@vitejs/plugin-react'
 * import { insy } from '@insy/vite'
 *
 * export default defineConfig({
 *   plugins: [react(), insy()]
 * })
 * ```
 *
 * Then add the client script to your index.html:
 * ```html
 * <script src="http://localhost:7777/client.js"></script>
 * ```
 */
export function insy(options: InsyPluginOptions = {}): VitePlugin {
  const port = options.port ?? 7777;
  const host = options.host ?? 'localhost';
  let projectRoot: string;

  return {
    name: 'insy',

    // Only run in dev mode
    apply: 'serve',

    // Inject project root and server port into client bundle
    config(config: any, env: any) {
      if (env.command !== 'serve') return;

      projectRoot = config.root || process.cwd();

      return {
        define: {
          __INSY_PROJECT_ROOT__: JSON.stringify(projectRoot),
          __INSY_SERVER_PORT__: port,
        },
      };
    },

    // Start/register with Insy server when Vite dev server starts
    configureServer(server: any) {
      projectRoot = server.config.root;

      // Start server asynchronously (don't block Vite startup)
      registerWithServer(projectRoot, host, port).catch((err) => {
        console.error('[insy] Failed to start server:', err);
      });
    },

    // Inject project root and server config into the HTML
    // This ensures the client.js script has access to the correct project context
    transformIndexHtml(html: string) {
      const configScript = `
<script>
  // Insy project configuration (injected by @insy/vite plugin)
  window.__INSY_PROJECT_ROOT__ = ${JSON.stringify(projectRoot)};
  window.__INSY_SERVER_PORT__ = ${port};
</script>`;

      // Inject at the start of <head> so it's available before client.js loads
      return html.replace('<head>', '<head>' + configScript);
    },
  };
}

/**
 * Register this project with the Insy server
 * If server is not running, starts it
 */
async function registerWithServer(projectRoot: string, host: string, port: number): Promise<void> {
  const serverUrl = `http://${host}:${port}`;

  try {
    // Check if server is already running
    const response = await fetch(`${serverUrl}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    const data = (await response.json()) as { status?: string };

    if (data.status === 'ok') {
      // Server running, register this project
      await fetch(`${serverUrl}/register`, {
        method: 'POST',
        body: JSON.stringify({ projectRoot }),
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`[insy] Registered project with server at ${serverUrl}`);
      return;
    }
  } catch {
    // Server not running, start it
  }

  // Dynamically import server to avoid bundling issues
  const { startServer } = await import('@insy/server');
  await startServer({ port, host, projectRoot });
}

// Default export for convenience
export default insy;
