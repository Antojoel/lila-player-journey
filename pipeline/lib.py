"""Shared parsing/coordinate helpers for the LILA player-journey pipeline."""

import re

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

# Per-map world->minimap config (minimap images are 1024x1024). From dataset README.
MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500},
}
IMG_SIZE = 1024

# ts in the parquet is real epoch-milliseconds divided by 1000 (seconds stored in
# an ms-typed column). Multiply relative ts by this to recover real milliseconds.
TS_SCALE = 1000

EVENT_KINDS = {
    "Position": "move",
    "BotPosition": "move",
    "Kill": "kill",
    "BotKill": "kill",
    "Killed": "death",
    "BotKilled": "death",
    "KilledByStorm": "storm_death",
    "Loot": "loot",
}


def is_human(user_id: str) -> bool:
    return bool(UUID_RE.match(str(user_id)))


def world_to_pixel(x: float, z: float, map_id: str):
    """Return (px, py) float pixel coords on the 1024x1024 minimap."""
    c = MAP_CONFIG[map_id]
    u = (x - c["origin_x"]) / c["scale"]
    v = (z - c["origin_z"]) / c["scale"]
    return u * IMG_SIZE, (1.0 - v) * IMG_SIZE
