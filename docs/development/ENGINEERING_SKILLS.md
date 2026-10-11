# Matt Pocock 工程 Skills

| Skill | 用途 | 本项目适用例子 |
| --- | --- | --- |
| `$tdd` | 先确认失败，再最小实现，验证行为 | 复习间隔、答题去重、导入保留进度 |
| `$diagnosing-bugs` | 复现、缩小范围、验证原因、回归检查 | 偶发同步失败、下载副本不更新、性能退化 |
| `$codebase-design` | 简化接口，集中复杂行为 | 新增复习模式、整理同步逻辑、拆分过大页面 |

安装在仓库 `.agents/skills/`，可在项目聊天直接说明需求，或显式输入 `$skill-name`。下个回合可发现；若列表尚未刷新，可指定对应 SKILL.md 路径。这些不是应用运行时依赖，不改变启动方式。

例：“使用 $tdd，增加每日新卡额度，保证重复同步不重复计数。”

例：“使用 $diagnosing-bugs，检查手机回到前台后课程偶尔不更新的问题。”

例：“使用 $codebase-design，评估新增功能的模块接口，保留复习数据。”

课程整理、生活摘录和 Git 发布仍用现有 jp 系列 skills。需求与设计继续用原目录。选用的三个 skill 可独立使用，未运行全套 setup，也未引入 issue 状态机或自动提交流程。

## 来源与维护

来源：[mattpocock/skills](https://github.com/mattpocock/skills)，固定提交 `49dd158d1076134a641b33efb035946536778336`，引入日期 2026-10-11。路径为 `skills/engineering/{tdd,diagnosing-bugs,codebase-design}`；每个目录保留 MIT LICENSE。使用 Codex Skill Installer 的 GitHub 安装脚本。

本项目适配：tdd 复用已确定的测试范围和现有工具，不重复问许可；替换未安装 code-review 和不可用 Skill 工具引用。诊断流程对简单问题按风险执行，允许读代码以建立复现，并保护正式数据。模块设计使用中文与现有术语，仅在用户明确要求时使用多 agent。

上游更新需对照固定版本人工合并，不能直接覆盖本地适配。本次仅安装 skills 并修改开发说明，没有改动业务代码。
