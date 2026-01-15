# CLI Adapters

Insy supports multiple AI CLI tools through an adapter system. This allows you to use your preferred AI assistant while maintaining the same Insy workflow.

## Supported CLI Tools

Insy automatically detects and uses available CLI tools in this priority order:

1. **OpenCode** - https://opencode.ai

## Installation

### OpenCode

```bash
# macOS/Linux
brew install opencode

# Or download from
# https://opencode.ai
```

## Auto-detection

Insy will automatically detect and use the highest priority CLI tool available. No configuration needed.

## Testing Adapters

Check which CLI tools are available:

```bash
# OpenCode
which opencode
opencode --version
```

## Troubleshooting

### No CLI tools found

If Insy reports that no CLI tools are available:

1. Verify installation: `which opencode`
2. Check PATH: Make sure the CLI binary is in your PATH
3. Try reinstalling the CLI tool
4. On Windows, use `where` instead of `which`

### Authentication errors

**OpenCode:**

- Follow the OAuth flow in your browser
- Or set `OPENCODE_API_KEY` environment variable

### Timeout errors

If operations timeout:

1. Check your network connection
2. Verify the CLI tool is responding: try running it directly
3. Consider using a simpler prompt for testing
4. Check rate limits for your API tier

## Creating Custom Adapters

See the adapter interface in `src/adapters/interface.ts`:

```typescript
export interface CLIToolAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  run(prompt: string, options?: RunOptions): Promise<string>;
  getVersion?(): Promise<string>;
}
```

Example custom adapter:

```typescript
export class MyCustomCLIAdapter implements CLIToolAdapter {
  name = 'My Custom CLI';

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which mycli');
      return true;
    } catch {
      return false;
    }
  }

  async run(prompt: string, options?: RunOptions): Promise<string> {
    const output = await this.spawnCLI(['--prompt', prompt]);
    return this.parseOutput(output);
  }

  async getVersion(): Promise<string> {
    const { stdout } = await execAsync('mycli --version');
    return stdout.trim();
  }
}
```

Then register it:

```typescript
import { AdapterRegistry } from './adapters/registry.js';
import { MyCustomCLIAdapter } from './adapters/my-custom-cli.js';

const registry = new AdapterRegistry();
registry.register(new MyCustomCLIAdapter());
```

## API Reference

### RunOptions

```typescript
interface RunOptions {
  session?: string;
  model?: string;
  format?: string;
  file?: string[];
  cwd?: string;
  continueSession?: boolean;
}
```

## License

MIT - See LICENSE file for details
