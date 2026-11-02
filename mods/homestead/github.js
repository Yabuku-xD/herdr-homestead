// Pull requests and issues of the repo the focused terminal is in, through `gh`.
// Read-only: the only action starts an agent in a worktree of its own.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, focused, knownAgents, openOverlay, panes, spaces, theme, window } from "herdr";
import { node } from "./lib.js";

const REFRESH = 60000;
const LIMIT = "30";
const PR_FIELDS = "number,title,author,isDraft,headRefName,reviewDecision,statusCheckRollup,url";
const ISSUE_FIELDS = "number,title,author,labels,url";

const checks = (pr) => {
  const runs = pr.statusCheckRollup ?? [];
  if (!runs.length) return null;
  const state = (r) => r.conclusion || r.state || r.status;
  if (runs.some((r) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"].includes(state(r)))) return "fail";
  return runs.every((r) => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state(r))) ? "pass" : "pending";
};

const openUrl = (url) => {
  const platform = window()?.platform;
  exec(platform === "macos" ? "open" : platform === "windows" ? "explorer" : "xdg-open", [url]).catch(() => {});
};

const friendly = (text) => {
  if (/no git remotes|not a git repository/i.test(text)) return "This folder has no GitHub repo.";
  if (/gh auth login|authentication/i.test(text)) return "Sign in with: gh auth login";
  if (/not found|no such file|cannot find/i.test(text)) return "Install the GitHub CLI (gh) to use this panel.";
  return text;
};

const shown = () => !node("panel")?.hidden && node("panel-body")?.active === "github";

export class GitHub {
  constructor(cx) {
    this.mode = "prs";
    this.cwd = null;
    this.data = {};
    this.error = null;
    this.loading = false;
    cx.timer.every(2000, (cx) => { if (shown() && this.place()?.cwd !== this.cwd) this.refresh(cx); });
    cx.timer.every(REFRESH, (cx) => { if (shown() && window()?.active) this.refresh(cx); });
  }

  place() {
    const pane = panes().find((p) => p.pane === focused()?.pane) ?? panes().find((p) => p.cwd);
    const machine = spaces().find((s) => s.id === focused()?.space)?.machine ?? null;
    return pane?.cwd ? { cwd: pane.cwd, on: machine } : null;
  }

  async gh(args, place) {
    const result = await exec("gh", args, { cwd: place.cwd, on: place.on });
    if (result.code !== 0) throw new Error(result.stderr.trim().split("\n")[0] || "gh failed");
    return JSON.parse(result.stdout);
  }

  refresh(cx) {
    const place = this.place();
    this.cwd = place?.cwd ?? null;
    if (!place || this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const [prs, issues] = await Promise.all([
          this.gh(["pr", "list", "--limit", LIMIT, "--json", PR_FIELDS], place),
          this.gh(["issue", "list", "--limit", LIMIT, "--json", ISSUE_FIELDS], place),
        ]);
        this.data = { prs, issues };
        this.error = null;
      } catch (e) {
        this.data = {};
        this.error = friendly(String(e.message ?? e));
      }
      this.loading = false;
      cx.notify();
    });
  }

  // The agent reads the issue itself: its text is not pasted into a command.
  startAgent(issue, cx) {
    const place = this.place();
    cx.spawn(async () => {
      const agent = (await knownAgents({ on: place?.on })).find((a) => a.installed);
      if (!agent) return;
      const task = `Work on GitHub issue #${issue.number}. Read it first with: gh issue view ${issue.number}`;
      openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: {
        space: focused()?.space, folder: place?.cwd, branch: `issue-${issue.number}`, tab: `#${issue.number}`, argv: [...agent.run, task],
      } });
    });
  }

  tab(t, id, label, count) {
    const on = this.mode === id;
    return h_flex().id(`hs-gh-${id}`).h(26).px(8).gap(5).items_center().rounded(6).text_size(12)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.mode = id; cx.notify(); })
      .child(label).when(count !== undefined, (el) => el.child(div().text_color(t.muted).child(String(count))));
  }

  row(t, item, detail, end) {
    return h_flex().id(`hs-gh-${this.mode}-${item.number}`).w_full().h(50).flex_none().min_w(0).px(8).gap(8).items_center().rounded(8).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => openUrl(item.url))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(13).text_color(t.foreground).child(item.title))
        .child(div().truncate().text_size(12).text_color(t.muted).child(`#${item.number} · ${detail}`)))
      .child(end);
  }

  prRow(t, pr) {
    const state = checks(pr);
    const color = { fail: t.blocked, pending: t.working, pass: t.done }[state] ?? t.idle ?? t.dim;
    const label = { fail: "checks failed", pending: "checks running", pass: "checks passed" }[state];
    const detail = [pr.isDraft ? "draft" : null, label, pr.author?.login, pr.headRefName].filter(Boolean).join(" · ");
    return this.row(t, pr, detail, div().size(7).flex_none().rounded(4).bg(color));
  }

  issueRow(t, issue) {
    const start = div().id(`hs-gh-start-${issue.number}`).flex_none().px(6).h(22).flex().items_center().rounded(5).text_size(12).text_color(t.muted)
      .border(1).border_color(t.border).hover((s) => s.bg(t.raised).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); this.startAgent(issue, cx); }).child("Start agent");
    return this.row(t, issue, issue.author?.login ?? "", start);
  }

  render(cx) {
    const t = theme();
    if (shown() && this.place()?.cwd !== this.cwd && !this.loading) cx.timer.after(1, (cx) => this.refresh(cx));
    const list = this.data[this.mode] ?? [];
    const note = (text) => div().px(8).py(10).text_size(12).text_color(t.muted).child(text);
    return v_flex().id("hs-github").size_full().min_h(0).rounded(10).overflow_hidden().border(1).border_color(t.border).bg(t.background)
      .child(h_flex().h(42).flex_none().px(8).gap(3).items_center().border_b(1).border_color(t.border)
        .child(this.tab(t, "prs", "Pull requests", this.data.prs?.length))
        .child(this.tab(t, "issues", "Issues", this.data.issues?.length))
        .child(div().flex_1())
        .child(div().id("hs-gh-refresh").h(26).px(8).flex().items_center().rounded(6).text_size(12).text_color(t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.refresh(cx)).child(this.loading ? "…" : "Refresh")))
      .child(v_flex().id("hs-gh-list").flex_1().min_h(0).p(6).overflow_y_scrollbar()
        .when(Boolean(this.error), (el) => el.child(note(this.error)))
        .when(!this.error && !list.length, (el) => el.child(note(this.loading ? "Loading…" : "Nothing open here.")))
        .children(list.map((item) => (this.mode === "prs" ? this.prRow(t, item) : this.issueRow(t, item)))));
  }
}
