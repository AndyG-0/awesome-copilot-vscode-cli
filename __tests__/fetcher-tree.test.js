const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let fetcher;
let fetchIndex;
let diskPaths;

describe('fetcher tree -> index conversion', () => {
  const tmp = path.join(os.tmpdir(), `acp-fetcher-tree-${Date.now()}`);
  const origCwd = process.cwd();

  beforeAll(async () => {
    await fs.ensureDir(tmp);
    process.chdir(tmp);
    // require after chdir so diskPaths uses tmp cwd
    fetcher = require('../src/fetcher');
    fetchIndex = fetcher.fetchIndex;
    diskPaths = fetcher.diskPaths;
  });

  afterAll(async () => {
    process.chdir(origCwd);
    await fs.remove(tmp);
  });

  beforeEach(async () => {
    const { DISK_CACHE_DIR } = diskPaths();
    await fs.remove(DISK_CACHE_DIR).catch(() => {});
    axios.get.mockReset();
  });

  test('constructs index from git tree', async () => {
    const tree = [
      { path: 'prompts/p1.prompt.md', type: 'blob' },
      { path: 'chatmodes/c1.chatmode.md', type: 'blob' },
      { path: 'instructions/i1.instructions.md', type: 'blob' }
    ];
    axios.get.mockResolvedValue({ status: 200, data: { tree } });

    const idx = await fetchIndex();

    expect(idx).toBeTruthy();
    expect(Array.isArray(idx.prompts)).toBe(true);
    expect(Array.isArray(idx.chatmodes)).toBe(true);
    expect(Array.isArray(idx.instructions)).toBe(true);

    expect(idx.prompts[0].path).toBe('prompts/p1.prompt.md');
    expect(idx.prompts[0].url).toBe('https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/p1.prompt.md');
    expect(idx.chatmodes[0].path).toBe('chatmodes/c1.chatmode.md');
    expect(idx.instructions[0].path).toBe('instructions/i1.instructions.md');
  });
});
