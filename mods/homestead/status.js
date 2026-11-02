// The status bar: where you are on the left, Shortcuts and this computer's load on
// the right. Who needs you is the inbox's and the top bar's job, not repeated here.
// Load is per core and labeled as load: a load average is not a CPU percentage.
// The left side yields first.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, exec, openOverlay, shared, spaces, theme, window } from "herdr";
import { showsMeters } from "./fit.js";

const POLL = 15000;

const SCRIPT = `
if [ "$(uname)" = Darwin ]; then
  sysctl -n vm.loadavg hw.ncpu hw.memsize hw.pagesize
  vm_stat | awk '/Pages (active|wired down|occupied by compressor)/ { gsub(/\\./, "", $NF); sum += $NF } END { print sum }'
else
  cut -d' ' -f1 /proc/loadavg; nproc
  awk '/MemTotal/ { t = $2 } /MemAvailable/ { a = $2 } END { print t * 1024; print 1; print (t - a) * 1024 }' /proc/meminfo
fi`;

const parse = (out) => {
  const [load, cores, total, page, used] = out.trim().split("\n").map((l) => parseFloat(l.replace(/[{}]/g, "").trim()));
  if (![load, cores, total, page, used].every(Number.isFinite)) return null;
  return { load: load / cores, memory: (used * page) / total };
};

export class Status {
  constructor(cx) {
    this.value = null;
    cx.timer.every(POLL, (cx) => { if (window()?.active) this.poll(cx); });
    this.poll(cx);
  }

  poll(cx) {
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", ["-c", SCRIPT]);
        this.value = result.code === 0 ? parse(result.stdout) : null;
      } catch { this.value = null; }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const tier = shared("homestead.width") ?? "full";
    const space = spaces().find((s) => s.active);
    const list = agents();
    const count = list.length;
    const meter = (name, value, hot) => h_flex().flex_none().gap(4).items_center()
      .child(div().child(name)).child(div().w(26).text_right().text_color(hot ? t.blocked : t.muted).child(`${Math.round(value * 100)}%`));
    const place = (icon, text) => h_flex().flex_none().max_w(180).gap(6).items_center()
      .child(svg(icon).size(13).flex_none()).child(div().min_w(0).truncate().child(text));
    const v = showsMeters(tier) ? this.value : null;
    const compact = tier === "micro";
    return h_flex().id("hs-status").size_full().min_w(0).px(14).gap(16).items_center().bg(t.chrome).text_size(12).text_color(t.muted)
      .child(h_flex().flex_1().min_w(0).gap(16).items_center()
        .when(!compact, (el) => el.child(place(space?.machine ? "mods/homestead/server.svg" : "mods/homestead/monitor.svg", space?.machine ?? "This computer")))
        .when(!compact && Boolean(space?.branch), (el) => el.child(h_flex().flex_1().min_w(0).max_w(220).gap(6).items_center()
          .child(svg("mods/homestead/branch.svg").size(13).flex_none()).child(div().min_w(0).truncate().child(space.branch))))
        .child(div().flex_none().child(`${count} ${count === 1 ? "agent" : "agents"}`)))
      .child(div().id("hs-shortcuts").flex_none().cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click(() => openOverlay({ mod: "homestead", kind: "dialog", width: 360, height: 308, props: { role: "help" } })).child("Shortcuts"))
      .when(Boolean(v), (el) => el.child(h_flex().flex_none().gap(12).items_center()
        .child(meter("Load", v.load, v.load > 1)).child(meter("Mem", v.memory, v.memory > 0.9))));
  }
}
