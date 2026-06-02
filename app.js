const { callCloud, showError } = require('./utils/cloud')

App({
  globalData: {
    openid: '',
    children: [],
    activeChildId: '',
    envId: 'cloud1-d5g1meajedfc787ab'
  },

  async onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.envId,
        traceUser: true
      })
    }

    const activeChildId = wx.getStorageSync('activeChildId')
    if (activeChildId) {
      this.globalData.activeChildId = activeChildId
    }

    try {
      const { openid, children = [] } = await callCloud('getOpenId')
      this.globalData.openid = openid
      this.globalData.children = children
      if (!this.globalData.activeChildId && children.length) {
        this.setActiveChild(children[0]._id)
      }
    } catch (error) {
      showError(error, '启动失败，请检查云开发环境')
    }
  },

  setActiveChild(childId) {
    this.globalData.activeChildId = childId
    wx.setStorageSync('activeChildId', childId)
  },

  getActiveChild() {
    return this.globalData.children.find((child) => child._id === this.globalData.activeChildId) || null
  },

  updateChildren(children) {
    this.globalData.children = children
    if (!this.globalData.activeChildId && children.length) {
      this.setActiveChild(children[0]._id)
    }
  }
})
