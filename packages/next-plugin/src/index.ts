// Next.js types - using inline types to avoid strict dependency issues
interface NextConfig {
  webpack?: (config: any, context: any) => any;
  [key: string]: any;
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

// Store config for the script component
let _insyConfig: { projectRoot: string; port: number; host: string } | null = null;

/**
 * Get the Insy configuration (used by InsyScript component)
 */
export function getInsyConfig() {
  return _insyConfig;
}

/**
 * Next.js plugin for Insy - AI-powered visual editing
 *
 * The client is loaded from unpkg CDN (https://unpkg.com/@insy/client).
 *
 * @example
 * ```js
 * // next.config.js
 * const { withInsy } = require('@insy/next')
 *
 * module.exports = withInsy()({
 *   // your next config
 * })
 * ```
 *
 * Then add the InsyScript component to your layout:
 * ```tsx
 * // app/layout.tsx
 * import { InsyScript } from '@insy/next'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <InsyScript />
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function withInsy(options: InsyPluginOptions = {}) {
  const port = options.port ?? 7777;
  const host = options.host ?? 'localhost';
  const projectRoot = process.cwd();

  // Store config for InsyScript component
  _insyConfig = { projectRoot, port, host };

  // Start/register with server when config is loaded (dev only)
  if (process.env.NODE_ENV === 'development') {
    registerWithServer(projectRoot, host, port).catch((err) => {
      console.error('[insy] Failed to start server:', err);
    });
  }

  return (nextConfig: NextConfig = {}): NextConfig => {
    return {
      ...nextConfig,

      webpack(config, context) {
        // Only inject for client bundle in development
        if (!context.isServer && context.dev) {
          const { webpack } = context;

          config.plugins.push(
            new webpack.DefinePlugin({
              __INSY_PROJECT_ROOT__: JSON.stringify(projectRoot),
              __INSY_SERVER_PORT__: port,
            })
          );
        }

        // Call original webpack config if provided
        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, context);
        }

        return config;
      },
    };
  };
}

/**
 * React component that loads the Insy client from unpkg CDN with proper project configuration.
 * Only renders in development mode.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { InsyScript } from '@insy/next'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <InsyScript />
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function InsyScript(): any {
  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const config = _insyConfig || {
    projectRoot: process.cwd(),
    port: 7777,
    host: 'localhost',
  };

  const { projectRoot, port } = config;

  // Inject config before loading the client script from CDN
  const configScript = `
    window.__INSY_PROJECT_ROOT__ = ${JSON.stringify(projectRoot)};
    window.__INSY_SERVER_PORT__ = ${port};
  `;

  // Use dynamic require to avoid bundling React
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('script', {
      dangerouslySetInnerHTML: { __html: configScript },
    }),
    // Load client from unpkg CDN
    React.createElement('script', {
      src: 'https://unpkg.com/@insy/client@latest/dist/client.js',
    })
  );
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
export default withInsy;
