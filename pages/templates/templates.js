const app = getApp()
const { callCloud, showError } = require('../../utils/cloud')

Page({
  data: {
    typeTabs: [
      { value: 'daily', label: '日常模版' },
      { value: 'vacation', label: '寒暑假模版' }
    ],
    activeType: 'daily',
    templates: [],
    templateOptions: [],
    templateIndex: 0,
    currentTemplate: null,
    showPinModal: false,
    templatePin: '',
    templatePinVisible: false,
    pendingTemplateId: '',
    applying: false
  },

  onLoad() {
    this.loadTemplates()
  },

  async loadTemplates() {
    try {
      const { templates = [] } = await callCloud('initTemplates', { type: this.data.activeType })
      const nextTemplates = templates.map((item) => ({
        ...item,
        typeText: this.getTypeText(item.type),
        displayLabel: this.getTemplateLabel(item)
      }))
      const currentTemplate = nextTemplates[0] || null

      this.setData({
        templates: nextTemplates,
        templateOptions: nextTemplates.map((item) => item.displayLabel),
        templateIndex: 0,
        currentTemplate
      })
    } catch (error) {
      showError(error)
    }
  },

  getTypeText(type) {
    if (type === 'vacation') {
      return '寒暑假模版'
    }
    return '日常模版'
  },

  getTemplateLabel(template = {}) {
    return template.packageType || template.category || template.name || template.title || '未命名模版'
  },

  onTypeChange(event) {
    const nextType = event.currentTarget.dataset.type
    if (!nextType || nextType === this.data.activeType) return
    this.setData({ activeType: nextType })
    this.loadTemplates()
  },

  onTemplateChange(event) {
    const templateIndex = Number(event.detail.value)
    this.setData({
      templateIndex,
      currentTemplate: this.data.templates[templateIndex] || null
    })
  },

  async applyTemplate(event) {
    const childId = app.globalData.activeChildId
    if (!childId) {
      wx.showToast({ title: '请先选择档案', icon: 'none' })
      return
    }
    const templateId = event.currentTarget.dataset.id
    if (!templateId) {
      wx.showToast({ title: '请先选择模版', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认覆盖',
      content: '确认要用模板任务覆盖当前的任务吗？',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.setData({
          showPinModal: true,
          templatePin: '',
          templatePinVisible: false,
          pendingTemplateId: templateId
        })
      }
    })
  },

  onTemplatePinInput(event) {
    this.setData({ templatePin: event.detail.value })
  },

  toggleTemplatePinVisible() {
    this.setData({ templatePinVisible: !this.data.templatePinVisible })
  },

  closePinModal() {
    if (this.data.applying) return
    this.setData({
      showPinModal: false,
      templatePin: '',
      templatePinVisible: false,
      pendingTemplateId: ''
    })
  },

  noop() {},

  async confirmApplyTemplate() {
    const pin = String(this.data.templatePin || '').trim()
    if (!pin) {
      wx.showToast({ title: '请输入家长 PIN', icon: 'none' })
      return
    }

    this.setData({ applying: true })
    try {
      await callCloud('createChildProfile', {
        childId: app.globalData.activeChildId,
        templateId: this.data.pendingTemplateId,
        pin,
        mode: 'applyTemplate'
      })
      this.setData({
        applying: false,
        showPinModal: false,
        templatePin: '',
        templatePinVisible: false,
        pendingTemplateId: ''
      })
      wx.showToast({ title: '模板已应用', icon: 'success' })
    } catch (error) {
      this.setData({ applying: false })
      showError(error)
    }
  }
})
