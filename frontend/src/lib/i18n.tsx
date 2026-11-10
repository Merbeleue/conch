import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

/**
 * The app's UI language. English text is the message key: `t("Settings")` reads
 * the Chinese row from the dictionary below and returns the key itself for
 * English. That keeps the call sites readable and makes a missing translation a
 * compile error instead of a silent English string in a Chinese screen.
 *
 * A key may carry a context prefix (`"chmod|Group"`): English renders the part
 * after the bar, while the dictionary can give the same English word two
 * different translations in different places.
 */
export type Language = "zh-CN" | "en";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "zh-CN", label: "简体中文" },
  { id: "en", label: "English" },
];

export type MessageParams = Record<string, string | number>;

const zh = {
  // — Settings: chrome and sections ————————————————————————————————
  "Preferences": "偏好设置",
  "Settings": "设置",
  "Close settings": "关闭设置",
  "Settings sections": "设置分区",
  "General": "通用",
  "Appearance": "外观",
  "Terminal": "终端",
  "Highlighting": "高亮",
  "About": "关于",
  "Language": "语言",
  "Interface language": "界面语言",
  "Applies to the whole app immediately": "立即应用到整个应用",
  "Changes apply instantly.": "修改会立即生效。",
  "Done": "完成",

  // — Settings: appearance ————————————————————————————————————————
  "Choose the look for the whole workspace. A host can keep its own theme in its connection details, and it takes over while that session is active.":
    "选择整个工作区的外观。每台主机可以在连接信息中保留自己的主题，该会话激活时会自动切换。",
  "Global theme": "全局主题",

  // — Settings: terminal ——————————————————————————————————————————
  "Typography and cursor for every open pane, including split workspaces and local shells. Changes apply the moment you make them.":
    "所有已打开面板（包括分屏工作区和本地 Shell）的字体与光标设置，修改后立即生效。",
  "Font family": "字体",
  "Only families installed on this machine are listed": "仅列出本机已安装的字体",
  "Terminal font family": "终端字体",
  "Terminal font": "终端字体",
  "Font size": "字号",
  "{min}–{max} px across the workspace": "整个工作区 {min}–{max} px",
  "Decrease font size": "减小字号",
  "Increase font size": "增大字号",
  "Emulation": "终端模拟",
  "Terminal type": "终端类型",
  "Announced as $TERM when a session opens": "会话打开时作为 $TERM 声明",
  "Terminal emulation type": "终端模拟类型",
  "The host looks this name up in its own terminfo to decide how much it may draw — step down when a server answers colour or cursor codes with stray characters. Old switches and routers usually know vt100 and nothing newer, and a simpler type cannot add colour a host does not offer. Sessions already open keep the type they were given.":
    "主机会在自身的 terminfo 中查找该名称，以决定可以绘制多少内容。如果服务器把颜色或光标控制码显示成乱码，就降低一档。老式交换机和路由器通常只认识 vt100，更简单的类型也无法提供主机本身不支持的颜色。已打开的会话会保留它们最初获得的类型。",
  "Cursor": "光标",
  "Cursor style": "光标样式",
  "Bar": "竖线",
  "Block": "方块",
  "Underline": "下划线",
  "Blinking cursor": "光标闪烁",
  "Pulse the caret while the terminal sits idle": "终端空闲时光标持续闪烁",
  "Mouse": "鼠标",
  "Right-click to paste": "右键粘贴",
  "Selecting text copies it, right-click pastes it": "选中文本即复制，右键即可粘贴",

  // — Settings: terminal types ————————————————————————————————————
  "256 colours, modern default": "256 色，现代默认",
  "16 colours, classic": "16 色，经典",
  "8 colours, console keys": "8 色，控制台按键",
  "Colour, no layout control": "彩色，无布局控制",
  "No colour, cursor control": "无彩色，支持光标控制",
  "Oldest — routers and switches": "最古老 — 路由器和交换机",

  // — Settings: highlighting ——————————————————————————————————————
  "Colour the words worth scanning for in every terminal — SSH sessions, splits and local shells alike. Anything that draws its own screen, like vim or htop, is left exactly as it is.":
    "为所有终端（SSH 会话、分屏和本地 Shell）中值得留意的关键词着色。像 vim 或 htop 这类自行绘制全屏的程序保持原样。",
  "Keyword highlighting": "关键词高亮",
  "New output is coloured as it arrives": "新输出到达时即着色",
  "Error": "错误",
  "Failures, faults and denials": "失败、故障与拒绝",
  "Warning": "警告",
  "Risks and deprecated usage": "风险与弃用提示",
  "OK": "正常",
  "Success, readiness and completion": "成功、就绪与完成",
  "Info": "信息",
  "Status words that are neither good nor bad": "中性的状态词",
  "Debug": "调试",
  "Diagnostic chatter": "诊断信息",
  "IP address & MAC": "IP 地址与 MAC",
  "v4, v6 and link addresses": "v4、v6 与链路地址",
  "{rule} colour": "{rule}颜色",
  "Restore default colours": "恢复默认颜色",
  "Reset": "重置",
  "{label}, currently {value}": "{label}，当前为 {value}",
  "{head} presets": "{head}预设",
  "{head} colour, six digit hex": "{head}颜色，六位十六进制",
  "example.com or 192.168.1.10": "example.com 或 192.168.1.10",
  "Colours reach the text as it arrives, so a change applies to new output rather than to the scrollback already drawn.":
    "颜色在文本到达时写入，因此修改只影响新输出，不会重绘已有的历史记录。",

  // — Settings: about —————————————————————————————————————————————
  "Version 0.3.0": "版本 0.3.0",
  "A native SSH and local terminal for macOS and Windows.":
    "面向 macOS 和 Windows 的原生 SSH 与本地终端。",
  "Search saved hosts": "搜索已保存主机",
  "Open settings": "打开设置",

  // — Theme names and taglines ——————————————————————————————————————
  "Warm amber on deep sea navy": "深海藏青上的暖琥珀",
  "Cool cyan drawn from open water": "取自开阔水面的清冷青色",
  "Soft mint on deep forest shade": "深林暗影上的柔和薄荷",
  "Violet dusk with a lilac glow": "暮色紫罗兰，点缀丁香微光",
  "Quiet silver for low-light focus": "适合低光专注的静谧银灰",
  "Warm daylight with terracotta ink": "赤陶墨色映衬暖日光",
  "Quiet paper white with graphite ink": "石墨墨迹映衬静谧纸白",
  "Cool morning haze with slate blue": "清冷晨雾与石板蓝",
  "Host theme": "主机主题",
  "Follow global · {name}": "跟随全局 · {name}",
  "Uses the workspace theme": "使用工作区主题",
  "Choose host theme": "选择主机主题",
  "Global · {name}": "全局 · {name}",
  "Host theme options": "主机主题选项",
  "Follow global": "跟随全局",
  "Dark": "深色",
  "Daylight": "浅色",

  // — Sidebar ————————————————————————————————————————————————————
  "SSH workspace": "SSH 工作区",
  "New connection": "新建连接",
  "Open a local shell": "打开本地 Shell",
  "Connections": "连接",
  "Search name or IP": "搜索名称或 IP",
  "Clear search": "清除搜索",
  "No saved hosts yet": "还没有已保存的主机",
  "Every host you connect to is remembered here for one-click access.":
    "连接过的主机都会记录在这里，一键即可访问。",
  "No matches for “{query}”": "没有匹配“{query}”的主机",
  "Try a different host name or IP address.": "试试其他主机名或 IP 地址。",
  "Ungrouped": "未分组",
  "Settings ({key},)": "设置（{key}，）",
  "{name} (connected) — click to open, double-click to connect, right-click for more":
    "{name}（已连接）— 单击打开，双击连接，右键查看更多",
  "{name} — click to open, double-click to connect, right-click for more":
    "{name} — 单击打开，双击连接，右键查看更多",
  "default": "默认",
  "Connect": "连接",
  "Duplicate host": "复制主机",
  "Edit details": "编辑信息",
  "Move to group": "移动到分组",
  "Delete host": "删除主机",
  "New group…": "新建分组…",
  "New group": "新建分组",
  "Group name": "分组名称",
  "Cancel": "取消",
  "Move": "移动",

  // — Connect form —————————————————————————————————————————————————
  "Password": "密码",
  "Sign in with the account password.": "使用账户密码登录。",
  "Private key": "私钥",
  "Sign in with an SSH key on this Mac.": "使用本机的 SSH 密钥登录。",
  "Saved host": "已保存主机",
  "New session": "新会话",
  "Edit host info": "编辑主机信息",
  "Connect to a host": "连接到主机",
  "Save your changes without connecting, or connect with the updated details.":
    "可以只保存修改而不连接，也可以使用更新后的信息直接连接。",
  "SSH over TCP with a private key or password.": "通过 TCP 使用私钥或密码进行 SSH 连接。",
  "Label": "名称",
  "optional": "可选",
  "Production, db-01…": "生产环境、db-01…",
  "Group": "分组",
  "Host": "主机",
  "Port": "端口",
  "Username": "用户名",
  "Defaults to your {os} user": "默认使用你的 {os} 用户",
  "Theme": "主题",
  "host override": "主机覆盖",
  "Authentication": "认证方式",
  "Authentication method": "认证方式",
  "Key file": "密钥文件",
  "Private key path": "私钥路径",
  "Choosing…": "选择中…",
  "Choose file": "选择文件",
  "Passphrase": "密钥口令",
  "Only if the key is encrypted": "仅在密钥已加密时填写",
  "Save passphrase": "保存密钥口令",
  "Needed for an encrypted key to connect from the sidebar":
    "加密密钥需要保存口令才能从侧栏直接连接",
  "Required for password auth": "密码认证时必填",
  "Save password": "保存密码",
  "Stored in Conch and used automatically next time": "保存在 Conch 中，下次自动使用",
  "Save changes": "保存修改",
  "Save": "保存",
  "Connecting": "正在连接",
  "No group": "无分组",
  "e.g. Production": "例如：生产环境",
  "Groups": "分组",
  "New group {name} will be created on save.": "保存时会新建分组 {name}。",

  // — Connection overlay ———————————————————————————————————————————
  "Local shell": "本地 Shell",
  "Your login shell on this Mac": "本机的登录 Shell",
  "Session ready": "会话已就绪",
  "Starting shell": "正在启动 Shell",
  "Opening terminal": "正在打开终端",
  "Spawning your login shell": "正在启动登录 Shell",
  "Negotiating a secure channel": "正在协商安全通道",
  "Cancel connection": "取消连接",

  // — Trust dialog —————————————————————————————————————————————————
  "Unverified host": "未验证的主机",
  "Trust this host key?": "信任此主机密钥？",
  "The authenticity of {address} can't be established yet. Verify this fingerprint on the server before trusting it.":
    "尚无法确认 {address} 的真实性。信任之前，请先在服务器上核对该指纹。",
  "Trusting saves the key to": "信任后会将密钥保存到",
  ", so later connections are verified automatically.": "，之后的连接将自动验证。",
  "Trust & connect": "信任并连接",

  // — Split picker —————————————————————————————————————————————————
  "Choose a session to split right": "选择要向右分屏的会话",
  "Choose a session to split down": "选择要向下分屏的会话",
  "Split right with": "向右分屏，选择会话",
  "Split down with": "向下分屏，选择会话",
  "The session moves into this tab; its connection stays open.":
    "该会话会移入当前标签页，连接保持打开。",

  // — Tab bar ——————————————————————————————————————————————————————
  "Show saved hosts": "显示已保存主机",
  "Hide saved hosts": "隐藏已保存主机",
  "Show sidebar": "显示侧栏",
  "Hide sidebar": "隐藏侧栏",
  "Hosts": "主机",
  "Open sessions": "打开的会话",
  "{label} — {count} panes. Drag onto a pane to rearrange":
    "{label} — {count} 个面板。拖到其他面板可重新排列",
  " — connection ended": " — 连接已结束",
  " — drag onto a pane to split": " — 拖到面板上可分屏",
  "Workspace name": "工作区名称",
  "Tab name": "标签名称",
  "{count} panes": "{count} 个面板",
  "Close {label}": "关闭 {label}",
  "Close tab": "关闭标签页",
  "The SFTP manager needs a live SSH session": "SFTP 管理器需要活动的 SSH 会话",
  "Connect to a server to browse files": "连接服务器后才能浏览文件",
  "Hide the SFTP manager and show this tab's terminal":
    "隐藏 SFTP 管理器，显示此标签页的终端",
  "Open the SFTP file manager for {target}": "打开 {target} 的 SFTP 文件管理器",
  "Keystrokes are going to every open session": "按键正在发送到所有打开的会话",
  "Send keystrokes to every open session": "将按键发送到所有打开的会话",
  "Connect at least two sessions to broadcast input": "至少连接两个会话后才能广播输入",
  "Broadcasting": "广播中",
  "Broadcast": "广播",
  "Clear this terminal": "清空此终端",
  "Clear": "清空",
  "Disconnect all sessions": "断开所有会话",
  "Disconnect all": "全部断开",
  "Split right": "向右分屏",
  "Split down": "向下分屏",
  "Duplicate connection": "复制连接",
  "Rename workspace": "重命名工作区",
  "Rename tab": "重命名标签页",

  // — Split workspace ——————————————————————————————————————————————
  "Drag this header to move the pane into another split":
    "拖动此标题栏可将面板移到其他分屏",
  "Close pane": "关闭面板",
  "Close pane {label}": "关闭面板 {label}",
  "Drag to resize · double-click to even up": "拖动调整大小 · 双击均分",
  "{user}@local": "{user}@本机",

  // — Terminal exit overlay ————————————————————————————————————————
  "Session ended": "会话已结束",
  "Disconnected": "连接已断开",
  "Local shell ended": "本地 Shell 已结束",
  "Connection closed": "连接已关闭",
  "Reconnect": "重新连接",
  "Close": "关闭",

  // — App notices and dialogs ——————————————————————————————————————
  "Connection cancelled.": "连接已取消。",
  "Saved {name}.": "已保存 {name}。",
  "Connect at least two sessions to broadcast input.": "至少连接两个会话后才能广播输入。",
  "Broadcasting keystrokes to {count} sessions.": "正在向 {count} 个会话广播按键。",
  "Broadcast off — input goes to the focused pane.": "广播已关闭 — 输入只发送到当前面板。",
  "Moved {name} to {group}.": "已将 {name} 移动到 {group}。",
  "Removed {name} from its group.": "已将 {name} 移出分组。",
  "The SSH service returned no session.": "SSH 服务未返回会话。",
  "The terminal service returned no session.": "终端服务未返回会话。",
  "Nothing to split with yet — connect another host, then split to pull it into this tab.":
    "暂无可用于分屏的会话 — 请再连接一台主机，然后分屏将其拉入此标签页。",
  "Created {name}.": "已创建 {name}。",
  "Removed {name} from saved hosts.": "已从已保存主机中移除 {name}。",
  "Enter the password for {name} to connect.": "请输入 {name} 的密码以连接。",
  "Connect to a server before opening SFTP.": "请先连接服务器再打开 SFTP。",
  "SFTP is only available for SSH sessions.": "SFTP 仅适用于 SSH 会话。",
  "Reconnect this session before opening SFTP.": "请先重新连接此会话再打开 SFTP。",
  "Closed the open session.": "已关闭当前会话。",
  "Closed all {count} sessions.": "已关闭全部 {count} 个会话。",
  "Host key was not trusted, so the connection was cancelled.":
    "未信任主机密钥，连接已取消。",
  "Close all sessions": "关闭所有会话",
  "Disconnect all sessions?": "断开所有会话？",
  "This ends the open session and closes its tab. Scrollback will be lost.":
    "这会结束当前会话并关闭其标签页，终端历史记录将丢失。",
  "This ends all {count} open sessions and closes every tab. Scrollback will be lost.":
    "这会结束全部 {count} 个打开的会话并关闭所有标签页，终端历史记录将丢失。",
  "Connection failed. Check the host and your credentials.":
    "连接失败，请检查主机和登录凭据。",

  // — Platform labels ——————————————————————————————————————————————
  "This Mac": "这台 Mac",
  "This PC": "此电脑",
  "Trash": "废纸篓",
  "Recycle Bin": "回收站",
  "Finder": "访达",
  "File Explorer": "文件资源管理器",

  // — SFTP —————————————————————————————————————————————————————————
  "Something went wrong.": "出了点问题。",
  "The folder could not be read.": "无法读取该文件夹。",
  "The source connection ended. Showing {label}.": "源连接已结束，正在显示 {label}。",
  "A transfer is already in progress.": "已有传输正在进行。",
  "This SSH connection has ended.": "此 SSH 连接已结束。",
  "Open a folder on both sides before copying.": "请先在两侧打开文件夹再复制。",
  "The transfer did not start.": "传输未能开始。",
  "Some items could not be copied.": "部分项目无法复制。",
  "All selected files already exist, so nothing was copied.":
    "所选文件均已存在，因此没有复制任何内容。",
  "A name cannot contain / or \\": "名称不能包含 / 或 \\",
  "“{name}” is not a valid Windows name": "“{name}”不是有效的 Windows 名称",
  "Renamed to “{name}”.": "已重命名为“{name}”。",
  "Permissions set on “{name}”.": "已设置“{name}”的权限。",
  "Permissions set on {count} items.": "已设置 {count} 项的权限。",
  "“{name}” moved to the {trash}.": "“{name}”已移到{trash}。",
  "{count} items moved to the {trash}.": "{count} 项已移到{trash}。",
  "“{name}” deleted.": "已删除“{name}”。",
  "{count} items deleted.": "已删除 {count} 项。",
  "Connection ended": "连接已结束",
  "Local filesystem": "本地文件系统",
  "Change permissions of the selected items": "更改所选项目的权限",
  "Change permissions": "更改权限",
  "Rename": "重命名",
  "Rename the selected item": "重命名所选项目",
  "Move the selected items to the {trash}": "将所选项目移到{trash}",
  "Delete the selected items": "删除所选项目",
  "Delete selected items": "删除所选项目",
  "Parent folder": "上级文件夹",
  "Home folder": "主目录",
  "Refresh": "刷新",
  "Refresh folder": "刷新文件夹",
  "Type a local path and press Enter": "输入本地路径后按 Enter",
  "Type a remote path and press Enter": "输入远程路径后按 Enter",
  "Folder path": "文件夹路径",
  "Open this path": "打开此路径",
  "Go": "前往",
  "This SSH session has ended. Press Esc to go back to the terminal and reconnect.":
    "此 SSH 会话已结束。按 Esc 返回终端并重新连接。",
  "Name": "名称",
  "Size": "大小",
  "Modified": "修改时间",
  "{label} files": "{label} 文件",
  "{name} · right-click for rename, permissions and delete":
    "{name} · 右键可重命名、更改权限或删除",
  "New name": "新名称",
  "link": "链接",
  "Loading…": "加载中…",
  "This folder is empty": "此文件夹为空",
  "Copy {count} item here": "将 {count} 项复制到这里",
  "Copy {count} items here": "将 {count} 项复制到这里",
  "{count} selected · {size}": "已选 {count} 项 · {size}",
  "{count} item": "{count} 项",
  "{count} items": "{count} 项",
  "Right-click a file for more": "右键点击文件查看更多操作",
  "Double-click to open": "双击打开",
  "Two-way transfer · right-click a file to rename, change permissions or delete":
    "双向传输 · 右键点击文件可重命名、更改权限或删除",
  "Copy {count} to {label}": "将 {count} 项复制到 {label}",
  "Select files on the left to copy them right": "在左侧选择文件以复制到右侧",
  "Select files on the right to copy them left": "在右侧选择文件以复制到左侧",
  "Copy selected items to the right": "将所选项目复制到右侧",
  "Copy selected items to the left": "将所选项目复制到左侧",
  "Delete on remote host": "在远程主机上删除",
  "Move to {trash}": "移到{trash}",
  "Move “{name}” to {trash}?": "将“{name}”移到{trash}？",
  "Move {count} items to {trash}?": "将 {count} 项移到{trash}？",
  "Delete “{name}”?": "删除“{name}”？",
  "Delete {count} items?": "删除 {count} 项？",
  "Local items move to the {trash}, so you can bring them back from {manager}.":
    "本地项目会移到{trash}，可以从{manager}中恢复。",
  "This deletes the items on the remote host. Folders are removed with everything inside them, and there is no Trash on the server.":
    "这会在远程主机上删除项目。文件夹会连同其中所有内容一并删除，服务器上没有回收站。",
  "Delete": "删除",

  // — SFTP row menu ————————————————————————————————————————————————
  "Actions for {label}": "{label} 的操作",
  "Rename one item at a time": "一次只能重命名一项",
  "Rename this item": "重命名此项",
  "Change permissions on the remote host": "更改远程主机上的权限",
  "Permissions…": "权限…",
  "Delete permanently on the remote host": "在远程主机上永久删除",

  // — Transfer panel ———————————————————————————————————————————————
  "File transfer": "文件传输",
  "Dismiss transfer status": "关闭传输状态",
  "Dismiss": "关闭",
  "{percent} percent": "{percent}%",
  "{done} of {total}": "{done} / {total}",
  "Preparing…": "准备中…",
  "Canceling…": "正在取消…",
  "Copying file": "正在复制文件",
  "Copying {items}": "正在复制 {items}",
  "Stopping transfer": "正在停止传输",
  "Transfer complete": "传输完成",
  "Transfer failed": "传输失败",
  "Transfer canceled": "传输已取消",
  "Transfer": "传输",
  "{index} of {count} · {name}": "{index} / {count} · {name}",
  "{items} queued": "已排队 {items}",
  "Stopping after the current chunk…": "当前分块完成后停止…",
  "{copied} of {items} copied to {target}": "已复制 {copied} / {items} 到 {target}",
  "{copied} of {items} copied": "已复制 {copied} / {items}",
  "Canceled · {copied} of {items} copied": "已取消 · 已复制 {copied} / {items}",

  // — Source picker ————————————————————————————————————————————————
  "Choose where this pane browses": "选择此面板浏览的位置",
  "Browse files from": "文件来源",
  "Browse from": "浏览来源",

  // — Chmod dialog —————————————————————————————————————————————————
  "Owner": "所有者",
  "the account that owns the file": "拥有该文件的账户",
  "chmod|Group": "用户组",
  "users in the file's group": "文件所属组中的用户",
  "Others": "其他用户",
  "everyone else on the host": "主机上的其他所有人",
  "Read": "读取",
  "Write": "写入",
  "Execute": "执行",
  "“{name}”": "“{name}”",
  "{count} selected items": "已选 {count} 项",
  "Permissions": "权限",
  "Octal permissions": "八进制权限",
  "Applies to all {count} selected items.": "应用于全部 {count} 个所选项目。",
  "Applying…": "应用中…",
  "Apply": "应用",

  // — Overwrite dialog —————————————————————————————————————————————
  "“{name}” already exists": "“{name}”已存在",
  "{count} files already exist": "{count} 个文件已存在",
  "{source} → {target}. Overwrite replaces the existing file; skip leaves it untouched.":
    "{source} → {target}。覆盖会替换现有文件；跳过则保持不变。",
  "{source} → {target}. Overwrite replaces the existing files; skip leaves them untouched.":
    "{source} → {target}。覆盖会替换现有文件；跳过则保持不变。",
  "replaces {size}": "替换 {size}",
  "and {count} more": "以及另外 {count} 项",
  "Skip existing": "跳过已存在的",
  "Overwrite": "覆盖",
} satisfies Record<string, string>;

export type MessageKey = keyof typeof zh;

export interface Translate {
  (key: MessageKey, params?: MessageParams): string;
}

/** Picks the startup language from the system locale. */
export function detectLanguage(): Language {
  const locale =
    typeof navigator === "undefined" ? "" : navigator.language || navigator.languages?.[0] || "";
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** The English half of a key, dropping an optional `context|` prefix. */
function englishFor(key: string): string {
  const bar = key.indexOf("|");
  return bar < 0 ? key : key.slice(bar + 1);
}

export function translate(language: Language, key: string, params?: MessageParams): string {
  const template = language === "zh-CN" ? (zh as Record<string, string>)[key] ?? englishFor(key) : englishFor(key);
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** A translator bound to one language, stable for the caller's lifetime. */
export function makeT(language: Language): Translate {
  return (key, params) => translate(language, key, params);
}

// Module-level helpers (tab meta, formatModified) run outside React. The
// provider keeps this in step with the setting.
let activeLanguage: Language = "zh-CN";

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function activeLanguageCode(): Language {
  return activeLanguage;
}

/** Translation for code that has no hook: uses the last provider language. */
export const tt: Translate = (key, params) => translate(activeLanguage, key, params);

interface I18nValue {
  language: Language;
  t: Translate;
}

const I18nContext = createContext<I18nValue>({
  language: "zh-CN",
  t: (key, params) => translate("zh-CN", key, params),
});

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  setActiveLanguage(language);
  const value = useMemo<I18nValue>(
    () => ({ language, t: makeT(language) }),
    [language],
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Display text for the stable backend exit reason codes. */
export function exitReasonLabel(reason: string, language: Language): string {
  if (reason === "disconnected") {
    return translate(language, "Disconnected");
  }
  if (reason === "closed") {
    return translate(language, "Connection closed");
  }
  if (reason === "exited") {
    return language === "zh-CN" ? "进程已退出" : "Process exited";
  }
  if (reason.startsWith("exit ")) {
    const code = reason.slice(5);
    return language === "zh-CN" ? `退出码 ${code}` : `Exit code ${code}`;
  }
  if (reason.startsWith("signal ")) {
    const signal = reason.slice(7);
    return language === "zh-CN" ? `信号 ${signal}` : `Signal ${signal}`;
  }
  return reason;
}
