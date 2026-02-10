const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let fetcher;
let fetchIndex;
let diskPaths;
const cache = require('../src/cache');

describe('fetcher verbose logging', () => {
  const tmp = path.join(os.tmpdir(), `acp-fetcher-verbose-${Date.now()}`);
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
    // Clear env vars
    delete process.env.ACP_INDEX_JSON;
    delete process.env.ACP_REPOS_JSON;
  });

  test('logs when using ACP_INDEX_JSON environment variable', async () => {
    const indexData = { prompts: [{ id: 'p1', name: 'Prompt One' }] };
    process.env.ACP_INDEX_JSON = JSON.stringify(indexData);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('ACP_INDEX_JSON environment variable detected'))).toBe(true);
      expect(logs.some(l => l.includes('successfully parsed ACP_INDEX_JSON'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs error when ACP_INDEX_JSON is malformed', async () => {
    process.env.ACP_INDEX_JSON = 'not valid json {';
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      // Mock the default repo call
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('ACP_INDEX_JSON environment variable detected'))).toBe(true);
      expect(logs.some(l => l.includes('failed to parse ACP_INDEX_JSON'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs when using ACP_REPOS_JSON environment variable', async () => {
    const reposData = [
      { id: 'test-repo', treeUrl: 'https://api.github.test/repo1', rawBase: 'https://raw.test/repo1' }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(reposData);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p1.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('ACP_REPOS_JSON environment variable detected'))).toBe(true);
      expect(logs.some(l => l.includes('successfully parsed ACP_REPOS_JSON with 1 repo(s)'))).toBe(true);
      expect(logs.some(l => l.includes('using repos from ACP_REPOS_JSON: test-repo'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs error when ACP_REPOS_JSON is malformed', async () => {
    process.env.ACP_REPOS_JSON = 'not valid json {';
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('ACP_REPOS_JSON environment variable detected'))).toBe(true);
      expect(logs.some(l => l.includes('failed to parse ACP_REPOS_JSON'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs when loading acp-repos.json file', async () => {
    const reposData = [
      { id: 'file-repo', treeUrl: 'https://api.github.test/repo2', rawBase: 'https://raw.test/repo2' }
    ];
    
    const baseDir = process.cwd();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    await fs.writeJson(repoFile, reposData);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p1.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('checking for acp-repos.json at'))).toBe(true);
      expect(logs.some(l => l.includes('acp-repos.json found, reading...'))).toBe(true);
      expect(logs.some(l => l.includes('successfully loaded 1 repo(s) from acp-repos.json'))).toBe(true);
      expect(logs.some(l => l.includes('using repos from acp-repos.json: file-repo'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs error when acp-repos.json is malformed', async () => {
    const baseDir = process.cwd();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    await fs.writeFile(repoFile, 'not valid json {');
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('checking for acp-repos.json at'))).toBe(true);
      expect(logs.some(l => l.includes('failed to read acp-repos.json'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs when using default repos', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p1.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('checking for acp-repos.json at'))).toBe(true);
      // The key assertion is that we either see "found" or "not found"
      expect(logs.some(l => l.includes('acp-repos.json') && (l.includes('not found') || l.includes('found')))).toBe(true);
      expect(logs.some(l => l.includes('final repos list:'))).toBe(true);
      expect(logs.some(l => l.includes('awesome-copilot'))).toBe(true);
      expect(logs.some(l => l.includes('fetching repos'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs repo fetching successes and failures', async () => {
    const reposData = [
      { id: 'success-repo', treeUrl: 'https://api.github.test/success', rawBase: 'https://raw.test/success' },
      { id: 'fail-repo', treeUrl: 'https://api.github.test/fail', rawBase: 'https://raw.test/fail' }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(reposData);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockImplementation((url) => {
        if (url === 'https://api.github.test/success') {
          return Promise.resolve({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p1.prompt.md' }] } });
        }
        if (url === 'https://api.github.test/fail') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('fetching tree for repo: success-repo'))).toBe(true);
      expect(logs.some(l => l.includes('successfully fetched tree for repo: success-repo'))).toBe(true);
      expect(logs.some(l => l.includes('fetching tree for repo: fail-repo'))).toBe(true);
      expect(logs.some(l => l.includes('failed to fetch tree for repo fail-repo'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs item count summary', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockImplementation((url) => {
        if (url.includes('tree')) {
          return Promise.resolve({ 
            status: 200, 
            data: { 
              tree: [
                { type: 'blob', path: 'prompts/p1.prompt.md' },
                { type: 'blob', path: 'agents/a1.agent.md' }
              ] 
            } 
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('combined index contains:'))).toBe(true);
      expect(logs.some(l => l.includes('prompts:'))).toBe(true);
      expect(logs.some(l => l.includes('agents:'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('does not log when verbose is false', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      await fetchIndex({ verbose: false });
      
      // Should not have verbose logs (only warnings about baseline-browser-mapping)
      const verboseLogs = logs.filter(l => l.includes('verbose:'));
      expect(verboseLogs.length).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });

  test('does not log when options is not provided', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      await fetchIndex();
      
      // Should not have verbose logs
      const verboseLogs = logs.filter(l => l.includes('verbose:'));
      expect(verboseLogs.length).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });

  test('logs disk cache operations', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      // First call should write cache
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('disk cache written to'))).toBe(true);
      
      // Clear in-memory cache to force disk read on second call
      cache.del('index');
      logs.length = 0;
      
      // Second call should read from disk
      await fetchIndex({ verbose: true });
      
      expect(logs.some(l => l.includes('reading disk cache from'))).toBe(true);
      expect(logs.some(l => l.includes('disk cache read successfully'))).toBe(true);
      expect(logs.some(l => l.includes('using fresh disk cache'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });
});
