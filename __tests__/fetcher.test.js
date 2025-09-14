const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let fetcher;
let fetchIndex;
let diskPaths;
const cache = require('../src/cache');

describe('fetcher', () => {
  const tmp = path.join(os.tmpdir(), `acp-fetcher-${Date.now()}`);
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
    cache.del('index');
    const { DISK_CACHE_DIR } = diskPaths();
    await fs.remove(DISK_CACHE_DIR).catch(() => {});
    axios.get.mockReset();
  });

  test('fetches remote when no cache', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p' }] } });
    const idx = await fetchIndex();
    expect(idx).toEqual({ prompts: [{ id: 'p' }] });
    // disk cache should exist
    const { DISK_CACHE_FILE } = diskPaths();
    expect(await fs.pathExists(DISK_CACHE_FILE)).toBe(true);
  });

  test('uses disk cache when fresh', async () => {
    // write fresh disk cache
    const payload = { prompts: [{ id: 'p2' }] };
  const { DISK_CACHE_DIR, DISK_CACHE_FILE } = diskPaths();
  await fs.ensureDir(DISK_CACHE_DIR);
  await fs.writeJson(DISK_CACHE_FILE, { ts: Date.now(), payload });
    const idx = await fetchIndex();
    expect(idx).toEqual(payload);
    // axios should not have been called
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('falls back to stale disk cache if network fails', async () => {
    // write stale disk cache (old ts)
    const payload = { prompts: [{ id: 'stale' }] };
  const { DISK_CACHE_DIR, DISK_CACHE_FILE } = diskPaths();
  await fs.ensureDir(DISK_CACHE_DIR);
  await fs.writeJson(DISK_CACHE_FILE, { ts: Date.now() - (60 * 60 * 1000), payload });
    axios.get.mockRejectedValue(new Error('network error'));
    const idx = await fetchIndex();
    expect(idx).toEqual(payload);
  });

  test('builds combined index and detects conflicts across repos', async () => {
    // configure two repos that both contain a 'shared' prompt id
    process.env.ACP_REPOS_JSON = JSON.stringify([
      { id: 'r1', treeUrl: 'https://api/repo1', rawBase: 'https://raw1' },
      { id: 'r2', treeUrl: 'https://api/repo2', rawBase: 'https://raw2' }
    ]);

    axios.get.mockImplementation((url) => {
      // repo trees
      if (url === 'https://api/repo1') {
        return Promise.resolve({ status: 200, data: { tree: [
          { path: 'prompts/p1.prompt.md', type: 'blob' },
          { path: 'prompts/shared.prompt.md', type: 'blob' }
        ] } });
      }
      if (url === 'https://api/repo2') {
        return Promise.resolve({ status: 200, data: { tree: [
          { path: 'prompts/p2.prompt.md', type: 'blob' },
          { path: 'prompts/shared.prompt.md', type: 'blob' }
        ] } });
      }
      // per-file raw content
      if (url.startsWith('https://raw1/')) {
        return Promise.resolve({ status: 200, data: '---\ntitle: "Repo One P1"\n---\ncontent' });
      }
      if (url.startsWith('https://raw2/')) {
        return Promise.resolve({ status: 200, data: '---\ntitle: "Repo Two P2"\n---\ncontent' });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });

    const idx = await fetchIndex();

    // repos metadata should be present
    expect(idx._repos).toEqual([
      { id: 'r1', treeUrl: 'https://api/repo1', rawBase: 'https://raw1' },
      { id: 'r2', treeUrl: 'https://api/repo2', rawBase: 'https://raw2' }
    ]);

    // prompts should include items from both repos
    const pids = idx.prompts.map(p => `${p.repo}:${p.id}`).sort();
    expect(pids).toEqual(expect.arrayContaining(['r1:p1', 'r2:p2', 'r1:shared', 'r2:shared']));

    // conflict should include 'shared'
    expect(idx._conflicts).toContain('shared');

    // shared items should have repo metadata and be two entries
    const shared = idx.prompts.filter(p => p.id === 'shared');
    expect(shared.length).toBe(2);
    expect(new Set(shared.map(s => s.repo))).toEqual(new Set(['r1','r2']));

    delete process.env.ACP_REPOS_JSON;
  });
});
