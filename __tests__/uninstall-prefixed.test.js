const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { removeFiles } = require('../src/installer');

test('removeFiles removes repo-prefixed files in workspace by repo:id and id', async () => {
  const tmp = path.join(os.tmpdir(), `acp-uninstall-prefixed-${Date.now()}`);
  const base = path.join(tmp, '.github', 'prompts');
  await fs.ensureDir(base);
  // simulate files written with repo prefix
  const f1 = path.join(base, 'r1-shared.prompt.md');
  const f2 = path.join(base, 'r2-shared.prompt.md');
  await fs.writeFile(f1, JSON.stringify({ id: 'shared', repo: 'r1' }));
  await fs.writeFile(f2, JSON.stringify({ id: 'shared', repo: 'r2' }));

  // Remove r1:shared should remove only r1 file
  let removed = await removeFiles({ names: ['r1:shared'], type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(removed).toBe(1);
  expect(await fs.pathExists(f1)).toBe(false);
  expect(await fs.pathExists(f2)).toBe(true);

  // Remove remaining by id-only should remove the other
  removed = await removeFiles({ names: ['shared'], type: 'prompts', target: 'workspace', workspaceDir: tmp });
  expect(removed).toBe(1);
  expect(await fs.pathExists(f2)).toBe(false);
});

test('removeFiles removes repo-prefixed files in user dir by repo:id and id', async () => {
  // For user path use getVsCodeUserDir location but override HOME via env to a tmp dir
  const tmp = path.join(os.tmpdir(), `acp-uninstall-prefixed-user-${Date.now()}`);
  await fs.ensureDir(tmp);
  // set HOME so getVsCodeUserDir resolves under tmp
  const origHome = process.env.HOME;
  process.env.HOME = tmp;
  const userPrompts = path.join(tmp, 'Library', 'Application Support', 'Code', 'User', 'prompts');
  await fs.ensureDir(userPrompts);
  const f1 = path.join(userPrompts, 'r1-shared.prompt.md');
  const f2 = path.join(userPrompts, 'r2-shared.prompt.md');
  await fs.writeFile(f1, JSON.stringify({ id: 'shared', repo: 'r1' }));
  await fs.writeFile(f2, JSON.stringify({ id: 'shared', repo: 'r2' }));

  let removed = await removeFiles({ names: ['r2:shared'], type: 'prompts', target: 'user' });
  expect(removed).toBe(1);
  expect(await fs.pathExists(f2)).toBe(false);

  removed = await removeFiles({ names: ['shared'], type: 'prompts', target: 'user' });
  expect(removed).toBe(1);
  expect(await fs.pathExists(f1)).toBe(false);

  // restore HOME
  if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
});
