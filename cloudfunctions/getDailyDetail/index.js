const { db, _, ok, getOpenid, getTasks, recomputeChildStats, formatDate } = require('./_shared/db')
const { CATEGORIES } = require('./_shared/templates')

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

function applyDateRange(query, startDate, endDate) {
  if (startDate && endDate) {
    query.date = _.gte(startDate).and(_.lte(endDate))
  } else if (startDate) {
    query.date = _.gte(startDate)
  } else if (endDate) {
    query.date = _.lte(endDate)
  }
  return query
}

function groupTasks(tasks, taskStates = {}) {
  const grouped = CATEGORIES.map((name) => ({
    name,
    tasks: tasks
      .filter((task) => task.category === name)
      .map((task) => ({
        ...task,
        status: taskStates[task._id] ? taskStates[task._id].status : '',
        amount: taskStates[task._id] ? taskStates[task._id].amount : undefined
      }))
  }))
  Object.keys(taskStates).forEach((taskId) => {
    if (tasks.some((task) => task._id === taskId)) return
    const state = taskStates[taskId]
    const categoryName = state.category || '学习成长类'
    let group = grouped.find((item) => item.name === categoryName)
    if (!group) {
      group = grouped[0]
    }
    group.tasks.push({
      _id: taskId,
      name: state.taskName || '历史任务',
      description: '该任务已被修改或删除，以下为历史打卡记录。',
      rewardCoins: Number(state.amount || 0) > 0 ? Number(state.amount || 0) : 0,
      penaltyCoins: Number(state.amount || 0) < 0 ? Math.abs(Number(state.amount || 0)) : 0,
      enabled: false,
      status: state.status,
      amount: Number(state.amount || 0)
    })
  })
  return grouped
}

function isCollectionMissing(error) {
  const message = error && (error.message || error.errMsg || '')
  return message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('collection not exists') ||
    message.includes('Db or Table not exist')
}

function mergeExchangeItems(customItems = []) {
  const items = DEFAULT_EXCHANGE_ITEMS.map((item) => ({ ...item }))
  const replacedPresetIds = new Set()
  customItems.forEach((item) => {
    const originalPresetId = item.originalPresetId || ''
    if (originalPresetId) {
      if (replacedPresetIds.has(originalPresetId)) return
      const index = items.findIndex((preset) => preset._id === originalPresetId)
      if (index >= 0) {
        items[index] = { ...item, preset: false }
        replacedPresetIds.add(originalPresetId)
        return
      }
    }
    items.push(item)
  })
  return items
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const childId = event.childId
  if (!childId) throw new Error('请先选择档案')
  const date = event.date || formatDate()
  const tasks = await getTasks(openid, childId, event.includeDisabled === true)

  const recordRes = await db.collection('daily_records')
    .where({ ownerOpenid: openid, childId, date })
    .limit(1)
    .get()
  const record = recordRes.data[0] || { dailyTotal: 0, tasks: [] }
  const taskStates = {}
  ;(record.tasks || []).forEach((item) => {
    taskStates[item.taskId] = item
  })

  const stats = await recomputeChildStats(openid, childId)
  const data = {
    date,
    dailyTotal: record.dailyTotal || 0,
    categories: groupTasks(tasks, taskStates),
    totalCoins: stats.totalCoins,
    streakDays: stats.streakDays,
    badges: stats.badges
  }

  if (event.includeTransactions) {
    const txQuery = applyDateRange({ ownerOpenid: openid, childId, voided: _.neq(true) }, event.startDate, event.endDate)
    const tx = await db.collection('coin_transactions')
      .where(txQuery)
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    data.transactions = tx.data
  }

  if (event.includeExpenses) {
    const expenseQuery = applyDateRange({
      ownerOpenid: openid,
      childId,
      type: _.in(['expense', 'exchange']),
      voided: _.neq(true)
    }, event.startDate, event.endDate)
    const expenses = await db.collection('coin_transactions')
      .where(expenseQuery)
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    data.expenses = expenses.data
  }

  if (event.includeDateExpenses) {
    const expenses = await db.collection('coin_transactions')
      .where({
        ownerOpenid: openid,
        childId,
        date,
        type: _.in(['expense', 'exchange']),
        voided: _.neq(true)
      })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    data.dateExpenses = expenses.data
  }

  if (event.includeDateExpensesLegacy) {
    const expenses = await db.collection('coin_transactions')
      .where({ ownerOpenid: openid, childId, voided: _.neq(true) })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    data.dateExpenses = expenses.data.filter((item) => ['expense', 'exchange'].includes(item.type) && item.date === date)
  }

  if (event.includeWishes) {
    const wishes = await db.collection('wish_items')
      .where({ ownerOpenid: openid, childId })
      .orderBy('createdAt', 'desc')
      .get()
    data.wishes = wishes.data
  }

  if (event.includeExchangeItems) {
    try {
      const exchange = await db.collection('exchange_items')
        .where({ ownerOpenid: openid, childId, enabled: _.neq(false) })
        .orderBy('createdAt', 'desc')
        .get()
      data.exchangeItems = mergeExchangeItems(exchange.data)
    } catch (error) {
      if (!isCollectionMissing(error)) throw error
      data.exchangeItems = DEFAULT_EXCHANGE_ITEMS
    }
  }

  return ok(data)
}
