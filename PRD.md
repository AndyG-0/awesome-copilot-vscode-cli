# Product Requirements Document: acp-vscode

Goal: create an npm CLI (acp-vscode) to fetch prompts, chatmodes, and instructions from https://github.com/github/awesome-copilot and install them into VS Code workspace or user profile.

Requirements:
- fetch resources from the GitHub repo and cache index for 30 minutes (in-memory and on-disk)
- install into workspace (`.github/chatmodes`, `.github/prompts`) or VS Code user profile (prompts folder under the VS Code User directory, or `.github/*` under VS Code User for chatmodes/instructions)
- list available items and filter by type
- search items using cached index
- install single or multiple instruction files by name
- include help, tests, CI (GitHub Actions), README, and publish-ready `package.json`

Additional Notes:
- Provide `--dry-run` mode on install to preview files without writing
- Add release workflow that publishes to npm when a semantic tag (vMAJOR.MINOR.PATCH) is pushed; requires the `NPM_TOKEN` secret

- Add an `uninstall` command to remove installed items from workspace or user profile
- Require explicit confirmation for user-targeted uninstall or allow `--yes` to bypass confirmation

Behavior and implementation details

The PRD should describe high-level goals and acceptance criteria. For concrete usage, examples, and troubleshooting steps (cache removal, env var usage, completion examples), see the `README.md` which contains command examples and diagnostic tips.


Non-goals: automatic PRs, editor integrations (this is CLI-only)
