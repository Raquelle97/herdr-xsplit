// A temporary shell on another machine.
//
// The space you are in belongs to one machine. This mod lists the others and
// opens a new shell there in a floating window. The shell lives in its own
// space so the window has a real pane to draw; closing the window closes that
// space. The window has no resize handle. Drag the right edge for width, the
// bottom edge for height, or the corner for both. The pointer is then tracked
// across the whole Herdr window, and the shell is resized once, on release.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, machines, focused, theme, openOverlay, closeOverlay, props, shared, setShared, run } from "herdr";

const WIN = "xsplit.window";
const SIZE = "xsplit.size";
const SPACE = "xsplit.space";
const DRAG = "xsplit.drag";
const VEIL = "xsplit.veil";

const DEFAULT_W = 760;
const DEFAULT_H = 480;
const MIN_W = 360;
const MIN_H = 240;
const GRIP = 28;
const WAIT_MS = 200;
const WAIT_TICKS = 25;

function labelOf(name) {
  return name == null || name === "" ? "this computer" : String(name);
}

function currentMachine() {
  const id = focused()?.space;
  if (!id) return undefined;
  const space = spaces().find((s) => s.id === id);
  if (!space) return undefined;
  return space.machine ?? null;
}

function otherMachines() {
  const here = currentMachine();
  return machines()
    .filter((m) => m.layout === "ready" && (here === undefined || (m.name ?? null) !== here))
    .sort((a, b) => {
      const an = a.name ?? null;
      const bn = b.name ?? null;
      if (an == null && bn != null) return -1;
      if (an != null && bn == null) return 1;
      return labelOf(an).localeCompare(labelOf(bn));
    });
}

function terminalIn(space) {
  if (!space) return null;
  const tabs = new Set((space.tabs ?? []).map((t) => t.id));
  const pane = panes().find((p) => tabs.has(p.tab) && p.terminal);
  return pane ? pane.terminal : null;
}

function rememberedSize() {
  const size = shared(SIZE);
  const w = Number(size?.w);
  const h = Number(size?.h);
  if (w >= MIN_W && h >= MIN_H) return { w: Math.round(w), h: Math.round(h) };
  return { w: DEFAULT_W, h: DEFAULT_H };
}

// Bottom changes height, right changes width, the corner changes both.
// That is the direction a window edge moves, not the long axis of the strip.
function dragSize(drag, x, y) {
  let w = drag.w;
  let h = drag.h;
  if (drag.edge === "right" || drag.edge === "corner") {
    w = Math.max(MIN_W, Math.round(drag.w + (x - drag.x)));
  }
  if (drag.edge === "bottom" || drag.edge === "corner") {
    h = Math.max(MIN_H, Math.round(drag.h + (y - drag.y)));
  }
  return { w, h };
}

function openVeil() {
  if (shared(VEIL)) return;
  const drag = shared(DRAG);
  // Mark the gesture before the overlay exists, so a mouse-up caused by opening
  // it is not treated as the user letting go.
  if (drag) setShared(DRAG, { ...drag, tracking: Date.now() });
  const id = openOverlay({
    mod: "xsplit",
    kind: "window",
    key: "xsplit.veil",
    width: 1,
    height: 1,
    frame: "none",
    props: { xsplitVeil: true },
  });
  setShared(VEIL, id);
}

function finishDrag(point) {
  const drag = shared(DRAG);
  if (!drag) return;
  const size = point ? dragSize(drag, point.x, point.y) : { w: drag.w, h: drag.h };
  const veil = shared(VEIL);
  setShared(DRAG, null);
  setShared(VEIL, null);
  if (veil) closeOverlay(veil);
  if (!drag.address) return;
  if (size.w === drag.w && size.h === drag.h) return;
  openWindow(drag.address, drag.machine, size.w, size.h);
}

function openWindow(address, machine, w, h) {
  const opened = shared(WIN);
  if (opened) closeOverlay(opened);
  const name = machine ?? "";
  const id = openOverlay({
    kind: "window",
    key: "xsplit",
    width: w,
    height: h,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: 32 }, content: { mod: "xsplit", props: { xsplitBar: { machine: name } } } },
        {
          type: "row",
          children: [
            { type: "block", content: { terminal: address }, size: { weight: 1 }, min: 80 },
            {
              type: "block",
              size: { px: GRIP },
              content: { mod: "xsplit", props: { xsplitGrip: { edge: "right", address, machine: name } } },
            },
          ],
        },
        {
          type: "row",
          size: { px: GRIP },
          children: [
            {
              type: "block",
              size: { weight: 1 },
              content: { mod: "xsplit", props: { xsplitGrip: { edge: "bottom", address, machine: name } } },
            },
            {
              type: "block",
              size: { px: GRIP },
              content: { mod: "xsplit", props: { xsplitGrip: { edge: "corner", address, machine: name } } },
            },
          ],
        },
      ],
    },
  });
  setShared(WIN, id);
  setShared(SIZE, { w: Math.round(w), h: Math.round(h) });
  return id;
}

function closeTempSpace() {
  const id = shared(SPACE);
  if (!id) return;
  setShared(SPACE, null);
  if (spaces().some((s) => s.id === id)) run("space.close", { id, confirmed: true });
}

function dismissWindow() {
  const veil = shared(VEIL);
  if (veil) closeOverlay(veil);
  setShared(VEIL, null);
  setShared(DRAG, null);
  const id = shared(WIN);
  if (id) closeOverlay(id);
  setShared(WIN, null);
  closeTempSpace();
}

export default class XSplit extends View {
  init(_props, cx) {
    if (props()?.launcher) {
      this.mode = "launcher";
      return;
    }
    if (props()?.xsplitVeil) {
      this.mode = "veil";
      this.preview = null;
      this.point = null;
      this.born = Date.now();
      return;
    }
    if (props()?.xsplitGrip) {
      this.mode = "grip";
      this.preview = null;
      return;
    }
    if (props()?.xsplitBar) {
      this.mode = "bar";
      cx.timer.every(500, () => this.reap());
      return;
    }

    this.mode = "picker";
    this.hint = null;
    this.pending = null;
    this.wait = null;
    this.seen = this.machineSig();
    cx.timer.every(3000, (acx) => {
      const sig = this.machineSig();
      if (sig === this.seen) return;
      this.seen = sig;
      acx.notify();
    });
  }

  machineSig() {
    return otherMachines().map((m) => `${m.name ?? ""}:${m.layout}`).join("|");
  }

  // The shell exited: the space still has tabs, but none of them has a terminal.
  // An empty tab list is left alone — it can be a remote space that has not
  // reported its pane yet, and closing it would kill a shell that is still starting.
  reap() {
    const id = shared(SPACE);
    if (!id) return;
    const space = spaces().find((s) => s.id === id);
    if (!space) {
      setShared(SPACE, null);
      return;
    }
    if (!space.tabs?.length || terminalIn(space)) return;
    setShared(SPACE, null);
    run("space.close", { id, confirmed: true });
    const win = shared(WIN);
    if (win) {
      closeOverlay(win);
      setShared(WIN, null);
    }
  }

  openMachine(machine, cx) {
    if (this.pending) return;
    dismissWindow();
    const before = new Set(spaces().map((s) => s.id));
    this.pending = { before, ticks: 0, machine };
    this.hint = `opening ${labelOf(machine)}…`;
    cx.notify();
    run("space.new", { machine: machine ?? "", name: "temp", focus: false });
    if (this.adopt(cx)) return;
    this.wait = cx.timer.every(WAIT_MS, (acx) => {
      if (!this.pending) {
        this.wait?.cancel();
        this.wait = null;
        return;
      }
      this.pending.ticks += 1;
      if (this.adopt(acx)) return;
      if (this.pending.ticks < WAIT_TICKS) return;
      this.wait?.cancel();
      this.wait = null;
      const leftover = spaces().find((s) => !before.has(s.id));
      if (leftover) {
        setShared(SPACE, leftover.id);
        closeTempSpace();
      }
      this.pending = null;
      this.hint = `couldn't open ${labelOf(machine)}`;
      acx.notify();
    });
  }

  adopt(cx) {
    const pending = this.pending;
    if (!pending) return false;
    const created = spaces().find((s) => !pending.before.has(s.id));
    const address = terminalIn(created);
    if (!address) return false;
    this.wait?.cancel();
    this.wait = null;
    this.pending = null;
    setShared(SPACE, created.id);
    const size = rememberedSize();
    openWindow(address, created.machine ?? null, size.w, size.h);
    this.hint = `opened ${labelOf(created.machine)}`;
    cx.notify();
    return true;
  }

  render(cx) {
    const t = theme();
    if (this.mode === "launcher") return this.renderLauncher(t, cx);
    if (this.mode === "veil") return this.renderVeil(t, cx);
    if (this.mode === "grip") return this.renderGrip(t, cx);
    if (this.mode === "bar") return this.renderBar(t, cx);
    return this.renderPicker(t, cx);
  }

  renderLauncher(t, _cx) {
    return h_flex()
      .id("xsplit-launch")
      .size_full()
      .px(12)
      .gap(7)
      .items_center()
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(11.5)
      .text_color(t.muted)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(() => run("tab.new", { mod: "xsplit" }))
      .child(div().flex_none().text_size(13).text_color(t.accent).child("⇄"))
      .child(div().flex_1().truncate().child("Other machine"))
      .child(div().flex_none().text_color(t.dim).child("›"));
  }

  renderBar(t, _cx) {
    const bar = props()?.xsplitBar ?? {};
    return h_flex()
      .id("xsplit-bar")
      .w_full()
      .h_full()
      .px(8)
      .gap(8)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .text_size(11.5)
      .child(div().flex_none().text_color(t.muted).child(labelOf(bar.machine)))
      .child(div().flex_1())
      .child(
        div()
          .id("xsplit-close")
          .flex_none()
          .px(7)
          .py(2)
          .rounded(5)
          .text_size(13)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_mouse_up("left", (_e, cx) => {
            cx.stop_propagation();
            const id = props()?.overlay ?? shared(WIN);
            if (id) closeOverlay(id);
            setShared(WIN, null);
            const veil = shared(VEIL);
            if (veil) closeOverlay(veil);
            setShared(VEIL, null);
            setShared(DRAG, null);
            closeTempSpace();
          })
          .child("×"),
      );
  }

  renderVeil(t, _cx) {
    const drag = shared(DRAG);
    const edge = drag?.edge ?? "corner";
    const shown = this.preview || (drag ? { w: drag.w, h: drag.h } : { w: 0, h: 0 });
    return v_flex()
      .id("xsplit-veil")
      .size_full()
      .items_center()
      .justify_center()
      .gap(4)
      .bg("#00000033")
      .when(edge === "right", (el) => el.cursor_ew_resize())
      .when(edge === "bottom", (el) => el.cursor_ns_resize())
      .when(edge === "corner", (el) => el.cursor_nwse_resize())
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        if (Date.now() - this.born < 150) return;
        finishDrag(this.point || e.position);
      })
      .on_mouse_move((e, cx) => {
        const current = shared(DRAG);
        if (!current) return;
        this.point = e.position;
        this.preview = dragSize(current, e.position.x, e.position.y);
        cx.notify();
      })
      .on_mouse_up("left", (e, cx) => {
        cx.stop_propagation();
        if (Date.now() - this.born < 150) return;
        finishDrag(e.position);
      })
      .child(div().text_size(18).font_semibold().text_color(t.foreground).child(`${shown.w} × ${shown.h}`))
      .child(div().text_size(11).text_color(t.dim).child("release to resize"));
  }

  renderGrip(t, _cx) {
    const grip = props()?.xsplitGrip ?? {};
    const edge = grip.edge === "right" || grip.edge === "corner" ? grip.edge : "bottom";
    const mark = edge === "right" ? "↔" : edge === "bottom" ? "↕" : "◢";
    return h_flex()
      .id(`xsplit-grip-${edge}`)
      .size_full()
      .items_center()
      .justify_center()
      .border_color(t.border)
      .bg(t.chrome)
      .text_size(11)
      .text_color(t.dim)
      .when(edge !== "right", (el) => el.border_t(1))
      .when(edge !== "bottom", (el) => el.border_l(1))
      .when(edge === "right", (el) => el.cursor_ew_resize())
      .when(edge === "bottom", (el) => el.cursor_ns_resize())
      .when(edge === "corner", (el) => el.cursor_nwse_resize())
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        if (!grip.address) return;
        const size = rememberedSize();
        setShared(DRAG, {
          x: e.position.x,
          y: e.position.y,
          w: size.w,
          h: size.h,
          edge,
          address: grip.address,
          machine: grip.machine ?? "",
        });
      })
      .on_mouse_move((e, cx) => {
        const drag = shared(DRAG);
        if (!drag || drag.edge !== edge) return;
        this.preview = dragSize(drag, e.position.x, e.position.y);
        const dist = Math.abs(e.position.x - drag.x) + Math.abs(e.position.y - drag.y);
        if (dist >= 4) openVeil();
        cx.notify();
      })
      .on_mouse_up("left", (e, cx) => {
        cx.stop_propagation();
        const drag = shared(DRAG);
        if (drag?.tracking && Date.now() - drag.tracking < 150) return;
        finishDrag(e.position);
      })
      .child(mark);
  }

  renderPicker(t, _cx) {
    const list = otherMachines();
    this.seen = this.machineSig();
    return v_flex()
      .id("xsplit")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(12.5)
      .child(
        h_flex()
          .h(32)
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(div().font_semibold().child("Other machine"))
          .child(div().text_size(11).text_color(t.dim).child(this.pending ? this.hint : "open a shell")),
      )
      .when(this.hint && !this.pending, (el) =>
        el.child(div().flex_none().px(10).py(4).text_size(11).text_color(t.accent).child(this.hint)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .py(4)
          .children(
            list.map((m, i) => {
              const name = m.name ?? null;
              const opening = Boolean(this.pending) && (this.pending.machine ?? null) === name;
              return h_flex()
                .id(`xsplit-m-${i}`)
                .h(32)
                .px(10)
                .gap(8)
                .items_center()
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .on_click((_e, acx) => this.openMachine(name, acx))
                .child(div().flex_1().truncate().child(labelOf(name)))
                .when(opening, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("opening…")));
            }),
          ),
      )
      .when(list.length === 0, (el) =>
        el.child(div().p(14).text_color(t.dim).child("No other machine is connected.")),
      );
  }
}
