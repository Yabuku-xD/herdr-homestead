// Sits beside the shipped tab bar instead of replacing it, so that bar keeps
// getting Herdr's updates. Owns what must run while everything else is hidden:
// the view switch, the extra panel buttons, the inbox's size and the key commands.
// Tabs and Agent are one choice, so they share a segmented control. Overview is a
// dialog you open and leave, so it stands apart.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, focused, layout, nextCommand, notify, openOverlay, panes, run, setShared, shared, spaces, theme, window } from "herdr";
import { inboxRows, panelLimit, showsFooter, showsLabels } from "./fit.js";
import { closeOverview, openOverview, overviewOpen } from "./fleet.js";
import { attentionAt, repoPlace } from "./github.js";
import { inboxHeight } from "./inbox.js";
import { alert, byUrgency, fit as fitText, icon, needing, node, paneStatus, programIcon, showTabs, stopPress, zoom } from "./lib.js";

const VIEWS = [
  { id: "main", label: "Tabs", glyph: "tabs" },
  { id: "agent", label: "Agent", glyph: "agent" },
];

// On a 1x screen a child centers exactly only if it and its parent are both odd or
// both even. The bar's content box is 41px (42 less the rule), so controls are odd.
const BADGE = "homestead.github.attention";
const REPO_RECHECK = 180000;
const BUTTON = 27;
const ICON = 15;
const EDGE = 10;

// The layout is the registry: every extra child of panel-body gets a button.
// Files and Changes already have theirs in the shipped tab bar.
const extraPanels = () =>
  (node("panel-body")?.children ?? []).filter((c) => c.id !== "files" && c.id !== "changes");

const panelLabel = (c) => c.content?.props?.panel?.label ?? c.id[0].toUpperCase() + c.id.slice(1);
const panelIcon = (c) => c.content?.props?.panel?.icon ?? "panel";
const panelBadge = (c) => Number(shared(c.content?.props?.panel?.badge) ?? 0);

function togglePanel(id) {
  const open = !node("panel")?.hidden && node("panel-body")?.active === id;
  if (open) return run("layout.hide", { id: "panel" });
  run("layout.select", { stack: "panel-body", child: id });
  run("layout.show", { id: "panel" });
}

function setView(id) {
  if (id === "agent") {
    const agent = agents().find((a) => a.focused) ?? byUrgency(agents())[0];
    if (!agent) return notify({ title: "No agents running", body: "Start one from the + menu.", timeout: 3000 });
    run("agent.focus", { terminal: agent.address });
  }
  run("layout.select", { stack: "view", child: id });
}

function nextNeeding() {
  const list = needing();
  if (!list.length) return notify({ title: "Nobody needs you", timeout: 2000 });
  const here = list.findIndex((a) => a.focused);
  run("agent.focus", { terminal: list[(here + 1) % list.length].address });
  showTabs();
}

export class Bar {
  constructor(cx) {
    this.inboxPx = null;
    this.width = null;
    this.takeover = null;
    this.micro = null;
    this.rail = null;
    this.footer = null;
    // An overlay never outlives the app, so an id left from last time means nothing.
    if (shared("homestead.overview")) setShared("homestead.overview", null);
    // The inbox owns urgency, so the agents list starts grouped by space instead of
    // repeating it. Only a first default: the list's own menu still changes it.
    if (shared("agents.sort") == null) setShared("agents.sort", "grouped");
    // Herdr starts a panel's code the first time it shows, so a badge for a closed
    // panel has to live here. A new folder checks at once, the same one every 3 min.
    this.repo = null;
    this.repoAt = 0;
    cx.timer.every(2000, (cx) => this.watchRepo(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.command(command);
        cx.notify();
      }
    });
  }

  watchRepo(cx) {
    const place = repoPlace();
    if (!place || window()?.active === false) return;
    if (place.cwd === this.repo && Date.now() - this.repoAt < REPO_RECHECK) return;
    this.repo = place.cwd;
    this.repoAt = Date.now();
    cx.spawn(async () => {
      const count = await attentionAt(place);
      if (place.cwd === this.repo && (shared(BADGE) ?? 0) !== count) setShared(BADGE, count);
    });
  }

  command(name) {
    if (name === "agent") return setView(node("view")?.active === "agent" ? "main" : "agent");
    if (name === "fleet") return overviewOpen() ? closeOverview() : openOverview();
    if (name === "next") return nextNeeding();
    if (name === "zen") return setShared("homestead.zen", !shared("homestead.zen"));
    if (name === "files" || name === "changes" || extraPanels().some((c) => c.id === name)) togglePanel(name);
  }

  // Hidden blocks may not render, so the inbox can't size itself: it would never
  // come back. This copy is always shown.
  syncInbox(list, rail) {
    const want = rail ? 0 : inboxHeight(list, inboxRows(shared("homestead.height")));
    if (want === this.inboxPx) return;
    this.inboxPx = want;
    if (want) run("layout.resize", { id: "inbox", px: want });
    run(want ? "layout.show" : "layout.hide", { id: "inbox" });
  }

  // The sidebar folds by its width, so a drag counts too: below the shipped lists'
  // own rail width, the one-column rail takes over from them.
  syncRail(rail) {
    const footer = !rail && showsFooter(shared("homestead.height"));
    if (footer !== this.footer) {
      this.footer = footer;
      run(footer ? "layout.show" : "layout.hide", { id: "sidebar-footer" });
    }
    if (rail === this.rail) return;
    this.rail = rail;
    run(rail ? "layout.hide" : "layout.show", { id: "sidebar-lists" });
    run(rail ? "layout.show" : "layout.hide", { id: "rail" });
  }

  // The agent block keeps the keyboard, so a new shell would land where nobody
  // sees it. Whatever moves focus off an agent brings the tabs back.
  syncView() {
    if (node("view")?.active !== "agent") return;
    const pane = panes().find((p) => p.pane === focused()?.pane);
    if (!agents().length || (pane && !pane.status)) showTabs();
  }

  // Too narrow for two columns, the panel gets the whole work area, as a phone
  // would show one screen at a time.
  syncTakeover(tier, panelOpen) {
    const takeover = panelOpen && (tier === "solo" || tier === "micro");
    if (takeover === this.takeover) return;
    const starting = this.takeover === null;
    this.takeover = takeover;
    if (takeover) this.panelPx = node("panel")?.size?.px ?? null;
    if (starting && !takeover) {
      if (node("view")?.hidden) run("layout.show", { id: "view" });
      return;
    }
    run(takeover ? "layout.hide" : "layout.show", { id: "view" });
    const limit = panelLimit(tier);
    const px = Math.min(this.panelPx ?? 368, limit || 368);
    run("layout.resize", takeover ? { id: "panel", weight: 1 } : { id: "panel", px });
  }

  // Measured, never estimated: labels change with the font and the zoom.
  fit(width) {
    const want = Math.ceil(width / zoom()) + EDGE;
    if (want === this.width || this.micro) return;
    this.width = want;
    run("layout.resize", { id: "bar", px: want });
  }

  // Below the micro width the shipped tab bar has no room for the active tab, so
  // the fit rules hide it and this bar fills the row with the same tab pill.
  syncMicro(micro) {
    if (micro === this.micro) return;
    this.micro = micro;
    this.width = null;
    if (micro) run("layout.resize", { id: "bar", weight: 1 });
  }

  microTab(t) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((c) => c.active);
    if (!tab) return div().flex_1();
    const inTab = panes().filter((p) => p.tab === tab.id);
    const program = (inTab.find((p) => p.program?.agent) ?? inTab[0])?.program;
    const name = tab.named ? tab.name : program?.name ?? "Terminal";
    const many = space.tabs.length > 1;
    return h_flex().id("hs-micro-tab").flex_1().min_w(0).h(29).px(10).gap(7).items_center().rounded(7).text_size(fitText(13))
      .border(1).border_color(t.border).bg(t.raised).text_color(t.foreground).hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stopPress).on_click(() => { if (many) run("tab.next"); })
      .on_scroll_wheel((e) => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(programIcon(t, program))
      .child(div().flex_1().min_w(0).truncate().child(name))
      .when(many, (el) => el.child(div().flex_none().text_size(fitText(12)).text_color(t.muted).child(`${tab.index}/${space.tabs.length}`)))
      .when(tab.status === "working" || tab.status === "blocked" || tab.status === "done", (el) => el.child(tab.status === "working" ? paneStatus(t, "working") : div().size(6).flex_none().rounded(3).bg(t[tab.status])));
  }

  // With a panel filling a micro window, the pill names it and offers the way back.
  microPanel(t) {
    const active = node("panel-body")?.active ?? "files";
    const child = extraPanels().find((c) => c.id === active);
    const name = child ? panelLabel(child) : active[0].toUpperCase() + active.slice(1);
    return h_flex().id("hs-micro-panel").flex_1().min_w(0).h(29).px(10).gap(7).items_center().rounded(7).text_size(fitText(13))
      .border(1).border_color(t.border).bg(t.raised).text_color(t.foreground)
      .on_mouse_down("left", stopPress)
      .child(div().flex_1().min_w(0).truncate().child(name))
      .child(div().id("hs-micro-close").flex_none().text_color(t.muted).hover((s) => s.text_color(t.foreground))
        .on_mouse_down("left", stopPress).on_click(() => run("layout.hide", { id: "panel" }))
        .child(icon("close", ICON)));
  }

  renderMicro(t, pill, exit, overview, panelOpen) {
    const root = layout();
    const w = window();
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? (root.traffic_lights[0] + 64) / zoom() : EDGE;
    const plus = div().id("hs-micro-new").size(BUTTON).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stopPress)
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child(icon("plus", ICON));
    return h_flex().id("hs-bar").size_full().min_w(0).pl(lights).pr(EDGE).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(panelOpen ? this.microPanel(t) : this.microTab(t))
      .when(Boolean(exit), (el) => el.child(exit)).child(plus).when(Boolean(pill), (el) => el.child(pill)).child(overview);
  }

  render() {
    const t = theme();
    const tier = shared("homestead.width") ?? "full";
    const view = node("view")?.active ?? "main";
    const list = needing();
    const blocked = list.filter((a) => a.status === "blocked");
    const body = node("panel-body");
    const panelOpen = !node("panel")?.hidden;
    const extras = extraPanels();
    const showLabel = showsLabels(tier);
    const showPill = Boolean(node("sidebar")?.hidden) && blocked.length > 0;
    // On the smallest windows the active tab needs the room: the extra panels
    // and the Agent view stay on the Shortcuts list.
    const micro = tier === "micro";
    const panelButtons = micro ? [] : extras;
    const zen = Boolean(shared("homestead.zen"));

    const rail = (node("sidebar")?.size?.px ?? 268) < 160;
    this.syncRail(rail);
    this.syncInbox(list, rail);
    this.syncView();
    this.syncTakeover(tier, panelOpen);
    this.syncMicro(micro);
    // Panels outside workspace.panels would close on every space switch.
    const remembered = shared("workspace.panels") ?? ["files", "changes"];
    const missing = extras.map((c) => c.id).filter((id) => !remembered.includes(id));
    if (missing.length) setShared("workspace.panels", [...remembered, ...missing]);

    // Labels when there is room; otherwise icons that name themselves on hover.
    const button = (id, label, glyph, on, action, badge = 0) => h_flex().id(id).relative().h(BUTTON).flex_none().gap(5).items_center().justify_center().rounded(6).text_size(fitText(12))
      .when(showLabel, (el) => el.px(8)).when(!showLabel, (el) => el.w(BUTTON).tooltip(label))
      .bg(on ? t.selected : "#00000000").text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stopPress).on_click(action)
      .child(icon(glyph, ICON)).when(showLabel, (el) => el.child(label))
      .when(showLabel && badge > 0, (el) => el.child(div().text_color(t.blocked).child(String(badge))))
      .when(!showLabel && badge > 0, (el) => el.child(div().absolute().right(3).top(3).size(6).rounded(3).bg(t.blocked)));

    const views = h_flex().id("hs-views").h(BUTTON + 4).flex_none().p(2).gap(2).items_center().rounded(8).bg(t.hover)
      .children(VIEWS.map((v) => button(`hs-view-${v.id}`, v.label, v.glyph, view === v.id, () => setView(v.id))));
    const overview = button("hs-overview", "Overview", "fleet", false, openOverview);

    const panelButton = (c) => button(`hs-panel-${c.id}`, panelLabel(c), panelIcon(c), panelOpen && body?.active === c.id, () => togglePanel(c.id), panelBadge(c));

    const pill = showPill ? h_flex().id("hs-needs").h(BUTTON).flex_none().px(8).gap(5).items_center().rounded(6).bg(alert(t).chip).text_size(fitText(12)).font_semibold().text_color(t.foreground)
      .on_mouse_down("left", stopPress).on_click(nextNeeding).child(div().font_bold().text_color(t.blocked).child("!"))
      .child(micro ? String(blocked.length) : `${blocked.length} ${blocked.length === 1 ? "needs" : "need"} you`) : null;

    // Focus mode is a mode, so it shows, and its way out is one click away.
    const exit = zen ? div().id("hs-exit-focus").h(BUTTON).flex_none().px(8).flex().items_center().rounded(6).text_size(fitText(12)).text_color(t.foreground).bg(t.hover)
      .hover((s) => s.bg(t.selected)).on_mouse_down("left", stopPress).on_click(() => setShared("homestead.zen", false)).child("Exit focus") : null;

    if (micro) return this.renderMicro(t, pill, exit, overview, panelOpen);

    return h_flex().id("hs-bar").size_full().min_w(0).pr(EDGE).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("hs-bar-items").flex_none().gap(EDGE).items_center()
        .on_size_change((size) => this.fit(size.width))
        .when(Boolean(exit), (el) => el.child(exit))
        .when(Boolean(pill), (el) => el.child(pill))
        .when(panelButtons.length > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center().children(panelButtons.map(panelButton))))
        .child(views)
        .child(overview));
  }
}
