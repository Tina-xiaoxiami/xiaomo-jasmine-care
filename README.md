# 小茉日常

一个为新手设计的茉莉养护助手，帮助记录每天的光照、浇水判断、健康巡检、施肥和成长照片。

## 功能

- 每日养护清单与完成进度
- 依据土壤、叶片和花苞状态给出巡检建议
- 根据所在地生成未来 14 天的天气养护计划
- 10–14 天施肥周期提醒与日历导出
- 成长照片和历史记录（只保存在当前设备）
- 浇水、日照、施肥、修剪、虫害和换盆手册
- AI 拍照诊断：拍下叶背/黄叶/虫害近照，用 DeepSeek 视觉模型给出初步判断与处置建议

## AI 拍照诊断

回到「今天」拍一张照片后点「开始诊断」，默认调用 DeepSeek 视觉模型 `deepseek-v4-flash-vision-exp`（VINNO 网关 `https://t.vinno.com/v1`，OpenAI 兼容）。如要改用其它接口，可在「API 设置」里添加（密钥只存本机）。

- 诊断请求由你部署的 Cloudflare Worker 转发到目标接口（解决浏览器跨域限制），Worker 不落地存储照片或密钥。
- **默认密钥走服务端**：部署时设置 `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_BASE_URL`、`DEEPSEEK_VISION_MODEL`）即可，前端无需填 key。
- 该功能依赖 Worker 转发，因此 **GitHub Pages 静态部署不支持**；请使用 Cloudflare 部署或本地 `npm run dev` 使用。
- 结果仅供参考，不替代专业植保判断。

### 本地配置 DeepSeek key

本地开发时把密钥写入 `.dev.vars`（已被 gitignore，不会提交）：

```bash
# .dev.vars
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_BASE_URL=https://t.vinno.com/v1
DEEPSEEK_VISION_MODEL=deepseek-v4-flash-vision-exp
```

Cloudflare 部署则用 `wrangler secret put DEEPSEEK_API_KEY`（或在工作台设置环境变量）。

## 安装到 iPhone

打开 GitHub Pages 地址后，在 Safari 点击“分享”→“添加到主屏幕”。安装后的“小茉日常”不需要登录 ChatGPT；养护记录、照片和 API 设置仅保存于本机浏览器。清除 Safari 网站数据或删除浏览器数据，会一并清除这些本地记录。

## GitHub Pages 发布

推送到 `main` 分支会由 GitHub Actions 自动执行静态发布。首次发布时，在仓库的 **Settings → Pages** 中将来源设为 **GitHub Actions**。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

构建与检查：

```bash
npm run lint
npm test
```
