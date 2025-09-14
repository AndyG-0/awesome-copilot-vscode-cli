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

describe('list JSON output', () => {
  afterEach(() => {
    cache.del('index');
    delete process.env.ACP_INDEX_JSON;
  });

  test('listCommand emits valid JSON when --json is passed', async () => {
    process.env.ACP_INDEX_JSON = JSON.stringify({ prompts: [{ id: 'p1', name: 'Prompt One', repo: 'r1' }], chatmodes: [], instructions: [], _conflicts: [] });
    const stubCli = makeCli();
    const lc = require('../src/commands/list');
    lc.listCommand(stubCli);
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await stubCli._action('prompts', { refresh: true, verbose: false, json: true });
    expect(logs.length).toBeGreaterThan(0);
    // The first log should be parseable JSON representing an array
    const parsed = JSON.parse(logs.join('\n'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('p1');
    console.log.mockRestore();
  });
});
