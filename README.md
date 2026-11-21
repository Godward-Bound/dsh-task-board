<div align="center">

# 📋 dsh-task-board

**一条调用，把一文件夹的任务卡摆成看板**
**哪张没开工 · 哪张在跑 · 哪张做完 · 哪张卡住**

[![Platform](https://img.shields.io/badge/platform-cross--platform-0078d4)](https://github.com/Godward-Bound/dsh-task-board)
[![License](https://img.shields.io/badge/license-MIT-3fb950)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-3fb950)](https://github.com/Godward-Bound/dsh-task-board)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-8a63d2)](https://nodejs.org)

**简体中文** · [English](README.en.md)

</div>

---

DSH 插件（Host-only，无界面）：注册一个只读工具 `task_board`。零依赖、跨平台、不改磁盘上任何文件。

「任务卡」= 一个 Markdown 文件，写一条给 agent 的一次性任务指令。卡一多，「跑没跑、卡在哪、结果在哪」就只能靠人翻目录——这个工具把它变成一句话。

## 📦 安装

在 DSH 会话里：

```bash
dsh plugin --profile desktop add github:Godward-Bound/dsh-task-board
```

> 桌面版没有 `dsh` 命令时，也可以走 DSH 的 **Settings → Plugins** 搜索安装，或让 agent 调 `plugin_manager install_bundle`，target 传本仓库地址。

> `desktop` 换成你的 profile 名。

## 📋 用法

工具名 `task_board`：

| 调用 | 得到什么 |
|:--|:--|
| `task_board(what=list)`（默认） | 全量一张表，按最后改动倒序，末尾一行汇总 |
| `task_board(what=detail, name=…)` | 单卡：目标、状态、报告前 20 行、没打勾的验收项 |
| `task_board(what=stale)` | 超过 `staleDays` 天没动、又没报告的卡——「写完了没人跑」那堆 |
| `task_board(what=template)` | 一张可直接落盘的卡骨架——空看板从这里开始 |

## 🖥 输出示例

`task_board(what=list)` 的真实格式（卡名做了替换）：

```text
卡名                 状态             最后改动     报告
重构登录页-20261121  未开工           11-21 21:46   -
修复构建-20261121    有报告，待核对?  11-21 03:00   插件-修复构建-20261121.md
写周报               有报告，待核对?  11-21 02:55   周报-20261121.md

共 3 张卡 · 有报告 2 · 未开工 1
```

> 状态后缀 `?` = **推断**出来的（卡里没写状态行，靠报告文件在不在猜的）。照抄卡面的状态不带 `?`——看板不把猜的和事实混在一起。

## 🗂 卡的格式

- **文件名**：`_任务卡-<名字>.md`（可用 `filePattern` 换成你自己的约定），放进卡目录。
- **头部状态行**：`> 状态：未开工`——或 `在跑`、`做完，见 _reports/xxx.md`。
- `## 0 一句话目标` 段的首行 = 看板上显示的目标。
- `## 验收` 段里的 `- [ ]` 行 = 未打勾的验收项。
- `## 输出`（或 `## 交付`）段里第一个 `.md` 路径 = 报告位置，`detail` 会预览前 20 行。

不知道怎么起手就调 `task_board(what=template)`——它打出来的骨架原样存成文件就能用。

## ⚙️ 配置

| 键 | 默认 | 作用 |
|:--|:--|:--|
| `workspaceRoot` | 空 = 跟随当前工作区（cwd） | `cardsDir` 为相对路径时的解析锚点 |
| `cardsDir` | `tasks` | 卡目录（相对 `workspaceRoot`，绝对路径也认） |
| `filePattern` | `^_任务卡-.+\.md$` | 文件名过滤正则（字符串形式，不带首尾斜杠） |
| `staleDays` | `3` | `stale` 的天数线 |

卡目录不存在时，返回「试过哪些路径 + 怎么改 config」的引导，不抛异常；`filePattern` 不是合法正则也一样。

## 📄 License

[MIT](LICENSE) © 2026 Godward-Bound
