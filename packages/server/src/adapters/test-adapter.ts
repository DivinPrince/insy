import { OpenCodeAdapter } from './opencode.js';

async function test() {
  const adapter = new OpenCodeAdapter();

  console.log('=== Testing OpenCode SDK Adapter ===\n');

  // Test 1: Check availability
  console.log('1. Checking if OpenCode is available...');
  const available = await adapter.isAvailable();
  console.log(`   Available: ${available}\n`);

  if (!available) {
    console.error('OpenCode not available. Please ensure OpenCode is installed.');
    process.exit(1);
  }

  // Test 2: Get version
  console.log('2. Getting version...');
  const version = await adapter.getVersion();
  console.log(`   Version: ${version}\n`);

  // Test 3: Simple prompt
  console.log('3. Testing simple prompt...');
  try {
    const result = await adapter.run('Say "Hello World" and nothing else.');
    console.log(`   Result: ${result}\n`);
  } catch (error) {
    console.error('   Error:', error);
  }

  // Test 4: Multi-line prompt (simulating real usage)
  console.log('4. Testing multi-line prompt with code...');
  const complexPrompt = `# Edit Request

Here is some code:
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>
\`\`\`

Please change the h1 text to "Goodbye World" and return the full modified code.`;

  try {
    console.log('   Sending prompt...');
    const result = await adapter.run(complexPrompt);
    console.log(`   Result length: ${result.length} characters`);
    console.log(`   Result preview: ${result.substring(0, 200)}...`);
  } catch (error) {
    console.error('   Error:', error);
  }

  console.log('\n=== Tests Complete ===');
}

test().catch(console.error);
