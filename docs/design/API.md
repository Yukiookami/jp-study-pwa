# API 设计 v1

状态：API 已实现；对应公开类型见 packages/shared/src/index.ts。由 shared/Zod 实现公开 DTO，不直接导出 Prisma 模型。页面与API同源，前缀 `/api/v1`。

## 通用约定

日期时间为ISO8601 UTC；上课日期为YYYY-MM-DD或null；日界线按Asia/Tokyo。ID保持源数据前缀UUID。分页 page>=1、page_size 1–100默认20，搜索 q 最长100字符。

成功格式 `{ "data": ... }`；分页追加 `meta:{page,page_size,total}`。失败格式 `{ "error": { "code":"...", "message":"中文可理解说明", "request_id":"..." } }`。内部堆栈、连接字符串、本机路径不返回客户端。

参数错400，条目不存在404，停用卡或冲突409，不支持格式422，服务暂不可用503，内部异常500。第一版固定个人用户；不接受客户端 user_id。仅用于可信Tailnet，不能据此作为公开互联网认证方案。

## 接口列表

| Method | Path | 输入 | 输出/行为 |
|---|---|---|---|
| GET | /health | 无 | 服务状态，不暴露配置 |
| GET | /home | 无 | today、due_count、pending_count、new_available、completed_today、recent_lessons、server_time |
| GET | /lessons | page/page_size/q | 课程摘要列表 |
| GET | /lessons/:id | id | 课程元数据、表达、词条、本课例句、memo_markdown、content_version |
| POST | /lessons/import | 无 | 扫描配置目录；逐课事务导入，返回 succeeded/unchanged/failed 数量和可理解错误 |
| GET | /items | type/lesson_id/tag/favorite/q/page/page_size | 合并后的词库或表达列表 |
| GET | /items/:type/:id | type=expression/vocabulary | 条目、来源课程、例句、收藏及各卡型当前进度 |
| PUT | /favorites/:type/:id | 无 | 幂等设为收藏 |
| DELETE | /favorites/:type/:id | 无 | 幂等取消收藏，不删除内容 |
| POST | /review/queue | lesson_id?、card_types?、limit?（1–100，默认20） | 到期卡优先，再分配不超今日额度的新卡；返回题面/答案DTO、queue_id、allocated_date |
| POST | /review/events | events数组1–100 | 逐事件回执，event_id幂等，返回权威状态和server_time |
| GET | /review/history | card_id?、page/page_size | 评分记录，供排查与后续统计；不额外扩张页面范围 |
| GET | /settings | 无 | daily_new_limit、timezone |
| PUT | /settings | daily_new_limit整数0–100 | 更新设置；时区本版固定，不允许写入任意用户配置 |

表中 Path 均接在 `/api/v1` 后。不提供接受任意磁盘路径的读取／导入接口。导入单课失败时批次可返回200并列出失败；整体目录不可读返回503，已有内容继续可读。

## 核心 DTO

LessonSummary：`id,title,lesson_date,expression_count,vocabulary_count,content_version`。

Expression：保留源字段 `japanese,meaning_zh,original_japanese,error_example_japanese?,corrected_japanese?,explanation_zh,contexts,examples,origin,verification,tags,vocabulary_ids`。错误示例和原说法分别处理。

Vocabulary：`id,japanese,reading,part_of_speech,meaning_zh,collocations,examples,origin,verification,tags,lesson_sources`。来源例句不因跨课导入丢失。

ReviewCard：`id,item_type,item_id,card_type,prompt,answer,source_lesson_ids,verification`；纠错 prompt 包含 `error_kind=original/inferred`，answer 的日语优先 corrected_japanese。字段不足以形成可靠答案时不生成纠错卡，不用LLM在运行时猜答案。

ReviewState：`card_id,stage,last_rating,last_reviewed_at,next_due_at,version`。页面上的进度以服务端回执为权威。

## 评分请求与响应

```json
{
  "events": [{
    "event_id": "2a2139b0-9cd1-4f20-9e86-4d783f6d2bde",
    "card_id": "9af91f03-5146-4f66-bc43-a78d24a32813",
    "rating": "remembered",
    "answered_at": "2026-10-11T09:00:00.000Z",
    "device_id": "2c43ef54-4e31-4e12-8dc0-d7706aab9986",
    "algorithm_version": 1
  }]
}
```

rating 枚举 forgot/partial/remembered 对应忘了/有点印象/记住了。events结构错误整批400；结构正确后逐事件事务处理。回执为 `results:[{event_id,status:accepted/duplicate/rejected,state?,error?}]`。只有 accepted/duplicate 才删除本地事件。

重复 event_id 且内容相同返回duplicate，不再次推进阶段。重复ID却payload不同返回 status=rejected 冲突回执（单条业务冲突409，批次HTTP200），不默默认为成功。停用卡返回rejected并保留待处理事件，客户端明确展示原因。

同批按 answered_at 稳定排序，相同时间按请求顺序；跨设备以服务端接收顺序为权威。到期计算用服务端时间。事务锁定卡片状态避免并发丢更新，数据库分配全局递增事件序号。

## 新卡分配

queue接口有分配副作用，故用POST。每日上限指“当天新分配的不同卡片”，不是页面刷新次数；事务预留DailyNewAllocation。同一卡当天重取仍占一个位置且可继续，跨设备并发不能各领10张突破额度。分配暂未答完的卡仍算额度，次日可继续，不凭重新获取生成重复卡。

## 缓存与测试

课程DTO以content_version更新IndexedDB；收藏和review响应不进行盲目的长期HTTP缓存。测试输入校验、稳定ID导入、部分失败隔离、事务回滚、event重复与payload冲突、并发评分、新卡额度并发和原错误区分。
