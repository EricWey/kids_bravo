const { db, _, ok, getOpenid, getTasks, recomputeChildStats, formatDate } = require('./_shared/db')
const { CATEGORIES } = require('./_shared/templates')

function groupTasks(tasks, taskStates = {}) {
  return CATEGORIES.map((name) => ({
    name,
    tasks: tasks
      .filter((task) => task.category === name)
      .map((task) => ({
        ...task,
        status: taskStates[task._id] ? taskStates[task._id].status : ''
      }))
  }))
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
    const tx = await db.collection('coin_transactions')
      .where({ ownerOpenid: openid, childId, voided: _.neq(true) })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    data.transactions = tx.data
  }

  if (event.includeAchievements) {
    const wishes = await db.collection('wish_items')
      .where({ ownerOpenid: openid, childId })
      .orderBy('createdAt', 'desc')
      .get()
    data.wishes = wishes.data
  }

  return ok(data)
}
