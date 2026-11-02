// The folded sidebar. One column on one center line: every cell is the same box,
// and status always sits in the same corner, so spaces, agents and actions line up.
// Agents come by urgency, so whoever needs you is always at the top of their group.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, openOverlay, run, setShared, shared, spaces, theme } from "herdr";
import { byUrgency, mark, openAgent, programIcon } from "./lib.js";

const CELL_W = 36;
const CELL_H = 32;
const TILE = 20;
const GAP = 2;
const BADGE = 14;

// The expanded spaces list colors its tiles this way, so a space keeps its color
// when the sidebar folds. space.colors holds the key; a person may store a hex.
const TILE_FILL = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

const firstLetter = (name) => {
  const text = (name ?? "").trim();
  if (!text) return "?";
  return [...text][0].toUpperCase();
};

const unfold = () => {
  setShared("sidebar.collapsed", false);
  run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 });
};

export class Rail {
  cell(t, id, selected, action, content, status) {
    return div().id(id).relative().w(CELL_W).h(CELL_H).flex_none().flex().items_center().justify_center().rounded(8).cursor_pointer()
      .bg(selected ? t.selected : t.chrome).text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(action)
      .child(content)
      .when(Boolean(status) && status !== "idle", (el) => el.child(
        div().absolute().right(1).bottom(1).size(BADGE).flex().items_center().justify_center().rounded(5).bg(t.chrome).child(mark(t, status))));
  }

  tile(t, space) {
    const color = shared("space.colors")?.[space.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : TILE_FILL[color] ?? t[color];
    return div().size(TILE).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(fill).text_size(11).font_bold().text_color("#ffffff").child(firstLetter(space.name));
  }

  action(t, id, icon, handler) {
    return this.cell(t, id, false, handler, svg(`mods/homestead/${icon}.svg`).size(15));
  }

  render() {
    const t = theme();
    const list = byUrgency(agents());
    const rule = () => div().w(24).h(1).my(6).flex_none().bg(t.border);
    return v_flex().id("hs-rail").size_full().min_h(0).items_center().bg(t.chrome)
      .child(v_flex().id("hs-rail-list").flex_1().min_h(0).w_full().items_center().gap(GAP).overflow_y_scroll()
        .children(spaces().map((s) => this.cell(t, `hs-rail-space-${s.id}`, s.active, () => run("space.select", { id: s.id }), this.tile(t, s), s.status)))
        .when(list.length > 0, (el) => el.child(rule()))
        .children(list.map((a) => this.cell(t, `hs-rail-agent-${a.address}`, a.focused, () => openAgent(a), programIcon(t, a.program, 16), a.status))))
      .child(rule())
      .child(v_flex().flex_none().items_center().gap(GAP).pb(8)
        .child(this.action(t, "hs-rail-new", "plus", () => run("space.new")))
        .child(this.action(t, "hs-rail-settings", "settings", () => run("app.settings")))
        .child(this.action(t, "hs-rail-unfold", "unfold", unfold)));
  }
}
