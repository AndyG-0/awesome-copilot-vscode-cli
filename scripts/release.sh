#!/bin/bash

# Release script for acp-vscode
# Usage: ./scripts/release.sh <major|minor|patch>
# Example: ./scripts/release.sh minor

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate input
if [ $# -ne 1 ]; then
    echo -e "${RED}Error: Release type required${NC}"
    echo "Usage: ./scripts/release.sh <major|minor|patch>"
    exit 1
fi

VERSION_TYPE=$1

# Validate version type
if [[ ! $VERSION_TYPE =~ ^(major|minor|patch)$ ]]; then
    echo -e "${RED}Error: Invalid release type '${VERSION_TYPE}'${NC}"
    echo "Valid options: major, minor, patch"
    exit 1
fi

echo -e "${YELLOW}Starting release process...${NC}"

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Working directory is not clean (uncommitted or untracked changes)${NC}"
    echo "Please commit or stash your changes before releasing."
    git status --short
    exit 1
fi

echo -e "${GREEN}✓ Working directory is clean${NC}"

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
npm test || {
    echo -e "${RED}Error: Tests failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Tests passed${NC}"

# Run linting if available
if node -p "require('./package.json').scripts?.lint" 2>/dev/null | grep -v "undefined" >/dev/null; then
    echo -e "${YELLOW}Running lint...${NC}"
    if npm run lint; then
        echo -e "${GREEN}✓ Linting passed${NC}"
    else
        echo -e "${RED}Error: Linting failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Linting not available (skipping)${NC}"
fi

# Display current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"

# Use npm version to bump version and create tag
echo -e "${YELLOW}Bumping version (${VERSION_TYPE})...${NC}"
npm version "$VERSION_TYPE"

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓ Version bumped to ${NEW_VERSION}${NC}"

# Get the tag that was created
TAG="v${NEW_VERSION}"

# Push the tag to remote
echo -e "${YELLOW}Pushing tag ${TAG} to remote...${NC}"
git push --follow-tags || {
    echo -e "${RED}Error: Failed to push tag${NC}"
    echo "You may need to push manually with: git push --follow-tags"
    exit 1
}

echo -e "${GREEN}✓ Tag pushed successfully${NC}"
echo -e "${GREEN}Release complete! Tag ${TAG} has been pushed.${NC}"
echo -e "${YELLOW}The GitHub Actions workflow will now build and publish the release.${NC}"
