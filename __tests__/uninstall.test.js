const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { removeFiles } = require('../src/installer');

test('removeFiles removes named files in workspace', async () => {
  const tmp = path.join(os.tmpdir(), `acp-uninstall-${Date.now()}`);
  const base = path.join(tmp, '.github', 'prompts');
  await fs.ensureDir(base);
  const f1 = path.join(base, 'one.json');
  const f2 = path.join(base, 'two.json');
  await fs.writeJson(f1, { id: 'one', name: 'One' });
  await fs.writeJson(f2, { id: 'two', name: 'Two' });

  const removed = await removeFiles({ names: ['one'], type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(removed).toBe(1);
  const exists1 = await fs.pathExists(f1);
  const exists2 = await fs.pathExists(f2);
  expect(exists1).toBe(false);
  expect(exists2).toBe(true);
});
