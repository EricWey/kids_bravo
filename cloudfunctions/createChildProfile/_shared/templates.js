const CATEGORIES = ['学习成长类', '生活习惯类', '行为品德类']

const BASE_TASKS = {
  '学习成长类': [
    ['专注阅读 15 分钟', '安静阅读绘本、故事或拼音读物。', 5, 2],
    ['完成小练习', '完成今天约定的一页练习或口算。', 4, 2],
    ['讲一个新知识', '把今天学到的一件事讲给家人听。', 3, 1]
  ],
  '生活习惯类': [
    ['自己整理书包', '把明天需要的物品放好。', 3, 1],
    ['按时刷牙洗脸', '早晚认真完成清洁。', 3, 2],
    ['睡前收拾玩具', '把玩具送回自己的位置。', 4, 2]
  ],
  '行为品德类': [
    ['主动说谢谢', '得到帮助后认真表达感谢。', 3, 1],
    ['帮助家人一件事', '做一件力所能及的小家务。', 4, 1],
    ['控制小脾气', '遇到不开心时先说出来。', 5, 2]
  ]
}

function genderName(gender) {
  return gender === 'boy' ? '男孩' : '女孩'
}

function getTemplateSeed(age, gender) {
  const tone = age <= 5 ? '萌芽' : age <= 8 ? '探索' : '进阶'
  const multiplier = age <= 5 ? 1 : age <= 8 ? 1.2 : 1.4
  const categories = CATEGORIES.map((name) => ({
    name,
    tasks: BASE_TASKS[name].map(([taskName, description, reward, penalty]) => ({
      name: taskName,
      description,
      rewardCoins: Math.round(reward * multiplier),
      penaltyCoins: Math.max(1, Math.round(penalty * multiplier))
    }))
  }))

  return {
    key: `${age}_${gender}_${tone}`,
    name: `${age}岁${genderName(gender)}${tone}成长模板`,
    age,
    gender,
    categories
  }
}

function flattenTemplateTasks(template, childId, ownerOpenid) {
  const now = new Date()
  const tasks = []
  template.categories.forEach((category) => {
    category.tasks.forEach((task, order) => {
      tasks.push({
        childId,
        ownerOpenid,
        category: category.name,
        name: task.name,
        description: task.description,
        rewardCoins: task.rewardCoins,
        penaltyCoins: task.penaltyCoins,
        enabled: true,
        sort: order,
        createdAt: now,
        updatedAt: now
      })
    })
  })
  return tasks
}

module.exports = {
  CATEGORIES,
  getTemplateSeed,
  flattenTemplateTasks
}
