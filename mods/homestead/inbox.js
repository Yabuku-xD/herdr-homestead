// Who needs me now: blocked agents first, longest wait first, then finished ones
// under their own heading, so a finished agent never reads as needing you.
// It sits between Spaces and Agents: Spaces never move when it grows, and urgency
// reads as the head of the agents list.
// Metrics match the shipped spaces and agents lists, so the sidebar reads as one.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, hc, panes, run, spaces, theme } from "herdr";
import { agentName, ago, alert, fit, mark, message, needing, openAgent, question, since } from "./lib.js";

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

const READ_ONLY = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

// Tracked changes as +adds −dels, then files git doesn't know yet, which a diff misses.
async function workStat(cwd, on) {
  const diff = await exec("git", [...READ_ONLY, "diff", "--shortstat", "HEAD"], { cwd, on });
  const added = /(\d+) insertion/.exec(diff.stdout)?.[1];
  const removed = /(\d+) deletion/.exec(diff.stdout)?.[1];
  const changed = added || removed ? `+${added ?? 0} −${removed ?? 0}` : "";
  const fresh = await exec("git", [...READ_ONLY, "ls-files", "--others", "--exclude-standard"], { cwd, on });
  const count = fresh.code === 0 ? fresh.stdout.split("\n").filter(Boolean).length : 0;
  const created = count ? `${count} new` : "";
  return [changed, created].filter(Boolean).join(" · ");
}

export class Inbox {
  constructor(cx) {
    this.read = {};
    this.busy = false;
    // Wait times tick by themselves; screens and diffs are read once per state.
    cx.timer.every(30000, (cx) => { if (needing().length) cx.notify(); });
    cx.timer.every(3000, (cx) => this.scan(cx));
  }

  // Keyed by the agent's change counter, so a new state reads again and an old one
  // never costs another process. Git must not write under .git, or watchers wake.
  scan(cx) {
    const missing = needing().filter((a) => !(`${a.address}:${a.seq}` in this.read));
    if (this.busy || !missing.length) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      for (const a of missing) {
        const key = `${a.address}:${a.seq}`;
        try {
          if (a.status === "blocked") {
            const screen = await hc(["read", "--lines", "30", a.address]);
            this.read[key] = question(screen.stdout);
          } else {
            const cwd = panes().find((p) => p.pane === a.pane)?.cwd;
            const on = spaces().find((s) => s.id === a.space)?.machine ?? null;
            this.read[key] = cwd ? await workStat(cwd, on) : "";
          }
        } catch { this.read[key] = ""; }
      }
      this.busy = false;
      cx.notify();
    });
  }

  // A finished agent with work to review opens with its changes beside it.
  // Waits a beat: the shipped tab bar restores the new space's saved panel state first,
  // and would close a panel opened in the same moment.
  open(a, stat, cx) {
    openAgent(a);
    if (!stat) return;
    cx.timer.after(300, () => {
      run("layout.select", { stack: "panel-body", child: "changes" });
      run("layout.show", { id: "panel" });
    });
  }

  row(t, a) {
    const space = spaces().find((s) => s.id === a.space);
    const blocked = a.status === "blocked";
    const found = this.read[`${a.address}:${a.seq}`] ?? "";
    const stat = blocked ? "" : found;
    const detail = message(a) || (blocked ? found || "Waiting for you" : "Finished");
    const roles = alert(t);
    const fill = blocked ? roles.fill : a.focused ? t.selected : t.chrome;
    return v_flex().id(`hs-need-${a.address}`).h(ROW - 2).mb(2).flex_none().px(8).justify_center().gap(2).rounded(8).cursor_pointer()
      .border(1).border_color(blocked && a.focused ? roles.edge : fill).bg(fill)
      .hover((s) => (blocked ? s.border_color(roles.edge) : s.bg(t.hover).border_color(t.chrome)))
      .on_click((_e, cx) => this.open(a, stat, cx))
      .child(h_flex().gap(COLUMN_GAP).items_center().min_w(0)
        .child(h_flex().w(COLUMN).flex_none().justify_center().child(mark(t, a.status)))
        .child(div().flex_1().min_w(0).truncate().text_size(fit(13)).font_medium().text_color(t.foreground).child(agentName(a)))
        .child(div().flex_none().text_size(fit(12)).text_color(t.muted).child(ago(since(a)))))
      .child(h_flex().pl(COLUMN + COLUMN_GAP).gap(5).min_w(0).text_size(fit(12))
        .child(div().flex_none().max_w(96).truncate().text_color(t.muted).child(space?.name ?? ""))
        .child(div().flex_1().min_w(0).truncate().text_color(blocked ? t.foreground : t.muted).child(detail))
        .when(Boolean(stat), (el) => el.child(div().flex_none().text_color(t.muted).child(stat))));
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
