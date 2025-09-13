#!/usr/bin/env python3
"""
route_linter.py  ──────────────────────────────────────────────────────────────
A micro‑linter for ParentSupport router files.

Usage
-----
$ python route_linter.py path/to/router1.json path/to/other/*.json

• Exits **0** when all files pass.
• Exits **1** if any error is found (CI‑friendly).

Checks performed
----------------
1. File is valid JSON.
2. Top‑level must contain a single key "routes" (list).
3. Every route object must have:
   • pattern  (str)
   • template_id (str)
   • fallback  (str)
4. Fallback must equal your project standard (edit FALLBACK_ID below).
5. Precedence collisions: warns if >1 route share the same precedence value.
6. Regex sanity: pattern must compile with `re.compile(pattern, re.I)`.
"""

import json, re, sys, pathlib, itertools
from collections import defaultdict

# ── project‑specific constants ───────────────────────────────────────────────
FALLBACK_ID = "tool_generic_support_intro"
REQUIRED_KEYS = {"pattern", "template_id", "fallback"}
# ─────────────────────────────────────────────────────────────────────────────

def main(paths):
    all_ok = True
    for path in expand_paths(paths):
        ok = lint_file(pathlib.Path(path))
        all_ok &= ok
    sys.exit(0 if all_ok else 1)


def expand_paths(args):
    for arg in args:
        p = pathlib.Path(arg)
        if p.is_dir():
            yield from p.rglob("*.json")
        else:
            yield from map(str, p.parent.glob(p.name))


def lint_file(path: pathlib.Path) -> bool:
    ok = True
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"ERROR {path}: invalid JSON – {e}")
        return False

    routes = data.get("routes")
    if not isinstance(routes, list):
        print(f"ERROR {path}: top‑level key 'routes' missing or not a list")
        return False

    precedence_seen = defaultdict(list)

    for idx, route in enumerate(routes, 1):
        # 1. required keys
        missing = REQUIRED_KEYS - route.keys()
        if missing:
            print(f"ERROR {path} route[{idx}]: missing keys {missing}")
            ok = False

        # 2. fallback value check
        if route.get("fallback") != FALLBACK_ID:
            print(f"WARN  {path} route[{idx}]: fallback '{route.get('fallback')}' != '{FALLBACK_ID}'")

        # 3. regex compile test
        pattern = route.get("pattern", "")
        try:
            re.compile(pattern, re.I)
        except re.error as e:
            print(f"ERROR {path} route[{idx}]: invalid regex – {e}")
            ok = False

        # 4. collect precedence
        prec = route.get("precedence")
        if isinstance(prec, int):
            precedence_seen[prec].append(idx)

    # 5. precedence collisions
    for prec, indices in precedence_seen.items():
        if len(indices) > 1:
            print(f"WARN  {path}: precedence {prec} used by routes {indices}")

    return ok


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python route_linter.py path/to/router.json [more.json|dir/*]")
        sys.exit(1)
    main(sys.argv[1:])
