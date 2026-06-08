const { db, ok, getOpenid, getChild, getChildren, verifyPin } = require('./_shared/db')

async function removeByQuery(collection, query) {
  const res = await db.collection(collection).where(query).limit(1000).get()
  await Promise.all(res.data.map((item) => db.collection(collection).doc(item._id).remove()))
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const now = new Date()

  if (event.action === 'updateAvatar') {
    const child = await getChild(openid, event.childId)
    if (!event.avatarFileId) throw new Error('头像文件不存在')
    await db.collection('children').doc(child._id).update({
      data: {
        avatarUrl: event.avatarFileId,
        updatedAt: now
      }
    })
    return ok({ avatarUrl: event.avatarFileId })
  }

  if (event.action === 'verifyDeletePin') {
    await verifyPin(openid, String(event.pin || '').trim())
    await getChild(openid, event.childId)
    return ok()
  }

  if (event.action === 'deleteChild') {
    await verifyPin(openid, String(event.pin || '').trim())
    const child = await getChild(openid, event.childId)
    const logData = {
      ownerOpenid: openid,
      action: 'deleteChild',
      operatorOpenid: openid,
      childId: child._id,
      childSnapshot: {
        nickname: child.nickname,
        age: child.age,
        gender: child.gender,
        templateName: child.templateName || '',
        totalCoins: child.totalCoins || 0
      },
      createdAt: now
    }

    // Do not block irreversible deletion if the optional audit collection has not been created yet.
    await db.collection('operation_logs').add({ data: logData }).catch(() => {})
    await removeByQuery('tasks', { ownerOpenid: openid, childId: child._id })
    await removeByQuery('daily_records', { ownerOpenid: openid, childId: child._id })
    await removeByQuery('coin_transactions', { ownerOpenid: openid, childId: child._id })
    await removeByQuery('achievements', { ownerOpenid: openid, childId: child._id })
    await removeByQuery('wish_items', { ownerOpenid: openid, childId: child._id })
    await db.collection('children').doc(child._id).remove()
    const children = await getChildren(openid)
    return ok({ children })
  }

  if (event.action === 'updateTask') {
    await getChild(openid, event.childId)
    const task = await db.collection('tasks').doc(event.taskId).get()
    if (!task.data || task.data.ownerOpenid !== openid || task.data.childId !== event.childId) {
      throw new Error('任务不存在')
    }
    await db.collection('tasks').doc(event.taskId).update({
      data: {
        name: String(event.name || '').trim().slice(0, 28),
        description: String(event.description || '').trim().slice(0, 80),
        rewardCoins: Math.max(0, Number(event.rewardCoins) || 0),
        penaltyCoins: Math.max(0, Number(event.penaltyCoins) || 0),
        updatedAt: now
      }
    })
    return ok()
  }

  if (event.action === 'setTaskEnabled') {
    await getChild(openid, event.childId)
    const task = await db.collection('tasks').doc(event.taskId).get()
    if (!task.data || task.data.ownerOpenid !== openid || task.data.childId !== event.childId) {
      throw new Error('任务不存在')
    }
    const enabled = event.enabled !== false
    await db.collection('tasks').doc(event.taskId).update({
      data: {
        enabled,
        updatedAt: now
      }
    })
    return ok()
  }

  if (event.action === 'deleteTask') {
    await verifyPin(openid, String(event.pin || '').trim())
    await getChild(openid, event.childId)
    const task = await db.collection('tasks').doc(event.taskId).get()
    if (!task.data || task.data.ownerOpenid !== openid || task.data.childId !== event.childId) {
      throw new Error('任务不存在')
    }
    await db.collection('tasks').doc(event.taskId).update({
      data: {
        enabled: false,
        deletedAt: now,
        updatedAt: now
      }
    })
    return ok()
  }

  throw new Error('未知档案操作')
}
