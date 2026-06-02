const app = getApp()
const { callCloud, showError, formatDate, getWeekRange } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

const MODULES = [
  { key: 'wishes', label: '愿望清单' },
  { key: 'ledger', label: '金币账本' },
  { key: 'exchange', label: '兑换物品' }
]

const EXCHANGE_CATEGORIES = ['游玩体验', '屏幕时间', '美食玩具', '学习成长']
const WISH_THEME_ICONS = [
  '/assets/wish-icons/playground.png',
  '/assets/wish-icons/movie.png',
  '/assets/wish-icons/cartoon.png',
  '/assets/wish-icons/book.png',
  '/assets/wish-icons/bike.png',
  '/assets/wish-icons/toy.png',
  '/assets/wish-icons/snack.png',
  '/assets/wish-icons/music.png',
  '/assets/wish-icons/paint.png',
  '/assets/wish-icons/sports.png',
  '/assets/wish-icons/travel.png',
  '/assets/wish-icons/gift.png'
]
const DEFAULT_EXCHANGE_ITEMS = [
  {
    _id: 'preset_playground',
    name: '游乐场游玩一次',
    costCoins: 80,
    description: '选择一个喜欢的游乐项目，开心玩一次。',
    category: '游玩体验',
    preset: true
  },
  {
    _id: 'preset_movie',
    name: '看电影一部',
    costCoins: 60,
    description: '和家人一起看一部喜欢的电影。',
    category: '游玩体验',
    preset: true
  },
  {
    _id: 'preset_cartoon',
    name: '动画片20分钟',
    costCoins: 20,
    description: '兑换一段约定好的动画片时间。',
    category: '屏幕时间',
    preset: true
  }
]

Page({
  data: {
    totalCoins: 0,
    streakDays: 0,
    activeModule: 'wishes',
    activeModuleIndex: 0,
    modules: MODULES,
    trend: [],
    wishes: [],
    expenses: [],
    exchangeItems: [],
    exchangeGroups: [],
    exchangeCategories: EXCHANGE_CATEGORIES,
    exchangeCategoryIndex: 0,
    ledgerStart: '',
    ledgerEnd: '',
    wishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' },
    editingWishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' },
    editingWishVisible: false,
    wishActionMenuVisible: false,
    activeWishId: '',
    activeWishName: '',
    activeWishMenuTop: false,
    expenseForm: { itemName: '', amount: '', date: formatDate(), photoFileId: '', photoTempPath: '' },
    expenseAmountError: '',
    exchangeForm: { itemId: '', name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] },
    savingWish: false,
    savingExpense: false,
    savingExchange: false,
    exchangeLoaded: false,
    exchangeConfirmVisible: false,
    activeExchangeItem: null,
    coinSpinVisible: false,
    coinDelta: 0,
    coinAnimating: false,
    lastRedeemedExchangeId: ''
  },

  onShow() {
    syncTab(this, 3)
    this.loadWallet()
  },

  async loadWallet(options = {}) {
    if (!app.globalData.activeChildId) return
    const cacheKey = `wallet_cache_${app.globalData.activeChildId}`
    const cached = wx.getStorageSync(cacheKey)
    if (cached && cached.totalCoins !== undefined) {
      this.setData({
        totalCoins: cached.totalCoins || 0,
        streakDays: cached.streakDays || 0,
        wishes: cached.wishes || [],
        expenses: cached.expenses || [],
        exchangeItems: cached.exchangeItems || [],
        exchangeGroups: cached.exchangeGroups || [],
        trend: cached.trend || []
      })
    }
    try {
      const week = getWeekRange()
      const startDate = this.data.ledgerStart || ''
      const endDate = this.data.ledgerEnd || ''
      const [calendar, detail] = await Promise.all([
        callCloud('getCalendarSummary', {
          childId: app.globalData.activeChildId,
          mode: 'week',
          start: week.start,
          end: week.end
        }),
        callCloud('getDailyDetail', {
          childId: app.globalData.activeChildId,
          includeTransactions: true,
          includeExpenses: true,
          includeWishes: true,
          startDate,
          endDate
        })
      ])
      const totalCoins = detail.totalCoins || 0
      let wishes = Array.isArray(detail.wishes)
        ? detail.wishes.map((item) => this.decorateWish(item, totalCoins))
        : this.data.wishes.map((item) => this.decorateWish(item, totalCoins))
      if (options.preserveLocalWishes) {
        const cloudIds = new Set(wishes.map((item) => item._id))
        const localOnly = this.data.wishes.filter((item) => item._id && !cloudIds.has(item._id))
        wishes = localOnly.concat(wishes)
      }
      const exchangeItems = this.data.exchangeItems.length ? this.data.exchangeItems : DEFAULT_EXCHANGE_ITEMS
      const walletData = {
        totalCoins,
        streakDays: detail.streakDays || 0,
        wishes,
        expenses: detail.expenses || [],
        exchangeItems,
        exchangeGroups: this.groupExchangeItems(exchangeItems),
        trend: (calendar.days || []).map((day) => ({
          ...day,
          label: day.date.slice(5),
          height: Math.max(16, Math.min(210, Math.abs(day.total) * 18 + 12))
        }))
      }
      this.setData(walletData)
      wx.setStorageSync(cacheKey, walletData)
      if (this.data.activeModule === 'exchange' && !this.data.exchangeLoaded) {
        this.loadExchangeItems()
      }
    } catch (error) {
      showError(error)
    }
  },

  groupExchangeItems(items) {
    return EXCHANGE_CATEGORIES.map((name) => ({
      name,
      items: items
        .filter((item) => item.category === name)
        .map((item) => this.decorateExchangeItem(item))
    })).filter((group) => group.items.length)
  },

  decorateExchangeItem(item) {
    const name = item.name || ''
    let themeIcon = item.themeIcon || ''
    if (!themeIcon) {
      if (name.includes('游乐') || name.includes('公园')) {
        themeIcon = '/assets/wish-icons/playground.png'
      } else if (name.includes('电影') || name.includes('影院')) {
        themeIcon = '/assets/wish-icons/movie.png'
      } else if (name.includes('动画') || name.includes('电视')) {
        themeIcon = '/assets/wish-icons/cartoon.png'
      } else if (item.category === '游玩体验') {
        themeIcon = '/assets/wish-icons/playground.png'
      } else if (item.category === '屏幕时间') {
        themeIcon = '/assets/wish-icons/cartoon.png'
      } else if (item.category === '美食玩具') {
        themeIcon = '/assets/wish-icons/gift.png'
      } else {
        themeIcon = this.pickWishThemeIcon(name || item._id || item.category)
      }
    }
    return {
      ...item,
      themeIcon,
      costCoins: Math.max(1, Number(item.costCoins || 1))
    }
  },

  decorateWish(item, totalCoins = this.data.totalCoins) {
    const cost = Math.max(1, Number(item.costCoins || 1))
    const percent = item.status === 'redeemed' ? 100 : Math.min(100, Math.round(Number(totalCoins || 0) / cost * 100))
    return {
      ...item,
      costCoins: cost,
      themeIcon: item.themeIcon || this.pickWishThemeIcon(item.name || item._id || ''),
      percent,
      isComplete: percent >= 100,
      progressClass: `p${Math.min(100, Math.max(0, Math.round(percent / 10) * 10))}`,
      progressDisplay: `${percent}%`,
      statusLine: item.status === 'redeemed'
        ? '已实现'
        : cost > Number(totalCoins || 0) ? `还差 ${cost - Number(totalCoins || 0)} 金币` : '可以实现啦',
      leftCoins: Math.max(0, cost - Number(totalCoins || 0))
    }
  },

  pickWishThemeIcon(seed = '') {
    const text = String(seed || '')
    if (!text) {
      return WISH_THEME_ICONS[Math.floor(Math.random() * WISH_THEME_ICONS.length)]
    }
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    }
    return WISH_THEME_ICONS[hash % WISH_THEME_ICONS.length]
  },

  randomWishThemeIcon() {
    return WISH_THEME_ICONS[Math.floor(Math.random() * WISH_THEME_ICONS.length)]
  },

  updateWalletCache(partial = {}) {
    if (!app.globalData.activeChildId) return
    const cacheKey = `wallet_cache_${app.globalData.activeChildId}`
    wx.setStorageSync(cacheKey, {
      totalCoins: this.data.totalCoins,
      streakDays: this.data.streakDays,
      wishes: this.data.wishes,
      expenses: this.data.expenses,
      exchangeItems: this.data.exchangeItems,
      exchangeGroups: this.data.exchangeGroups,
      trend: this.data.trend,
      ...partial
    })
  },

  switchModule(event) {
    const module = event.currentTarget.dataset.module
    const index = MODULES.findIndex((item) => item.key === module)
    if (module === this.data.activeModule || index < 0) return
    this.setData({
      activeModule: module,
      activeModuleIndex: index
    })
    if (module === 'exchange' && !this.data.exchangeLoaded) {
      this.loadExchangeItems()
    }
  },

  async loadExchangeItems() {
    if (!app.globalData.activeChildId) return
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: app.globalData.activeChildId,
        includeExchangeItems: true
      })
      const exchangeItems = detail.exchangeItems || DEFAULT_EXCHANGE_ITEMS
      this.setData({
        exchangeItems,
        exchangeGroups: this.groupExchangeItems(exchangeItems),
        exchangeLoaded: true
      })
      this.updateWalletCache({ exchangeItems, exchangeGroups: this.groupExchangeItems(exchangeItems) })
    } catch (error) {
      const exchangeItems = DEFAULT_EXCHANGE_ITEMS
      this.setData({
        exchangeItems,
        exchangeGroups: this.groupExchangeItems(exchangeItems),
        exchangeLoaded: true
      })
      this.updateWalletCache({ exchangeItems, exchangeGroups: this.groupExchangeItems(exchangeItems) })
    }
  },

  onWishInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`wishForm.${field}`]: event.detail.value })
  },

  noop() {},

  editWish(event) {
    const wish = this.data.wishes.find((item) => item._id === event.currentTarget.dataset.id)
    if (!wish) return
    this.setData({
      wishForm: {
        wishId: wish._id,
        name: wish.name || '',
        costCoins: String(wish.costCoins || ''),
        imageFileId: wish.imageFileId || '',
        imageTempPath: ''
      }
    })
  },

  resetWishForm() {
    this.setData({ wishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' } })
  },

  async saveWish() {
    const form = this.data.wishForm
    if (!form.name.trim() || !Number(form.costCoins)) {
      wx.showToast({ title: '愿望和金币都要填哦', icon: 'none' })
      return
    }
    this.setData({ savingWish: true })
    try {
      const imageFileId = form.imageTempPath ? await this.uploadImage(form.imageTempPath, 'wishes', 0.68) : form.imageFileId
      const themeIcon = form.themeIcon || this.randomWishThemeIcon()
      const result = await callCloud('updateWish', {
        action: form.wishId ? 'edit' : 'add',
        childId: app.globalData.activeChildId,
        wishId: form.wishId,
        name: form.name,
        costCoins: form.costCoins,
        imageFileId,
        themeIcon
      })
      this.applySavedWish(result.wish || {
        _id: form.wishId || `local_wish_${Date.now()}`,
        name: form.name.trim(),
        costCoins: Number(form.costCoins) || 1,
        imageFileId,
        themeIcon,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      }, Boolean(form.wishId))
      this.resetWishForm()
      await this.loadWallet({ preserveLocalWishes: true })
      wx.showToast({ title: '愿望已保存', icon: 'success' })
    } catch (error) {
      showError(error, '愿望保存失败')
    } finally {
      this.setData({ savingWish: false })
    }
  },

  onWishTouchStart(event) {
    if (this.wishLongPressTimer) clearTimeout(this.wishLongPressTimer)
    const wishId = event.currentTarget.dataset.id
    if (!wishId) return
    const wish = this.data.wishes.find((item) => item._id === wishId)
    const index = Number(event.currentTarget.dataset.index || 0)
    this.wishLongPressTimer = setTimeout(() => {
      wx.vibrateShort({ type: 'light' })
      this.setData({
        activeWishId: wishId,
        activeWishName: wish ? wish.name : '',
        activeWishMenuTop: index > 0,
        wishActionMenuVisible: true
      })
    }, 600)
  },

  onWishTouchEnd() {
    if (this.wishLongPressTimer) {
      clearTimeout(this.wishLongPressTimer)
      this.wishLongPressTimer = null
    }
  },

  closeWishActionMenu() {
    this.setData({
      wishActionMenuVisible: false,
      activeWishId: '',
      activeWishName: ''
    })
    this.onWishTouchEnd()
  },

  openEditWishDialog() {
    const wish = this.data.wishes.find((item) => item._id === this.data.activeWishId)
    if (!wish) return
    this.setData({
      wishActionMenuVisible: false,
      editingWishVisible: true,
      editingWishForm: {
        wishId: wish._id,
        name: wish.name || '',
        costCoins: String(wish.costCoins || ''),
        imageFileId: wish.imageFileId || '',
        imageTempPath: '',
        themeIcon: wish.themeIcon || this.pickWishThemeIcon(wish.name || wish._id)
      }
    })
  },

  closeEditWishDialog() {
    this.setData({
      editingWishVisible: false,
      editingWishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' }
    })
  },

  onEditingWishInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`editingWishForm.${field}`]: event.detail.value })
  },

  async saveEditingWish() {
    const form = this.data.editingWishForm
    if (!form.name.trim() || !Number(form.costCoins)) {
      wx.showToast({ title: '愿望和金币都要填哦', icon: 'none' })
      return
    }
    this.setData({ savingWish: true })
    try {
      const imageFileId = form.imageTempPath ? await this.uploadImage(form.imageTempPath, 'wishes', 0.68) : form.imageFileId
      const result = await callCloud('updateWish', {
        action: 'edit',
        childId: app.globalData.activeChildId,
        wishId: form.wishId,
        name: form.name,
        costCoins: form.costCoins,
        imageFileId,
        themeIcon: form.themeIcon
      })
      this.applySavedWish(result.wish || {
        _id: form.wishId,
        name: form.name.trim(),
        costCoins: Number(form.costCoins) || 1,
        imageFileId,
        themeIcon: form.themeIcon,
        status: 'open',
        updatedAt: new Date()
      }, true)
      this.closeEditWishDialog()
      await this.loadWallet({ preserveLocalWishes: true })
      wx.showToast({ title: '愿望已更新', icon: 'success' })
    } catch (error) {
      showError(error, '愿望保存失败')
    } finally {
      this.setData({ savingWish: false })
    }
  },

  confirmDeleteActiveWish() {
    const wish = this.data.wishes.find((item) => item._id === this.data.activeWishId)
    if (!wish) return
    wx.showModal({
      title: '确认删除',
      content: `删除后无法恢复，确定删除“${wish.name}”这个愿望吗？`,
      cancelText: '取消',
      confirmText: '确认删除',
      confirmColor: '#d94444',
      success: (res) => {
        if (res.confirm) {
          this.deleteWishById(wish._id)
        } else {
          this.closeWishActionMenu()
        }
      }
    })
  },

  async deleteWishById(wishId) {
    this.closeWishActionMenu()
    try {
      await callCloud('updateWish', {
        action: 'delete',
        childId: app.globalData.activeChildId,
        wishId
      })
      const wishes = this.data.wishes.filter((item) => item._id !== wishId)
      this.setData({ wishes })
      this.updateWalletCache({ wishes })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (error) {
      showError(error)
    }
  },

  applySavedWish(wish, isEdit) {
    const decorated = this.decorateWish(wish)
    let wishes = this.data.wishes.slice()
    const index = wishes.findIndex((item) => item._id === decorated._id)
    if (index >= 0) {
      wishes[index] = decorated
    } else if (isEdit) {
      wishes = wishes.map((item) => item._id === wish._id ? decorated : item)
    } else {
      wishes.unshift(decorated)
    }
    this.setData({ wishes })
    this.updateWalletCache({ wishes })
  },

  deleteWish(event) {
    const wishId = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除愿望',
      content: '确定把这个愿望移出清单吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callCloud('updateWish', {
            action: 'delete',
            childId: app.globalData.activeChildId,
            wishId
          })
          await this.loadWallet()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          showError(error)
        }
      }
    })
  },

  onExpenseInput(event) {
    const field = event.currentTarget.dataset.field
    if (field === 'amount') {
      return this.onExpenseAmountInput(event)
    }
    this.setData({ [`expenseForm.${field}`]: event.detail.value })
  },

  onExpenseAmountInput(event) {
    const raw = String(event.detail.value || '').trim()
    if (!raw) {
      this.setData({
        'expenseForm.amount': '',
        expenseAmountError: ''
      })
      return ''
    }
    if (this.isPositiveInteger(raw)) {
      this.setData({
        'expenseForm.amount': raw,
        expenseAmountError: ''
      })
      return raw
    }
    const normalized = /^\d+$/.test(raw) ? raw.replace(/^0+/, '') : this.data.expenseForm.amount
    const next = this.isPositiveInteger(normalized) ? normalized : ''
    this.setData({
      'expenseForm.amount': next,
      expenseAmountError: '请输入大于0的整数'
    })
    return next
  },

  isPositiveInteger(value) {
    return /^[1-9]\d*$/.test(String(value || '').trim())
  },

  onExpenseDateChange(event) {
    this.setData({ 'expenseForm.date': event.detail.value })
  },

  onLedgerStartChange(event) {
    this.setData({ ledgerStart: event.detail.value })
    this.loadWallet()
  },

  onLedgerEndChange(event) {
    this.setData({ ledgerEnd: event.detail.value })
    this.loadWallet()
  },

  clearLedgerFilter() {
    this.setData({ ledgerStart: '', ledgerEnd: '' })
    this.loadWallet()
  },

  async saveExpense() {
    const form = this.data.expenseForm
    if (!form.itemName.trim()) {
      wx.showToast({ title: '请填写购买物品', icon: 'none' })
      return
    }
    if (!this.isPositiveInteger(form.amount)) {
      this.setData({ expenseAmountError: '请输入大于0的整数' })
      wx.showToast({ title: '请输入大于0的整数', icon: 'none' })
      return
    }
    if (!form.date) {
      wx.showToast({ title: '请选择消费时间', icon: 'none' })
      return
    }
    this.setData({ savingExpense: true })
    try {
      const photoFileId = form.photoTempPath ? await this.uploadImage(form.photoTempPath, 'expenses', 0.5) : form.photoFileId
      await callCloud('updateWish', {
        action: 'addExpense',
        childId: app.globalData.activeChildId,
        itemName: form.itemName,
        amount: Number(form.amount),
        date: form.date,
        photoFileId
      })
      this.setData({
        expenseForm: { itemName: '', amount: '', date: formatDate(), photoFileId: '', photoTempPath: '' },
        expenseAmountError: ''
      })
      await this.loadWallet()
      wx.showToast({ title: '消费已记录', icon: 'success' })
    } catch (error) {
      showError(error, '消费记录失败')
    } finally {
      this.setData({ savingExpense: false })
    }
  },

  onExchangeInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`exchangeForm.${field}`]: event.detail.value })
  },

  onExchangeCategoryChange(event) {
    const index = Number(event.detail.value)
    this.setData({
      exchangeCategoryIndex: index,
      'exchangeForm.category': EXCHANGE_CATEGORIES[index]
    })
  },

  editExchange(event) {
    const item = this.data.exchangeItems.find((entry) => entry._id === event.currentTarget.dataset.id)
    if (!item || item.preset) return
    const categoryIndex = Math.max(0, EXCHANGE_CATEGORIES.indexOf(item.category))
    this.setData({
      exchangeCategoryIndex: categoryIndex,
      exchangeForm: {
        itemId: item._id,
        name: item.name || '',
        costCoins: String(item.costCoins || ''),
        description: item.description || '',
        category: item.category || EXCHANGE_CATEGORIES[0]
      }
    })
  },

  onExchangeLongPress(event) {
    const itemId = event.currentTarget.dataset.id
    const item = this.findExchangeItem(itemId)
    if (!item) return
    wx.vibrateShort({ type: 'light' })
    this.setData({
      activeExchangeItem: item,
      exchangeConfirmVisible: true
    })
  },

  findExchangeItem(itemId) {
    const items = []
    this.data.exchangeGroups.forEach((group) => {
      items.push(...group.items)
    })
    return items.find((item) => item._id === itemId)
  },

  closeExchangeConfirm() {
    this.setData({
      exchangeConfirmVisible: false,
      activeExchangeItem: null
    })
  },

  async confirmExchangeRedeem() {
    const item = this.data.activeExchangeItem
    if (!item) return
    const cost = Math.max(1, Number(item.costCoins || 1))
    if (Number(this.data.totalCoins || 0) < cost) {
      this.setData({ exchangeConfirmVisible: false })
      wx.showModal({
        title: '金币不足',
        content: '金币不足，无法完成兑换',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }
    if (this.data.coinAnimating) return
    this.setData({ coinAnimating: true })
    try {
      const result = await callCloud('updateWish', {
        action: 'redeemExchangeItem',
        childId: app.globalData.activeChildId,
        itemId: item.preset ? '' : item._id,
        name: item.name,
        costCoins: cost
      })
      const nextTotal = result.totalCoins !== undefined
        ? Number(result.totalCoins || 0)
        : Math.max(0, Number(this.data.totalCoins || 0) - cost)
      this.setData({
        totalCoins: nextTotal,
        coinDelta: cost,
        coinSpinVisible: true,
        exchangeConfirmVisible: false,
        lastRedeemedExchangeId: item._id || ''
      })
      this.updateWalletCache({ totalCoins: nextTotal })
      if (this.coinSpinTimer) clearTimeout(this.coinSpinTimer)
      this.coinSpinTimer = setTimeout(async () => {
        this.setData({
          coinSpinVisible: false,
          coinAnimating: false,
          activeExchangeItem: null
        })
        wx.showToast({ title: '兑换成功', icon: 'success' })
        await this.loadWallet()
        setTimeout(() => {
          this.setData({ lastRedeemedExchangeId: '' })
        }, 900)
      }, 1100)
    } catch (error) {
      this.setData({ coinAnimating: false })
      if ((error.message || '').includes('金币不足')) {
        wx.showModal({
          title: '金币不足',
          content: '金币不足，无法完成兑换',
          showCancel: false,
          confirmText: '确定'
        })
      } else {
        showError(error, '兑换失败')
      }
    }
  },

  resetExchangeForm() {
    this.setData({
      exchangeCategoryIndex: 0,
      exchangeForm: { itemId: '', name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] }
    })
  },

  async saveExchangeItem() {
    const form = this.data.exchangeForm
    if (!form.name.trim() || !Number(form.costCoins)) {
      wx.showToast({ title: '名称和金币都要填哦', icon: 'none' })
      return
    }
    this.setData({ savingExchange: true })
    try {
      await callCloud('updateWish', {
        action: form.itemId ? 'editExchangeItem' : 'addExchangeItem',
        childId: app.globalData.activeChildId,
        itemId: form.itemId,
        name: form.name,
        costCoins: form.costCoins,
        description: form.description,
        category: form.category
      })
      this.resetExchangeForm()
      await this.loadWallet()
      wx.showToast({ title: '兑换项已保存', icon: 'success' })
    } catch (error) {
      showError(error, '兑换项保存失败')
    } finally {
      this.setData({ savingExchange: false })
    }
  },

  deleteExchange(event) {
    const itemId = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除兑换项',
      content: '确定下架这个兑换物品吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callCloud('updateWish', {
            action: 'deleteExchangeItem',
            childId: app.globalData.activeChildId,
            itemId
          })
          await this.loadWallet()
          wx.showToast({ title: '已下架', icon: 'success' })
        } catch (error) {
          showError(error)
        }
      }
    })
  },

  chooseWishImage() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'wishForm.imageTempPath'))
  },

  chooseEditingWishImage() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'editingWishForm.imageTempPath'))
  },

  chooseExpensePhoto() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'expenseForm.photoTempPath'))
  },

  chooseImage(done) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles[0]
        if (file && file.tempFilePath) done(file.tempFilePath)
      }
    })
  },

  confirmSelectedImage(filePath, dataPath) {
    wx.previewImage({
      urls: [filePath],
      current: filePath
    })
    wx.showModal({
      title: '使用这张照片吗？',
      content: '照片是可选的，确认后会在保存时压缩上传。',
      cancelText: '不用照片',
      confirmText: '使用',
      success: (res) => {
        if (res.confirm) {
          this.setData({ [dataPath]: filePath })
        }
      }
    })
  },

  uploadImage(filePath, folder, quality) {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '图片处理中' })
      wx.getImageInfo({
        src: filePath,
        success: (info) => {
          const maxSide = folder === 'expenses' ? 720 : 960
          const scale = Math.min(1, maxSide / Math.max(info.width, info.height))
          const width = Math.max(1, Math.round(info.width * scale))
          const height = Math.max(1, Math.round(info.height * scale))
          const ctx = wx.createCanvasContext('walletImageCanvas', this)
          ctx.clearRect(0, 0, width, height)
          ctx.drawImage(filePath, 0, 0, width, height)
          ctx.draw(false, () => {
            wx.canvasToTempFilePath({
              canvasId: 'walletImageCanvas',
              width,
              height,
              destWidth: width,
              destHeight: height,
              fileType: 'jpg',
              quality,
              success: (res) => {
                wx.showLoading({ title: '上传中' })
                wx.cloud.uploadFile({
                  cloudPath: `${folder}/${app.globalData.activeChildId}_${Date.now()}.jpg`,
                  filePath: res.tempFilePath,
                  success: (uploadRes) => resolve(uploadRes.fileID),
                  fail: reject,
                  complete: () => wx.hideLoading()
                })
              },
              fail: reject
            }, this)
          })
        },
        fail: reject
      })
    })
  },

  previewImage(event) {
    const url = event.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  }
})
