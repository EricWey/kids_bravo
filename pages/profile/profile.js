const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

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
    editTask: null,
    editTaskIndex: -1,
    taskSaving: false,
    refreshing: false,
    lastRefreshAt: 0,
    touchStartX: 0,
    touchingIndex: -1,
    taskTouchStartX: 0,
    taskTouchingIndex: -1,
    form: {
      nickname: '',
      age: 6,
      gender: 'girl'
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
      taskDetails: []
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
      activeChildId: app.globalData.activeChildId
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
            enabledText: task.enabled === false ? '已停用' : '启用中',
            createdText: this.formatDisplayTime(task.createdAt),
            offsetX: 0
          })
        })
      })
      this.setData({
        showTaskModal: true,
        taskDetailName: name,
        taskDetailChildId: childId,
        taskDetails
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
    this.setData({
      taskTouchStartX: event.touches[0].clientX,
      taskTouchingIndex: Number(event.currentTarget.dataset.index)
    })
  },

  onTaskTouchMove(event) {
    const index = this.data.taskTouchingIndex
    if (index < 0) return
    const deltaX = event.touches[0].clientX - this.data.taskTouchStartX
    const offsetX = Math.max(-96, Math.min(0, deltaX))
    this.setData({ [`taskDetails[${index}].offsetX`]: offsetX })
  },

  onTaskTouchEnd() {
    const index = this.data.taskTouchingIndex
    if (index < 0) return
    const offsetX = this.data.taskDetails[index].offsetX < -44 ? -96 : 0
    this.setData({
      [`taskDetails[${index}].offsetX`]: offsetX,
      taskTouchingIndex: -1
    })
  },

  closeTaskSwipe() {
    this.setData({
      taskDetails: this.data.taskDetails.map((task) => ({ ...task, offsetX: 0 }))
    })
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
      this.setData({
        [`taskDetails[${index}].name`]: task.name.trim(),
        [`taskDetails[${index}].description`]: task.description.trim(),
        [`taskDetails[${index}].rewardCoins`]: Number(task.rewardCoins) || 0,
        [`taskDetails[${index}].penaltyCoins`]: Number(task.penaltyCoins) || 0,
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
    wx.showModal({
      title: '删除任务',
      content: '确认删除该任务吗？此操作不可恢复。',
      confirmText: '确认',
      cancelText: '取消',
      confirmColor: '#d94444',
      success: async (res) => {
        if (!res.confirm) {
          this.closeTaskSwipe()
          return
        }
        try {
          await callCloud('manageChildProfile', {
            action: 'deleteTask',
            childId: this.data.taskDetailChildId,
            taskId: task._id
          })
          const taskDetails = this.data.taskDetails.slice()
          taskDetails.splice(index, 1)
          this.setData({ taskDetails })
          wx.showToast({ title: '任务已删除', icon: 'success' })
        } catch (error) {
          showError(error, '任务删除失败')
        }
      }
    })
  },

  onTouchStart(event) {
    this.setData({
      touchStartX: event.touches[0].clientX,
      touchingIndex: Number(event.currentTarget.dataset.index)
    })
  },

  onTouchMove(event) {
    const index = this.data.touchingIndex
    if (index < 0) return
    const deltaX = event.touches[0].clientX - this.data.touchStartX
    const offsetX = Math.max(-78, Math.min(0, deltaX))
    this.setData({ [`children[${index}].offsetX`]: offsetX })
  },

  onTouchEnd() {
    const index = this.data.touchingIndex
    if (index < 0) return
    const offsetX = this.data.children[index].offsetX < -36 ? -78 : 0
    this.setData({
      [`children[${index}].offsetX`]: offsetX,
      touchingIndex: -1
    })
  },

  closeSwipe() {
    const children = this.data.children.map((child) => ({ ...child, offsetX: 0 }))
    this.setData({ children })
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
