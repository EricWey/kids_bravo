# 云数据库设计

## children

- `ownerOpenid`：家长微信 openid
- `nickname`：儿童昵称
- `age`：4-10
- `gender`：`boy` 或 `girl`
- `templateId` / `templateName`：当前模板
- `totalCoins`：累计金币缓存
- `createdAt` / `updatedAt`

## tasks

- `ownerOpenid`
- `childId`
- `category`：学习成长类、生活习惯类、行为品德类
- `name`
- `description`
- `rewardCoins`
- `penaltyCoins`
- `enabled`
- `sort`
- `createdAt` / `updatedAt`

## daily_records

- `ownerOpenid`
- `childId`
- `date`：`YYYY-MM-DD`
- `tasks`：当日每个任务最终状态
- `dailyTotal`：当日金币净值
- `createdAt` / `updatedAt`

## coin_transactions

- `ownerOpenid`
- `childId`
- `taskId` / `wishId`
- `taskName`
- `date`
- `amount`：正数奖励，负数惩罚或兑换
- `reason`
- `type`：`done`、`missed`、`correction`、`wish`
- `createdAt`

## parent_settings

- `ownerOpenid`
- `pinHash`
- `createdAt` / `updatedAt`

## operation_logs

- `ownerOpenid`
- `action`：例如 `deleteChild`
- `operatorOpenid`
- `childId`
- `childSnapshot`：删除时的档案快照
- `createdAt`

## wish_items

- `ownerOpenid`
- `childId`
- `name`
- `costCoins`
- `status`：`open` 或 `redeemed`
- `redeemedAt`
- `createdAt` / `updatedAt`
