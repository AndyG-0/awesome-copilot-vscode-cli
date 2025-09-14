jest.mock('../src/fetcher');
const { fetchIndex } = require('../src/fetcher');
const cache = require('../src/cache');
const { performInstall } = require('../src/commands/install');
const fs = require('fs-extra');

const FIXTURE_INDEX = {
  prompts: [{ id: 'p1', name: 'Prompt One' }],
  chatmodes: [{ id: 'c1', name: 'Chat Mode One' }],
  instructions: [{ id: 'i1', name: 'Instruction One' }]
};

beforeEach(() => {
  fetchIndex.mockResolvedValue(FIXTURE_INDEX);
  cache.del('index');
});

test('performInstall installs a named package when present', async () => {
  // create a temp dir to act as workspace
  const tmp = require('path').join(require('os').tmpdir(), `acp-test-${Date.now()}`);
  await fs.ensureDir(tmp);
  await performInstall({ target: 'p1', type: undefined, names: [], options: { verbose: false }, workspaceDir: tmp });
  // performInstall returns undefined but should have written files under tmp/.github or prompts
  const gh = require('path').join(tmp, '.github');
  const exists = await fs.pathExists(gh);
  expect(exists).toBe(true);
});

test('performInstall errors when package not found', async () => {
  // capture console.error
  const errs = [];
  const orig = console.error;
  console.error = (...args) => errs.push(args.join(' '));
  try {
    await performInstall({ target: 'nonexistent-package', type: undefined, names: [], options: {} });
    expect(errs.some(e => e.includes('not found'))).toBeTruthy();
  } finally {
    console.error = orig;
  }
});
