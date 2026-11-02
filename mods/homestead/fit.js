// The window's responsive rules. A layout has no media queries, so two 0px blocks
// measure the window, and each breakpoint crossing edits the layout once.
// Change a row here to change how the whole window adapts.

import { div } from "gpui-kit";
import { props, run, setShared, shared, window } from "herdr";
import { node, zoom } from "./lib.js";

// `full` starts where a 268px sidebar still leaves an 80-column terminal, which also
// fits a 1080px portrait monitor. Bar labels need the wider tier.
const WIDTH = [
  { tier: "wide", min: 1240, sidebar: "open", panel: 368, meters: true, tabs: true, labels: true },
  { tier: "full", min: 960, sidebar: "open", panel: 320, meters: true, tabs: true, labels: false },
  { tier: "rail", min: 720, sidebar: "rail", panel: 300, meters: true, tabs: true, labels: false },
  { tier: "solo", min: 560, sidebar: "hidden", panel: 0, meters: false, tabs: true, labels: false },
  { tier: "micro", min: 0, sidebar: "hidden", panel: 0, meters: false, tabs: false, labels: false },
];

// `inbox`: how many rows show before the list scrolls; the bar reads it.
const HEIGHT = [
  { tier: "tall", min: 720, footer: true, status: true, inbox: 4 },
  { tier: "medium", min: 560, footer: true, status: true, inbox: 3 },
  { tier: "short", min: 400, footer: false, status: true, inbox: 2 },
  { tier: "tiny", min: 0, footer: false, status: false, inbox: 1 },
];

export const inboxRows = (tier) => HEIGHT.find((row) => row.tier === tier)?.inbox ?? HEIGHT[0].inbox;
export const showsFooter = (tier) => HEIGHT.find((row) => row.tier === tier)?.footer ?? true;
export const showsLabels = (tier) => WIDTH.find((row) => row.tier === tier)?.labels ?? true;
export const showsMeters = (tier) => WIDTH.find((row) => row.tier === tier)?.meters ?? false;
export const panelLimit = (tier) => WIDTH.find((row) => row.tier === tier)?.panel ?? 0;

const pick = (rows, size) => rows.find((row) => size >= row.min);
const toggle = (id, shown) => run(shown ? "layout.show" : "layout.hide", { id });

function setSidebar(state) {
  const sidebar = node("sidebar");
  const px = sidebar?.size?.px ?? 268;
  if (state === "hidden") return toggle("sidebar", false);
  if (sidebar?.hidden) toggle("sidebar", true);
  // Same keys as the shipped fold button, so its » and our rail agree.
  if (state === "rail" && px >= 160) {
    setShared("sidebar.width", px);
    setShared("sidebar.collapsed", true);
    run("layout.resize", { id: "sidebar", px: window()?.platform === "macos" ? 76 : 44 });
  }
  if (state === "open" && px < 160) {
    setShared("sidebar.collapsed", false);
    run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 });
  }
}

export class Fit {
  constructor() {
    this.axis = props()?.axis ?? "x";
    this.rows = this.axis === "x" ? WIDTH : HEIGHT;
    this.current = null;
    this.zen = false;
    this.applied = false;
  }

  // The panel gives way on small windows and comes back when there is room.
  setPanel(limit) {
    const panel = node("panel");
    if (!panel) return;
    if (!limit) {
      this.panelWasOpen = this.panelWasOpen || !panel.hidden;
      if (!panel.hidden) toggle("panel", false);
      return;
    }
    if ((panel.size?.px ?? 0) > limit) {
      this.panelPx ??= panel.size.px;
      run("layout.resize", { id: "panel", px: limit });
    } else if (this.panelPx && this.panelPx <= limit) {
      run("layout.resize", { id: "panel", px: this.panelPx });
      this.panelPx = null;
    }
    if (this.panelWasOpen) {
      this.panelWasOpen = false;
      toggle("panel", true);
    }
  }

  apply(row, zen, previous) {
    if (this.axis === "x") {
      setSidebar(zen ? "hidden" : row.sidebar);
      // Between two small tiers a panel someone opened stays open.
      if (zen !== this.applied || row.panel || previous?.panel) this.setPanel(zen ? 0 : row.panel);
      this.applied = zen;
      toggle("tabs", row.tabs);
      setShared("homestead.width", row.tier);
    } else {
      toggle("status", row.status && !zen);
      setShared("homestead.height", row.tier);
    }
  }

  // Acts only on a crossing, or the first measure, so a drag between breakpoints
  // stays the person's: the rules never fight a sidebar they resized.
  update(size) {
    this.size = size;
    const measured = (this.axis === "x" ? size.width : size.height) / zoom();
    const row = pick(this.rows, measured);
    const zen = Boolean(shared("homestead.zen"));
    if (row === this.current && zen === this.zen) return;
    const previous = this.current;
    this.current = row;
    this.zen = zen;
    this.apply(row, zen, previous);
  }

  render() {
    // Zoom changes what the window measures without resizing it, and fires no event.
    if (this.size) this.update(this.size);
    const zen = Boolean(shared("homestead.zen"));
    if (this.current && zen !== this.zen) {
      this.zen = zen;
      this.apply(this.current, zen, this.current);
    }
    return div().id("hs-fit").size_full().on_size_change((size) => this.update(size));
  }
}
