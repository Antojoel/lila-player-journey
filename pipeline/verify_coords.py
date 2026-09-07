"""Plot the README worked example + real sample points onto each minimap.
Outputs pipeline/_verify/<map>.png for visual inspection."""

import glob
import os

import duckdb
from PIL import Image, ImageDraw

from lib import MAP_CONFIG, world_to_pixel

DATA = "/Users/user/Downloads/player_data"
MINI = {
    "AmbroseValley": f"{DATA}/minimaps/AmbroseValley_Minimap.png",
    "GrandRift": f"{DATA}/minimaps/GrandRift_Minimap.png",
    "Lockdown": f"{DATA}/minimaps/Lockdown_Minimap.jpg",
}
OUT = os.path.join(os.path.dirname(__file__), "_verify")
os.makedirs(OUT, exist_ok=True)
con = duckdb.connect()

allf = []
for d in ["February_10", "February_11", "February_12", "February_13", "February_14"]:
    allf += glob.glob(f"{DATA}/{d}/*.nakama-0")


def dot(draw, px, py, r, color, outline="black"):
    draw.ellipse([px - r, py - r, px + r, py + r], fill=color, outline=outline, width=2)


for map_id, mpath in MINI.items():
    img = Image.open(mpath).convert("RGB")
    if img.size != (1024, 1024):
        img = img.resize((1024, 1024))
    draw = ImageDraw.Draw(img)

    # README worked example (AmbroseValley only) -> expected pixel (78, 890)
    if map_id == "AmbroseValley":
        px, py = world_to_pixel(-301.45, -355.55, map_id)
        print(f"[{map_id}] README example -> ({px:.0f},{py:.0f}) expected ~(78,890)")
        dot(draw, px, py, 10, "yellow")

    # sample real position points for this map: min/max corners + a full path
    q = f"""
      SELECT x, z, CAST(event AS VARCHAR) AS event, user_id
      FROM read_parquet({list(allf)})
      WHERE map_id = '{map_id}' AND CAST(event AS VARCHAR) IN ('Position','BotPosition')
      USING SAMPLE 4000 ROWS
    """
    df = con.execute(q).df()
    xs = (
        con.execute(
            f"SELECT min(x) mnx, max(x) mxx, min(z) mnz, max(z) mxz FROM read_parquet({list(allf)}) WHERE map_id='{map_id}'"
        )
        .df()
        .iloc[0]
    )
    print(
        f"[{map_id}] world extent x[{xs.mnx:.0f},{xs.mxx:.0f}] z[{xs.mnz:.0f},{xs.mxz:.0f}]  cfg={MAP_CONFIG[map_id]}"
    )

    for _, r in df.iterrows():
        px, py = world_to_pixel(r.x, r.z, map_id)
        c = "#00ccff" if r.event == "Position" else "#ff3399"
        draw.point([px, py], fill=c)

    # extreme corners in red to see if data fits the frame
    for wx, wz in [
        (xs.mnx, xs.mnz),
        (xs.mnx, xs.mxz),
        (xs.mxx, xs.mnz),
        (xs.mxx, xs.mxz),
    ]:
        px, py = world_to_pixel(wx, wz, map_id)
        dot(draw, px, py, 6, "red")

    img.save(f"{OUT}/{map_id}.png")
    print(f"  saved {OUT}/{map_id}.png")
