# xxz-parent-view

芳菲和启源的手机端家长学习查看页。网页只展示学习结果，不提供家长编辑入口。

数据来自现有 Supabase 学习记录、英语知识点库和数学知识点库。GitHub 仓库只保存网页代码和已确认的旧日报文字；新日报与卷子照片保存在现有云端数据中。

日报分享长图使用只读页面 `?view=daily-card&date=YYYY-MM-DD`。该页面与家长端读取同一份 `parent_daily_updates_v1` 数据，隐藏导航和其他学习模块，供 Codex 在确认日报并完成云端同步后稳定截图；页面本身不提供编辑入口。

卷子照片索引使用 `parent_assessment_media_v1`，每张卷子的压缩照片单独存放在 `parent_assessment_media_item_v1_<paperId>`。首页不会加载照片，只有家长点击“查看卷子照片”时才读取对应卷子。

```powershell
npm test
npm run test:daily-card-viewport
python -m http.server 4173
```

生成 393px 宽的日报长图：

```powershell
npm run capture:daily-card -- --date 2026-08-26 --output D:\xxz-work\outputs\家长反馈\2026-08\2026-08-26_学习反馈.png
```

脚本会临时启动本仓库的静态服务，打开只读日报页，等待指定日期的数据加载完毕后截取完整卡片；若该日期无日报则直接报错，不会生成空白图片。可用 `--url https://example.com/` 指定已部署的家长网站地址。
