#!/usr/bin/env node

import { InsyServer } from './server.js';

// Export for programmatic use
export { InsyServer } from './server.js';
export type * from '@insy/shared';

async function main() {
  const server = new InsyServer({
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
