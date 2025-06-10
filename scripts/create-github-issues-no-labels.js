#!/usr/bin/env node

/**
 * Script to create GitHub issues without labels (for when labels don't exist yet)
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Read the issues JSON file
const issuesPath = join(dirname(__dirname), 'github-issues.json');
let issuesData;

try {
  const fileContent = readFileSync(issuesPath, 'utf8');
  issuesData = JSON.parse(fileContent);
} catch (error) {
  console.error(`${colors.red}Error reading github-issues.json:${colors.reset}`, error.message);
  process.exit(1);
}

// Get repository information
let repoInfo;
try {
  const repoJson = execSync('gh repo view --json owner,name', { encoding: 'utf8' });
  repoInfo = JSON.parse(repoJson);
} catch (error) {
  console.error(`${colors.red}Error getting repository info.${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.blue}Creating issues for ${repoInfo.owner.login}/${repoInfo.name} (without labels)${colors.reset}`);
console.log(`${colors.yellow}Note: Labels will need to be added manually after creation${colors.reset}\n`);

// Create each issue
let successCount = 0;
let errorCount = 0;

async function createIssues() {
  for (const [index, issue] of issuesData.issues.entries()) {
    const issueNumber = index + 1;
    console.log(`\n[${issueNumber}/${issuesData.issues.length}] ${issue.title}`);
    
    try {
      // Build the gh issue create command WITHOUT labels
      let command = `gh issue create --title "${issue.title.replace(/"/g, '\\"')}" --body "${issue.body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      
      // Add milestone if present
      if (issue.milestone) {
        command += ` --milestone "${issue.milestone}"`;
      }
      
      const output = execSync(command, { encoding: 'utf8' });
      console.log(`${colors.green}✓ Created: ${output.trim()}${colors.reset}`);
      
      // Show what labels should be added
      if (issue.labels && issue.labels.length > 0) {
        console.log(`${colors.yellow}  Labels to add: ${issue.labels.join(', ')}${colors.reset}`);
      }
      
      successCount++;
      
      // Add a small delay to avoid rate limiting
      if (index < issuesData.issues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`${colors.red}✗ Error creating issue:${colors.reset}`, error.message);
      errorCount++;
    }
  }
}

// Run the creation process
createIssues().then(() => {
  // Summary
  console.log(`\n${colors.blue}Summary:${colors.reset}`);
  console.log(`${colors.green}✓ Successfully created: ${successCount} issues${colors.reset}`);
  if (errorCount > 0) {
    console.log(`${colors.red}✗ Errors: ${errorCount} issues${colors.reset}`);
  }
  
  console.log(`\n${colors.green}Issues have been created! View them at:${colors.reset}`);
  console.log(`https://github.com/${repoInfo.owner.login}/${repoInfo.name}/issues`);
  
  console.log(`\n${colors.yellow}Next steps:${colors.reset}`);
  console.log('1. Go to Settings > Labels to create the missing labels');
  console.log('2. Use the GitHub web UI to add labels to issues');
  console.log('3. Or use: gh label create <label-name> --color <hex-color>');
});