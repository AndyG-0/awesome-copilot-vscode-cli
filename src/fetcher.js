const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const cache = require('./cache');

// Helper to log messages in verbose mode
function log(message, verbose) {
  if (verbose) console.log(`verbose: ${message}`);
}

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

async function readDiskCache(verbose) {
  try {
    const { DISK_CACHE_FILE } = diskPaths();
    if (!(await fs.pathExists(DISK_CACHE_FILE))) {
      log('disk cache file does not exist', verbose);
      return null;
    }
    log('reading disk cache from ' + DISK_CACHE_FILE, verbose);
    const data = await fs.readJson(DISK_CACHE_FILE);
    // data: { ts: number, payload: any }
    log('disk cache read successfully', verbose);
    return data;
  } catch (err) {
    log('failed to read disk cache: ' + err.message, verbose);
    return null;
  }
}

async function writeDiskCache(payload, verbose) {
  try {
    const { DISK_CACHE_DIR, DISK_CACHE_FILE } = diskPaths();
    await fs.ensureDir(DISK_CACHE_DIR);
    await fs.writeJson(DISK_CACHE_FILE, { ts: Date.now(), payload }, { spaces: 2 });
    log('disk cache written to ' + DISK_CACHE_FILE, verbose);
  } catch (err) {
    log('failed to write disk cache: ' + err.message, verbose);
  }
}


async function fetchIndex(options) {
  const verbose = options && options.verbose;
  log('fetchIndex called', verbose);
  
  // Allow injecting a full index via env for tests or offline usage
  if (process.env.ACP_INDEX_JSON) {
    log('ACP_INDEX_JSON environment variable detected', verbose);
    try {
      const parsed = JSON.parse(process.env.ACP_INDEX_JSON);
      log('successfully parsed ACP_INDEX_JSON', verbose);
      const key = 'index';
      cache.set(key, parsed);
      // also write disk cache for consistency
      await writeDiskCache(parsed, verbose);
      return parsed;
    } catch (err) {
      log('failed to parse ACP_INDEX_JSON: ' + err.message, verbose);
      // fall through to normal fetch
    }
  }

  const key = 'index';
  // in-memory cache
  let idx = cache.get(key);
  if (idx) {
    log('using in-memory cache', verbose);
    return idx;
  }

  // disk cache
  const disk = await readDiskCache(verbose);
  if (disk) {
    const age = (Date.now() - disk.ts) / 1000;
    const ttl = cache.CACHE_TTL_SECONDS;
    if (age < ttl) {
      log('using fresh disk cache (age: ' + Math.round(age) + 's, ttl: ' + ttl + 's)', verbose);
      cache.set(key, disk.payload);
      return disk.payload;
    } else {
      log('disk cache is stale (age: ' + Math.round(age) + 's, ttl: ' + ttl + 's)', verbose);
    }
  }

  // Build repos list from env, file, or default
  let repos = [];
  let configuredRepos = [];
  
  // Load from ACP_REPOS_JSON if set
  if (process.env.ACP_REPOS_JSON) {
    log('ACP_REPOS_JSON environment variable detected', verbose);
    try {
      const parsed = JSON.parse(process.env.ACP_REPOS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        log('successfully parsed ACP_REPOS_JSON with ' + parsed.length + ' repo(s)', verbose);
        configuredRepos.push(...parsed);
        log('using repos from ACP_REPOS_JSON: ' + parsed.map(r => r.id).join(', '), verbose);
      } else {
        log('ACP_REPOS_JSON is not a non-empty array', verbose);
      }
    } catch (e) {
      log('failed to parse ACP_REPOS_JSON: ' + e.message, verbose);
    }
  } else {
    // Try reading acp-repos.json from the user acp dir. Respect NODE_ENV handling
    const baseDir = getBaseDir();
    const repoFile = path.join(baseDir, 'acp-repos.json');
    log('checking for acp-repos.json at ' + repoFile, verbose);
    try {
      if (await fs.pathExists(repoFile)) {
        log('acp-repos.json found, reading...', verbose);
        const fileContents = await fs.readJson(repoFile);
        if (Array.isArray(fileContents) && fileContents.length > 0) {
          log('successfully loaded ' + fileContents.length + ' repo(s) from acp-repos.json', verbose);
          configuredRepos.push(...fileContents);
          log('using repos from acp-repos.json: ' + fileContents.map(r => r.id).join(', '), verbose);
        } else {
          log('acp-repos.json is not a non-empty array', verbose);
        }
      } else {
        log('acp-repos.json not found', verbose);
      }
    } catch (e) {
      log('failed to read acp-repos.json: ' + e.message, verbose);
    }
  }
  
  // Always include the default repo unless explicitly disabled
  const excludeDefault = process.env.ACP_EXCLUDE_DEFAULT_REPO === 'true' || process.env.ACP_EXCLUDE_DEFAULT_REPO === '1';
  if (!excludeDefault) {
    log('including default repo: awesome-copilot', verbose);
    // Add default repo if not already present
    const hasDefault = configuredRepos.some(r => r.id === 'awesome-copilot');
    if (!hasDefault) {
      repos.push(DEFAULT_REPOS[0]);
    } else {
      log('default repo already included in configured repos', verbose);
      repos.push(...configuredRepos);
      configuredRepos = [];
    }
  } else {
    log('default repo excluded via ACP_EXCLUDE_DEFAULT_REPO', verbose);
  }
  
  // Add configured repos
  repos.push(...configuredRepos);
  
  if (repos.length === 0) {
    if (excludeDefault) {
      const err = new Error(
        'No repos configured. When ACP_EXCLUDE_DEFAULT_REPO is set, you must configure at least one repo ' +
        'via ACP_REPOS_JSON environment variable or acp-repos.json file.'
      );
      throw err;
    }
    log('no repos configured, using default repos', verbose);
    repos = DEFAULT_REPOS;
  }
  log('final repos list: ' + repos.map(r => r.id).join(', ') + ' (' + repos.length + ' total)', verbose);

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
    log('fetching repos...', verbose);
    const combined = { prompts: [], chatmodes: [], agents: [], instructions: [], skills: [] };
    for (const repo of repos) {
      if (!repo || !repo.treeUrl) {
        log('skipping invalid repo entry', verbose);
        continue;
      }
      log('fetching tree for repo: ' + repo.id, verbose);
      let res = null;
      try {
        res = await axios.get(repo.treeUrl, {
          timeout: 10000,
          headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'acp-vscode-cli' }
        });
        log('successfully fetched tree for repo: ' + repo.id + ' (' + (res.data.tree ? res.data.tree.length : 0) + ' items)', verbose);
      } catch (e) {
        log('failed to fetch tree for repo ' + repo.id + ': ' + e.message, verbose);
        // skip this repo if we can't fetch its tree
        continue;
      }
      if (!res || res.status !== 200 || !res.data) {
        log('invalid response from repo ' + repo.id + ', skipping', verbose);
        continue;
      }
      // If the remote returned a pre-built index object (prompts/chatmodes/agents/instructions/skills),
      // honor it and return immediately (backwards compatibility + tests).
      if (!Array.isArray(res.data.tree) && (res.data.prompts || res.data.chatmodes || res.data.agents || res.data.instructions || res.data.skills)) {
        // Remote returned a pre-built index object. Return it unmodified for
        // backwards compatibility and tests which expect the exact shape.
        log('repo ' + repo.id + ' returned pre-built index, using it directly', verbose);
        idx = res.data;
        cache.set(key, idx);
        await writeDiskCache(idx, verbose);
        return idx;
      }
      if (!Array.isArray(res.data.tree)) {
        log('repo ' + repo.id + ' response does not contain tree array, skipping', verbose);
        continue;
      }
      const tree = res.data.tree.filter(t => t.type === 'blob');
      log('repo ' + repo.id + ' has ' + tree.length + ' blob items', verbose);

      const makeEntriesForRepo = async prefix => {
        // Match category folders at any depth: e.g., "prompts/", ".github/prompts/", etc.
        const prefixRegex = new RegExp(`(^|/)${prefix}/`);
        const matches = tree.filter(t => prefixRegex.test(t.path));
        log('repo ' + repo.id + ': found ' + matches.length + ' ' + prefix + ' items (searched at any depth)', verbose);
        const parts = await Promise.all(matches.map(async t => {
          const file = path.basename(t.path);
          const base = file.replace(/\.prompt\.md$|\.chatmode\.md$|\.agent\.md$|\.instructions?\.md$/i, '').replace(/\.md$/i, '');
          const id = base;
          let name = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const rawBase = (repo.rawBase || repo.url || '').replace(/\/$/, '');
          const url = rawBase ? `${rawBase}/${t.path}` : null;
          if (url) {
            try {
              const r = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'acp-vscode-cli' } });
              const title = parseFrontmatterTitle(r.data);
              if (title) {
                log('loaded title for ' + prefix + '/' + id + ': ' + title, verbose);
                name = title;
              }
            } catch (e) {
              log('failed to fetch content for ' + prefix + '/' + id + ': ' + e.message, verbose);
              // ignore per-file fetch failures; keep fallback name
            }
          }
          return { id, name, path: t.path, url, repo: repo.id };
        }));
        return parts;
      };

      combined.prompts.push(...(await makeEntriesForRepo('prompts')));
      combined.chatmodes.push(...(await makeEntriesForRepo('chatmodes')));
      combined.agents.push(...(await makeEntriesForRepo('agents')));
      combined.instructions.push(...(await makeEntriesForRepo('instructions')));
      combined.skills.push(...(await makeEntriesForRepo('skills')));
    }

    // detect id conflicts across repos
    log('detecting conflicts across repos...', verbose);
    const idCounts = new Map();
    for (const cat of ['prompts','chatmodes','agents','instructions','skills']) {
      for (const it of combined[cat]) {
        const k = it.id || it.name || '';
        if (!k) continue;
        idCounts.set(k, (idCounts.get(k) || 0) + 1);
      }
    }
    const conflicts = [];
    for (const [key, cnt] of idCounts.entries()) {
      if (cnt > 1) {
        conflicts.push(key);
        log('conflict detected: ' + key + ' appears ' + cnt + ' times', verbose);
      }
    }
    if (conflicts.length === 0) {
      log('no conflicts detected', verbose);
    }

  // If combined result is empty (no items found for any repo) and we have
  // a stale disk cache, prefer returning the disk payload as a fallback.
  const totalItems = combined.prompts.length + combined.chatmodes.length + combined.agents.length + combined.instructions.length + combined.skills.length;
  log('combined index contains: ' + totalItems + ' items (prompts: ' + combined.prompts.length + ', chatmodes: ' + combined.chatmodes.length + ', agents: ' + combined.agents.length + ', instructions: ' + combined.instructions.length + ', skills: ' + combined.skills.length + ')', verbose);
  if (totalItems === 0 && disk && disk.payload) {
    log('combined index is empty and stale disk cache exists, using stale cache as fallback', verbose);
    return disk.payload;
  }

  idx = combined;
  idx._repos = repos.map(r => ({ id: r.id, treeUrl: r.treeUrl, rawBase: r.rawBase || r.url }));
  idx._conflicts = conflicts;
  cache.set(key, idx);
  await writeDiskCache(idx, verbose);
  log('index successfully built and cached', verbose);
  return idx;
  } catch (err) {
    log('error during repo fetching: ' + err.message, verbose);
    // If fetch fails but disk cache exists return stale payload as fallback
    if (disk && disk.payload) {
      log('using stale disk cache as fallback due to fetch error', verbose);
      return disk.payload;
    }
    const e = new Error(`Failed to fetch index from repos: ${err.message}`);
    e.cause = err;
    throw e;
  }
}

async function cacheExists() {
  try {
    const { DISK_CACHE_FILE } = diskPaths();
    return await fs.pathExists(DISK_CACHE_FILE);
  } catch (e) {
    return false;
  }
}

module.exports = { fetchIndex, diskPaths, cacheExists };
