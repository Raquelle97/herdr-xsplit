# xsplit

English | [简体中文](README.zh-CN.md)

Opens a new shell on another machine in a floating window, without leaving the
space you are in. Closing the window closes that shell.

Herdr keeps a space on one machine, so the shell has to be started on the other
machine. The mod makes a space named `temp` there (`focus: false`, so the space
you are looking at stays put) and draws its terminal in the window. A terminal
with no pane cannot be drawn.

## Install

```sh
cd ~/.config/herdr-app
git clone https://github.com/Raquelle97/herdr-xsplit /tmp/xsplit
cp -r /tmp/xsplit/mods/xsplit mods/xsplit
herdr-app check mods/xsplit
```

Windows PowerShell:

```powershell
cd $HOME\.config\herdr-app
git clone https://github.com/Raquelle97/herdr-xsplit $env:TEMP\xsplit
Copy-Item -Recurse -Force "$env:TEMP\xsplit\mods\xsplit" mods\xsplit
herdr-app check mods\xsplit
```

Nothing appears on its own: this is not a docked panel, so it needs one of the
three entry points below.

## Open it

**A strip in your layout.** Add this block to a column of `layouts/<name>.json`
and switch the layout back on (`alt`+`l` picks a layout; saving the file reloads it):

```json
{ "id": "xsplit-launch", "type": "block",
  "content": { "mod": "xsplit", "props": { "launcher": true } }, "size": { "px": 30 } }
```

**A key.** Merge this into your `keys.json` — if you already have a `global` section,
add the line to it rather than replacing it:

```json
{ "global": { "alt-x": { "command": "tab.new", "args": { "mod": "xsplit" } } } }
```

**A command.** A tab whose only pane is the picker:

```sh
herdr-app do tab.new --mod xsplit
```

## The picker

A card titled `Other machine`. Under it, the machines that are connected and are
not the machine of the space you are in. This computer is listed first, then the
others by name. Machines that are still loading or offline are left out. Click a
row and a shell starts there. The list re-reads every 3 s.

While it is connecting, the header says `opening …`. If no pane shows up within
about 5 s, the header says `couldn't open …` and any space that did appear is
closed. A second click waits until that attempt finishes.

## The window

One shell, about 760×480 the first time (the next one reuses the last size):

- top, 32 px: the machine's name. `×` closes the window and the `temp` space.
  The rest of the bar drags the window.
- middle: the shell.
- right edge: drag left or right to change the width.
- bottom edge: drag up or down to change the height.
- bottom-right corner: drag to change both. A dim layer follows the pointer and
  shows the size; releasing applies it. The window stays where you put it.

The window is replaced, not stacked, when you open another machine. It is not
kept across a restart.

## Limits

- It is a window inside Herdr, not an operating-system window and not a tab.
  No `pane.split` / `pane.close` / `pane.zoom`, and it is not saved with the tab.
- Herdr's window has no resize handle. Releasing a resize drag reopens this
  window at the new size, so the top-left corner stays where you dropped it.
  Smallest size is 360×240.
- The `temp` space shows in the Spaces list while the window is open, because
  that is the pane the window draws. Closing the window, or exiting the shell,
  closes the space.
- Switching layout closes the window. The `temp` space can still be there
  afterwards; open the picker and start another shell, which closes the previous
  one first, or close `temp` yourself.
- Clicking the shell can focus it and show the `temp` space in the main view.
  Opening it does not: `focus: false` keeps the space you were in.
- The bar is a drag handle: double-clicking it maximizes the Herdr window.
- Windows: an IME swallows `ctrl-shift-m` before the app sees it, which is why
  the shipped key is `alt-x`.

## License

Apache-2.0.
