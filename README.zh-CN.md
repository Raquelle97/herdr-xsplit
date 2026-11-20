# xsplit

[English](README.md) | 简体中文

在当前 space 里，给另一台机器新开一个 shell，放进一个浮动窗口。关掉窗口，这个 shell 也关掉。

Herdr 的 space 归一台机器。这个 mod 在另一台机器上建一个名为 `temp` 的 space（`focus: false`，所以你正在看的 space 不会被切走），再把它的终端画进窗口。没有 pane 的终端画不出来。

## 安装

```sh
cd ~/.config/herdr-app
git clone https://github.com/Raquelle97/herdr-xsplit /tmp/xsplit
cp -r /tmp/xsplit/mods/xsplit mods/xsplit
herdr-app check mods/xsplit
```

Windows PowerShell：

```powershell
cd $HOME\.config\herdr-app
git clone https://github.com/Raquelle97/herdr-xsplit $env:TEMP\xsplit
Copy-Item -Recurse -Force "$env:TEMP\xsplit\mods\xsplit" mods\xsplit
herdr-app check mods\xsplit
```

装完不会自己冒出来：它不是常驻面板，需要下面三个入口之一。

## 打开

**布局里的一条**。把这块加到 `layouts/<name>.json` 的某个 column 里（保存即重载，或用 `alt`+`l` 切一次布局）：

```json
{ "id": "xsplit-launch", "type": "block",
  "content": { "mod": "xsplit", "props": { "launcher": true } }, "size": { "px": 30 } }
```

**一个键**。合并进你的 `keys.json` —— 已经有 `global` 节的话是往里加这一行，不要整节替换：

```json
{ "global": { "alt-x": { "command": "tab.new", "args": { "mod": "xsplit" } } } }
```

**一条命令**。开一个只有选择器的 tab：

```sh
herdr-app do tab.new --mod xsplit
```

## 选择器

标题是 `Other machine`。下面是已经连上、并且不是当前 space 那台机器的机器。本机在前，其余按名字排。还在加载或离线的不列出。点一行就在那边启动 shell。列表每 3 秒对一次。

连接时标题显示 `opening …`。大约 5 秒内还没有 pane，就显示 `couldn't open …`，已经冒出来的 space 会被关掉。这一次没结束之前，再点不会另开一个。

## 窗口

一个 shell。第一次大约 760×480，之后沿用上次的大小：

- 顶上 32 px：机器名。`×` 关掉窗口和 `temp` space。标题条的其余部分用来拖动窗口。
- 中间：shell。
- 右边：左右拖改宽度。
- 底下：上下拖改高度。
- 右下角：同时改宽和高。拖的时候整窗会蒙一层，中间显示将要变成的尺寸，松手才真正改大小。窗口留在你放下的位置。

再开另一台机器会换掉这个窗口，而不是叠一个。重启后不会自己回来。

## 限制

- 它是 Herdr 里面的窗口，不是操作系统窗口，也不是 tab。没有 `pane.split` / `pane.close` / `pane.zoom`，也不会跟 tab 一起保存。
- 这种窗口没有缩放柄。松手时用同一扇窗口按新的宽高再开一次，左上角留在你放下的位置。最小 360×240。
- 窗口开着时，Spaces 列表里能看到 `temp`，因为窗口画的就是这个 pane。关窗，或者 shell 自己退出，这个 space 会关掉。
- 切换布局会关掉窗口。`temp` space 可能还在：再从选择器开一个 shell 会先关掉上一个，也可以自己关掉 `temp`。
- 点窗口里的 shell 可能把它聚焦，主视图切到 `temp` space。开窗本身不会：`focus: false` 留在原来的 space。
- 标题条是拖动柄：双击它会把整个 Herdr 窗口最大化。
- Windows 上 `ctrl-shift-m` 会被输入法先吃掉，所以默认给的是 `alt-x`。

## 许可

Apache-2.0。
