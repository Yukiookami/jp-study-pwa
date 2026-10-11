# Codex 开发说明

## 项目与工作方式

这是个人日语学习 PWA。使用中文沟通，以用户已确认的需求为依据，先读本文和 [V1 需求](docs/requirements/REQUIREMENTS_V1.md)。修改前检查 Git 状态，保留已有工作。

用户通过 Mac 运行服务，通过 Tailscale 在手机访问。技术栈为 Vue 3 + Vite + TypeScript、Node.js + Fastify、PostgreSQL + Prisma，依赖用 pnpm workspace 管理。参考 [技术栈](docs/architecture/TECH_STACK.md)，不照搬菜谱项目的业务、账号和数据。

第一版业务代码已经实现并通过自动检查；手机主屏幕安装与 Tailscale HTTPS 真机访问待试用。按 [开发计划](docs/development/IMPLEMENTATION_PLAN.md) 小步实现，每步完成说明改动、验证和未验证事项；不能把文档中的计划描述成已实现功能。

## 内容与路径

- 仓库内 `lessons/` 是正式课程源，每课一个目录，含 `memo.md` 和 `lesson.json`。应用通过后端导入 JSON，而非直接让浏览器访问本机路径。
- 课堂内容整理使用 `japanese-lesson-memo` Skill；其数据约定已纳入 [课程格式](docs/data/LESSON_FORMAT.md)。相关 Skill 不可用时按此文档处理，不依赖某位开发者的绝对路径。
- 维护稳定 lesson、expression、vocabulary ID。导入与内容更新必须保留收藏、复习事件和进度，不能用清空重建数据库代替迁移。
- `original_japanese` 是实际原说法；`error_example_japanese` 是反推错误示例。界面明确区分，不把错误例子作为推荐答案。
- 课堂源文件、转写及处理工具默认留在 `/Users/zouxinyu/日语学习/AI-output/`；不将大型录像或中间文件提交到本仓库。
- 用户明确修正的信息更新原条目，不建立重复课程。待确认条目可查看，默认不进入背诵。

## 实现规范

- 前后端 TypeScript strict。Vue 使用 Composition API 与 `script setup`；局部状态不强行放进 Pinia。
- HTTP 请求集中封装；业务参数和课程 JSON 用 Zod 校验，服务端不得依赖前端校验。
- shared 只放公开请求/响应 Schema、推导类型、纯复习规则及常量，不放 Prisma Client、环境变量、文件访问或 Vue 组件。
- 后端简单模块优先 route + service，按实际复杂度拆层；数据库模型不能直接作为公开 API 响应。
- 复习规则使用可传入的时间，保证可测试；离线答题用事件 ID 幂等，不丢失、不重复计数。
- 第一版手机优先、中文界面，日语学习内容保持日语。内容能长文本换行，翻卡不依赖悬停，状态不只靠颜色表示。
- 前端安全渲染 Memo；原始 HTML 不执行。文件路径只能在后端配置的课程目录内解析。
- 未经用户要求不引入 AI Runtime、Redis、微服务、云托管或公网发布。本地自托管，不调用 Sites 部署。

## 配置、验证与交付

凭据放被忽略的 `.env`；只提交 `.env.example`。数据库端口仅宿主机访问，独立数据卷，不复用菜谱项目的业务库或账号。端口、Node 与依赖版本在初始化时查验，锁定兼容版本。

新代码运行适当的类型检查、构建和测试。优先测试课程导入的幂等与数据保留、复习调度、离线事件去重等真实行为；简单文案或纯排版不写镜像测试。

开发命令以 [SETUP](docs/development/SETUP.md) 为准，未实现的命令不能宣称已可用。修改规则、数据结构或运行方式时同步文档。

依用户要求再提交或推送 Git；当前准备阶段不主动推送。不要修改其他项目、全局 Codex 权限、默认模型或自动批准配置。

## 项目 Skill 与角色

仓库 `.agents/skills/` 提供 jp-pwa-implement、jp-pwa-review、jp-lesson-validate、jp-git-publish。自定义角色位于 `.codex/agents/`，按用户明确要求协作时使用；普通任务不强制分工。详细用法见 [Codex 指南](docs/development/CODEX_GUIDE.md)。

实现页面、API、数据库前读对应 [页面](docs/design/SCREENS.md)、[API](docs/design/API.md)、[数据库](docs/design/DATABASE.md) 与 [视觉](docs/design/VISUAL_SYSTEM.md)。这些是设计稿，不代表已实现。
