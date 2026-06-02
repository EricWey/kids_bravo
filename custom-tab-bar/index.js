Component({
  data: {
    selected: 0,
    safeBottom: 0,
    fontSize: 12,
    tabs: [
      { pagePath: '/pages/profile/profile', text: '档案', icon: '档' },
      { pagePath: '/pages/today/today', text: '打卡', icon: '卡' },
      { pagePath: '/pages/calendar/calendar', text: '日历', icon: '历' },
      { pagePath: '/pages/wallet/wallet', text: '金币', icon: '币' },
      { pagePath: '/pages/achievements/achievements', text: '成就', icon: '章' }
    ]
  },

  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync()
      const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
      const itemWidth = info.windowWidth / 5
      const fontSize = Math.max(10, Math.min(13, Math.floor((itemWidth - 4) / 2.2)))
      this.setData({ safeBottom, fontSize })
    }
  },

  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const target = this.data.tabs[index]
      if (!target) return
      wx.switchTab({ url: target.pagePath })
    },

    setSelected(index) {
      this.setData({ selected: index })
    }
  }
})
