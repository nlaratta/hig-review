#!/usr/bin/env node

/**
 * Test script for Apple HIG MCP Server
 * This script simulates MCP protocol messages to verify the server works correctly
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m'
};

class MCPTester {
  constructor() {
    this.server = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const color = {
      info: colors.blue,
      success: colors.green,
      error: colors.red,
      warn: colors.yellow
    }[level] || colors.reset;
    
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
  }

  async startServer() {
    this.log('info', 'Starting Apple HIG MCP server...');
    
    try {
      // Try to use the built version first
      this.server = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });
    } catch (error) {
      this.log('warn', 'Built version not found, trying TypeScript directly...');
      this.server = spawn('npx', ['tsx', 'src/index.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });
    }

    this.setupReaders();
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.log('success', 'Server started');
  }

  setupReaders() {
    const stdoutReader = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    const stderrReader = createInterface({
      input: this.server.stderr,
      crlfDelay: Infinity
    });

    stdoutReader.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        this.handleServerMessage(message);
      } catch (error) {
        this.log('error', `Failed to parse server message: ${line}`);
      }
    });

    stderrReader.on('line', (line) => {
      this.log('warn', `Server stderr: ${line}`);
    });

    this.server.on('error', (error) => {
      this.log('error', `Server error: ${error.message}`);
    });

    this.server.on('exit', (code, signal) => {
      this.log('info', `Server exited with code ${code} and signal ${signal}`);
    });
  }

  sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    this.log('info', `Sending: ${jsonMessage}`);
    this.server.stdin.write(jsonMessage + '\n');
  }

  async sendRequest(method, params = {}) {
    const id = this.messageId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendMessage(message);
      
      // Timeout after 5 seconds (15 seconds for getGuideline as it needs to fetch web content)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, message.method === 'tools/call' && message.params?.name === 'getGuideline' ? 15000 : 5000);
    });
  }

  handleServerMessage(message) {
    this.log('info', `Received: ${JSON.stringify(message)}`);
    
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }

  async runTests() {
    this.log('info', 'Running MCP tests...\n');
    
    const tests = [
      this.testInitialize.bind(this),
      this.testListTools.bind(this),
      this.testSearchTool.bind(this),
      this.testGetGuidelineTool.bind(this),
      this.testBrowseSectionTool.bind(this),
      this.testServerInfoTool.bind(this)
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test();
        passed++;
      } catch (error) {
        failed++;
        this.log('error', `Test failed: ${error.message}`);
      }
    }

    this.log('info', `\nTest Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }

  async testInitialize() {
    this.log('info', 'Testing initialize...');
    
    const result = await this.sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });

    if (!result.capabilities || !result.capabilities.tools) {
      throw new Error('Invalid initialize response');
    }

    this.log('success', 'Initialize test passed');
    
    // Send initialized notification
    this.sendMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
  }

  async testListTools() {
    this.log('info', 'Testing tools/list...');
    
    const result = await this.sendRequest('tools/list');
    
    if (!Array.isArray(result.tools)) {
      throw new Error('tools/list did not return an array');
    }

    const expectedTools = ['searchHIG', 'getGuideline', 'browseSection', 'getServerInfo'];
    const toolNames = result.tools.map(t => t.name);
    
    for (const expected of expectedTools) {
      if (!toolNames.includes(expected)) {
        throw new Error(`Missing expected tool: ${expected}`);
      }
    }

    this.log('success', `Found ${result.tools.length} tools: ${toolNames.join(', ')}`);
  }

  async testSearchTool() {
    this.log('info', 'Testing searchHIG tool...');
    
    const result = await this.sendRequest('tools/call', {
      name: 'searchHIG',
      arguments: {
        query: 'button',
        platform: 'ios'
      }
    });

    if (!result.content || result.content.length === 0) {
      throw new Error('Search returned no results');
    }

    this.log('success', 'Search tool test passed');
  }

  async testGetGuidelineTool() {
    this.log('info', 'Testing getGuideline tool...');
    
    const result = await this.sendRequest('tools/call', {
      name: 'getGuideline',
      arguments: {
        guidelineId: 'components/buttons',
        includeExamples: true,
        includeCode: true
      }
    });

    if (!result.content || result.content.length === 0) {
      throw new Error('getGuideline returned no content');
    }

    this.log('success', 'Get guideline tool test passed');
  }

  async testBrowseSectionTool() {
    this.log('info', 'Testing browseSection tool...');
    
    const result = await this.sendRequest('tools/call', {
      name: 'browseSection',
      arguments: {
        section: 'components/buttons',
        platform: 'ios'
      }
    });

    if (!result.content || result.content.length === 0) {
      throw new Error('browseSection returned no content');
    }

    this.log('success', 'Browse section tool test passed');
  }

  async testServerInfoTool() {
    this.log('info', 'Testing getServerInfo tool...');
    
    const result = await this.sendRequest('tools/call', {
      name: 'getServerInfo',
      arguments: {}
    });

    if (!result.content || result.content.length === 0) {
      throw new Error('getServerInfo returned no content');
    }

    this.log('success', 'Server info tool test passed');
  }

  async cleanup() {
    this.log('info', 'Cleaning up...');
    
    if (this.server) {
      this.server.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async run() {
    try {
      await this.startServer();
      const success = await this.runTests();
      await this.cleanup();
      
      if (success) {
        this.log('success', '\nAll tests passed! The MCP server is working correctly.');
        process.exit(0);
      } else {
        this.log('error', '\nSome tests failed. Please check the logs above.');
        process.exit(1);
      }
    } catch (error) {
      this.log('error', `Fatal error: ${error.message}`);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run the tests
const tester = new MCPTester();
tester.run().catch(console.error);