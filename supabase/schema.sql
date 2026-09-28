-- 复习清单 · Supabase 建表 SQL
-- 用法：Supabase 后台 → 左侧 SQL Editor → 新建查询 → 整段粘贴 → Run
-- 说明：单人自用、免登录，所以策略设为公开读写（anon key 即可访问）。
--       任何拿到你网站链接或数据库地址的人都能读写数据，请勿外传链接。

-- 任务表（复习任务 + DDL 任务）
create table if not exists tasks (
  id                bigint generated always as identity primary key,
  owner_id          text not null default 'public',
  title             text not null,
  note              text,
  kind              text not null default 'review',      -- review | ddl
  ddl_date          date,                                 -- DDL 任务专用
  completed_at      timestamptz,                          -- DDL 任务完成时间
  desired_retention numeric(3,2) not null default 0.90,   -- 目标记住率 0.70~0.97
  card              jsonb,                                -- FSRS 卡片状态
  attachments       jsonb not null default '[]'::jsonb,   -- 附件（base64，单文件 ≤2MB）
  created_at        timestamptz not null default now()
);

-- 复习打卡日志（用于统计与算法）
create table if not exists review_logs (
  id             bigint generated always as identity primary key,
  owner_id       text not null default 'public',
  task_id        bigint not null,
  rating         int not null,                            -- 1忘了 2难 3好 4简单
  state          int,
  scheduled_days int,
  elapsed_days   int,
  reviewed_at    timestamptz not null default now()
);

-- 每日统计（完成个数 / 完成百分数）
create table if not exists daily_stats (
  id         bigint generated always as identity primary key,
  owner_id   text not null default 'public',
  day        date not null,
  planned    int not null default 0,
  completed  int not null default 0,
  created_at timestamptz not null default now(),
  constraint daily_stats_owner_day_unique unique (owner_id, day)
);

create index if not exists idx_tasks_owner_created on tasks (owner_id, created_at);
create index if not exists idx_logs_owner_task on review_logs (owner_id, task_id);

-- 行级安全：单人自用 → 公开读写
alter table tasks enable row level security;
alter table review_logs enable row level security;
alter table daily_stats enable row level security;

drop policy if exists tasks_public on tasks;
create policy tasks_public on tasks for all to anon, authenticated using (true) with check (true);

drop policy if exists logs_public on review_logs;
create policy logs_public on review_logs for all to anon, authenticated using (true) with check (true);

drop policy if exists stats_public on daily_stats;
create policy stats_public on daily_stats for all to anon, authenticated using (true) with check (true);
