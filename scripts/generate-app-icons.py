"""Launcher icons from rider-app/assets/logo.png (full artwork, no adaptive crop)."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "rider-app" / "assets" / "logo.png"
CANVAS = 1024
# Android adaptive icon safe zone ~66% diameter; inset so square logo stays inside the mask.
SAFE_FRACTION = 0.66
SAFE_INSET = 0.92
MAX_LOGO_PX = int(CANVAS * SAFE_FRACTION * SAFE_INSET)

LOGO_COPIES = [
    ROOT / "customer-app" / "assets" / "logo.png",
    ROOT / "admin-web" / "public" / "logo.png",
]

LAUNCHER_ICON = "app-icon.png"


def make_launcher_icon(source: Path, out_path: Path) -> None:
    src = Image.open(source).convert("RGBA")
    fitted = src.copy()
    fitted.thumbnail((MAX_LOGO_PX, MAX_LOGO_PX), Image.Resampling.LANCZOS)

    # Opaque white canvas — full logo centered (not edge-to-edge).
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 255))
    x = (CANVAS - fitted.width) // 2
    y = (CANVAS - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    canvas.save(out_path, "PNG", optimize=True)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source logo: {SOURCE}")

    for dest in LOGO_COPIES:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE, dest)
        print(f"Synced logo -> {dest}")

    for app in ("customer-app", "rider-app"):
        out = ROOT / app / "assets" / LAUNCHER_ICON
        make_launcher_icon(SOURCE, out)
        print(f"Wrote {out} (logo fits inside adaptive safe zone)")

    print("app.json should reference ./assets/app-icon.png for icon + adaptiveIcon.")


if __name__ == "__main__":
    main()