# 技术栈与工程边界

## 1. 技术选择

| 层 | 选择 | 约定 |
|---|---|---|
| 工程 | pnpm workspace、Git | 不引入 Nx / Turborepo |
| 语言 | TypeScript | strict；类型检查与构建分开 |
| 前端 | Vue 3、Vite、Vue Router、Pinia | Composition API；手机优先 |
| 交互 | Vant、CSS，按需 SCSS | 卡片和阅读布局自行设计；不默认加 Tailwind |
| HTTP | Axios | 集中封装请求与错误提示 |
| PWA | vite-plugin-pwa、IndexedDB | 静态缓存＋明确的离线课程与答题队列 |
| 后端 | Node.js、Fastify | app 构造与 server 启停分离 |
| 校验 | Zod | 服务端校验；shared 提供公开 Contract |
| 数据 | PostgreSQL、Prisma | CLI/Client 同版本；迁移记录进 Git |
| 日志 | Fastify 内置 Pino | 不另建日志框架 |
| 检查 | Vitest、Vue Test Utils、ESLint、Prettier | 测试真实行为，不重复测试同一 HTTP 场景 |
| 本地依赖 | Docker Compose | 初期仅 PostgreSQL 容器，Web/API 宿主机运行 |

参考菜谱项目采用的技术系列：Node 24 LTS、Vue 3、Vite 7、Fastify 5、Zod 4、Prisma 6。它们是参考基线，不是已经安装或核验的版本。初始化时检查受支持版本与实际环境，选定兼容组合，写入 package.json 和 pnpm-lock.yaml；不盲目全部升级，也不沿用未核验的补丁版本。

Prisma 6 与 7 的连接配置不同；同一初始化过程选一个系列，不混用。数据库初期参考 postgres:17-alpine，具体镜像版本初始化时确认。

## 2. 计划目录

```text
jp-study-pwa-codex/
├── AGENTS.md
├── README.md
├── lessons/                 # 正式课程源，已有第一课
├── apps/
│   ├── web/                 # Vue PWA，待创建
│   └── api/                 # Fastify + Prisma，待创建
├── packages/
│   └── shared/              # Schema、公开类型、纯复习算法，待创建
├── docs/
│   ├── requirements/
│   ├── architecture/
│   ├── data/
│   └── development/
└── compose.yaml             # 独立数据库服务，待创建
```

shared 不暴露 Prisma 模型和本机文件路径。Memo 的 Markdown 可渲染，但禁止执行原始 HTML；JSON 内容同样按文本安全显示。

## 3. 数据流

课程文件 → 后端校验 → 按稳定 ID 事务导入 PostgreSQL → API 提供公开数据 → PWA 阅读与缓存。

在线评分 → API 持久化事件与进度；离线评分 → IndexedDB 队列 → 重连提交同一 event ID → 服务端去重 → 返回权威进度。

收藏、进度、历史不回写课堂 JSON。课程内容可版本化，个人进度独立备份。源文件临时不可读不删除数据库已有记录。

## 4. 运行方式

Mac 上 Web/API 使用独立于菜谱项目的端口，建议开发 Web 5174、API 3001、PostgreSQL 5433，实施前查占用。生产通过同一 HTTPS 入口提供网页和 `/api`，Tailscale 内访问，不配置公网发布。

HTTPS、后台运行与开机启动在设备联调时实施，不能以“开发网页可打开”代替完整 PWA 验收。Mac 需要在线才能提供新课和同步；离线缓存只覆盖已下载内容。

## 5. 第一版边界

不引入 Redis、消息队列、微服务、Kubernetes、向量数据库、AI API、原生打包。单人使用模式，不继承菜谱项目的账号、默认用户、密码或会话期限。需要共享给他人时另行设计认证。
