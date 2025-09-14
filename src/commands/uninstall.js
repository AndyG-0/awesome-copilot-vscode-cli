const prompts = require('prompts');
const cache = require('../cache');
const { fetchIndex, diskPaths } = require('../fetcher');
const fs = require('fs-extra');
const { removeFiles } = require('../installer');

function uninstallCommand(cli) {
  cli.command('uninstall <target> <type> [names...]', 'Uninstall files from workspace or user profile')
    // Note: --refresh is not a per-command option for uninstall; refresh applies only to list/search
    .option('--yes', "Don't prompt for confirmation")
    .action(async (target, type, names, options) => {
      const workspaceDir = process.cwd();
      if (options && options.verbose) console.log('verbose: starting uninstall', { target, type, names });
      const key = 'index';
      if (options && options.refresh) {
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

      const toRemove = names && names.length > 0 ? names : [];
      if (toRemove.length === 0) {
        console.log('No names provided; nothing to remove.');
        return;
      }

      if (target === 'user' && !options.yes) {
        const resp = await prompts({ type: 'confirm', name: 'ok', message: `Remove ${toRemove.length} ${type} from VS Code user profile?`, initial: false });
        if (!resp.ok) {
          console.log('Aborted by user');
          return;
        }
      }

      try {
        const removed = await removeFiles({ names: toRemove, type, target, workspaceDir });
        console.log(`Removed ${removed} files from ${target} (${type})`);
        if (options && options.verbose) console.log('verbose: removed files count', removed);
      } catch (err) {
        console.error('Failed to remove files:', err.message || err);
      }
    });
}

module.exports = { uninstallCommand };
