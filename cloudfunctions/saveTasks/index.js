const { db, ok, getOpenid, hashPin, verifyPin, getTasks } = require('./_shared/db')

async function setPin(openid, event) {
  const existing = await db.collection('parent_settings').where({ ownerOpenid: openid }).limit(1).get()
  if (existing.data.length && existing.data[0].pinHash !== hashPin(event.oldPin || '')) {
    throw new Error('当前 PIN 不正确')
  }
  const data = {
    ownerOpenid: openid,
    pinHash: hashPin(event.newPin || ''),
    updatedAt: new Date()
  }
  if (existing.data.length) {
    await db.collection('parent_settings').doc(existing.data[0]._id).update({ data })
  } else {
    await db.collection('parent_settings').add({ data: { ...data, createdAt: new Date() } })
  }
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const now = new Date()

  if (event.action === 'setPin') {
    if (!/^\d{4}$/.test(String(event.newPin || ''))) throw new Error('PIN 需要是 4 位数字')
    await setPin(openid, event)
    return ok()
  }

  if (event.action === 'verifyPin') {
    await verifyPin(openid, event.pin)
    return ok()
  }

  await verifyPin(openid, event.pin)
  const current = await getTasks(openid, event.childId, true)
  const keepIds = new Set()
  const tasks = Array.isArray(event.tasks) ? event.tasks : []

  await Promise.all(tasks.map(async (task, sort) => {
    const data = {
      ownerOpenid: openid,
      childId: event.childId,
      category: task.category,
      name: String(task.name || '').slice(0, 28),
      description: String(task.description || '').slice(0, 80),
      rewardCoins: Math.max(0, Number(task.rewardCoins) || 0),
      penaltyCoins: Math.max(0, Number(task.penaltyCoins) || 0),
      enabled: task.enabled !== false,
      sort,
      updatedAt: now
    }

    if (task._id && current.some((item) => item._id === task._id)) {
      keepIds.add(task._id)
      await db.collection('tasks').doc(task._id).update({ data })
    } else {
      const res = await db.collection('tasks').add({ data: { ...data, createdAt: now } })
      keepIds.add(res._id)
    }
  }))

  await Promise.all(current
    .filter((task) => !keepIds.has(task._id))
    .map((task) => db.collection('tasks').doc(task._id).update({ data: { enabled: false, updatedAt: now } })))

  return ok()
}
