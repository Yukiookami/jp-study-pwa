---
name: jp-lesson-validate
description: "检查本项目 lessons 中的 JSON 格式、稳定 ID、引用与错误示例字段，报告导入前的数据问题。不会修改数据或数据库。"
---

# 课程数据校验

从仓库根目录执行 `python3 .agents/skills/jp-lesson-validate/scripts/validate_lessons.py lessons`。脚本只读源文件，不写数据库、不重写 ID。

规则依据 `docs/data/LESSON_FORMAT.md` 与 `docs/data/DATA_RULES.md`。脚本检查字段类型、日期、UUID 前缀、单文件唯一性、词条引用、例句来源、枚举和跨课程词条 ID 冲突；输出实际统计与失败文件，失败退出非零。

检查发现的错误并说明影响；不要为了通过校验生成新 ID 或删除问题内容。用户要求修复时保留原 ID，标注反推错误和真实原话的区别。正确答案不明确时阻止该纠错卡，不推断为可用答案。

该校验不是日语人工听辨、语义正确性证明，也不验证数据库导入事务。实现 API 导入时在服务端以 Zod 校验同一契约，并测试幂等、回滚和进度保留。
