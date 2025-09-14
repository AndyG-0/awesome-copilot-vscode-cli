const { performInstall } = require('../src/commands/install');
const cache = require('../src/cache');

test('performInstall errors on ambiguous names', async () => {
  cache.set('index', {
    prompts: [ { id: 'abc', name: 'ABC', repo: 'r1' }, { id: 'abcd', name: 'ABCD', repo: 'r2' } ],
    chatmodes: [],
    instructions: []
  });
  // ambiguous prefix 'ab' matches multiple entries and should cause an error (exitCode 2)
  await performInstall({ target: 'workspace', type: 'prompts', names: ['ab'], options: {} });
  expect(process.exitCode).toBe(2);
  cache.del('index');
});
