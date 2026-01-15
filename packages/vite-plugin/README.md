# @insy/vite

> Vite plugin for Insy - AI-powered visual code editing

[![npm version](https://img.shields.io/npm/v/@insy/vite.svg)](https://www.npmjs.com/package/@insy/vite)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Seamlessly integrate Insy into your Vite projects with automatic server startup and client injection.

## Installation

```bash
npm install @insy/vite --save-dev
# or
pnpm add -D @insy/vite
# or
yarn add -D @insy/vite
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { insy } from '@insy/vite';

export default defineConfig({
  plugins: [
    react(),
    insy()  // Add the Insy plugin
  ]
});
```

That's it! The plugin will:

1. Start the Insy server when Vite dev server starts
2. Inject the client script into your HTML
3. Configure the project root and server port automatically

## Options

```typescript
insy({
  port: 7777,      // Server port (default: 7777)
  host: 'localhost' // Server host (default: 'localhost')
})
```

## How It Works

1. **Dev Mode Only** - The plugin only activates during `vite serve`
2. **Server Auto-Start** - Starts (or registers with) the Insy server
3. **HTML Transform** - Injects configuration and client script into `index.html`
4. **Global Config** - Sets `__INSY_PROJECT_ROOT__` and `__INSY_SERVER_PORT__` globals

## Features

- Zero configuration for most projects
- Automatic server lifecycle management
- Hot Module Reload compatible
- Works with all Vite-compatible frameworks (React, Vue, Svelte, etc.)

## Requirements

- Vite >= 4.0.0
- Node.js >= 18.0.0
- OpenCode CLI (for AI features)

## Example

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { insy } from '@insy/vite';

export default defineConfig({
  plugins: [
    react(),
    insy({
      port: 8888  // Use custom port
    })
  ]
});
```

## Related Packages

- [@insy/client](https://www.npmjs.com/package/@insy/client) - Browser client
- [@insy/server](https://www.npmjs.com/package/@insy/server) - Local server
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin
- [@insy/shared](https://www.npmjs.com/package/@insy/shared) - Shared types

## License

MIT
