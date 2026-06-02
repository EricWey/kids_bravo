const app = getApp()
const { callCloud, showError, formatDate } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    today: formatDate(),
    activeChildId: '',
    childName: '',
    dailyTotal: 0,
    categories: [],
    celebrationVisible: false,
    encourageVisible: false,
    confetti: Array.from({ length: 10 }, (_, index) => ({ id: index }))
  },

  onShow() {
    syncTab(this, 1)
    this.loadToday()
  },

  async loadToday() {
    const child = app.getActiveChild && app.getActiveChild()
    if (!child) {
      this.setData({ activeChildId: '', childName: '', categories: [], dailyTotal: 0 })
      return
    }
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: child._id,
        date: this.data.today
      })
      this.setData({
        activeChildId: child._id,
        childName: child.nickname,
        dailyTotal: detail.dailyTotal || 0,
        categories: detail.categories || []
      })
    } catch (error) {
      showError(error)
    }
  },

  async submit(event) {
    const { id, status } = event.currentTarget.dataset
    wx.vibrateShort({ type: 'light' })
    try {
      const result = await callCloud('submitCheckin', {
        childId: this.data.activeChildId,
        taskId: id,
        status,
        date: this.data.today
      })
      this.setData({
        dailyTotal: result.dailyTotal,
        categories: result.categories
      })
      wx.showToast({
        title: status === 'done' ? '金币闪亮入账' : '已记录，明天继续',
        icon: 'none'
      })
      this.playFeedback(status)
    } catch (error) {
      showError(error)
    }
  },

  async resetTask(event) {
    const { id } = event.currentTarget.dataset
    wx.vibrateShort({ type: 'light' })
    try {
      const result = await callCloud('submitCheckin', {
        childId: this.data.activeChildId,
        taskId: id,
        status: 'reset',
        date: this.data.today
      })
      this.setData({
        dailyTotal: result.dailyTotal,
        categories: result.categories
      })
      wx.showToast({ title: '已重置，可重新选择', icon: 'none' })
    } catch (error) {
      showError(error, '重置失败')
    }
  },

  playFeedback(status) {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer)
    if (status === 'done') {
      this.setData({ celebrationVisible: true, encourageVisible: false })
    } else {
      this.setData({ celebrationVisible: false, encourageVisible: true })
    }
    this.feedbackTimer = setTimeout(() => {
      this.setData({
        celebrationVisible: false,
        encourageVisible: false
      })
    }, 1600)
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/tasks' })
  }
})
