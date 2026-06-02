const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function ok(data = {}) {
  return { ok: true, data }
}

function fail(message) {
  return { ok: false, message }
}

function getOpenid() {
  return cloud.getWXContext().OPENID
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(`kids-bravo:${pin}`).digest('hex')
}

async function verifyPin(openid, pin) {
  const settings = await db.collection('parent_settings').where({ ownerOpenid: openid }).limit(1).get()
  const item = settings.data[0]
  if (!item || !item.pinHash) {
    throw new Error('请先设置家长 PIN')
  }
  if (item.pinHash !== hashPin(pin || '')) {
    throw new Error('家长 PIN 不正确')
  }
  return item
}

async function getChildren(openid) {
  const res = await db.collection('children').where({ ownerOpenid: openid }).orderBy('createdAt', 'asc').get()
  return res.data
}

async function getChild(openid, childId) {
  const res = await db.collection('children').doc(childId).get()
  const child = res.data
  if (!child || child.ownerOpenid !== openid) {
    throw new Error('没有权限访问该档案')
  }
  return child
}

async function getTasks(openid, childId, includeDisabled = false) {
  await getChild(openid, childId)
  const query = { ownerOpenid: openid, childId }
  if (!includeDisabled) query.enabled = true
  const res = await db.collection('tasks').where(query).orderBy('category', 'asc').orderBy('sort', 'asc').get()
  return res.data
}

async function recomputeChildStats(openid, childId) {
  const txRes = await db.collection('coin_transactions')
    .where({ ownerOpenid: openid, childId, voided: _.neq(true) })
    .limit(1000)
    .get()
  const totalCoins = txRes.data.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const recordRes = await db.collection('daily_records')
    .where({ ownerOpenid: openid, childId })
    .orderBy('date', 'desc')
    .limit(60)
    .get()

  let streakDays = 0
  let cursor = new Date()
  const dates = new Set(recordRes.data.filter((item) => item.dailyTotal !== 0 || (item.tasks || []).length).map((item) => item.date))
  while (dates.has(formatDate(cursor))) {
    streakDays += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  const unlocked = buildBadges(totalCoins, streakDays, recordRes.data)
  await db.collection('achievements').where({ ownerOpenid: openid, childId }).remove().catch(() => {})
  await db.collection('achievements').add({
    data: {
      ownerOpenid: openid,
      childId,
      totalCoins,
      streakDays,
      badges: unlocked,
      updatedAt: new Date()
    }
  })

  return { totalCoins, streakDays, badges: unlocked }
}

function formatDate(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildBadges(totalCoins, streakDays, records) {
  const categoryHits = {}
  records.forEach((record) => {
    ;(record.tasks || []).forEach((task) => {
      if (task.status === 'done') {
        categoryHits[task.category] = (categoryHits[task.category] || 0) + 1
      }
    })
  })
  const definitions = [
    { key: 'first_day', icon: '星', name: '启航星', description: '完成第一次打卡', unlocked: records.length > 0 },
    { key: 'streak_3', icon: '火', name: '三日连闪', description: '连续打卡 3 天', unlocked: streakDays >= 3 },
    { key: 'coins_50', icon: '冠', name: '金币小达人', description: '累计 50 金币', unlocked: totalCoins >= 50 },
    { key: 'study_10', icon: '书', name: '学习小船长', description: '学习成长完成 10 次', unlocked: (categoryHits['学习成长类'] || 0) >= 10 },
    { key: 'habit_10', icon: '屋', name: '习惯小管家', description: '生活习惯完成 10 次', unlocked: (categoryHits['生活习惯类'] || 0) >= 10 },
    { key: 'kind_10', icon: '心', name: '友善小伙伴', description: '行为品德完成 10 次', unlocked: (categoryHits['行为品德类'] || 0) >= 10 }
  ]
  return definitions
}

module.exports = {
  cloud,
  db,
  _,
  ok,
  fail,
  getOpenid,
  hashPin,
  verifyPin,
  getChildren,
  getChild,
  getTasks,
  recomputeChildStats,
  formatDate
}
