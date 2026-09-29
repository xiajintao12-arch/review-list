// 复习清单 · 数据接口
// 浏览器只访问 /api/state，与 Vercel 云存储的交互全在服务端完成
import { put, list } from '@vercel/blob'

const PATH = 'state.json'
const EMPTY = { tasks: [], logs: [], stats: {} }

async function readState() {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('NO_BLOB_TOKEN')
  const { blobs } = await list({ token, prefix: 'state.json', limit: 1 })
  if (!blobs || !blobs.length) return EMPTY
  const res = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' })
  if (!res.ok) return EMPTY
  try {
    const data = await res.json()
    return {
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
    }
  } catch (e) {
    return EMPTY
  }
}

async function writeState(state) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('NO_BLOB_TOKEN')
  const res = await put(PATH, JSON.stringify(state), {
    token,
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return res.url
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      const state = await readState()
      return res.status(200).json(state)
    }
    if (req.method === 'POST') {
      let body = req.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (e) { return res.status(400).json({ error: 'BAD_JSON' }) }
      }
      if (!body || !Array.isArray(body.tasks)) return res.status(400).json({ error: 'BAD_PAYLOAD' })
      const limitBytes = 8 * 1024 * 1024 // 附件上限：整包 8MB
      if (JSON.stringify(body).length > limitBytes) return res.status(413).json({ error: 'TOO_LARGE' })
      const url = await writeState(body)
      return res.status(200).json({ ok: true, url })
    }
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) })
  }
}
