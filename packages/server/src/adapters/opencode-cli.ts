import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import type { CLIToolAdapter, RunOptions, ModelInfo } from './interface.js';

const execAsync = promisify(exec);

/**
 * Custom error class for OpenCode CLI errors
 */
export class OpenCodeError extends Error {
  constructor(
    message: string,
    public readonly errorName: string,
    public readonly providerID?: string
  ) {
    super(message);
    this.name = 'OpenCodeError';
  }
}

export interface OpenCodeConfig {
  session?: string;
  model?: string;
  continueSession?: boolean;
}

export class OpenCodeCLIAdapter implements CLIToolAdapter {
  name = 'OpenCode';

  constructor(private config: OpenCodeConfig = {}) {}

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which opencode');
      return true;
    } catch {
      try {
        // Try Windows where command
        await execAsync('where opencode');
        return true;
      } catch {
        return false;
      }
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('opencode --version');
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const { stdout } = await execAsync('opencode models');
      return this.parseModelsOutput(stdout);
    } catch (error) {
      console.warn('[OpenCode] Failed to fetch models:', error);
      // Return a basic fallback list
      return [{ id: 'default', name: 'Default Model' }];
    }
  }

  private parseModelsOutput(output: string): ModelInfo[] {
    // Parse the output from `opencode models`
    // Expected format might be:
    // - Provider: Model Name (model-id)
    // - anthropic: Claude Sonnet (claude-sonnet-4.5)
    // We'll do our best to parse it

    const models: ModelInfo[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Available') || trimmed.startsWith('Provider')) {
        continue;
      }

      // Try to match pattern: "- provider: Name (id)"
      const match = trimmed.match(/^-?\s*(\w+):\s*(.+?)\s*\((.+?)\)$/);
      if (match) {
        const [, provider, name, id] = match;
        models.push({ id: id.trim(), name: name.trim(), provider: provider.trim() });
      } else {
        // Simple format: just model names/ids
        const parts = trimmed.replace(/^-\s*/, '').split(/\s+/);
        if (parts.length > 0) {
          const id = parts[parts.length - 1]; // Last part is likely the ID
          const name = parts.slice(0, -1).join(' ') || id;
          models.push({ id, name });
        }
      }
    }

    // If we couldn't parse anything, return fallback
    if (models.length === 0) {
      return [{ id: 'default', name: 'Default Model' }];
    }

    return models;
  }

  async run(prompt: string, options?: RunOptions): Promise<string> {
    const args: string[] = ['run'];

    // Session management
    const session = options?.session || this.config.session;
    if (session) {
      args.push('--session', session);

      const continueSession = options?.continueSession ?? this.config.continueSession ?? true;
      if (continueSession) {
        args.push('--continue');
      }
    }

    // Model selection
    const model = options?.model || this.config.model;
    if (model) {
      args.push('--model', model);
    }

    // Use JSON format for programmatic access
    args.push('--format', 'json');

    console.log('[OpenCode] Executing: opencode', args.join(' '), '(prompt via stdin)');

    const output = await this.spawnOpenCode(args, prompt, options?.cwd);

    console.log('[OpenCode] Command completed, parsing output...');
    return this.parseJsonOutput(output);
  }

  private spawnOpenCode(args: string[], prompt: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('opencode', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Use shell on Windows to find the command in PATH
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      // Set a timeout (5 minutes for complex AI operations)
      const timeout = setTimeout(
        () => {
          proc.kill('SIGTERM');
          reject(new Error('OpenCode CLI timed out after 5 minutes'));
        },
        5 * 60 * 1000
      );

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Log progress for long-running operations
        if (chunk.includes('"type":"text"')) {
          console.log('[OpenCode] Receiving response...');
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (stderr) {
          console.warn('[OpenCode] stderr:', stderr);
        }

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(`OpenCode exited with code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`)
          );
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        if ((err as any).code === 'ENOENT') {
          reject(new Error('OpenCode CLI not found. Please install it from https://opencode.ai'));
        } else {
          reject(err);
        }
      });

      // Write the prompt to stdin and close it
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  private parseJsonOutput(output: string): string {
    // OpenCode with --format json outputs newline-delimited JSON events
    const lines = output
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    let fullResponse = '';
    const errors: Array<{ name: string; message: string; providerID?: string }> = [];

    console.log(`[OpenCode] Parsing ${lines.length} JSON event lines...`);

    for (const line of lines) {
      try {
        const event = JSON.parse(line);

        // Check for error events first
        if (event.type === 'error') {
          const errorData = event.error || {};
          const errorName = errorData.name || 'UnknownError';
          const errorMessage =
            errorData.data?.message || errorData.message || 'An unknown error occurred';
          const providerID = errorData.data?.providerID || errorData.providerID;

          console.error(`[OpenCode] Error event received: ${errorName} - ${errorMessage}`);
          errors.push({ name: errorName, message: errorMessage, providerID });
          continue;
        }

        // Look for text events with part.text field (current format)
        if (event.type === 'text' && event.part && event.part.text) {
          fullResponse += event.part.text;
        }
        // Legacy: Look for content events from the assistant
        else if (event.type === 'content' && event.role === 'assistant') {
          if (event.content && event.content.text) {
            fullResponse += event.content.text;
          } else if (typeof event.content === 'string') {
            fullResponse += event.content;
          }
        }
        // Legacy: Also handle direct text/message events
        else if (event.type === 'message') {
          if (event.text) {
            fullResponse += event.text;
          } else if (event.content) {
            fullResponse += event.content;
          }
        }
      } catch (parseError) {
        // Skip lines that aren't valid JSON
        console.warn('[OpenCode] Failed to parse line:', line.substring(0, 100));
      }
    }

    // If we collected any errors, throw the first one (most relevant)
    if (errors.length > 0) {
      const primaryError = errors[0];
      throw new OpenCodeError(primaryError.message, primaryError.name, primaryError.providerID);
    }

    if (!fullResponse) {
      // Fallback: return the raw output if we couldn't parse
      console.warn('[OpenCode] Could not parse JSON events, returning raw output');
      console.warn('[OpenCode] Raw output:', output.substring(0, 500));
      return output;
    }

    console.log(`[OpenCode] Extracted ${fullResponse.length} characters from response`);
    return fullResponse;
  }
}
