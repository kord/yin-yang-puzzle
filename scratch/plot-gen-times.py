#!/usr/bin/env python
"""
Render docs/generation-times.png from scratch/gen-times.json.

The JSON is written by scratch/gen-times.test.js; this script never re-measures.
Run with the workspace virtualenv:

    .\\.venv\\Scripts\\python.exe scratch/plot-gen-times.py
"""
import json
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = pathlib.Path(__file__).resolve().parent
DATA = json.loads((HERE / "gen-times.json").read_text())
OUT = HERE.parent / "docs" / "generation-times.png"

# Mirrors SIZES in src/play/usePuzzleSession.ts: the sizes a daily puzzle is
# offered at. Highlighted so the figure says something about the shipped app and
# not just about the generator.
DAILY_SIZES = [4, 6, 9, 11, 13, 16]
REBUILD_WIDTH = 12  # above this the base solver is rebuilt periodically

rows = DATA["sizes"]
sizes = [r["n"] for r in rows]
means = [r["mean"] for r in rows]
sds = [r["sd"] for r in rows]

# A log axis cannot show a lower bar that reaches zero or below; clip it.
lower = [min(sd, mean * 0.9) for sd, mean in zip(sds, means)]
yerr = [lower, sds]

fig, ax = plt.subplots(figsize=(8.4, 4.6), dpi=160)

# Individual samples first, so the spread is visible and not hidden by the mean.
for row in rows:
    n = row["n"]
    xs = [n + (i / max(1, len(row["times"]) - 1) - 0.5) * 0.44 for i in range(len(row["times"]))]
    ax.scatter(xs, row["times"], s=11, color="#c8b49a", alpha=0.75, linewidths=0, zorder=2)

for highlight in (False, True):
    xs = [n for n in sizes if (n in DAILY_SIZES) == highlight]
    if not xs:
        continue
    ys = [means[sizes.index(n)] for n in xs]
    errs = [[lower[sizes.index(n)] for n in xs], [sds[sizes.index(n)] for n in xs]]
    ax.errorbar(
        xs, ys, yerr=errs, fmt="o-", capsize=3.5, lw=1.6, elinewidth=1.1, markersize=6,
        color="#7a5c2e" if highlight else "#9c8f7f",
        ecolor="#b9a184" if highlight else "#cfc4b6",
        label="daily puzzle size" if highlight else "other sizes",
        zorder=3, markerfacecolor="#7a5c2e" if highlight else "white",
        markeredgecolor="#7a5c2e" if highlight else "#9c8f7f",
    )

ax.set_yscale("log")
ax.set_xlabel("Board size")
ax.set_ylabel("Generation time (ms, log scale)")
# 16x16 is a daily size but is not measurable: the fixed-size wasm heap aborts on
# some seeds. Widen the axis and say so, rather than silently stopping at 15x15.
ax.set_xticks([*sizes, 16], [f"{n}x{n}" for n in [*sizes, 16]], rotation=45, ha="right")
ax.set_xlim(min(sizes) - 0.6, 16.9)
ax.scatter([16], [3.0e4], marker="x", s=55, color="#a8442f", linewidths=2, zorder=4)
ax.annotate(
    "aborts\n(64 MiB heap)",
    xy=(16, 3.0e4), xytext=(16, 3.6e4),
    fontsize=8, color="#a8442f", ha="center",
)
ax.set_title(
    f"Yin-Yang puzzle generation, {DATA['samples']} samples per size "
    "(mean ± 1 SD, individual samples in light dots)",
    fontsize=11,
)
ax.grid(True, which="both", axis="y", alpha=0.22, linestyle=":")
ax.axvspan(REBUILD_WIDTH + 0.5, 15.5, color="#c8b49a", alpha=0.16, zorder=0)
ax.annotate(
    "base solver rebuilt periodically",
    xy=(REBUILD_WIDTH + 0.6, min(means) * 1.35),
    fontsize=8, color="#8a7b68", ha="left",
)
ax.legend(frameon=False, fontsize=9, loc="upper left")

fig.tight_layout()
OUT.parent.mkdir(exist_ok=True)
fig.savefig(OUT)
print(f"wrote {OUT}")

print()
print("| size | mean (ms) | SD (ms) | min (ms) | max (ms) |")
print("|---|---|---|---|---|")
for row in rows:
    print(f"| {row['n']}x{row['n']} | {row['mean']} | {row['sd']} | {row['min']} | {row['max']} |")
