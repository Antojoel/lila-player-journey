# Insights

Three findings from the 5-day dataset (796 matches, 781 human player-matches,
89,104 events), each reproducible in the tool.

Every insight follows the same shape: **what caught the eye → concrete evidence →
what to change and which metrics move → why a Level Designer should care.**

---

## 1. Fights collapse onto ~10% of the map

**What caught the eye.** In Heatmap → Kill/Death zones, the intensity isn't spread
along routes — it's a few tight blobs, the same ones on every day filter.

**Evidence.** Binning all combat events (`kill`, `death`, `storm death` — 3,160
total) into a 32×32 grid (1,024 cells) per map:

| Map | Combat events | Cells with any combat | 50% of combat within | 80% within |
|---|---|---|---|---|
| AmbroseValley | 2,304 | 225 / 1024 | 28 cells | **76 cells (7.4%)** |
| Lockdown | 611 | 165 / 1024 | 29 cells | 75 cells (7.3%) |
| GrandRift | 245 | 79 / 1024 | 17 cells | 41 cells (4.0%) |
| All maps | 3,160 | — | 41 cells | **106 cells (~10%)** |

On AmbroseValley the mass sits in the central compound/warehouse band; on
GrandRift it's almost entirely Mine Pit.

**Actionable — and the metrics that move.** These ~10% of cells are where
sightlines, cover spacing and entry counts actually get exercised; treat them as
the priority review set. To *spread* engagements, the lever is outside those
cells — raise loot value or place a secondary objective in the cold zones.
Metrics to watch: **combat-event Gini / % of kills in the top-N cells** (target:
down), **distinct cells with ≥1 fight per match** (up), **average distance
between a player's loot pickups and their first fight** (up if players now fight
elsewhere), **early-match kill share in the hot band** (down).

**Why a Level Designer should care.** Four-fifths of all PvP outcomes happen in a
strip you could cover in a few screenshots. Everywhere else, encounter tuning is
essentially unobserved — you're balancing a map from 10% of its area.

---

## 2. Most of every map is dead space

**What caught the eye.** In Traffic heatmap mode, each map is a bright connected
core inside a wide dark margin — and the margin never lights up, on any day.

**Evidence.** Binning `Position` / `BotPosition` samples into a 48×48 grid (2,304
cells) and counting cells ever touched:

| Map | Cells touched | Coverage | Movement samples |
|---|---|---|---|
| AmbroseValley | 939 / 2304 | **41%** | 48,754 |
| GrandRift | 734 / 2304 | 32% | 5,728 |
| Lockdown | 669 / 2304 | **29%** | 18,577 |

Even the busiest map leaves ~60% of its grid with zero recorded player presence
over five days.

**Actionable — and the metrics that move.** Each dead region is a decision: cut
it (reclaim art/collision/nav-mesh budget), seed it with a reason to visit (loot
node, objective, extract point), or route the one-directional storm *through* it
so players are pushed across instead of around. Metrics to watch: **map coverage
% at a fixed grid** (target: up), **playable-area-to-used-area ratio** (down),
**visits per POI** for anything newly placed, **average path length / rotation
time** (up if players now traverse more of the map), **nav-mesh + streaming cost**
for any region cut.

**Why a Level Designer should care.** Space no one enters is pure cost and it
dilutes the storm's job of compressing players together. The unused cells are a
concrete backlog of cut/replace/reroute candidates, ranked by how empty they are.

---

## 3. The storm herds; it doesn't kill

**What caught the eye.** Scrubbing through matches, storm-death markers almost
never appear, and lots of human journeys simply end with no death marker at all.

**Evidence.**

- **39** `KilledByStorm` events across all 796 matches (17 AmbroseValley, 17
  Lockdown, 5 GrandRift) — roughly **0.4%** of ~10,000 player-matches.
- Only **56.6%** of human player-matches record *any* death (PvP, PvE, or storm).
- **6.3%** end with **neither a kill nor a death** — the player moved, usually
  looted, and nothing else happened.
- Median human match length **6.4 min** (p90 12); **139 / 796** matches end under
  3 minutes.

Matches are ending by extraction or timeout, not by the zone closing on anyone.
Looting, by contrast, is near-universal: **92.7%** of human player-matches
include a `Loot`, median **16** pickups.

**Actionable — and the metrics that move.** If the storm is meant to be "move or
die" pressure, it currently isn't applying it. Levers: increase storm speed or
damage ramp, reduce or reposition extract points, shorten the match timer.
Metrics to watch: **storm-death rate** (target: up from 0.4% toward an intended
band), **% of matches ending by extraction vs timeout vs elimination**,
**median time spent inside the safe zone's final ring**, **median match
duration** (down), **loot pickups per match** (down if players can no longer
free-roam), **early-rotation start time** (earlier).

**Why a Level Designer should care.** The current storm lets players treat a
match as a looting run with optional fights. That may be intended — but the data
says the mechanic labelled as the pressure system isn't the thing ending matches,
and the knobs above are how you change that.
