# CLI Adapters

Insy supports multiple AI CLI tools through an adapter system. This allows you to use your preferred AI assistant while maintaining the same Insy workflow.

## Supported CLI Tools

Insy automatically detects and uses available CLI tools in this priority order:

1. **OpenCode** - https://opencode.ai
2. **Claude Code** - https://code.claude.com
3. **Gemini CLI** - `npm install -g @google/gemini-cli`
4. **GitHub Copilot CLI** - `npm install -g @github/copilot`

## Installation

### OpenCode

```bash
# macOS/Linux
brew install opencode

# Or download from
# https://opencode.ai
```

### Claude Code

```bash
# Follow installation instructions at:
# https://code.claude.com
```

### Gemini CLI

```bash
npm install -g @google/gemini-cli

# Authenticate (choose one method):
# 1. Login with Google (free tier: 60 req/min)
gemini

# 2. Or use API key
export GEMINI_API_KEY="your-api-key"

# 3. Or use Vertex AI
export GOOGLE_API_KEY="your-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
export GOOGLE_CLOUD_PROJECT="your-project"
```

### GitHub Copilot CLI

```bash
npm install -g @github/copilot

# Authenticate
export GH_TOKEN="your-github-token"
# Or use OAuth login flow when prompted
```

## Configuration

### Auto-detection (Recommended)

Insy will automatically detect and use the highest priority CLI tool available:

```json
{
  "server": {
    "port": 7777,
    "host": "localhost"
  }
}
```

### Manual Selection

Specify which CLI tool to use in your configuration file (`.insy.json` or `insy.config.json`):

```json
{
  "tool": "claude code",
  "server": {
    "port": 7777
  }
}
```

Valid tool names: `"opencode"`, `"claude code"`, `"gemini cli"`, `"github copilot cli"`

### Adapter-Specific Configuration

#### OpenCode

```json
{
  "tool": "opencode",
  "opencode": {
    "session": "my-session-id",
    "model": "gpt-4",
    "continueSession": true
  }
}
```

#### Claude Code

```json
{
  "tool": "claude code",
  "claudeCode": {
    "model": "claude-sonnet-4-5-20250929",
    "outputFormat": "json",
    "maxTurns": 5,
    "permissionMode": "auto",
    "systemPrompt": "You are a helpful coding assistant",
    "appendSystemPrompt": "Always use TypeScript"
  }
}
```

#### Gemini CLI

```json
{
  "tool": "gemini cli",
  "gemini": {
    "model": "gemini-2.5-pro",
    "includeDirectories": ["../lib", "../docs"],
    "apiKey": "your-api-key"
  }
}
```

#### GitHub Copilot CLI

```json
{
  "tool": "github copilot cli",
  "copilot": {
    "githubToken": "ghp_xxxxx",
    "banner": false
  }
}
```

## Testing Adapters

Run the test suite to check which CLI tools are available:

```bash
cd packages/server
npx tsx src/adapters/test-all-adapters.ts
```

This will:

- Check if each CLI tool is installed
- Display version information
- Show which adapter will be used by default

## Adapter Features Comparison

| Feature                  | OpenCode | Claude Code | Gemini CLI | Copilot CLI |
| ------------------------ | -------- | ----------- | ---------- | ----------- |
| **Non-interactive mode** | ✅ Yes   | ✅ Yes      | ✅ Yes     | ⚠️ Limited  |
| **JSON output**          | ✅ Yes   | ✅ Yes      | ✅ Yes     | ❓ Unknown  |
| **Session management**   | ✅ Yes   | ✅ Yes      | ✅ Yes     | ✅ Yes      |
| **Model selection**      | ✅ Yes   | ✅ Yes      | ✅ Yes     | ✅ Yes      |
| **Custom prompts**       | ✅ Yes   | ✅ Yes      | ❓ Partial | ❓ Unknown  |
| **Streaming**            | ✅ Yes   | ✅ Yes      | ✅ Yes     | ❓ Unknown  |
| **Auto approval**        | ✅ Yes   | ✅ Yes      | ✅ Yes     | ❌ No       |

## Troubleshooting

### No CLI tools found

If Insy reports that no CLI tools are available:

1. Verify installation: `which opencode` (or `which claude`, `which gemini`, `which copilot`)
2. Check PATH: Make sure the CLI binary is in your PATH
3. Try reinstalling the CLI tool
4. On Windows, use `where` instead of `which`

### Authentication errors

**OpenCode:**

- Follow the OAuth flow in your browser
- Or set `OPENCODE_API_KEY` environment variable

**Claude Code:**

- Make sure you're logged in: `claude --login`
- Check your Claude subscription status

**Gemini CLI:**

- Set `GEMINI_API_KEY` for API key auth
- Or login with: `gemini` (choose "Login with Google")
- For Vertex AI: Set `GOOGLE_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI=true`, and `GOOGLE_CLOUD_PROJECT`

**Copilot CLI:**

- Set `GH_TOKEN` or `GITHUB_TOKEN` with Copilot access
- Or authenticate via `/login` command in the CLI

### Timeout errors

If operations timeout (default: 10 minutes for Claude/Gemini/Copilot, 5 minutes for OpenCode):

1. Check your network connection
2. Verify the CLI tool is responding: try running it directly
3. Consider using a simpler prompt for testing
4. Check rate limits for your API tier

### Interactive mode issues (Copilot CLI)

GitHub Copilot CLI is primarily designed for interactive use:

- Requires user approval prompts for file changes
- May not fully support programmatic/automated workflows
- Best used for terminal-based development

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
    // Execute your CLI tool
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
  session?: string; // Session ID for context
  model?: string; // AI model to use
  format?: string; // Output format
  file?: string[]; // Files to attach
  cwd?: string; // Working directory
  continueSession?: boolean;
}
```

### Adapter-specific configs

See individual adapter files for detailed configuration options:

- `opencode.ts` - OpenCodeConfig (uses @opencode-ai/sdk)

## License

MIT - See LICENSE file for details
