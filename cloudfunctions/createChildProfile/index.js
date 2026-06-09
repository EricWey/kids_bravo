const { db, _, ok, getOpenid, getChildren, getChild, verifyPin } = require('./_shared/db')
const { flattenTemplateTasks, normalizeTemplateCategories } = require('./_shared/templates')

const PACKAGE_TEMPLATE_PREFIX = 'packageType:'

function normalizeTemplateType(type) {
  if (type === 'vacation' || type === '寒暑假模版' || type === '寒暑假打卡') {
    return 'vacation'
  }
  return 'daily'
}

function addTaskToCategory(categories, categoryName, task) {
  let category = categories.find((item) => item.name === categoryName)
  if (!category) {
    category = { name: categoryName, tasks: [] }
    categories.push(category)
  }
  category.tasks.push(task)
}

async function getPackageTypeTemplate(templateId) {
  const parts = String(templateId || '').split(':')
  const type = normalizeTemplateType(parts[1])
  const packageType = decodeURIComponent(parts.slice(2).join(':'))
  if (!packageType) throw new Error('模板不存在')

  const [lowerTypeRes, upperTypeRes] = await Promise.all([
    db.collection('task_templates').where({ type: _.eq(type), packageType: _.eq(packageType) }).get(),
    db.collection('task_templates').where({ Type: _.eq(type), packageType: _.eq(packageType) }).get()
  ])
  const seen = new Set()
  const rows = lowerTypeRes.data.concat(upperTypeRes.data).filter((item) => {
    if (seen.has(item._id)) return false
    seen.add(item._id)
    return true
  })
  if (!rows.length) throw new Error('模板不存在')

  const template = {
    _id: templateId,
    type,
    packageType,
    name: packageType,
    categories: []
  }

  rows.forEach((item) => {
    normalizeTemplateCategories(item).forEach((category) => {
      category.tasks.forEach((task) => addTaskToCategory(template.categories, category.name, task))
    })
  })

  return template
}

async function ensureTemplate(templateId, type) {
  if (String(templateId || '').startsWith(PACKAGE_TEMPLATE_PREFIX)) {
    return getPackageTypeTemplate(templateId)
  }

  if (templateId) {
    const res = await db.collection('task_templates').doc(templateId).get()
    if (!res.data) throw new Error('模板不存在')
    return res.data
  }

  const normalizedType = normalizeTemplateType(type)
  const [lowerTypeRes, upperTypeRes] = await Promise.all([
    db.collection('task_templates').where({ type: _.eq(normalizedType) }).limit(1).get(),
    db.collection('task_templates').where({ Type: _.eq(normalizedType) }).limit(1).get()
  ])
  if (lowerTypeRes.data.length) return lowerTypeRes.data[0]
  if (upperTypeRes.data.length) return upperTypeRes.data[0]

  const fallback = await db.collection('task_templates').limit(1).get()
  if (fallback.data.length) return fallback.data[0]

  throw new Error('请先创建任务模板')
}

async function replaceTasks(openid, childId, template) {
  const normalizedTemplate = {
    ...template,
    categories: normalizeTemplateCategories(template)
  }
  const tasks = flattenTemplateTasks(normalizedTemplate, childId, openid)
  if (!tasks.length) {
    throw new Error('当前模板没有可应用的任务，请检查模板内容')
  }
  const oldTasks = await db.collection('tasks').where({ ownerOpenid: openid, childId }).get()
  await Promise.all(oldTasks.data.map((task) => db.collection('tasks').doc(task._id).remove()))
  await Promise.all(tasks.map((task) => db.collection('tasks').add({ data: task })))
}

function getTemplateName(template = {}) {
  return template.packageType || template.name || template.title || '任务模板'
}

function getTemplateType(template = {}) {
  return normalizeTemplateType(template.type || template.Type || template.packageType)
}

exports.main = async (event = {}) => {
  const openid = getOpenid()
  const now = new Date()

  if (event.mode === 'applyTemplate') {
    await verifyPin(openid, String(event.pin || '').trim())
    const child = await getChild(openid, event.childId)
    const template = await ensureTemplate(event.templateId, event.type || event.packageType)
    await replaceTasks(openid, child._id, template)
    await db.collection('children').doc(child._id).update({
      data: {
        templateId: template._id,
        templateName: getTemplateName(template),
        templateType: getTemplateType(template),
        updatedAt: now
      }
    })
    return ok({ childId: child._id })
  }

  const nickname = String(event.nickname || '').trim().slice(0, 12)

  if (!nickname) throw new Error('请填写昵称')

  const template = await ensureTemplate(event.templateId, event.type || event.packageType)
  const childRes = await db.collection('children').add({
    data: {
      ownerOpenid: openid,
      nickname,
      templateId: template._id,
      templateName: getTemplateName(template),
      templateType: getTemplateType(template),
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
