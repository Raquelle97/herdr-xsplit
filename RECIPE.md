# xsplit

A Herdr mod: from the space you are in, open a new shell on another machine in
one floating window. Closing the window closes that shell.

## What you see

**The picker**, a card the size of the pane it is put in: radius 10, 1 px border
in the theme's `border`, background `background`, text `foreground` at 12.5 px.

- Header, 32 px. `Other machine` in semibold, then in 11 px `dim` either
  `open a shell` or `opening <machine>…` while a shell is being started.
- After a finished attempt, an 11 px `accent` line: `opened <machine>` or
  `couldn't open <machine>`.
- One row per other connected machine, 32 px, the machine's name (this computer
  first, then by name). The row being started also says `opening…` in `dim`.
  Hover uses `hover`. With no other machine: `No other machine is connected.`

**The strip**, for a layout: `⇄` in `accent`, `Other machine`, `›` in `dim`.
Clicking it runs `tab.new { mod: "xsplit" }`.

**The window**, about 760×480 the first time, then whatever size it was last
dragged to. Chrome background on the bars.

- Title, 32 px: machine name in `muted`; `×` on the right.
- The shell, the rest of the window.
- Right edge, 28 px, `↔`, `ew-resize`. Dragging it changes the width.
- Bottom edge, 28 px, `↕`, `ns-resize`. Dragging it changes the height.
- Corner, 28 px, `◢`, `nwse-resize`. Dragging it changes both. Past a few
  pixels a dim full-window layer (`xsplit.veil`) follows the pointer and shows
  `760 × 480` plus `release to resize`.

## How it behaves

- **Which machines.** `machines()` with `layout === "ready"`, except the machine
  of `focused().space` (`spaces()`, `machine` null on this computer). A 3 s
  timer redraws the picker when that list changes.
- **Starting a shell.** Clicking a row calls
  `space.new { machine, name: "temp", focus: false }`. `machine` is `""` for
  this computer. `focus: false` keeps the space on screen. The ids of `spaces()`
  are snapshotted first; the new space is the one that wasn't there. Its pane's
  `terminal` (matched by tab id) is what the window draws. A remote space can
  arrive late, so a 200 ms timer looks for up to 5 s. No pane in that time:
  `couldn't open …`, and the leftover space is closed. Another click does
  nothing until this attempt finishes.
- **One window.** `openOverlay({ kind: "window", key: "xsplit", width, height, layout })`.
  The same key again replaces it. No `keep`. Opening another machine closes the
  previous `temp` space first.
- **Closing.** `×` closes `props().overlay` (else the remembered overlay id) and
  `space.close { id, confirmed: true }` on the `temp` space. The bar also checks
  twice a second: once that space has tabs but no terminal, it closes the space
  and the window. A space that disappears on its own just clears the remembered id.
- **Resizing.** The press on an edge calls `stop_propagation` and remembers the
  pointer, the edge and the current size (`xsplit.drag`). The right edge changes
  width, the bottom edge changes height, the corner changes both. Minimum
  360×240. Once the pointer has moved, a full-window layer tracks it, because a
  move is only delivered while the pointer is over the element that has it — a
  28 px strip loses the gesture the moment you drag outward. Mouse up reopens
  the shell window once; the terminal is not recreated on every move. The
  address rides in the drag record, so the `temp` space is not created again.
  There is no `on_size_change`: on a grip it swallows `on_mouse_up`.

## Built from

`mods/xsplit/` — `main.js`, `mod.json` (`{ "place": "none" }`), and this repo's
`keys.json` (`alt-x` → `tab.new` of the mod).

- `herdr`: `spaces`, `panes`, `machines`, `focused`, `theme`, `openOverlay`,
  `closeOverlay`, `props`, `shared`, `setShared`, `run`.
- `gpui-kit`: `View`, `div`. `gpui-base`: `v_flex`, `h_flex`.

## Watch out

- **The window can only draw a terminal that has a pane.** `space.new` is what
  provides one. A bare `hc run --bg` terminal renders as an empty strip.
- **`focus: false` still shows the new space when nothing is on screen.** That
  is Herdr's rule for `space.new`.
- **The bar's root needs `.w_full()`.** Without it the bar is only as wide as
  its text.
- **`key: "xsplit"` replaces, and a replaced window keeps its top-left.** That
  is the right behaviour for a resize. Don't give the resized copy a new key.
- **Close with `props().overlay`, and remember the id as a fallback.**
- **Any press the mod doesn't stop drags the window.** The strips and `×` stop
  the mouse down. A double click on the bar maximizes Herdr.
- **Don't attach `on_size_change` on a strip.** The mouse up never arrives.
- **Clicking the shell can show the `temp` space** in the main view. Opening it
  does not.
- **A layout switch closes the window** and the bar's watch goes with it, so
  `temp` can outlive the window. The next open closes it before starting another.
- **Windows IMEs eat `ctrl-shift-m`.** `alt-x` is the binding that arrives.

## Done when

1. `herdr-app check mods/xsplit` prints `check passed`.
2. With another machine connected, `alt-x` (or the strip) opens a picker that
   lists that machine and not the machine of the current space.
3. Clicking it leaves the current space on screen and opens a window with a new
   shell. A space named `temp` is visible in Spaces while the window is open.
4. Dragging the bottom edge changes the height, dragging the right edge changes
   the width, and the corner changes both. The window stays where it was put.
   The size is shown while dragging and applied on release.
5. `×` closes the window and the `temp` space. The shell is gone.
6. Opening a shell on a second machine closes the first `temp` space rather than
   leaving both.
