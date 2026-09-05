# 小茉日常（茉莉养护助手）

一个为新手设计的茉莉（jasmine）养护助手 PWA，帮助每天记录光照、浇水判断、健康巡检、施肥与成长照片。数据本地优先（localStorage + IndexedDB），可静态发布到 GitHub Pages，安装到 iPhone 主屏幕后离线可用。

## 技术栈

- React 19 + Vite 8 + `vinext`（OpenAI sites 启动器，App Router 风格）
- TypeScript，测试用 `node:test`（`tests/*.test.mjs`）
- 天气数据来自 Open-Meteo（无密钥），静态导出用 `GITHUB_PAGES=true vinext build`

## 目录结构

- `app/` — 页面与交互逻辑
  - `page.tsx` — 首页（今日清单、巡检、拍照、施肥）
  - `forecast-care.tsx` / `weather-client.ts` — 14 天天气养护计划
  - `care-forecast.ts` — 依据天气与植株状态生成养护建议（纯函数）
  - `care-reminders.ts` / `reminder-center.tsx` — 提醒与日历导出（.ics）
  - `api-config.ts` / `api-settings.tsx` — 本地保存第三方 API 配置（尚未自动调用）
  - `local-care.ts` — 本地记录与照片（localStorage + IndexedDB）
  - `pwa-install.tsx` / `public/sw.js` — PWA 安装与服务工作者
- `db/`、`worker/`、`drizzle/` — 来自启动器的 Cloudflare D1/Worker 脚手架，当前为本地优先、未启用云端同步
- `tests/` — 行为测试（28 条，全部通过）

## 常用命令

```bash
npm install
npm run dev        # 本地开发
npm run build      # 构建
npm test           # 构建 + 运行测试
npm run lint       # ESLint
npm run build:pages # GitHub Pages 静态导出
```

## 约定

- 所有养护判断基于“摸土再浇”原则，浇水提醒只提醒检查，不强制浇水。
- 时间/时区处理使用 `Asia/Shanghai` 或用户所在地时区，避免本地时区导致的水合不一致。
- 新增行为先补 `tests/` 用例再实现。
