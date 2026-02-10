#!/bin/bash

# Quality checks script for acp-vscode
# Runs all quality checks locally: linting, tests, and validation
# Usage: ./scripts/quality-checks.sh
# Exit code: 0 if all checks pass, 1 if any check fails

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track failures
FAILED_CHECKS=()

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Quality Checks for acp-vscode${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check 1: Install dependencies if needed
echo -e "${YELLOW}📦 Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies with npm ci...${NC}"
    if npm ci; then
        echo -e "${GREEN}✓ npm ci completed${NC}"
    else
        if [ "${ALLOW_NPM_INSTALL_FALLBACK}" = "1" ]; then
            echo -e "${YELLOW}npm ci failed; falling back to npm install as ALLOW_NPM_INSTALL_FALLBACK=1${NC}"
            if npm install; then
                echo -e "${GREEN}✓ npm install completed${NC}"
            else
                echo -e "${RED}✗ Both npm ci and npm install failed${NC}"
                exit 1
            fi
        else
            echo -e "${RED}✗ npm ci failed; refusing to run npm install to avoid lockfile mutation.${NC}"
            echo -e "${RED}Set ALLOW_NPM_INSTALL_FALLBACK=1 to allow falling back to npm install if you understand the risks.${NC}"
            exit 1
        fi
    fi
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

# Check 2: Run linting
echo -e "${YELLOW}🔍 Running ESLint...${NC}"
if npm run lint; then
    echo -e "${GREEN}✓ ESLint passed${NC}"
else
    echo -e "${RED}✗ ESLint failed${NC}"
    FAILED_CHECKS+=("ESLint")
fi
echo ""

# Check 3: Run tests
echo -e "${YELLOW}🧪 Running Jest tests...${NC}"
if npm test; then
    echo -e "${GREEN}✓ Jest tests passed${NC}"
else
    echo -e "${RED}✗ Jest tests failed${NC}"
    FAILED_CHECKS+=("Jest tests")
fi
echo ""

# Check 4: Validate package.json
echo -e "${YELLOW}📋 Validating package.json...${NC}"
if node -e "require('./package.json')" 2>/dev/null; then
    echo -e "${GREEN}✓ package.json is valid${NC}"
else
    echo -e "${RED}✗ package.json is invalid${NC}"
    FAILED_CHECKS+=("package.json validation")
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ All quality checks passed!${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}✗ Some quality checks failed:${NC}"
    for check in "${FAILED_CHECKS[@]}"; do
        echo -e "  ${RED}• ${check}${NC}"
    done
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    exit 1
fi
