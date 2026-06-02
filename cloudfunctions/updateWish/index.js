const { db, ok, getOpenid, getChild, verifyPin, recomputeChildStats } = require('./_shared/db')

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const childId = event.childId
  await getChild(openid, childId)

  if (event.action === 'add') {
    const name = String(event.name || '').trim().slice(0, 24)
    if (!name) throw new Error('请填写愿望')
    await db.collection('wish_items').add({
      data: {
        ownerOpenid: openid,
        childId,
        name,
        costCoins: Math.max(1, Number(event.costCoins) || 1),
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    return ok()
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

  throw new Error('未知愿望操作')
}
