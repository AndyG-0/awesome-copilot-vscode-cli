const NodeCache = require('node-cache');

// 30 minutes TTL
const CACHE_TTL_SECONDS = 30 * 60;
const cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, useClones: false });

function get(key) {
  return cache.get(key);
}

function set(key, value) {
  return cache.set(key, value);
}

function del(key) {
  return cache.del(key);
}

module.exports = { get, set, del, CACHE_TTL_SECONDS };
