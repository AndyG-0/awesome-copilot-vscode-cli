const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let fetcher;
let fetchIndex;
let diskPaths;
const cache = require('../src/cache');

describe('fetcher verbose logging integration tests', () => {
  const tmp = path.join(os.tmpdir(), `acp-fetcher-integration-${Date.now()}`);
  const origCwd = process.cwd();
  let origNodeEnv;

  beforeAll(async () => {
    await fs.ensureDir(tmp);
    process.chdir(tmp);
    origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    // require after chdir so diskPaths uses tmp cwd
    fetcher = require('../src/fetcher');
    fetchIndex = fetcher.fetchIndex;
    diskPaths = fetcher.diskPaths;
  });

  afterAll(async () => {
    process.chdir(origCwd);
    if (origNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = origNodeEnv;
    }
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

  test('verbose logging works through complete flow: env var -> parse -> fetch -> cache', async () => {
    const testRepoConfig = [
      {
        id: 'test-acp-cli',
        treeUrl: 'https://api.github.com/repos/AndyG-0/test-acp-cli/git/trees/main?recursive=1',
        rawBase: 'https://raw.githubusercontent.com/AndyG-0/test-acp-cli/main'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      // Mock the GitHub API responses
      axios.get.mockImplementation((url) => {
        if (url === 'https://api.github.com/repos/AndyG-0/test-acp-cli/git/trees/main?recursive=1') {
          return Promise.resolve({
            status: 200,
            data: {
              tree: [
                { type: 'blob', path: 'prompts/sample-prompt.prompt.md' },
                { type: 'blob', path: 'agents/sample-agent.agent.md' },
                { type: 'blob', path: 'instructions/sample-instructions.instructions.md' },
                { type: 'blob', path: 'skills/sample-skill/skill.md' },
                { type: 'tree', path: 'skills/sample-skill' }
              ]
            }
          });
        }
        // Mock content fetches
        if (url.includes('raw.githubusercontent.com')) {
          return Promise.resolve({
            status: 200,
            data: '---\ntitle: "Test Sample"\nversion: 1.0.0\n---\nContent here'
          });
        }
        return Promise.reject(new Error('Unexpected URL: ' + url));
      });
      
      const result = await fetchIndex({ verbose: true });
      
      // Verify the verbose logs captured key events
      expect(logs.some(l => l.includes('fetchIndex called'))).toBe(true);
      expect(logs.some(l => l.includes('ACP_REPOS_JSON environment variable detected'))).toBe(true);
      expect(logs.some(l => l.includes('successfully parsed ACP_REPOS_JSON'))).toBe(true);
      expect(logs.some(l => l.includes('using repos from ACP_REPOS_JSON: test-acp-cli'))).toBe(true);
      expect(logs.some(l => l.includes('fetching tree for repo: test-acp-cli'))).toBe(true);
      expect(logs.some(l => l.includes('successfully fetched tree for repo: test-acp-cli'))).toBe(true);
      expect(logs.some(l => l.includes('blob items'))).toBe(true);
      expect(logs.some(l => l.includes('prompts'))).toBe(true);
      expect(logs.some(l => l.includes('agents'))).toBe(true);
      expect(logs.some(l => l.includes('combined index contains:'))).toBe(true);
      expect(logs.some(l => l.includes('disk cache written'))).toBe(true);
      expect(logs.some(l => l.includes('index successfully built and cached'))).toBe(true);
      
      // Verify the index was built correctly
      expect(result).toHaveProperty('prompts');
      expect(result).toHaveProperty('agents');
      expect(result).toHaveProperty('instructions');
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('_repos');
      // Now includes both the default awesome-copilot repo and test-acp-cli
      expect(result._repos.length).toBeGreaterThanOrEqual(2);
      expect(result._repos.some(r => r.id === 'test-acp-cli')).toBe(true);
      expect(result._repos.some(r => r.id === 'awesome-copilot')).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('verbose logging shows configuration source priority', async () => {
    // Test 1: With ACP_REPOS_JSON env var (highest priority)
    const testRepoConfig = [
      { id: 'from-env', treeUrl: 'https://api.test/env', rawBase: 'https://raw.test/env' }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);
    
    const logs1 = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs1.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs1.some(l => l.includes('ACP_REPOS_JSON environment variable detected'))).toBe(true);
      expect(logs1.some(l => l.includes('from-env'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
    
    // Clear env var and test file-based config
    delete process.env.ACP_REPOS_JSON;
    cache.del('index');
    const { DISK_CACHE_DIR } = diskPaths();
    await fs.remove(DISK_CACHE_DIR);
    
    // Test 2: With acp-repos.json file (second priority)
    const baseDir = process.cwd();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    const fileRepoConfig = [
      { id: 'from-file', treeUrl: 'https://api.test/file', rawBase: 'https://raw.test/file' }
    ];
    await fs.writeJson(repoFile, fileRepoConfig);
    
    const logs2 = [];
    console.log = jest.fn(msg => logs2.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs2.some(l => l.includes('acp-repos.json found'))).toBe(true);
      expect(logs2.some(l => l.includes('from-file'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
    
    // Clear file and test default config
    await fs.remove(repoFile);
    cache.del('index');
    await fs.remove(DISK_CACHE_DIR);
    
    // Test 3: With defaults (lowest priority)
    const logs3 = [];
    console.log = jest.fn(msg => logs3.push(msg));
    
    try {
      axios.get.mockResolvedValue({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] } });
      
      await fetchIndex({ verbose: true });
      
      expect(logs3.some(l => l.includes('awesome-copilot'))).toBe(true);
      // Now the final repos list should include awesome-copilot plus any configured repos
      expect(logs3.some(l => l.includes('final repos list:'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('verbose logging captures and reports specific repo fetch errors', async () => {
    const testRepoConfig = [
      {
        id: 'good-repo',
        treeUrl: 'https://api.test/good',
        rawBase: 'https://raw.test/good'
      },
      {
        id: 'bad-repo-invalid-json',
        treeUrl: 'https://api.test/badjson',
        rawBase: 'https://raw.test/badjson'
      },
      {
        id: 'bad-repo-network',
        treeUrl: 'https://api.test/badnetwork',
        rawBase: 'https://raw.test/badnetwork'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);
    
    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));
    
    try {
      axios.get.mockImplementation((url) => {
        if (url === 'https://api.test/good') {
          return Promise.resolve({ status: 200, data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] } });
        }
        if (url === 'https://api.test/badjson') {
          return Promise.resolve({ status: 500, data: 'Server error' });
        }
        if (url === 'https://api.test/badnetwork') {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      await fetchIndex({ verbose: true });
      
      // Verify we see success for good repo
      expect(logs.some(l => l.includes('fetching tree for repo: good-repo'))).toBe(true);
      expect(logs.some(l => l.includes('successfully fetched tree for repo: good-repo'))).toBe(true);
      
      // Verify we see error for bad repos
      expect(logs.some(l => l.includes('fetching tree for repo: bad-repo-invalid-json'))).toBe(true);
      expect(logs.some(l => l.includes('fetching tree for repo: bad-repo-network'))).toBe(true);
      expect(logs.some(l => l.includes('failed to fetch tree'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('verbose logs show transition from disk cache to fresh fetch', async () => {
    const logs1 = [];
    const originalLog = console.log;
    
    try {
      // First fetch - write fresh cache
      axios.get.mockResolvedValue({ status: 200, data: { prompts: [{ id: 'p1' }] } });
      
      console.log = jest.fn(msg => logs1.push(msg));
      const result1 = await fetchIndex({ verbose: true });
      
      expect(logs1.some(l => l.includes('disk cache written'))).toBe(true);
      expect(result1.prompts).toHaveLength(1);
      
      // Second fetch - use in-memory cache
      cache.del('index'); // Clear in-memory but disk cache still valid
      logs1.length = 0;
      
      console.log = jest.fn(msg => logs1.push(msg));
      const result2 = await fetchIndex({ verbose: true });
      
      expect(logs1.some(l => l.includes('reading disk cache from'))).toBe(true);
      expect(logs1.some(l => l.includes('disk cache read successfully'))).toBe(true);
      expect(logs1.some(l => l.includes('using fresh disk cache'))).toBe(true);
      expect(result2.prompts).toHaveLength(1);
    } finally {
      console.log = originalLog;
    }
  });
});
