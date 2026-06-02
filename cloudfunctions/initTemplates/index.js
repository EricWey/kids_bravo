const { db, ok } = require('./_shared/db')
const { getTemplateSeed } = require('./_shared/templates')

exports.main = async (event = {}) => {
  const age = Number(event.age) || 6
  const gender = event.gender === 'boy' ? 'boy' : 'girl'
  const template = getTemplateSeed(age, gender)
  const existing = await db.collection('task_templates').where({ key: template.key }).limit(1).get()

  if (!existing.data.length) {
    await db.collection('task_templates').add({
      data: {
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
  }

  const templates = await db.collection('task_templates').where({ age, gender }).get()
  return ok({ templates: templates.data })
}
