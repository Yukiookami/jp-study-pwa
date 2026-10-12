# Codex Skill 与自定义 Agent

## 项目 Skill

位于仓库 `.agents/skills/`，无需复制到个人全局目录：

- `$jp-pwa-implement`：按需求和设计实现本项目功能。
- `$jp-pwa-review`：显式要求审查代码／设计时使用。
- `$jp-lesson-validate`：只读校验课程 JSON。
- `$jp-life-memo`：在聊天中把日常遇到的日语加入生活摘录，并核对应用导入。
- `$jp-git-publish`：检查范围、精确暂存、中文提交与安全推送。

例：“使用 $jp-pwa-implement 完成 S01 工程初始化。”

例：“使用 $jp-lesson-validate 检查第一课数据。”

现有个人 `$japanese-lesson-memo` 继续负责课堂材料整理；项目 Skill 不重复制作它。

使用示例：“使用 $jp-git-publish 把当前项目改动提交并推送。”仅提交可说“使用 $jp-git-publish 提交当前改动，暂不推送”。本次创建 Skill 不执行 Git 提交或上传。新会话会发现项目 Skill；当前会话也可直接指定 `.agents/skills/jp-git-publish/SKILL.md`。

## 自定义角色

`.codex/agents/` 的 TOML 由 Codex 作为自定义子 agent 配置读取：`jp_frontend`、`jp_backend`、`jp_reviewer`。后者只读，其余继承当前权限。没有固定模型或推理力度，没有修改全局配置。

这些是主 agent 按任务调用的角色，不是三个自动运行的聊天。需要分工时可以说：“让 jp_frontend 和 jp_backend 分工实现这项功能，最后让 jp_reviewer 检查。”共享 Contract 应由一个拥有者协调；普通小任务不必启动多 agent。

按官方文档使用项目 Skill 和自定义 Agent 格式，已做文件格式校验；当前会话没有实际启动这些自定义角色，不能据格式检查声称已经在本机运行验证。新项目会话中发现后再使用，配置仍受安装版本和项目信任设置约束。

官方参考：[Skill](https://learn.chatgpt.com/docs/build-skills)、[自定义子 Agent](https://learn.chatgpt.com/docs/agent-configuration/subagents)。

聊天生活摘录流程与手机入口见 [LIFE_CAPTURE](LIFE_CAPTURE.md)。

引入的 `$tdd`、`$diagnosing-bugs`、`$codebase-design` 用于测试、故障诊断和模块设计，详见 [工程 Skills](ENGINEERING_SKILLS.md)。

个人 `$japanese-memo-revise` 用于按逐条反馈修订已有课堂或生活学习内容。用户可以先讨论再说“按刚刚的意见修正第一课”，同步修改正式 Memo/JSON、保留稳定 ID 并核对应用导入。安装于个人 skills 目录，非本仓库内置文件；缺少该 Skill 时仍按课程格式和数据规则完成修订。

## 学习内容质量与关联整理

- 卡片正文是知识说明，不写“你追问”“老师说”“本课补充”“用户确认”等会议记录口吻。课堂来源、补充来源与确认状态留在结构化字段或来源标识；用法正文直接解释接续、含义、场景与例句。
- 每个实际原说法同时保存 original_context_zh：当时谈什么、想表达什么。依据课堂材料或用户反馈填写；不编造背景。原日语字段只存原句，不把中文解释拼入句子。
- 老师的场景建议保持原意，不擅自加反驳来改写教学重点。明显疑义先查证，无法明确忠实表达时请用户确认，不把场景建议扩张为全部日语的绝对规则。
- 标题提到的每种接续都必须有说明和例句。区别不同词、不同形式时分段，不只列一个名称。补充例外或范围时给具体接续与例句，不留“还有其他用法”一句话。
- 相关知识使用统一“主题：……”标签，课堂和生活来源同样归类。同一主题条目相邻排列；独立用法可以另建条目，保留旧 ID。课程是来源，不是唯一分类方式。今后先查已有主题和条目再归档，避免同义标签分裂。

个人 `$japanese-topic-organize` 用于细化知识主题与维护跨课堂/生活的关联。可以说“按知识点整理主题，保留原条目”。它位于个人 skills 目录；缺少时遵循 DATA_RULES 的分类原则。
