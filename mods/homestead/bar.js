// Sits beside the shipped tab bar instead of replacing it, so that bar keeps
// getting Herdr's updates. Owns what must run while everything else is hidden:
// the view switch, the extra panel buttons, the inbox's size and the key commands.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, focused, layout, nextCommand, notify, openOverlay, panes, run, setShared, shared, spaces, theme, window } from "herdr";
import { inboxRows, panelLimit, showsFooter } from "./fit.js";
import { HEAD, PAD, ROW } from "./inbox.js";
import { alert, byUrgency, needing, node, paneStatus, programIcon, showTabs, stopPress, zoom } from "./lib.js";

const VIEWS = [
  { id: "main", icon: "mods/homestead/tabs.svg" },
  { id: "agent", icon: "mods/homestead/agent.svg" },
  { id: "fleet", icon: "mods/homestead/fleet.svg" },
];

const BUTTON = 26;
const EDGE = 10;

// The layout is the registry: every extra child of panel-body gets a button.
// Files and Changes already have theirs in the shipped tab bar.
const extraPanels = () =>
  (node("panel-body")?.children ?? []).filter((c) => c.id !== "files" && c.id !== "changes");

const panelLabel = (c) => c.content?.props?.panel?.label ?? c.id[0].toUpperCase() + c.id.slice(1);
const panelIcon = (c) => c.content?.props?.panel?.icon ?? "mods/homestead/panel.svg";

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
    // The inbox owns urgency, so the agents list starts grouped by space instead of
    // repeating it. Only a first default: the list's own menu still changes it.
    if (shared("agents.sort") == null) setShared("agents.sort", "grouped");
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.command(command);
        cx.notify();
      }
    });
  }

  command(name) {
    if (name === "agent") return setView(node("view")?.active === "agent" ? "main" : "agent");
    if (name === "fleet") return setView(node("view")?.active === "fleet" ? "main" : "fleet");
    if (name === "next") return nextNeeding();
    if (name === "zen") return setShared("homestead.zen", !shared("homestead.zen"));
    if (name === "files" || name === "changes" || extraPanels().some((c) => c.id === name)) togglePanel(name);
  }

  // Hidden blocks may not render, so the inbox can't size itself: it would never
  // come back. This copy is always shown.
  syncInbox(count, rail) {
    const rows = rail ? 0 : Math.min(count, inboxRows(shared("homestead.height")));
    const want = rows ? HEAD + rows * ROW + PAD + 1 : 0;
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
    return h_flex().id("hs-micro-tab").flex_1().min_w(0).h(29).px(10).gap(7).items_center().rounded(7).text_size(12.8)
      .border(1).border_color(t.border).bg(t.raised).text_color(t.foreground).hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stopPress).on_click(() => { if (many) run("tab.next"); })
      .on_scroll_wheel((e) => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(programIcon(t, program))
      .child(div().flex_1().min_w(0).truncate().child(name))
      .when(many, (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child(`${tab.index}/${space.tabs.length}`)))
      .when(tab.status === "working" || tab.status === "blocked" || tab.status === "done", (el) => el.child(tab.status === "working" ? paneStatus(t, "working") : div().size(6).flex_none().rounded(3).bg(t[tab.status])));
  }

  renderMicro(t, pill, segment) {
    const root = layout();
    const w = window();
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? (root.traffic_lights[0] + 64) / zoom() : EDGE;
    const plus = div().id("hs-micro-new").size(BUTTON).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stopPress)
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child(svg("mods/homestead/plus.svg").size(14));
    return h_flex().id("hs-bar").size_full().min_w(0).pl(lights).pr(EDGE).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(this.microTab(t)).child(plus).when(Boolean(pill), (el) => el.child(pill)).child(segment);
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
    const showLabel = tier === "full";
    const showPill = Boolean(node("sidebar")?.hidden) && blocked.length > 0;
    // On the smallest windows the active tab needs the room: one button steps
    // through the views and the extra panels stay on their keys.
    const micro = tier === "micro";
    const views = micro ? VIEWS.filter((v) => v.id === view) : VIEWS;
    const panelButtons = micro ? [] : extras;

    const rail = (node("sidebar")?.size?.px ?? 268) < 160;
    this.syncRail(rail);
    this.syncInbox(list.length, rail);
    this.syncView();
    this.syncTakeover(tier, panelOpen);
    this.syncMicro(micro);
    // Panels outside workspace.panels would close on every space switch.
    const remembered = shared("workspace.panels") ?? ["files", "changes"];
    const missing = extras.map((c) => c.id).filter((id) => !remembered.includes(id));
    if (missing.length) setShared("workspace.panels", [...remembered, ...missing]);

    const nextView = VIEWS[(VIEWS.findIndex((v) => v.id === view) + 1) % VIEWS.length].id;
    const segment = ({ id, icon }) => div().id(`hs-view-${id}`).size(BUTTON).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(view === id && !micro ? t.selected : t.chrome).text_color(view === id ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stopPress).on_click(() => setView(micro ? nextView : id))
      .child(svg(icon).size(14));

    const panelButton = (c) => {
      const on = panelOpen && body?.active === c.id;
      return h_flex().id(`hs-panel-${c.id}`).h(BUTTON).flex_none().gap(5).items_center().justify_center().rounded(6).text_size(12)
        .when(showLabel, (el) => el.px(8)).when(!showLabel, (el) => el.w(BUTTON))
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stopPress).on_click(() => togglePanel(c.id))
        .child(svg(panelIcon(c)).size(14)).when(showLabel, (el) => el.child(panelLabel(c)));
    };

    const pill = showPill ? h_flex().id("hs-needs").h(BUTTON).flex_none().px(8).gap(5).items_center().rounded(6).bg(alert(t).chip).text_size(12).font_semibold().text_color(t.foreground)
      .on_mouse_down("left", stopPress).on_click(nextNeeding).child(div().font_bold().text_color(t.blocked).child("!")).child(String(blocked.length)) : null;

    if (micro) return this.renderMicro(t, pill, segment(views[0]));

    return h_flex().id("hs-bar").size_full().min_w(0).pr(EDGE).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("hs-bar-items").flex_none().gap(EDGE).items_center()
        .on_size_change((size) => this.fit(size.width))
        .when(Boolean(pill), (el) => el.child(pill))
        .when(panelButtons.length > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center().children(panelButtons.map(panelButton))))
        .child(h_flex().flex_none().gap(1).items_center().children(views.map(segment))));
  }
}
