#!/usr/bin/env node

import { Command } from 'commander';
import { InsyServer } from '@insy/server';
import pc from 'picocolors';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(__dirname, '../../package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

const program = new Command();

program
  .name('insy')
  .description('AI-powered visual code editing for any frontend framework')
  .version(await getVersion());

program
  .command('start', { isDefault: true })
  .description('Start the Insy server')
  .option('-p, --port <port>', 'Port to listen on', '7777')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('--project <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    try {
      const server = new InsyServer({
        port: parseInt(options.port, 10),
        host: options.host,
        projectRoot: options.project,
      });

      await server.start();
    } catch (error) {
      console.error();
      console.error(pc.red('✗ Failed to start server:'));
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      console.error();
      process.exit(1);
    }
  });

program.parse();
