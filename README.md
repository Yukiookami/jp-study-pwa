# 学什么语 · JP Study

## 日常启动

在仓库根目录打开 VS Code 终端，Docker Desktop 运行后：

```bash
docker compose up -d postgres
pnpm start
```

手机连接 Tailscale 后打开 http://shiro-mac-home:3001，Mac 也用同一地址。HTTP 支持在线学习，完整离线安装可选 HTTPS。第一次在新环境安装需先准备依赖、迁移和构建。

完整的 **[VS Code 手动启动与手机安装说明](docs/development/STARTUP.md)** 包含首次初始化、HTTPS/Tailscale、主屏幕图标、重启、更新和备份。

个人日语学习 PWA：Mac 运行、手机通过 Tailscale 访问。Vue 3 + Vite + TypeScript，Fastify + Prisma + PostgreSQL。

**第一版已实现，可本机试用。第一课已导入 54 个表达与 106 个单词。**支持课程两分区阅读、错误与补充示例区分、搜索筛选、收藏、单词/表达/纠错卡片、间隔复习、课程下载与离线答题同步。没有朗读功能。

## 文档

- [开发规则](AGENTS.md)、[项目 Skill 与角色](docs/development/CODEX_GUIDE.md)
- [需求与验收](docs/requirements/REQUIREMENTS_V1.md)、[技术栈](docs/architecture/TECH_STACK.md)
- [页面](docs/design/SCREENS.md)、[API](docs/design/API.md)、[数据库](docs/design/DATABASE.md)、[视觉](docs/design/VISUAL_SYSTEM.md)
- [课程 JSON](docs/data/LESSON_FORMAT.md)、[数据与复习规则](docs/data/DATA_RULES.md)
- [开发命令](docs/development/SETUP.md)、[阶段状态](docs/development/IMPLEMENTATION_PLAN.md)、[验证记录](docs/development/VERIFICATION.md)

课程源在 lessons，每份 memo.md + lesson.json；服务事件监听自动校验导入，已下载内容联网自动检查版本。稳定 ID 保留收藏与进度。生活内容在聊天中说“加入生活摘录”，按 [固定流程](docs/development/LIFE_CAPTURE.md) 收录。课堂视频和转写工具留在 AI-output。凭据、数据库备份与构建文件不提交。真机主屏幕安装和 Tailscale HTTPS 访问待设备试用。
