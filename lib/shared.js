/** 宿主服务兜底获取：ctx.get(name) ?? ctx[name]，取不到 return null，绝不抛。
 *  （任务卡 §8 骨架照抄——不要把服务名写进 inject 数组，headless 下整棵树会挂。） */
export function serviceOf(ctx, name) {
  try { const v = ctx?.get?.(name); if (v) return v } catch {}
  try { return ctx?.[name] ?? null } catch { return null }
}

/** 供 followup / steer / inject 三条投递通道使用的标准消息形状
 *  （本卡默认一条都不用，留作标准形状防止乱拼字段）。 */
export function userMessage(text, kind) {
  return { id: crypto.randomUUID(), role: 'user', content: [{ type: 'text', text: String(text) }], source: { kind } }
}
