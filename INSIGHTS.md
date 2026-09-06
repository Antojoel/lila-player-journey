# Insights

Three findings from the 5-day dataset (796 matches, 781 human player-matches,
89,104 events). Each was checked in the pipeline data and is reproducible from
the tool.

---

## 1. Fights collapse onto ~10% of the map

**Evidence.** Bin every combat event (`kill`, `death`, `storm death` — 3,160 in
total) into a 32×32 grid over each map (1,024 cells):

| Map | Combat events | Cells that see any combat | 50% of combat within | 80% of combat within |
|---|---|---|---|---|
| AmbroseValley | 2,304 | 225 / 1024 | 28 cells | **76 cells (7.4%)** |
| Lockdown | 611 | 165 / 1024 | 29 cells | 75 cells (7.3%) |
| GrandRift | 245 | 79 / 1024 | 17 cells | 41 cells (4.0%) |
| All maps | 3,160 | — | 41 cells | **106 cells (~10%)** |

Switch the tool to **Heatmap → Kill zones** / **Death zones**: on AmbroseValley
the mass sits in the central POI band (the warehouse/compound cluster), on
GrandRift it's almost entirely Mine Pit.

**Why a Level Designer should care.** Four-fifths of all player-versus-player
outcomes happen in a strip you could cover with a few screenshots. That's where
sightlines, cover spacing, and entry routes have to be right — everywhere else,
combat tuning is basically unobserved. If the intent is a more spread-out fight,
the lever is *outside* those cells: loot value, objective placement, or storm
path that gives players a reason to be elsewhere.

---

## 2. Most of every map is dead space

**Evidence.** Bin all `Position` / `BotPosition` samples into a 48×48 grid
(2,304 cells) per map and count how many are ever touched:

| Map | Cells touched | Coverage | Movement samples |
|---|---|---|---|
| AmbroseValley | 939 / 2304 | **41%** | 48,754 |
| GrandRift | 734 / 2304 | 32% | 5,728 |
| Lockdown | 669 / 2304 | **29%** | 18,577 |

Even the busiest map leaves ~60% of its grid with zero recorded player presence
across five days. **Traffic** heatmap mode shows the used area as a connected
core with large untouched margins.

**Why a Level Designer should care.** Playable area that no one visits is cost
without return — art, collision, nav-mesh, lighting — and it dilutes the storm's
job of compressing players together. The unused regions are concrete candidates
to cut, to seed with a reason to visit (loot, objective, extract point), or to
route the one-directional storm *through* so players are pushed across them
instead of around them.

---

## 3. The storm herds; it doesn't kill

**Evidence.**

- **39** `KilledByStorm` events across all 796 matches (17 AmbroseValley, 17
  Lockdown, 5 GrandRift) — roughly **0.4%** of ~10,000 player-matches.
- Only **56.6%** of human player-matches record *any* death (PvP, PvE, or storm).
- **6.3%** of human player-matches end with **neither a kill nor a death** — the
  player moved and (usually) looted, and nothing else happened to them.
- Median human match length is **6.4 min** (p90 12), and **139 / 796** matches
  end in under 3 minutes.

So matches are ending by extraction or timeout, not by the play zone closing on
anyone. Looting, by contrast, is near-universal: **92.7%** of human
player-matches include at least one `Loot`, median **16** pickups (max 68).

**Why a Level Designer should care.** If the storm is meant to be a pressure
mechanic — "move or die" — it currently isn't applying that pressure: it's a
soft nudge that players comfortably stay ahead of. Whether that's the intent is a
design call, but the data says the current storm timing / damage / extract
spacing lets players treat matches as a looting run with optional fights. Tuning
levers: storm speed or damage ramp, extract-point count and placement, or match
timer.
