# @insy/next

> Next.js plugin for Insy - AI-powered visual code editing

[![npm version](https://img.shields.io/npm/v/@insy/next.svg)](https://www.npmjs.com/package/@insy/next)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Seamlessly integrate Insy into your Next.js projects. The client is loaded from unpkg CDN for optimal performance.

## Installation

```bash
npm install @insy/next --save-dev
# or
pnpm add -D @insy/next
# or
yarn add -D @insy/next
```

## Usage

### 1. Configure Next.js

```javascript
// next.config.js
const { withInsy } = require('@insy/next');

module.exports = withInsy()({
  // your existing Next.js config
});
```

### 2. Add the Script Component

```tsx
// app/layout.tsx (App Router)
import { InsyScript } from '@insy/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
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

Or for Pages Router:

```tsx
// pages/_app.tsx
import { InsyScript } from '@insy/next';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <InsyScript />
    </>
  );
}
```

## Options

```javascript
withInsy({
  port: 7777,       // Server port (default: 7777)
  host: 'localhost' // Server host (default: 'localhost')
})
```

## How It Works

1. **Dev Mode Only** - Components only render in development
2. **Server Auto-Start** - Registers with the Insy server on startup
3. **CDN Client** - Loads `@insy/client` from unpkg CDN
4. **Webpack Define** - Injects `__INSY_PROJECT_ROOT__` and `__INSY_SERVER_PORT__`

## Features

- Works with both App Router and Pages Router
- Client loaded from CDN (no bundling overhead)
- Automatic server lifecycle management
- TypeScript support out of the box

## Requirements

- Next.js >= 13.0.0
- React >= 18.0.0
- Node.js >= 18.0.0
- OpenCode CLI (for AI features)

## Example

```javascript
// next.config.js
const { withInsy } = require('@insy/next');

module.exports = withInsy({
  port: 8888  // Custom port
})({
  reactStrictMode: true,
  // ... other Next.js config
});
```

## Related Packages

- [@insy/client](https://www.npmjs.com/package/@insy/client) - Browser client
- [@insy/server](https://www.npmjs.com/package/@insy/server) - Local server
- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/shared](https://www.npmjs.com/package/@insy/shared) - Shared types

## License

MIT
