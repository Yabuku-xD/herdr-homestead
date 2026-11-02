// Who needs me now: blocked agents first, longest wait first, then finished ones
// under their own heading, so a finished agent never reads as needing you.
// It sits between Spaces and Agents: Spaces never move when it grows, and urgency
// reads as the head of the agents list.
// Metrics match the shipped spaces and agents lists, so the sidebar reads as one.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, theme } from "herdr";
import { agentName, ago, alert, fit, mark, message, needing, openAgent, since } from "./lib.js";

const HEAD = 31;
const ROW = 52;
const PAD = 6;

// Titles line up with the shipped agents list: a 16px icon column, then the gap to the title.
const COLUMN = 16;
const COLUMN_GAP = 8;

// The bar sizes this block, because a hidden block can't bring itself back.
export const inboxHeight = (list, maxRows) => {
  if (!list.length) return 0;
  const shown = list.slice(0, maxRows);
  const groups = new Set(shown.map((a) => a.status === "blocked")).size;
  return groups * HEAD + shown.length * ROW + PAD + 1;
};

export class Inbox {
  constructor(cx) {
    // Only the wait times change on their own.
    cx.timer.every(30000, (cx) => { if (needing().length) cx.notify(); });
  }

  row(t, a) {
    const space = spaces().find((s) => s.id === a.space);
    const detail = message(a) || (a.status === "blocked" ? "Waiting for you" : "Finished");
    const blocked = a.status === "blocked";
    const roles = alert(t);
    const fill = blocked ? roles.fill : a.focused ? t.selected : t.chrome;
    return v_flex().id(`hs-need-${a.address}`).h(ROW - 2).mb(2).flex_none().px(8).justify_center().gap(2).rounded(8).cursor_pointer()
      .border(1).border_color(blocked && a.focused ? roles.edge : fill).bg(fill)
      .hover((s) => (blocked ? s.border_color(roles.edge) : s.bg(t.hover).border_color(t.chrome)))
      .on_click(() => openAgent(a))
      .child(h_flex().gap(COLUMN_GAP).items_center().min_w(0)
        .child(h_flex().w(COLUMN).flex_none().justify_center().child(mark(t, a.status)))
        .child(div().flex_1().min_w(0).truncate().text_size(fit(13)).font_medium().text_color(t.foreground).child(agentName(a)))
        .child(div().flex_none().text_size(fit(12)).text_color(t.muted).child(ago(since(a)))))
      .child(h_flex().pl(COLUMN + COLUMN_GAP).gap(5).min_w(0).text_size(fit(12))
        .child(div().flex_none().max_w(96).truncate().text_color(t.muted).child(space?.name ?? ""))
        .child(div().flex_1().min_w(0).truncate().text_color(blocked ? t.foreground : t.muted).child(detail)));
  }

  head(t, label, count, color) {
    return h_flex().h(HEAD).flex_none().pl(8).gap(6).items_center().text_size(fit(12)).text_color(t.muted)
      .child(label).child(div().text_color(color).child(String(count)));
  }

  render() {
    const t = theme();
    const list = needing();
    const blocked = list.filter((a) => a.status === "blocked");
    const finished = list.filter((a) => a.status !== "blocked");
    return v_flex().id("hs-inbox").size_full().min_h(0).pb(PAD).bg(t.chrome).border_t(1).border_color(t.border)
      .child(v_flex().id("hs-inbox-list").flex_1().min_h(0).px(8).overflow_y_scrollbar()
        .when(blocked.length > 0, (el) => el.child(this.head(t, "Needs you", blocked.length, t.blocked)).children(blocked.map((a) => this.row(t, a))))
        .when(finished.length > 0, (el) => el.child(this.head(t, "Finished", finished.length, t.muted)).children(finished.map((a) => this.row(t, a)))));
  }
}
