# 第一版实际验证记录

验证日期：2026-10-11。当前 Mac：Node 24.20.0、pnpm 12.10.1、Docker 29.8.2。正式库 jp_study；测试全部使用独立 jp_study_test，不向正式库写入试答记录。

## 已通过

- pnpm build：shared、API、网页、Manifest 与 Service Worker 生产构建成功。
- pnpm typecheck：strict TypeScript / Vue 检查通过。
- pnpm lint：无错误或警告。
- pnpm format:check：全部通过。
- pnpm peers check：依赖兼容检查通过。
- pnpm test：6 个测试通过，独立数据库测试由专用命令执行。
- pnpm test:integration：6 个真实 PostgreSQL 测试通过。覆盖重复导入不重建卡片、原错误搜索与明确答案、并发新卡额度、并发评分幂等与冲突拒绝、未领取卡拒绝评分、词条身份冲突整课回滚、修改课程保留卡片编号/收藏/历史/状态、跨课词条来源例句合并、待确认不建卡、坏文件隔离、重复课程源拒绝、单条评分失败及 API 参数校验。
- pnpm test:browser：手机尺寸 390×844 的本机 Chrome 通过。真实第一课 52 表达/106 单词；“伝えば”搜索及“伝えれば”展示；收藏与收藏筛选；课程下载；领取复习队列；断网评分；离线页面刷新保留剩余队列；离线查询已下载内容；恢复联网自动同步；仅创建一条复习事件；无页面脚本错误或横向溢出。
- pnpm lessons:import：正式第一课导入成功，生产服务再次启动报告 unchanged=1。正式库 completed_today=0、新卡10，未写入自动化试答。
- pnpm start：Fastify 正式网页与 API 初次在本机入口验证；后按用户偏好改为 Tailscale 地址 100.66.65.106:3001。完成验收后关闭临时应用服务，便于用户自行启动；Docker 数据库保留运行。
- pnpm backup 与 backup:check：首份备份可在新建独立数据库恢复，读取到 1 课、52 表达、106 单词、0 复习事件；恢复检查未改正式库。

## 资源和数据

图标：apps/web/public/icons/icon-192.png、icon-512.png。Apple 主屏幕图标、Manifest 的普通/Maskable 图标已配置。实际页面截图在被 Git 忽略的 work/verification，包含今日、表达展开、课程、复习。

所有原始课程/表达/词条 ID 保留，已有课程新增 corrected_japanese；原错误和反推错误示例保持分离。课程版本更新与收藏/复习历史使用不同存储。已确认内容可建卡；needs_review 可阅读但不建卡。

## 仍需真机验证

- iPhone Safari 与 Android 浏览器实际安装到主屏幕、图标裁切和启动体验。
- Tailscale Serve HTTPS 入口开启后，手机网络实际连通与安装。
- Mac 睡眠、唤醒和长时间离线后重连。
- 多设备真实学习节奏、每日额度与复习间隔是否合适。

Tailscale 自身为 Running，当前 Mac DNS 为 shiro-mac-home.taila48442.ts.net；检查时 Serve 配置为空。本项目没有替用户启用 Serve 或修改其他 Tailscale 服务。按 STARTUP 在第二个 VS Code 终端启动即可。

## 后续：HTTP 访问与 Git Skill

用户选择日常 http://shiro-mac-home:3001，启动步骤已放在 STARTUP 与 README 顶部。实际 API 只绑定本机 Tailscale IPv4 100.66.65.106，主机名与 IP 健康检查均 200。HTTPS Serve 保留为可选方案，不启用。

普通 HTTP 主机名浏览器验收确认 isSecureContext=false、crypto.randomUUID 不可用；兼容编号生成后在线复习与答题同步成功。原有离线缓存测试仍在 localhost 安全上下文通过，不能据此声称手机普通 HTTP 支持离线重新启动。

新增 .agents/skills/jp-git-publish，参考菜谱项目 Git Skill，适配 Codex 与日语课程文件；Skill 校验通过。实际没有提交或推送。类型检查、lint、构建、6 个纯逻辑/存储测试与浏览器测试通过。
