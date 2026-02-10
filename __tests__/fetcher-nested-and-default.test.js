const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
jest.mock('axios');

let fetcher;
let fetchIndex;
let diskPaths;
const cache = require('../src/cache');

describe('fetcher nested folders and default repo behavior', () => {
  const tmp = path.join(os.tmpdir(), `acp-fetcher-nested-${Date.now()}`);
  const origCwd = process.cwd();

  beforeAll(async () => {
    await fs.ensureDir(tmp);
    process.chdir(tmp);
    process.env.NODE_ENV = 'test';
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
    // Clean up acp-repos.json file from previous tests
    const baseDir = process.cwd();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    await fs.remove(repoFile).catch(() => {});
    axios.get.mockReset();
    // Clear env vars
    delete process.env.ACP_INDEX_JSON;
    delete process.env.ACP_REPOS_JSON;
    delete process.env.ACP_EXCLUDE_DEFAULT_REPO;
  });

  test('scans .github folder for prompts alongside root-level prompts', async () => {
    const testRepoConfig = [
      {
        id: 'test-repo',
        treeUrl: 'https://api.test/tree',
        rawBase: 'https://raw.test'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);

    axios.get.mockImplementation((url) => {
      if (url === 'https://api.test/tree') {
        return Promise.resolve({
          status: 200,
          data: {
            tree: [
              // Root level prompts
              { type: 'blob', path: 'prompts/root-prompt.prompt.md' },
              // .github folder prompts
              { type: 'blob', path: '.github/prompts/github-prompt.prompt.md' },
              // Root level agents
              { type: 'blob', path: 'agents/root-agent.agent.md' },
              // .github folder agents
              { type: 'blob', path: '.github/agents/github-agent.agent.md' }
            ]
          }
        });
      }
      // Mock content fetches
      if (url.includes('raw.test')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test Item"\n---\nContent'
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should find both root and .github prompts
    expect(idx.prompts).toHaveLength(2);
    const promptIds = idx.prompts.map(p => p.id).sort();
    expect(promptIds).toContain('root-prompt');
    expect(promptIds).toContain('github-prompt');

    // Should find both root and .github agents
    expect(idx.agents).toHaveLength(2);
    const agentIds = idx.agents.map(a => a.id).sort();
    expect(agentIds).toContain('root-agent');
    expect(agentIds).toContain('github-agent');
  });

  test('finds items in arbitrarily nested folder structures', async () => {
    const testRepoConfig = [
      {
        id: 'test-repo',
        treeUrl: 'https://api.test/tree',
        rawBase: 'https://raw.test'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);

    axios.get.mockImplementation((url) => {
      if (url === 'https://api.test/tree') {
        return Promise.resolve({
          status: 200,
          data: {
            tree: [
              // Various nesting levels
              { type: 'blob', path: 'prompts/p1.prompt.md' },
              { type: 'blob', path: '.github/prompts/p2.prompt.md' },
              { type: 'blob', path: 'workflows/prompts/p3.prompt.md' },
              { type: 'blob', path: 'docs/.github/prompts/p4.prompt.md' }
            ]
          }
        });
      }
      if (url.includes('raw.test')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test"\n---\nContent'
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should find all prompts regardless of nesting level
    expect(idx.prompts).toHaveLength(4);
    const promptIds = idx.prompts.map(p => p.id).sort();
    expect(promptIds).toContain('p1');
    expect(promptIds).toContain('p2');
    expect(promptIds).toContain('p3');
    expect(promptIds).toContain('p4');
  });

  test('always includes default awesome-copilot repo when ACP_REPOS_JSON is set', async () => {
    const customRepoConfig = [
      {
        id: 'custom-repo',
        treeUrl: 'https://api.test/custom',
        rawBase: 'https://raw.test/custom'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(customRepoConfig);

    axios.get.mockImplementation((url) => {
      if (url.includes('test/custom')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/custom.prompt.md' }] }
        });
      }
      if (url.includes('.com/repos/github/awesome-copilot')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/default.prompt.md' }] }
        });
      }
      if (url.includes('raw.')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test"\n---\nContent'
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should have prompts from both custom and default repos
    expect(idx.prompts.length).toBeGreaterThanOrEqual(2);
    expect(idx._repos.some(r => r.id === 'custom-repo')).toBe(true);
    expect(idx._repos.some(r => r.id === 'awesome-copilot')).toBe(true);
  });

  test('always includes default awesome-copilot repo when acp-repos.json file is used', async () => {
    const fileRepoConfig = [
      {
        id: 'file-repo',
        treeUrl: 'https://api.test/file',
        rawBase: 'https://raw.test/file'
      }
    ];
    const baseDir = process.cwd();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    await fs.writeJson(repoFile, fileRepoConfig);

    axios.get.mockImplementation((url) => {
      if (url.includes('test/file')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/file-item.prompt.md' }] }
        });
      }
      if (url.includes('.com/repos/github/awesome-copilot')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/default-item.prompt.md' }] }
        });
      }
      if (url.includes('raw.')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test"\n---\nContent'
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should have repos from both file config and default
    expect(idx._repos.some(r => r.id === 'file-repo')).toBe(true);
    expect(idx._repos.some(r => r.id === 'awesome-copilot')).toBe(true);
  });

  test('respects ACP_EXCLUDE_DEFAULT_REPO when set to "true"', async () => {
    process.env.ACP_EXCLUDE_DEFAULT_REPO = 'true';
    const customRepoConfig = [
      {
        id: 'custom-repo',
        treeUrl: 'https://api.test/custom',
        rawBase: 'https://raw.test/custom'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(customRepoConfig);

    axios.get.mockImplementation((url) => {
      if (url.includes('test/custom')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/custom.prompt.md' }] }
        });
      }
      if (url.includes('raw.test')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test"\n---\nContent'
        });
      }
      // Should not be called for awesome-copilot
      if (url.includes('.com/repos/github/awesome-copilot')) {
        return Promise.reject(new Error('Should not fetch default repo when excluded'));
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should only have custom repo, not default
    expect(idx._repos).toHaveLength(1);
    expect(idx._repos[0].id).toBe('custom-repo');
  });

  test('respects ACP_EXCLUDE_DEFAULT_REPO when set to "1"', async () => {
    process.env.ACP_EXCLUDE_DEFAULT_REPO = '1';

    axios.get.mockImplementation((url) => {
      // Default repo should not be called
      if (url.includes('.com/repos/github/awesome-copilot')) {
        return Promise.reject(new Error('Should not fetch default repo when excluded'));
      }
      // No other repos configured
      return Promise.reject(new Error('Unexpected URL'));
    });

    // Should throw an error when no repos are configured and default is excluded
    await expect(fetchIndex()).rejects.toThrow(
      'No repos configured. When ACP_EXCLUDE_DEFAULT_REPO is set, you must configure at least one repo'
    );
  });

  test('includes default repo even if already in ACP_REPOS_JSON to avoid duplicates', async () => {
    const configWithDefault = [
      {
        id: 'awesome-copilot',
        treeUrl: 'https://api.github.com/repos/github/awesome-copilot/git/trees/main?recursive=1',
        rawBase: 'https://raw.githubusercontent.com/github/awesome-copilot/main'
      },
      {
        id: 'custom-repo',
        treeUrl: 'https://api.test/custom',
        rawBase: 'https://raw.test/custom'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(configWithDefault);

    axios.get.mockImplementation((url) => {
      if (url.includes('test/custom')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/custom.prompt.md' }] }
        });
      }
      if (url.includes('.com/repos/github/awesome-copilot')) {
        return Promise.resolve({
          status: 200,
          data: { tree: [{ type: 'blob', path: 'prompts/default.prompt.md' }] }
        });
      }
      if (url.includes('raw.')) {
        return Promise.resolve({
          status: 200,
          data: '---\ntitle: "Test"\n---\nContent'
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    const idx = await fetchIndex();

    // Should have two repos (awesome-copilot and custom), not duplicates
    const repoIds = idx._repos.map(r => r.id);
    expect(repoIds.filter(id => id === 'awesome-copilot')).toHaveLength(1);
    expect(repoIds).toContain('custom-repo');
  });

  test('verbose logging shows .github folder discovery', async () => {
    const testRepoConfig = [
      {
        id: 'test-repo',
        treeUrl: 'https://api.test/tree',
        rawBase: 'https://raw.test'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);

    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));

    try {
      axios.get.mockImplementation((url) => {
        if (url === 'https://api.test/tree') {
          return Promise.resolve({
            status: 200,
            data: {
              tree: [
                { type: 'blob', path: 'prompts/root.prompt.md' },
                { type: 'blob', path: '.github/prompts/github.prompt.md' }
              ]
            }
          });
        }
        if (url.includes('raw.test')) {
          return Promise.resolve({
            status: 200,
            data: '---\ntitle: "Test"\n---\nContent'
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      await fetchIndex({ verbose: true });

      // Should show that items were found at any depth
      expect(logs.some(l => l.includes('searched at any depth'))).toBe(true);
      expect(logs.some(l => l.includes('found 2 prompts items'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('verbose logging shows default repo inclusion when ACP_REPOS_JSON is used', async () => {
    const testRepoConfig = [
      {
        id: 'test-repo',
        treeUrl: 'https://api.test/tree',
        rawBase: 'https://raw.test'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(testRepoConfig);

    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));

    try {
      axios.get.mockImplementation((url) => {
        if (url.includes('test/tree')) {
          return Promise.resolve({
            status: 200,
            data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] }
          });
        }
        if (url.includes('github.com/repos/github/awesome-copilot')) {
          return Promise.resolve({
            status: 200,
            data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] }
          });
        }
        if (url.includes('raw.')) {
          return Promise.resolve({
            status: 200,
            data: '---\ntitle: "Test"\n---\nContent'
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      await fetchIndex({ verbose: true });

      expect(logs.some(l => l.includes('including default repo: awesome-copilot'))).toBe(true);
      expect(logs.some(l => l.includes('final repos list:'))).toBe(true);
      expect(logs.some(l => l.includes('awesome-copilot'))).toBe(true);
      expect(logs.some(l => l.includes('test-repo'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('verbose logging shows default repo exclusion', async () => {
    process.env.ACP_EXCLUDE_DEFAULT_REPO = 'true';
    const customRepoConfig = [
      {
        id: 'custom-repo',
        treeUrl: 'https://api.test/custom',
        rawBase: 'https://raw.test/custom'
      }
    ];
    process.env.ACP_REPOS_JSON = JSON.stringify(customRepoConfig);

    const logs = [];
    const originalLog = console.log;
    console.log = jest.fn(msg => logs.push(msg));

    try {
      axios.get.mockImplementation((url) => {
        if (url.includes('test/custom')) {
          return Promise.resolve({
            status: 200,
            data: { tree: [{ type: 'blob', path: 'prompts/p.prompt.md' }] }
          });
        }
        if (url.includes('raw.test')) {
          return Promise.resolve({
            status: 200,
            data: '---\ntitle: "Test"\n---\nContent'
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      await fetchIndex({ verbose: true });

      expect(logs.some(l => l.includes('default repo excluded via ACP_EXCLUDE_DEFAULT_REPO'))).toBe(true);
      expect(logs.some(l => l.includes('final repos list:'))).toBe(true);
      expect(logs.filter(l => l.includes('awesome-copilot')).length).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });
});
