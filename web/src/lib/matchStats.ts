import type { ManifestMatch, MatchData, Player } from "./types";

/** Discrete-event count for a match — used to rank "most interesting" matches. */
export function matchActivity(m: ManifestMatch): number {
  const e = m.event_counts;
  return e.kill + e.death + e.storm_death + e.loot;
}

/** Plain-language description of a match for the picker (no hex IDs up front). */
export function describeMatch(m: ManifestMatch) {
  const mins = Math.round(m.duration_ms / 60000);
  const secs = Math.round((m.duration_ms % 60000) / 1000);
  const dur = `${mins}:${String(secs).padStart(2, "0")}`;
  const roster =
    `${m.human_count} human${m.human_count === 1 ? "" : "s"}` +
    (m.bot_count ? ` · ${m.bot_count} bots` : " · no bots");
  const e = m.event_counts;
  const fightBits: string[] = [];
  if (e.kill) fightBits.push(`${e.kill} kill${e.kill === 1 ? "" : "s"}`);
  if (e.death + e.storm_death)
    fightBits.push(`${e.death + e.storm_death} death${e.death + e.storm_death === 1 ? "" : "s"}`);
  if (e.storm_death) fightBits.push(`${e.storm_death} storm`);
  if (e.loot) fightBits.push(`${e.loot} loot`);
  return {
    headline: `${m.map_id} · ${dur}`,
    roster,
    fights: fightBits.join(" · ") || "no recorded events",
  };
}

export interface QuickPick {
  key: string;
  label: string;
  hint: string;
  match: ManifestMatch;
}

/** A handful of one-click "show me a match like X" entries for the current filter. */
export function quickPicks(matches: ManifestMatch[]): QuickPick[] {
  if (matches.length === 0) return [];
  const out: QuickPick[] = [];
  const by = (fn: (m: ManifestMatch) => number) =>
    [...matches].sort((a, b) => fn(b) - fn(a))[0];

  const biggest = by((m) => m.event_counts.kill + m.event_counts.death + m.event_counts.storm_death);
  if (biggest) out.push({ key: "fight", label: "Biggest fight", hint: "most kills + deaths", match: biggest });

  const longest = by((m) => m.duration_ms);
  if (longest && longest !== biggest)
    out.push({ key: "long", label: "Longest match", hint: "ran the full timer", match: longest });

  const storm = by((m) => m.event_counts.storm_death);
  if (storm && storm.event_counts.storm_death > 0)
    out.push({ key: "storm", label: "Most storm deaths", hint: "players caught by the zone", match: storm });

  // A "normal" quiet match: shortest activity among matches of typical length.
  const median = [...matches].map((m) => m.duration_ms).sort((a, b) => a - b)[
    Math.floor(matches.length / 2)
  ];
  const calm = [...matches]
    .filter((m) => m.duration_ms >= median * 0.6)
    .sort((a, b) => matchActivity(a) - matchActivity(b))[0];
  if (calm && !out.some((q) => q.match === calm))
    out.push({ key: "calm", label: "Quiet match", hint: "little combat, mostly looting", match: calm });

  return out.slice(0, 4);
}

/** Friendly per-match labels: "Human A".."Human Z", then "Bot 1".."Bot N". */
export function playerLabels(match: MatchData | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!match) return map;
  let h = 0;
  let b = 0;
  for (const p of match.players) {
    if (p.human) {
      map.set(p.id, `Human ${String.fromCharCode(65 + (h % 26))}${h >= 26 ? Math.floor(h / 26) : ""}`);
      h++;
    } else {
      b++;
      map.set(p.id, `Bot ${b}`);
    }
  }
  return map;
}

/** Per-player event tallies for the roster strip. */
export function playerEventCounts(p: Player) {
  const c = { kill: 0, death: 0, loot: 0 };
  for (const e of p.events) {
    if (e.k === "kill") c.kill++;
    else if (e.k === "death" || e.k === "storm_death") c.death++;
    else if (e.k === "loot") c.loot++;
  }
  return c;
}
