function completionCommand(cli) {
  cli.command('completion [shell]', 'Print shell completion script (bash or zsh)')
    .action((shell = 'bash') => {
      const name = 'acp-vscode';
      if (shell === 'zsh') {
        console.log(`# Add the following to your .zshrc to enable completion for ${name}\n_comp_${name}() {\n  local -a cmds\n  cmds=(install list search uninstall completion)\n  _arguments '*: :->cmd' && return 0\n}\ncompdef _comp_${name} ${name}`);
        return;
      }
      // default bash - use simple completion list (user may adapt for real context)
      console.log(`# Bash completion for ${name}\n_${name}() {\n  local cur=${'$'}{COMP_WORDS[1]}\n  COMPREPLY=( $(compgen -W "install list search uninstall completion" -- "${'$'}{cur}") )\n}\ncomplete -F _${name} ${name}`);
    });
}

module.exports = { completionCommand };
