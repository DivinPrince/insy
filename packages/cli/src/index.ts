#!/usr/bin/env node

import { Command } from 'commander';
import { PixelCodeServer } from '@pixelcode/server';
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
  .name('pixelcode')
  .description('AI-powered visual code editing for any frontend framework')
  .version(await getVersion());

program
  .command('start', { isDefault: true })
  .description('Start the PixelCode server')
  .option('-p, --port <port>', 'Port to listen on', '7777')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('--project <path>', 'Project root directory', process.cwd())
  .action(async (options) => {
    try {
      const server = new PixelCodeServer({
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

program
  .command('init')
  .description('Initialize PixelCode in your project')
  .action(async () => {
    console.log();
    console.log(pc.bold(pc.cyan('🎨 Initialize PixelCode')));
    console.log();
    
    const config = {
      version: '1.0',
      tool: 'opencode',
      server: {
        port: 7777,
        host: 'localhost',
      },
      opencode: {
        session: 'PixelCode',
        continueSession: true,
      },
      ui: {
        keybind: 'cmd+shift+p',
        theme: 'dark',
      },
      search: {
        include: ['src/**/*', 'app/**/*', 'pages/**/*', 'components/**/*'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      },
    };

    const { writeFile } = await import('fs/promises');
    await writeFile('.pixelcode.json', JSON.stringify(config, null, 2));

    console.log(pc.green('✓ Created .pixelcode.json'));
    console.log();
    console.log('Next steps:');
    console.log(pc.cyan('  1. Run: npx pixelcode'));
    console.log(pc.cyan('  2. Add the script tag to your app (shown in output)'));
    console.log(pc.cyan('  3. Press ⌘+Shift+E in your browser to activate'));
    console.log();
  });

program.parse();
