const prompts = require('prompts');
const { fetchIndex, diskPaths } = require('../fetcher');
const cache = require('../cache');
const { installFiles } = require('../installer');
const fs = require('fs-extra');

async function performInstall({ target, type, names, options, workspaceDir = process.cwd() } = {}) {
  // support shorthand: if first arg is a package name (not 'workspace'|'user'),
  // treat it as package-mode and default target to 'workspace'.
  const key = 'index';
  const TYPES = ['prompts','chatmodes','instructions','all'];
  const isTargetValid = (target === 'workspace' || target === 'user');
  let packageMode = false;
  if (!isTargetValid) {
    // If the caller provided a type as the first positional (e.g. `install prompts`),
    // treat it as type and default target to workspace.
    if (TYPES.includes(target)) {
      type = target;
      target = 'workspace';
    } else {
      // shift args: treat target as a package name
      packageMode = true;
      const pkgNames = [target].concat(names || []).filter(Boolean);
      names = pkgNames;
      target = 'workspace';
      // If the provided type is not one of known types, default to all
      if (!type || !TYPES.includes(type)) type = 'all';
    }
  }

  if (options && options.verbose) console.log('verbose: starting install', { target, type, names });

  const doRefresh = options && (options.refresh || options.referesh);
  if (doRefresh) {
    if (options && options.verbose) console.log('verbose: refresh requested - clearing caches');
    try { cache.del(key); } catch (e) { if (options && options.verbose) console.log('verbose: failed to clear in-memory cache', e.message); }
    try { const { DISK_CACHE_FILE } = diskPaths(); if (fs.existsSync(DISK_CACHE_FILE)) fs.removeSync(DISK_CACHE_FILE); } catch (e) { if (options && options.verbose) console.log('verbose: failed to remove disk cache', e.message); }
  }

  let index = cache.get(key);
  if (!index) {
    try {
      index = await fetchIndex();
      cache.set(key, index);
    } catch (err) {
      console.error('Error fetching index:', err.message);
      return process.exitCode = 2;
    }
  }

  const types = (type === 'all' || !type) ? ['prompts','chatmodes','instructions'] : [type];
  let anyFound = false;
  const missingNames = new Set();
  // If multiple types are being considered and names provided, resolve names across types
  let resolvedByType = null;
  if (names && names.length > 0 && types.length > 1) {
    resolvedByType = {};
    for (const tt of types) resolvedByType[tt] = [];
    const ambiguous = [];
    for (const given of names) {
      const g = (given || '').toLowerCase();
      // support repo-qualified id: <repo_id>:<file_id>
      const parts = given && given.includes(':') ? given.split(':') : null;
      const repoQualified = parts && parts.length === 2;
      // collect exact matches across types
      // collect exact matches across types, grouping by type
      const exactMatches = [];
      for (const tt of types) {
        const arr = index[tt] || [];
        for (const it of arr) {
          const id = (it.id || it.name || '').toLowerCase();
          const name = (it.name || it.id || '').toLowerCase();
          if (repoQualified) {
            const [r, fid] = parts;
            if (it.repo === r && (id === fid.toLowerCase() || name === fid.toLowerCase())) exactMatches.push({ type: tt, item: it });
          } else {
            if (id === g || name === g) exactMatches.push({ type: tt, item: it });
          }
        }
      }
      if (exactMatches.length > 0) {
        // Group matches by type. It's acceptable to have one match per type (e.g., same id in prompts and chatmodes).
        const byType = new Map();
        for (const m of exactMatches) {
          const arr = byType.get(m.type) || [];
          arr.push(m.item);
          byType.set(m.type, arr);
        }
        // If any single type has multiple exact matches, treat as ambiguous
        let localAmbiguous = false;
        for (const [tt, arr] of byType.entries()) {
          if (arr.length > 1) {
            ambiguous.push({ given, matches: arr.map(i => ({ type: tt, id: i.id, name: i.name })) });
            localAmbiguous = true;
          }
        }
        if (localAmbiguous) continue;
        // Otherwise accept the single match for each type
        for (const [tt, arr] of byType.entries()) {
          resolvedByType[tt].push(arr[0]);
        }
        continue;
      }
      // no exact matches; try startsWith across types
      const startsMatches = [];
      for (const tt of types) {
        const arr = index[tt] || [];
        for (const it of arr) {
          const id = (it.id || it.name || '').toLowerCase();
          const name = (it.name || it.id || '').toLowerCase();
          if (repoQualified) {
            const [r, fid] = parts;
            if (it.repo === r && (id.startsWith(fid.toLowerCase()) || name.startsWith(fid.toLowerCase()))) startsMatches.push({ type: tt, item: it });
          } else {
            if (id.startsWith(g) || name.startsWith(g)) startsMatches.push({ type: tt, item: it });
          }
        }
      }
      if (startsMatches.length === 1) {
        const m = startsMatches[0];
        resolvedByType[m.type].push(m.item);
        continue;
      }
      if (startsMatches.length > 1) {
        ambiguous.push({ given, matches: startsMatches.map(m => ({ type: m.type, id: m.item.id, name: m.item.name })) });
        continue;
      }
  // no matches at all - record missing name
  missingNames.add(given);
    }

    if (ambiguous.length > 0) {
      for (const a of ambiguous) {
        console.error(`Ambiguous name '${a.given}' matched multiple items:`);
        for (const m of a.matches) console.error(` - ${m.type}: ${m.id} (${m.name || ''})`);
      }
      return process.exitCode = 2;
    }
    if (missingNames.size > 0) {
      console.error(`No items found for: ${Array.from(missingNames).join(', ')}`);
    }
  }
  for (const t of types) {
    let items = index[t] || [];
    if (resolvedByType) {
      // use resolved items for this type (possibly empty array)
      items = resolvedByType[t] || [];
    } else if (names && names.length > 0) {
      // Resolve names to items using exact match first; if none, use startsWith match
      const resolved = [];
      const ambiguous = [];
      for (const given of names) {
        const g = (given || '').toLowerCase();
        const parts = given && given.includes(':') ? given.split(':') : null;
        const repoQualified = parts && parts.length === 2;
        const exact = items.filter(it => {
          const id = (it.id || it.name || '').toLowerCase();
          const name = (it.name || it.id || '').toLowerCase();
          if (repoQualified) {
            const [r, fid] = parts;
            return it.repo === r && (id === fid.toLowerCase() || name === fid.toLowerCase());
          }
          return id === g || name === g;
        });
        if (exact.length === 1) {
          resolved.push(exact[0]);
          continue;
        }
        if (exact.length > 1) {
          ambiguous.push({ given, matches: exact });
          continue;
        }
        // no exact matches; try startsWith
        const starts = items.filter(it => {
          const id = (it.id || it.name || '').toLowerCase();
          const name = (it.name || it.id || '').toLowerCase();
          if (repoQualified) {
            const [r, fid] = parts;
            return it.repo === r && (id.startsWith(fid.toLowerCase()) || name.startsWith(fid.toLowerCase()));
          }
          return id.startsWith(g) || name.startsWith(g);
        });
        if (starts.length === 1) {
          resolved.push(starts[0]);
          continue;
        }
        if (starts.length > 1) {
          ambiguous.push({ given, matches: starts });
          continue;
        }
        // no matches at all - record missing name
        missingNames.add(given);
      }

      if (ambiguous.length > 0) {
        for (const a of ambiguous) {
          console.error(`Ambiguous name '${a.given}' matched multiple items:`);
          for (const m of a.matches) console.error(` - ${m.id} (${m.name || ''})`);
        }
        // Do not proceed with ambiguous installs
        return process.exitCode = 2;
      }

      // dedupe resolved items by id
      const byId = new Map();
      for (const r of resolved) byId.set(r.id || r.name, r);
      items = Array.from(byId.values());
    }
      if (items.length === 0) {
      if (!packageMode) console.log(`No items found for type ${t}`);
       continue;
     }

    anyFound = true;

    if (options && options['dry-run']) {
      console.log(`[dry-run] Would install ${items.length} ${t}:`);
      for (const it of items) console.log(` - ${it.name || it.id}`);
      continue;
    }

  // If no specific names requested and the type is chatmodes, prompts, or instructions, confirm installing all
  if ((!names || names.length === 0) && (t === 'chatmodes' || t === 'prompts' || t === 'instructions')) {
      // When running non-interactively (no TTY), auto-confirm so CI/tests proceed
      const nonInteractive = !(process.stdin && process.stdin.isTTY);
      if (!nonInteractive) {
        const resp = await prompts({ type: 'confirm', name: 'ok', message: `Install all ${items.length} ${t}?`, initial: false });
        if (!resp.ok) {
          console.log('Skipped by user');
          continue;
        }
      } else {
        if (options && options.verbose) console.log('verbose: non-interactive mode - auto-confirming install of all items');
      }
    }

    try {
  const dest = await installFiles({ items, type: t, target, workspaceDir });
      console.log(`Installed ${items.length} ${t} to ${dest}`);
      if (options && options.verbose) console.log('verbose: installed items', items.map(i => i.id || i.name));
    } catch (err) {
      console.error(`Failed to install ${t}:`, err.message || err);
    }
  }

  if (packageMode && !anyFound) {
    console.error(`Package(s) ${names && names.length ? names.join(', ') : ''} not found in index.`);
    return process.exitCode = 2;
  }
}

function installCommand(cli) {
  // Change signature so that names are variadic and type is provided via option to
  // avoid the ambiguity where the second positional arg would be parsed as `type`.
  cli.command('install <target> [names...]', 'Install items into workspace or user profile. target: workspace|user. type: prompts|chatmodes|instructions|all')
  .option('-t, --type <type>', 'Specify type: prompts|chatmodes|instructions|all')
  // Note: --refresh is intentionally not a per-command option for install; use only with list/search
  .option('--referesh', "Alias for --refresh (typo alias)")
    .option('--dry-run', 'Show what would be installed without writing files')
    .action(async (target, names, options) => {
      // names may be undefined or an array. Support legacy positional type in case
      // the user still passed it as the first name (e.g. `install workspace prompts p1`).
      const TYPES = ['prompts','chatmodes','instructions','all'];
      let type = options.type;
      // Normalize names to an array. Some CLI parsers may provide a single
      // name as a string instead of a one-element array. Preserve values.
      let nm;
      if (names === undefined || names === null) nm = [];
      else if (Array.isArray(names)) nm = names.slice();
      else nm = [names];
      if (!type && nm.length > 0 && TYPES.includes(nm[0])) {
        type = nm.shift();
      }
      await performInstall({ target, type, names: nm, options, workspaceDir: process.cwd() });
    });
}

module.exports = { installCommand, performInstall };
