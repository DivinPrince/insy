# Insy

> AI-powered visual code editing for any frontend framework

[![npm version](https://img.shields.io/npm/v/insy.svg)](https://www.npmjs.com/package/insy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Insy bridges the gap between live browser environments and AI coding agents. Select any UI element, describe your change, and watch AI modify your source code in real-time.

## Features

- **Visual Element Selection** - Click any element on your page
- **AI-Powered Editing** - Natural language code modifications via OpenCode
- **Framework Agnostic** - Works with React, Vue, Next.js, and vanilla HTML
- **Smart Context Capture** - Automatically captures component context, props, and source hints
- **Image Attachments** - Attach screenshots for visual context
- **Hot Module Reload** - Instant preview of changes

## Quick Start

### Option 1: Using Vite Plugin (Recommended for Vite projects)

```bash
npm install @insy/vite --save-dev
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { insy } from '@insy/vite';

export default defineConfig({
  plugins: [react(), insy()]
});
```

### Option 2: Using Next.js Plugin

```bash
npm install @insy/next --save-dev
```

```javascript
// next.config.js
const { withInsy } = require('@insy/next');

module.exports = withInsy()({
  // your next config
});
```

```tsx
// app/layout.tsx
import { InsyScript } from '@insy/next';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <InsyScript />
      </body>
    </html>
  );
}
```

### Option 3: Manual Setup (Any Framework)

```bash
# Start the server
npx insy
```

Add the client script to your HTML:

```html
<script src="https://unpkg.com/@insy/client@latest/dist/client.js"></script>
```

Or from the local server:

```html
<script src="http://localhost:7777/client.js"></script>
```

## Usage

1. **Activate Selection** - Press `Alt+Q` or click the Insy button
2. **Select Element** - Click any element on the page
3. **Describe Change** - Type your modification in natural language
4. **AI Applies Changes** - OpenCode modifies your source code

## Packages

| Package | Description |
|---------|-------------|
| [`insy`](./packages/cli) | CLI to start the Insy server |
| [`@insy/client`](./packages/client) | Browser client for element selection and UI |
| [`@insy/server`](./packages/server) | Local server with AI integration |
| [`@insy/vite`](./packages/vite-plugin) | Vite plugin for seamless integration |
| [`@insy/next`](./packages/next-plugin) | Next.js plugin with CDN client loading |
| [`@insy/shared`](./packages/shared) | Shared TypeScript types |

## Requirements

- **Node.js** >= 18.0.0
- **OpenCode CLI** - Install from [opencode.ai](https://opencode.ai)

## How It Works

```
┌─────────────────────────────────────┐
│   Browser (Your App)                │
│   ├─ Element Selector               │
│   ├─ Context Capture                │
│   └─ WebSocket Client               │
└────────────┬────────────────────────┘
             │ WebSocket
             ▼
┌─────────────────────────────────────┐
│   Insy Server (localhost:7777)      │
│   ├─ Prompt Builder                 │
│   ├─ OpenCode Integration           │
│   └─ Project Registration           │
└─────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│   OpenCode CLI                      │
│   └─ AI Code Modification           │
└─────────────────────────────────────┘
```

1. **Element Selection** - Uses visual overlay to capture element context
2. **Framework Detection** - Automatically detects React, Vue, or HTML
3. **Context Capture** - Extracts component info, props, state, fiber path
4. **Prompt Building** - Constructs detailed prompt with element context
5. **AI Processing** - OpenCode processes the prompt and modifies files
6. **Hot Reload** - Changes appear instantly via HMR

## Supported Frameworks

- React (with hooks, context, fiber info)
- Next.js (App Router & Pages Router)
- Vue.js (2 & 3)
- Vanilla HTML/CSS/JS
- Any Vite-compatible framework

## Development

```bash
# Clone the repo
git clone https://github.com/DivinPrince/insy.git
cd insy

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Project Structure

```
insy/
├── packages/
│   ├── cli/          # CLI package (insy command)
│   ├── client/       # Browser client
│   ├── server/       # Local server
│   ├── vite-plugin/  # Vite integration
│   ├── next-plugin/  # Next.js integration
│   └── shared/       # Shared types
├── examples/
│   └── vite-example/ # Example Vite + React app
└── turbo.json        # Turborepo config
```

## Contributing

We welcome contributions! Please see the individual package READMEs for development instructions.

## License

MIT - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- [OpenCode](https://opencode.ai/) - AI coding agent
- [bippy](https://github.com/aidenybai/bippy) - React fiber inspection
