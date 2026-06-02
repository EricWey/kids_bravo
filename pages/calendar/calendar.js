const app = getApp()
const { callCloud, showError, formatDate, getWeekRange, getMonthRange } = require('../../utils/cloud')
const { syncTab } = require('../../utils/tabbar')

Page({
  data: {
    mode: 'week',
    modeIndex: 0,
    today: formatDate(),
    weekdays: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    days: [],
    selectedDate: formatDate(),
    selectedTasks: []
  },

  onShow() {
    syncTab(this, 2)
    this.loadCalendar()
  },

  async loadCalendar() {
    if (!app.globalData.activeChildId) {
      this.setData({ days: [], selectedTasks: [] })
      return
    }
    const range = this.data.mode === 'week' ? getWeekRange() : getMonthRange()
    try {
      const { days = [] } = await callCloud('getCalendarSummary', {
        childId: app.globalData.activeChildId,
        mode: this.data.mode,
        start: range.start,
        end: range.end
      })
      const today = formatDate()
      this.setData({
        today,
        days: days.map((day) => ({
          ...day,
          isToday: day.date === today,
          isFuture: day.date > today
        }))
      })
      this.loadDetail(this.data.selectedDate)
    } catch (error) {
      showError(error)
    }
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    this.setData({
      mode,
      modeIndex: mode === 'week' ? 0 : 1
    })
    this.loadCalendar()
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
        date
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
      this.setData({ selectedTasks })
    } catch (error) {
      showError(error)
    }
  }
})
