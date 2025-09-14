const cache = require('../src/cache');

test('cache set and get', () => {
  cache.set('x', { a: 1 });
  const v = cache.get('x');
  expect(v).toEqual({ a: 1 });
});
