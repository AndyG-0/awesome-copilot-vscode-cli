const cache = require('../src/cache');

function makeCli() {
  const cli = {
    _action: null,
    command() { return cli; },
    option() { return cli; },
    action(fn) { cli._action = fn; return cli; }
  };
  return cli;
}

describe('search JSON output', () => {
  afterEach(() => {
    cache.del('index');
    delete process.env.ACP_INDEX_JSON;
  });

  test('searchCommand emits valid JSON when --json is passed', async () => {
    process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 's1', name: 'SearchMe', repo: 'r1' }], chatmodes: [], instructions: [], _conflicts: [] });
    const stubCli = makeCli();
    const sc = require('../src/commands/search');
    sc.searchCommand(stubCli);
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await stubCli._action('searchme', { refresh: true, verbose: false, json: true });
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs.join('\n'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('s1');
    console.log.mockRestore();
  });
});
