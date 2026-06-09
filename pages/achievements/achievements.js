const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    badges: []
  },

  onShow() {
    syncTab(this, 4)
    this.load()
  },

  async load() {
    if (!app.globalData.activeChildId) return
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: app.globalData.activeChildId,
        includeAchievements: true
      })
      this.setData({
        badges: detail.badges || []
      })
    } catch (error) {
      showError(error)
    }
  }
})
