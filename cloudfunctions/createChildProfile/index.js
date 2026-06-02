const { db, _, ok, getOpenid, getChildren, getChild } = require('./_shared/db')
const { getTemplateSeed, flattenTemplateTasks } = require('./_shared/templates')

async function ensureTemplate(age, gender, templateId) {
  if (templateId) {
    const res = await db.collection('task_templates').doc(templateId).get()
    return res.data
  }

  const template = getTemplateSeed(age, gender)
  const existing = await db.collection('task_templates').where({ key: template.key }).limit(1).get()
  if (existing.data.length) return existing.data[0]

  const addRes = await db.collection('task_templates').add({
    data: {
      ...template,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })
  return { ...template, _id: addRes._id }
}

async function replaceTasks(openid, childId, template) {
  const oldTasks = await db.collection('tasks').where({ ownerOpenid: openid, childId }).get()
  await Promise.all(oldTasks.data.map((task) => db.collection('tasks').doc(task._id).remove()))
  const tasks = flattenTemplateTasks(template, childId, openid)
  await Promise.all(tasks.map((task) => db.collection('tasks').add({ data: task })))
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const now = new Date()

  if (event.mode === 'applyTemplate') {
    const child = await getChild(openid, event.childId)
    const template = await ensureTemplate(child.age, child.gender, event.templateId)
    await replaceTasks(openid, child._id, template)
    await db.collection('children').doc(child._id).update({
      data: {
        templateId: template._id,
        templateName: template.name,
        updatedAt: now
      }
    })
    return ok({ childId: child._id })
  }

  const age = Number(event.age)
  const gender = event.gender === 'boy' ? 'boy' : 'girl'
  const nickname = String(event.nickname || '').trim().slice(0, 12)

  if (!nickname) throw new Error('请填写昵称')
  if (age < 4 || age > 10) throw new Error('年龄需要在 4-10 岁之间')

  const template = await ensureTemplate(age, gender, event.templateId)
  const childRes = await db.collection('children').add({
    data: {
      ownerOpenid: openid,
      nickname,
      age,
      gender,
      templateId: template._id,
      templateName: template.name,
      avatarUrl: '',
      totalCoins: 0,
      createdAt: now,
      updatedAt: now
    }
  })
  await replaceTasks(openid, childRes._id, template)
  const children = await getChildren(openid)
  const child = children.find((item) => item._id === childRes._id)
  return ok({ child, children })
}
