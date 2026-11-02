// Every Homestead action in one place, with its key. Reading it replaces having to
// remember, and each row also runs the action, so nothing is keyboard-only.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, keys, props, run, theme, window } from "herdr";
import { fit } from "./lib.js";

const ACTIONS = [
  { action: "homestead.fleet", label: "Overview of all agents" },
  { action: "homestead.agent", label: "One agent, full size" },
  { action: "homestead.next", label: "Next agent that needs you" },
  { action: "homestead.zen", label: "Focus mode" },
  { action: "homestead.files", label: "Files" },
  { action: "homestead.changes", label: "Changes" },
  { action: "homestead.github", label: "GitHub" },
  { action: "app.palette", label: "All commands" },
];

const keyLabel = (action) => {
  const mac = window()?.platform === "macos";
  const names = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+" };
  const bound = keys().find((k) => k.action === action);
  return bound?.keys.split("-").map((p) => names[p.toLowerCase()] ?? p.toUpperCase()).join("") ?? "";
};

export class Help {
  row(t, item) {
    return h_flex().id(`hs-help-${item.action}`).h(32).flex_none().px(8).gap(12).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        closeOverlay(props().overlay);
        run(item.action);
      })
      .child(div().flex_1().min_w(0).truncate().text_size(fit(13)).text_color(t.foreground).child(item.label))
      .child(div().flex_none().text_size(fit(12)).text_color(t.muted).child(keyLabel(item.action)));
  }

  render() {
    const t = theme();
    return v_flex().id("hs-help").size_full().min_h(0).p(6).bg(t.popover)
      .child(div().h(32).flex_none().px(8).flex().items_center().text_size(fit(12)).text_color(t.muted).child("Shortcuts"))
      .children(ACTIONS.map((item) => this.row(t, item)));
  }
}
