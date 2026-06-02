const { db, ok, getOpenid, getChild, verifyPin, recomputeChildStats } = require('./_shared/db')

const EXCHANGE_CATEGORIES = ['游玩体验', '屏幕时间', '美食玩具', '学习成长']

function cleanText(value, max = 40) {
  return String(value || '').trim().slice(0, max)
}

function parsePositiveInteger(value) {
  const text = String(value || '').trim()
  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error('请输入大于0的整数')
  }
  return Number(text)
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const childId = event.childId
  await getChild(openid, childId)

  if (event.action === 'add') {
    const name = cleanText(event.name, 24)
    if (!name) throw new Error('请填写愿望')
    const now = new Date()
    const wish = {
      ownerOpenid: openid,
      childId,
      name,
      costCoins: Math.max(1, Number(event.costCoins) || 1),
      imageFileId: cleanText(event.imageFileId, 180),
      themeIcon: cleanText(event.themeIcon, 120),
      status: 'open',
      createdAt: now,
      updatedAt: now
    }
    const res = await db.collection('wish_items').add({
      data: {
        ...wish
      }
    })
    return ok({
      wish: {
        _id: res._id,
        ...wish
      }
    })
  }

  if (event.action === 'edit') {
    const name = cleanText(event.name, 24)
    if (!name) throw new Error('请填写愿望')
    const wish = await db.collection('wish_items').doc(event.wishId).get()
    if (!wish.data || wish.data.ownerOpenid !== openid || wish.data.childId !== childId) {
      throw new Error('愿望不存在')
    }
    const updated = {
      name,
      costCoins: Math.max(1, Number(event.costCoins) || 1),
      imageFileId: cleanText(event.imageFileId, 180),
      themeIcon: cleanText(event.themeIcon, 120),
      updatedAt: new Date()
    }
    await db.collection('wish_items').doc(event.wishId).update({
      data: updated
    })
    return ok({
      wish: {
        ...wish.data,
        ...updated
      }
    })
  }

  if (event.action === 'delete') {
    const wish = await db.collection('wish_items').doc(event.wishId).get()
    if (!wish.data || wish.data.ownerOpenid !== openid || wish.data.childId !== childId) {
      throw new Error('愿望不存在')
    }
    await db.collection('wish_items').doc(event.wishId).remove()
    return ok()
  }

  if (event.action === 'addExpense') {
    const itemName = cleanText(event.itemName, 32)
    if (!itemName) throw new Error('请填写购买物品')
    const amount = parsePositiveInteger(event.amount)
    const date = cleanText(event.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择消费时间')
    const now = new Date()
    await db.collection('coin_transactions').add({
      data: {
        ownerOpenid: openid,
        childId,
        itemName,
        date,
        amount: -amount,
        reason: `购买：${itemName}`,
        type: 'expense',
        photoFileId: cleanText(event.photoFileId, 180),
        createdAt: now
      }
    })
    const stats = await recomputeChildStats(openid, childId)
    await db.collection('children').doc(childId).update({
      data: {
        totalCoins: stats.totalCoins,
        updatedAt: now
      }
    })
    return ok({ totalCoins: stats.totalCoins })
  }

  if (event.action === 'addExchangeItem' || event.action === 'editExchangeItem') {
    const name = cleanText(event.name, 32)
    if (!name) throw new Error('请填写兑换物品')
    const data = {
      ownerOpenid: openid,
      childId,
      name,
      costCoins: parsePositiveInteger(event.costCoins),
      description: cleanText(event.description, 80),
      category: EXCHANGE_CATEGORIES.includes(event.category) ? event.category : EXCHANGE_CATEGORIES[0],
      updatedAt: new Date()
    }
    if (event.action === 'addExchangeItem') {
      await db.collection('exchange_items').add({
        data: {
          ...data,
          enabled: true,
          createdAt: new Date()
        }
      })
      return ok()
    }
    const item = await db.collection('exchange_items').doc(event.itemId).get()
    if (!item.data || item.data.ownerOpenid !== openid || item.data.childId !== childId) {
      throw new Error('兑换物品不存在')
    }
    await db.collection('exchange_items').doc(event.itemId).update({ data })
    return ok()
  }

  if (event.action === 'deleteExchangeItem') {
    const item = await db.collection('exchange_items').doc(event.itemId).get()
    if (!item.data || item.data.ownerOpenid !== openid || item.data.childId !== childId) {
      throw new Error('兑换物品不存在')
    }
    await db.collection('exchange_items').doc(event.itemId).remove()
    return ok()
  }

  if (event.action === 'redeemExchangeItem') {
    const itemName = cleanText(event.name, 32)
    if (!itemName) throw new Error('兑换物品不存在')
    const amount = parsePositiveInteger(event.costCoins)
    const stats = await recomputeChildStats(openid, childId)
    if (stats.totalCoins < amount) {
      throw new Error('金币不足，无法完成兑换')
    }
    const now = new Date()
    await db.collection('coin_transactions').add({
      data: {
        ownerOpenid: openid,
        childId,
        exchangeItemId: cleanText(event.itemId, 80),
        itemName,
        date: now.toISOString().slice(0, 10),
        amount: -amount,
        reason: `兑换物品：${itemName}`,
        type: 'exchange',
        createdAt: now
      }
    })
    const nextStats = await recomputeChildStats(openid, childId)
    await db.collection('children').doc(childId).update({
      data: {
        totalCoins: nextStats.totalCoins,
        updatedAt: now
      }
    })
    return ok({
      totalCoins: nextStats.totalCoins
    })
  }

  if (event.action === 'redeem') {
    await verifyPin(openid, event.pin)
    const stats = await recomputeChildStats(openid, childId)
    const wish = await db.collection('wish_items').doc(event.wishId).get()
    if (!wish.data || wish.data.ownerOpenid !== openid || wish.data.childId !== childId) {
      throw new Error('愿望不存在')
    }
    if (wish.data.status === 'redeemed') return ok()
    if (stats.totalCoins < Number(wish.data.costCoins || 0)) {
      throw new Error('金币还不够，继续加油')
    }
    const now = new Date()
    await db.collection('coin_transactions').add({
      data: {
        ownerOpenid: openid,
        childId,
        wishId: event.wishId,
        date: now.toISOString().slice(0, 10),
        amount: -Number(wish.data.costCoins || 0),
        reason: `兑换愿望：${wish.data.name}`,
        type: 'wish',
        createdAt: now
      }
    })
    await db.collection('wish_items').doc(event.wishId).update({
      data: {
        status: 'redeemed',
        redeemedAt: now,
        updatedAt: now
      }
    })
    await recomputeChildStats(openid, childId)
    return ok()
  }

  throw new Error(`未知愿望操作：${cleanText(event.action, 24) || '空操作'}`)
}
