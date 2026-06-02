const app = getApp()
const { callCloud, showError, getWeekRange } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    totalCoins: 0,
    streakDays: 0,
    trend: [],
    transactions: []
  },

  onShow() {
    syncTab(this, 3)
    this.loadWallet()
  },

  async loadWallet() {
    if (!app.globalData.activeChildId) return
    try {
      const range = getWeekRange()
      const [calendar, detail] = await Promise.all([
        callCloud('getCalendarSummary', {
          childId: app.globalData.activeChildId,
          mode: 'week',
          start: range.start,
          end: range.end
        }),
        callCloud('getDailyDetail', {
          childId: app.globalData.activeChildId,
          includeTransactions: true
        })
      ])
      const trend = (calendar.days || []).map((day) => ({
        ...day,
        label: day.date.slice(5),
        height: Math.max(16, Math.min(210, Math.abs(day.total) * 18 + 12))
      }))
      this.setData({
        totalCoins: detail.totalCoins || 0,
        streakDays: detail.streakDays || 0,
        transactions: (detail.transactions || []).map((item) => ({
          ...item,
          typeText: item.amount >= 0 ? '奖励' : '惩罚'
        })),
        trend
      })
    } catch (error) {
      showError(error)
    }
  }
})
