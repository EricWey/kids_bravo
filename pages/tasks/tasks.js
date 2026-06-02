const app = getApp()
const { callCloud, showError, formatDate } = require('../../utils/cloud')

const CATEGORIES = ['学习成长类', '生活习惯类', '行为品德类']

Page({
  data: {
    pin: '',
    unlocked: false,
    tasks: [],
    categoryNames: CATEGORIES,
    saving: false
  },

  onShow() {
    if (this.data.unlocked) {
      this.loadTasks()
    }
  },

  onPinInput(event) {
    this.setData({ pin: event.detail.value })
  },

  async unlock() {
    if (!app.globalData.activeChildId) {
      wx.showToast({ title: '请先选择档案', icon: 'none' })
      return
    }
    if (this.data.pin.length !== 4) {
      wx.showToast({ title: '请输入 4 位 PIN', icon: 'none' })
      return
    }
    try {
      await callCloud('saveTasks', {
        action: 'verifyPin',
        pin: this.data.pin
      })
      await this.loadTasks()
      this.setData({ unlocked: true })
    } catch (error) {
      showError(error)
    }
  },

  async loadTasks() {
    const detail = await callCloud('getDailyDetail', {
      childId: app.globalData.activeChildId,
      date: formatDate(),
      includeDisabled: true
    })
    const tasks = []
    ;(detail.categories || []).forEach((category) => {
      category.tasks.forEach((task) => {
        tasks.push({
          ...task,
          category: category.name,
          categoryIndex: CATEGORIES.indexOf(category.name),
          enabled: task.enabled !== false
        })
      })
    })
    this.setData({ tasks })
  },

  addTask() {
    this.setData({
      tasks: this.data.tasks.concat({
        _id: `local_${Date.now()}`,
        category: CATEGORIES[0],
        categoryIndex: 0,
        name: '',
        description: '',
        rewardCoins: 2,
        penaltyCoins: 1,
        enabled: true,
        isNew: true
      })
    })
  },

  onCategoryChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const categoryIndex = Number(event.detail.value)
    this.setData({
      [`tasks[${index}].categoryIndex`]: categoryIndex,
      [`tasks[${index}].category`]: CATEGORIES[categoryIndex]
    })
  },

  onInput(event) {
    const { index, field } = event.currentTarget.dataset
    this.setData({ [`tasks[${index}].${field}`]: event.detail.value })
  },

  onEnabledChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`tasks[${index}].enabled`]: event.detail.value })
  },

  removeTask(event) {
    const index = Number(event.currentTarget.dataset.index)
    const tasks = this.data.tasks.slice()
    tasks.splice(index, 1)
    this.setData({ tasks })
  },

  async save() {
    const tasks = this.data.tasks.map((task) => ({
      _id: task.isNew ? '' : task._id,
      category: task.category,
      name: task.name.trim(),
      description: task.description.trim(),
      rewardCoins: Number(task.rewardCoins) || 0,
      penaltyCoins: Number(task.penaltyCoins) || 0,
      enabled: task.enabled !== false
    })).filter((task) => task.name)

    this.setData({ saving: true })
    try {
      await callCloud('saveTasks', {
        childId: app.globalData.activeChildId,
        pin: this.data.pin,
        tasks
      })
      this.setData({ saving: false })
      wx.showToast({ title: '任务已保存', icon: 'success' })
      this.loadTasks()
    } catch (error) {
      this.setData({ saving: false })
      showError(error)
    }
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  }
})
