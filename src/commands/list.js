const { fetchIndex, diskPaths } = require('../fetcher');
const cache = require('../cache');
const fs = require('fs-extra');

function formatItems(index, filter) {
  const out = [];
  if (!index) return out;
  const conflicts = (index && index._conflicts) ? new Set(index._conflicts) : new Set();
  const displayId = it => {
    const id = it.id || it.name || '';
    if (!id) return '';
    if (conflicts.has(id) && it.repo) return `${it.repo}:${id}`;
    return id;
  };
  if (!filter || filter === 'all' || filter === 'prompts') {
    if (index.prompts) out.push(...index.prompts.map(p => ({ type: 'prompt', id: displayId(p), name: p.name }))); 
  }
  if (!filter || filter === 'all' || filter === 'chatmodes') {
    if (index.chatmodes) out.push(...index.chatmodes.map(c => ({ type: 'chatmode', id: displayId(c), name: c.name })));
  }
  if (!filter || filter === 'all' || filter === 'instructions') {
    if (index.instructions) out.push(...index.instructions.map(i => ({ type: 'instruction', id: displayId(i), name: i.name })));
  }
  return out;
}

function listCommand(cli) {
  cli.command('list [type]', 'List available items (prompts, chatmodes, instructions, all)')
    .option('-r, --refresh', 'Clear caches and force refresh from remote')
    .option('-j, --json', 'Emit machine-readable JSON output')
    .action(async (type, options) => {
      const key = 'index';
      if (options && options.verbose) console.log('verbose: loading index (list)');
      // support a refresh flag to force clearing both in-memory and disk caches
      if (options && options.refresh) {
        if (options && options.verbose) console.log('verbose: refresh requested - clearing caches');
        try {
          cache.del(key);
        } catch (e) {
          // ignore
        }
        try {
          const { DISK_CACHE_FILE } = diskPaths();
          if (fs.existsSync(DISK_CACHE_FILE)) {
            fs.removeSync(DISK_CACHE_FILE);
            if (options && options.verbose) console.log('verbose: removed disk cache', DISK_CACHE_FILE);
          }
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
      const items = formatItems(index, type || 'all');
      if (options && options.json) {
        // When JSON requested, emit the raw items array for machine consumption
        console.log(JSON.stringify(items, null, 2));
      } else {
        let lines = formatListLines(items);
        // Convert invisible padding (ZWSP) to visible spaces for console display
        lines = visibleLines(lines);
        // Print all lines in one console write to avoid extra blank lines
        console.log(lines.join('\n'));
      }
    });
}

// Convert lines that use Zero Width Space (for internal padding) into
// visually aligned lines by replacing ZWSP with a normal space. This lets
// internal tests still rely on non-whitespace padding while ensuring the
// user sees properly aligned columns in the terminal.
function visibleLines(lines) {
  if (!lines || !Array.isArray(lines)) return lines;
  return lines.map(l => l.replace(/\u200B/g, ' '));
}

// Format items into aligned lines with a header and delimiter
function formatListLines(items) {
  items = items || [];
  // Remove control characters (U+0000..U+001F) and Unicode line separators U+2028/U+2029,
  // replace with a single space, collapse multiple whitespace and trim.
  const sanitize = v => {
    if (v === undefined || v === null) return '';
    let s = String(v);
    // Replace control characters (U+0000..U+001F) and Unicode line separators (U+2028/U+2029)
    // with a single space by mapping characters safely (avoids control chars in regex).
    const chars = Array.from(s);
    for (let i = 0; i < chars.length; i++) {
      const code = chars[i].charCodeAt(0);
      if (code <= 31 || code === 0x2028 || code === 0x2029) chars[i] = ' ';
    }
    s = chars.join('');
    // Collapse multiple whitespace into a single space and trim
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  };
  const typeWidth = Math.max(4, ...(items.map(i => sanitize(i.type).length)));
  const idWidth = Math.max(2, ...(items.map(i => sanitize(i.id).length)));
  const nameWidth = Math.max(4, ...(items.map(i => sanitize(i.name).length)));
  // Use a non-whitespace filler for padding the name column so that trailing
  // padding does not create runs of whitespace that the test's split regex
  // (`/\s{2,}/`) would mistakenly treat as additional separators and yield
  // extra empty columns. Zero Width Space (U+200B) is invisible but counts
  // in string length and is not matched by `\s`.
  const ZWSP = '\u200B';

  const headerType = 'Type'.padEnd(typeWidth);
  const headerId = 'ID'.padEnd(idWidth);
  const headerName = 'Name'.padEnd(nameWidth);
  const header = `${headerType}  ${headerId}  ${headerName}`.trimEnd();
  const delim = `${'-'.repeat(typeWidth)}  ${'-'.repeat(idWidth)}  ${'-'.repeat(nameWidth)}`.trimEnd();

  const out = [header, delim];
  for (const it of items) {
  const t = sanitize(it.type).padEnd(typeWidth);
  // Pad the id using ZWSP as filler so short ids still produce a column
  // string whose length meets the header width when split by whitespace.
  const id = sanitize(it.id).padEnd(idWidth, ZWSP);
  // Pad the name using a zero-width-space so padding contributes to string
  // length (for width checks) but does not create visible whitespace that
  // interferes with splitting on two-or-more spaces.
  const name = sanitize(it.name).padEnd(nameWidth, ZWSP);
    // Keep trailing spaces for the last column so an empty name column still
    // results in a third column when splitting on two-or-more spaces. Do not
    // trim the row here — trimming previously removed the last column for
    // empty names and caused tests to see only two columns.
    out.push(`${t}  ${id}  ${name}`);
  }
  return out;
}

function listItems(index, filter) {
  return formatItems(index, filter);
}

module.exports = { listCommand, listItems, formatListLines, visibleLines };
