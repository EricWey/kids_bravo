const memoryCache = {}
const pendingRequests = {}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function makeCacheKey(name, data = {}) {
  return `${name}:${stableStringify(data)}`
}

function getCache(key, maxAge = 30000) {
  const cached = memoryCache[key]
  if (!cached || Date.now() - cached.time > maxAge) return null
  return cached.value
}

function setCache(key, value) {
  memoryCache[key] = {
    value,
    time: Date.now()
  }
}

function clearCache(prefix = '') {
  Object.keys(memoryCache).forEach((key) => {
    if (!prefix || key.indexOf(prefix) === 0) delete memoryCache[key]
  })
}

function getPending(key) {
  return pendingRequests[key]
}

function setPending(key, promise) {
  pendingRequests[key] = promise
  promise.then(() => {
    if (pendingRequests[key] === promise) delete pendingRequests[key]
  }, () => {
    if (pendingRequests[key] === promise) delete pendingRequests[key]
  })
}

function mark(label) {
  const start = Date.now()
  return (extra = '') => {
    const cost = Date.now() - start
    console.info(`[perf] ${label}: ${cost}ms${extra ? ` ${extra}` : ''}`)
    return cost
  }
}

module.exports = {
  makeCacheKey,
  getCache,
  setCache,
  clearCache,
  getPending,
  setPending,
  mark
}
