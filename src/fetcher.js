const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const cache = require('./cache');

// Helper to consistently decide where to store user-level data. In
// development and test environments prefer process.cwd() for predictable
// local workflows; otherwise use the user's homedir under ~/.acp.
function getBaseDir() {
  return (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    ? process.cwd()
    : path.join(os.homedir(), '.acp');
}

// Default single upstream repo for backwards compatibility
const DEFAULT_REPOS = [
  {
    id: 'awesome-copilot',
    treeUrl: 'https://api.github.com/repos/github/awesome-copilot/git/trees/main?recursive=1',
    rawBase: 'https://raw.githubusercontent.com/github/awesome-copilot/main'
  }
];

function diskPaths() {
  // In development and tests keep the old behavior (cwd) to avoid surprising
  // local workflows and test expectations. Otherwise store cache under the
  // user's home directory in ~/.acp/cache/index.json
  const baseDir = getBaseDir();
  const DISK_CACHE_DIR = path.join(baseDir, 'cache');
  const DISK_CACHE_FILE = path.join(DISK_CACHE_DIR, 'index.json');
  return { DISK_CACHE_DIR, DISK_CACHE_FILE };
}

async function readDiskCache() {
  try {
    const { DISK_CACHE_FILE } = diskPaths();
    if (!(await fs.pathExists(DISK_CACHE_FILE))) return null;
    const data = await fs.readJson(DISK_CACHE_FILE);
    // data: { ts: number, payload: any }
    return data;
  } catch (err) {
    return null;
  }
}

async function writeDiskCache(payload) {
  try {
    const { DISK_CACHE_DIR, DISK_CACHE_FILE } = diskPaths();
    await fs.ensureDir(DISK_CACHE_DIR);
    await fs.writeJson(DISK_CACHE_FILE, { ts: Date.now(), payload }, { spaces: 2 });
  } catch (err) {
    // ignore disk cache write failures
  }
}

async function fetchIndex() {
  // Allow injecting a full index via env for tests or offline usage
  if (process.env.ACP_INDEX_JSON) {
    try {
      const parsed = JSON.parse(process.env.ACP_INDEX_JSON);
      const key = 'index';
      cache.set(key, parsed);
      // also write disk cache for consistency
      await writeDiskCache(parsed);
      return parsed;
    } catch (err) {
      // fall through to normal fetch
    }
  }

  const key = 'index';
  // in-memory cache
  let idx = cache.get(key);
  if (idx) return idx;

  // disk cache
  const disk = await readDiskCache();
  if (disk) {
    const age = (Date.now() - disk.ts) / 1000;
    if (age < cache.CACHE_TTL_SECONDS) {
      cache.set(key, disk.payload);
      return disk.payload;
    }
  }

  // Build repos list from env, file, or default
  let repos = DEFAULT_REPOS;
  if (process.env.ACP_REPOS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ACP_REPOS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) repos = parsed;
    } catch (e) {
      // ignore malformed env var and fall back to defaults
    }
  } else {
    // Try reading acp-repos.json from the user acp dir. Respect NODE_ENV handling
      try {
      const baseDir = getBaseDir();
      const repoFile = path.join(baseDir, 'acp-repos.json');
      if (await fs.pathExists(repoFile)) {
        const fileContents = await fs.readJson(repoFile);
        if (Array.isArray(fileContents) && fileContents.length > 0) repos = fileContents;
      }
    } catch (e) {
      // ignore file read/parse errors and fall back to defaults
    }
  }

  // Helper to parse frontmatter title from file content
  const parseFrontmatterTitle = txt => {
    if (!txt || typeof txt !== 'string') return null;
    if (!txt.startsWith('---')) return null;
    const end = txt.indexOf('\n---', 3);
    if (end === -1) return null;
    const block = txt.substring(3, end).trim();
    const lines = block.split(/\r?\n/);
    for (const ln of lines) {
      const m = ln.match(/^title:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/i);
      if (m) return (m[1] || m[2] || m[3] || '').trim();
    }
    return null;
  };

  // fetch each repo's tree and build combined index
  try {
    const combined = { prompts: [], chatmodes: [], instructions: [] };
    for (const repo of repos) {
      if (!repo || !repo.treeUrl) continue;
      let res = null;
      try {
        res = await axios.get(repo.treeUrl, {
          timeout: 10000,
          headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'acp-vscode-cli' }
        });
      } catch (e) {
        // skip this repo if we can't fetch its tree
        continue;
      }
      if (!res || res.status !== 200 || !res.data) continue;
      // If the remote returned a pre-built index object (prompts/chatmodes/instructions),
      // honor it and return immediately (backwards compatibility + tests).
      if (!Array.isArray(res.data.tree) && (res.data.prompts || res.data.chatmodes || res.data.instructions)) {
        // Remote returned a pre-built index object. Return it unmodified for
        // backwards compatibility and tests which expect the exact shape.
        idx = res.data;
        cache.set(key, idx);
        await writeDiskCache(idx);
        return idx;
      }
      if (!Array.isArray(res.data.tree)) continue;
      const tree = res.data.tree.filter(t => t.type === 'blob');

      const makeEntriesForRepo = async prefix => {
        const matches = tree.filter(t => t.path.startsWith(`${prefix}/`));
        const parts = await Promise.all(matches.map(async t => {
          const file = path.basename(t.path);
          const base = file.replace(/\.prompt\.md$|\.chatmode\.md$|\.instructions?\.md$/i, '').replace(/\.md$/i, '');
          const id = base;
          let name = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const rawBase = (repo.rawBase || repo.url || '').replace(/\/$/, '');
          const url = rawBase ? `${rawBase}/${t.path}` : null;
          if (url) {
            try {
              const r = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'acp-vscode-cli' } });
              const title = parseFrontmatterTitle(r.data);
              if (title) name = title;
            } catch (e) {
              // ignore per-file fetch failures; keep fallback name
            }
          }
          return { id, name, path: t.path, url, repo: repo.id };
        }));
        return parts;
      };

      combined.prompts.push(...(await makeEntriesForRepo('prompts')));
      combined.chatmodes.push(...(await makeEntriesForRepo('chatmodes')));
      combined.instructions.push(...(await makeEntriesForRepo('instructions')));
    }

    // detect id conflicts across repos
    const idCounts = new Map();
    for (const cat of ['prompts','chatmodes','instructions']) {
      for (const it of combined[cat]) {
        const k = it.id || it.name || '';
        if (!k) continue;
        idCounts.set(k, (idCounts.get(k) || 0) + 1);
      }
    }
    const conflicts = [];
    for (const [key, cnt] of idCounts.entries()) {
      if (cnt > 1) conflicts.push(key);
    }

  // If combined result is empty (no items found for any repo) and we have
  // a stale disk cache, prefer returning the disk payload as a fallback.
  const totalItems = combined.prompts.length + combined.chatmodes.length + combined.instructions.length;
  if (totalItems === 0 && disk && disk.payload) return disk.payload;

  idx = combined;
  idx._repos = repos.map(r => ({ id: r.id, treeUrl: r.treeUrl, rawBase: r.rawBase || r.url }));
  idx._conflicts = conflicts;
  cache.set(key, idx);
  await writeDiskCache(idx);
  return idx;
  } catch (err) {
    // If fetch fails but disk cache exists return stale payload as fallback
    if (disk && disk.payload) return disk.payload;
    const e = new Error(`Failed to fetch index from repos: ${err.message}`);
    e.cause = err;
    throw e;
  }
}

module.exports = { fetchIndex, diskPaths };
