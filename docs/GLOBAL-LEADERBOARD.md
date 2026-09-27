# AFTERLIGHT 全球排行榜 V0.1

## 已核对的比赛规则

- 官方地图 ID：`coast`（金潮海岸）、`harbor`（铬湾港城）、`mountain`（岚脊天路）。玩家手绘地图使用本机生成的设计 ID，编辑后可能变化，因此 V0.1 不上传手绘赛道成绩。
- 模式：单车一圈计时（`time`）和八车两圈竞速（`race`）。正式成绩取自 `updateRaceProgress` 的冲线时间；冲线时间已包含复位罚时。最快圈取游戏的 `lapTimes`，不包含罚时。
- 竞速名次由最终冲线时间排序，未冲线车手才按赛道进度暂排。竞速成绩只有在八辆车都完成后才提交，避免把临时排名当最终排名。
- 本机历史由 `RaceArchive` 写入 `localStorage`，没有既有昵称、玩家 ID 或地区身份。新身份是本浏览器生成的匿名 UUID，可编辑显示昵称和地区；清除浏览器数据/换设备会变成另一个匿名身份。
- 当前前端由 GitHub Actions 发布到 GitHub Pages，仓库没有后端/API。Neon 连接串保存在独立 Cloudflare Worker Secret 中，绝不能放到 Vite 前端变量或 GitHub Pages 构建产物中。

## 榜单规则

地图、模式、昼夜独立筛选；竞速模式还按 AI 难度分组。车型随成绩显示，但同一榜单采用开放车型组。Global 读取所有地区，地区页按玩家自行设置的 `CN`、`NA`、`EU` 或 `OTHER` 筛选。计时榜按含罚时的单圈总用时升序；竞速榜先按最终名次，再按含罚时的用时排序。每位匿名玩家在当前筛选条件下只显示最好一条，最多显示 25 人，同时查询本机匿名玩家在 25 名以外的个人最佳名次。

## 初始化 Neon

在 Neon 项目的 SQL Editor 执行 [`worker/schema.sql`](../worker/schema.sql)。表只保存可展示和排序所需的匿名昵称、地区、官方赛道/比赛条件、用时、名次、最快圈、罚时、车型、比赛 UUID 及服务端记录时间。`run_id` 是唯一键，网络重试不会重复写入。

## 部署排行榜 API

1. 在 Neon 控制台创建数据库并复制连接串。
2. 安装仓库依赖：`npm ci`。
3. 本地开发时，在项目根目录创建被 Git 忽略的 `.dev.vars`，内容为 `DATABASE_URL=postgresql://...`。
4. 执行 `npm run leaderboard:dev` 启动本地 API（`http://127.0.0.1:8787`）。不要提交 `.dev.vars`。
5. 发布 API：执行 `npx wrangler login`，再运行 `npx wrangler secret put DATABASE_URL` 并粘贴 Neon 连接串，最后运行 `npm run leaderboard:deploy`。部署输出会给出 Worker URL。
6. 本地前端在项目根目录创建 `.env.local`，设置 `VITE_LEADERBOARD_API_URL=http://127.0.0.1:8787`，然后运行 `npm run dev`。重新构建时 Vite 才会读取该值。
7. GitHub 仓库 Settings → Secrets and variables → Actions → Variables 中增加 `LEADERBOARD_API_URL`，值为生产 Worker URL。GitHub Actions 的 Pages 构建会把这个公开 API 地址写入静态前端。API 地址不是秘密，Neon 连接串才是秘密。

Worker 的 `ALLOWED_ORIGINS` 当前包含正式 GitHub Pages 域名与本地开发端口。若网站换域名，应同步调整 `wrangler.jsonc` 并重新部署。

## 接口

- `GET /health`：检查 Worker 是否启动。
- `GET /api/leaderboard?track=harbor&mode=time_trial&region=global&playerId=<uuid>`：读取榜单；`mode` 也可为 `race`。V0.1 仅按赛道、模式、地区筛选；昼夜、难度、车辆仍写入成绩表作为附加分析字段，不参与筛选。响应含前 25 名和该匿名 ID 的个人最好名次。
- `time_trial` 在 API 筛选层映射到现有数据库模式值 `time`，无需数据库迁移。全球榜与地区榜均按 `elapsed_ms` 升序，竞速 `placement` 仅展示为附加信息。
- `POST /api/scores`：只由完赛流程提交，带 `runId`、匿名 ID、昵称、地区、官方赛道、模式、昼夜、难度、车辆、含罚时完赛毫秒数、最终名次、最快圈和罚时。

## 本地验证

配置本地 Neon URL 与 `.env.local` 后，在两个终端分别运行 `npm run leaderboard:dev` 和 `npm run dev`。在游戏里分别完成三张官方地图的计时赛；另完成标准难度八车赛，等待 AI 全员完成后检查结算显示“已提交”。打开主菜单“全球排行榜”，逐个选择 `harbor`、`coast`、`mountain`，确认每张地图只显示自己的数据；在 Global、China、North America 等地区页切换，确认显示的数据按所选地区过滤。用不同匿名资料重复提交，验证 Global 包含两者且对应地区榜各自只包含匹配地区。重复发送相同 run UUID 应返回 `duplicate: true` 而不会新增成绩。

常见无效输入（无效赛道、名次、地区、车辆、用时，或竞速未标最终确认）应返回 400；数据库不可用时页面提示联网失败，本地历史仍可继续使用。

## V0.1 的可信度边界

这是匿名浏览器游戏的公开排行榜。Worker 校验字段、取值范围、来源域名和最终比赛状态；`player_id` 与比赛成绩仍由客户端产生，玩家可篡改本地代码或自行伪造请求，所以这不是防作弊认证。地区也由玩家自选，不读取 IP、不收集精确位置。V0.1 只接受三条固定官方赛道，且不上传邮箱、姓名或玩家赛道数据。
