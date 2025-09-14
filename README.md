# acp-vscode

acp-vscode is a small CLI to fetch and install chatmodes, prompts and instructions from the GitHub "awesome-copilot" repository into your VS Code workspace or VS Code User profile.

Install (when published):

```bash
npm install -g acp-vscode
# or run locally
node ./bin/acp-vscode.js --help
```

Commands:
- install <workspace|user> [names...]
  - target: `workspace` or `user`
  - names: optional list of ids or names to install (supports `repo:id` form)
  - type: specify with the option `--type <type>` (prompts|chatmodes|instructions|all). For backwards compatibility you can still pass the type as the first positional name (e.g. `install workspace prompts p1 p2`). Note: the `install` command also accepts a deliberate typo alias `--referesh` (alias for `--refresh`) to preserve historical behavior.
- list [type]
  - list items available. type can be `prompts`, `chatmodes`, `instructions`, or `all`
- search <query>
  - search across items
- uninstall <workspace|user> <type> [names...]
  - remove installed files from workspace or user profile; use `--yes` to skip confirmation when targeting `user`.
- completion [shell]
  - print a simple shell completion script for `bash` or `zsh` (default `bash`)

Output formats
---------------

Both `list` and `search` support a machine-readable JSON output via the `--json` (or `-j`) flag. When provided the commands will emit an array of items (objects with `type`, `id`, and `name`) instead of the human-friendly table.

Example (JSON):

```bash
acp-vscode list prompts --json
acp-vscode search "find me" --json
```

Examples:

Install all prompts to workspace:

```bash
acp-vscode install workspace prompts
```

Install specific instructions to user profile (preferred):

```bash
acp-vscode install user --type instructions "Instruction Name"
```

Or (legacy positional type):

```bash
acp-vscode install user instructions "Instruction Name"
```

Completion examples
-------------------

Print a `bash` completion helper and save it for interactive use:

```bash
acp-vscode completion bash > /etc/bash_completion.d/acp-vscode
# or source it in your shell for testing
acp-vscode completion bash | source /dev/stdin
```

For `zsh` add the script snippet to your `.zshrc` (the command prints a small helper function):

```bash
acp-vscode completion zsh >> ~/.zshrc
```

Uninstall examples
------------------

Remove two prompts from workspace:

```bash
acp-vscode uninstall workspace prompts one two
```

Remove a prompt from the user profile without confirmation:

```bash
acp-vscode uninstall user prompts my-prompt --yes
```

Troubleshooting
---------------

- Cache and stale index
  - By default the CLI writes a disk cache under the user's home directory in `~/.acp/cache/index.json` (30 minute TTL). When running in development or tests the CLI preserves the old behavior and keeps the cache in the current working directory at `./.acp-cache/index.json` to avoid surprising local workflows. If you see stale results or want to force a fresh fetch, remove the cache file and retry:

```bash
rm -rf .acp-cache
acp-vscode list --refresh
```

- Offline testing / injecting a local index
  - For tests or offline usage you can set `ACP_INDEX_JSON` to a JSON string representing the index. This bypasses network fetching entirely and the CLI will use the provided index verbatim.

- Multiple upstream repos
  - To index multiple repos set `ACP_REPOS_JSON` to a JSON array of repo descriptors. Example:

```json
[ { "id": "r1", "treeUrl": "https://api.github.com/repos/org/repo1/git/trees/main?recursive=1", "rawBase": "https://raw.githubusercontent.com/org/repo1/main" } ]
```

- Verbose logging
  - Add `--verbose` to commands to see extra diagnostic messages during fetch, cache clearing, and install/uninstall operations.

Cache: the CLI caches the fetched GitHub index in-memory and on-disk for 30 minutes to reduce network calls. The on-disk cache is stored under the current working directory in `.acp-cache/index.json`.

Configuration (environment variables)

Environment variables

ACP_INDEX_JSON

You can inject a full, pre-built index via the `ACP_INDEX_JSON` environment variable. This should be a JSON string representing the index shape the fetcher returns, for example:

```json
{
  "prompts": [{ "id": "p1", "name": "Prompt 1", "repo": "r1", "url": "https://..." }],
  "chatmodes": [],
  "instructions": []
}
```

This is useful for tests or offline runs. When present, the fetcher will parse and return this value verbatim.

ACP_REPOS_JSON

To support multiple upstream repos, set `ACP_REPOS_JSON` to a JSON array describing the repositories to index. Each repo object should contain at least an `id` and a `treeUrl`. Optionally include `rawBase` (the base URL to fetch raw file contents).

Example:

```json
[
  { "id": "r1", "treeUrl": "https://api.github.com/repos/org/repo1/git/trees/main?recursive=1", "rawBase": "https://raw.githubusercontent.com/org/repo1/main" },
  { "id": "r2", "treeUrl": "https://api.github.com/repos/org/repo2/git/trees/main?recursive=1", "rawBase": "https://raw.githubusercontent.com/org/repo2/main" }
]
```

When multiple repos contain files with the same `id`, the fetcher adds an `_conflicts` array to the returned index listing conflicted ids. Consumers will display items as `repo:id` when necessary to disambiguate.

Local repo file (acp-repos.json)
-------------------------------

In addition to `ACP_REPOS_JSON` the CLI will look for a file named `acp-repos.json` in the `~/.acp` directory and use it to populate the upstream repo list if the environment variable is not set. This file should contain the same JSON array format as `ACP_REPOS_JSON` and is useful for per-user configuration without exporting environment variables. Precedence when building the repos list is:

1. `ACP_REPOS_JSON` environment variable (highest priority)
2. `~/.acp/acp-repos.json` file (if present)
3. Built-in default repo (github/awesome-copilot)

Note: when running in development or tests the CLI will attempt to read `acp-repos.json` from the current working directory instead of `~/.acp` to keep test fixtures and local development predictable.

Dry-run:

You can preview what would be installed without writing files using --dry-run:

```bash
acp-vscode install workspace prompts --dry-run
```

Other notes

Global flags

- `--verbose` enables extra logging across commands.
- `--refresh` is a global top-level flag but currently only applied by the `list` and `search` commands to force clearing in-memory and on-disk caches. The `install` command accepts a `--referesh` alias (typo preserved) which also triggers cache clearing when provided to `install`.

Commands reference
------------------

Short reference for each command, key options, and quick examples.

- install <workspace|user> [names...]
  - Description: Install prompts/chatmodes/instructions into a workspace or VS Code user profile.
  - Options: `-t, --type <type>` (prompts|chatmodes|instructions|all), `--dry-run`, `--referesh` (alias for refresh), `--verbose`
  - Examples:
    - Install all prompts into the current workspace:
      - `acp-vscode install workspace prompts`
    - Install instruction by name into user profile (preferred):
      - `acp-vscode install user --type instructions "Instruction Name"`

- list [type]
  - Description: List available items. Type can be `prompts`, `chatmodes`, `instructions`, or `all` (default).
  - Options: `-r, --refresh` (clear caches and refetch), `-j, --json`, `--verbose`
  - Examples:
    - `acp-vscode list chatmodes`
    - `acp-vscode list --json`

- search <query>
  - Description: Search the index for matching items (name, id or content).
  - Options: `-r, --refresh`, `-j, --json`, `--verbose`
  - Examples:
    - `acp-vscode search "temperature"`

- uninstall <workspace|user> <type> [names...]
  - Description: Remove installed files from workspace or user profile. When targeting `user` you'll be prompted for confirmation unless you pass `--yes`.
  - Options: `--yes`, `--verbose`
  - Examples:
    - `acp-vscode uninstall workspace prompts one two`

- completion [shell]
  - Description: Print a small shell completion snippet for `bash` or `zsh`.
  - Examples:
    - `acp-vscode completion bash`


Publishing:

This repository includes a release workflow that publishes to npm when a tag like v0.1.0 is pushed. You must add an `NPM_TOKEN` secret in the repository settings for the workflow to authenticate with npm.

Publish checklist:

1. Update `package.json` fields: `version`, `repository.url`, `bugs.url`, `author`.
2. Create a repo secret `NPM_TOKEN` in GitHub (Settings → Secrets → Actions). Generate the token with npm's access token UI.
3. Create a release tag and push it, e.g.:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. The release workflow will run tests and publish the package to npm on success.

Uninstall and confirmation:

To remove installed files:

```bash
acp-vscode uninstall workspace prompts one two
```

If you're uninstalling from the VS Code user profile, the CLI will prompt for confirmation. Use `--yes` to skip the prompt:

```bash
acp-vscode uninstall user prompts one --yes
```



