#!/bin/bash

# Script to create GitHub issues using gh CLI
# Usage: ./scripts/create-github-issues.sh [--dry-run]

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Check for dry-run flag
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No issues will be created${NC}\n"
fi

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ -z "$REPO" ]; then
    echo -e "${RED}Error: Could not determine repository${NC}"
    exit 1
fi

echo -e "${BLUE}Creating issues for $REPO${NC}\n"

# Simple issues to create (subset of the full list for shell script)
create_issue() {
    local title="$1"
    local body="$2"
    local labels="$3"
    
    echo -e "Creating issue: $title"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}Would create issue with labels: $labels${NC}"
    else
        if gh issue create --title "$title" --body "$body" --label "$labels" 2>/dev/null; then
            echo -e "${GREEN}✓ Created successfully${NC}"
        else
            echo -e "${RED}✗ Failed to create issue${NC}"
        fi
        sleep 1 # Rate limiting
    fi
    echo
}

# Create high-priority issues
create_issue \
    "Add offline mode support for cached content" \
    "Implement offline mode that allows the MCP server to work without internet connectivity by using cached content." \
    "enhancement,priority:high"

create_issue \
    "Create comprehensive test suite" \
    "Add unit and integration tests for all major components including parser, search engine, cache manager, and MCP protocol compliance." \
    "testing,priority:high"

create_issue \
    "Document API rate limits and best practices" \
    "Create comprehensive documentation about rate limiting and responsible usage of Apple's servers." \
    "documentation,priority:high"

create_issue \
    "Security: Add input sanitization for all tools" \
    "Ensure all user inputs are properly sanitized to prevent security issues including injection attacks and path traversal." \
    "security,priority:high,bug"

create_issue \
    "Add platform-specific search filters" \
    "Enhance search to better filter by specific Apple platforms (iOS, macOS, etc.) and OS versions." \
    "enhancement,search"

create_issue \
    "Create GitHub Action for automated testing" \
    "Set up CI/CD pipeline using GitHub Actions for testing, linting, and building." \
    "infrastructure,testing"

# Summary
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}This was a dry run. Run without --dry-run to actually create the issues.${NC}"
else
    echo -e "${GREEN}Issues created! View them at:${NC}"
    echo "https://github.com/$REPO/issues"
fi

echo -e "\n${BLUE}Note:${NC} This script only creates a subset of issues."
echo "For the full list of 25 issues, use: node scripts/create-github-issues.js"