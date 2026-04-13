#!/usr/bin/env python3
"""cargo bench の出力をパースしてパフォーマンスドキュメント（Markdown）を生成する。

使用例:
  cargo bench 2>&1 | python3 scripts/parse_bench.py --output docs/PERFORMANCE.md
  python3 scripts/parse_bench.py --input bench_output.txt --output docs/PERFORMANCE.md \
      --commit abc1234 --date "2026-04-13 12:00 UTC"
"""

import re
import sys
import argparse

MODULE_TITLES = {
    "stroke::smoothing": "StrokeSmoother（EMAスムージング）",
    "stroke::dab": "DabGenerator（ダブ生成）",
    "canvas::sparse": "SparseCanvas（スパースキャンバス）",
    "canvas::tile": "Tile（タイルピクセル操作）",
}

MODULE_ORDER = [
    "stroke::smoothing",
    "stroke::dab",
    "canvas::sparse",
    "canvas::tile",
]

BENCH_PATTERN = re.compile(
    r"test (\S+)\s+\.\.\. bench:\s+([\d,]+\.?\d*) ns/iter \(\+/- ([\d,]+\.?\d*)\)"
)


def parse_bench_output(text):
    results = {}
    for match in BENCH_PATTERN.finditer(text):
        full_name = match.group(1)
        time_ns = float(match.group(2).replace(",", ""))
        stddev_ns = float(match.group(3).replace(",", ""))

        parts = full_name.split("::")
        if "benches" in parts:
            bench_idx = parts.index("benches")
            module = "::".join(parts[:bench_idx])
            bench_name = parts[-1]
        else:
            module = "other"
            bench_name = full_name

        results.setdefault(module, []).append((bench_name, time_ns, stddev_ns))

    return results


def format_time(ns):
    if ns >= 1_000_000_000:
        return f"{ns / 1_000_000_000:.2f} s"
    elif ns >= 1_000_000:
        return f"{ns / 1_000_000:.2f} ms"
    elif ns >= 1_000:
        return f"{ns / 1_000:.2f} µs"
    else:
        return f"{ns:.2f} ns"


def generate_markdown(results, commit="", date=""):
    lines = []
    lines.append("# パフォーマンス現状\n")

    meta = []
    if date:
        meta.append(f"最終更新: {date}")
    if commit:
        meta.append(f"コミット: `{commit[:8]}`")
    if meta:
        lines.append("> " + " / ".join(meta))
        lines.append("")

    lines.append(
        "ストローク描画パイプラインのベンチマーク結果（`cargo bench` 実行値、release ビルド）。"
        "レイヤー合成は対象外。\n"
    )

    ordered = [m for m in MODULE_ORDER if m in results]
    others = sorted(m for m in results if m not in MODULE_ORDER)

    for module in ordered + others:
        benches = results[module]
        title = MODULE_TITLES.get(module, module)
        lines.append(f"## {title}\n")
        lines.append("| ベンチマーク | 実行時間 | 標準偏差 |")
        lines.append("|------------|---------|--------|")
        for bench_name, time_ns, stddev_ns in benches:
            display = bench_name.removeprefix("bench_").replace("_", " ")
            lines.append(
                f"| `{display}` | {format_time(time_ns)} | ±{format_time(stddev_ns)} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Parse cargo bench output and write a performance Markdown doc"
    )
    parser.add_argument("--input", default="-", help="Input file path (default: stdin)")
    parser.add_argument(
        "--output", default="-", help="Output file path (default: stdout)"
    )
    parser.add_argument("--commit", default="", help="Git commit SHA")
    parser.add_argument("--date", default="", help="Date/time string")
    args = parser.parse_args()

    if args.input == "-":
        text = sys.stdin.read()
    else:
        with open(args.input, encoding="utf-8") as f:
            text = f.read()

    results = parse_bench_output(text)

    if not results:
        print("Error: no benchmark results found in input", file=sys.stderr)
        sys.exit(1)

    markdown = generate_markdown(results, commit=args.commit, date=args.date)

    if args.output == "-":
        sys.stdout.write(markdown)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(markdown)
        print(f"Written to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
