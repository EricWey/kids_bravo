const app = getApp()
const { callCloud, showError, formatDate } = require('../../utils/cloud')
const taskStatus = require('../../utils/taskStatus')

const CATEGORIES = ['学习成长类', '生活习惯类', '行为品德类']

Page({
  data: {
    pin: '',
    unlocked: false,
    tasks: [],
    categoryNames: CATEGORIES,
    saving: false,
    showAddModal: false,
    newTaskCategoryIndex: 0,
    newTaskForm: {
      category: CATEGORIES[0],
      name: '',
      description: '',
      rewardCoins: 2,
      penaltyCoins: 1
    }
  },

  onLoad() {
    this.unsubscribeTaskStatus = taskStatus.subscribe((change) => this.handleTaskStatusChange(change))
  },

  onUnload() {
    if (this.unsubscribeTaskStatus) {
      this.unsubscribeTaskStatus()
      this.unsubscribeTaskStatus = null
    }
  },

  onShow() {
    if (this.data.unlocked) {
      this.loadTasks()
    }
  },

  handleTaskStatusChange(change) {
    if (!change || change.childId !== app.globalData.activeChildId) return
    const index = this.data.tasks.findIndex((task) => task._id === change.taskId)
    if (index < 0) return
    this.setData({ [`tasks[${index}].enabled`]: change.enabled !== false })
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
    const categoryNames = CATEGORIES.slice()
    ;(detail.categories || []).forEach((category) => {
      if (category.name && !categoryNames.includes(category.name)) {
        categoryNames.push(category.name)
      }
      category.tasks.forEach((task) => {
        tasks.push({
          ...task,
          category: category.name,
          categoryIndex: categoryNames.indexOf(category.name),
          enabled: task.enabled !== false
        })
      })
    })
    this.setData({
      categoryNames,
      tasks: taskStatus.applyTaskStatusList(tasks, app.globalData.activeChildId)
    })
  },

  addTask() {
    const category = this.data.categoryNames[0] || CATEGORIES[0]
    this.setData({
      showAddModal: true,
      newTaskCategoryIndex: 0,
      newTaskForm: {
        category,
        name: '',
        description: '',
        rewardCoins: 2,
        penaltyCoins: 1
      }
    })
  },

  closeAddModal() {
    this.setData({ showAddModal: false })
  },

  noop() {},

  onNewTaskCategoryChange(event) {
    const categoryIndex = Number(event.detail.value)
    this.setData({
      newTaskCategoryIndex: categoryIndex,
      'newTaskForm.category': this.data.categoryNames[categoryIndex]
    })
  },

  onNewTaskInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`newTaskForm.${field}`]: event.detail.value })
  },

  submitNewTask() {
    const form = this.data.newTaskForm
    const name = String(form.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写事项名称', icon: 'none' })
      return
    }

    this.setData({
      tasks: [{
        _id: `local_${Date.now()}`,
        category: form.category,
        categoryIndex: this.data.newTaskCategoryIndex,
        name,
        description: String(form.description || '').trim(),
        rewardCoins: Number(form.rewardCoins) || 0,
        penaltyCoins: Number(form.penaltyCoins) || 0,
        enabled: true,
        isNew: true
      }].concat(this.data.tasks),
      showAddModal: false
    })
  },

  onCategoryChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const categoryIndex = Number(event.detail.value)
    this.setData({
      [`tasks[${index}].categoryIndex`]: categoryIndex,
      [`tasks[${index}].category`]: this.data.categoryNames[categoryIndex]
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
      tasks.forEach((task) => {
        if (task._id) {
          taskStatus.publishTaskStatus({
            childId: app.globalData.activeChildId,
            taskId: task._id,
            enabled: task.enabled
          })
        }
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
