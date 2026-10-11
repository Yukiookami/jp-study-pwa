# Codex Skill 与自定义 Agent

## 项目 Skill

位于仓库 `.agents/skills/`，无需复制到个人全局目录：

- `$jp-pwa-implement`：按需求和设计实现本项目功能。
- `$jp-pwa-review`：显式要求审查代码／设计时使用。
- `$jp-lesson-validate`：只读校验课程 JSON。
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
