# @insy/shared

> Shared types and utilities for Insy

[![npm version](https://img.shields.io/npm/v/@insy/shared.svg)](https://www.npmjs.com/package/@insy/shared)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Common TypeScript types and utilities shared across all Insy packages.

## Installation

```bash
npm install @insy/shared
# or
pnpm add @insy/shared
# or
yarn add @insy/shared
```

## Usage

```typescript
import type {
  ElementInfo,
  Framework,
  FrameworkContext,
  WebSocketMessage,
  InsyConfig,
  // ... other types
} from '@insy/shared';
```

## Types

### Framework Detection

- `FrameworkType` - Supported frameworks: `'react' | 'vue' | 'svelte' | 'nextjs' | 'html'`
- `Framework` - Framework info with type, version, and devtools status

### Element Context

- `ElementInfo` - Complete element information (tag, class, id, bbox, screenshot, HTML, CSS, selectors)
- `BoundingBox` - Element position and dimensions
- `ReactContext` - React-specific context (component name, props, state, hooks, fiber path, source)
- `VueContext` - Vue-specific context (component name, props, data, computed)
- `HtmlContext` - HTML-specific context (attributes, data attributes)
- `FrameworkContext` - Union of framework contexts
- `SourceHints` - Source file location hints

### WebSocket Messages

- `WebSocketMessage` - Base message format
- `PromptSubmitPayload` - Prompt submission with full element context
- `StatusUpdatePayload` - Processing status updates
- `ErrorPayload` - Error information
- `ConversationMessage` - Chat history message

### Configuration

- `InsyConfig` - Full configuration schema
- `AIConfig` - AI provider settings
- `ServerConfig` - Server host/port settings
- `EditorConfig` - Editor mode settings
- `UIConfig` - UI preferences

### File Attachments

- `FileAttachment` - Image attachment for prompts

## Utilities

```typescript
import { createMessage } from '@insy/shared';

const msg = createMessage('status', { stage: 'analyzing', message: 'Processing...' });
```

## Related Packages

- [@insy/client](https://www.npmjs.com/package/@insy/client) - Browser client
- [@insy/server](https://www.npmjs.com/package/@insy/server) - Local server
- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin

## License

MIT
