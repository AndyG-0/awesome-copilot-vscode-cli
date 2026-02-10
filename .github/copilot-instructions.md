# Copilot Instructions for acp-vscode

These instructions guide AI assistants (like GitHub Copilot) in maintaining code quality and best practices for the acp-vscode project.

## Quality Checks

After making any major changes to the codebase, **you must run the quality checks script and ensure all checks pass**:

```bash
./scripts/quality-checks.sh
```

This script runs:
- **ESLint** - Validates code style and best practices
- **Jest Tests** - Ensures all unit tests pass
- **package.json Validation** - Verifies the package configuration is valid

### When to Run Quality Checks

Run quality checks after:
- Implementing new features
- Fixing bugs
- Refactoring code
- Adding or modifying tests
- Updating dependencies
- Making any changes to source files

### Fixing Quality Check Failures

If any quality check fails:

1. **Read the error output carefully** - Identify the specific files and line numbers that failed
2. **Fix the issues incrementally** - Make small, focused changes to address each failure
3. **Re-run the quality checks** - After each fix, run the quality checks again to verify the change
4. **Iterate until all checks pass** - Continue fixing and testing until `./scripts/quality-checks.sh` exits with code 0

### ESLint Failures

If ESLint fails:
- Review the linting rules in the project configuration
- Fix code style issues (indentation, spacing, naming conventions)
- Follow the existing code style patterns in the codebase
- Many ESLint errors can be automatically fixed with: `npm run lint -- --fix`

### Jest Test Failures

If tests fail:
- Run the test suite with: `npm test`
- Review the test output to understand what assertions failed
- Update or add tests to cover the new code
- Ensure backward compatibility with existing tests
- Do not disable or skip tests to make them pass

## Code Quality Standards

### Guidelines

- **Consistency** - Follow the existing code style and patterns in the codebase
- **Testing** - All new features should have corresponding tests
- **Documentation** - Update README.md and other documentation as needed
- **Git Hygiene** - Make atomic, well-described commits

### Before Submitting Changes

1. Run `./scripts/quality-checks.sh` and ensure all checks pass
2. Verify no new warnings or errors were introduced
3. Test the changes manually if applicable
4. Review the changes for clarity and correctness

## References

- CI/CD Pipeline: [.github/workflows/ci.yml](.github/workflows/ci.yml)
- Release Process: [scripts/release.sh](scripts/release.sh)
- Quality Checks: [scripts/quality-checks.sh](scripts/quality-checks.sh)

## Related Configuration Files

- [package.json](../../package.json) - Project metadata and scripts
- [jest.config.cjs](../../jest.config.cjs) - Jest test configuration
- [.eslintrc or similar]() - ESLint configuration (if present)
