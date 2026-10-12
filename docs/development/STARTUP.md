# VS Code 启动与手机访问

## 日常启动：先看这里

打开 Docker Desktop，等待它启动。VS Code 打开 `/Users/zouxinyu/pwa应用/jp-study-pwa-codex`，在终端执行：

```bash
cd /Users/zouxinyu/pwa应用/jp-study-pwa-codex
docker compose up -d postgres
pnpm start
```

页面地址使用不带 `/#/` 的 History 路由，课程页面可以直接打开和刷新。旧 Hash 链接会自动转换。

保持终端运行。手机与 Mac 连接同一 Tailscale 网络，手机浏览器直接打开：

```text
http://shiro-mac-home:3001
```

Mac 自己也用 `http://shiro-mac-home:3001`。无需再启动前端或 Tailscale Serve。目前依赖、第一课导入、迁移和生产构建已准备好，可以直接按上面的步骤试用。

停止应用按 `Ctrl+C`；数据库可继续运行，或用 `docker compose stop postgres` 关闭。重新启动仍是上面三条命令，不需重建数据库。不要执行 `docker compose down -v`，它会移除数据卷。

## 两个项目的端口

| 服务 | 菜谱 sku-cook-ai | 日语 jp-study-pwa |
|---|---|---|
| 应用/API | 3000 | 3001 |
| Vite 开发网页 | 5173 | 5174 |
| PostgreSQL 宿主机端口 | 5432 | 5433 |
| HTTPS Serve（可选） | 保留原配置 | 预留 8443 |

已经核对配置与实际数据库容器，无冲突。Compose 项目与数据卷也各自独立。日语 API_HOST=100.66.65.106，仅监听这台 Mac 的 Tailscale 网卡，手机通过主机名访问；数据库仍只监听宿主机 127.0.0.1:5433。

## HTTP 和 HTTPS 有什么区别

按你的偏好，日常先使用 HTTP，在线阅读、搜索、收藏和复习可以正常使用；设备上的待同步记录仍存入 IndexedDB。已经打开的页面可以使用本机已保存内容。

浏览器要求 Service Worker 在安全上下文运行，手机访问普通 HTTP 主机名不满足这个条件。因此 HTTP 不能保证关闭页面后再断网启动，也不能保证完整 PWA 安装体验。浏览器若允许，可以添加桌面快捷方式，但这不等于离线安装成功。

HTTPS 的主要价值是启用页面资源离线缓存、完整离线启动与更完整的 PWA 安装能力，也提供浏览器识别的 TLS 加密与服务器身份校验。Tailscale 自身已经为设备间通信提供加密，但浏览器仍根据页面 HTTP/HTTPS 判断是否开放这些功能。

Mac 的 `http://127.0.0.1` 属于浏览器认可的本机开发例外；手机的 `http://shiro-mac-home:3001` 不属于这个例外。参考：[MDN 安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)、[Service Worker 的 HTTPS 要求](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)。

HTTP 和 HTTPS 是不同的网站来源，下载内容与未同步答题不会共享。以后切换入口时先同步旧入口的答题，再在新入口重新下载课程；服务器上的收藏和已同步学习进度保持一致。

## 修改代码后启动

在应用终端按 `Ctrl+C`，然后：

```bash
pnpm build
pnpm start
```

生产命令同时提供网页与 API。手机日常使用这一入口。需要开发调试才用 `pnpm dev`：Mac 开发网页 127.0.0.1:5174、API 仍按本机 API_HOST 监听 3001，不能与生产服务同时占用 3001。

## 新环境的首次初始化

仅在新电脑或依赖尚未安装时执行。需要 Node.js 24、pnpm 12、Docker Desktop：

```bash
pnpm env:init
pnpm install
docker compose up -d postgres
pnpm db:generate
pnpm db:deploy
pnpm build
pnpm lessons:import
pnpm start
```

env:init 自动生成随机密码，并在能够读取 Tailscale 时填写本机 IPv4 地址；已有 .env 时保留原配置。若新电脑未运行 Tailscale，则先只监听 127.0.0.1；手机访问前启动 Tailscale，把 .env 的 API_HOST 改为该电脑在 Tailscale 显示的 IPv4 地址。不要覆盖已有数据库凭据，不将 .env 提交 Git。db:deploy 应用已保存迁移，不清空学习数据。

## 添加课程与下载

课程保存在仓库 lessons/，每课 memo.md + lesson.json。服务启动检查导入，并事件监听 lessons 下的 lesson.json 和 memo.md；文件稳定后自动校验更新，不轮询。格式有误保留数据库内容并显示提示，手动“更新课程”仍可用。重复导入不重复建卡，不重置学习记录。

“下载这一课”会保存内容到本设备；源内容更新后，联网的前台应用会收到通知并自动检查已下载记录；回到前台或恢复联网也会检查。手动“更新离线内容”仍可用。HTTP 下此内容能供已打开页面使用，完整离线重启页面需要下面的 HTTPS 入口。读音以假名显示，没有朗读。

## 可选：以后启用 HTTPS 与主屏幕安装

日常 HTTP 不需要这一步。若要完整 PWA 离线体验，保留应用终端，再开第二个终端：

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --https=8443 http://100.66.65.106:3001
```

保持第二个终端运行。检查时 Serve 配置为空；以后若已有其他入口则保留，不执行 serve reset。若 8443 已占用，可改用 10000，并相应改访问地址。

本机域名对应：

```text
https://shiro-mac-home.taila48442.ts.net:8443
```

以终端显示的实际地址为准。若提示需要启用 HTTPS，按终端链接到 Tailscale 管理页面启用后重试。本项目没有替你启用 Serve。说明：[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve)。

iPhone 使用 Safari 分享菜单 → 添加到主屏幕；Android 使用 Chrome 菜单 → 安装应用或添加到主屏幕。名称为“日语手帖”，图标为深绿底的“語”，192/512 像素图标与 Apple 主屏幕图标已配置。

## 备份

数据库运行时，在仓库根目录：

```bash
pnpm backup
```

生成 backups/日期时间/，包含 database.dump 与 lessons/ 课程源。数据库包含收藏、复习事件和进度；建议把整个目录另存一份。

检查备份恢复：

```bash
pnpm backup:check backups/实际日期时间/database.dump
```

工具建立临时独立数据库验证，不覆盖正式学习库。

## 手机访问遇到问题

- 先确认 Mac 上 shiro-mac-home:3001 能打开、终端服务未停止。
- 确认两台设备都连接 Tailscale，名称 shiro-mac-home 能被手机解析。若名称解析暂不可用，可用 Tailscale 显示的 Mac 100.x 地址加 :3001 排查；不同地址的本机缓存独立。
- Mac 需保持开机，Docker 与应用服务需运行。睡眠或服务关闭期间不能取得新内容或同步。
- 3001 被占用时关闭旧的本项目服务，不要同时 pnpm dev 和 pnpm start。
- 待同步未消失时联网点“同步”；没有服务端确认的记录保留，不会静默删除。不要清除网站数据来刷新，否则尚未同步记录会丢失。

手机尺寸 Chrome 已做自动验收。真实手机、Tailscale 名称解析、主屏幕安装与 Mac 睡眠唤醒仍需你试用确认。

聊天里的生活表达收录按 [LIFE_CAPTURE](LIFE_CAPTURE.md) 使用，输入“加入生活摘录”即可。

## 学什么语外观更新

新版构建后重启 pnpm start，再刷新页面。HTTPS 已安装版本若出现更新提示，点击更新应用。手机主屏幕仍显示旧名字或旧图标时，移除旧快捷方式并重新添加即可；不要清除网站数据，以免丢失未同步答题。
