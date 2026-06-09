const perf = require('./perf')

function callCloud(name, data = {}) {
  const {
    cacheTtl = 0,
    dedupe = false,
    forceRefresh = false,
    ...payload
  } = data || {}
  const cacheKey = cacheTtl || dedupe ? perf.makeCacheKey(name, payload) : ''
  if (cacheTtl && !forceRefresh) {
    const cached = perf.getCache(cacheKey, cacheTtl)
    if (cached) return Promise.resolve(cached)
  }
  if (dedupe) {
    const pending = perf.getPending(cacheKey)
    if (pending) return pending
  }
  const request = wx.cloud.callFunction({ name, data: payload }).then((res) => {
    const result = res.result || {}
    if (result.ok === false) {
      throw new Error(result.message || '云函数调用失败')
    }
    const value = result.data === undefined ? result : result.data
    if (cacheTtl) perf.setCache(cacheKey, value)
    return value
  })
  if (dedupe) perf.setPending(cacheKey, request)
  return request
}

function showError(error, fallback = '操作失败，请稍后再试') {
  const rawMessage = error && error.message ? error.message : fallback
  const message = rawMessage || fallback
  if (isPinError(error)) {
    showPinError()
    return
  }
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2200
  })
}

function getErrorText(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return [
    error.message,
    error.errMsg,
    error.stack
  ].filter(Boolean).join(' ')
}

function isPinError(error) {
  const message = getErrorText(error)
  return message.includes('PIN 不正确') ||
    message.includes('PIN不正确') ||
    message.includes('PIN 输入错误') ||
    message.includes('PIN码输入错误') ||
    message.includes('家长 PIN 不正确') ||
    message.includes('当前 PIN 不正确')
}

function showPinError() {
  wx.showModal({
    title: '验证失败',
    content: 'PIN码输入错误，请重新输入',
    showCancel: false,
    confirmText: '知道了'
  })
}

function formatDate(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekRange(date = new Date()) {
  const target = new Date(date)
  const day = target.getDay() || 7
  const start = new Date(target)
  start.setDate(target.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: formatDate(start), end: formatDate(end) }
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start: formatDate(start), end: formatDate(end) }
}

module.exports = {
  callCloud,
  showError,
  formatDate,
  getWeekRange,
  getMonthRange,
  isPinError,
  showPinError,
  clearCloudCache: perf.clearCache,
  markPerf: perf.mark
}
