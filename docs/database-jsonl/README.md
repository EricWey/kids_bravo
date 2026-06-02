# 微信云数据库 JSONL 模板

这些文件是一行一个 JSON 对象的 JSONL 模板，可用于创建集合字段参考或少量示例导入。

## 集合对应文件

- `children.jsonl` -> `children`
- `task_templates.jsonl` -> `task_templates`
- `tasks.jsonl` -> `tasks`
- `daily_records.jsonl` -> `daily_records`
- `coin_transactions.jsonl` -> `coin_transactions`
- `achievements.jsonl` -> `achievements`
- `wish_items.jsonl` -> `wish_items`
- `parent_settings.jsonl` -> `parent_settings`
- `operation_logs.jsonl` -> `operation_logs`

## 使用说明

1. 在微信开发者工具云开发控制台中创建同名集合。
2. 如需导入示例数据，将 `OPENID_PLACEHOLDER` 替换为真实 openid。
3. `parent_settings.pinHash` 需要使用云函数 `saveTasks` 设置 PIN 自动生成，不建议手动导入明文或伪哈希。
4. 日期字段在模板中使用 ISO 字符串，云函数运行时会写入 `Date` 对象；模板主要用于字段结构参考。
5. 实际使用时不需要预置这些示例数据，创建儿童档案会自动生成模板和任务。
