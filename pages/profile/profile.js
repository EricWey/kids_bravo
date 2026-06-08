const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')
const taskStatus = require('../../utils/taskStatus')

Page({
  data: {
    ages: [4, 5, 6, 7, 8, 9, 10],
    ageIndex: 2,
    children: [],
    activeChildId: '',
    saving: false,
    showCreateModal: false,
    showTaskModal: false,
    showTaskEditor: false,
    taskDetailName: '',
    taskDetailChildId: '',
    taskDetails: [],
    taskGroups: [],
    editTask: null,
    editTaskIndex: -1,
    taskSaving: false,
    taskDeleting: false,
    showTaskDeleteAuth: false,
    pendingDeleteTask: null,
    pendingDeleteTaskIndex: -1,
    taskDeletePin: '',
    taskDeletePinVisible: false,
    refreshing: false,
    lastRefreshAt: 0,
    touchStartX: 0,
    touchingIndex: -1,
    profileSwipeOpen: false,
    taskTouchStartX: 0,
    taskTouchingIndex: -1,
    taskTouchingGroupIndex: -1,
    taskTouchingTaskIndex: -1,
    taskSwipeOpen: false,
    form: {
      nickname: '',
      age: 6,
      gender: 'girl'
    }
  },

  onLoad() {
    this.unsubscribeTaskStatus = taskStatus.subscribe((change) => this.applyTaskStatusChange(change))
  },

  onUnload() {
    if (this.unsubscribeTaskStatus) {
      this.unsubscribeTaskStatus()
      this.unsubscribeTaskStatus = null
    }
  },

  noop() {},

  openCreateModal() {
    this.setData({ showCreateModal: true })
  },

  closeCreateModal() {
    if (this.data.saving) return
    this.setData({ showCreateModal: false })
  },

  closeTaskDetail() {
    this.setData({
      showTaskModal: false,
      taskDetailName: '',
      taskDetailChildId: '',
      taskDetails: [],
      taskGroups: [],
      showTaskDeleteAuth: false,
      pendingDeleteTask: null,
      pendingDeleteTaskIndex: -1,
      taskDeletePin: '',
      taskDeletePinVisible: false
    })
  },

  closeTaskEditor() {
    if (this.data.taskSaving) return
    this.setData({
      showTaskEditor: false,
      editTask: null,
      editTaskIndex: -1
    })
  },

  dismissProfileSwipe() {
    if (this.data.taskSwipeOpen && this.data.taskTouchingIndex < 0) {
      this.closeTaskSwipe()
    }
    if (this.data.profileSwipeOpen && this.data.touchingIndex < 0) {
      this.closeSwipe()
    }
  },

  buildTaskGroups(taskDetails) {
    const groups = []
    const groupMap = {}
    ;(taskDetails || []).forEach((task, detailIndex) => {
      const name = task.category || '未分类任务'
      if (!groupMap[name]) {
        groupMap[name] = {
          name,
          tasks: []
        }
        groups.push(groupMap[name])
      }
      groupMap[name].tasks.push({
        ...task,
        detailIndex
      })
    })
    return groups
  },

  applyTaskStatusChange(change) {
    if (!change || change.childId !== this.data.taskDetailChildId) return
    const index = this.data.taskDetails.findIndex((task) => task._id === change.taskId)
    if (index < 0) return
    const taskDetails = this.data.taskDetails.slice()
    taskDetails[index] = {
      ...taskDetails[index],
      enabled: change.enabled !== false,
      statusSaving: false
    }
    this.setData({
      taskDetails,
      taskGroups: this.buildTaskGroups(taskDetails)
    })
  },

  onShow() {
    syncTab(this, 0)
    this.loadFromApp()
    this.refreshChildren({ silent: true, minInterval: 1200 })
  },

  loadFromApp() {
    const children = (app.globalData.children || []).map((child) => ({
      ...child,
      genderText: child.gender === 'girl' ? '女孩' : '男孩',
      offsetX: 0
    }))
    this.setData({
      children,
      activeChildId: app.globalData.activeChildId,
      profileSwipeOpen: children.some((child) => child.offsetX < 0)
    })
  },

  async reload() {
    await this.refreshChildren({ silent: false, minInterval: 0 })
  },

  async refreshChildren(options = {}) {
    const now = Date.now()
    const minInterval = options.minInterval === undefined ? 1000 : options.minInterval
    if (this.data.refreshing || (minInterval && now - this.data.lastRefreshAt < minInterval)) return
    this.setData({ refreshing: true, lastRefreshAt: now })
    try {
      const { children = [] } = await callCloud('getOpenId')
      app.updateChildren(children)
      if (!app.globalData.activeChildId && children.length) {
        app.setActiveChild(children[0]._id)
      }
      this.loadFromApp()
    } catch (error) {
      if (!options.silent) showError(error)
    } finally {
      this.setData({ refreshing: false })
    }
  },

  selectChild(event) {
    const childId = event.currentTarget.dataset.id
    const swiped = this.data.children.some((child) => child.offsetX < 0)
    if (swiped) {
      this.closeSwipe()
      return
    }
    app.setActiveChild(childId)
    this.setData({ activeChildId: childId })
    wx.showToast({ title: '已切换档案', icon: 'success' })
  },

  async showTaskDetail(event) {
    const childId = event.currentTarget.dataset.id
    const name = event.currentTarget.dataset.name
    try {
      const detail = await callCloud('getDailyDetail', {
        childId,
        includeDisabled: true
      })
      const taskDetails = []
      ;(detail.categories || []).forEach((category) => {
        category.tasks.forEach((task) => {
          taskDetails.push({
            ...task,
            category: category.name,
            createdText: this.formatDisplayTime(task.createdAt),
            statusSaving: false,
            offsetX: 0
          })
        })
      })
      this.setData({
        showTaskModal: true,
        taskDetailName: name,
        taskDetailChildId: childId,
        taskDetails,
        taskGroups: this.buildTaskGroups(taskDetails)
      })
    } catch (error) {
      showError(error, '任务详情加载失败')
    }
  },

  formatDisplayTime(value) {
    if (!value) return '暂无记录'
    const raw = value.$date || value
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return '暂无记录'
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    const hour = `${date.getHours()}`.padStart(2, '0')
    const minute = `${date.getMinutes()}`.padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  onTaskTouchStart(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (this.data.taskSwipeOpen && this.data.taskDetails[index] && this.data.taskDetails[index].offsetX === 0) {
      this.closeTaskSwipe()
      return
    }
    this.setData({
      taskTouchStartX: event.touches[0].clientX,
      taskTouchingIndex: index,
      taskTouchingGroupIndex: Number(event.currentTarget.dataset.groupIndex),
      taskTouchingTaskIndex: Number(event.currentTarget.dataset.taskIndex)
    })
  },

  onTaskTouchMove(event) {
    const index = this.data.taskTouchingIndex
    if (index < 0) return
    const groupIndex = this.data.taskTouchingGroupIndex
    const taskIndex = this.data.taskTouchingTaskIndex
    const deltaX = event.touches[0].clientX - this.data.taskTouchStartX
    const offsetX = Math.max(-96, Math.min(0, deltaX))
    const updates = { [`taskDetails[${index}].offsetX`]: offsetX }
    if (groupIndex >= 0 && taskIndex >= 0) {
      updates[`taskGroups[${groupIndex}].tasks[${taskIndex}].offsetX`] = offsetX
    }
    updates.taskSwipeOpen = offsetX < 0 || this.data.taskDetails.some((task, taskDetailIndex) => taskDetailIndex !== index && task.offsetX < 0)
    this.setData(updates)
  },

  onTaskTouchEnd() {
    const index = this.data.taskTouchingIndex
    if (index < 0) return
    const groupIndex = this.data.taskTouchingGroupIndex
    const taskIndex = this.data.taskTouchingTaskIndex
    const offsetX = this.data.taskDetails[index].offsetX < -44 ? -96 : 0
    const updates = {
      [`taskDetails[${index}].offsetX`]: offsetX,
      taskTouchingIndex: -1,
      taskTouchingGroupIndex: -1,
      taskTouchingTaskIndex: -1,
      taskSwipeOpen: offsetX < 0
    }
    if (groupIndex >= 0 && taskIndex >= 0) {
      updates[`taskGroups[${groupIndex}].tasks[${taskIndex}].offsetX`] = offsetX
    }
    this.setData(updates)
  },

  closeTaskSwipe() {
    const taskDetails = this.data.taskDetails.map((task) => ({ ...task, offsetX: 0 }))
    this.setData({
      taskDetails,
      taskGroups: this.buildTaskGroups(taskDetails),
      taskTouchingIndex: -1,
      taskTouchingGroupIndex: -1,
      taskTouchingTaskIndex: -1,
      taskSwipeOpen: false
    })
  },

  async toggleTaskStatusFromDetail(event) {
    const index = Number(event.currentTarget.dataset.index)
    const task = this.data.taskDetails[index]
    if (!task || task.statusSaving) return
    this.closeTaskSwipe()
    const nextEnabled = task.enabled === false
    const pendingTasks = this.data.taskDetails.map((item, itemIndex) => (
      itemIndex === index ? { ...item, statusSaving: true } : item
    ))
    this.setData({
      taskDetails: pendingTasks,
      taskGroups: this.buildTaskGroups(pendingTasks)
    })
    try {
      await taskStatus.setTaskStatus({
        childId: this.data.taskDetailChildId,
        taskId: task._id,
        enabled: nextEnabled
      })
      wx.showToast({ title: nextEnabled ? '任务已启用' : '任务已停用', icon: 'success' })
    } catch (error) {
      const taskDetails = this.data.taskDetails.slice()
      if (taskDetails[index]) {
        taskDetails[index] = {
          ...taskDetails[index],
          statusSaving: false
        }
      }
      this.setData({
        taskDetails,
        taskGroups: this.buildTaskGroups(taskDetails)
      })
      showError(error, nextEnabled ? '任务启用失败' : '任务停用失败')
    }
  },

  openTaskEditor(event) {
    const index = Number(event.currentTarget.dataset.index)
    const task = this.data.taskDetails[index]
    if (!task) return
    this.closeTaskSwipe()
    this.setData({
      showTaskEditor: true,
      editTaskIndex: index,
      editTask: {
        _id: task._id,
        name: task.name,
        description: task.description,
        rewardCoins: task.rewardCoins,
        penaltyCoins: task.penaltyCoins
      }
    })
  },

  onEditTaskInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`editTask.${field}`]: event.detail.value })
  },

  async saveTaskEdit() {
    const task = this.data.editTask
    if (!task || !task.name.trim()) {
      wx.showToast({ title: '请填写任务名称', icon: 'none' })
      return
    }
    this.setData({ taskSaving: true })
    try {
      await callCloud('manageChildProfile', {
        action: 'updateTask',
        childId: this.data.taskDetailChildId,
        taskId: task._id,
        name: task.name.trim(),
        description: task.description.trim(),
        rewardCoins: Number(task.rewardCoins) || 0,
        penaltyCoins: Number(task.penaltyCoins) || 0
      })
      const index = this.data.editTaskIndex
      const taskDetails = this.data.taskDetails.slice()
      taskDetails[index] = {
        ...taskDetails[index],
        name: task.name.trim(),
        description: task.description.trim(),
        rewardCoins: Number(task.rewardCoins) || 0,
        penaltyCoins: Number(task.penaltyCoins) || 0
      }
      this.setData({
        taskDetails,
        taskGroups: this.buildTaskGroups(taskDetails),
        taskSaving: false,
        showTaskEditor: false,
        editTask: null,
        editTaskIndex: -1
      })
      wx.showToast({ title: '任务已保存', icon: 'success' })
    } catch (error) {
      this.setData({ taskSaving: false })
      showError(error, '任务保存失败')
    }
  },

  confirmTaskDelete(event) {
    const index = Number(event.currentTarget.dataset.index)
    const task = this.data.taskDetails[index]
    if (!task) return
    this.closeTaskSwipe()
    this.setData({
      showTaskDeleteAuth: true,
      pendingDeleteTask: task,
      pendingDeleteTaskIndex: index,
      taskDeletePin: '',
      taskDeletePinVisible: false
    })
  },

  closeTaskDeleteAuth() {
    if (this.data.taskDeleting) return
    this.setData({
      showTaskDeleteAuth: false,
      pendingDeleteTask: null,
      pendingDeleteTaskIndex: -1,
      taskDeletePin: '',
      taskDeletePinVisible: false
    })
  },

  onTaskDeletePinInput(event) {
    this.setData({ taskDeletePin: event.detail.value })
  },

  toggleTaskDeletePinVisible() {
    this.setData({ taskDeletePinVisible: !this.data.taskDeletePinVisible })
  },

  confirmTaskDeleteAuth() {
    const pin = String(this.data.taskDeletePin || '').trim()
    if (!pin) {
      wx.showToast({ title: '请输入家长 PIN', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除任务',
      content: '验证通过后将停用该任务，今日打卡页不再展示。确认删除吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      confirmColor: '#d94444',
      success: (res) => {
        if (res.confirm) {
          this.deletePendingTask()
        }
      }
    })
  },

  async deletePendingTask() {
    const task = this.data.pendingDeleteTask
    const index = this.data.pendingDeleteTaskIndex
    if (!task || index < 0) return
    this.setData({ taskDeleting: true })
    try {
      await callCloud('manageChildProfile', {
        action: 'deleteTask',
        childId: this.data.taskDetailChildId,
        taskId: task._id,
        pin: this.data.taskDeletePin
      })
      const taskDetails = this.data.taskDetails.slice()
      taskDetails.splice(index, 1)
      this.setData({
        taskDetails,
        taskGroups: this.buildTaskGroups(taskDetails),
        taskDeleting: false,
        showTaskDeleteAuth: false,
        pendingDeleteTask: null,
        pendingDeleteTaskIndex: -1,
        taskDeletePin: '',
        taskDeletePinVisible: false
      })
      wx.showToast({ title: '任务已删除', icon: 'success' })
    } catch (error) {
      this.setData({ taskDeleting: false })
      const message = error && error.message ? error.message : ''
      if (message.indexOf('PIN') >= 0 || message.indexOf('不正确') >= 0) {
        wx.showToast({ title: '家长 PIN 验证失败', icon: 'none' })
      } else {
        showError(error, '任务删除失败')
      }
    }
  },

  onTouchStart(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (this.data.profileSwipeOpen && this.data.children[index] && this.data.children[index].offsetX === 0) {
      this.closeSwipe()
      return
    }
    this.setData({
      touchStartX: event.touches[0].clientX,
      touchingIndex: index
    })
  },

  onTouchMove(event) {
    const index = this.data.touchingIndex
    if (index < 0) return
    const deltaX = event.touches[0].clientX - this.data.touchStartX
    const offsetX = Math.max(-78, Math.min(0, deltaX))
    this.setData({
      [`children[${index}].offsetX`]: offsetX,
      profileSwipeOpen: offsetX < 0 || this.data.children.some((child, childIndex) => childIndex !== index && child.offsetX < 0)
    })
  },

  onTouchEnd() {
    const index = this.data.touchingIndex
    if (index < 0) return
    const offsetX = this.data.children[index].offsetX < -36 ? -78 : 0
    this.setData({
      [`children[${index}].offsetX`]: offsetX,
      touchingIndex: -1,
      profileSwipeOpen: offsetX < 0
    })
  },

  closeSwipe() {
    const children = this.data.children.map((child) => ({ ...child, offsetX: 0 }))
    this.setData({
      children,
      touchingIndex: -1,
      profileSwipeOpen: false
    })
  },

  chooseAvatar(event) {
    const childId = event.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['从相册选择', '拍摄新照片'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['album'] : ['camera']
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType,
          sizeType: ['compressed'],
          success: (chooseRes) => {
            const file = chooseRes.tempFiles[0]
            if (file && file.tempFilePath) {
              this.previewAvatar(childId, file.tempFilePath)
            }
          }
        })
      }
    })
  },

  previewAvatar(childId, filePath) {
    wx.previewImage({
      urls: [filePath],
      current: filePath
    })
    wx.showModal({
      title: '上传头像',
      content: '确认使用这张照片作为档案头像吗？',
      success: (res) => {
        if (res.confirm) {
          this.uploadAvatar(childId, filePath)
        }
      }
    })
  },

  async uploadAvatar(childId, filePath) {
    wx.showLoading({ title: '压缩中' })
    try {
      const compressed = await this.compressAvatar(filePath)
      wx.hideLoading()
      wx.showLoading({ title: '上传中 0%' })
      const cloudPath = `avatars/${childId}_${Date.now()}.jpg`
      const task = wx.cloud.uploadFile({
        cloudPath,
        filePath: compressed,
        success: async (res) => {
          try {
            await callCloud('manageChildProfile', {
              action: 'updateAvatar',
              childId,
              avatarFileId: res.fileID
            })
            wx.setStorageSync(`avatar_${childId}`, res.fileID)
            await this.reload()
            wx.showToast({ title: '头像已更新', icon: 'success' })
          } catch (error) {
            showError(error, '头像同步失败')
          }
        },
        fail: (error) => showError(error, '头像上传失败'),
        complete: () => wx.hideLoading()
      })
      task.onProgressUpdate((progress) => {
        wx.showLoading({ title: `上传中 ${progress.progress}%` })
      })
    } catch (error) {
      wx.hideLoading()
      showError(error, '头像处理失败')
    }
  },

  compressAvatar(filePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: filePath,
        success: (info) => {
          const side = Math.min(info.width, info.height)
          const sx = Math.max(0, (info.width - side) / 2)
          const sy = Math.max(0, (info.height - side) / 2)
          const ctx = wx.createCanvasContext('avatarCanvas', this)
          ctx.clearRect(0, 0, 200, 200)
          ctx.drawImage(filePath, sx, sy, side, side, 0, 0, 200, 200)
          ctx.draw(false, () => {
            wx.canvasToTempFilePath({
              canvasId: 'avatarCanvas',
              x: 0,
              y: 0,
              width: 200,
              height: 200,
              destWidth: 200,
              destHeight: 200,
              fileType: 'jpg',
              quality: 0.72,
              success: (res) => resolve(res.tempFilePath),
              fail: reject
            }, this)
          })
        },
        fail: reject
      })
    })
  },

  confirmDelete(event) {
    const { id, name } = event.currentTarget.dataset
    wx.showModal({
      title: '家长 PIN',
      editable: true,
      placeholderText: '输入 4 位 PIN',
      success: async (pinRes) => {
        if (!pinRes.confirm) return
        const pin = String(pinRes.content || '').trim()
        try {
          await callCloud('manageChildProfile', {
            action: 'verifyDeletePin',
            childId: id,
            pin
          })
          this.showFinalDeleteConfirm(id, name, pin)
        } catch (error) {
          const message = error && error.message ? error.message : ''
          if (message.indexOf('PIN') >= 0 || message.indexOf('不正确') >= 0) {
            wx.showToast({
              title: 'PIN 输入错误，请重新输入',
              icon: 'none'
            })
          } else {
            showError(error)
          }
        }
      }
    })
  },

  showFinalDeleteConfirm(childId, name, pin) {
    wx.showModal({
      title: '确认删除档案',
      content: '您确定要删除该小朋友的所有档案信息吗？此操作将永久删除包括金币数量、成就记录在内的所有数据，且无法恢复。',
      confirmText: '确认',
      cancelText: '取消',
      confirmColor: '#d94444',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '正在删除' })
        try {
          await callCloud('manageChildProfile', {
            action: 'deleteChild',
            childId,
            pin
          })
          await this.reload()
          if (app.globalData.activeChildId === childId) {
            const next = app.globalData.children[0]
            app.setActiveChild(next ? next._id : '')
          }
          this.loadFromApp()
          wx.showToast({ title: '档案信息已成功删除', icon: 'success' })
        } catch (error) {
          showError(error)
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onNameInput(event) {
    this.setData({ 'form.nickname': event.detail.value })
  },

  onAgeChange(event) {
    const ageIndex = Number(event.detail.value)
    this.setData({
      ageIndex,
      'form.age': this.data.ages[ageIndex]
    })
  },

  chooseGender(event) {
    const gender = event.currentTarget.dataset.gender
    if (gender === this.data.form.gender) return
    this.setData({ 'form.gender': gender })
  },

  async createProfile() {
    const nickname = this.data.form.nickname.trim()
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    if (nickname.length < 2) {
      wx.showToast({ title: '昵称至少 2 个字', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const result = await callCloud('createChildProfile', {
        nickname,
        age: this.data.form.age,
        gender: this.data.form.gender
      })
      app.updateChildren(result.children)
      app.setActiveChild(result.child._id)
      this.setData({
        saving: false,
        showCreateModal: false,
        'form.nickname': ''
      })
      this.loadFromApp()
      wx.showToast({ title: '档案已创建', icon: 'success' })
    } catch (error) {
      this.setData({ saving: false })
      showError(error)
    }
  },

  goTemplates() {
    wx.navigateTo({ url: '/pages/templates/templates' })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  }
})
