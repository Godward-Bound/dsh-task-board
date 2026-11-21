<div align="center">

# 📋 dsh-task-board

**One agent call turns a folder of markdown task cards into a status board —**
**which never started, which is running, which finished, which is stuck.**

[![Platform](https://img.shields.io/badge/platform-cross--platform-0078d4)](https://github.com/Godward-Bound/dsh-task-board)
[![License](https://img.shields.io/badge/license-MIT-3fb950)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-3fb950)](https://github.com/Godward-Bound/dsh-task-board)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-8a63d2)](https://nodejs.org)

[简体中文](README.md) · **English**

</div>

---

A DSH plugin (Host-only, no UI) that registers one read-only agent tool, `task_board`.
A **task card** is a markdown file holding one one-shot task brief for an agent — once you
have more than a handful, "did it run? where did it stop? where's the result?" becomes a
folder-digging exercise. This plugin answers it in one call.
Zero dependencies, cross-platform, nothing on disk is ever modified.

## 📦 Install

In a DSH session:

```bash
dsh plugin --profile desktop add github:Godward-Bound/dsh-task-board
```

> If your desktop app has no `dsh` CLI, install from DSH's **Settings → Plugins** (search for it), or have the agent call `plugin_manager install_bundle` with this repo's URL as the target.

> To pin a version, use `github:Godward-Bound/dsh-task-board#<commit-sha>`. The official publishing docs recommend pinning a commit so later upstream pushes can't silently change what actually runs.

> Replace `desktop` with your profile name.

## 📋 Usage

| Call | What you get |
|:--|:--|
| `task_board(what=list)` *(default)* | One table of every card, most recently changed first, plus a summary line |
| `task_board(what=detail, name=…)` | One card: goal, status, first 20 lines of its report, unchecked acceptance items |
| `task_board(what=stale)` | Cards untouched for `staleDays` with no report — the "written, never run" pile |
| `task_board(what=template)` | A ready-to-save card skeleton — start here when the board is empty |

## ⌨️ Slash commands

Executed host-side — **no model messages, no tokens burned**:

| Command | What it does |
|---|---|
| `/board [list\|stale\|detail\|template] [card]` | Runs `task_board`, defaults to `list` |

> On headless hosts without a `commands` service the command is skipped quietly —
> the `task_board` tool itself is unaffected.

## 🌅 Session-start injection

Each new session's first request gets a **board snapshot** injected once (never repeated in
the same session): total cards and the not-started / running / done / stuck breakdown
(classified from status lines + inference). If the cards folder isn't ready yet, the
injection is deferred to a later turn. Disk and ports come from env-doctor's own injection.

| Key | Default | What it does |
|---|---|---|
| `autoInject` | `true` | Turn the session-start injection off |
| `autoInjectChars` | `600` | Budget for the injected text (truncated with `…`) |
| `autoInjectOrder` | `900` | Ordering of the injected section |

Every successful injection logs `auto-inject session=<id> chars=<n>`.

## 🖥 Example output

Real `task_board(what=list)` output (labels and card names are Chinese — this is the
genuine format; names below are replaced):

```text
卡名                 状态             最后改动     报告
重构登录页-20261121  未开工           11-21 21:46   -
修复构建-20261121    有报告，待核对?  11-21 03:00   插件-修复构建-20261121.md
写周报               有报告，待核对?  11-21 02:55   周报-20261121.md

共 3 张卡 · 有报告 2 · 未开工 1
```

> A trailing `?` on a status means it was **inferred** (no status line in the card; the
> board guessed from whether the report file exists). Statuses copied verbatim from the
> card carry no `?` — the board never mixes guesses with facts.

## 🗂 Card format

- **Filename**: `_任务卡-<name>.md` (rename the convention via `filePattern`), inside the cards folder.
- **Status line** in the header: `> 状态：未开工` — or `在跑`, or `做完，见 _reports/xxx.md`.
- `## 0 一句话目标` section: its first line is the goal shown on the board.
- `## 验收` section: `- [ ]` lines are the unchecked acceptance items.
- `## 输出` (or `## 交付`) section: the first `.md` path is the report location —
  `detail` previews its first 20 lines.

Not sure how to start? Call `task_board(what=template)` — the skeleton it prints can be
saved into a card file as-is.

## ⚙️ Configuration

| Key | Default | What it does |
|:--|:--|:--|
| `workspaceRoot` | empty = follow the current workspace (cwd) | Anchor for resolving a relative `cardsDir` |
| `cardsDir` | `tasks` | Cards folder (relative to `workspaceRoot`; absolute paths work too) |
| `filePattern` | `^_任务卡-.+\.md$` | Filename filter regex (string form, no surrounding slashes) |
| `staleDays` | `3` | Threshold for the `stale` view |
| `autoInject` | `true` | Session-start injection switch |
| `autoInjectChars` | `600` | Injected-text budget (truncated) |
| `autoInjectOrder` | `900` | Ordering of the injected section |

Missing cards folder? You get the list of paths it tried plus how to fix the config —
never a stack trace. An invalid `filePattern` regex gets the same treatment.

## 📄 License

[MIT](LICENSE) © 2026 Godward-Bound
