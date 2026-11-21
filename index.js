/**
 * dsh-task-board —— 任务卡看板
 *
 * 一条调用列出卡目录（Config.cardsDir，默认 `tasks/`）下所有任务卡的状态：
 * 哪张没开工、哪张在跑、哪张做完、哪张卡住。
 *
 * 边界：
 *   · 只读。不改任何卡、不写任何文件。
 *   · 只用 Node 内置模块，零依赖。
 *   · 状态判定按优先级，命中即停：
 *       1. 卡里 `> 状态：` 行 → 照抄（事实）
 *       2. 没状态行但报告文件在 → `有报告，待核对`（推断，渲染加 `?`）
 *       3. 都没有 → `未开工`（推断，渲染加 `?`）
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, basename } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-task-board'

/* ───────────────────────── 配置 ───────────────────────── */

const DEFAULTS = {
  /** 工作区根：cardsDir 为相对路径时相对它解析。留空 = 跟随当前工作区（cwd）。 */
  workspaceRoot: '',
  /** 卡目录，相对 workspaceRoot（绝对路径也认）。 */
  cardsDir: 'tasks',
  /** 卡文件名过滤正则（字符串形式，不带首尾斜杠）。默认兼容 `_任务卡-*.md` 命名约定。 */
  filePattern: '^_任务卡-.+\\.md$',
  /** stale 的天数线。 */
  staleDays: 3,
}

/**
 * 宿主共享包加载兜底（schemastery 住在宿主 app 的 node_modules，
 * 从插件目录 bare import 可能 ERR_MODULE_NOT_FOUND —— 跟 dsh-yubagu 同款策略）。
 */
async function loadSchemastery() {
  const roots = []
  try {
    const exe = process.execPath.replace(/\\/g, '/')
    const dir = exe.slice(0, exe.lastIndexOf('/'))
    roots.push(`${dir}/resources/app/dsh/node_modules`, `${dir}/node_modules`)
  } catch { /* 推断失败就跳过 */ }
  try { roots.push(`${homedir().replace(/\\/g, '/')}/AppData/Local/Programs/DeepSeek Harness/resources/app/dsh/node_modules`) } catch { /* 同上 */ }
  try { roots.push(`${homedir().replace(/\\/g, '/')}/.dsh/profiles/desktop/node_modules`) } catch { /* 同上 */ }
  for (const root of roots) {
    for (const entry of ['lib/index.mjs', 'lib/index.cjs']) {
      const abs = `${root}/@deepseek-ai/schemastery/${entry}`
      try {
        if (!existsSync(abs.replace(/\//g, '\\'))) continue
        const mod = await import('file:///' + abs.split('/').map(encodeURIComponent).join('/').replace(/%3A/gi, ':'))
        const z = mod?.default ?? mod
        if (typeof z?.object === 'function') return z
      } catch { /* 试下一个候选 */ }
    }
  }
  return null
}

const z = await loadSchemastery()
export const Config = z
  ? z.object({
      workspaceRoot: z.string().default(DEFAULTS.workspaceRoot),
      cardsDir: z.string().default(DEFAULTS.cardsDir),
      filePattern: z.string().default(DEFAULTS.filePattern),
      staleDays: z.number().default(DEFAULTS.staleDays),
    })
  : undefined

/* ───────────────────────── 纯逻辑（_internals 供外部单测） ───────────────────────── */

/** 显示宽度：CJK/全角算 2，其它算 1。对齐表格够用。 */
function charWidth(ch) {
  const code = ch.codePointAt(0)
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    code >= 0x20000
  ) return 2
  return 1
}

function displayWidth(s) {
  let w = 0
  for (const ch of String(s)) w += charWidth(ch)
  return w
}

/** CJK 感知的 padEnd。 */
function padEndW(s, width) {
  s = String(s)
  const pad = width - displayWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

/** 超过 maxBytes 就按整行截断，尾部留标记。 */
function capBytes(s, maxBytes = 4096) {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s
  const suffix = '\n…（超出 4KB，截断）'
  const budget = maxBytes - Buffer.byteLength(suffix, 'utf8')
  let out = ''
  for (const line of s.split('\n')) {
    const candidate = out ? `${out}\n${line}` : line
    if (Buffer.byteLength(candidate, 'utf8') > budget) break
    out = candidate
  }
  return out + suffix
}

/** 解析 cardsDir：绝对路径直接用；相对的依次试 workspaceRoot、process.cwd()。 */
function resolveCardsDir(cfg) {
  const tried = []
  const raw = String(cfg.cardsDir || DEFAULTS.cardsDir)
  if (isAbsolute(raw)) {
    tried.push(raw)
    if (existsSync(raw)) return { dir: raw, tried }
    return { dir: null, tried }
  }
  const root = String(cfg.workspaceRoot || DEFAULTS.workspaceRoot)
  const candidates = [join(root, raw), join(process.cwd(), raw)]
  for (const c of candidates) {
    tried.push(c)
    if (existsSync(c)) return { dir: c, tried }
  }
  return { dir: null, tried }
}

/** 从一段 markdown 里抓 `## …输出` / `## …交付` 段落（含 `## 8 输出`、`## 0. 一句话目标` 编号变体）。 */
function sectionOf(lines, headingRe) {
  const hits = []
  let current = null
  for (const line of lines) {
    const m = /^#{1,3}\s+(.*)$/.exec(line)
    if (m) {
      if (current) hits.push(current)
      current = headingRe.test(m[1].trim()) ? [] : null
    } else if (current) {
      current.push(line)
    }
  }
  if (current) hits.push(current)
  return hits
}

/** 抓段落里第一个 `.md` 路径（可带 `X:\` 盘符前缀；行尾标点剥掉）。 */
function firstMdPath(sectionLines) {
  const re = /(?:[A-Za-z]:[\\/])?[^\s`'"|<>：:，。；、！？（）()\[\]）]+\.md/g
  for (const line of sectionLines) {
    const m = re.exec(line)
    if (m) return m[0].replace(/[）)。，；、.]$/, '')
  }
  return null
}

/** 报告相对路径 → 绝对路径（相对 workspaceRoot；绝对路径原样）。 */
function resolveReport(reportRel, cfg) {
  if (!reportRel) return null
  if (isAbsolute(reportRel)) return reportRel
  return join(String(cfg.workspaceRoot || DEFAULTS.workspaceRoot), reportRel)
}

/** 状态行：`> 状态：…`，支持全角/半角冒号。只在头部 40 行找。 */
function statusLineOf(headLines) {
  for (const line of headLines) {
    const m = /^>\s*状态[：:]\s*(.+?)\s*$/.exec(line)
    if (m) return m[1]
  }
  return null
}

/** `## 0 一句话目标` / `## 目标` 段落的首行（= 目标一句话）。 */
function goalOf(lines) {
  const sections = sectionOf(lines, /^(?:\d+[.、]?\s*)?(?:一句话目标|目标)\s*(?:[（(].*)?$/)
  for (const sec of sections) {
    for (const line of sec) {
      const t = line.trim()
      if (!t) continue
      if (/^#{1,3}\s/.test(t)) continue
      return t
    }
  }
  return null
}

/** 未打勾的验收项：`- [ ]` 开头的行。 */
function uncheckedOf(lines) {
  const out = []
  for (const line of lines) {
    const m = /^\s*[-*]\s*\[ \]\s*(.+?)\s*$/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/** 扫一张卡。full = 整卡文本（报告路径常在 40 行外，交付/输出段扫全文）。 */
function readCard(file, cardsDir, cfg) {
  const raw = readFileSync(join(cardsDir, file), 'utf8')
  const lines = raw.split(/\r?\n/)
  const head40 = lines.slice(0, 40)
  const st = statSync(join(cardsDir, file))

  // 报告路径：输出段优先（末段更"最终"），其次交付段；同段落按文档顺序取第一个。
  const outSections = sectionOf(lines, /^(?:\d+[.、]?\s*)?输出/)
  const deliverSections = sectionOf(lines, /^(?:\d+[.、]?\s*)?交付/)
  const reportRel = firstMdPath(outSections[0] ?? []) ?? firstMdPath(deliverSections[0] ?? [])

  const reportAbs = resolveReport(reportRel, cfg)
  const reportExists = Boolean(reportAbs && existsSync(reportAbs))

  // 状态判定：命中即停。推断出来的渲染时加 `?`。
  let status, inferred
  const stated = statusLineOf(head40)
  if (stated) {
    status = stated
    inferred = false
  } else if (reportExists) {
    status = '有报告，待核对'
    inferred = true
  } else {
    status = '未开工'
    inferred = true
  }

  return {
    file,
    name: file.replace(/^_任务卡-/, '').replace(/\.md$/, ''),
    status,
    inferred,
    reportRel,
    reportAbs,
    reportExists,
    mtime: st.mtime,
    lines,
  }
}

/** 扫整个卡目录，mtime 倒序。卡文件名按 Config.filePattern 过滤，正则编译失败抛 EBADFILEPATTERN。 */
function listCards(cardsDir, cfg) {
  let fileRe
  try {
    fileRe = new RegExp(String(cfg.filePattern ?? DEFAULTS.filePattern))
  } catch (e) {
    const err = new Error(`filePattern 不是合法正则：${e?.message ?? e}`)
    err.code = 'EBADFILEPATTERN'
    throw err
  }
  const files = readdirSync(cardsDir).filter((f) => fileRe.test(f))
  const cards = files.map((f) => readCard(f, cardsDir, cfg))
  cards.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  return cards
}

/** `MM-DD HH:mm`。 */
function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function renderList(cards) {
  if (!cards.length) return '卡目录里没有匹配 filePattern 的卡。想要一张能直接落盘的卡骨架：what=template。'
  const wName = Math.max(displayWidth('卡名'), ...cards.map((c) => displayWidth(c.name)))
  const wStatus = Math.max(displayWidth('状态'), ...cards.map((c) => displayWidth(c.status + (c.inferred ? '?' : ''))))
  const header = `${padEndW('卡名', wName)}  ${padEndW('状态', wStatus)}  最后改动     报告`
  const rows = cards.map((c) => {
    const st = c.status + (c.inferred ? '?' : '')
    const report = c.reportExists ? basename(c.reportAbs) : '-'
    return `${padEndW(c.name, wName)}  ${padEndW(st, wStatus)}  ${fmtTime(c.mtime)}   ${report}`
  })
  const withReport = cards.filter((c) => c.reportExists).length
  const notStarted = cards.filter((c) => c.status === '未开工').length
  return [header, ...rows, '', `共 ${cards.length} 张卡 · 有报告 ${withReport} · 未开工 ${notStarted}`].join('\n')
}

function renderDetail(card, cfg) {
  const st = card.status + (card.inferred ? '?' : '')
  const parts = [`卡：${card.name}`, `状态：${st}`]
  const goal = goalOf(card.lines)
  if (goal) parts.push(`目标：${goal}`)

  if (card.reportRel) {
    parts.push(`报告：${card.reportRel}${card.reportExists ? '' : '（文件不存在）'}`)
    if (card.reportExists) {
      const head = readFileSync(card.reportAbs, 'utf8').split(/\r?\n/).slice(0, 20)
      parts.push('报告前 20 行：', ...head)
    }
  } else {
    parts.push('报告：卡里没写输出/交付段，找不到报告路径')
  }

  const unchecked = uncheckedOf(card.lines)
  parts.push(unchecked.length ? `验收未打勾 ${unchecked.length} 项：` : '验收：全部打勾（或没写验收表）')
  for (const item of unchecked.slice(0, 15)) parts.push(`  [ ] ${item}`)
  if (unchecked.length > 15) parts.push(`  …还有 ${unchecked.length - 15} 项`)
  return parts.join('\n')
}

function renderStale(cards, staleDays) {
  const cutoff = Date.now() - staleDays * 86_400_000
  const stale = cards.filter((c) => c.mtime.getTime() < cutoff && !c.reportExists)
  if (!stale.length) return `没有超过 ${staleDays} 天没动、又没报告的卡。（这类是「写完了没人跑」）`
  const wName = Math.max(displayWidth('卡名'), ...stale.map((c) => displayWidth(c.name)))
  const rows = stale.map(
    (c) => `${padEndW(c.name, wName)}  ${fmtTime(c.mtime)}   已搁置 ${Math.floor((Date.now() - c.mtime.getTime()) / 86_400_000)} 天`,
  )
  return [`卡名${' '.repeat(wName - 4)}  最后改动     搁置`, ...rows].join('\n')
}

/** 卡名查找：精确 → 唯一包含 → 都没有就报错并列出可选名。 */
function findCard(cards, query) {
  const q = String(query ?? '').trim()
  if (!q) return { card: null, error: '缺 name。用 what=list 先看有哪些卡名。' }
  const exact = cards.filter((c) => c.name === q)
  if (exact.length === 1) return { card: exact[0] }
  const fuzzy = cards.filter((c) => c.name.includes(q))
  if (fuzzy.length === 1) return { card: fuzzy[0] }
  const names = cards.map((c) => c.name).join(' / ')
  return { card: null, error: exact.length > 1 ? `卡名 ${q} 命中多张，用完整卡名。现有：${names}` : `没找到卡「${q}」。现有：${names}` }
}

/** 空看板的出口：输出一张可直接落盘的卡骨架（Markdown 原文）。 */
function cardTemplate(cfg) {
  const dir = String(cfg.cardsDir || DEFAULTS.cardsDir)
  const today = new Date().toISOString().slice(0, 10)
  return [
    '# 任务卡 · <名字> · ' + today,
    '',
    '> 状态：未开工',
    '',
    '> 文件名约定：`_任务卡-<名字>.md`，放进卡目录（当前 Config.cardsDir = `' + dir + '`）。',
    '> 状态行写法：`> 状态：未开工` / `> 状态：在跑` / `> 状态：做完，见 _reports/xxx.md`。',
    '',
    '## 0 一句话目标',
    '',
    '（一句话说清这张卡要做什么、做到什么程度算完）',
    '',
    '## 验收',
    '',
    '- [ ] 验收项一：跑什么命令、期望什么输出',
    '- [ ] 验收项二',
    '',
    '## 输出',
    '',
    '报告写 `_reports/<任务名>-' + today + '.md`，把路径写在 `## 输出` 段里，看板的 detail 才能找到报告。',
  ].join('\n')
}

export const _internals = {
  charWidth, displayWidth, padEndW, capBytes, resolveCardsDir,
  sectionOf, firstMdPath, resolveReport, statusLineOf, goalOf, uncheckedOf,
  readCard, listCards, renderList, renderDetail, renderStale, findCard, fmtTime, cardTemplate,
}

/* ───────────────────────── 插件入口 ───────────────────────── */

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config || {}) }

  ctx.inject(['tools'], (ctx) => {
    ctx.tools.register({
      name: 'task_board',
      description:
        '看工作区任务卡看板：哪张没开工、哪张在跑、哪张做完、哪张卡住。'
        + 'what=list（默认）全量一张表；what=detail 传 name 看单张卡的目标、状态、报告开头和没打勾的验收项；'
        + 'what=stale 列超过 staleDays 天没动、又没报告的卡（「写完了没人跑」）；'
        + 'what=template 输出一张可直接落盘的卡骨架（空看板时从这里开始）。只读，不改卡。',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            enum: ['list', 'detail', 'stale', 'template'],
            description: '看板动作，默认 list。',
          },
          name: {
            type: 'string',
            description: 'what=detail 时要看的卡名（文件名去掉 _任务卡- 前缀和 .md 后缀）。',
          },
        },
        required: [],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['report'],
          properties: { report: { type: 'string' } },
        },
        render: (_args, value) => [{ type: 'text', text: String(value?.report ?? '') }],
      },
      execute: async (args) => {
        const what = String(args?.what ?? 'list')
        if (what === 'template') return { report: cardTemplate(cfg) }
        const { dir, tried } = resolveCardsDir(cfg)
        if (!dir) {
          return { report: `卡目录不存在。试过：${tried.join(' ; ')}。改 Config cardsDir / workspaceRoot（卡骨架模板：what=template）。` }
        }
        let cards
        try {
          cards = listCards(dir, cfg)
        } catch (e) {
          if (e?.code === 'EBADFILEPATTERN') {
            return { report: `${e.message}。Config.filePattern 例：^_任务卡-.+\\.md$` }
          }
          return { report: `扫卡目录失败：${e?.message ?? e}` }
        }

        if (what === 'detail') {
          const { card, error } = findCard(cards, args?.name)
          if (error) return { report: error }
          return { report: capBytes(renderDetail(card, cfg)) }
        }
        if (what === 'stale') {
          const days = Number(cfg.staleDays) > 0 ? Number(cfg.staleDays) : DEFAULTS.staleDays
          return { report: capBytes(renderStale(cards, days)) }
        }
        return { report: capBytes(renderList(cards)) }
      },
    })
  })
}
