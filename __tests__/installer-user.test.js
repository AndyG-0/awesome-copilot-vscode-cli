const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { installFiles } = require('../src/installer');

test('install writes non-prompts to user .github folder', async () => {
  const tmp = path.join(os.tmpdir(), `acp-installer-user-${Date.now()}`);
  await fs.ensureDir(tmp);
  const origHome = process.env.HOME;
  process.env.HOME = tmp;

  const items = [{ id: 'c1', name: 'ChatMode', content: 'x' }];
  const dest = await installFiles({ items, type: 'chatmodes', target: 'user' });
  expect(await fs.pathExists(dest)).toBe(true);
  const files = await fs.readdir(dest);
  expect(files.length).toBeGreaterThan(0);

  if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
});
