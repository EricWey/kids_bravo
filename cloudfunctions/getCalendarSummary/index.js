const { db, _, ok, getOpenid, getChild } = require('./_shared/db')

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
    .where({
      ownerOpenid: openid,
      childId: event.childId,
      date: _.gte(event.start).and(_.lte(event.end))
    })
    .limit(100)
    .get()
  const map = {}
  recordRes.data.forEach((record) => {
    map[record.date] = record.dailyTotal || 0
  })
  const txQuery = {
    ownerOpenid: openid,
    childId: event.childId,
    voided: _.neq(true),
    date: _.lte(event.end)
  }
  const txData = []
  let txSkip = 0
  while (true) {
    const txRes = await db.collection('coin_transactions')
      .where(txQuery)
      .skip(txSkip)
      .limit(1000)
      .get()
    txData.push(...txRes.data)
    if (txRes.data.length < 1000) break
    txSkip += 1000
  }
  const expenseMap = {}
  const expenseCountMap = {}
  const cumulativeMap = {}
  let runningTotal = 0
  const sortedTransactions = txData
    .slice()
    .sort((a, b) => {
      const dateOrder = String(a.date || '').localeCompare(String(b.date || ''))
      if (dateOrder !== 0) return dateOrder
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    })
  sortedTransactions.forEach((item) => {
    const amount = Number(item.amount || 0)
    runningTotal += amount
    cumulativeMap[item.date] = runningTotal
    if (item.date >= event.start && ['expense', 'exchange', 'wish'].includes(item.type) && amount < 0) {
      expenseMap[item.date] = (expenseMap[item.date] || 0) + Math.abs(amount)
      expenseCountMap[item.date] = (expenseCountMap[item.date] || 0) + 1
    }
  })
  let lastKnownTotal = sortedTransactions
    .filter((item) => item.date < event.start)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const daysWithCumulative = days.map((day) => {
    if (cumulativeMap[day.date] !== undefined) {
      lastKnownTotal = cumulativeMap[day.date]
    }
    const incomeAmount = Number(map[day.date] || 0)
    const expenseAmount = Number(expenseMap[day.date] || 0)
    return {
      ...day,
      total: incomeAmount,
      incomeAmount,
      expenseAmount,
      netAmount: incomeAmount - expenseAmount,
      cumulativeCoins: lastKnownTotal,
      expenseCount: expenseCountMap[day.date] || 0
    }
  })
  return ok({
    days: daysWithCumulative
  })
}
