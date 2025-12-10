# @insy/server

> Local server for Insy - AI-powered visual code editing

[![npm version](https://img.shields.io/npm/v/@insy/server.svg)](https://www.npmjs.com/package/@insy/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The server component that handles AI integration, WebSocket communication, and coordinates between the browser client and CLI tools like OpenCode.

## Installation

```bash
npm install @insy/server
# or
pnpm add @insy/server
# or
yarn add @insy/server
```

## Usage

### Programmatic API

```typescript
import { startServer, InsyServer } from '@insy/server';

// Simple start
await startServer({
  port: 7777,
  host: 'localhost',
  projectRoot: process.cwd()
});

// Or with full control
const server = new InsyServer({
  port: 7777,
  host: 'localhost',
  projectRoot: '/path/to/project'
});
await server.start();
```

### Via CLI

```bash
npx @insy/server
# or
npx insy-server
```

## Features

- HTTP server with REST API endpoints
- WebSocket server for real-time communication
- CLI tool adapter system (OpenCode integration)
- Prompt building with element context
- Client script serving with injected configuration
- Project registration for multi-project support

## API Endpoints

- `GET /health` - Health check
- `GET /config` - Get project configuration
- `GET /client.js` - Serve client script with injected config
- `POST /register` - Register a project

## WebSocket Messages

### Client to Server

- `prompt/submit` - Submit a prompt with element context

### Server to Client

- `connected` - Connection established
- `status` - Status update during processing
- `done` - Processing complete
- `error` - Error occurred

## Requirements

- Node.js >= 18.0.0
- OpenCode CLI (for AI integration)

## Related Packages

- [@insy/client](https://www.npmjs.com/package/@insy/client) - Browser client
- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin
- [@insy/shared](https://www.npmjs.com/package/@insy/shared) - Shared types

## License

MIT
