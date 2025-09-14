const { fetchIndex, diskPaths } = require('../fetcher');
const cache = require('../cache');
const fs = require('fs-extra');
const { formatListLines, visibleLines } = require('./list');

function searchCommand(cli) {
  cli.command('search <query>', 'Search prompts, chatmodes, instructions')
    .option('-r, --refresh', 'Clear caches and force refresh from remote')
    .option('-j, --json', 'Emit machine-readable JSON output')
    .action(async (query, options) => {
      const key = 'index';
      if (options && options.verbose) console.log('verbose: loading index (search)');
      if (options && options.refresh) {
        if (options && options.verbose) console.log('verbose: refresh requested - clearing caches');
        try {
          cache.del(key);
        } catch (e) {
          if (options && options.verbose) console.log('verbose: failed to clear in-memory cache', e.message);
        }
        try {
          const { DISK_CACHE_FILE } = diskPaths();
          if (fs.existsSync(DISK_CACHE_FILE)) fs.removeSync(DISK_CACHE_FILE);
        } catch (e) {
          if (options && options.verbose) console.log('verbose: failed to remove disk cache', e.message);
        }
      }
      let index = cache.get(key);
      if (!index) {
        try {
          index = await fetchIndex();
          cache.set(key, index);
        } catch (err) {
          console.error('Failed to load index:', err.message);
          console.error('You can run with ACP_INDEX_JSON to inject a local index or check network connectivity.');
          return process.exitCode = 2;
        }
      }
      const q = query.toLowerCase();
      const results = [];
      ['prompts','chatmodes','instructions'].forEach(cat => {
        const arr = index[cat] || [];
        arr.forEach(item => {
          const name = (item.name || item.id || '').toLowerCase();
          if (name.includes(q) || JSON.stringify(item).toLowerCase().includes(q)) {
            const rawId = item.id || item.name;
            const conflicts = (index && index._conflicts) ? new Set(index._conflicts) : new Set();
            const id = (conflicts.has(rawId) && item.repo) ? `${item.repo}:${rawId}` : rawId;
            const res = { type: cat.slice(0,-1), id, name: item.name };
            if (options && options.verbose) console.log('verbose: match', res);
            results.push(res);
          }
        });
      });
  // Use the same aligned column formatter as the list command so search
  // output includes headers and consistent column widths.
  if (options && options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    let lines = formatListLines(results);
    lines = visibleLines(lines);
    console.log(lines.join('\n'));
  }
    });
}

function searchIndex(index, query) {
  const q = query.toLowerCase();
  const results = [];
  ['prompts','chatmodes','instructions'].forEach(cat => {
    const arr = index[cat] || [];
    arr.forEach(item => {
      const name = (item.name || item.id || '').toLowerCase();
      if (name.includes(q) || JSON.stringify(item).toLowerCase().includes(q)) {
        const rawId = item.id || item.name;
        const conflicts = (index && index._conflicts) ? new Set(index._conflicts) : new Set();
        const id = (conflicts.has(rawId) && item.repo) ? `${item.repo}:${rawId}` : rawId;
        results.push({ type: cat.slice(0,-1), id, name: item.name });
      }
    });
  });
  return results;
}

module.exports = { searchCommand, searchIndex };
