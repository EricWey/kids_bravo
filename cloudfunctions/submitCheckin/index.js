const { db, _, ok, getOpenid, getTasks, recomputeChildStats, formatDate } = require('./_shared/db')
const { CATEGORIES } = require('./_shared/templates')

function buildCategories(tasks, states) {
  return CATEGORIES.map((name) => ({
    name,
    tasks: tasks
      .filter((task) => task.category === name)
      .map((task) => ({
        ...task,
        status: states[task._id] ? states[task._id].status : ''
      }))
  }))
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const childId = event.childId
  const taskId = event.taskId
  const status = event.status === 'reset' ? 'reset' : event.status === 'missed' ? 'missed' : 'done'
  const date = event.date || formatDate()
  const now = new Date()

  if (!childId || !taskId) throw new Error('缺少打卡信息')
  const tasks = await getTasks(openid, childId)
  const task = tasks.find((item) => item._id === taskId)
  if (!task) throw new Error('任务不存在或已停用')

  const recordRes = await db.collection('daily_records')
    .where({ ownerOpenid: openid, childId, date })
    .limit(1)
    .get()
  const record = recordRes.data[0]
  const taskStates = {}
  if (record) {
    ;(record.tasks || []).forEach((item) => {
      taskStates[item.taskId] = item
    })
  }

  const previous = taskStates[taskId]

  if (status === 'reset') {
    if (previous) {
      await db.collection('coin_transactions').add({
        data: {
          ownerOpenid: openid,
          childId,
          taskId,
          taskName: task.name,
          date,
          amount: -Number(previous.amount || 0),
          reason: '重置打卡',
          type: 'reset',
          createdAt: now
        }
      })
      delete taskStates[taskId]
    }

    const stateList = Object.keys(taskStates).map((key) => taskStates[key])
    const dailyTotal = stateList.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    if (record) {
      await db.collection('daily_records').doc(record._id).update({
        data: {
          tasks: stateList,
          dailyTotal,
          updatedAt: now
        }
      })
    }

    const stats = await recomputeChildStats(openid, childId)
    await db.collection('children').doc(childId).update({
      data: {
        totalCoins: stats.totalCoins,
        updatedAt: now
      }
    })

    return ok({
      dailyTotal,
      categories: buildCategories(tasks, taskStates),
      totalCoins: stats.totalCoins
    })
  }

  if (previous && previous.status === status) {
    return ok({
      dailyTotal: record.dailyTotal || 0,
      categories: buildCategories(tasks, taskStates)
    })
  }

  if (previous) {
    await db.collection('coin_transactions').add({
      data: {
        ownerOpenid: openid,
        childId,
        taskId,
        taskName: task.name,
        date,
        amount: -Number(previous.amount || 0),
        reason: '状态修正',
        type: 'correction',
        createdAt: now
      }
    })
  }

  const amount = status === 'done' ? Number(task.rewardCoins || 0) : -Number(task.penaltyCoins || 0)
  taskStates[taskId] = {
    taskId,
    taskName: task.name,
    category: task.category,
    status,
    amount,
    updatedAt: now
  }

  await db.collection('coin_transactions').add({
    data: {
      ownerOpenid: openid,
      childId,
      taskId,
      taskName: task.name,
      date,
      amount,
      reason: status === 'done' ? '完成任务' : '未完成任务',
      type: status,
      createdAt: now
    }
  })

  const stateList = Object.keys(taskStates).map((key) => taskStates[key])
  const dailyTotal = stateList.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  if (record) {
    await db.collection('daily_records').doc(record._id).update({
      data: {
        tasks: stateList,
        dailyTotal,
        updatedAt: now
      }
    })
  } else {
    await db.collection('daily_records').add({
      data: {
        ownerOpenid: openid,
        childId,
        date,
        tasks: stateList,
        dailyTotal,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  const stats = await recomputeChildStats(openid, childId)
  await db.collection('children').doc(childId).update({
    data: {
      totalCoins: stats.totalCoins,
      updatedAt: now
    }
  })

  return ok({
    dailyTotal,
    categories: buildCategories(tasks, taskStates),
    totalCoins: stats.totalCoins
  })
}
