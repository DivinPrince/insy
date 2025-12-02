import { exec } from 'child_process';
import { promisify } from 'util';
import type { CLIToolAdapter, RunOptions } from './interface.js';

const execAsync = promisify(exec);

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

  async run(prompt: string, options?: RunOptions): Promise<string> {
    const args: string[] = ['run'];

    // Session management
    const session = options?.session || this.config.session;
    if (session) {
      args.push('--session', JSON.stringify(session));
      
      const continueSession = options?.continueSession ?? this.config.continueSession ?? true;
      if (continueSession) {
        args.push('--continue');
      }
    }

    // Model selection
    const model = options?.model || this.config.model;
    if (model) {
      args.push('--model', JSON.stringify(model));
    }

    // Use JSON format for programmatic access (avoids interactive prompts and gives structured output)
    args.push('--format', 'json');

    // File attachments
    if (options?.file && options.file.length > 0) {
      options.file.forEach((f) => {
        args.push('--file', JSON.stringify(f));
      });
    }

    // Add the prompt (properly escaped for Windows using JSON.stringify)
    args.push(JSON.stringify(prompt));

    // Build and execute command
    const command = `opencode ${args.join(' ')}`;
    
    console.log('[OpenCode] Executing command on Windows...');
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options?.cwd,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
        timeout: 120000, // 2 minute timeout
        shell: 'cmd.exe', // Explicitly use cmd.exe on Windows
      });

      // Log any stderr output (warnings, etc.)
      if (stderr) {
        console.warn('[OpenCode] stderr:', stderr);
      }

      console.log('[OpenCode] Command completed, parsing output...');

      // Parse JSON events and extract the final response
      return this.parseJsonOutput(stdout);
    } catch (error: any) {
      // Improve error messages
      if (error.code === 'ENOENT') {
        throw new Error('OpenCode CLI not found. Please install it from https://opencode.ai');
      }
      
      if (error.killed || error.signal === 'SIGTERM') {
        throw new Error('OpenCode CLI timed out after 2 minutes');
      }
      
      console.error('[OpenCode] Command failed:', error.message);
      if (error.stderr) {
        console.error('[OpenCode] stderr:', error.stderr);
      }
      
      throw new Error(`OpenCode CLI error: ${error.message}\nStderr: ${error.stderr || 'none'}`);
    }
  }

  private parseJsonOutput(output: string): string {
    // OpenCode with --format json outputs newline-delimited JSON events
    // Example event structure:
    // {"type":"text","timestamp":...,"sessionID":"...","part":{"type":"text","text":"..."}}
    const lines = output.trim().split('\n').filter(l => l.trim());
    let fullResponse = '';

    console.log(`[OpenCode] Parsing ${lines.length} JSON event lines...`);

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        
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
