// One mod, many roles: mods can't import each other's files, so everything that
// shares helpers lives here and the layout picks a role with props.role.
// `check` passes null props, so an unknown role falls back to the fleet.

import { View, div } from "gpui-kit";
import { props } from "herdr";
import { AgentHead } from "./agent-head.js";
import { Bar } from "./bar.js";
import { Fit } from "./fit.js";
import { Fleet } from "./fleet.js";
import { GitHub } from "./github.js";
import { Help } from "./help.js";
import { Inbox } from "./inbox.js";
import { Rail } from "./rail.js";
import { Status } from "./status.js";

const ROLES = { "agent-head": AgentHead, bar: Bar, fit: Fit, fleet: Fleet, github: GitHub, help: Help, inbox: Inbox, rail: Rail, status: Status };

export default class Homestead extends View {
  init(_props, cx) {
    const role = props()?.role;
    if (role === "blank") return;
    this.part = new (ROLES[role] ?? Fleet)(cx);
  }

  close(cx) {
    this.part?.close?.(cx);
  }

  render(cx) {
    return this.part ? this.part.render(cx) : div();
  }
}
