# @insy/client

> Browser client for Insy - AI-powered visual code editing

[![npm version](https://img.shields.io/npm/v/@insy/client.svg)](https://www.npmjs.com/package/@insy/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The browser-side client that provides visual element selection, UI widgets, and WebSocket communication with the Insy server.

## Installation

```bash
npm install @insy/client
# or
pnpm add @insy/client
# or
yarn add @insy/client
```

## Usage

### Via CDN (Recommended)

```html
<script src="https://unpkg.com/@insy/client@latest/dist/client.js"></script>
```

### Via Framework Plugin

If you're using Vite or Next.js, use the respective plugins which handle client injection automatically:

- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin

## Features

- Visual element selection with hover highlighting
- Quick edit popup for natural language prompts
- Image attachment support for visual context
- WebSocket communication with Insy server
- Framework detection (React, Vue, HTML)
- Component context capture (props, state, fiber path)
- Source file hints extraction

## Configuration

The client reads configuration from global variables injected by the server or framework plugins:

```javascript
window.__INSY_PROJECT_ROOT__ = '/path/to/project';
window.__INSY_SERVER_PORT__ = 7777;
```

## Keyboard Shortcuts

- `Alt+Q` - Toggle element selection mode

## API

The client auto-initializes when loaded. For programmatic access:

```javascript
import InsyClient from '@insy/client';

const client = new InsyClient();
await client.init();
```

## Related Packages

- [@insy/server](https://www.npmjs.com/package/@insy/server) - Local server
- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin
- [@insy/shared](https://www.npmjs.com/package/@insy/shared) - Shared types

## License

MIT
