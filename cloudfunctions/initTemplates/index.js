const { db, ok, _ } = require('./_shared/db')
const { normalizeTemplateCategories } = require('./_shared/templates')

function normalizeType(type) {
  if (type === 'vacation') {
    return 'vacation'
  }
  return 'daily'
}

function getItemType(item = {}) {
  return normalizeType(item.type || item.Type)
}

function hasTemplateContainer(item = {}) {
  return Array.isArray(item.categories) || Array.isArray(item.tasks) ||
    (item.categories && typeof item.categories === 'object')
}

function getTemplateLabel(item = {}) {
  return item.packageType || item.name || item.title || '默认模版'
}

function makeGroupedTemplateId(type, packageType) {
  return `packageType:${type}:${encodeURIComponent(packageType)}`
}

function addTaskToCategory(categories, categoryName, task) {
  let category = categories.find((item) => item.name === categoryName)
  if (!category) {
    category = { name: categoryName, tasks: [] }
    categories.push(category)
  }
  category.tasks.push(task)
}

function buildTemplateList(items = [], type) {
  const templates = []
  const grouped = {}

  items.forEach((item) => {
    const categories = normalizeTemplateCategories(item)
    if (hasTemplateContainer(item)) {
      templates.push({
        ...item,
        type: getItemType(item),
        packageType: getTemplateLabel(item),
        categories
      })
      return
    }

    const packageType = getTemplateLabel(item)
    if (!grouped[packageType]) {
      grouped[packageType] = {
        _id: makeGroupedTemplateId(type, packageType),
        type,
        packageType,
        name: packageType,
        categories: []
      }
    }
    categories.forEach((category) => {
      category.tasks.forEach((task) => addTaskToCategory(grouped[packageType].categories, category.name, task))
    })
  })

  return templates.concat(Object.keys(grouped).map((key) => grouped[key]))
}

exports.main = async (event = {}) => {
  const type = normalizeType(event.type)
  const [lowerTypeRes, upperTypeRes] = await Promise.all([
    db.collection('task_templates').where({ type: _.eq(type) }).get(),
    db.collection('task_templates').where({ Type: _.eq(type) }).get()
  ])
  const seen = new Set()
  const data = lowerTypeRes.data.concat(upperTypeRes.data).filter((item) => {
    if (seen.has(item._id)) return false
    seen.add(item._id)
    return getItemType(item) === type
  })

  return ok({
    templates: buildTemplateList(data, type)
  })
}
