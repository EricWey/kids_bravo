function syncTab(page, index) {
  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setSelected(index)
  }
}

module.exports = {
  syncTab
}
