const app = getApp()
const { callCloud, showError, formatDate, getWeekRange, markPerf } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    mode: 'week',
    today: formatDate(),
    watermarkMonth: new Date().getMonth() + 1,
    panelWidth: 375,
    dragOffset: 0,
    trackTransition: 'none',
    isDragging: false,
    isAnimating: false,
    minDate: '2020-01-01',
    weekdays: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    days: [],
    panels: [],
    selectedDate: formatDate(),
    selectedTasks: [],
    selectedExpenses: []
  },

  onLoad() {
    this.currentDate = formatDate()
    this.canGoPrev = true
    this.canGoNext = true
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeLastX = 0
    this.swipeLastTime = 0
    this.swipeVelocity = 0
  },

  onShow() {
    syncTab(this, 2)
    this.updatePanelWidth()
    setTimeout(() => {
      this.loadCalendar()
    }, 20)
  },

  updatePanelWidth() {
    let width = 375
    if (wx.getWindowInfo) {
      width = wx.getWindowInfo().windowWidth
    } else if (wx.getSystemInfoSync) {
      width = wx.getSystemInfoSync().windowWidth
    }
    this.setData({ panelWidth: width })
  },

  async loadCalendar() {
    if (!app.globalData.activeChildId) {
      this.setData({ days: [], panels: [], selectedTasks: [], selectedExpenses: [] })
      return
    }
    const done = markPerf('calendar.loadCalendar')
    const requestId = Date.now()
    this.calendarRequestId = requestId
    try {
      const viewDate = this.getViewDate(this.currentDate)
      const panelDates = [-1, 0, 1].map((offset) => this.getShiftedDate(viewDate, offset))
      const ranges = panelDates.map((date) => this.getPanelRange(date))
      const results = await Promise.all(ranges.map((range) => callCloud('getCalendarSummary', {
        childId: app.globalData.activeChildId,
        mode: this.data.mode,
        start: range.start,
        end: range.end,
        cacheTtl: 30000,
        dedupe: true
      })))
      if (this.calendarRequestId !== requestId) return
      const today = formatDate()
      const panels = results.map((result, index) => ({
        key: `${this.data.mode}_${index}_${formatDate(panelDates[index])}`,
        watermarkMonth: panelDates[index].getMonth() + 1,
        days: this.decoratePanelDays(result.days || [], panelDates[index], today)
      }))
      this.setData({
        today,
        watermarkMonth: viewDate.getMonth() + 1,
        days: panels[1] ? panels[1].days : [],
        panels
      })
      this.canGoPrev = this.canNavigate(viewDate, -1)
      this.canGoNext = this.canNavigate(viewDate, 1)
      this.loadDetail(this.data.selectedDate)
      done(`mode=${this.data.mode}`)
    } catch (error) {
      showError(error)
    }
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === this.data.mode) {
      const today = formatDate()
      this.currentDate = today
      this.setData({
        selectedDate: today,
        selectedTasks: [],
        selectedExpenses: [],
        dragOffset: 0,
        trackTransition: 'transform 220ms ease'
      })
      this.loadCalendar()
      this.clearTrackTransition()
      return
    }
    this.setData({
      mode,
      selectedDate: formatDate(),
      selectedTasks: [],
      selectedExpenses: [],
      dragOffset: 0,
      trackTransition: 'transform 220ms ease'
    })
    this.currentDate = formatDate()
    this.loadCalendar()
    this.clearTrackTransition()
  },

  onCalendarTouchStart(event) {
    if (this.data.isAnimating) return
    const touch = event.touches[0]
    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeLastX = touch.clientX
    this.swipeLastTime = Date.now()
    this.swipeVelocity = 0
    this.setData({
      isDragging: true,
      trackTransition: 'none'
    })
  },

  onCalendarTouchMove(event) {
    if (!this.data.isDragging || this.data.isAnimating) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - this.swipeStartX
    const deltaY = touch.clientY - this.swipeStartY
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) return
    const now = Date.now()
    const elapsed = Math.max(16, now - this.swipeLastTime)
    this.swipeVelocity = (touch.clientX - this.swipeLastX) / elapsed
    this.swipeLastX = touch.clientX
    this.swipeLastTime = now
    const bounded = this.getBoundedOffset(deltaX)
    this.pendingDragState = {
      dragOffset: bounded
    }
    if (this.dragFrameTimer) return
    this.dragFrameTimer = setTimeout(() => {
      this.dragFrameTimer = null
      if (!this.pendingDragState) return
      this.setData(this.pendingDragState)
      this.pendingDragState = null
    }, 16)
  },

  onCalendarTouchEnd(event) {
    if (!this.data.isDragging || this.data.isAnimating) return
    if (this.dragFrameTimer) {
      clearTimeout(this.dragFrameTimer)
      this.dragFrameTimer = null
      this.pendingDragState = null
    }
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - this.swipeStartX
    const deltaY = touch.clientY - this.swipeStartY
    if (Math.abs(deltaX) < 20 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      this.snapBack()
      return
    }
    const shouldCommit = Math.abs(deltaX) > this.data.panelWidth * 0.28 || Math.abs(this.swipeVelocity || 0) > 0.55
    if (!shouldCommit) {
      this.snapBack()
      return
    }
    const direction = deltaX < 0 ? -1 : 1
    if ((direction < 0 && !this.canGoPrev) || (direction > 0 && !this.canGoNext)) {
      this.showBoundaryToast()
      this.snapBack()
      return
    }
    this.animateToPanel(direction)
  },

  animateToPanel(direction) {
    const targetOffset = direction < 0 ? -this.data.panelWidth : this.data.panelWidth
    const duration = Math.max(220, Math.min(320, 280 - Math.abs(this.swipeVelocity || 0) * 80))
    this.setData({
      dragOffset: targetOffset,
      trackTransition: `transform ${duration}ms cubic-bezier(0.22, 0.9, 0.2, 1)`,
      isAnimating: true,
      isDragging: false
    })
    if (this.animationTimer) clearTimeout(this.animationTimer)
    this.animationTimer = setTimeout(() => {
      this.shiftCalendar(direction)
    }, duration)
  },

  shiftCalendar(direction) {
    const date = this.getViewDate(this.currentDate)
    if (this.data.mode === 'week') {
      date.setDate(date.getDate() - direction * 7)
    } else {
      date.setMonth(date.getMonth() - direction, 1)
    }
    const panels = this.getRotatedPanels(direction)
    const centerPanel = panels[1] || { days: [] }
    const nextDate = formatDate(date)
    this.currentDate = nextDate
    this.setData({
      selectedDate: nextDate,
      selectedTasks: [],
      selectedExpenses: [],
      days: centerPanel.days || [],
      panels,
      watermarkMonth: date.getMonth() + 1,
      dragOffset: 0,
      trackTransition: 'none',
      isAnimating: false,
      isDragging: false
    })
    this.loadCalendar()
  },

  getRotatedPanels(direction) {
    const panels = this.data.panels
    if (panels.length !== 3) return panels
    if (direction < 0) {
      return [panels[1], panels[2], panels[2]]
    }
    return [panels[0], panels[0], panels[1]]
  },

  snapBack() {
    this.setData({
      dragOffset: 0,
      trackTransition: 'transform 220ms cubic-bezier(0.22, 0.9, 0.3, 1)',
      isDragging: false
    })
    this.clearTrackTransition()
  },

  clearTrackTransition() {
    if (this.swipeTimer) clearTimeout(this.swipeTimer)
    this.swipeTimer = setTimeout(() => {
      this.setData({ trackTransition: 'none' })
    }, 280)
  },

  getBoundedOffset(deltaX) {
    if ((deltaX < 0 && !this.canGoPrev) || (deltaX > 0 && !this.canGoNext)) {
      return deltaX * 0.28
    }
    return Math.max(-this.data.panelWidth, Math.min(this.data.panelWidth, deltaX))
  },

  getShiftedDate(date, offset) {
    const next = new Date(date)
    if (this.data.mode === 'week') {
      next.setDate(next.getDate() + offset * 7)
    } else {
      next.setMonth(next.getMonth() + offset, 1)
    }
    return next
  },

  canNavigate(date, direction) {
    const next = new Date(date)
    if (this.data.mode === 'week') {
      next.setDate(next.getDate() - direction * 7)
    } else {
      next.setMonth(next.getMonth() - direction, 1)
    }
    const min = new Date(`${this.data.minDate}T00:00:00`)
    const max = new Date()
    max.setFullYear(max.getFullYear() + 1)
    max.setHours(0, 0, 0, 0)
    return next >= min && next <= max
  },

  getViewDate(value) {
    const date = new Date(`${value}T00:00:00`)
    if (this.data.mode === 'month') {
      date.setDate(1)
    }
    return date
  },

  getPanelRange(date) {
    if (this.data.mode === 'week') return getWeekRange(date)
    const first = new Date(date.getFullYear(), date.getMonth(), 1)
    const start = new Date(first)
    const startDay = start.getDay() || 7
    start.setDate(first.getDate() - startDay + 1)
    const end = new Date(start)
    end.setDate(start.getDate() + 41)
    return { start: formatDate(start), end: formatDate(end) }
  },

  decoratePanelDays(days, viewDate, today) {
    const viewMonth = viewDate.getMonth()
    return days.map((day) => {
      const date = new Date(`${day.date}T00:00:00`)
      const inCurrentMonth = this.data.mode !== 'month' || date.getMonth() === viewMonth
      const isPlaceholder = this.data.mode === 'month' && !inCurrentMonth
      return {
        ...day,
        inCurrentMonth,
        isPlaceholder,
        dayLabel: isPlaceholder ? '' : String(day.day),
        isToday: day.date === today,
        isFuture: day.date > today,
        coinClass: Number(day.total || 0) > 0 ? 'coin-plus' : Number(day.total || 0) < 0 ? 'coin-minus' : 'coin-zero'
      }
    })
  },

  showBoundaryToast() {
    const now = Date.now()
    if (this.boundaryToastAt && now - this.boundaryToastAt < 1200) return
    this.boundaryToastAt = now
    wx.showToast({
      title: '到头啦',
      icon: 'none'
    })
  },

  selectDay(event) {
    const date = event.currentTarget.dataset.date
    const day = this.data.days.find((item) => item.date === date)
    if (!day || day.isFuture || day.isPlaceholder) return
    this.setData({ selectedDate: date })
    this.loadDetail(date)
  },

  async loadDetail(date) {
    if (!app.globalData.activeChildId) return
    const requestId = Date.now()
    this.detailRequestId = requestId
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: app.globalData.activeChildId,
        date,
        includeDateExpenses: true,
        cacheTtl: 20000,
        dedupe: true
      })
      if (this.detailRequestId !== requestId) return
      const selectedTasks = []
      ;(detail.categories || []).forEach((category) => {
        category.tasks.forEach((task) => {
          if (task.status) {
            selectedTasks.push({
              ...task,
              category: category.name,
              statusText: task.status === 'done' ? '完成' : '未完成',
              amount: task.amount !== undefined ? Number(task.amount) : task.status === 'done' ? task.rewardCoins : -task.penaltyCoins
            })
          }
        })
      })
      this.setData({
        selectedTasks,
        selectedExpenses: detail.dateExpenses || []
      })
    } catch (error) {
      showError(error)
    }
  }
})
