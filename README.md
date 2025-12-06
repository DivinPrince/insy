# Insy

> AI-powered visual code editing for any frontend framework

[![npm version](https://img.shields.io/npm/v/insy.svg)](https://www.npmjs.com/package/insy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Insy bridges the gap between live browser environments and AI coding agents. Select any UI element, describe your change, and watch AI modify your source code in real-time.

## Features

- 🎯 **Visual Element Selection** - Click any element on your page
- 🤖 **AI-Powered Editing** - Natural language code modifications
- 🔧 **Framework Agnostic** - Works with React, Vue, HTML, and more
- 📝 **Smart Diff Preview** - Review changes before applying
- 💾 **Safe Backups** - Automatic backup before every change
- ⚡ **Hot Module Reload** - Instant preview of changes
- 🔍 **Intelligent Source Finding** - Automatically locates component files

## Quick Start

### Installation

```bash
# Global installation
npm install -g insy

# Or use npx (no install required)
npx insy
```

### Usage

1. **Start the server** in your project directory:

```bash
npx insy
```

2. **Add the script** to your app (shown in terminal output):

```html
<script src="http://localhost:7777/client.js"></script>
```

3. **Use Insy**:
   - Press `⌘+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Click any element on your page
   - Describe your change in natural language
   - Review the diff and apply

## Configuration

Create a `.insy.json` in your project root:

```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "apiKey": "${OPENAI_API_KEY}"
  },
  "editor": {
    "mode": "preview",
    "autoApply": false
  }
}
```

## Supported Frameworks

- ✅ React (with hooks, context, etc.)
- ✅ Next.js (App Router & Pages Router)
- ✅ Vue.js (2 & 3)
- ✅ Vanilla HTML/CSS/JS
- 🚧 Svelte (coming soon)
- 🚧 Angular (coming soon)

## Examples

```bash
# Try the examples
cd examples/react-vite
npm install
npm run dev

# In another terminal
npx insy
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Configuration](./docs/configuration.md)
- [API Reference](./docs/api.md)
- [Examples](./docs/examples.md)

## How It Works

1. **Element Selection** - Uses a React Grab-inspired overlay to capture element context
2. **Framework Detection** - Automatically detects React, Vue, or HTML
3. **Source Location** - Finds the source file using AST analysis and heuristics
4. **AI Processing** - Sends element context + user prompt to AI (OpenAI, Anthropic, or OpenCode)
5. **Code Modification** - Uses AST-based editing for precise, safe changes
6. **Diff Preview** - Shows a unified diff for review
7. **Safe Application** - Creates backup, applies changes, triggers HMR

## Architecture

```
┌─────────────────────────────────────┐
│   Browser (Your App)                │
│   ├─ Element Selector               │
│   ├─ Context Capture                │
│   └─ WebSocket Client                │
└────────────┬────────────────────────┘
             │ WebSocket
             ▼
┌─────────────────────────────────────┐
│   Local Server (localhost:7777)     │
│   ├─ AI Integration                 │
│   ├─ Source File Finder             │
│   ├─ AST Parser & Modifier          │
│   └─ File System Writer             │
└─────────────────────────────────────┘
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT © Insy Team

## Acknowledgments

- Inspired by [React Grab](https://github.com/aidenybai/react-grab)
- Built with [OpenCode SDK](https://opencode.ai/)
- Powered by OpenAI, Anthropic, and other AI providers
