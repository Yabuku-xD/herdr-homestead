// Every agent on every space at a glance, in bands by urgency. Cards reflow to
// the block's width, from one column on a phone-sized window to six on a wall.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, hc, run, spaces, theme, window } from "herdr";
import { agentName, ago, alert, byUrgency, mark, node, openAgent, programIcon, since, zoom } from "./lib.js";

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

export class Fleet {
  constructor(cx) {
    this.width = 0;
    this.lines = {};
    this.busy = false;
    cx.timer.every(POLL, (cx) => this.poll(cx));
    this.poll(cx);
  }

  // Timers run while hidden: read screens only when someone can see them.
  poll(cx) {
    if (this.busy || node("view")?.active !== "fleet" || !window()?.active) return;
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

  card(t, a, width) {
    const space = spaces().find((s) => s.id === a.space);
    const name = agentName(a);
    const where = [space?.name, a.tab_name === name ? null : a.tab_name].filter(Boolean).join(" · ");
    const blocked = a.status === "blocked";
    const roles = alert(t);
    return v_flex().id(`hs-card-${a.address}`).w(width).h(84).flex_none().p(10).gap(4).rounded(8).cursor_pointer()
      .border(1).border_color(blocked ? roles.edge : t.border).bg(blocked ? roles.fill : t.surface)
      .hover((s) => (blocked ? s.border_color(t.blocked) : s.bg(t.hover)))
      .on_click(() => openAgent(a))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); run("terminal.peek", { terminal: a.address }); })
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(programIcon(t, a.program, 16))
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_medium().text_color(t.foreground).child(name))
        .child(div().flex_none().text_size(11).text_color(t.muted).child(ago(since(a))))
        .child(mark(t, a.status)))
      .child(div().truncate().text_size(11.5).text_color(t.muted).child(where || a.address))
      .child(div().truncate().text_size(11.5).text_color(t.muted).child(this.lines[a.address] ?? ""));
  }

  band(t, band, list, columns, width) {
    const rows = [];
    for (let i = 0; i < list.length; i += columns) rows.push(list.slice(i, i + columns));
    return v_flex().flex_none().gap(GAP)
      .child(h_flex().h(20).gap(6).items_center().text_size(11.5).text_color(t.muted)
        .child(band.label).child(div().text_color(band.status === "blocked" ? t.blocked : t.muted).child(String(list.length))))
      .children(rows.map((row) => div().flex().flex_row().flex_none().gap(GAP).children(row.map((a) => this.card(t, a, width)))));
  }

  render() {
    const t = theme();
    const inner = Math.max(0, this.width - PADDING * 2);
    const columns = Math.max(1, Math.min(6, Math.floor((inner + GAP) / (CARD + GAP))));
    const width = Math.floor((inner - GAP * (columns - 1)) / columns);
    const all = byUrgency(agents());
    const bands = BANDS.map((band) => ({ band, list: all.filter((a) => a.status === band.status) })).filter((b) => b.list.length);
    const size = (el) => el.id("hs-fleet").size_full().on_size_change((s, cx) => {
      const measured = s.width / zoom();
      if (Math.abs(measured - this.width) < 1) return;
      this.width = measured;
      cx.notify();
    });
    if (!all.length) {
      return size(v_flex()).items_center().justify_center().gap(4).bg(t.background)
        .child(div().text_size(13).text_color(t.foreground).child("No agents running"))
        .child(div().text_size(12).text_color(t.muted).child("Start one from the + menu."));
    }
    return size(v_flex()).bg(t.background).overflow_y_scrollbar().p(PADDING).gap(16)
      .when(width > 0, (el) => el.children(bands.map((b) => this.band(t, b.band, b.list, columns, width))));
  }
}
