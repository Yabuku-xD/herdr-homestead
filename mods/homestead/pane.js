// Each pane's 30px header. Focus shows here, as an accent line under the header of
// the focused pane, and only when the tab is split: with one pane there is nothing
// to tell apart, so a card stays quiet instead of wearing a bright outline.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { home, panes, props, run, theme } from "herdr";
import { paneStatus, programIcon } from "./lib.js";

const folder = (cwd) => {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(`${h}/`) ? `~${cwd.slice(h.length)}` : cwd;
};

export class Pane {
  constructor() {
    this.hovered = false;
  }

  button(t, id, icon, command, args) {
    return div().id(id).size(21).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/homestead/${icon}.svg`).size(15));
  }

  render() {
    const t = theme();
    const all = panes();
    const p = all.find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const split = all.filter((x) => x.tab === p.tab).length > 1 && !p.zoomed;
    const showing = p.focused && split;
    return h_flex().id(`hs-pane-${pane}`).size_full().min_w(0).px(10).gap(8).items_center().bg(t.background)
      .border_b(1).border_color(showing ? t.accent : t.border).text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(programIcon(t, p.program, 15))
      .child(div().flex_none().max_w(260).truncate().font_medium().text_color(p.focused ? t.foreground : t.muted).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(folder(p.cwd)))
      .child(paneStatus(t, p.status))
      .when(this.hovered, (el) => el
        .child(this.button(t, `hs-pr-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `hs-pd-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `hs-pz-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `hs-px-${pane}`, "close", "pane.close", { pane })));
  }
}
