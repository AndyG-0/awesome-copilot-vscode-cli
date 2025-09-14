#!/usr/bin/env node
const cac = require('cac');
const { installCommand } = require('../src/commands/install');
const { listCommand } = require('../src/commands/list');
const { searchCommand } = require('../src/commands/search');
const { uninstallCommand } = require('../src/commands/uninstall');
const { completionCommand } = require('../src/commands/completion');
const { version } = require('../package.json');

const cli = cac('acp-vscode');
cli.version(version);
// global verbose option
cli.option('--verbose', 'Enable verbose logging');
// global refresh option (note: only applies to `list` and `search` commands)
cli.option('--refresh', 'Clear caches and force refresh from remote (applies only to list and search)');

installCommand(cli);
listCommand(cli);
searchCommand(cli);
uninstallCommand(cli);
completionCommand(cli);

cli.help();

try {
	// Simple top-level unknown flag detection: when no command is given and the first
	// arg is a flag we don't recognize, print a friendly message. This helps catch
	// typos like `--no-such-option`.
	const argv = process.argv.slice(2);
	const knownTopLevel = new Set(['--help', '-h', '--version', '-V', '--verbose', '-v', '--refresh']);
	if (argv.length > 0 && argv[0].startsWith('-') && !knownTopLevel.has(argv[0])) {
		console.error(`Unknown option: ${argv[0]}`);
		console.error('Run `acp-vscode --help` to see available commands and options.');
		process.exit(2);
	}

	cli.parse();
} catch (err) {
	console.error('Error:', err.message);
	console.error('Run `acp-vscode --help` to see available commands and options.');
	process.exitCode = 2;
}
