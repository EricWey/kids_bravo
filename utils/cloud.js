function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((res) => {
    const result = res.result || {}
    if (result.ok === false) {
      throw new Error(result.message || '云函数调用失败')
    }
    return result.data === undefined ? result : result.data
  })
}

function showError(error, fallback = '操作失败，请稍后再试') {
  const message = error && error.message ? error.message : fallback
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2200
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
  getMonthRange
}
