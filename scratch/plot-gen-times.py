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


def load_rows():
    """Merge every benchmark file present, preferring the most-sampled entry."""
    merged = {}
    for name in ("gen-times.json", "gen-times-big.json"):
        path = HERE / name
        if not path.exists():
            continue
        for row in json.loads(path.read_text())["sizes"]:
            current = merged.get(row["n"])
            if current is None or len(row.get("times") or []) > len(current.get("times") or []):
                merged[row["n"]] = row
    return [merged[n] for n in sorted(merged)]


all_rows = load_rows()
OUT = HERE.parent / "docs" / "generation-times.png"

# Mirrors SIZES in src/play/usePuzzleSession.ts: the sizes a daily puzzle is
# offered at. Highlighted so the figure says something about the shipped app and
# not just about the generator.
DAILY_SIZES = [4, 6, 9, 11, 13, 16]
REBUILD_WIDTH = 12  # above this the base solver is rebuilt periodically

# A size that aborted on every sample has no mean; keep it out of the series but
# still visible on the axis, because its absence is the interesting part.
rows = [r for r in all_rows if r.get("mean") is not None]
unmeasurable = [r["n"] for r in all_rows if r.get("mean") is None]
errors = {r["n"]: r.get("errors", 0) for r in all_rows}

sizes = [r["n"] for r in rows]
means = [r["mean"] for r in rows]
sds = [r["sd"] for r in rows]
most_samples = max(len(r.get("times") or []) for r in all_rows)

# A log axis cannot show a lower bar that reaches zero or below; clip it.
lower = [min(sd, mean * 0.9) for sd, mean in zip(sds, means)]
yerr = [lower, sds]

fig, ax = plt.subplots(figsize=(8.4, 4.6), dpi=160)

# Individual samples first, so the spread is visible and not hidden by the mean.
for row in rows:
    n = row["n"]
    xs = [n + (i / max(1, len(row["times"]) - 1) - 0.5) * 0.44 for i in range(len(row["times"]))]
    ax.scatter(xs, row["times"], s=11, color="#c8b49a", alpha=0.75, linewidths=0, zorder=2)

# One mean line through every measured size; the daily sizes are then marked on top
# of it rather than plotted as a second, interleaved series.
ax.errorbar(
    sizes, means, yerr=yerr, fmt="none",
    ecolor="#c3b6a5", elinewidth=1.0, capsize=3.5, zorder=2,
)
ax.plot(sizes, means, color="#9c8f7f", lw=1.5, zorder=3)

for highlight, marker_face, edge, label in (
    (False, "white", "#9c8f7f", "other sizes"),
    (True, "#7a5c2e", "#7a5c2e", "daily puzzle size"),
):
    xs = [n for n in sizes if (n in DAILY_SIZES) == highlight]
    if not xs:
        continue
    ax.scatter(
        xs, [means[sizes.index(n)] for n in xs],
        s=44, facecolors=marker_face, edgecolors=edge, linewidths=1.4, zorder=5, label=label,
    )

ax.set_yscale("log")
ax.set_xlabel("Board size")
ax.set_ylabel("Generation time (ms, log scale)")
ticks = sorted(set([*sizes, *DAILY_SIZES, *unmeasurable]))
ax.set_xticks(ticks, [f"{n}x{n}" for n in ticks], rotation=45, ha="right")
ax.set_xlim(min(ticks) - 0.6, max(ticks) + 1.0)

# Sizes with no usable samples at all, and sizes that lost some samples to a wasm
# abort: both are results, so they are drawn rather than omitted.
for n in unmeasurable:
    row = next(r for r in all_rows if r["n"] == n)
    attempted = (row.get("errors") or 0) + len(row.get("times") or [])
    ax.scatter([n], [3.0e4], marker="x", s=55, color="#a8442f", linewidths=2, zorder=4)
    ax.annotate(
        f"aborts {row.get('errors')}/{attempted}",
        xy=(n, 3.0e4), xytext=(n, 4.2e4),
        fontsize=8, color="#a8442f", ha="center",
    )
ax.set_title(
    f"Yin-Yang puzzle generation, up to {most_samples} samples per size "
    "(mean ± 1 SD, individual samples in light dots)",
    fontsize=11,
)
ax.grid(True, which="both", axis="y", alpha=0.22, linestyle=":")
ax.axvspan(REBUILD_WIDTH + 0.5, max(ticks) + 0.5, color="#c8b49a", alpha=0.16, zorder=0)
ax.annotate(
    "base solver rebuilt periodically",
    xy=(REBUILD_WIDTH + 0.9, 26), fontsize=8, color="#8a7b68", ha="left",
)

# One note for the failure trend instead of a label on every affected size, which
# collided at this density.
rates = []
for row in rows:
    attempts = (row.get("errors") or 0) + len(row.get("times") or [])
    if row.get("errors") and attempts:
        rates.append((row["n"], 100.0 * row["errors"] / attempts))
if rates:
    first, low = rates[0]
    high = max(r for _, r in rates)
    ax.annotate(
        f"{first}x{first} and up: {low:.0f}-{high:.0f}% of attempts abort\n"
        "on the fixed 64 MiB heap",
        xy=(REBUILD_WIDTH + 0.9, 10.5), fontsize=8, color="#a8442f", ha="left",
    )
ax.legend(frameon=False, fontsize=9, loc="upper left")

fig.tight_layout()
OUT.parent.mkdir(exist_ok=True)
fig.savefig(OUT)
print(f"wrote {OUT}")

print()
print("| size | samples | aborted | mean (ms) | SD (ms) | min (ms) | max (ms) |")
print("|---|---|---|---|---|---|---|")
for row in all_rows:
    if row.get("mean") is None:
        print(f"| {row['n']}x{row['n']} | 0 | {row.get('errors', 0)} | — | — | — | — |")
        continue
    print(
        f"| {row['n']}x{row['n']} | {len(row['times'])} | {row.get('errors', 0)} | "
        f"{row['mean']} | {row['sd']} | {row['min']} | {row['max']} |"
    )
