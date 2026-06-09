const CATEGORIES = ['学习成长类', '生活习惯类', '行为品德类']

const BASE_TASKS = {
  '学习成长类': [
    ['专注阅读 15 分钟', '安静阅读绘本、故事或拼音读物。', 5, 2],
    ['完成小练习', '完成今天约定的一页练习或口算。', 4, 2],
    ['讲一个新知识', '把今天学到的一件事讲给家人听。', 3, 1]
  ],
  '生活习惯类': [
    ['自己整理书包', '把明天需要的物品放好。', 3, 1],
    ['按时刷牙洗脸', '早晚认真完成清洁。', 3, 2],
    ['睡前收拾玩具', '把玩具送回自己的位置。', 4, 2]
  ],
  '行为品德类': [
    ['主动说谢谢', '得到帮助后认真表达感谢。', 3, 1],
    ['帮助家人一件事', '做一件力所能及的小家务。', 4, 1],
    ['控制小脾气', '遇到不开心时先说出来。', 5, 2]
  ]
}

function normalizeCategoryTask(task = {}) {
  return {
    name: task.taskName || task.name || task.title || task.taskTitle || '',
    description: task.description || '',
    rewardCoins: Math.max(0, Number(task.rewardCoins) || 0),
    penaltyCoins: Math.max(0, Number(task.penaltyCoins) || 0)
  }
}

function toList(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
  }
  return []
}

function normalizeCategory(category = {}, categoryIndex = 0) {
  return {
    name: category.name || category.category || CATEGORIES[categoryIndex] || '未分类',
    tasks: toList(category.tasks).map((task) => normalizeCategoryTask(task))
  }
}

function flattenCategoryEntries(category = {}, categoryIndex = 0) {
  const entries = [normalizeCategory(category, categoryIndex)]
  Object.keys(category || {}).forEach((key) => {
    if (key === 'name' || key === 'category' || key === 'tasks') return
    const value = category[key]
    if (value && typeof value === 'object' && (value.name || value.category || value.tasks)) {
      entries.push(normalizeCategory(value, Number(key) || entries.length))
    }
  })
  return entries
}

function normalizeTemplateCategories(template = {}) {
  const categories = toList(template.categories)
  if (categories.length) {
    return categories.reduce((list, category, categoryIndex) => (
      list.concat(flattenCategoryEntries(category, categoryIndex))
    ), [])
  }

  if (Array.isArray(template.tasks)) {
    const grouped = {}
    template.tasks.forEach((task) => {
      const categoryName = task.category || task.categoryName || '未分类'
      if (!grouped[categoryName]) grouped[categoryName] = []
      grouped[categoryName].push(normalizeCategoryTask(task))
    })
    return Object.keys(grouped).map((name) => ({
      name,
      tasks: grouped[name]
    }))
  }

  const singleTask = normalizeCategoryTask(template)
  if (singleTask.name) {
    return [{
      name: template.category || template.taskCategory || '未分类',
      tasks: [singleTask]
    }]
  }

  return []
}

function flattenTemplateTasks(template, childId, ownerOpenid) {
  const now = new Date()
  const tasks = []
  normalizeTemplateCategories(template).forEach((category) => {
    category.tasks.forEach((task, order) => {
      if (!task.name) return
      tasks.push({
        childId,
        ownerOpenid,
        category: category.name,
        name: task.name,
        description: task.description,
        rewardCoins: task.rewardCoins,
        penaltyCoins: task.penaltyCoins,
        enabled: true,
        sort: order,
        createdAt: now,
        updatedAt: now
      })
    })
  })
  return tasks
}

module.exports = {
  CATEGORIES,
  flattenTemplateTasks,
  normalizeTemplateCategories
}
