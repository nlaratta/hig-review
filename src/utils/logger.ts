/**
 * Logger utility for MCP server
 * MCP servers should use console.error for logging
 */

import { Logger } from '../types/index.js';

export class MCPLogger implements Logger {
  private prefix: string;
  private debugMode: boolean;

  constructor(prefix: string = 'apple-hig-mcp', debugMode: boolean = false) {
    this.prefix = prefix;
    this.debugMode = debugMode;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level}] ${message}`;
  }

  private formatData(data: any): string {
    if (!data) return '';
    try {
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  info(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('INFO', message);
    console.error(formattedMessage);
    if (data) {
      console.error(this.formatData(data));
    }
  }

  error(message: string, error?: any): void {
    const formattedMessage = this.formatMessage('ERROR', message);
    console.error(formattedMessage);
    if (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
        if (error.stack && this.debugMode) {
          console.error(`Stack: ${error.stack}`);
        }
      } else {
        console.error(this.formatData(error));
      }
    }
  }

  debug(message: string, data?: any): void {
    if (!this.debugMode) return;
    const formattedMessage = this.formatMessage('DEBUG', message);
    console.error(formattedMessage);
    if (data) {
      console.error(this.formatData(data));
    }
  }

  warn(message: string, data?: any): void {
    const formattedMessage = this.formatMessage('WARN', message);
    console.error(formattedMessage);
    if (data) {
      console.error(this.formatData(data));
    }
  }
}

// Create a singleton logger instance
export const logger = new MCPLogger('apple-hig-mcp', process.env.DEBUG === 'true');