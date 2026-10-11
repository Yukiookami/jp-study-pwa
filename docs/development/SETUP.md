# 开发环境与实际命令

工程已初始化。日常 VS Code 手动启动、Tailscale 与手机安装按 [STARTUP](STARTUP.md) 操作。

当前验证环境：Node.js 24.20.0、pnpm 12.10.1、Docker 29.8.2。独立 PostgreSQL 17（5433），生产 API/网页 3001，开发网页 5174。pnpm lockfile 已生成，安装脚本仅允许 Prisma 与 esbuild 必需组件。

## 可执行命令

| 命令 | 用途 |
|---|---|
| pnpm env:init | 无 .env 时生成随机本机凭据；已有配置不覆盖 |
| pnpm install | 安装锁定依赖 |
| docker compose up -d postgres | 启动独立数据库 |
| pnpm db:generate | 生成 Prisma Client |
| pnpm db:deploy | 应用已有迁移，保留数据 |
| pnpm db:migrate | 仅开发时生成新迁移 |
| pnpm lessons:import | 校验、逐课导入；失败报告保留 |
| pnpm build | shared → API → 生产 Web/PWA |
| pnpm start | Node 提供生产网页与 API |
| pnpm dev | shared 构建后启动 API 与 Vite |
| pnpm typecheck | strict TypeScript 与 Vue 检查 |
| pnpm lint | 前后端静态检查 |
| pnpm format / format:check | 格式整理／检查 |
| pnpm test | 调度、离线持久化；数据库测试默认跳过 |
| pnpm test:integration | 使用独立 jp_study_test 数据库测试导入、回滚、去重、额度 |
| pnpm test:browser | 使用独立测试库和本机 Chrome 检查手机界面、离线、同步 |
| pnpm backup | 自定义格式数据库备份与课程源备份 |
| pnpm backup:check 文件.dump | 新建临时库恢复验证，不覆盖正式库 |

`test:integration` 会清理独立测试库；源码检查数据库名，禁止使用 jp_study 正式库。浏览器检查前应先执行 build 和 test:integration，确保迁移、客户端与生产资源准备好。本机 Chrome 路径不同可通过 CHROME_PATH 指定。

## 配置与约束

.env 被忽略。pnpm env:init 生成的随机密码同时用于 Compose 和 DATABASE_URL。已有数据库不得通过改密码或删数据卷“重新初始化”。本机 API_HOST=100.66.65.106 仅监听 Tailscale 网卡，支持 http://shiro-mac-home:3001；HTTPS Serve 为可选入口，用于完整 PWA 离线能力。不启用公网 Funnel。

LESSONS_ROOT 默认仓库 lessons。服务端解析、校验课程路径，不接受请求指定任意磁盘目录。单人固定用户，不提供注册、登录或云端发布。

生产模式由 Fastify 提供 apps/web/dist，API 与页面同源。前端静态资源由 Service Worker 缓存，课程 DTO 和待同步答题保存在 IndexedDB；API 复习响应不进入 Service Worker 缓存。

实际验证与未验证事项见 [VERIFICATION](VERIFICATION.md)。
