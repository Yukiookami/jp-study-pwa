---
name: jp-git-publish
description: "在日语学习 PWA 项目中，用户要求提交、commit、上传代码或 push 时，核对范围、执行检查、精确暂存、编写中文提交信息并安全推送。"
---

# 日语项目 Git 提交与推送

本 Skill 适用于 jp-study-pwa 仓库，先读根 AGENTS.md。创建或讨论 Skill 不代表现在允许 commit/push；用户明确要求“提交并推送”或“上传到 Git”时包含两项授权，无需重复确认每一步。只要求 commit 则不 push。

## 流程

1. 检查工作目录、状态、当前分支与 remote。预期仓库为 Yukiookami/jp-study-pwa；支持 HTTPS/SSH，不把另一项目 sku-cook-ai 当目标。输出 URL 前遮蔽认证信息。记录原有 index，保留用户已有工作；空仓库尚无 HEAD 时按首次提交处理。
2. 核对本次变更范围并阅读 diff；未跟踪文件需要查看内容，不能只靠 git diff。本项目正式 lessons 中的 memo.md/lesson.json 可以随相应课程任务版本化；是否包含课程以用户本次范围为准。保留稳定课程和条目 ID，检查文档、迁移、依赖清单与 pnpm-lock.yaml 配套更新。
3. 排除 .env、凭据、录像/音频、课堂转写中间产物、数据库数据卷、backups、work、node_modules、dist 与测试截图；图标及正式设计资产可提交。发现已被追踪的敏感文件时停止上传并说明具体问题，不能只靠 .gitignore。
4. 按实际改动执行验证：业务代码通常需 typecheck、lint、相关测试与 build；课程用 jp-lesson-validate 的只读校验；纯说明/Skill 改动检查格式、引用及 Skill 校验即可。数据库相关使用独立 jp_study_test；没有条件跑的检查明确报告。失败先修复，不能宣称通过或忽略真实失败。
5. 用 git add -- 明确路径或精确片段暂存；不默认 git add .。检查 cached diff、stat 和剩余状态。若 index 混有本次范围外内容，保持它不变，协调范围后再提交，不擅自清空或混入。
6. 使用中文 Conventional Commit 提交。Git 身份缺失时向用户获取，不自行编造身份。没有用户要求或已配置的可信协作署名时，不添加署名，也不照搬参考项目的 Copilot 邮箱。
7. 用户要求 push 时核对 remote/branch/upstream。必要时 fetch 并检查差异；空远端首次上传可将当前分支设为 upstream，不擅自更名。普通 push；遇到非快进、认证失败、远端保护或目标不明确时停止该次推送，报告已完成的本地提交与原因。不得自动 force、amend、重写历史、删除分支或循环重试；已明确授权的常规步骤继续执行。
8. 报告 commit 哈希、消息、实际验证、推送目标和结果、未提交内容。commit 成功但 push 失败分别表述。PR 仅在用户要求时创建。

## 提交消息

格式 `type(scope): 中文动作与目的`，scope 可省略，标题尽量不超过 72 字符。

type 可用 feat/fix/refactor/test/docs/chore/build；scope 使用 web/api/shared/db/lesson/tooling/ai 等实际范围。一次提交一个连贯变更，配套测试、文档与迁移一起提交；必要正文说明原因和真实验证。

例：

```text
feat(review): 支持离线答题恢复与幂等同步

答题和剩余队列一起保存，服务端确认后再移除本地事件。
验证：类型检查、构建及离线浏览器流程通过。
```

示例中的验证仅在确实执行并通过后使用。
