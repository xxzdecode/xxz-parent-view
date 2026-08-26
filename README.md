# xxz-parent-view

芳菲和启源的手机端家长学习查看页。网页只展示学习结果，不提供家长编辑入口。

数据来自现有 Supabase 学习记录、英语知识点库和数学知识点库。GitHub 仓库只保存网页代码和已确认的旧日报文字；新日报与卷子照片保存在现有云端数据中。

卷子照片索引使用 `parent_assessment_media_v1`，每张卷子的压缩照片单独存放在 `parent_assessment_media_item_v1_<paperId>`。首页不会加载照片，只有家长点击“查看卷子照片”时才读取对应卷子。

```powershell
npm test
python -m http.server 4173
```
