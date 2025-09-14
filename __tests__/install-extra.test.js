jest.mock('prompts');
const prompts = require('prompts');
const cache = require('../src/cache');

afterEach(() => {
  cache.del('index');
  delete process.env.ACP_INDEX_JSON;
  // restore TTY flag
  if (process.stdin && typeof process.stdin.isTTY !== 'undefined') process.stdin.isTTY = false;
});

test('performInstall package-mode when package not found sets exitCode 2', async () => {
  const { performInstall } = require('../src/commands/install');
  // ensure cache empty
  cache.del('index');
  // call with a package name that does not exist
  await performInstall({ target: 'no-such-package', options: {} });
  expect(process.exitCode).toBe(2);
});

test('performInstall interactive prompt skip path logs skipped by user', async () => {
  // simulate interactive TTY
  if (process.stdin) process.stdin.isTTY = true;
  // mock prompts to respond with ok: false
  prompts.mockResolvedValue({ ok: false });
  process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 'p1', name: 'One', repo: 'r1' }], chatmodes: [], instructions: [] });
  const { performInstall } = require('../src/commands/install');
  const logs = [];
  jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
  await performInstall({ target: 'workspace', type: 'prompts', names: [], options: {} });
  expect(logs.some(l => l.includes('Skipped by user'))).toBe(true);
  console.log.mockRestore();
});

test('performInstall handles fetchIndex throwing by setting exitCode 2', async () => {
  // mock fetcher to throw
  jest.resetModules();
  jest.doMock('../src/fetcher', () => ({
    fetchIndex: async () => { throw new Error('network'); },
    diskPaths: () => ({ DISK_CACHE_FILE: '/nonexistent' })
  }));
  const { performInstall } = require('../src/commands/install');
  // ensure cache cleared
  cache.del('index');
  await performInstall({ target: 'workspace', type: 'prompts', names: [], options: {} });
  expect(process.exitCode).toBe(2);
  // cleanup mocked module
  jest.dontMock('../src/fetcher');
  jest.resetModules();
});
