#!/usr/bin/env node

import { spawn } from 'child_process';

const tests = [
  {
    name: 'searchHIG',
    method: 'tools/call',
    params: {
      name: 'searchHIG',
      arguments: { query: 'buttons', platform: 'ios' }
    }
  },
  {
    name: 'browseSection',
    method: 'tools/call', 
    params: {
      name: 'browseSection',
      arguments: { section: 'components/buttons', platform: 'ios' }
    }
  },
  {
    name: 'getServerInfo',
    method: 'tools/call',
    params: {
      name: 'getServerInfo',
      arguments: {}
    }
  }
];

async function runQuickTest() {
  console.log('🧪 Running Quick MCP Test...\n');
  
  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let messageId = 1;
  
  // Initialize
  const initMessage = {
    jsonrpc: "2.0",
    id: messageId++,
    method: "initialize",
    params: {
      protocolVersion: "0.1.0",
      capabilities: { tools: {} },
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  };

  server.stdin.write(JSON.stringify(initMessage) + '\n');
  console.log('📤 Sent initialize request');

  // Wait for init response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Send notification
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }) + '\n');

  // Run tests
  for (const test of tests) {
    console.log(`\n🔧 Testing ${test.name}...`);
    
    const message = {
      jsonrpc: "2.0",
      id: messageId++,
      method: test.method,
      params: test.params
    };

    server.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n✅ Tests completed, terminating server...');
  server.kill('SIGTERM');
  
  // Wait for clean exit
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('🏁 Done!');
}

// Handle server output
let responses = [];

function handleServerOutput(data) {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const message = JSON.parse(line);
      if (message.result || message.error) {
        responses.push(message);
        
        if (message.result) {
          console.log(`✅ Response received: ${message.result.content ? 'Content available' : 'OK'}`);
        } else if (message.error) {
          console.log(`❌ Error: ${message.error.message}`);
        }
      }
    } catch (e) {
      // Ignore non-JSON lines (logs, etc.)
    }
  }
}

// Set up server event handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

runQuickTest().catch(console.error);