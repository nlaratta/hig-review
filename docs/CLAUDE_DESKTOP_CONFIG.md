# Claude Desktop Configuration Guide for Apple HIG MCP

This guide will help you set up and configure the Apple Human Interface Guidelines MCP server with Claude Desktop.

## Prerequisites

- Claude Desktop installed on your system
- Node.js (v18 or higher) installed
- npm or yarn package manager

## Installation Instructions

### Step 1: Clone and Install the MCP Server

```bash
# Clone the repository (or download it)
git clone <your-repo-url> apple-hig-mcp
cd apple-hig-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Step 2: Locate Claude Desktop Configuration File

The Claude Desktop configuration file location varies by operating system:

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Step 3: Edit Configuration File

1. Open the configuration file in your preferred text editor
2. If the file doesn't exist, create it with the following structure:

```json
{
  "mcpServers": {}
}
```

### Step 4: Add Apple HIG MCP Configuration

Add the Apple HIG MCP server to your configuration:

```json
{
  "mcpServers": {
    "apple-hig": {
      "command": "node",
      "args": ["/path/to/apple-hig-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

**Important:** Replace `/path/to/apple-hig-mcp` with the actual path to your MCP installation.

### Example Full Configuration

Here's a complete example with multiple MCP servers:

```json
{
  "mcpServers": {
    "apple-hig": {
      "command": "node",
      "args": ["/Users/username/projects/apple-hig-mcp/dist/index.js"],
      "env": {}
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"]
    }
  }
}
```

## Verifying the Connection

### Step 1: Restart Claude Desktop

After saving the configuration file, completely quit and restart Claude Desktop.

### Step 2: Check MCP Connection

1. Open Claude Desktop
2. Look for the MCP icon (puzzle piece) in the text input area
3. Click on it to see connected servers
4. You should see "apple-hig" listed

### Step 3: Test the MCP

Try these commands in Claude:
- "Search for button guidelines in Apple HIG"
- "Show me the iOS color system"
- "Get SwiftUI code example for a navigation view"

## Troubleshooting

### MCP Not Showing Up

1. **Check file paths:** Ensure all paths in the config are absolute and correct
2. **Check JSON syntax:** Validate your JSON configuration (no trailing commas, proper quotes)
3. **Check permissions:** Ensure the MCP script has execute permissions
4. **Check Node.js:** Verify Node.js is in your PATH

### Connection Errors

1. **View logs:** Check Claude Desktop logs for error messages
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%LOCALAPPDATA%\Claude\logs\`
   - Linux: `~/.local/share/Claude/logs/`

2. **Test manually:** Run the MCP server directly:
   ```bash
   node /path/to/apple-hig-mcp/dist/index.js
   ```

3. **Check build:** Ensure the project is built:
   ```bash
   cd /path/to/apple-hig-mcp
   npm run build
   ```

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| "Command not found" | Use full path to node executable |
| "Module not found" | Run `npm install` and `npm run build` |
| "Permission denied" | Check file permissions or run with appropriate privileges |
| Server crashes immediately | Check Node.js version compatibility |
| No MCP icon in Claude | Restart Claude Desktop completely |

## Development Mode

For development, you can run the TypeScript files directly:

```json
{
  "mcpServers": {
    "apple-hig-dev": {
      "command": "npx",
      "args": ["tsx", "/path/to/apple-hig-mcp/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Advanced Configuration

### Environment Variables

You can pass environment variables to your MCP:

```json
{
  "mcpServers": {
    "apple-hig": {
      "command": "node",
      "args": ["/path/to/apple-hig-mcp/dist/index.js"],
      "env": {
        "LOG_LEVEL": "debug",
        "CACHE_DIR": "/tmp/apple-hig-cache"
      }
    }
  }
}
```

### Multiple Instances

You can run multiple instances with different configurations:

```json
{
  "mcpServers": {
    "apple-hig-ios": {
      "command": "node",
      "args": ["/path/to/apple-hig-mcp/dist/index.js", "--platform", "ios"]
    },
    "apple-hig-macos": {
      "command": "node",
      "args": ["/path/to/apple-hig-mcp/dist/index.js", "--platform", "macos"]
    }
  }
}
```

## Updating the MCP

To update the Apple HIG MCP:

1. Pull the latest changes or download the new version
2. Run `npm install` to update dependencies
3. Run `npm run build` to rebuild
4. Restart Claude Desktop

## Getting Help

If you continue to experience issues:

1. Check the project's GitHub issues
2. Review the MCP server logs
3. Ensure all dependencies are properly installed
4. Try running the test suite: `npm run test:mcp`