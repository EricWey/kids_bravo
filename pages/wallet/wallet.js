const app = getApp()
const { callCloud, showError, formatDate, getWeekRange, markPerf, clearCloudCache } = require('../../utils/cloud')
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
const MAX_LEDGER_RANGE_DAYS = 30

function shiftDate(date, offset) {
  const target = new Date(`${date}T00:00:00`)
  target.setDate(target.getDate() + offset)
  return formatDate(target)
}

function daysBetween(start, end) {
  const startTime = new Date(`${start}T00:00:00`).getTime()
  const endTime = new Date(`${end}T00:00:00`).getTime()
  return Math.round((endTime - startTime) / 86400000)
}

function getRecentLedgerRange() {
  const end = formatDate()
  return {
    start: shiftDate(end, -6),
    end
  }
}

const DEFAULT_LEDGER_RANGE = getRecentLedgerRange()

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
    ledgerStart: DEFAULT_LEDGER_RANGE.start,
    ledgerEnd: DEFAULT_LEDGER_RANGE.end,
    ledgerPickerMax: DEFAULT_LEDGER_RANGE.end,
    loadingLedger: false,
    wishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' },
    editingWishForm: { wishId: '', name: '', costCoins: '', imageFileId: '', imageTempPath: '', themeIcon: '' },
    editingWishVisible: false,
    wishImagePreviewVisible: false,
    wishImagePreviewUrl: '',
    wishActionMenuVisible: false,
    activeWishId: '',
    activeWishName: '',
    activeWishMenuTop: false,
    expenseForm: { itemName: '', amount: '', date: formatDate(), photoFileId: '', photoTempPath: '' },
    expenseAmountError: '',
    activeExpenseSwipeId: '',
    pendingDeleteExpenseId: '',
    deleteExpenseDialogVisible: false,
    deleteExpensePin: '',
    deleteExpensePinVisible: false,
    deletingExpense: false,
    exchangeForm: { itemId: '', originalPresetId: '', editing: false, name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] },
    exchangeEditForm: { itemId: '', originalPresetId: '', name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] },
    exchangeEditCategoryIndex: 0,
    exchangeEditVisible: false,
    savingWish: false,
    savingExpense: false,
    savingExchange: false,
    exchangeLoaded: false,
    exchangeConfirmVisible: false,
    activeExchangeItem: null,
    exchangeEditAuthVisible: false,
    exchangeEditPin: '',
    exchangeEditPinVisible: false,
    pendingEditExchangeId: '',
    verifyingExchangeEdit: false,
    coinSpinVisible: false,
    coinDelta: 0,
    coinAnimating: false,
    lastRedeemedExchangeId: ''
  },

  onShow() {
    syncTab(this, 3)
    this.loadWallet()
  },

  dismissWalletSwipe() {
    if (this.data.activeExpenseSwipeId && !this.expenseTouchId) {
      this.closeExpenseSwipe()
    }
  },

  handleExpenseCardTap(event) {
    const expenseId = event.currentTarget.dataset.id
    if (this.data.activeExpenseSwipeId && this.data.activeExpenseSwipeId === expenseId) {
      this.closeExpenseSwipe()
    }
  },

  async loadWallet(options = {}) {
    if (!app.globalData.activeChildId) return
    const now = Date.now()
    const minInterval = options.minInterval === undefined ? 12000 : options.minInterval
    if (!options.forceRefresh && this.walletLoading) return
    if (!options.forceRefresh && this.walletLoadedAt && minInterval && now - this.walletLoadedAt < minInterval) return
    const done = markPerf('wallet.loadWallet')
    this.walletLoading = true
    const requestId = now
    this.walletRequestId = requestId
    const cacheKey = `wallet_cache_${app.globalData.activeChildId}`
    const cached = wx.getStorageSync(cacheKey)
    if (cached && cached.totalCoins !== undefined) {
      this.setData({
        totalCoins: cached.totalCoins || 0,
        streakDays: cached.streakDays || 0,
        wishes: cached.wishes || [],
        expenses: this.decorateExpenses(cached.expenses || []),
        exchangeItems: cached.exchangeItems || [],
        exchangeGroups: cached.exchangeGroups || [],
        trend: cached.trend || []
      })
    }
    try {
      const week = getWeekRange()
      const startDate = this.data.ledgerStart || ''
      const endDate = this.data.ledgerEnd || ''
      const [calendar, detail, weekExpenseDetail] = await Promise.all([
        callCloud('getCalendarSummary', {
          childId: app.globalData.activeChildId,
          mode: 'week',
          start: week.start,
          end: week.end,
          cacheTtl: 30000,
          dedupe: true,
          forceRefresh: !!options.forceRefresh
        }),
        callCloud('getDailyDetail', {
          childId: app.globalData.activeChildId,
          includeTransactions: true,
          includeExpenses: true,
          includeWishes: true,
          startDate,
          endDate,
          cacheTtl: 15000,
          dedupe: true,
          forceRefresh: !!options.forceRefresh
        }),
        callCloud('getDailyDetail', {
          childId: app.globalData.activeChildId,
          includeExpenses: true,
          startDate: week.start,
          endDate: week.end,
          cacheTtl: 30000,
          dedupe: true,
          forceRefresh: !!options.forceRefresh
        })
      ])
      if (this.walletRequestId !== requestId) return
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
      const calendarDays = calendar.days || []
      const weekExpenseMap = {}
      const weekExpenseCountMap = {}
      ;(weekExpenseDetail.expenses || []).forEach((item) => {
        const amount = Math.abs(Number(item.amount || 0))
        if (!item.date || amount <= 0) return
        weekExpenseMap[item.date] = (weekExpenseMap[item.date] || 0) + amount
        weekExpenseCountMap[item.date] = (weekExpenseCountMap[item.date] || 0) + 1
      })
      const maxTrendAmount = Math.max(
        1,
        ...calendarDays.map((day) => {
          const fallbackExpense = weekExpenseMap[day.date] || 0
          return Math.max(
            Math.abs(Number(day.incomeAmount !== undefined ? day.incomeAmount : day.total || 0)),
            Math.max(Number(day.expenseAmount || 0), fallbackExpense)
          )
        })
      )
      const walletData = {
        totalCoins,
        streakDays: detail.streakDays || 0,
        wishes,
        expenses: this.decorateExpenses(detail.expenses || []),
        exchangeItems,
        exchangeGroups: this.groupExchangeItems(exchangeItems),
        trend: calendarDays.map((day) => {
          const incomeAmount = Number(day.incomeAmount !== undefined ? day.incomeAmount : day.total || 0)
          const fallbackExpense = weekExpenseMap[day.date] || 0
          const expenseAmount = Math.max(Number(day.expenseAmount || 0), fallbackExpense)
          return {
            ...day,
            incomeAmount,
            expenseAmount,
            expenseCount: Math.max(Number(day.expenseCount || 0), weekExpenseCountMap[day.date] || 0),
            cumulativeCoins: Number(day.cumulativeCoins || 0),
            label: day.date.slice(5),
            incomeHeight: incomeAmount === 0 ? 0 : Math.max(16, Math.round(Math.abs(incomeAmount) / maxTrendAmount * 150)),
            expenseHeight: expenseAmount === 0 ? 0 : Math.max(16, Math.round(expenseAmount / maxTrendAmount * 150)),
            incomeText: incomeAmount > 0 ? `+${incomeAmount}` : incomeAmount < 0 ? `${incomeAmount}` : '',
            expenseText: expenseAmount > 0 ? `-${expenseAmount}` : '',
            cumulativeText: `${Number(day.cumulativeCoins || 0)}`
          }
        })
      }
      this.setData(walletData)
      this.walletLoadedAt = Date.now()
      wx.setStorageSync(cacheKey, walletData)
      if (this.data.activeModule === 'exchange' && !this.data.exchangeLoaded) {
        this.loadExchangeItems()
      }
      done(`wishes=${wishes.length} expenses=${walletData.expenses.length}`)
    } catch (error) {
      showError(error)
    } finally {
      this.walletLoading = false
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

  decorateExpenses(items) {
    return (items || []).map((item) => ({
      ...item,
      swipeOffset: item._id === this.data.activeExpenseSwipeId ? 88 : 0
    }))
  },

  validateLedgerRange(start, end) {
    if (!start || !end) {
      return '请选择开始日期和结束日期'
    }
    const diff = daysBetween(start, end)
    if (diff < 0) {
      return '结束日期不能早于开始日期'
    }
    if (diff > MAX_LEDGER_RANGE_DAYS) {
      return '最多只能选择一个月范围'
    }
    return ''
  },

  async refreshLedgerRange(start, end) {
    const message = this.validateLedgerRange(start, end)
    if (message) {
      wx.showToast({ title: message, icon: 'none' })
      return false
    }
    this.setData({
      ledgerStart: start,
      ledgerEnd: end,
      loadingLedger: true,
      activeExpenseSwipeId: ''
    })
    try {
      await this.loadWallet({ forceRefresh: true, minInterval: 0 })
      return true
    } finally {
      this.setData({ loadingLedger: false })
    }
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
    const availableCoins = Math.max(0, Number(totalCoins || 0))
    const percent = item.status === 'redeemed' ? 100 : Math.min(100, Math.round(availableCoins / cost * 100))
    return {
      ...item,
      costCoins: cost,
      themeIcon: item.themeIcon || this.pickWishThemeIcon(item.name || item._id || ''),
      displayImage: item.imageFileId || item.themeIcon || this.pickWishThemeIcon(item.name || item._id || ''),
      hasCustomImage: Boolean(item.imageFileId),
      percent,
      isComplete: percent >= 100,
      progressClass: `p${Math.min(100, Math.max(0, Math.round(percent / 10) * 10))}`,
      progressDisplay: `${percent}%`,
      statusLine: item.status === 'redeemed'
        ? '已实现'
        : cost > availableCoins ? `还差 ${cost - availableCoins} 金币` : '可以实现啦',
      leftCoins: Math.max(0, cost - availableCoins)
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
      clearCloudCache('getDailyDetail:')
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
      await this.loadWallet({ preserveLocalWishes: true, forceRefresh: true, minInterval: 0 })
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
      clearCloudCache('getDailyDetail:')
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
      await this.loadWallet({ preserveLocalWishes: true, forceRefresh: true, minInterval: 0 })
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
      clearCloudCache('getDailyDetail:')
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
          clearCloudCache('getDailyDetail:')
          await this.loadWallet({ forceRefresh: true, minInterval: 0 })
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

  async onLedgerStartChange(event) {
    await this.refreshLedgerRange(event.detail.value, this.data.ledgerEnd)
  },

  async onLedgerEndChange(event) {
    await this.refreshLedgerRange(this.data.ledgerStart, event.detail.value)
  },

  async clearLedgerFilter() {
    const range = getRecentLedgerRange()
    this.setData({ ledgerPickerMax: range.end })
    await this.refreshLedgerRange(range.start, range.end)
  },

  onExpenseTouchStart(event) {
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.expenseTouchStartX = touch.clientX
    this.expenseTouchId = event.currentTarget.dataset.id
    if (this.data.activeExpenseSwipeId && this.data.activeExpenseSwipeId !== this.expenseTouchId) {
      this.closeExpenseSwipe()
    }
  },

  onExpenseTouchMove(event) {
    const touch = event.touches && event.touches[0]
    const expenseId = event.currentTarget.dataset.id
    if (!touch || !expenseId || expenseId !== this.expenseTouchId) return
    const distance = this.expenseTouchStartX - touch.clientX
    if (distance <= 0) {
      this.updateExpenseSwipe(expenseId, 0)
      return
    }
    this.updateExpenseSwipe(expenseId, Math.min(88, distance))
  },

  onExpenseTouchEnd(event) {
    const expenseId = event.currentTarget.dataset.id
    if (!expenseId) return
    const expense = this.data.expenses.find((item) => item._id === expenseId)
    const offset = expense && expense.swipeOffset >= 80 ? 88 : 0
    this.updateExpenseSwipe(expenseId, offset)
    this.expenseTouchStartX = 0
    this.expenseTouchId = ''
  },

  updateExpenseSwipe(expenseId, offset) {
    const expenses = this.data.expenses.map((item) => ({
      ...item,
      swipeOffset: item._id === expenseId ? offset : 0
    }))
    this.setData({
      expenses,
      activeExpenseSwipeId: offset > 0 ? expenseId : ''
    })
  },

  closeExpenseSwipe() {
    const expenses = this.data.expenses.map((item) => ({
      ...item,
      swipeOffset: 0
    }))
    this.setData({
      expenses,
      activeExpenseSwipeId: ''
    })
  },

  openDeleteExpenseDialog(event) {
    const expenseId = event.currentTarget.dataset.id
    if (!expenseId) return
    this.setData({
      pendingDeleteExpenseId: expenseId,
      deleteExpenseDialogVisible: true,
      deleteExpensePin: '',
      deleteExpensePinVisible: false
    })
  },

  closeDeleteExpenseDialog() {
    if (this.data.deletingExpense) return
    this.setData({
      pendingDeleteExpenseId: '',
      deleteExpenseDialogVisible: false,
      deleteExpensePin: '',
      deleteExpensePinVisible: false
    })
  },

  onDeleteExpensePinInput(event) {
    this.setData({ deleteExpensePin: event.detail.value })
  },

  toggleDeleteExpensePinVisible() {
    this.setData({ deleteExpensePinVisible: !this.data.deleteExpensePinVisible })
  },

  confirmDeleteExpenseAuth() {
    if (!String(this.data.deleteExpensePin || '').trim()) {
      wx.showToast({ title: '请输入家长 PIN', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，并会重新计算金币余额。确定删除这条消费记录吗？',
      cancelText: '取消',
      confirmText: '确认删除',
      confirmColor: '#d94444',
      success: (res) => {
        if (res.confirm) {
          this.deleteExpenseById()
        }
      }
    })
  },

  async deleteExpenseById() {
    const transactionId = this.data.pendingDeleteExpenseId
    if (!transactionId) return
    this.setData({ deletingExpense: true })
    try {
      await callCloud('updateWish', {
        action: 'deleteExpense',
        childId: app.globalData.activeChildId,
        transactionId,
        pin: this.data.deleteExpensePin
      })
      clearCloudCache('getDailyDetail:')
      clearCloudCache('getCalendarSummary:')
      this.setData({
        deleteExpenseDialogVisible: false,
        pendingDeleteExpenseId: '',
        deleteExpensePin: '',
        activeExpenseSwipeId: ''
      })
      await this.loadWallet({ forceRefresh: true, minInterval: 0 })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (error) {
      showError(error, error.message || '删除失败')
    } finally {
      this.setData({ deletingExpense: false })
    }
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
    const ledgerRangeError = this.validateLedgerRange(this.data.ledgerStart, this.data.ledgerEnd)
    if (ledgerRangeError) {
      wx.showToast({ title: ledgerRangeError, icon: 'none' })
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
      clearCloudCache('getDailyDetail:')
      clearCloudCache('getCalendarSummary:')
      this.setData({
        expenseForm: { itemName: '', amount: '', date: formatDate(), photoFileId: '', photoTempPath: '' },
        expenseAmountError: ''
      })
      await this.loadWallet({ forceRefresh: true, minInterval: 0 })
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
    const itemId = event.currentTarget.dataset.id
    if (!itemId) return
    this.setData({
      pendingEditExchangeId: itemId,
      exchangeEditAuthVisible: true,
      exchangeEditPin: '',
      exchangeEditPinVisible: false
    })
  },

  closeExchangeEditAuth() {
    if (this.data.verifyingExchangeEdit) return
    this.setData({
      exchangeEditAuthVisible: false,
      exchangeEditPin: '',
      exchangeEditPinVisible: false,
      pendingEditExchangeId: ''
    })
  },

  onExchangeEditPinInput(event) {
    this.setData({ exchangeEditPin: event.detail.value })
  },

  toggleExchangeEditPinVisible() {
    this.setData({ exchangeEditPinVisible: !this.data.exchangeEditPinVisible })
  },

  async confirmExchangeEditAuth() {
    if (!String(this.data.exchangeEditPin || '').trim()) {
      wx.showToast({ title: '请输入家长 PIN', icon: 'none' })
      return
    }
    this.setData({ verifyingExchangeEdit: true })
    try {
      await callCloud('saveTasks', {
        action: 'verifyPin',
        pin: this.data.exchangeEditPin
      })
      const item = this.findExchangeItem(this.data.pendingEditExchangeId)
      if (!item) throw new Error('兑换物品不存在')
      this.enterExchangeEdit(item)
      this.setData({
        exchangeEditAuthVisible: false,
        exchangeEditPin: '',
        exchangeEditPinVisible: false,
        pendingEditExchangeId: ''
      })
    } catch (error) {
      showError(error, error.message || '验证失败')
    } finally {
      this.setData({ verifyingExchangeEdit: false })
    }
  },

  enterExchangeEdit(item) {
    const categoryIndex = Math.max(0, EXCHANGE_CATEGORIES.indexOf(item.category))
    this.setData({
      exchangeEditCategoryIndex: categoryIndex,
      exchangeEditVisible: true,
      exchangeEditForm: {
        itemId: item.preset ? '' : item._id,
        originalPresetId: item.preset ? item._id : item.originalPresetId || '',
        name: item.name || '',
        costCoins: String(item.costCoins || ''),
        description: item.description || '',
        category: item.category || EXCHANGE_CATEGORIES[0]
      }
    })
  },

  closeExchangeEditDialog() {
    this.setData({
      exchangeEditVisible: false,
      exchangeEditCategoryIndex: 0,
      exchangeEditForm: { itemId: '', originalPresetId: '', name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] }
    })
  },

  onExchangeEditInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`exchangeEditForm.${field}`]: event.detail.value })
  },

  onExchangeEditCategoryChange(event) {
    const index = Number(event.detail.value)
    this.setData({
      exchangeEditCategoryIndex: index,
      'exchangeEditForm.category': EXCHANGE_CATEGORIES[index]
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
      clearCloudCache('getDailyDetail:')
      clearCloudCache('getCalendarSummary:')
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
        await this.loadWallet({ forceRefresh: true, minInterval: 0 })
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
      exchangeForm: { itemId: '', originalPresetId: '', editing: false, name: '', costCoins: '', description: '', category: EXCHANGE_CATEGORIES[0] }
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
        originalPresetId: form.originalPresetId,
        name: form.name,
        costCoins: form.costCoins,
        description: form.description,
        category: form.category
      })
      clearCloudCache('getDailyDetail:')
      this.resetExchangeForm()
      await this.loadWallet({ forceRefresh: true, minInterval: 0 })
      wx.showToast({ title: '兑换项已保存', icon: 'success' })
    } catch (error) {
      showError(error, '兑换项保存失败')
    } finally {
      this.setData({ savingExchange: false })
    }
  },

  async saveExchangeEditItem() {
    const form = this.data.exchangeEditForm
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
        originalPresetId: form.originalPresetId,
        name: form.name,
        costCoins: form.costCoins,
        description: form.description,
        category: form.category
      })
      clearCloudCache('getDailyDetail:')
      this.closeExchangeEditDialog()
      await this.loadExchangeItems()
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
          clearCloudCache('getDailyDetail:')
          await this.loadWallet({ forceRefresh: true, minInterval: 0 })
          wx.showToast({ title: '已下架', icon: 'success' })
        } catch (error) {
          showError(error)
        }
      }
    })
  },

  chooseWishImage() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'wishForm.imageTempPath'), '愿望图片')
  },

  chooseEditingWishImage() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'editingWishForm.imageTempPath'), '愿望图片')
  },

  chooseExpensePhoto() {
    this.chooseImage((path) => this.confirmSelectedImage(path, 'expenseForm.photoTempPath'), '消费照片')
  },

  chooseImage(done, label = '图片') {
    wx.showActionSheet({
      itemList: ['拍摄照片', '从相册选择'],
      success: (action) => {
        const sourceType = action.tapIndex === 0 ? ['camera'] : ['album']
        wx.showLoading({ title: '选择图片中' })
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType,
          sizeType: ['compressed'],
          success: (res) => {
            const file = res.tempFiles[0]
            if (file && file.tempFilePath) done(file.tempFilePath)
          },
          fail: (error) => {
            if (!String(error.errMsg || '').includes('cancel')) {
              showError(error, `${label}选择失败`)
            }
          },
          complete: () => wx.hideLoading()
        })
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
      wx.showLoading({ title: '图片处理中', mask: true })
      const failUpload = (error) => {
        wx.hideLoading()
        reject(error)
      }
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
                wx.showLoading({ title: '上传中', mask: true })
                wx.cloud.uploadFile({
                  cloudPath: `${folder}/${app.globalData.activeChildId}_${Date.now()}.jpg`,
                  filePath: res.tempFilePath,
                  success: (uploadRes) => resolve(uploadRes.fileID),
                  fail: reject,
                  complete: () => wx.hideLoading()
                })
              },
              fail: failUpload
            }, this)
          })
        },
        fail: failUpload
      })
    })
  },

  previewImage(event) {
    this.closeExpenseSwipe()
    const url = event.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  },

  openWishImagePreview(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    this.setData({
      wishImagePreviewVisible: true,
      wishImagePreviewUrl: url
    })
  },

  closeWishImagePreview() {
    this.setData({
      wishImagePreviewVisible: false,
      wishImagePreviewUrl: ''
    })
  }
})
