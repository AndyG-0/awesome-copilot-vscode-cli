## Contributing

Thanks for contributing! This file explains how to run tests and the CLI locally.

Development setup
-----------------

- Install dependencies:

```bash
npm install
```

- Run the CLI locally (help):

```bash
node ./bin/acp-vscode.js --help
```

Running tests
-------------

- Run the test suite with Jest:

```bash
npm test
```

- Tests use `ACP_INDEX_JSON` and other environment variables in some cases. To run tests or manual checks offline, generate a JSON index and set `ACP_INDEX_JSON` before running the command:

```bash
export ACP_INDEX_JSON='{"prompts":[],"chatmodes":[],"instructions":[]}'
npm test
```

Key notes for contributors
--------------------------
- The fetcher writes a small on-disk cache to `./.acp-cache/index.json`. Tests may create or read this file. If you see stale results during development, remove the directory:

```bash
rm -rf .acp-cache
```

- The CLI supports `ACP_REPOS_JSON` to override the upstream repo list when fetching.

- Keep changes small and unit-tested. There are unit and integration tests under `__tests__/`.

Submitting a PR
----------------

- Open a pull request against `main` with an explanatory title and tests for behavior changes.
- The repository is configured to run tests on PRs. Ensure tests pass locally before opening the PR.

Contact
-------

If you need help, open an issue on the repository or mention the maintainers in your PR.
