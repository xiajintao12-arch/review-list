/* 复习清单 · FSRS 遗忘曲线复习任务管理 */
'use strict'

/* ========== 数据后端：本机存储（localStorage）+ 导出/导入备份 ========== */
const STORE_KEY = 'review-list-state-v1'
let STATE = { tasks: [], logs: [], stats: {} }
let stateLoaded = false

async function loadState() {
  /* 本机存储：只在首次读取，之后以内存为准，避免刚写入又被旧值覆盖 */
  if (stateLoaded) return STATE
  let raw = null
  try { raw = localStorage.getItem(STORE_KEY) } catch (e) { raw = null }
  if (!raw) {
    STATE = { tasks: [], logs: [], stats: {} }
    return STATE
  }
  try {
    const data = JSON.parse(raw)
    STATE = {
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
    }
  } catch (e) {
    STATE = { tasks: [], logs: [], stats: {} }
  }
  /* card 统一为对象，便于后续算法使用 */
  for (const t of STATE.tasks) {
    if (typeof t.card === 'string' && t.card) {
      try { t.card = JSON.parse(t.card) } catch (e) { t.card = null }
    }
  }
  stateLoaded = true
  return STATE
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(STATE))
  } catch (e) {
    toast('存储空间不足：附件太大了，建议删除一些附件或换个小文件', 5000)
  }
}

/* 导出备份（含附件） */
function exportBackup() {
  const payload = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), ...STATE }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `复习清单备份-${todayKey()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  toast('备份已导出，请存到网盘或发给自己')
}

/* 导入备份 */
function importBackup(file) {
  const fr = new FileReader()
  fr.onload = async () => {
    try {
      const data = JSON.parse(fr.result)
      if (!Array.isArray(data.tasks)) throw new Error('格式不对')
      STATE = {
        tasks: data.tasks,
        logs: Array.isArray(data.logs) ? data.logs : [],
        stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
      }
      for (const t of STATE.tasks) {
        if (typeof t.card === 'string' && t.card) {
          try { t.card = JSON.parse(t.card) } catch (e) { t.card = null }
        }
      }
      saveState()
      TASKS = STATE.tasks
      renderToday()
      toast(`已导入 ${STATE.tasks.length} 个任务`)
    } catch (e) {
      toast('导入失败：文件不是有效的备份')
    }
  }
  fr.readAsText(file)
}

/* 免登录模式：数据对持有链接和数据库地址的人开放，附件直存数据库（单文件 2MB） */
const MAX_ATTACHMENT_BYTES = 2 * 1048576

const RET_PRESETS = [
  { label: '长期记忆', value: 0.85 },
  { label: '标准', value: 0.9 },
  { label: '考前冲刺', value: 0.95 },
]

/* ========== 基础工具 ========== */
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => [...document.querySelectorAll(sel)]

let toastTimer = null
function toast(msg, ms = 2200) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms)
}

function dayKey(d) {
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function todayKey() { return dayKey(new Date()) }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function fmtCN(d) { return `${d.getMonth() + 1}月${d.getDate()}日` }
function weekdayCN(d) { return '周' + '日一二三四五六'[d.getDay()] }
function fmtDue(card) {
  const due = new Date(card.due)
  const tk = todayKey()
  const dk = dayKey(due)
  if (dk === tk) return '今天复习'
  if (dk < tk) return `已逾期 ${Math.round((new Date(tk) - new Date(dk)) / 86400000)} 天`
  return `${fmtCN(due)} 复习`
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function fmtSize(bytes) {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + 'MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return bytes + 'B'
}

/* ========== FSRS ========== */
let F = null // fsrs 模块
async function loadFsrs() {
  try {
    F = await import('https://cdn.jsdelivr.net/npm/ts-fsrs@5/+esm')
    return true
  } catch (e) {
    console.error('fsrs load failed', e && e.message)
    return false
  }
}
function makeFsrs(retention) {
  const params = F.generatorParameters({
    enable_fuzz: true,
    enable_short_term: false, // 天粒度，适配"今日清单"模式
    desired_retention: Number(retention) || 0.9,
  })
  return F.fsrs(params)
}
function serializeCard(card) {
  return JSON.stringify({
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  })
}
function deserializeCard(json) {
  const c = typeof json === 'string' ? JSON.parse(json) : { ...json }
  c.due = new Date(c.due)
  if (c.last_review) c.last_review = new Date(c.last_review)
  return c
}
/* 指定目标记住率下，稳定度 S 对应的间隔天数（FSRS-4.5 衰减曲线） */
function intervalForRetention(stability, r) {
  const DECAY = -0.5
  const FACTOR = 19 / 81
  const t = stability * (Math.pow(r, 1 / DECAY) - 1) / FACTOR
  return Math.max(1, Math.round(t))
}

/* ========== 数据层（内存状态 + 保存） ========== */
function nextId(list) {
  return list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1
}

async function loadTasks() {
  await loadState()
  return STATE.tasks
}
function loadRecentLogs(days = 30) {
  const since = new Date(); since.setDate(since.getDate() - days)
  return STATE.logs.filter((l) => new Date(l.reviewed_at) >= since)
}
function loadStats(days = 30) {
  const since = dayKey(addDays(new Date(), -days))
  return Object.keys(STATE.stats)
    .filter((d) => d >= since)
    .map((d) => ({ day: d, planned: STATE.stats[d].planned, completed: STATE.stats[d].completed }))
}

function createTask({ title, kind, ddlDate, attachments }) {
  const row = {
    id: nextId(STATE.tasks),
    title,
    kind,
    attachments: attachments || [],
    created_at: new Date().toISOString(),
    completed_at: null,
    ddl_date: null,
    desired_retention: 0.9,
    card: null,
  }
  if (kind === 'ddl') {
    row.ddl_date = ddlDate
  } else {
    row.card = deserializeCard(serializeCard(F.createEmptyCard(new Date())))
  }
  STATE.tasks.push(row)
  saveState()
  return row
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

async function attachFiles(task, files, existing) {
  const atts = [...(existing || [])]
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast(`「${file.name}」超过 2MB，已跳过`)
      continue
    }
    const dataUrl = await readAsDataURL(file)
    atts.push({ name: file.name, size: file.size, type: file.type || '', data: dataUrl })
  }
  task.attachments = atts
  saveState()
  return atts
}

/* 完成一次复习：rating 1忘了 2难 3好 4简单 */
async function doReview(task, rating) {
  const now = new Date()
  const card = deserializeCard(task.card)
  const scheduled = makeFsrs(task.desired_retention).repeat(card, now)[rating]
  task.card = deserializeCard(serializeCard(scheduled.card))
  STATE.logs.push({
    id: nextId(STATE.logs),
    task_id: task.id,
    rating,
    state: Number(card.state),
    scheduled_days: Number(scheduled.card.scheduled_days),
    elapsed_days: Number(scheduled.card.elapsed_days),
    reviewed_at: now.toISOString(),
  })
  recountStats(todayKey())
  saveState()
}

async function completeDdl(task) {
  task.completed_at = new Date().toISOString()
  recountStats(todayKey())
  saveState()
}
async function uncompleteDdl(task) {
  task.completed_at = null
  recountStats(todayKey())
  saveState()
}

async function changeRetention(task, r) {
  task.desired_retention = r
  if (task.card) {
    const card = deserializeCard(task.card)
    const anchor = card.last_review ? new Date(card.last_review) : new Date(task.created_at)
    const s = Number(card.stability) || 0
    if (s > 0) {
      let due = addDays(anchor, intervalForRetention(s, r))
      if (due < new Date()) due = new Date()
      card.due = due
      task.card = card
    }
  }
  saveState()
}

async function deleteTask(task) {
  STATE.tasks = STATE.tasks.filter((t) => t.id !== task.id)
  STATE.logs = STATE.logs.filter((l) => l.task_id !== task.id)
  saveState()
}

/* 某天的计划数 / 完成数 */
function plannedForDay(tasks, key) {
  const endOfDay = new Date(key + 'T23:59:59')
  let n = 0
  for (const t of tasks) {
    if (t.kind === 'ddl') {
      if (t.ddl_date === key) n++
    } else if (t.card && new Date(t.card.due) <= endOfDay && !t.deleted) {
      n++
    }
  }
  return n
}
function completedForDay(tasks, logs, key) {
  let n = logs.filter((l) => dayKey(l.reviewed_at) === key).length
  for (const t of tasks) {
    if (t.kind === 'ddl' && t.completed_at && t.ddl_date === key && dayKey(t.completed_at) === key) n++
  }
  return n
}
function recountStats(key) {
  const planned = plannedForDay(STATE.tasks, key)
  const completed = completedForDay(STATE.tasks, STATE.logs, key)
  const cur = STATE.stats[key] || { planned: 0, completed: 0 }
  STATE.stats[key] = { planned: Math.max(cur.planned, planned), completed }
  return STATE.stats[key]
}
function bumpPlanned() {
  const key = todayKey()
  const planned = plannedForDay(STATE.tasks, key)
  const cur = STATE.stats[key] || { planned: 0, completed: 0 }
  STATE.stats[key] = { planned: Math.max(cur.planned, planned), completed: cur.completed }
  saveState()
}

/* ========== 视图切换 ========== */
function show(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'))
  $('#view-' + view).classList.remove('hidden')
}

/* ========== 今日列表 ========== */
let TASKS = []

function sortReviewTasks(list) {
  return list.sort((a, b) => new Date(a.card.due) - new Date(b.card.due) || new Date(a.created_at) - new Date(b.created_at))
}

async function refreshTasks() {
  TASKS = await loadTasks()
  await bumpPlanned()
  renderToday()
}

function renderToday() {
  const now = new Date()
  $('#today-title').textContent = `${fmtCN(now)} · ${weekdayCN(now)}`

  const tk = todayKey()
  const dueReviews = sortReviewTasks(TASKS.filter((t) => t.kind === 'review' && t.card && new Date(t.card.due) <= new Date(tk + 'T23:59:59')))
  const overdueDdls = TASKS.filter((t) => t.kind === 'ddl' && !t.completed_at && t.ddl_date && t.ddl_date < tk)
  const todayDdls = TASKS.filter((t) => t.kind === 'ddl' && !t.completed_at && t.ddl_date === tk)
  const doneDdls = TASKS.filter((t) => t.kind === 'ddl' && t.completed_at && dayKey(t.completed_at) === tk)
  const doneReviews = 0 // 复习完成后 due 后移，自动离开列表

  const items = [
    ...dueReviews.map((t) => ({ t, type: 'review' })),
    ...todayDdls.map((t) => ({ t, type: 'ddl' })),
    ...overdueDdls.map((t) => ({ t, type: 'ddl', overdue: true })),
  ]

  let html = ''
  if (!items.length) {
    html += `<div class="empty-tip">今天没有要复习的内容 🎉<br><span style="font-size:12px">在下方输入框添加今天新学的内容</span></div>`
  } else {
    let lastLabel = null
    items.forEach((it, i) => {
      const label = it.type === 'review' ? null : (it.overdue ? 'DDL 任务（已逾期）' : 'DDL 任务')
      if (label && label !== lastLabel) {
        html += `<div class="list-label">${label} —— 排在最后</div>`
        lastLabel = label
      }
      const t = it.t
      const atts = t.attachments || []
      const meta = []
      if (it.type === 'review') {
        meta.push(esc(fmtDue(t.card)))
        meta.push(`记住率 ${Number(t.desired_retention).toFixed(2)}`)
      } else {
        meta.push(`<span class="tag tag-ddl">DDL: ${esc(t.ddl_date)}</span>`)
      }
      if (it.overdue) meta.unshift('<span class="tag tag-overdue">逾期</span>')
      if (atts.length) meta.push(`<span class="tag tag-file">📎${atts.length}</span>`)
      html += `
        <div class="task-item ${it.type === 'review' ? 'is-review' : ''}" data-id="${t.id}">
          <div class="task-num">${i + 1}</div>
          <div class="task-body" data-act="detail">
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-meta">${meta.join('')}</div>
          </div>
          <button class="check" data-act="check" aria-label="完成">✓</button>
        </div>`
    })
  }

  if (doneDdls.length) {
    doneDdls.forEach((t) => {
      html += `
        <div class="task-item completed" data-id="${t.id}">
          <div class="task-num">✓</div>
          <div class="task-body" data-act="detail">
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-meta"><span class="tag tag-ddl">DDL: ${esc(t.ddl_date)}</span> 已完成</div>
          </div>
          <button class="check" data-act="uncheck" aria-label="取消完成">✓</button>
        </div>`
    })
  }
  $('#today-list').innerHTML = html
  const note = $('#today-done-note')
  const totalDone = doneReviews + doneDdls.length
  note.classList.toggle('hidden', !totalDone)
  if (totalDone) note.textContent = `今天已完成 ${totalDone} 项任务 💪`

  /* 绑定事件 */
  $$('#today-list .task-item').forEach((el) => {
    const id = Number(el.dataset.id)
    el.querySelector('[data-act="check"]').addEventListener('click', () => onCheck(id))
    const un = el.querySelector('[data-act="uncheck"]')
    if (un) un.addEventListener('click', () => onUncheck(id))
    el.querySelector('[data-act="detail"]').addEventListener('click', () => openDetail(id))
  })
}

async function onCheck(id) {
  const t = TASKS.find((x) => x.id === id)
  if (!t) return
  try {
    if (t.kind === 'ddl') {
      await completeDdl(t)
    } else {
      await doReview(t, F.Rating.Good) // 默认按"记得（好）"处理；详情里可选其他评分
    }
    toast(t.kind === 'ddl' ? '已完成 ✅' : '已复习，下次时间已排好 ✅')
    await refreshTasks()
  } catch (e) { toast(e.message || '操作失败') }
}
async function onUncheck(id) {
  const t = TASKS.find((x) => x.id === id)
  if (!t) return
  try { await uncompleteDdl(t); await refreshTasks() } catch (e) { toast(e.message || '操作失败') }
}

/* ========== 添加任务 ========== */
let pickedFiles = []

function renderChips() {
  $('#attach-chips').innerHTML = pickedFiles.map((f, i) =>
    `<span class="chip">📎 ${esc(f.name)} <button data-i="${i}">✕</button></span>`).join('')
  $$('#attach-chips .chip button').forEach((b) =>
    b.addEventListener('click', () => { pickedFiles.splice(Number(b.dataset.i), 1); renderChips() }))
}

function bindAdd() {
  $('#file-input').addEventListener('change', (e) => {
    pickedFiles.push(...e.target.files)
    e.target.value = ''
    renderChips()
  })
  $('#ddl-toggle').addEventListener('change', (e) => {
    const on = e.target.checked
    $('#ddl-date').classList.toggle('hidden', !on)
    if (on && !$('#ddl-date').value) $('#ddl-date').value = todayKey()
    $('#add-hint').textContent = on ? '一次性任务，只在 DDL 当天计入完成率' : '不设 DDL → 自动按遗忘曲线安排复习'
  })
  $('#btn-add').addEventListener('click', addTaskFromInput)
  $('#task-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTaskFromInput() })
}

async function addTaskFromInput() {
  const title = $('#task-input').value.trim()
  if (!title) { toast('必须写明标题（标题即行动）'); return }
  const isDdl = $('#ddl-toggle').checked
  const ddlDate = isDdl ? $('#ddl-date').value : null
  if (isDdl && !ddlDate) { toast('请选择 DDL 日期'); return }
  const btn = $('#btn-add'); btn.disabled = true
  try {
    const task = await createTask({ title, kind: isDdl ? 'ddl' : 'review', ddlDate })
    if (pickedFiles.length) await attachFiles(task, pickedFiles, [])
    pickedFiles = []
    renderChips()
    $('#task-input').value = ''
    $('#ddl-toggle').checked = false
    $('#ddl-date').classList.add('hidden')
    $('#add-hint').textContent = '不设 DDL → 自动按遗忘曲线安排复习'
    toast(isDdl ? 'DDL 任务已加到列表末尾' : '已加入今日复习计划')
    await refreshTasks()
  } catch (e) {
    toast(e.message || '添加失败')
  } finally {
    btn.disabled = false
  }
}

/* ========== 详情弹窗 ========== */
function openModal(html) {
  $('#modal-root').innerHTML = `<div class="modal">${html}</div>`
  $('#modal-root').classList.remove('hidden')
  $('#modal-root').onclick = (e) => { if (e.target.id === 'modal-root') closeModal() }
}
function closeModal() {
  $('#modal-root').classList.add('hidden')
  $('#modal-root').innerHTML = ''
  $('#modal-root').onclick = null
}

async function openDetail(id) {
  const t = TASKS.find((x) => x.id === id)
  if (!t) return
  const isReview = t.kind === 'review'
  const atts = t.attachments || []

  let scheduleInfo = ''
  let rateRow = ''
  let retRow = ''
  if (isReview && t.card) {
    const card = deserializeCard(t.card)
    const days = Number(t.desired_retention) > 0 ? intervalForRetention(Number(card.stability) || 0, Number(t.desired_retention)) : 0
    scheduleInfo = `<p class="m-sub">当前记住率 ${Number(t.desired_retention).toFixed(2)} · 记忆稳定度约 ${Number(card.stability).toFixed(1)} 天 · 已复习 ${card.reps} 次${card.lapses ? ` · 忘过 ${card.lapses} 次` : ''}</p>`
    if (card.reps > 0) {
      const due = new Date(card.due)
      scheduleInfo += `<p class="m-sub">下次复习：${fmtCN(due)}（${fmtDue(card)}）</p>`
    }
    rateRow = `
      <div class="m-label">这次复习效果如何？（FSRS 会据此排下次时间）</div>
      <div class="rate-row">
        <button class="rate-btn rate-again" data-rate="1">忘了</button>
        <button class="rate-btn rate-hard" data-rate="2">难</button>
        <button class="rate-btn rate-good" data-rate="3">好</button>
        <button class="rate-btn rate-easy" data-rate="4">简单</button>
      </div>`
    retRow = `
      <div class="m-label">目标记住率（考前调高 → 间隔自动缩短）</div>
      <div class="ret-row">
        <input type="range" id="ret-slider" min="0.70" max="0.97" step="0.01" value="${Number(t.desired_retention)}">
        <span class="ret-val" id="ret-val">${Number(t.desired_retention).toFixed(2)}</span>
      </div>
      <div class="preset-row">${RET_PRESETS.map((p) =>
        `<button class="preset ${Math.abs(Number(t.desired_retention) - p.value) < 0.005 ? 'active' : ''}" data-ret="${p.value}">${p.label}</button>`).join('')}</div>`
  } else {
    scheduleInfo = `<p class="m-sub">DDL：${esc(t.ddl_date)} · 只在 DDL 当天计入完成率${t.completed_at ? ' · 已完成' : ''}</p>
      <div class="m-label">修改 DDL</div>
      <input type="date" id="ddl-edit" class="m-input" value="${esc(t.ddl_date || '')}">`
  }

  const attachHtml = atts.length ? `
    <div class="m-label">附件（${atts.length}）</div>
    <div class="m-attach">${atts.map((a, i) =>
      `<a href="#" data-att="${i}">📎 ${esc(a.name)} <span style="opacity:.6">(${fmtSize(a.size)})</span></a>`).join('')}</div>` : ''

  openModal(`
    <h3>${esc(t.title)}</h3>
    ${scheduleInfo}
    ${rateRow}
    ${retRow}
    ${attachHtml}
    <div class="m-actions">
      <button class="m-close" data-act="close">关闭</button>
      <button class="m-delete" data-act="delete">删除任务</button>
    </div>
  `)

  $$('#modal-root .rate-btn').forEach((b) => b.addEventListener('click', async () => {
    try {
      await doReview(t, Number(b.dataset.rate))
      closeModal()
      toast('已记录，下次复习时间已更新')
      await refreshTasks()
    } catch (e) { toast(e.message || '操作失败') }
  }))

  const slider = $('#ret-slider')
  if (slider) {
    slider.addEventListener('input', () => { $('#ret-val').textContent = Number(slider.value).toFixed(2) })
    slider.addEventListener('change', async () => {
      try {
        await changeRetention(t, Number(slider.value))
        toast('记忆强度已调整，复习计划已重排')
        await refreshTasks()
      } catch (e) { toast(e.message || '调整失败') }
    })
    $$('#modal-root .preset').forEach((p) => p.addEventListener('click', async () => {
      const r = Number(p.dataset.ret)
      slider.value = r
      $('#ret-val').textContent = r.toFixed(2)
      $$('#modal-root .preset').forEach((x) => x.classList.toggle('active', x === p))
      try {
        await changeRetention(t, r)
        toast('记忆强度已调整，复习计划已重排')
        await refreshTasks()
      } catch (e) { toast(e.message || '调整失败') }
    }))
  }

  const ddlEdit = $('#ddl-edit')
  if (ddlEdit) {
    ddlEdit.addEventListener('change', async () => {
      if (!ddlEdit.value) return
      try {
        t.ddl_date = ddlEdit.value
        saveState()
        toast('DDL 已更新')
        await refreshTasks()
      } catch (e) { toast(e.message || '修改失败') }
    })
  }

  $$('#modal-root [data-att]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault()
    try {
      const att = atts[Number(a.dataset.att)]
      const bin = atob(att.data.split(',')[1] || '')
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: att.type || 'application/octet-stream' }))
      const win = window.open(url, '_blank')
      if (!win) {
        const link = document.createElement('a')
        link.href = url
        link.download = att.name
        link.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) { toast('打开附件失败') }
  }))

  $('#modal-root [data-act="close"]').addEventListener('click', closeModal)
  $('#modal-root [data-act="delete"]').addEventListener('click', async () => {
    if (!confirm(`确定删除「${t.title}」？删除后不可恢复。`)) return
    try {
      await deleteTask(t)
      closeModal()
      toast('已删除')
      await refreshTasks()
    } catch (e) { toast(e.message || '删除失败') }
  })
}

/* ========== 更多功能 ========== */
function lineChart(container, labels, values, { unit = '', percent = false, color = '#4f7cff' } = {}) {
  const w = 150, h = 90, pad = { l: 6, r: 6, t: 12, b: 16 }
  const max = percent ? 100 : Math.max(1, ...values)
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
  const pts = values.map((v, i) => {
    const x = pad.l + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw)
    const y = pad.t + ih - (Math.min(v, max) / max) * ih
    return [x, y]
  })
  const poly = pts.map((p) => p.join(',')).join(' ')
  const dots = pts.map((p, i) => {
    const v = values[i]
    const label = percent ? Math.round(v) + '%' : v + (v >= 100 && !percent ? '' : '')
    return `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${color}"/>
      <text x="${p[0]}" y="${p[1] - 5}" font-size="8" text-anchor="middle" fill="${color}">${label}</text>`
  }).join('')
  const xlabels = labels.map((l, i) => {
    const x = pts[i] ? pts[i][0] : pad.l + iw / 2
    return `<text x="${x}" y="${h - 3}" font-size="8" text-anchor="middle" fill="#9aa1b2">${l}</text>`
  }).join('')
  container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${xlabels}</svg>`
}

async function renderMore() {
  await loadState()
  const tasks = STATE.tasks
  const logs = loadRecentLogs(30)
  const stats = loadStats(30)
  TASKS = tasks

  /* 近7天折线图 */
  const days = []
  for (let i = 6; i >= 0; i--) days.push(dayKey(addDays(new Date(), -i)))
  const countVals = [], pctVals = [], labels = []
  for (const d of days) {
    const row = stats.find((s) => s.day === d)
    labels.push(d.slice(5).replace('-', '/'))
    countVals.push(row ? row.completed : 0)
    if (row && row.planned > 0) pctVals.push(Math.min(100, (row.completed / row.planned) * 100))
    else pctVals.push(0)
  }
  lineChart($('#chart-count'), labels, countVals, {})
  lineChart($('#chart-percent'), labels, pctVals, { percent: true, color: '#18a058' })

  /* 接下来14天 */
  const upcoming = $('#upcoming')
  const perDay = []
  for (let i = 0; i < 14; i++) {
    const key = dayKey(addDays(new Date(), i))
    const reviews = tasks.filter((t) => t.kind === 'review' && t.card && dayKey(new Date(t.card.due)) === key)
    const ddls = tasks.filter((t) => t.kind === 'ddl' && !t.completed_at && t.ddl_date === key)
    if (reviews.length + ddls.length) perDay.push({ key, reviews, ddls, i })
  }
  if (!perDay.length) {
    upcoming.innerHTML = `<div class="empty-tip">未来 14 天暂无排期</div>`
  } else {
    upcoming.innerHTML = perDay.map((d) => `
      <div class="up-day ${d.i === 0 ? 'is-today' : ''}">
        <div class="up-head">
          <span class="up-date">${d.i === 0 ? '今天' : fmtCN(new Date(d.key + 'T00:00'))} ${weekdayCN(new Date(d.key + 'T00:00'))}</span>
          <span class="up-count">${d.reviews.length + d.ddls.length} 项</span>
        </div>
        <div class="up-items">
          ${d.reviews.map((t) => `<div class="up-item"><span style="color:var(--accent)">•</span>${esc(t.title)}</div>`).join('')}
          ${d.ddls.map((t) => `<div class="up-item"><span class="tag tag-ddl">DDL</span>${esc(t.title)}</div>`).join('')}
        </div>
      </div>`).join('')
  }

  /* 任务管理 */
  const manage = $('#manage-list')
  const active = [
    ...sortReviewTasks(tasks.filter((t) => t.kind === 'review')),
    ...tasks.filter((t) => t.kind === 'ddl').sort((a, b) => (a.ddl_date || '').localeCompare(b.ddl_date || '')),
  ]
  if (!active.length) {
    manage.innerHTML = `<div class="empty-tip">还没有任务</div>`
  } else {
    manage.innerHTML = active.map((t) => {
      const isReview = t.kind === 'review'
      const sub = isReview
        ? `下次复习：${fmtDue(t.card)} · 记住率 ${Number(t.desired_retention).toFixed(2)}`
        : `DDL：${t.ddl_date}${t.completed_at ? ' · 已完成' : ''}`
      const retCtl = isReview ? `
        <div class="ret-row">
          <input type="range" min="0.70" max="0.97" step="0.01" value="${Number(t.desired_retention)}" data-ret-slider="${t.id}">
          <span class="ret-val" data-ret-val="${t.id}">${Number(t.desired_retention).toFixed(2)}</span>
        </div>
        <div class="preset-row">
          ${RET_PRESETS.map((p) => `<button class="preset ${Math.abs(Number(t.desired_retention) - p.value) < 0.005 ? 'active' : ''}" data-ret-preset="${t.id}" data-ret="${p.value}">${p.label}</button>`).join('')}
        </div>` : ''
      return `
        <div class="manage-item">
          <div class="manage-head">
            <div>
              <div class="manage-title">${isReview ? '📖' : '⏰'} ${esc(t.title)}</div>
              <div class="manage-sub">${sub}${(t.attachments || []).length ? ` · 📎${t.attachments.length}` : ''}</div>
            </div>
            <button class="manage-del" data-del="${t.id}">删除</button>
          </div>
          ${retCtl}
        </div>`
    }).join('')
  }

  /* 管理列表事件 */
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const t = TASKS.find((x) => x.id === Number(b.dataset.del))
    if (!t || !confirm(`确定删除「${t.title}」？删除后不可恢复。`)) return
    try { await deleteTask(t); toast('已删除'); await renderMore() } catch (e) { toast(e.message || '删除失败') }
  }))
  $$('[data-ret-slider]').forEach((s) => {
    const id = Number(s.dataset.retSlider)
    s.addEventListener('input', () => { $(`[data-ret-val="${id}"]`).textContent = Number(s.value).toFixed(2) })
    s.addEventListener('change', async () => {
      const t = TASKS.find((x) => x.id === id)
      try {
        await changeRetention(t, Number(s.value))
        toast('已按遗忘曲线重排复习计划')
        await renderMore()
      } catch (e) { toast(e.message || '调整失败') }
    })
  })
  $$('[data-ret-preset]').forEach((p) => p.addEventListener('click', async () => {
    const id = Number(p.dataset.retPreset)
    const t = TASKS.find((x) => x.id === id)
    try {
      await changeRetention(t, Number(p.dataset.ret))
      toast('已按遗忘曲线重排复习计划')
      await renderMore()
    } catch (e) { toast(e.message || '调整失败') }
  }))
}

/* ========== 启动（打开即用） ========== */
async function boot() {
  bindAdd()
  $('#btn-export').addEventListener('click', exportBackup)
  $('#btn-import').addEventListener('click', () => $('#import-input').click())
  $('#import-input').addEventListener('change', (e) => {
    const f = e.target.files[0]
    if (f) importBackup(f)
    e.target.value = ''
  })
  $('#btn-more').addEventListener('click', async () => { show('more'); await renderMore() })
  $('#btn-back').addEventListener('click', () => { show('list'); renderToday() })

  const ok = await loadFsrs()
  if (!ok) {
    toast('算法库加载失败，请检查网络后刷新重试', 6000)
    return
  }

  show('list')
  try {
    await refreshTasks()
  } catch (e) {
    toast('数据读取失败：' + (e.message || '请刷新重试'), 6000)
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  }
}

boot().catch((e) => {
  console.error(e)
  toast('初始化失败：' + (e.message || '请刷新重试'), 6000)
})
