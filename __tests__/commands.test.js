jest.mock('../src/fetcher');
const { fetchIndex } = require('../src/fetcher');
const cache = require('../src/cache');
const { listItems } = require('../src/commands/list');
const { searchIndex } = require('../src/commands/search');

const FIXTURE_INDEX = {
  prompts: [{ id: 'p1', name: 'Prompt One' }],
  chatmodes: [{ id: 'c1', name: 'Chat Mode One' }],
  instructions: [{ id: 'i1', name: 'Instruction One' }]
};

beforeEach(() => {
  fetchIndex.mockResolvedValue(FIXTURE_INDEX);
  cache.del('index');
});

test('listItems returns items', async () => {
  const items = listItems(FIXTURE_INDEX);
  expect(items.find(i => i.type === 'prompt')).toBeTruthy();
  expect(items.find(i => i.type === 'chatmode')).toBeTruthy();
  expect(items.find(i => i.type === 'instruction')).toBeTruthy();
});

test('searchIndex finds query', async () => {
  const results = searchIndex(FIXTURE_INDEX, 'One');
  expect(results.length).toBeGreaterThanOrEqual(3);
});
