import type { ManifestMatch } from "./types";

/** Discrete-event count for a match — used to rank "most interesting" matches. */
export function matchActivity(m: ManifestMatch): number {
  const e = m.event_counts;
  return e.kill + e.death + e.storm_death + e.loot;
}
