import { serviceOf } from './shared.js'

/** /board 斜杠命令：宿主侧直接执行，不产生模型消息、不烧 token。
 *  拿不到 commands 服务就安静跳过（headless / 老宿主），只记一行日志——
 *  不要把 'commands' 写进 inject 数组，那会让 headless 环境整棵树挂。
 *  runBoard 由 index.js 传入（绑定好 cfg 的版本）：工具与命令共用同一条实现路径
 *  （one operation, two callers）。 */
export function registerBoardCommand(ctx, { runBoard, log } = {}) {
  const commands = serviceOf(ctx, 'commands')
  if (!commands || typeof commands.register !== 'function') {
    log?.('没注册命令：宿主没有 commands 服务')
    return null
  }
  return commands.register({
    name: 'board',
    description: '任务卡看板：list 全量表 / stale 过期卡 / detail 单卡 / template 卡骨架',
    input: { hint: '[list|stale|detail|template] [卡名]' },
    handler(invocation) {
      const parts = String(invocation?.rawInput ?? '').trim().split(/\s+/).filter(Boolean)
      const what = (parts[0] || 'list').toLowerCase()
      if (!['list', 'stale', 'detail', 'template'].includes(what)) {
        return { kind: 'error', text: '用法：/board [list|stale|detail|template] [卡名]' }
      }
      if (what === 'detail' && !parts[1]) {
        return { kind: 'error', text: '用法：/board detail <卡名>（/board list 看全部）' }
      }
      return Promise.resolve()
        .then(() => runBoard(what, parts.slice(1).join(' ')))
        .then((r) => ({ kind: r.isError ? 'error' : 'success', text: r.report }))
        .catch((e) => ({ kind: 'error', text: `/board 出错：${String(e?.message ?? e)}` }))
    },
  })
}
