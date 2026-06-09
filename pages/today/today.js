const app = getApp()
const { callCloud, showError, formatDate, markPerf, clearCloudCache } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')
const taskStatus = require('../../utils/taskStatus')

Page({
  data: {
    today: formatDate(),
    activeChildId: '',
    childName: '',
    childAvatarUrl: '',
    childAvatarLoadError: false,
    childAvatarPlaceholder: '星',
    dailyTotal: 0,
    categories: [],
    submittingTaskId: '',
    celebrationVisible: false,
    encourageVisible: false,
    confetti: Array.from({ length: 10 }, (_, index) => ({ id: index }))
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
    syncTab(this, 1)
    this.loadToday()
  },

  handleTaskStatusChange(change) {
    if (!change || change.childId !== this.data.activeChildId) return
    if (change.enabled === false) {
      const categories = this.data.categories.map((category) => ({
        ...category,
        tasks: (category.tasks || []).filter((task) => task._id !== change.taskId)
      }))
      this.setData({ categories })
      return
    }
    this.loadToday()
  },

  async loadToday() {
    const done = markPerf('today.loadToday')
    const child = app.getActiveChild && app.getActiveChild()
    if (!child) {
      this.setData({
        activeChildId: '',
        childName: '',
        childAvatarUrl: '',
        childAvatarLoadError: false,
        childAvatarPlaceholder: '星',
        categories: [],
        dailyTotal: 0
      })
      return
    }
    const requestId = Date.now()
    this.todayRequestId = requestId
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: child._id,
        date: this.data.today,
        cacheTtl: 12000,
        dedupe: true
      })
      if (this.todayRequestId !== requestId) return
      this.setData({
        activeChildId: child._id,
        childName: child.nickname,
        childAvatarUrl: child.avatarUrl || '',
        childAvatarLoadError: false,
        childAvatarPlaceholder: child.nickname ? child.nickname.slice(0, 1) : (child.gender === 'girl' ? '花' : '星'),
        dailyTotal: detail.dailyTotal || 0,
        categories: taskStatus.applyTaskStatusGroups(detail.categories || [], child._id)
      })
      done(`tasks=${(detail.categories || []).reduce((sum, group) => sum + (group.tasks || []).length, 0)}`)
    } catch (error) {
      showError(error)
    }
  },

  async submit(event) {
    const { id, status } = event.currentTarget.dataset
    if (!id || this.data.submittingTaskId) return
    const done = markPerf(`today.submit.${status}`)
    wx.vibrateShort({ type: 'light' })
    this.setData({ submittingTaskId: id })
    try {
      const result = await callCloud('submitCheckin', {
        childId: this.data.activeChildId,
        taskId: id,
        status,
        date: this.data.today
      })
      this.updateTaskResult(result, id)
      clearCloudCache('getDailyDetail:')
      clearCloudCache('getCalendarSummary:')
      setTimeout(() => this.playFeedback(status), 40)
      done()
    } catch (error) {
      showError(error)
    } finally {
      this.setData({ submittingTaskId: '' })
    }
  },

  async resetTask(event) {
    const { id } = event.currentTarget.dataset
    if (!id || this.data.submittingTaskId) return
    const done = markPerf('today.resetTask')
    wx.vibrateShort({ type: 'light' })
    this.setData({ submittingTaskId: id })
    try {
      const result = await callCloud('submitCheckin', {
        childId: this.data.activeChildId,
        taskId: id,
        status: 'reset',
        date: this.data.today
      })
      this.updateTaskResult(result, id)
      clearCloudCache('getDailyDetail:')
      clearCloudCache('getCalendarSummary:')
      wx.showToast({ title: '已重置，可重新选择', icon: 'none' })
      done()
    } catch (error) {
      showError(error, '重置失败')
    } finally {
      this.setData({ submittingTaskId: '' })
    }
  },

  updateTaskResult(result = {}, taskId) {
    const nextGroups = taskStatus.applyTaskStatusGroups(result.categories || [], this.data.activeChildId)
    const updates = {
      dailyTotal: result.dailyTotal || 0
    }
    let matched = false
    nextGroups.some((group, groupIndex) => {
      const taskIndex = (group.tasks || []).findIndex((task) => task._id === taskId)
      if (taskIndex < 0) return false
      updates[`categories[${groupIndex}].tasks[${taskIndex}]`] = group.tasks[taskIndex]
      matched = true
      return true
    })
    if (!matched || !this.data.categories.length) {
      updates.categories = nextGroups
    }
    this.setData(updates)
  },

  playFeedback(status) {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer)
    if (status === 'done') {
      this.setData({ celebrationVisible: true, encourageVisible: false })
      wx.showModal({
        title: '我做到啦！✅',
        content: '完成打卡！',
        showCancel: false,
        confirmText: '太棒啦'
      })
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

  closeEncourage() {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer)
    this.setData({ encourageVisible: false })
  },

  onHeroAvatarError() {
    this.setData({ childAvatarLoadError: true })
  },

  previewHeroAvatar() {
    if (!this.data.childAvatarUrl || this.data.childAvatarLoadError) {
      wx.showToast({ title: '还没有头像照片', icon: 'none' })
      return
    }
    wx.previewImage({
      urls: [this.data.childAvatarUrl],
      current: this.data.childAvatarUrl
    })
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/tasks' })
  }
})
