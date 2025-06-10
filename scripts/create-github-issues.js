#!/usr/bin/env node

/**
 * Script to create GitHub issues from github-issues.json
 * Usage: node scripts/create-github-issues.js [--dry-run]
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

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

// Check if this is a dry run
const isDryRun = process.argv.includes('--dry-run');

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
  console.error(`${colors.red}Error getting repository info. Make sure you're in a git repository.${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.blue}Creating issues for ${repoInfo.owner.login}/${repoInfo.name}${colors.reset}`);
if (isDryRun) {
  console.log(`${colors.yellow}DRY RUN MODE - No issues will be created${colors.reset}\n`);
}

// Create milestones first (if they don't exist)
const milestones = [...new Set(issuesData.issues.map(issue => issue.milestone).filter(Boolean))];

console.log(`${colors.blue}Checking milestones...${colors.reset}`);
for (const milestone of milestones) {
  try {
    // Check if milestone exists
    const checkCmd = `gh api repos/${repoInfo.owner.login}/${repoInfo.name}/milestones --jq '.[] | select(.title=="${milestone}") | .title'`;
    const exists = execSync(checkCmd, { encoding: 'utf8' }).trim();
    
    if (!exists) {
      if (!isDryRun) {
        // Create milestone
        const createCmd = `gh api repos/${repoInfo.owner.login}/${repoInfo.name}/milestones -f title="${milestone}" -f state="open"`;
        execSync(createCmd);
        console.log(`${colors.green}✓ Created milestone: ${milestone}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}Would create milestone: ${milestone}${colors.reset}`);
      }
    } else {
      console.log(`${colors.green}✓ Milestone exists: ${milestone}${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.yellow}Note: Could not create milestone ${milestone} (may already exist)${colors.reset}`);
  }
}

console.log(`\n${colors.blue}Creating issues...${colors.reset}`);

// Create each issue
let successCount = 0;
let errorCount = 0;

for (const [index, issue] of issuesData.issues.entries()) {
  const issueNumber = index + 1;
  console.log(`\n[${issueNumber}/${issuesData.issues.length}] ${issue.title}`);
  
  try {
    // Write body to a temporary file to handle newlines properly
    const bodyFile = join(tmpdir(), `gh-issue-body-${Date.now()}-${index}.md`);
    writeFileSync(bodyFile, issue.body);
    
    // Build the gh issue create command using --body-file
    let command = `gh issue create --title "${issue.title.replace(/"/g, '\\"')}" --body-file "${bodyFile}"`;
    
    // Add labels if present
    if (issue.labels && issue.labels.length > 0) {
      command += ` --label "${issue.labels.join(',')}"`;
    }
    
    // Add milestone if present
    if (issue.milestone) {
      command += ` --milestone "${issue.milestone}"`;
    }
    
    if (isDryRun) {
      console.log(`${colors.yellow}Would execute: ${command.substring(0, 100)}...${colors.reset}`);
      successCount++;
      // Clean up temp file
      unlinkSync(bodyFile);
    } else {
      const output = execSync(command, { encoding: 'utf8' });
      console.log(`${colors.green}✓ Created: ${output.trim()}${colors.reset}`);
      successCount++;
      
      // Clean up temp file
      unlinkSync(bodyFile);
      
      // Add a small delay to avoid rate limiting
      if (index < issuesData.issues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error(`${colors.red}✗ Error creating issue:${colors.reset}`, error.message);
    errorCount++;
    // Try to clean up temp file if it exists
    try {
      const bodyFile = join(tmpdir(), `gh-issue-body-${Date.now()}-${index}.md`);
      unlinkSync(bodyFile);
    } catch {}
  }
}

// Summary
console.log(`\n${colors.blue}Summary:${colors.reset}`);
console.log(`${colors.green}✓ Successfully ${isDryRun ? 'would create' : 'created'}: ${successCount} issues${colors.reset}`);
if (errorCount > 0) {
  console.log(`${colors.red}✗ Errors: ${errorCount} issues${colors.reset}`);
}

if (isDryRun) {
  console.log(`\n${colors.yellow}This was a dry run. Run without --dry-run to actually create the issues.${colors.reset}`);
} else {
  console.log(`\n${colors.green}All issues have been created! View them at:${colors.reset}`);
  console.log(`https://github.com/${repoInfo.owner.login}/${repoInfo.name}/issues`);
}

// Add alternative method using curl if gh CLI has issues
if (errorCount > 0) {
  console.log(`\n${colors.yellow}Note: If you're having authentication issues with 'gh', you can also use the GitHub API directly.${colors.reset}`);
  console.log('Create a personal access token at https://github.com/settings/tokens');
  console.log('Then run: npm run create-issues:api');
}