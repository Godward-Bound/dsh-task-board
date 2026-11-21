# dsh-task-board

> 简体中文 | [English](README.en.md)

DSH 插件：一条调用列出工作区任务卡看板——哪张没开工、哪张在跑、哪张做完、哪张卡住。只读、零依赖、不改任何卡。

「任务卡」= 一个 Markdown 文件写一条给 agent 的一次性任务指令。卡多了之后「跑没跑、跑到哪、结果在哪」只能靠人翻目录，这个工具把它变成一句话的事。

## 安装

在 DSH 会话里：

```
dsh plugin --profile desktop add github:Godward-Bound/dsh-task-board
```

`desktop` 换成你的 profile 名。

## 用法

工具名 `task_board`：

| 调用 | 行为 |
|---|---|
| `task_board(what=list)`（默认） | 全量一张表，按最后改动倒序 |
| `task_board(what=detail, name=…)` | 单卡：目标一句话、状态、报告开头、没打勾的验收项 |
| `task_board(what=stale)` | 超过 `staleDays` 天没动、又没报告的卡 |
| `task_board(what=template)` | 输出一张可直接落盘的卡骨架（空看板时从这里开始） |

## 输出示例

`task_board(what=list)` 的真实输出格式（卡名做了替换）：

```
卡名                 状态             最后改动     报告
重构登录页-20261121  未开工           11-21 21:46   -
修复构建-20261121    有报告，待核对?  11-21 03:00   插件-修复构建-20261121.md
写周报               有报告，待核对?  11-21 02:55   周报-20261121.md

共 3 张卡 · 有报告 2 · 未开工 1
```

状态后缀 `?` = 推断出来的（卡里没写状态行，看报告文件在不在猜的）；照抄卡面的状态没有 `?`。

## 卡的格式

- 文件名：`_任务卡-<名字>.md`（可用 `filePattern` 改成你自己的命名约定），放进卡目录。
- 头部一行状态：`> 状态：未开工`（或 `在跑` / `做完，见 _reports/xxx.md`）。
- `## 0 一句话目标` 段的首行 = 看板上显示的目标。
- `## 验收` 段里的 `- [ ]` 行 = 未打勾的验收项。
- `## 输出`（或 `## 交付`）段里的第一个 `.md` 路径 = 报告位置，detail 会展示报告前 20 行。

不知道怎么起手就调 `task_board(what=template)`，拿到的骨架可以直接写进文件。

## Config

| 键 | 默认 | 作用 |
|---|---|---|
| `workspaceRoot` | 空 = 跟随当前工作区（cwd） | `cardsDir` 为相对路径时的解析锚点 |
| `cardsDir` | `tasks` | 卡目录（相对 `workspaceRoot`，绝对路径也认） |
| `filePattern` | `^_任务卡-.+\.md$` | 卡文件名过滤正则（字符串，不带首尾斜杠） |
| `staleDays` | `3` | stale 的天数线 |

卡目录不存在时返回「试过哪些路径 + 怎么改 config」的引导，不抛异常。

更多细节见 [docs/DETAIL.md](docs/DETAIL.md)。

## License

[MIT](LICENSE) © 2026 Godward-Bound
