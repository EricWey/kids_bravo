const { callCloud } = require('./cloud')

const listeners = []
const statusMap = {}

function makeKey(childId, taskId) {
  return `${childId || ''}:${taskId || ''}`
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index >= 0) listeners.splice(index, 1)
  }
}

function publishTaskStatus(change = {}) {
  if (!change.childId || !change.taskId) return
  const normalized = {
    childId: change.childId,
    taskId: change.taskId,
    enabled: change.enabled !== false,
    updatedAt: change.updatedAt || Date.now()
  }
  statusMap[makeKey(normalized.childId, normalized.taskId)] = normalized.enabled
  listeners.slice().forEach((listener) => listener(normalized))
}

async function setTaskStatus({ childId, taskId, enabled }) {
  await callCloud('manageChildProfile', {
    action: 'setTaskEnabled',
    childId,
    taskId,
    enabled: enabled !== false
  })
  publishTaskStatus({ childId, taskId, enabled: enabled !== false })
}

function applyTaskStatus(task, childId) {
  if (!task || !task._id) return task
  const key = makeKey(childId || task.childId, task._id)
  if (!Object.prototype.hasOwnProperty.call(statusMap, key)) return task
  return {
    ...task,
    enabled: statusMap[key]
  }
}

function applyTaskStatusList(tasks = [], childId) {
  return tasks.map((task) => applyTaskStatus(task, childId))
}

function applyTaskStatusGroups(groups = [], childId) {
  return groups.map((group) => ({
    ...group,
    tasks: applyTaskStatusList(group.tasks || [], childId)
  }))
}

module.exports = {
  subscribe,
  publishTaskStatus,
  setTaskStatus,
  applyTaskStatus,
  applyTaskStatusList,
  applyTaskStatusGroups
}
