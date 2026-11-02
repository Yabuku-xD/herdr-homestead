// The Agent view's header: the same 30px strip as the shipped pane header, so the
// view reads as that pane, full size.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, focused, spaces, theme } from "herdr";
import { agentName, fit, paneStatus, programIcon } from "./lib.js";

export class AgentHead {
  render() {
    const t = theme();
    const list = agents();
    const a = list.find((x) => x.address === focused()?.agent) ?? list.find((x) => x.focused);
    if (!a) return div().size_full().bg(t.background);
    const space = spaces().find((s) => s.id === a.space);
    return h_flex().size_full().px(10).gap(8).items_center().bg(t.background).border_b(1).border_color(t.border).text_size(fit(12))
      .child(programIcon(t, a.program, 15))
      .child(div().flex_none().max_w(260).truncate().font_medium().text_color(t.foreground).child(agentName(a)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(space?.name ?? ""))
      .child(paneStatus(t, a.status));
  }
}
