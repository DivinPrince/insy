#!/usr/bin/env node

import { PixelCodeServer } from './server.js';

// Export for programmatic use
export { PixelCodeServer } from './server.js';
export type * from '@pixelcode/shared';

async function main() {
  const server = new PixelCodeServer({
    projectRoot: process.cwd(),
  });

  await server.start();
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
