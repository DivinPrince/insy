import { OpenCodeCLIAdapter } from './opencode-cli.js';
import { AdapterRegistry } from './registry.js';

async function testAdapter(adapter: any, name: string) {
  console.log(`\n=== Testing ${name} ===\n`);

  // Test 1: Check availability
  console.log('1. Checking if CLI is available...');
  const available = await adapter.isAvailable();
  console.log(`   Available: ${available ? '✓ Yes' : '✗ No'}\n`);

  if (!available) {
    console.log(`   ${name} CLI not found. Skipping tests.\n`);
    return { available: false, tested: false };
  }

  // Test 2: Get version
  if (adapter.getVersion) {
    console.log('2. Getting version...');
    try {
      const version = await adapter.getVersion();
      console.log(`   Version: ${version}\n`);
    } catch (error) {
      console.error('   Error getting version:', error);
    }
  }

  // Test 3: Simple prompt (only if you want to test actual execution)
  // Uncomment to test actual CLI execution
  /*
  console.log('3. Testing simple prompt...');
  try {
    const result = await adapter.run('Say "Hello from CLI test" and nothing else.');
    console.log(`   Result: ${result.substring(0, 100)}...\n`);
  } catch (error) {
    console.error('   Error:', error);
  }
  */

  return { available: true, tested: true };
}

async function testRegistry() {
  console.log('\n=== Testing Adapter Registry ===\n');

  const registry = new AdapterRegistry();
  
  console.log('1. Registering default adapters...');
  registry.registerDefaultAdapters();
  console.log(`   Registered: ${registry.getAll().length} adapters\n`);

  console.log('2. Detecting available adapters...');
  const available = await registry.getAvailableWithPriority();
  console.log(`   Found: ${available.length} available adapters`);
  available.forEach((adapter, index) => {
    console.log(`   ${index + 1}. ${adapter.name}`);
  });
  console.log();

  console.log('3. Getting first available adapter...');
  const first = await registry.getFirst();
  if (first) {
    console.log(`   Selected: ${first.name}\n`);
  } else {
    console.log(`   No adapters available\n`);
  }

  return { totalAdapters: registry.getAll().length, availableAdapters: available.length };
}

async function main() {
  console.log('🧪 Insy CLI Adapter Test Suite\n');
  console.log('This will check which CLI tools are available on your system.');
  console.log('No actual AI calls will be made (unless you uncomment test code).\n');

  const results = {
    opencode: await testAdapter(new OpenCodeCLIAdapter(), 'OpenCode'),
  };

  const registryResults = await testRegistry();

  // Summary
  console.log('\n=== Test Summary ===\n');
  console.log('Available CLI Tools:');
  Object.entries(results).forEach(([name, result]) => {
    const status = result.available ? '✓' : '✗';
    console.log(`  ${status} ${name.charAt(0).toUpperCase() + name.slice(1)}`);
  });
  console.log();
  console.log(`Total Adapters: ${registryResults.totalAdapters}`);
  console.log(`Available Adapters: ${registryResults.availableAdapters}`);
  console.log();

  if (registryResults.availableAdapters === 0) {
    console.log('⚠️  No CLI tools found. Please install OpenCode:');
    console.log('   • OpenCode: https://opencode.ai');
    console.log();
  } else {
    console.log('✓ All tests completed successfully!');
    console.log();
  }
}

main().catch(console.error);
