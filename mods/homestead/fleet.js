// Overview: every agent on every space, in bands by urgency. It is a dialog, not a
// view: a plain block can't take the keyboard, so as a view your typing would land in
// a terminal you can't see. Here the arrows move, Enter opens and Esc always leaves.
// Cards reflow to the width, from one column on a small window to six on a wall.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, closeOverlay, hc, openOverlay, props, run, setShared, shared, spaces, theme, window } from "herdr";
import { agentName, ago, alert, byUrgency, fit, mark, openAgent, programIcon, since, zoom } from "./lib.js";

const BANDS = [
  { status: "blocked", label: "Needs you" },
  { status: "working", label: "Working" },
  { status: "done", label: "Finished" },
  { status: "idle", label: "Idle" },
];

const CARD = 280;
const GAP = 8;
const PADDING = 16;
const POLL = 5000;

// The last line of a screen that says something: no blanks, rules or prompts.
const lastLine = (text) => (text ?? "").split("\n").map((l) => l.trim()).reverse()
  .find((l) => l.length > 3 && /[\p{L}\p{N}]/u.test(l) && !/^[>❯$%#│|]/.test(l)) ?? "";

// The dialog's copy records its overlay, so the bar's key can close it too.
const OPEN = "homestead.overview";

export const overviewOpen = () => Boolean(shared(OPEN));

export const openOverview = () => {
  openOverlay({ mod: "homestead", kind: "dialog", width: 0.92, height: 0.88, props: { role: "fleet" } });
};

export const closeOverview = () => {
  const id = shared(OPEN);
  if (id) closeOverlay(id);
};

export class Fleet {
  constructor(cx) {
    this.width = 0;
    this.columns = 1;
    this.lines = {};
    this.busy = false;
    this.selected = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (props()?.overlay) setShared(OPEN, props().overlay);
    cx.timer.every(POLL, (cx) => this.poll(cx));
    this.poll(cx);
  }

  close() {
    if (props()?.overlay) setShared(OPEN, null);
  }

  poll(cx) {
    if (this.busy || (window() && !window().active)) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      for (const a of agents()) {
        try {
          const read = await hc(["read", "--lines", "8", a.address]);
          if (read.code === 0) this.lines[a.address] = lastLine(read.stdout);
        } catch { this.lines[a.address] = ""; }
      }
      this.busy = false;
      cx.notify();
    });
  }

  open(a) {
    closeOverview();
    openAgent(a);
  }

  // Arrows follow the grid on screen: up and down keep the column across bands.
  rows() {
    const all = byUrgency(agents());
    return BANDS.flatMap((band) => {
      const list = all.filter((a) => a.status === band.status);
      const rows = [];
      for (let i = 0; i < list.length; i += this.columns) rows.push(list.slice(i, i + this.columns));
      return rows;
    });
  }

  onKey(e, cx) {
    const rows = this.rows();
    const list = rows.flat();
    if (!list.length) return;
    const chosen = list.find((a) => a.address === this.selected);
    if (e.key === "enter") return this.open(chosen ?? list[0]);
    const direction = { left: "left", h: "left", right: "right", l: "right", up: "up", k: "up", down: "down", j: "down" }[e.key];
    if (!direction) return;
    if (!chosen) {
      this.selected = list[0].address;
      return cx.notify();
    }
    const at = list.indexOf(chosen);
    const row = rows.findIndex((r) => r.includes(chosen));
    const column = rows[row].indexOf(chosen);
    const target = direction === "left" ? list[Math.max(0, at - 1)]
      : direction === "right" ? list[Math.min(list.length - 1, at + 1)]
      : (() => {
        const next = rows[direction === "up" ? Math.max(0, row - 1) : Math.min(rows.length - 1, row + 1)];
        return next[Math.min(column, next.length - 1)];
      })();
    this.selected = target.address;
    cx.notify();
  }

  card(t, a, width) {
    const space = spaces().find((s) => s.id === a.space);
    const name = agentName(a);
    const where = [space?.name, a.tab_name === name ? null : a.tab_name].filter(Boolean).join(" · ");
    const blocked = a.status === "blocked";
    const roles = alert(t);
    const chosen = this.selected === a.address;
    return v_flex().id(`hs-card-${a.address}`).w(width).h(84).flex_none().p(10).gap(4).rounded(8).cursor_pointer()
      .border(1).border_color(chosen ? t.accent : blocked ? roles.edge : t.border).bg(blocked ? roles.fill : t.surface)
      .hover((s) => (blocked ? s.border_color(t.blocked) : s.bg(t.hover)))
      .on_click(() => this.open(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); run("terminal.peek", { terminal: a.address }); })
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(programIcon(t, a.program, 16))
        .child(div().flex_1().min_w(0).truncate().text_size(fit(13)).font_medium().text_color(t.foreground).child(name))
        .child(div().flex_none().text_size(fit(12)).text_color(t.muted).child(ago(since(a))))
        .child(mark(t, a.status)))
      .child(div().truncate().text_size(fit(12)).text_color(t.muted).child(where || a.address))
      .child(div().truncate().text_size(fit(12)).text_color(t.muted).child(this.lines[a.address] ?? ""));
  }

  band(t, band, list, columns, width) {
    const rows = [];
    for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns));
    return v_flex().flex_none().gap(GAP)
      .child(h_flex().h(20).gap(6).items_center().text_size(fit(12)).text_color(t.muted)
        .child(band.label).child(div().text_color(band.status === "blocked" ? t.blocked : t.muted).child(String(list.length))))
      .children(rows.map((row) => div().flex().flex_row().flex_none().gap(GAP).children(row.map((a) => this.card(t, a, width)))));
  }

  render() {
    const t = theme();
    const inner = Math.max(0, this.width - PADDING * 2);
    const columns = Math.max(1, Math.min(6, Math.floor((inner + GAP) / (CARD + GAP))));
    this.columns = columns;
    const width = Math.floor((inner - GAP * (columns - 1)) / columns);
    const all = byUrgency(agents());
    const bands = BANDS.map((band) => ({ band, list: all.filter((a) => a.status === band.status) })).filter((b) => b.list.length);
    const base = (el) => el.id("hs-fleet").size_full().track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((s, cx) => {
        const measured = s.width / zoom();
        if (Math.abs(measured - this.width) < 1) return;
        this.width = measured;
        cx.notify();
      });
    // Names where you are, how to act and how to leave.
    const header = h_flex().h(42).flex_none().px(PADDING).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().text_size(fit(13)).font_medium().text_color(t.foreground).child("Overview"))
      .child(div().flex_1().min_w(0).truncate().text_size(fit(12)).text_color(t.muted).child(`${all.length} ${all.length === 1 ? "agent" : "agents"}`))
      .when(width >= CARD && inner > 420 && all.length > 0, (el) => el.child(div().flex_none().text_size(fit(12)).text_color(t.muted).child("Arrows to move, Enter to open")))
      .child(div().id("hs-fleet-close").h(26).flex_none().px(8).flex().items_center().rounded(6).text_size(fit(12)).text_color(t.muted).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => closeOverview()).child("Esc"));
    const body = all.length
      ? v_flex().id("hs-fleet-list").flex_1().min_h(0).overflow_y_scrollbar().p(PADDING).gap(16)
        .when(width > 0, (el) => el.children(bands.map((b) => this.band(t, b.band, b.list, columns, width))))
      : v_flex().flex_1().items_center().justify_center().gap(4)
        .child(div().text_size(fit(13)).text_color(t.foreground).child("No agents running"))
        .child(div().text_size(fit(12)).text_color(t.muted).child("Start one from the + menu."));
    return base(v_flex()).min_h(0).bg(t.background).child(header).child(body);
  }
}
