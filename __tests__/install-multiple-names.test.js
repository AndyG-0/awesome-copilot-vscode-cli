jest.mock('../src/fetcher');
const { fetchIndex } = require('../src/fetcher');
const cache = require('../src/cache');
const { performInstall } = require('../src/commands/install');

beforeEach(() => {
  cache.del('index');
});

test('performInstall handles multiple names (dry-run) and reports both', async () => {
  const FIXTURE_INDEX = {
    prompts: [
      { id: 'p1', name: 'Prompt One' },
      { id: 'p2', name: 'Prompt Two' }
    ],
    chatmodes: [],
    instructions: []
  };
  fetchIndex.mockResolvedValue(FIXTURE_INDEX);

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await performInstall({ target: 'workspace', type: 'prompts', names: ['p1', 'p2'], options: { 'dry-run': true } });
    // Find dry-run line and ensure both prompts are listed
    const dryRunLines = logs.filter(l => l.includes('[dry-run]'));
    expect(dryRunLines.length).toBeGreaterThan(0);
    const listed = logs.filter(l => l.includes('Prompt One') || l.includes('Prompt Two'));
    expect(listed.some(l => l.includes('Prompt One'))).toBeTruthy();
    expect(listed.some(l => l.includes('Prompt Two'))).toBeTruthy();
  } finally {
    console.log = origLog;
  }
});
