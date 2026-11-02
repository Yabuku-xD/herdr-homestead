import { div, image, svg } from "gpui-kit";
import { agents, layout, run, settings, spaces, terminals } from "herdr";

export const find = (node, id) => {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
};

export const node = (id) => find(layout(), id);
export const zoom = () => settings()?.zoom ?? 1;

// Herdr zoom scales everything, so a whole size at 100% lands between pixels at 110%.
// These pick the nearest size that is whole once zoomed, so text and icons stay
// crisp on 1x screens at any zoom. Retina screens only get finer.
export const fit = (px) => Math.max(1, Math.round(px * zoom())) / zoom();

const ICON_MIN = 11;
const ICON_MAX = 23;

// Icons come drawn for each rendered size (tools/icons.py). A name with a slash is
// any other SVG, for a panel that brings its own.
export const icon = (name, size) => {
  if (name.includes("/")) return svg(name).size(fit(size)).flex_none();
  const scaled = Math.round(size * zoom());
  const odd = scaled % 2 ? scaled : scaled + 1;
  const drawn = Math.min(ICON_MAX, Math.max(ICON_MIN, odd));
  return svg(`mods/homestead/icons/${name}-${drawn}.svg`).size(odd / zoom()).flex_none();
};

// Every press inside a window_drag block must stop, or it moves the window.
export const stopPress = (_e, cx) => cx.stop_propagation();

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };

const tabOf = (agent) => spaces().find((s) => s.id === agent.space)?.tabs.find((t) => t.id === agent.tab);

// Times are the tab's: Herdr keeps no per-agent clock.
export const since = (agent) => {
  const tab = tabOf(agent);
  return agent.status === "working" ? tab?.working_since ?? null : tab?.changed_at ?? null;
};

export const ago = (ms) => {
  if (!ms) return "";
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

// A title is telling unless it is a path, a shell prompt or the program's own name.
export const agentName = (agent) => {
  const tab = tabOf(agent);
  if (tab?.named) return tab.name;
  const title = (agent.title ?? "").trim();
  const dull = !title || /^[~/]/.test(title) || title.includes("@") || title === agent.program?.name;
  return dull ? agent.program?.name ?? "Agent" : title;
};

// Agents by urgency, then the longest wait first, so the list reads as a queue.
export const byUrgency = (list) =>
  [...list].sort((a, b) => RANK[a.status] - RANK[b.status] || (since(a) ?? Infinity) - (since(b) ?? Infinity));

export const needing = () => byUrgency(agents().filter((a) => a.status === "blocked" || a.status === "done"));

// Claude Code can put notes before the ask, joined by " · ", and the ask itself may
// hold that separator: "… hook failed · answer: Which one? (Red · Blue)". So it reads
// from the first ask word onward, never from the last separator.
const ASK = /(?:^| · )((?:approve|answer|allow|confirm|choose|select)\b.*)$/i;

export const message = (agent) => {
  const text = terminals().find((t) => t.address === agent.address)?.report?.msg;
  if (typeof text !== "string") return "";
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const ask = (ASK.exec(line)?.[1] ?? line).replace(/^answer:\s*/i, "");
  return ask ? ask[0].toUpperCase() + ask.slice(1) : "";
};

// The last line on screen that asks something, for agents that don't report it.
export const question = (text) => (text ?? "").split("\n").map((l) => l.replace(/^[\s│|>❯●•*-]+/, "").trim()).reverse()
  .find((l) => l.length > 8 && l.endsWith("?")) ?? "";

export const showTabs = () => run("layout.select", { stack: "view", child: "main" });

export const openAgent = (agent) => {
  run("agent.focus", { terminal: agent.address });
  showTabs();
};

// Alert roles over theme(), so no component holds an alpha literal. `fill` is the
// strongest tint where `muted` text still measures 4.5:1 on every shipped theme
// (paper sets the limit), so hover changes the edge, not the fill. Dim text fails
// on it: only `muted` and `foreground` sit on an alert surface.
export const alert = (t) => ({ fill: t.blocked + "0c", chip: t.blocked + "26", edge: t.blocked + "66" });

// Status marks, the same 14px as the shipped agents list at every size. Shape as
// well as color, so status never rests on color alone.
export const mark = (t, status) => {
  const box = div().size(14).flex_none().flex().items_center().justify_center();
  if (status === "working") return box.child(svg("mods/homestead/spinner.svg").size(fit(12)).text_color(t.working).spin(900));
  if (status === "blocked") return box.rounded(4).bg(alert(t).chip).text_size(fit(11)).font_bold().text_color(t.blocked).child("!");
  if (status === "done") return box.child(div().size(7).rounded(4).bg(t.done));
  return box.child(div().size(7).rounded(4).border(1.5).border_color(t.idle ?? t.dim));
};

// The status at the end of a pane header, as the shipped pane mod draws it.
export const paneStatus = (t, status) => {
  if (status === "working") return svg("mods/homestead/spinner.svg").size(fit(13)).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") return div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(alert(t).chip).text_size(fit(11)).font_semibold().text_color(t.blocked).child("Needs you");
  if (status === "done") return div().size(7).flex_none().rounded(4).bg(t.done);
  return div().flex_none();
};

export const programIcon = (t, program, size = 14) => {
  const fitted = fit(size);
  if (!program?.icon) return div().size(fitted).flex_none();
  return program.tint
    ? svg(program.icon).size(fitted).flex_none().text_color(t.muted)
    : image(program.icon).size(fitted).flex_none();
};
