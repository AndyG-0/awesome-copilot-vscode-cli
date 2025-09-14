const fs = require('fs-extra');
const path = require('path');
const os = require('os');

function getVsCodeUserDir() {
  const platform = os.platform();
  // prefer explicit HOME env when set (tests override HOME)
  const home = process.env.HOME || os.homedir();
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Code', 'User');
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
  }
  // linux
  return path.join(home, '.config', 'Code', 'User');
}

async function installFiles({ items, type, target, workspaceDir }) {
  // type: prompts|chatmodes|instructions
  // Helper to derive filename and extension
  const extForType = t => {
    if (t === 'chatmodes') return '.chatmode.md';
    if (t === 'instructions' || t === 'instruction') return '.instructions.md';
    return '.prompt.md';
  };

  const fetchRawIfNeeded = async item => {
    if (item.content) return item.content;
    if (item.url) {
      try {
        const r = await require('axios').get(item.url, { timeout: 10000, headers: { 'User-Agent': 'acp-vscode-cli' } });
        return r.data;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  if (target === 'workspace') {
    const base = path.join(workspaceDir, '.github', type);
    await fs.ensureDir(base);
    // detect duplicate ids so we can disambiguate filenames by prefixing
    const idCounts = items.reduce((m, it) => { const k = it.id || it.name || ''; m[k] = (m[k] || 0) + 1; return m; }, {});
    for (const item of items) {
      let filenameBase = item.id || item.name || `item-${Date.now()}`;
      if (idCounts[filenameBase] > 1 && item.repo) {
        // prefix with repo to avoid overwriting files when multiple repos have the same id
        filenameBase = `${item.repo}-${filenameBase}`;
      }
      const destName = `${filenameBase}${extForType(type)}`;
      const dest = path.join(base, destName);
      let content = await fetchRawIfNeeded(item) || item.content || JSON.stringify(item, null, 2);
      if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
      await fs.writeFile(dest, content, 'utf8');
    }
    return base;
  }

  // user target: write into VS Code User prompts folder if prompts, otherwise create structure under VS Code User/.github
  const userDir = getVsCodeUserDir();
  if (type === 'prompts') {
    const base = path.join(userDir, 'prompts');
    await fs.ensureDir(base);
    const idCounts = items.reduce((m, it) => { const k = it.id || it.name || ''; m[k] = (m[k] || 0) + 1; return m; }, {});
    for (const item of items) {
      let filenameBase = item.id || item.name || `item-${Date.now()}`;
      if (idCounts[filenameBase] > 1 && item.repo) filenameBase = `${item.repo}-${filenameBase}`;
      const destName = `${filenameBase}${extForType(type)}`;
      const dest = path.join(base, destName);
      let content = await fetchRawIfNeeded(item) || item.content || JSON.stringify(item, null, 2);
      if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
      await fs.writeFile(dest, content, 'utf8');
    }
    return base;
  }

  // For other types, create .github subfolder in userDir
  const base = path.join(userDir, '.github', type);
  await fs.ensureDir(base);
  // detect duplicates among items to avoid overwriting
  const idCounts = items.reduce((m, it) => { const k = it.id || it.name || ''; m[k] = (m[k] || 0) + 1; return m; }, {});
  for (const item of items) {
    let filenameBase = item.id || item.name || `item-${Date.now()}`;
    if (idCounts[filenameBase] > 1 && item.repo) filenameBase = `${item.repo}-${filenameBase}`;
    const destName = `${filenameBase}${extForType(type)}`;
    const dest = path.join(base, destName);
    let content = await fetchRawIfNeeded(item) || item.content || JSON.stringify(item, null, 2);
    if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
    await fs.writeFile(dest, content, 'utf8');
  }
  return base;
}

async function removeFiles({ names, type, target, workspaceDir }) {
  // remove files by id or name from the target
  if (target === 'workspace') {
    const base = path.join(workspaceDir, '.github', type);
    if (!(await fs.pathExists(base))) return 0;
    const files = await fs.readdir(base);
    let removed = 0;
    for (const f of files) {
      const p = path.join(base, f);
      const content = await fs.readJson(p).catch(() => null);
      // allow incoming name formats: 'repo:id' or 'id'
      const fileId = content && (content.id || content.name) ? (content.id || content.name) : f;
      const strippedFileId = (typeof fileId === 'string' && fileId.includes(':')) ? fileId.split(':')[1] : fileId;
      const matches = names.some(n => {
        if (typeof n !== 'string') return false;
        if (n.includes(':')) {
          // repo-qualified incoming name
          return n === fileId || n === `${content && content.repo ? content.repo : ''}:${strippedFileId}`;
        }
        return n === fileId || n === strippedFileId || n === f;
      });
      if (matches) {
        await fs.remove(p);
        removed++;
      }
    }
    return removed;
  }

  const userDir = getVsCodeUserDir();
  const base = (type === 'prompts') ? path.join(userDir, 'prompts') : path.join(userDir, '.github', type);
  if (!(await fs.pathExists(base))) return 0;
  const files = await fs.readdir(base);
  let removed = 0;
  for (const f of files) {
    const p = path.join(base, f);
    const content = await fs.readJson(p).catch(() => null);
    const fileId = content && (content.id || content.name) ? (content.id || content.name) : f;
    const strippedFileId = (typeof fileId === 'string' && fileId.includes(':')) ? fileId.split(':')[1] : fileId;
    const matches = names.some(n => {
      if (typeof n !== 'string') return false;
      if (n.includes(':')) {
        return n === fileId || n === `${content && content.repo ? content.repo : ''}:${strippedFileId}`;
      }
      return n === fileId || n === strippedFileId || n === f;
    });
    if (matches) {
      await fs.remove(p);
      removed++;
    }
  }
  return removed;
}

module.exports = { getVsCodeUserDir, installFiles, removeFiles };
