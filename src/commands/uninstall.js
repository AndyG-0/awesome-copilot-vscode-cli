const prompts = require('prompts');
const { removeFiles } = require('../installer');

function uninstallCommand(cli) {
  cli.command('uninstall <target> <type> [names...]', 'Uninstall files from workspace or user profile')
    // Note: --refresh is not a per-command option for uninstall; refresh applies only to list/search
    .option('--yes', "Don't prompt for confirmation")
    .action(async (target, type, names, options) => {
      const workspaceDir = process.cwd();
      if (options && options.verbose) console.log('verbose: starting uninstall', { target, type, names });

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
