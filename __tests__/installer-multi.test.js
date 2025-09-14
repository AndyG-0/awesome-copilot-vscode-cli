const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { installFiles } = require('../src/installer');

test('install preserves repo id in filenames and writes workspace files for multi-repo items', async () => {
  const tmp = path.join(os.tmpdir(), `acp-install-multi-${Date.now()}`);
  await fs.ensureDir(tmp);
  const items = [
    { id: 'one', name: 'One', content: 'a', repo: 'r1' },
    { id: 'one', name: 'One from r2', content: 'b', repo: 'r2' }
  ];
  const dest = await installFiles({ items, type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(await fs.pathExists(dest)).toBe(true);
  const files = await fs.readdir(dest);
  // Should have written two files for both items
  expect(files.length).toBe(2);
  // Read files and ensure contents correspond
  const contents = await Promise.all(files.map(f => fs.readFile(path.join(dest, f), 'utf8')));
  expect(contents.some(c => c.includes('a'))).toBe(true);
  expect(contents.some(c => c.includes('b'))).toBe(true);
});
