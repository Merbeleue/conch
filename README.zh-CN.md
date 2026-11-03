<p align="center">
  <img src="docs/conch-mark.svg" alt="Conch" width="112" height="112">
</p>

<h1 align="center">Conch</h1>

<p align="center">
  为 macOS 打造的现代开源 SSH 与本地终端。<br>
  原生窗口，不用 Electron，也不自带 Chromium。
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-6c5ce7"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%2012%2B-5b6478">
  <a href="https://wails.io"><img alt="Built with Wails v3" src="https://img.shields.io/badge/built%20with-Wails%20v3-2b8aef"></a>
  <img alt="Terminal" src="https://img.shields.io/badge/terminal-xterm.js%20%2B%20WebGL-2f9e6f">
</p>

<p align="center">
  简体中文 · <a href="./README.md">English</a>
</p>

---

Conch 是一个原生的 macOS 应用，给整天在几台服务器之间来回切换的人用。它基于 [Wails v3](https://wails.io)：Go 负责 SSH 连接、PTY 和 SFTP，React 负责界面，终端本身是带 WebGL 的 xterm.js，整体跑在苹果自己的 WKWebView 里。所以 Conch 的窗口开得快、空载时安静，看起来就是系统的一部分，而不是一个换了皮的浏览器标签页。

设计时想的是日常工作流，而不是功能清单：同时挂着很多主机也不会丢掉回滚缓冲，把窗口拆来拆去不用重连，不离开当前标签就能往服务器传文件夹，几台机器要做同一件事时一条命令同时敲进去。

<!--
截图放这里。把 PNG 放进 docs/screenshots/ 后取消注释即可：

![Conch 分屏](docs/screenshots/splits.png)
-->

## 亮点

| | |
| --- | --- |
| **会话** | SSH 与本地 shell 多标签并存，分屏靠拖拽拼出来，工作区名字根据里面的主机自动生成 |
| **主机管理** | 标签、可折叠分组、搜索（`⌘F`）、右键复制/编辑/删除，点一下就能跳回已打开的标签 |
| **SFTP** | 一个开在*当前标签内部*的双栏文件管理器——传输、重命名、删除、`chmod`，顶部主机标签一直在 |
| **广播输入** | 一次按键同步到所有在线会话，不足两个会话时自动关掉，不会误发 |
| **主题** | 八套主题（五深色 + 三浅色），同时改界面和终端配色，可全局设置也可按主机覆盖 |
| **顺手** | 字体和光标设置实时生效，连接动画带真正能取消的按钮，专注模式该藏的时候就藏起来 |
| **可信** | 主机密钥对照 `~/.ssh/known_hosts` 校验，首次连接弹指纹确认 |

## 快速开始

目前还没有签名的安装包，从源码构建大概一分钟：

```bash
git clone https://github.com/Merbeleue/conch.git
cd conch
npm --prefix frontend install
wails3 build                       # → bin/conch（单个可执行文件，直接运行）
./bin/conch
```

`wails3 dev` 是同样东西的开发版，Go 和前端都带热重载；`wails3 package` 会产出一个
`conch.app`，可以直接拖进「应用程序」。未签名的构建第一次打开可能需要右键 →「打开」。

除了你主动连接的主机，Conch 不会发起任何网络请求，没有账号体系、没有埋点、也不会偷偷
检查更新。你保存的一切都在本机的 localStorage 里——详见[安全说明](#安全说明)。

## 完整功能

- 原生窗口，不打包 Chromium
- xterm.js 终端，WebGL 渲染，支持 256 色与真彩色
- 本地 shell 会话：在 PTY 上跑你的登录 shell，不需要 sshd
- 认证方式：私钥（支持 passphrase，带原生文件选择器）或密码
- 主机密钥校验对照 `~/.ssh/known_hosts`，首次遇到新主机会弹出指纹确认框
- 保存的主机可加标签；单击是「聚焦已打开的标签 / 编辑未连接的主机」，双击才是连接
- 侧栏过滤框可按名称或 IP 搜索主机；在任意位置按 `⌘F` 直接跳过去
- 主机可归入可折叠分组：分组输入框聚焦时列出所有已有分组、边打字边过滤、名称不区分大小写、输入新名字保存即建组；主机右键菜单里把鼠标停在「移动到分组」上就会展开分组列表，不用点
- 主机表单上有「保存」按钮，不连接也能先把信息存下来
- 右键已保存主机可连接、复制条目、编辑、移动分组、删除；副本紧跟在原条目下方并带 `(1)`、`(2)` 后缀，编辑已有主机是原地更新而不是新增一条
- 多标签会话：在主机和本地 shell 之间来回切换，各自的回滚内容都不丢
- 分屏合并的是*已经连好*的会话：`⌘D` 向右分屏、`⇧⌘D` 向下分屏（标签右键菜单里也有），把另一个在线会话嵌进当前标签，而不是对同一台主机再发一次连接；当有多个候选会话时会弹出选择器让你挑
- 把标签或面板头拖到任意面板的四条边上就能自定义布局，落点会有提示；拖动面板不会重连，回滚内容和 SSH 会话都在，标签里最后一个面板关掉后标签自己关闭。分屏面板是圆角卡片，分割线对比明显且可拖动，聚焦面板有一圈带柔光的动画描边，浅色主题下同样看得清
- 装了多个面板的标签就成了一个工作区：标题根据里面的面板自动生成（`Alpha + Bravo`、`Alpha +2`），有角标计数，副标题让位给工作区名；手动重命名后会固定用你的名字，不再跟着面板变
- 拖分割线调整面板大小，双击分割线均分，面板头可以单独关闭某个面板
- 右键标签可复制连接、分屏、重命名、关闭；副本沿用来源会话的名字并加 `(1)`、`(2)` 别名。多面板工作区的菜单只留「重命名工作区」和「关闭标签」，因为里面已经是多个会话，再分屏和复制都不成立
- 标签栏的「断开全部」会在确认后关掉所有会话
- 专注模式：连上会话后侧栏自动收起，让终端占满窗口；顶栏的 Conch 标志按钮可以唤回，最后一个标签关闭时侧栏自动回来
- 连接过程有过渡动画，带取消按钮和 `Esc` 快捷键；取消会同时中断还在等待的 TCP/SSH 握手
- 可选「在应用内保存密码」，重连时不再问密码
- 八套主题——五深色（Conch、Tide、Grove、Nebula、Graphite）和三浅色（Dawn、Paper、Mist）——界面和终端调色板一起换；在设置（`⌘,`）里全局指定，或用可视化选择器按主机覆盖，预览所见即所得，该会话激活期间由它接管整个窗口
- 全局终端字体：在 设置 → 终端 里选 SF Mono、JetBrains Mono、Menlo、Monaco 或系统等宽，字号 10–20px；所有已打开的面板（含分屏）立即跟随，重排时保留回滚内容
- 全局光标设置：块状、竖线、下划线，闪烁可开关，设置里有实时预览
- 广播输入：标签栏的 Broadcast 按钮把当前聚焦面板的按键镜像到所有在线会话；在线会话不足两个或你点了「断开全部」时它会自动关闭，没有可广播对象时按钮置灰并说明原因
- 标签栏那颗醒目的 SFTP 药丸按钮打开文件管理器：它是*当前标签内的子视图*——顶部主机标签一直在，终端在底下继续跑，按 `Esc` 或「终端」按钮立刻回到命令行，每个标签都记得自己刚才在看哪个目录。左右两栏，左边是本地文件系统（可以用一个跟随应用自身样式的动画来源选择器切到任意其他在线会话），右边是这台已连接的主机，两边都能直接编辑路径栏。选中文件/文件夹后用中间导轨按钮、双击或拖拽传输；文件夹递归传输，两个方向都支持，远端来源还能直接送到另一台主机。目标已存在同名文件时，确认框会列出冲突项并提供「覆盖」（替换该文件）或「跳过」（完全不动它）；文件夹和被跳过的名字则按 Finder 习惯加 `(1)`、`(2)` 后缀，而把文件复制到自己身上会被拒绝，而不是清空原文件。右键某一行可做文件操作：行内重命名、Linux 主机上的权限修改（八进制输入框 + 实时 `-rwxr-xr-x` 预览 + 属主/属组/其他三列勾选）、删除——本地项目确认后移入 macOS 废纸篓，远端项目是彻底删除，确认框会明说。传输中的浮层卡片显示实时百分比、已传/总字节、当前文件、取消按钮，以及成功/失败/取消的明确结论；完成的传输会自己消失。这一切都跟随当前主题，浅色主题也不例外
- 跟随窗口大小的可调整 PTY

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `⌘D` / `⇧⌘D` | 把当前面板向右 / 向下分屏，嵌入另一个在线会话 |
| `⌘F` | 跳到主机搜索框 |
| `⌘,` | 打开设置（主题、终端字体、光标） |
| `Esc` | 取消正在进行的连接；从 SFTP 子视图回到终端 |
| 文件列表里 `单击` / `⌘单击` / `⇧单击` | 选中 / 加减选 / 范围选择某一栏里的行 |

其余操作都在标签栏、标签和文件行的右键菜单以及侧栏里；双击已保存主机即可连接。

## 环境要求

- macOS 12 或更新
- Go 1.26+
- Node.js 20.19+
- Wails v3 CLI
- Xcode Command Line Tools

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
# 确认 ~/go/bin 在 PATH 里
```

## 开发

```bash
wails3 dev       # Go 与前端热重载（http://localhost:9245）
wails3 build     # 生产构建，产物在 bin/
wails3 package   # 生成 bin/conch.app（ad-hoc 签名）
```

`wails3 package` 会先编译再打包并做 ad-hoc 签名；想要带背景图的 `.dmg`，用
`darwin:package:dmg` 这个 task。

改动 Go 服务方法或注册事件之后，重新生成 TypeScript 桥接层（生成结果已入库，
所以刚 clone 下来不跑这步也能构建）：

```bash
wails3 generate bindings -ts -i
```

前端也可以单独构建：

```bash
cd frontend
npm install
npm run build      # tsc + vite build
```

## 目录结构

```
main.go             Wails 应用初始化、窗口选项、事件注册
sshservice.go       SSH 与本地 PTY 会话、认证、known_hosts 处理
sftpservice.go      双栏目录、传输、重命名/删除/权限与进度事件
fileservice.go      原生密钥文件选择器
frontend/src/App.tsx      会话、标签与工作区状态；快捷键
frontend/src/components   界面：侧栏、标签栏、分屏、终端、SFTP 视图、各类弹窗
frontend/src/lib          主题、设置、主机存储、分屏树、传输辅助
frontend/bindings         由 Go 服务与事件生成的 TypeScript 绑定
build/              Wails 构建资源——build/darwin 是 macOS 打包，build/windows 是 NSIS/MSIX 脚手架
```

## 终端数据是怎么流动的

SSH 连接和远端 PTY 都由 Go 持有。远端输出会做合并（约每 8ms 一批），以 base64
负载的 `ssh:output` 事件发出，终端解码后按原始字节写入。按键和窗口尺寸变化再通过
绑定的 `SSHService` 方法回传。这样大批量输出不必逐次走桥接读取路径，同时保证二进制
安全。

## 安全说明

- 私钥口令只存在内存里。只有勾选「保存密码」时，密码才会写进应用的本地存储，
  以便重连时跳过提示。这个值在 WebView 的 localStorage 里是明文——请只在可信的
  机器上用它。取消勾选后重连，就会把它从已保存主机上移除。
- 遇到未知主机密钥会弹指纹确认框。点「信任」会把密钥追加到 `~/.ssh/known_hosts`
  （权限 0600）；取消则中止连接。
- 已保存的主机（标签、地址、端口、用户名、认证方式、密钥路径、分组、主题、可选密码）
  存在 WebView 的 localStorage 里，私钥口令不会。会话数量上限 20。

## 后续计划

- 端口转发（本地、远端、SOCKS）
- 从 `~/.ssh/config` 导入主机，并读取其中的 `IdentityFile`/`User` 默认值
- 可配置的滚动缓冲区大小，以及按主机的终端设置覆盖
- 签名 + 公证的发布构建，提供可下载的 DMG
- 重启应用后恢复上次打开的标签
- Windows 版本——`build/windows` 保留了 NSIS/MSIX 脚手架，但本地 shell 还需要一套
  ConPTY 实现（`creack/pty` 只支持 Unix），目前那边一次都没跑过

## 贡献

欢迎提 Issue 和 PR——尤其是那些我还没遇到的 macOS 行为问题。提交前请先跑一遍项目
一直保持通过的检查：

```bash
cd frontend && npx tsc --noEmit && npm run build
cd .. && go vet ./... && go build -o bin/conch .
```

代码结构刻意保持扁平：后端只有四个 Go 文件，界面都在 `frontend/src/components`。
动手前值得知道的两条约定——主题色只能来自 `frontend/src/lib/themes.ts`（组件里不要
硬编码色值，另外浅色主题会把 `--overlay-rgb` 翻成墨色，所以任何新界面都要补一段
`:root[data-scheme="light"]` 样式）；SFTP 视图里的文件操作统一走 `sftpservice.go`
的 endpoint 抽象，不要在处理函数里直接碰 `os` 或 `sftp`。

## 许可证

MIT — 见 [LICENSE](./LICENSE)。
