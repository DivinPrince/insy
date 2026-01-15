# insy

> CLI for Insy - AI-powered visual code editing

[![npm version](https://img.shields.io/npm/v/insy.svg)](https://www.npmjs.com/package/insy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The command-line interface for starting the Insy server.

## Installation

```bash
# Global installation
npm install -g insy

# Or use npx (no install required)
npx insy
```

## Usage

### Start Server

```bash
# Start with defaults
insy

# Or with options
insy start --port 8888 --host 0.0.0.0 --project /path/to/project
```

## Commands

### `insy start` (default)

Start the Insy server.

Options:
- `-p, --port <port>` - Port to listen on (default: 7777)
- `-h, --host <host>` - Host to bind to (default: localhost)
- `--project <path>` - Project root directory (default: current directory)

## Quick Start

1. **Start the server**:
   ```bash
   npx insy
   ```

2. **Add the script tag** to your HTML:
   ```html
   <script src="http://localhost:7777/client.js"></script>
   ```

   Or use the CDN:
   ```html
   <script src="https://unpkg.com/@insy/client@latest/dist/client.js"></script>
   ```

3. **Use Insy in your browser**:
   - Press `Alt+Q` to activate element selection
   - Click any element
   - Describe your change in natural language

## Requirements

- Node.js >= 18.0.0
- OpenCode CLI (for AI features)

## Related Packages

- [@insy/client](https://www.npmjs.com/package/@insy/client) - Browser client
- [@insy/server](https://www.npmjs.com/package/@insy/server) - Local server
- [@insy/vite](https://www.npmjs.com/package/@insy/vite) - Vite plugin
- [@insy/next](https://www.npmjs.com/package/@insy/next) - Next.js plugin

## License

MIT
