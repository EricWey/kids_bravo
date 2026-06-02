const app = getApp()
const { callCloud, showError, formatDate, getWeekRange, getMonthRange } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    mode: 'week',
    modeIndex: 0,
    currentDate: formatDate(),
    today: formatDate(),
    watermarkMonth: new Date().getMonth() + 1,
    swipeStartX: 0,
    swipeStartY: 0,
    swipeLastX: 0,
    swipeLastTime: 0,
    swipeVelocity: 0,
    panelWidth: 375,
    dragOffset: 0,
    trackTransition: 'none',
    isDragging: false,
    isAnimating: false,
    canGoPrev: true,
    canGoNext: true,
    minDate: '2020-01-01',
    maxDate: '',
    weekdays: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    days: [],
    panels: [],
    selectedDate: formatDate(),
    selectedTasks: [],
    selectedExpenses: []
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
    try {
      const viewDate = new Date(`${this.data.currentDate}T00:00:00`)
      const panelDates = [-1, 0, 1].map((offset) => this.getShiftedDate(viewDate, offset))
      const ranges = panelDates.map((date) => this.data.mode === 'week' ? getWeekRange(date) : getMonthRange(date))
      const results = await Promise.all(ranges.map((range) => callCloud('getCalendarSummary', {
        childId: app.globalData.activeChildId,
        mode: this.data.mode,
        start: range.start,
        end: range.end
      })))
      const today = formatDate()
      const panels = results.map((result, index) => ({
        key: `${this.data.mode}_${formatDate(panelDates[index])}`,
        watermarkMonth: panelDates[index].getMonth() + 1,
        days: (result.days || []).map((day) => ({
          ...day,
          isToday: day.date === today,
          isFuture: day.date > today
        }))
      }))
      this.setData({
        today,
        watermarkMonth: viewDate.getMonth() + 1,
        canGoPrev: this.canNavigate(viewDate, -1),
        canGoNext: this.canNavigate(viewDate, 1),
        days: panels[1] ? panels[1].days : [],
        panels
      })
      this.loadDetail(this.data.selectedDate)
    } catch (error) {
      showError(error)
    }
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === this.data.mode) {
      const today = formatDate()
      this.setData({
        currentDate: today,
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
      modeIndex: mode === 'week' ? 0 : 1,
      currentDate: formatDate(),
      selectedDate: formatDate(),
      selectedTasks: [],
      selectedExpenses: [],
      dragOffset: 0,
      trackTransition: 'transform 220ms ease'
    })
    this.loadCalendar()
    this.clearTrackTransition()
  },

  onCalendarTouchStart(event) {
    if (this.data.isAnimating) return
    const touch = event.touches[0]
    this.setData({
      swipeStartX: touch.clientX,
      swipeStartY: touch.clientY,
      swipeLastX: touch.clientX,
      swipeLastTime: Date.now(),
      swipeVelocity: 0,
      isDragging: true,
      trackTransition: 'none'
    })
  },

  onCalendarTouchMove(event) {
    if (!this.data.isDragging || this.data.isAnimating) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - this.data.swipeStartX
    const deltaY = touch.clientY - this.data.swipeStartY
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) return
    const now = Date.now()
    const elapsed = Math.max(16, now - this.data.swipeLastTime)
    const velocity = (touch.clientX - this.data.swipeLastX) / elapsed
    const bounded = this.getBoundedOffset(deltaX)
    this.setData({
      dragOffset: bounded,
      swipeLastX: touch.clientX,
      swipeLastTime: now,
      swipeVelocity: velocity
    })
  },

  onCalendarTouchEnd(event) {
    if (!this.data.isDragging || this.data.isAnimating) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - this.data.swipeStartX
    const deltaY = touch.clientY - this.data.swipeStartY
    if (Math.abs(deltaX) < 20 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      this.snapBack()
      return
    }
    const shouldCommit = Math.abs(deltaX) > this.data.panelWidth * 0.28 || Math.abs(this.data.swipeVelocity) > 0.55
    if (!shouldCommit) {
      this.snapBack()
      return
    }
    const direction = deltaX < 0 ? -1 : 1
    if ((direction < 0 && !this.data.canGoPrev) || (direction > 0 && !this.data.canGoNext)) {
      this.showBoundaryToast()
      this.snapBack()
      return
    }
    this.animateToPanel(direction)
  },

  animateToPanel(direction) {
    const targetOffset = direction < 0 ? -this.data.panelWidth : this.data.panelWidth
    const duration = Math.max(240, Math.min(340, 300 - Math.abs(this.data.swipeVelocity) * 80))
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
    const date = new Date(`${this.data.currentDate}T00:00:00`)
    if (this.data.mode === 'week') {
      date.setDate(date.getDate() - direction * 7)
    } else {
      date.setMonth(date.getMonth() - direction)
    }
    const panels = this.getRotatedPanels(direction)
    const centerPanel = panels[1] || { days: [] }
    const nextDate = formatDate(date)
    this.setData({
      currentDate: formatDate(date),
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
    if ((deltaX < 0 && !this.data.canGoPrev) || (deltaX > 0 && !this.data.canGoNext)) {
      return deltaX * 0.28
    }
    return Math.max(-this.data.panelWidth, Math.min(this.data.panelWidth, deltaX))
  },

  getShiftedDate(date, offset) {
    const next = new Date(date)
    if (this.data.mode === 'week') {
      next.setDate(next.getDate() + offset * 7)
    } else {
      next.setMonth(next.getMonth() + offset)
    }
    return next
  },

  canNavigate(date, direction) {
    const next = new Date(date)
    if (this.data.mode === 'week') {
      next.setDate(next.getDate() - direction * 7)
    } else {
      next.setMonth(next.getMonth() - direction)
    }
    const min = new Date(`${this.data.minDate}T00:00:00`)
    const max = new Date()
    max.setFullYear(max.getFullYear() + 1)
    max.setHours(0, 0, 0, 0)
    return next >= min && next <= max
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
    if (!day || day.isFuture) return
    this.setData({ selectedDate: date })
    this.loadDetail(date)
  },

  async loadDetail(date) {
    try {
      const detail = await callCloud('getDailyDetail', {
        childId: app.globalData.activeChildId,
        date,
        includeDateExpenses: true
      })
      const selectedTasks = []
      ;(detail.categories || []).forEach((category) => {
        category.tasks.forEach((task) => {
          if (task.status) {
            selectedTasks.push({
              ...task,
              category: category.name,
              statusText: task.status === 'done' ? '完成' : '未完成',
              amount: task.status === 'done' ? task.rewardCoins : -task.penaltyCoins
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
