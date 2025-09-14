const { execFileSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const CLI = path.join(__dirname, '..', 'bin', 'acp-vscode.js');

describe('e2e CLI', () => {
  const tmp = path.join(os.tmpdir(), `acp-e2e-${Date.now()}`);
  beforeAll(async () => {
    await fs.ensureDir(tmp);
  });
  afterAll(async () => {
    await fs.remove(tmp).catch(() => {});
  });

  test('install workspace prompts writes only to workspace and cleans up', () => {
    const index = { prompts: [{ id: 'p1', name: 'p1', content: { body: 'ok' } }] };
    const env = Object.assign({}, process.env, { ACP_INDEX_JSON: JSON.stringify(index) });
    // run install pointing at tmp as cwd
    execFileSync('node', [CLI, 'install', 'workspace', 'prompts'], { cwd: tmp, env });
    const installedDir = path.join(tmp, '.github', 'prompts');
    expect(fs.existsSync(installedDir)).toBe(true);
    const files = fs.readdirSync(installedDir);
    expect(files.length).toBeGreaterThan(0);
    // ensure VS Code user profile was not touched (we won't check actual user dir), just ensure cwd-based user didn't receive files
    const userPrompts = path.join(tmp, 'prompts');
    expect(fs.existsSync(userPrompts)).toBe(false);
    // cleanup
    fs.removeSync(installedDir);
    expect(fs.existsSync(installedDir)).toBe(false);
  });

  test('unknown option shows friendly error', () => {
    const { spawnSync } = require('child_process');
    const res = spawnSync('node', [CLI, '--no-such-option'], { encoding: 'utf8' });
    const out = `${res.stdout || ''}${res.stderr || ''}${res.error ? res.error.message : ''}`;
    expect(out).toMatch(/Run `acp-vscode --help`/);
  });
});
