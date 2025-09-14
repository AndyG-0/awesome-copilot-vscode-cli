const { listItems, formatListLines } = require('../src/commands/list');

test('listItems includes repo prefix for conflicted ids and formatListLines emits header', () => {
  const idx = {
    prompts: [ { id: 'shared', name: 'Shared Prompt', repo: 'r1' } ],
    chatmodes: [],
    instructions: [],
    _conflicts: ['shared']
  };
  const items = listItems(idx, 'prompts');
  expect(items.length).toBe(1);
  expect(items[0].id).toBe('r1:shared');
  const lines = formatListLines(items);
  expect(lines[0]).toMatch(/Type\s+ID\s+Name/);
});
