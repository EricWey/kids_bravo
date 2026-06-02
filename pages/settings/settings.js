const { callCloud, showError } = require('../../utils/cloud')

Page({
  data: {
    oldPin: '',
    newPin: ''
  },

  onOldPin(event) {
    this.setData({ oldPin: event.detail.value })
  },

  onNewPin(event) {
    this.setData({ newPin: event.detail.value })
  },

  async savePin() {
    if (this.data.newPin.length !== 4) {
      wx.showToast({ title: '请输入 4 位新 PIN', icon: 'none' })
      return
    }
    try {
      await callCloud('saveTasks', {
        action: 'setPin',
        oldPin: this.data.oldPin,
        newPin: this.data.newPin
      })
      this.setData({ oldPin: '', newPin: '' })
      wx.showToast({ title: 'PIN 已保存', icon: 'success' })
    } catch (error) {
      showError(error)
    }
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/tasks' })
  },

  goTemplates() {
    wx.navigateTo({ url: '/pages/templates/templates' })
  }
})
