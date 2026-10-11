---
name: jp-pwa-implement
description: "按项目需求实现日语学习 PWA 的 Vue/Fastify 功能、数据导入、复习与离线流程。用于本仓库的功能实现与修复。"
---

# 日语 PWA 开发

先确认当前目录为 jp-study-pwa 仓库，读根 AGENTS。根据任务读取对应需求编号和设计；不要加载所有文档或扩大本次范围。

- 页面与交互：读 `docs/design/SCREENS.md`、`docs/design/VISUAL_SYSTEM.md`。
- API／课程导入：读 `docs/design/API.md`、`docs/data/LESSON_FORMAT.md`。
- 数据／复习／离线：读 `docs/design/DATABASE.md`、`docs/data/DATA_RULES.md`。
- 工程初始化：读 `docs/architecture/TECH_STACK.md`、`docs/development/SETUP.md`。

上述路径均以仓库根目录为基准。读取 `docs/development/IMPLEMENTATION_PLAN.md` 确认当前阶段；文档计划不代表代码已存在，不调用尚未实现的命令。

## 工作约定

以稳定 lesson/item ID 和独立进度为核心。修改课程只更新内容，不清空进度、事件或收藏。输入必做后端校验；公开 DTO 不返回 Prisma 模型、凭据或本机路径。

前端忠实实现准确文案和状态，设计图是视觉参考。原错误和反推例子标签不同；纠错答案必须来自结构化正确形式，不能把句型标题当完整纠正句。

测试围绕任务实际风险：重复导入、事务回滚、进度保留、评分幂等、离线队列重试。依赖升级仅在需要时核对官方兼容性，前后端检查通过后再扩大范围。

跨前后端改动先约定 shared Contract，再实现双方。只有用户请求或当前授权任务明确允许协作时使用自定义角色，任务注明拥有文件与输出，避免同时修改同一文件。普通小任务由当前 agent 完成。

最终说明改动、检查结果及未验证的设备行为；同步涉及的设计与阶段状态。不主动推送、发布或运行破坏性数据库操作。
