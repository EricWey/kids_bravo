# Bravo 星球儿童每日打卡小程序

面向 4-10 岁儿童的微信原生小程序，用于每日任务打卡、金币奖惩、日历记录、成就徽章和愿望清单管理。

## 开发准备

1. 使用微信开发者工具打开本目录。
2. 在 `app.js` 中把 `please-replace-with-your-cloud-env-id` 替换为自己的云开发环境 ID。
3. 在微信开发者工具中开通云开发，并上传部署以下云函数：
   - `getOpenId`
   - `initTemplates`
   - `createChildProfile`
   - `saveTasks`
   - `submitCheckin`
   - `getCalendarSummary`
   - `getDailyDetail`
   - `updateWish`
   - `manageChildProfile`
4. 首次打开小程序后，创建儿童档案会自动生成并应用对应年龄和性别的任务模板。

## 云数据库集合

需要开启云数据库并创建以下集合：

- `children`
- `task_templates`
- `tasks`
- `daily_records`
- `coin_transactions`
- `exchange_items`
- `achievements`
- `wish_items`
- `parent_settings`
- `operation_logs`

建议初期将集合权限设置为“仅创建者及管理员可读写”，核心写入仍通过云函数完成。

## 核心规则

- 一个微信账号可管理多个儿童档案。
- 任务按 `学习成长类`、`生活习惯类`、`行为品德类` 三类组织。
- 每个任务独立设置奖励金币和惩罚金币。
- 当日点击“完成”立即奖励金币，点击“未完成”立即扣金币。
- 同一日期同一任务只有一个最终状态；状态切换时会写入修正流水，避免重复累计。
- 家长 PIN 使用 SHA-256 哈希保存，不保存明文。

## 隐私原则

小程序只保存昵称、年龄、性别、任务记录、金币记录、成就和愿望清单。不采集真实姓名、身份证、手机号、学校、精确位置等儿童敏感信息。
