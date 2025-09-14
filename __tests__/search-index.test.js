const { searchIndex } = require('../src/commands/search');

test('searchIndex returns results with repo-qualified ids when conflicts exist', () => {
  const idx = {
    prompts: [ { id: 'shared', name: 'Shared Prompt', repo: 'r1' } ],
    chatmodes: [ { id: 'other', name: 'Other Mode', repo: 'r2' } ],
    instructions: [],
    _conflicts: ['shared']
  };
  const res = searchIndex(idx, 'shared');
  expect(res.length).toBe(1);
  expect(res[0].id).toBe('r1:shared');
  expect(res[0].type).toBe('prompt');
});
