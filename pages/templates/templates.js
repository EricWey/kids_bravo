const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')

Page({
  data: {
    ages: [4, 5, 6, 7, 8, 9, 10],
    ageIndex: 2,
    age: 6,
    gender: 'girl',
    templates: []
  },

  onLoad() {
    const child = app.getActiveChild && app.getActiveChild()
    if (child) {
      const ageIndex = this.data.ages.indexOf(child.age)
      this.setData({
        age: child.age,
        ageIndex: ageIndex >= 0 ? ageIndex : 2,
        gender: child.gender
      })
    }
    this.loadTemplates()
  },

  async loadTemplates() {
    try {
      const { templates = [] } = await callCloud('initTemplates', {
        age: this.data.age,
        gender: this.data.gender
      })
      this.setData({
        templates: templates.map((item) => ({
          ...item,
          genderText: item.gender === 'girl' ? '女孩' : '男孩'
        }))
      })
    } catch (error) {
      showError(error)
    }
  },

  onAgeChange(event) {
    const ageIndex = Number(event.detail.value)
    this.setData({ ageIndex, age: this.data.ages[ageIndex] })
    this.loadTemplates()
  },

  chooseGender(event) {
    const gender = event.currentTarget.dataset.gender
    if (gender === this.data.gender) return
    this.setData({ gender })
    this.loadTemplates()
  },

  async applyTemplate(event) {
    const childId = app.globalData.activeChildId
    if (!childId) {
      wx.showToast({ title: '请先选择档案', icon: 'none' })
      return
    }
    try {
      await callCloud('createChildProfile', {
        childId,
        templateId: event.currentTarget.dataset.id,
        mode: 'applyTemplate'
      })
      wx.showToast({ title: '模板已应用', icon: 'success' })
    } catch (error) {
      showError(error)
    }
  }
})
