const cache = require('../src/cache');
const fs = require('fs-extra');
const path = require('path');

function makeCli() {
  const cli = {
    _action: null,
    command() { return cli; },
    option() { return cli; },
    action(fn) { cli._action = fn; return cli; }
  };
  return cli;
}

describe('command actions (search, list, install)', () => {
  afterEach(() => {
    cache.del('index');
    delete process.env.ACP_INDEX_JSON;
  });

  test('searchCommand action prints matches and respects ACP_INDEX_JSON', async () => {
    process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 's1', name: 'SearchMe', repo: 'r1' }], chatmodes: [], instructions: [], _conflicts: [] });
    const stubCli = makeCli();
    const sc = require('../src/commands/search');
    sc.searchCommand(stubCli);
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await stubCli._action('searchme', { refresh: true, verbose: false });
    expect(logs.some(l => l.includes('s1'))).toBe(true);
    console.log.mockRestore();
  });

  test('listCommand action prints header and items', async () => {
    process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 'p1', name: 'Prompt One', repo: 'r1' }], chatmodes: [], instructions: [], _conflicts: [] });
    const stubCli = makeCli();
    const lc = require('../src/commands/list');
    lc.listCommand(stubCli);
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await stubCli._action('prompts', { refresh: true, verbose: false });
    // The printed output should include a header line with Type and ID
    expect(logs.some(l => /Type\s+ID/.test(l))).toBe(true);
    console.log.mockRestore();
  });

  test('installCommand action supports dry-run and type option', async () => {
    process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 'p1', name: 'P1', repo: 'r1', content: 'x' }], chatmodes: [], instructions: [], _conflicts: [] });
    const stubCli = makeCli();
    const ic = require('../src/commands/install');
    ic.installCommand(stubCli);
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await stubCli._action('workspace', ['p1'], { type: 'prompts', 'dry-run': true });
    expect(logs.some(l => l.includes('[dry-run]'))).toBe(true);
    console.log.mockRestore();
  });

});
