const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

const { installFiles, removeFiles } = require('../src/installer');
const { performInstall } = require('../src/commands/install');
const cache = require('../src/cache');

test('installFiles fetches raw content when item.url is present and writes workspace file', async () => {
  const tmp = path.join(os.tmpdir(), `acp-install-raw-${Date.now()}`);
  await fs.ensureDir(tmp);
  axios.get.mockResolvedValueOnce({ data: 'RAW-CONTENT' });
  const items = [{ id: 'raw1', name: 'Raw One', url: 'https://raw.example/raw1' }];
  const dest = await installFiles({ items, type: 'prompts', target: 'workspace', workspaceDir: tmp });
  const files = await fs.readdir(dest);
  expect(files.length).toBe(1);
  const content = await fs.readFile(path.join(dest, files[0]), 'utf8');
  expect(content).toBe('RAW-CONTENT');
});

test('installFiles writes prompts to user prompts folder', async () => {
  const tmp = path.join(os.tmpdir(), `acp-installer-user-prompts-${Date.now()}`);
  await fs.ensureDir(tmp);
  const origHome = process.env.HOME;
  process.env.HOME = tmp;

  const items = [{ id: 'up1', name: 'User Prompt', content: 'u' }];
  const dest = await installFiles({ items, type: 'prompts', target: 'user' });
  expect(await fs.pathExists(dest)).toBe(true);
  const files = await fs.readdir(dest);
  expect(files.length).toBeGreaterThan(0);

  if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
});

test('performInstall resolves names across types when multiple types and uses dry-run', async () => {
  // build index with same id in prompts and chatmodes
  cache.set('index', {
    prompts: [{ id: 'multi', name: 'Multi Prompt', repo: 'r1' }],
    chatmodes: [{ id: 'multi', name: 'Multi Chat', repo: 'r2' }],
    instructions: []
  });
  const logs = [];
  jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
  await performInstall({ target: 'workspace', type: 'all', names: ['multi'], options: { 'dry-run': true } });
  // dry-run should report two installs (one prompts and one chatmodes)
  expect(logs.some(l => l.includes('Would install')) || logs.some(l => l.includes('[dry-run]'))).toBe(true);
  console.log.mockRestore();
  cache.del('index');
});

test('removeFiles can remove files that are not JSON by matching filename', async () => {
  const tmp = path.join(os.tmpdir(), `acp-uninstall-nonjson-${Date.now()}`);
  const base = path.join(tmp, '.github', 'prompts');
  await fs.ensureDir(base);
  const fname = path.join(base, 'plainfile.prompt.md');
  await fs.writeFile(fname, 'plain text not json');
  const removed = await removeFiles({ names: ['plainfile.prompt.md'], type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(removed).toBe(1);
});
