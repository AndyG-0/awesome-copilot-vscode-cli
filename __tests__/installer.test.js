const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { installFiles } = require('../src/installer');

test('install to workspace', async () => {
  const tmp = path.join(os.tmpdir(), `acp-test-${Date.now()}`);
  await fs.ensureDir(tmp);
  const items = [{ id: 'one', name: 'One', content: { body: 'x' } }];
  const dest = await installFiles({ items, type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(await fs.pathExists(dest)).toBe(true);
  const files = await fs.readdir(dest);
  expect(files.length).toBeGreaterThan(0);
});
