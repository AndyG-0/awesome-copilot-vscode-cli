const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');

function getVsCodeUserDir() {
  const platform = os.platform();
  // prefer explicit HOME env when set (tests override HOME)
  const home = process.env.HOME || os.homedir();
  // If a macOS-style user folder already exists under HOME prefer that
  // This makes tests that create the macOS path pass on non-darwin CI runners.
  try {
    const macPath = path.join(home, 'Library', 'Application Support', 'Code', 'User');
    if (fs.pathExistsSync && fs.pathExistsSync(macPath)) return macPath;
  } catch (e) {
    // ignore and fall back to platform-specific defaults
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Code', 'User');
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
  }
  // linux
  return path.join(home, '.config', 'Code', 'User');
}

// Helper to sanitize folder names to prevent path traversal attacks
function makeSafeFolderName(rawName) {
  let safe = rawName || '';
  // Replace any path separators with a dash so we don't create nested or absolute paths
  safe = safe.replace(/[\\/]+/g, '-');
  // Remove leading dots so values like "." or ".." don't become special path segments
  safe = safe.replace(/^\.+/, '');
  // Strip a leading Windows drive prefix like "C:\" or "D:/"
  safe = safe.replace(/^[A-Za-z]:[-\\/]?/, '');
  safe = safe.trim();
  if (!safe) {
    safe = 'skill';
  }
  return safe;
}

async function installFiles({ items, type, target, workspaceDir }) {
  // type: prompts|chatmodes|agents|instructions|skills
  // Helper to derive filename and extension
  const extForType = t => {
    if (t === 'chatmodes') return '.chatmode.md';
    if (t === 'agents') return '.agent.md';
    if (t === 'instructions' || t === 'instruction') return '.instructions.md';
    if (t === 'skills') return '.md'; // skills typically use plain .md
    return '.prompt.md';
  };

  const fetchRawIfNeeded = async item => {
    if (item.content) return item.content;
    if (item.url) {
      try {
        const r = await axios.get(item.url, { timeout: 10000, headers: { 'User-Agent': 'acp-vscode-cli' } });
        return r.data;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const fetchFileContent = async fileInfo => {
    if (!fileInfo.url) return null;
    try {
      const r = await axios.get(fileInfo.url, { timeout: 10000, headers: { 'User-Agent': 'acp-vscode-cli' } });
      return r.data;
    } catch (e) {
      console.warn(`Failed to fetch ${fileInfo.path}: ${e.message}`);
      return null;
    }
  };

  // Special handling for skills: they are folders with SKILL.md inside and supporting files
  if (type === 'skills') {
    if (target === 'workspace') {
      const base = path.join(workspaceDir, '.github', 'skills');
      await fs.ensureDir(base);
      // detect duplicate ids so we can disambiguate folder names by prefixing
      const idCounts = items.reduce((m, it) => { const k = it.id || it.name || ''; m[k] = (m[k] || 0) + 1; return m; }, {});
      for (const item of items) {
        const baseName = item.id || item.name || `skill-${Date.now()}`;
        let folderName = baseName;
        if (idCounts[baseName] > 1 && item.repo) {
          // prefix with repo to avoid overwriting folders when multiple repos have the same id
          folderName = `${item.repo}-${baseName}`;
        }
        folderName = makeSafeFolderName(folderName);
        const skillFolderPath = path.join(base, folderName);
        await fs.ensureDir(skillFolderPath);
        
        // If item has files array (from fetcher), copy all files
        if (item.files && Array.isArray(item.files) && item.files.length > 0) {
          const folderPathPrefix = item.folderPath || '';
          for (const fileInfo of item.files) {
            // Derive a relative path without using an unsafe RegExp constructed from folderPathPrefix
            let relativePath = fileInfo.path;
            if (folderPathPrefix && relativePath.startsWith(`${folderPathPrefix}/`)) {
              relativePath = relativePath.slice(folderPathPrefix.length + 1);
            }

            // Normalize and sanitize the relative path to prevent directory traversal or absolute paths
            let safeRelativePath = path.normalize(relativePath);
            // Remove any leading path separators so the path remains relative
            while (safeRelativePath.startsWith(path.sep) || safeRelativePath.startsWith('/')) {
              safeRelativePath = safeRelativePath.slice(1);
            }
            // Check if the path is absolute (including Windows paths like C:\...)
            if (path.isAbsolute(safeRelativePath)) {
              console.warn(`Skipping absolute path: ${fileInfo.path}`);
              continue;
            }
            // After normalization, disallow any attempts to escape the skill folder
            if (
              safeRelativePath === '..' ||
              safeRelativePath.startsWith(`..${path.sep}`) ||
              safeRelativePath.includes(`${path.sep}..${path.sep}`) ||
              safeRelativePath.endsWith(`${path.sep}..`)
            ) {
              console.warn(`Skipping potentially unsafe path outside skill folder: ${fileInfo.path}`);
              continue;
            }

            const filePath = path.join(skillFolderPath, safeRelativePath);
            
            // Create directory if needed
            await fs.ensureDir(path.dirname(filePath));
            
            // Fetch and write file
            const fileContent = await fetchFileContent(fileInfo);
            
            if (fileContent !== null && fileContent !== undefined) {
              const contentStr = typeof fileContent !== 'string' ? JSON.stringify(fileContent, null, 2) : fileContent;
              await fs.writeFile(filePath, contentStr, 'utf8');
            }
          }
        } else {
          // Fallback: if no files array, just write SKILL.md (for backward compatibility)
          const skillMdPath = path.join(skillFolderPath, 'SKILL.md');
          let content = await fetchRawIfNeeded(item) || item.content || JSON.stringify(item, null, 2);
          if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
          await fs.writeFile(skillMdPath, content, 'utf8');
        }
      }
      return base;
    }

    // user target: install skills to ~/.copilot/skills/
    const home = process.env.HOME || os.homedir();
    const base = path.join(home, '.copilot', 'skills');
    await fs.ensureDir(base);
    // detect duplicates among items to avoid overwriting
    const idCounts = items.reduce((m, it) => { const k = it.id || it.name || ''; m[k] = (m[k] || 0) + 1; return m; }, {});
    for (const item of items) {
      const baseName = item.id || item.name || `skill-${Date.now()}`;
      let folderName = baseName;
      if (idCounts[baseName] > 1 && item.repo) folderName = `${item.repo}-${baseName}`;
      folderName = makeSafeFolderName(folderName);
      const skillFolderPath = path.join(base, folderName);
      await fs.ensureDir(skillFolderPath);
      
      if (item.files && Array.isArray(item.files) && item.files.length > 0) {
        const folderPathPrefix = item.folderPath || '';
        for (const fileInfo of item.files) {
          // Derive a relative path without using an unsafe RegExp constructed from folderPathPrefix
          let relativePath = fileInfo.path;
          if (folderPathPrefix && relativePath.startsWith(`${folderPathPrefix}/`)) {
            relativePath = relativePath.slice(folderPathPrefix.length + 1);
          }

          // Normalize and sanitize the relative path to prevent directory traversal or absolute paths
          let safeRelativePath = path.normalize(relativePath);
          // Remove any leading path separators so the path remains relative
          while (safeRelativePath.startsWith(path.sep) || safeRelativePath.startsWith('/')) {
            safeRelativePath = safeRelativePath.slice(1);
          }
          // Check if the path is absolute (including Windows paths like C:\...)
          if (path.isAbsolute(safeRelativePath)) {
            console.warn(`Skipping absolute path: ${fileInfo.path}`);
            continue;
          }
          // After normalization, disallow any attempts to escape the skill folder
          if (
            safeRelativePath === '..' ||
            safeRelativePath.startsWith(`..${path.sep}`) ||
            safeRelativePath.includes(`${path.sep}..${path.sep}`) ||
            safeRelativePath.endsWith(`${path.sep}..`)
          ) {
            console.warn(`Skipping potentially unsafe path outside skill folder: ${fileInfo.path}`);
            continue;
          }

          const filePath = path.join(skillFolderPath, safeRelativePath);
          
          // Create directory if needed
          await fs.ensureDir(path.dirname(filePath));
          
          // Fetch and write file
          const fileContent = await fetchFileContent(fileInfo);
          
          if (fileContent !== null && fileContent !== undefined) {
            const contentStr = typeof fileContent !== 'string' ? JSON.stringify(fileContent, null, 2) : fileContent;
            await fs.writeFile(filePath, contentStr, 'utf8');
          }
        }
      } else {
        // Fallback: if no files array, just write SKILL.md (for backward compatibility)
        const skillMdPath = path.join(skillFolderPath, 'SKILL.md');
        let content = await fetchRawIfNeeded(item) || item.content || JSON.stringify(item, null, 2);
        if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
        await fs.writeFile(skillMdPath, content, 'utf8');
      }
    }
    return base;
  }

  // Standard handling for other types (prompts, agents, chatmodes, instructions)
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

  // user target: write all types (except skills) into the VS Code User 'prompts' folder so user profile
  // keeps everything together (per user's requested behavior).
  const userDir = getVsCodeUserDir();
  const base = path.join(userDir, 'prompts');
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
  // Special handling for skills: they are folders, not files
  if (type === 'skills') {
    if (target === 'workspace') {
      const base = path.join(workspaceDir, '.github', 'skills');
      if (!(await fs.pathExists(base))) return 0;
      const dirs = await fs.readdir(base);
      let removed = 0;
      for (const d of dirs) {
        const p = path.join(base, d);
        const stats = await fs.stat(p).catch(() => null);
        if (!stats || !stats.isDirectory()) continue; // skip non-directories
        const matches = names.some(n => {
          if (typeof n !== 'string') return false;
          if (n.includes(':')) {
            // repo-qualified incoming name like "repo:type:skill-id" or "repo:skill-id" (legacy)
            const parts = n.split(':');
            if (parts.length === 3) {
              const repo = parts[0];
              const typePart = parts[1];
              const id = parts[2];
              // For skills, type must be 'skill'
              if (typePart !== 'skill') return false;
              return d === id || d === `${repo}-${id}`;
            } else if (parts.length === 2) {
              const [repo, id] = parts;
              // Check if folder name matches either "skill-id" or "repo-skill-id" pattern
              return d === id || d === `${repo}-${id}`;
            }
          }
          return n === d; // direct match on folder name
        });
        if (matches) {
          await fs.remove(p);
          removed++;
        }
      }
      return removed;
    }

    // user target: skills are in ~/.copilot/skills/
    const home = process.env.HOME || os.homedir();
    const base = path.join(home, '.copilot', 'skills');
    if (!(await fs.pathExists(base))) return 0;
    const dirs = await fs.readdir(base);
    let removed = 0;
    for (const d of dirs) {
      const p = path.join(base, d);
      const stats = await fs.stat(p).catch(() => null);
      if (!stats || !stats.isDirectory()) continue; // skip non-directories
      const matches = names.some(n => {
        if (typeof n !== 'string') return false;
        if (n.includes(':')) {
          const parts = n.split(':');
          if (parts.length === 3) {
            const repo = parts[0];
            const type = parts[1];
            const id = parts[2];
            // For skills, type must be 'skill'
            if (type !== 'skill') return false;
            return d === id || d === `${repo}-${id}`;
          } else if (parts.length === 2) {
            const [repo, id] = parts;
            return d === id || d === `${repo}-${id}`;
          }
        }
        return n === d;
      });
      if (matches) {
        await fs.remove(p);
        removed++;
      }
    }
    return removed;
  }

  // Standard handling for other types (files)
  if (target === 'workspace') {
    const base = path.join(workspaceDir, '.github', type);
    if (!(await fs.pathExists(base))) return 0;
    const files = await fs.readdir(base);
    let removed = 0;
    for (const f of files) {
      const p = path.join(base, f);
      const content = await fs.readJson(p).catch(() => null);
      // allow incoming name formats: 'repo:type:id', 'repo:id' (legacy), or 'id'
      const fileId = content && (content.id || content.name) ? (content.id || content.name) : f;
      // Extract the raw ID from hierarchical format
      const parseHierarchicalId = (id) => {
        if (typeof id !== 'string') return id;
        const parts = id.split(':');
        if (parts.length === 3) return parts[2]; // repo:type:id -> id
        if (parts.length === 2) return parts[1]; // repo:id -> id
        return id;
      };
      const strippedFileId = parseHierarchicalId(fileId);
      const matches = names.some(n => {
        if (typeof n !== 'string') return false;
        if (n.includes(':')) {
          const parts = n.split(':');
          if (parts.length === 3) {
            const [repo, typeSegment, id] = parts;
            // only match repo:type:id when the type segment matches the current type (or its singular form)
            // Note: singularization assumes regular English plurals (e.g., prompts->prompt, skills->skill)
            // which is appropriate for all current types: prompts, chatmodes, agents, instructions, skills
            const singularType = type && typeof type === 'string' && type.endsWith('s') ? type.slice(0, -1) : type;
            if (typeSegment !== type && typeSegment !== singularType) {
              return false;
            }
            return n === fileId || (content && content.repo === repo && strippedFileId === id);
          } else if (parts.length === 2) {
            // Legacy format: repo:id
            const [repo, id] = parts;
            return n === fileId || (content && content.repo === repo && (strippedFileId === id));
          }
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
  // All user-target files live in the VS Code User 'prompts' folder now
  const base = path.join(userDir, 'prompts');
  if (!(await fs.pathExists(base))) return 0;
  const files = await fs.readdir(base);
  let removed = 0;
  for (const f of files) {
    const p = path.join(base, f);
    const content = await fs.readJson(p).catch(() => null);
    const fileId = content && (content.id || content.name) ? (content.id || content.name) : f;
    const parseHierarchicalId = (id) => {
      if (typeof id !== 'string') return id;
      const parts = id.split(':');
      if (parts.length === 3) return parts[2]; // repo:type:id -> id
      if (parts.length === 2) return parts[1]; // repo:id -> id
      return id;
    };
    const strippedFileId = parseHierarchicalId(fileId);
    const matches = names.some(n => {
      if (typeof n !== 'string') return false;
      if (n.includes(':')) {
        const parts = n.split(':');
        if (parts.length === 3) {
          const [repo, typeSegment, id] = parts;
          // only match repo:type:id when the type segment matches the current type (or its singular form)
          // Note: singularization assumes regular English plurals (e.g., prompts->prompt, skills->skill)
          // which is appropriate for all current types: prompts, chatmodes, agents, instructions, skills
          const singularType = type && typeof type === 'string' && type.endsWith('s') ? type.slice(0, -1) : type;
          if (typeSegment !== type && typeSegment !== singularType) {
            return false;
          }
          return n === fileId || (content && content.repo === repo && (strippedFileId === id));
        } else if (parts.length === 2) {
          const [repo, id] = parts;
          return n === fileId || (content && content.repo === repo && (strippedFileId === id));
        }
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
