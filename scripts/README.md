# GitHub Issues Creation Scripts

This directory contains scripts to create GitHub issues for the Apple HIG MCP project.

## Overview

We have 25 comprehensive issues defined in `github-issues.json` that cover:
- Feature enhancements
- Performance improvements
- Bug fixes
- Documentation
- Testing
- Security
- Infrastructure

## Available Scripts

### 1. Using GitHub CLI (Recommended)
```bash
# Dry run - see what would be created
npm run create-issues:dry

# Actually create the issues
npm run create-issues
```

### 2. Using GitHub API directly
If you have authentication issues with `gh` CLI:

```bash
# First, create a personal access token at:
# https://github.com/settings/tokens
# Select "repo" scope

# Dry run
GITHUB_TOKEN=your_token_here npm run create-issues:api:dry

# Create issues
GITHUB_TOKEN=your_token_here npm run create-issues:api
```

### 3. Using Shell Script (Subset only)
Creates only high-priority issues:

```bash
npm run create-issues:shell
# or
./scripts/create-github-issues.sh
```

## Issue Categories

The issues cover these areas:

- **Enhancement** (12 issues): New features and improvements
- **Testing** (2 issues): Test coverage and CI/CD
- **Performance** (3 issues): Optimization and efficiency
- **Security** (1 issue): Input validation and safety
- **Documentation** (2 issues): Guides and API docs
- **Infrastructure** (2 issues): Docker, GitHub Actions
- **Features** (8 issues): Major new capabilities

## Milestones

Issues are organized into milestones:
- **v1.0.1**: Critical fixes and documentation
- **v1.1.0**: Performance, testing, and stability
- **v1.2.0**: UX improvements and new tools
- **v1.3.0**: Advanced features and deployment
- **v2.0.0**: Major new features
- **v3.0.0**: Ambitious long-term goals

## Labels

Issues use semantic labels:
- `priority:high/medium/low`
- `enhancement`, `bug`, `documentation`
- `performance`, `security`, `testing`
- `good-first-issue` for newcomers
- Feature-specific: `search`, `ux`, `i18n`

## Tips

1. Run the dry-run first to verify everything looks correct
2. The scripts create milestones and labels automatically
3. There's a 1-second delay between issues to avoid rate limiting
4. If creation fails partway through, you can manually create remaining issues

## Manual Creation

If you prefer, you can create issues manually by copying from `github-issues.json`.