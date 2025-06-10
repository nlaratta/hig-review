#!/usr/bin/env node

/**
 * Script to create GitHub labels for the Apple HIG MCP project
 * Usage: node scripts/create-github-labels.js
 */

import { execSync } from 'child_process';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Define all labels with their colors
const labels = [
  // Priority labels
  { name: 'priority:high', color: 'B60205', description: 'High priority issue' },
  { name: 'priority:medium', color: 'FBCA04', description: 'Medium priority issue' },
  { name: 'priority:low', color: '0E8A16', description: 'Low priority issue' },
  
  // Type labels
  { name: 'enhancement', color: '84E3A4', description: 'New feature or request' },
  { name: 'bug', color: 'D73A4A', description: 'Something isn\'t working' },
  { name: 'documentation', color: '0075CA', description: 'Improvements or additions to documentation' },
  { name: 'feature', color: '2196F3', description: 'New feature implementation' },
  
  // Area labels
  { name: 'testing', color: 'F9D71C', description: 'Testing improvements' },
  { name: 'performance', color: 'FF9800', description: 'Performance improvements' },
  { name: 'security', color: 'EE0000', description: 'Security improvements' },
  { name: 'infrastructure', color: '000000', description: 'Infrastructure and tooling' },
  { name: 'deployment', color: '0052CC', description: 'Deployment and distribution' },
  { name: 'monitoring', color: '006B75', description: 'Monitoring and observability' },
  
  // Feature area labels
  { name: 'search', color: '1D76DB', description: 'Search functionality' },
  { name: 'ux', color: '7057FF', description: 'User experience improvements' },
  { name: 'i18n', color: 'E99695', description: 'Internationalization' },
  { name: 'analytics', color: 'C2E0C6', description: 'Analytics and telemetry' },
  { name: 'content', color: 'FEF2C0', description: 'Content-related improvements' },
  { name: 'reliability', color: '795548', description: 'Reliability improvements' },
  
  // Other labels
  { name: 'good-first-issue', color: '7057FF', description: 'Good for newcomers' },
  { name: 'ambitious', color: 'F44336', description: 'Ambitious or complex feature' },
];

// Get repository information
let repoInfo;
try {
  const repoJson = execSync('gh repo view --json owner,name', { encoding: 'utf8' });
  repoInfo = JSON.parse(repoJson);
} catch (error) {
  console.error(`${colors.red}Error getting repository info.${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.blue}Creating labels for ${repoInfo.owner.login}/${repoInfo.name}${colors.reset}\n`);

// Create each label
let successCount = 0;
let skipCount = 0;
let errorCount = 0;

for (const label of labels) {
  try {
    // Check if label already exists
    try {
      execSync(`gh label view "${label.name}"`, { encoding: 'utf8', stdio: 'pipe' });
      console.log(`${colors.yellow}⚠ Label already exists: ${label.name}${colors.reset}`);
      skipCount++;
      continue;
    } catch {
      // Label doesn't exist, proceed to create it
    }
    
    // Create the label
    const command = `gh label create "${label.name}" --color "${label.color}" --description "${label.description}"`;
    execSync(command, { encoding: 'utf8' });
    console.log(`${colors.green}✓ Created label: ${label.name}${colors.reset}`);
    successCount++;
  } catch (error) {
    console.error(`${colors.red}✗ Error creating label ${label.name}:${colors.reset}`, error.message);
    errorCount++;
  }
}

// Summary
console.log(`\n${colors.blue}Summary:${colors.reset}`);
console.log(`${colors.green}✓ Created: ${successCount} labels${colors.reset}`);
console.log(`${colors.yellow}⚠ Skipped: ${skipCount} labels (already exist)${colors.reset}`);
if (errorCount > 0) {
  console.log(`${colors.red}✗ Errors: ${errorCount} labels${colors.reset}`);
}

console.log(`\n${colors.green}Labels have been created!${colors.reset}`);
console.log(`View them at: https://github.com/${repoInfo.owner.login}/${repoInfo.name}/labels`);
console.log(`\nYou can now run the issue creation script again:`);
console.log(`${colors.blue}npm run create-issues${colors.reset}`);