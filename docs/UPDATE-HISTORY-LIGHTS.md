# 首页、赛事历史与车灯更新（2026-09-19）

## 已实现

- 首页车辆以约 120 秒一圈的速度持续环绕，镜头留出左侧标题空间；顶部三个导航按钮统一使用品牌暖黄色。
- 车库入口旁增加独立历史记录页，支持返回 / Esc、地图与模式筛选、每页 12 条记录、小屏幕布局。
- 完赛及比赛中主动退出 / 重开发车会保存一次记录；倒计时前退出不产生赛事记录。记录包括地图、昼夜、对手难度、车辆、日期、名次、总用时、罚时、最快圈、平均/最高速度和超车数。其他车手未全部完赛时明确标注暂列名次。
- 各地图展示两圈竞速与单圈计时的最快总成绩，列明实际比赛条件。新纪录按同地图、昼夜、车型、模式与竞速难度比较；单车计时不区分对手难度。罚时计入总成绩，相同成绩不算突破。首次完赛显示首条纪录，打破已有成绩显示新纪录及提升时间。
- 玩家车灯固定保留两盏聚光灯与两盏氛围点光源，关灯时强度为零。L 只改变光照参数，避免增减光源和材质首次显示引起比赛中重新编译。保留近光、远光、氛围灯、关灯循环及实际场景照明；未给每辆 AI 额外启用四盏常驻光源。

## 运行

现有生产服务：http://127.0.0.1:4180/ 。刷新页面加载更新。

```powershell
npm.cmd run build
npm.cmd start
```

开发验证：先运行 `npm.cmd run dev -- --port 5173`，然后：

```powershell
npm.cmd test
node scripts/history-qa.mjs
node scripts/history-visual-qa.mjs
$env:QA_LABEL='after'
node scripts/lights-performance-qa.mjs
```

## 验证证据

- 45/45 自动测试通过；生产构建成功，仅保留 Vite 的大文件体积提示。
- Chrome 153.0.8010.50，无界面 WebGL2，Windows / Intel Iris Xe / ANGLE D3D11。
- 历史流程：1440×900 和 390×844；实际模拟完成单圈比赛、复位罚时后再次完赛、主动退出、筛选、Esc 返回、刷新保存均通过，无 pageerror；手机历史页无横向溢出。
- 历史 QA 在独立浏览器上下文预置旧纪录 999 秒，用实际模拟完成的约 133.53 秒成绩验证新纪录；没有改动玩家当前浏览器的记录。第二次加 3 秒罚时的较慢成绩没有新纪录提示。
- 首页 8 秒内相机位置实际改变，截图已检查。夜间相同路段的近光、远光、关闭截图已检查。
- 车灯性能：1280×800，默认标准画质、港城白天八车比赛。修改前首次 L 产生 26 次 compileShader 调用、约 2750 ms 长帧；修改后四次切换均为 0 次编译，四轮各采集约 97 帧，最大帧间隔分别 17.0 / 16.9 / 16.9 / 16.8 ms。该短时本机结果不代表所有硬件或完整比赛帧率。
- 报告与截图：`artifacts/history/integration.json`、`visual.json`、`lights-before.json`、`lights-after.json`、`history-desktop.png`、`history-mobile.png`、`home-orbit.png`、`new-record.png`、`lights-near.png`、`lights-high.png`、`lights-off.png`。

## 数据与边界

记录保存在当前浏览器 localStorage（`afterlight.history.v1`），与旧版 `afterlight.records` 最快成绩兼容。旧版没有保存逐场明细，因此无法追溯生成。尚未完成的比赛在关闭浏览器或刷新时不作为主动退出记录；没有云同步。存储被禁止或空间不足时页面提示保存失败，当前内存中仍可查看。

本轮更改：`src/main.js`、`src/ui.js`、`src/vehicle.js`；新增 `src/race-history.js`、`src/history-ui.js`、`src/history.css`、`tests/history-lighting.test.js` 及上述三项 QA 脚本。
