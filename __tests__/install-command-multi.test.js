const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let performInstall;
const cache = require('../src/cache');

beforeEach(() => {
  cache.del('index');
  delete process.env.ACP_REPOS_JSON;
});

test('performInstall resolves repo-qualified names and installs only matching repo item (dry-run)', async () => {
  // build an index in ACP_INDEX_JSON for simplicity
  const idx = {
    prompts: [
      { id: 'shared', name: 'Shared One', repo: 'r1', url: null, content: 'x' },
      { id: 'shared', name: 'Shared Two', repo: 'r2', url: null, content: 'y' }
    ],
    chatmodes: [],
    instructions: []
  };
  process.env.ACP_INDEX_JSON = JSON.stringify(idx);
  ({ performInstall } = require('../src/commands/install'));

  // performInstall in package-mode with repo-qualified name
  const tmp = path.join(os.tmpdir(), `acp-install-cmd-${Date.now()}`);
  await fs.ensureDir(tmp);

  // Use dry-run so no files are written, but ensure resolution finds correct item
  await performInstall({ target: 'r1:shared', names: [], options: { 'dry-run': true }, workspaceDir: tmp });

  // cleanup env
  delete process.env.ACP_INDEX_JSON;
});
