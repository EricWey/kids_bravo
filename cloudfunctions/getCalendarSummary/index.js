const { db, ok, getOpenid, getChild } = require('./_shared/db')

function dateList(start, end) {
  const days = []
  const cursor = new Date(`${start}T00:00:00`)
  const final = new Date(`${end}T00:00:00`)
  while (cursor <= final) {
    const year = cursor.getFullYear()
    const month = `${cursor.getMonth() + 1}`.padStart(2, '0')
    const day = `${cursor.getDate()}`.padStart(2, '0')
    const date = `${year}-${month}-${day}`
    days.push({ date, day: Number(day), total: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  await getChild(openid, event.childId)
  const days = dateList(event.start, event.end)
  const recordRes = await db.collection('daily_records')
    .where({ ownerOpenid: openid, childId: event.childId })
    .limit(100)
    .get()
  const map = {}
  recordRes.data.forEach((record) => {
    map[record.date] = record.dailyTotal || 0
  })
  return ok({
    days: days.map((day) => ({
      ...day,
      total: map[day.date] || 0
    }))
  })
}
