import { readFile } from 'fs/promises';
import path from 'path';

export interface Config {
  version?: string;
  tool?: string; // 'opencode', 'claude', etc.
  project?: {
    path?: string;  // Absolute path to the project root
    name?: string;  // Display name for the project
  };
  server?: {
    port?: number;
    host?: string;
  };
  opencode?: {
    session?: string;
    model?: string;
    continueSession?: boolean;
  };
  ui?: {
    keybind?: string;
    theme?: string;
  };
  search?: {
    include?: string[];
    exclude?: string[];
  };
}

export class ConfigLoader {
  private config: Config | null = null;

  constructor(private projectRoot: string) {}

  async load(): Promise<Config> {
    if (this.config) return this.config;

    // Try to load from .pixelcode.json
    const configPath = path.join(this.projectRoot, '.pixelcode.json');
    try {
      const content = await readFile(configPath, 'utf-8');
      this.config = JSON.parse(content);
      console.log('[Config] Loaded from .pixelcode.json');
    } catch {
      // Config file doesn't exist, use defaults
      this.config = this.getDefaults();
      console.log('[Config] Using defaults (no .pixelcode.json found)');
    }

    // Override with environment variables
    this.applyEnvironmentOverrides();

    return this.config!;
  }

  private getDefaults(): Config {
    return {
      version: '1.0',
      tool: 'opencode',
      server: {
        port: 7777,
        host: 'localhost',
      },
      opencode: {
        session: 'PixelCode',
        continueSession: true,
      },
      ui: {
        keybind: 'cmd+shift+e',
        theme: 'dark',
      },
      search: {
        include: ['src/**/*', 'app/**/*', 'pages/**/*', 'components/**/*'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      },
    };
  }

  private applyEnvironmentOverrides(): void {
    if (!this.config) return;

    // Tool selection
    if (process.env.PIXELCODE_TOOL) {
      this.config.tool = process.env.PIXELCODE_TOOL;
    }

    // OpenCode session
    if (process.env.PIXELCODE_OPENCODE_SESSION) {
      this.config.opencode = this.config.opencode || {};
      this.config.opencode.session = process.env.PIXELCODE_OPENCODE_SESSION;
    }

    // Server port
    if (process.env.PIXELCODE_PORT) {
      this.config.server = this.config.server || {};
      this.config.server.port = parseInt(process.env.PIXELCODE_PORT, 10);
    }
  }

  get(): Config {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }
}
