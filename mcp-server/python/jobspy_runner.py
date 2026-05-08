#!/usr/bin/env python3
"""JobSpy thin CLI runner. python-jobspy ships only as a library, no __main__.

Invoked from src/scrapers/jobspy.ts as:
    python3 mcp-server/python/jobspy_runner.py \
        --search-term "<kw>" --location "<loc>" --site-name "indeed,glassdoor" \
        --results-wanted 25 --country-indeed BR

Emits JSON to stdout on success (array of job dicts). Non-zero exit on error.
"""
import argparse
import json
import math
import sys


def _coerce(v):
    """Normalize pandas/numpy values into JSON-safe primitives.

    pandas DataFrame.to_dict() leaves NaN floats and pandas Timestamps in the
    payload, both of which json.dumps either chokes on (Timestamp) or emits as
    invalid JSON literals (NaN). The TypeScript caller treats this as
    SCRAPER_FAIL because its JSON.parse barfs on `NaN`. Convert NaN -> None and
    everything non-primitive -> str().
    """
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)

try:
    from jobspy import scrape_jobs
except ImportError as e:
    print(f"jobspy import failed: {e}", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    ap = argparse.ArgumentParser(description="JobSpy CLI wrapper")
    ap.add_argument("--search-term", required=True)
    ap.add_argument("--location", default="")
    ap.add_argument("--site-name", default="indeed,glassdoor",
                    help="Comma-separated: indeed,glassdoor,zip_recruiter,linkedin,google")
    ap.add_argument("--results-wanted", type=int, default=25)
    ap.add_argument("--country-indeed", default="BR")
    ap.add_argument("--hours-old", type=int, default=168)  # 1 week
    args = ap.parse_args()

    sites = [s.strip() for s in args.site_name.split(",") if s.strip()]

    try:
        df = scrape_jobs(
            site_name=sites,
            search_term=args.search_term,
            location=args.location or None,
            results_wanted=args.results_wanted,
            country_indeed=args.country_indeed,
            hours_old=args.hours_old,
        )
    except Exception as e:
        print(f"scrape_jobs failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 3

    if df is None or df.empty:
        print("[]")
        return 0

    records = df.to_dict(orient="records")
    cleaned = [{k: _coerce(v) for k, v in r.items()} for r in records]

    # allow_nan=False is defense-in-depth: if _coerce ever misses a NaN, fail
    # loud with ValueError instead of emitting invalid JSON the TS caller
    # cannot parse.
    print(json.dumps(cleaned, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
