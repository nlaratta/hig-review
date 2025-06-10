#!/usr/bin/env node

/**
 * Alternative script to create GitHub issues using the GitHub API directly
 * Usage: GITHUB_TOKEN=your_token node scripts/create-github-issues-api.js [--dry-run]
 */

import { readFileSync } from 'fs';
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

// Check for GitHub token
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error(`${colors.red}Error: GITHUB_TOKEN environment variable is required${colors.reset}`);
  console.log('\nTo create a personal access token:');
  console.log('1. Go to https://github.com/settings/tokens');
  console.log('2. Generate new token (classic)');
  console.log('3. Select "repo" scope');
  console.log('4. Run: GITHUB_TOKEN=your_token_here node scripts/create-github-issues-api.js');
  process.exit(1);
}

// Repository information - update these for your repo
const REPO_OWNER = 'nlaratta';
const REPO_NAME = 'apple-hig-mcp';

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

console.log(`${colors.blue}Creating issues for ${REPO_OWNER}/${REPO_NAME}${colors.reset}`);
if (isDryRun) {
  console.log(`${colors.yellow}DRY RUN MODE - No issues will be created${colors.reset}\n`);
}

// Helper function to make GitHub API requests
async function githubApi(endpoint, method = 'GET', body = null) {
  const url = `https://api.github.com${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'apple-hig-mcp-issue-creator'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} - ${data.message || JSON.stringify(data)}`);
  }
  
  return data;
}

// Main function to create issues
async function createIssues() {
  try {
    // First, get existing milestones
    console.log(`${colors.blue}Fetching existing milestones...${colors.reset}`);
    const existingMilestones = await githubApi(`/repos/${REPO_OWNER}/${REPO_NAME}/milestones`);
    const milestoneMap = {};
    existingMilestones.forEach(m => {
      milestoneMap[m.title] = m.number;
    });
    
    // Create missing milestones
    const neededMilestones = [...new Set(issuesData.issues.map(issue => issue.milestone).filter(Boolean))];
    
    for (const milestone of neededMilestones) {
      if (!milestoneMap[milestone]) {
        if (!isDryRun) {
          console.log(`Creating milestone: ${milestone}`);
          const newMilestone = await githubApi(
            `/repos/${REPO_OWNER}/${REPO_NAME}/milestones`,
            'POST',
            { title: milestone, state: 'open' }
          );
          milestoneMap[milestone] = newMilestone.number;
          console.log(`${colors.green}✓ Created milestone: ${milestone}${colors.reset}`);
        } else {
          console.log(`${colors.yellow}Would create milestone: ${milestone}${colors.reset}`);
        }
      } else {
        console.log(`${colors.green}✓ Milestone exists: ${milestone}${colors.reset}`);
      }
    }
    
    // Create labels if they don't exist
    console.log(`\n${colors.blue}Checking labels...${colors.reset}`);
    const allLabels = [...new Set(issuesData.issues.flatMap(issue => issue.labels || []))];
    const existingLabels = await githubApi(`/repos/${REPO_OWNER}/${REPO_NAME}/labels`);
    const existingLabelNames = existingLabels.map(l => l.name);
    
    // Define label colors
    const labelColors = {
      'enhancement': '84E3A4',
      'bug': 'D73A4A',
      'documentation': '0075CA',
      'testing': 'F9D71C',
      'priority:high': 'B60205',
      'priority:medium': 'FBCA04',
      'priority:low': '0E8A16',
      'performance': 'FF9800',
      'security': 'EE0000',
      'ux': '7057FF',
      'feature': '2196F3',
      'good-first-issue': '7057FF',
      'infrastructure': '000000',
      'deployment': '0052CC',
      'monitoring': '006B75',
      'search': '1D76DB',
      'i18n': 'E99695',
      'analytics': 'C2E0C6',
      'content': 'FEF2C0',
      'ambitious': 'F44336',
      'reliability': '795548'
    };
    
    for (const label of allLabels) {
      if (!existingLabelNames.includes(label)) {
        if (!isDryRun) {
          const color = labelColors[label] || 'EDEDED';
          await githubApi(
            `/repos/${REPO_OWNER}/${REPO_NAME}/labels`,
            'POST',
            { name: label, color: color }
          );
          console.log(`${colors.green}✓ Created label: ${label}${colors.reset}`);
        } else {
          console.log(`${colors.yellow}Would create label: ${label}${colors.reset}`);
        }
      }
    }
    
    // Create issues
    console.log(`\n${colors.blue}Creating issues...${colors.reset}`);
    let successCount = 0;
    let errorCount = 0;
    
    for (const [index, issue] of issuesData.issues.entries()) {
      const issueNumber = index + 1;
      console.log(`\n[${issueNumber}/${issuesData.issues.length}] ${issue.title}`);
      
      try {
        if (!isDryRun) {
          const issueData = {
            title: issue.title,
            body: issue.body, // GitHub API handles newlines properly
            labels: issue.labels || []
          };
          
          if (issue.milestone && milestoneMap[issue.milestone]) {
            issueData.milestone = milestoneMap[issue.milestone];
          }
          
          const createdIssue = await githubApi(
            `/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
            'POST',
            issueData
          );
          
          console.log(`${colors.green}✓ Created: #${createdIssue.number} - ${createdIssue.html_url}${colors.reset}`);
          successCount++;
          
          // Rate limiting delay
          if (index < issuesData.issues.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.log(`${colors.yellow}Would create issue with ${issue.labels?.length || 0} labels${colors.reset}`);
          successCount++;
        }
      } catch (error) {
        console.error(`${colors.red}✗ Error creating issue:${colors.reset}`, error.message);
        errorCount++;
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
      console.log(`https://github.com/${REPO_OWNER}/${REPO_NAME}/issues`);
    }
    
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run the script
createIssues();