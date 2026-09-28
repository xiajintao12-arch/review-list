# 复习清单

按艾宾浩斯遗忘曲线（FSRS 算法，Anki 现任默认算法）安排复习计划的个人任务清单。纯静态前端 + Supabase 免费云库，部署在 Vercel，长期可用。

## 功能

- 今日 List：打开就是当天该复习什么，勾选即完成
- 添加任务：底部输入，标题即行动（必填）；可选附件（≤2MB）、可设 DDL
- DDL 任务：自动排在列表最后；只在 DDL 当天计入完成率
- 复习打分：忘了 / 难 / 好 / 简单，FSRS 据此排下次复习日
- 科学调参：每个任务可调「目标记住率」0.70–0.97（长期记忆 0.85 / 标准 0.90 / 考前冲刺 0.95），改完立即按遗忘曲线重排
- 更多功能：近 7 天完成个数、完成百分数两张折线图；未来 14 天计划；任务管理与删除
- PWA：可添加到手机主屏幕，离线打开

## 三步上线

### 1. Supabase 建库（免费）

1. 注册并登录 https://supabase.com ，New project（地区选 Singapore/Tokyo，国内访问较快）
2. 左侧 **SQL Editor** → New query → 把 `supabase/schema.sql` 整段粘贴进去 → **Run**
3. 左侧 **Project Settings** → **API**，复制两个值：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public**（很长的那串 key）

### 2. 推送到 GitHub

```bash
git remote add origin https://github.com/<你的用户名>/review-list.git
git push -u origin main
```

### 3. Vercel 导入

1. https://vercel.com 用 GitHub 登录 → **Add New** → **Project** → 选刚才的仓库
2. Framework Preset 选 **Other**，Build Command 留空，Output Directory 留空（纯静态）
3. Deploy → 拿到 `https://xxx.vercel.app` 链接

第一次打开网站会让你填一次 Project URL 和 anon key，存在本机浏览器里，之后不再出现。
（想换设备/重填：更多功能页底部「⚙ 数据库设置」）

## 注意事项

- **数据是公开的**：免登录 + 公开读写策略，拿到链接或数据库地址的人都能读写你的任务。**不要外传链接。**
- **换设备需要重新填一次** URL 和 key（存在 localStorage，不清缓存就一直有效）。
- **附件上限 2MB**：附件以 base64 存在数据库里，大文件装不下。
- **改前端后要重新部署**：Vercel 会自动部署 GitHub push。改完记得把 `sw.js` 里的 `CACHE` 版本号 +1，否则手机上会看到旧版缓存。
- **vercel.app 域名在大陆偶发访问不稳定**：想长期稳定建议绑自己的域名（Vercel 后台 Domains 添加，境外托管无需备案）。

## 备份建议

想导出数据：Supabase 后台 → Table Editor 导出 CSV，或 SQL Editor 跑 `select * from tasks;`
