const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    badges: [],
    wishes: [],
    wishName: '',
    wishCost: ''
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
        badges: detail.badges || [],
        wishes: (detail.wishes || []).map((wish) => ({
          ...wish,
          statusText: wish.status === 'redeemed' ? '已兑换' : '等待兑换'
        }))
      })
    } catch (error) {
      showError(error)
    }
  },

  onWishName(event) {
    this.setData({ wishName: event.detail.value })
  },

  onWishCost(event) {
    this.setData({ wishCost: event.detail.value })
  },

  async addWish() {
    if (!this.data.wishName.trim()) {
      wx.showToast({ title: '请填写愿望', icon: 'none' })
      return
    }
    try {
      await callCloud('updateWish', {
        childId: app.globalData.activeChildId,
        action: 'add',
        name: this.data.wishName.trim(),
        costCoins: Number(this.data.wishCost) || 1
      })
      this.setData({ wishName: '', wishCost: '' })
      this.load()
    } catch (error) {
      showError(error)
    }
  },

  async redeemWish(event) {
    wx.showModal({
      title: '家长确认',
      editable: true,
      placeholderText: '输入 4 位 PIN',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callCloud('updateWish', {
            childId: app.globalData.activeChildId,
            action: 'redeem',
            wishId: event.currentTarget.dataset.id,
            pin: res.content
          })
          wx.showToast({ title: '愿望已兑换', icon: 'success' })
          this.load()
        } catch (error) {
          showError(error)
        }
      }
    })
  }
})
