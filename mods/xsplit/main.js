// Cross-machine split view.
//
// Herdr keeps one tab inside one machine, so panes from two machines can't share
// a tab. A mod *can* put terminals from any number of machines in one window:
// a window's layout takes blocks whose content is a terminal address, and those
// addresses are machine-qualified (`4090/t1f`). This mod is the picker that opens
// such a window, plus the bar inside it (labels, one line sent to every pane, close).
//
//   herdr-app do tab.new --mod xsplit        # a tab whose only pane is the picker
//
// The window is not a tab: it has no divider drag, no pane.split, and it isn't
// saved with the tab. Its terminals are ordinary terminals of their machines and
// keep running after the window closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { terminals, panes, theme, openOverlay, closeOverlay, props, shared, setShared, hc, run } from "herdr";

const PICK = "xsplit.pick";
const WIN = "xsplit.window";
const SIZE = "xsplit.size";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function machineOf(address) {
  const i = String(address).indexOf("/");
  return i < 0 ? "this computer" : address.slice(0, i);
}

function tail(path) {
  const parts = String(path || "").split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

// The window. Reopening with the same key replaces the open one where it is, which is
// how the grip resizes it: a window has no resize handle of its own.
function openWindow(terms, w, h) {
  const id = openOverlay({
    kind: "window",
    key: "xsplit",
    width: w,
    height: h,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: 32 }, content: { mod: "xsplit", props: { xsplitBar: { terms } } } },
        {
          type: "row",
          // A layout divider is drawn but not draggable over terminal blocks, so the
          // right edge carries its own 14 px handle: dragging it changes the height.
          divider: { width: 1, color: "border" },
          children: [
            ...terms.map((t) => ({
              type: "block",
              content: { terminal: t.address },
              size: { weight: 1 },
              min: 80,
            })),
            {
              type: "block",
              size: { px: 14 },
              content: { mod: "xsplit", props: { xsplitGrip: { axis: "h", terms } } },
            },
          ],
        },
        { type: "block", size: { px: 14 }, content: { mod: "xsplit", props: { xsplitGrip: { axis: "w", terms } } } },
      ],
    },
  });
  setShared(WIN, id);
  setShared(SIZE, { w: Math.round(w), h: Math.round(h) });
  return id;
}

export default class XSplit extends View {
  init(_props, cx) {
    // A strip in the layout (`props.launcher`): one click opens the picker, so the
    // mod doesn't have to be started from a shell.
    if (props()?.launcher) {
      this.mode = "launcher";
      return;
    }

    // The 14 px strip along the bottom of the window: drag it to resize.
    if (props()?.xsplitGrip) {
      this.mode = "grip";
      this.drag = null;
      this.self = null;
      return;
    }

    const bar = props()?.xsplitBar;
    if (bar) {
      // Inside the window: a title bar with a broadcast box.
      this.bar = bar;
      this.hint = null;
      this.busy = false;
      this.input = InputState.new({ placeholder: "send a line to every pane…" });
      this.input.on("submit", (_e, cx) => this.broadcast(cx));
      return;
    }

    // The picker pane. `props.open` is a list of terminal addresses to open at once,
    // so a fixed set can be started from the command line:
    //   herdr-app do tab.new --mod xsplit --props '{"open":["4090/t1f","5090/t2"]}'
    const wanted = props()?.open;
    const known = new Set(this.shown().map((t) => t.address));
    const initial = Array.isArray(wanted) && wanted.length ? wanted : shared(PICK) || [];
    this.pick = new Set(initial.filter((a) => known.has(a)));
    this.pendingOpen = Array.isArray(wanted) && this.pick.size > 0;
    this.hint = null;
    this.seen = "";
    cx.timer.every(3000, (acx) => {
      if (this.sig() === this.seen) return;
      acx.notify();
    });
  }

  // Terminals a window block can actually show: live, and attached to a pane.
  // A bare `hc run --bg` terminal has no pane, and a block for it renders as an
  // empty strip (the window collapses to its bar).
  shown() {
    const attached = new Set(panes().map((p) => p.terminal).filter(Boolean));
    return terminals().filter((t) => t.state === "live" && attached.has(t.address));
  }

  // Cheap fingerprint of the live terminal list, so the timer only redraws on change.
  sig() {
    return this.shown()
      .map((t) => `${t.address}:${t.where || ""}`)
      .sort()
      .join("|");
  }

  toggle(address, cx) {
    if (this.pick.has(address)) this.pick.delete(address);
    else this.pick.add(address);
    setShared(PICK, [...this.pick]);
    cx.notify();
  }

  open(cx) {
    const live = this.shown();
    const terms = live
      .filter((t) => this.pick.has(t.address))
      .map((t) => ({ address: t.address, where: t.where || t.cwd || "" }));
    if (!terms.length) return;
    openWindow(terms, Math.min(1560, 420 * terms.length + 24), 520);
    this.hint = `opened ${terms.length} pane${terms.length > 1 ? "s" : ""}`;
    cx.notify();
  }

  // One line, typed once, submitted in every terminal of the window.
  // `hc send` pastes the text and presses Enter; --force goes ahead even when a
  // program is mid-draft, which is the point of a broadcast.
  broadcast(cx) {
    if (!this.input || this.busy) return;
    const text = this.input.value().trim();
    if (!text) return;
    const list = this.bar.terms.map((t) => t.address);
    this.busy = true;
    this.hint = "sending…";
    this.input.set_value("");
    cx.notify();
    cx.spawn(async (acx) => {
      let ok = 0;
      const bad = [];
      for (const address of list) {
        try {
          const r = await hc(["send", "--force", address, text]);
          if (r && r.code === 0) ok += 1;
          else bad.push(machineOf(address));
        } catch (e) {
          bad.push(machineOf(address));
        }
      }
      this.busy = false;
      this.hint = bad.length ? `failed: ${bad.join(", ")}` : `sent to ${ok} pane${ok > 1 ? "s" : ""}`;
      acx.notify();
    });
  }

  render(cx) {
    const t = theme();
    if (this.mode === "launcher") return this.renderLauncher(t, cx);
    if (this.mode === "grip") return this.renderGrip(t, cx);
    if (this.bar) return this.renderBar(t, cx);
    return this.renderPicker(t, cx);
  }

  // Resize handles: the bottom edge drags the width, the right edge the height. GPUI
  // delivers moves only while the pointer is over the element, so each handle is a
  // 14 px band and the delta is applied when the button comes up — the window is then
  // reopened at the new size, in the same place (same key).
  renderGrip(t, cx) {
    const grip = props()?.xsplitGrip ?? {};
    const vertical = grip.axis === "h";
    const size = shared(SIZE) || { w: 0, h: 0 };
    const live = this.drag ? (vertical ? `${this.drag.h} high` : `${this.drag.w} wide`) : "";
    const el = vertical
      ? v_flex().id("xsplit-grip-h").size_full().py(10).items_center().justify_center()
      : h_flex().id("xsplit-grip-w").size_full().px(8).items_center().justify_end();
    return el
      .bg(t.chrome)
      .when(vertical, (e) => e.border_l(1))
      .when(!vertical, (e) => e.border_t(1))
      .border_color(t.border)
      .gap(6)
      .text_size(10)
      .text_color(t.dim)
      .when(vertical, (e) => e.cursor_ns_resize())
      .when(!vertical, (e) => e.cursor_ew_resize())
      .when(Boolean(live), (e) => e.child(div().text_color(t.accent).child(live)))
      .child(div().child(vertical ? "⋮" : "◢"))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const w0 = Math.round(size.w);
        const h0 = Math.round(size.h);
        this.drag = { x: e.position.x, y: e.position.y, w0, h0, w: w0, h: h0 };
        cx.notify();
      })
      .on_mouse_move((e, cx) => {
        const d = this.drag;
        if (!d) return;
        if (vertical) d.h = clamp(Math.round(d.h0 + (e.position.y - d.y)), 220, 1400);
        else d.w = clamp(Math.round(d.w0 + (e.position.x - d.x)), 420, 2400);
        cx.notify();
      })
      .on_mouse_up("left", (e, cx) => {
        const d = this.drag;
        this.drag = null;
        cx.notify();
        if (!d) return;
        cx.stop_propagation();
        openWindow(grip.terms ?? [], d.w, d.h);
      });
  }

  // One row: a button that opens the picker. It lives in a narrow sidebar, so it
  // carries no count — a long label here gets clipped by the sidebar edge.
  renderLauncher(t, cx) {
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
      .child(div().flex_1().truncate().child("Cross-machine"))
      .child(div().flex_none().text_color(t.dim).child("›"));
  }

  renderBar(t, cx) {
    const names = this.bar.terms.map((x) => machineOf(x.address)).join("   ·   ");
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
      .child(div().flex_none().text_color(t.muted).child(names))
      .child(
        Input.new(this.input)
          .flex_1()
          .h(24)
          .px(6)
          .rounded(6)
          .border_1()
          .border_color(t.border)
          .bg(t.background)
          .text_size(11.5)
          .text_color(t.foreground),
      )
      .when(this.hint, (el) => el.child(div().flex_none().text_color(this.busy ? t.dim : t.accent).child(this.hint)))
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
          .on_click(() => {
            const id = props()?.overlay ?? shared(WIN);
            if (id) closeOverlay(id);
            setShared(WIN, null);
          })
          .child("×"),
      );
  }

  renderPicker(t, cx) {
    if (this.pendingOpen) {
      this.pendingOpen = false;
      this.open(cx);
    }
    const live = this.shown();
    this.seen = this.sig();
    const groups = [];
    for (const x of live) {
      const m = machineOf(x.address);
      let g = groups.find((y) => y.m === m);
      if (!g) {
        g = { m, rows: [] };
        groups.push(g);
      }
      g.rows.push(x);
    }
    const rank = (m) => (m === "this computer" ? 0 : 1);
    groups.sort((a, b) => rank(a.m) - rank(b.m) || a.m.localeCompare(b.m));
    for (const g of groups) g.rows.sort((a, b) => String(a.address).localeCompare(String(b.address)));

    const n = this.pick.size;
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
          .child(div().font_semibold().child("Cross-machine"))
          .child(div().text_size(11).text_color(t.dim).child(n ? `${n} picked` : "pick terminals, then open"))
          .child(div().flex_1())
          .when(n > 0, (el) =>
            el.child(
              div()
                .id("xsplit-clear")
                .px(8)
                .py(3)
                .rounded(6)
                .text_size(11.5)
                .text_color(t.dim)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover).text_color(t.foreground))
                .on_click((_e, cx) => {
                  this.pick.clear();
                  setShared(PICK, []);
                  cx.notify();
                })
                .child("Clear"),
          ),
          )
          .child(
            div()
              .id("xsplit-open")
              .px(10)
              .py(3)
              .rounded(6)
              .text_size(11.5)
              .font_medium()
              .when(n > 0, (el) =>
                el.bg(t.accent).text_color(t.accent_foreground).cursor_pointer().hover((s) => s.opacity(0.88)),
              )
              .when(n === 0, (el) => el.bg(t.raised).text_color(t.dim))
              .on_click((_e, cx) => this.open(cx))
              .child(ifText(n > 0, `Open ${n}`, "Open")),
          ),
      )
      .when(this.hint, (el) =>
        el.child(div().flex_none().px(10).py(4).text_size(11).text_color(t.accent).child(this.hint)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .py(4)
          .gap(6)
          .children(
            groups.map((g) =>
              v_flex()
                .gap(1)
                .child(div().px(10).py(3).text_size(11).font_medium().text_color(t.dim).child(g.m))
                .children(
                  g.rows.map((x) => {
                    const on = this.pick.has(x.address);
                    return h_flex()
                      .id(`xsplit-${x.address}`)
                      .h(26)
                      .px(10)
                      .gap(8)
                      .items_center()
                      .cursor_pointer()
                      .when(on, (el) => el.bg(t.selected))
                      .hover((s) => s.bg(t.hover))
                      .on_click((_e, cx) => this.toggle(x.address, cx))
                      .child(
                        div()
                          .flex_none()
                          .size(11)
                          .rounded(3)
                          .border_1()
                          .border_color(on ? t.accent : t.border)
                          .when(on, (el) => el.bg(t.accent)),
                      )
                      .child(div().flex_none().text_size(11.5).text_color(t.muted).child(x.address))
                      .child(div().flex_none().text_color(t.foreground).child(String(x.program?.name || x.agent || "shell")))
                      .child(div().flex_1().truncate().text_color(t.dim).child(tail(x.where || x.cwd)))
                      .when(Boolean(x.status), (el) => el.child(div().flex_none().text_size(11).text_color(t.accent).child(String(x.status))));
                  }),
                ),
            ),
          ),
      )
      .when(groups.length === 0, (el) =>
        el.child(div().p(14).text_color(t.dim).child("No live terminals. Open a space on a machine first.")),
      );
  }
}

function ifText(cond, a, b) {
  return cond ? a : b;
}
