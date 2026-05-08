#!/usr/bin/env python3
"""LinkedIn voyager API CLI bridge.

Wraps `tomquirk/linkedin-api` so the Node MCP server can fetch profile data
via the same internal GraphQL endpoints LinkedIn's web app uses, bypassing
the server-side `/in/<slug>` authwall that blocks Patchright navigation.

Auth model: cookies-only. The Node side ships the captured cookie set
(li_at + JSESSIONID + bcookie + ...) over stdin as JSON; this runner converts
to the dict shape `linkedin-api` expects and constructs the Linkedin() client
with `cookies=...` (skipping username/password login entirely — credentials
never leave the user's keyboard).

Invocation:
    cat <<'EOF' | python3 mcp-server/python/linkedin_api_runner.py \\
        --action get_profile --public-id williamhgates
    [{"name":"li_at","value":"...","domain":".linkedin.com"}, ...]
    EOF

Stdout: JSON profile object on success.
Exit codes:
    0 success
    2 missing/invalid cookies
    3 linkedin-api raised (auth challenge, blocked, etc.)
    4 unexpected error
"""
import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="linkedin-api CLI bridge")
    ap.add_argument("--action", required=True,
                    choices=["get_profile", "get_profile_skills",
                             "search_people", "get_feed_posts"])
    ap.add_argument("--public-id", help="LinkedIn /in/<slug> public id")
    ap.add_argument("--keywords", help="Search keywords (search_people)")
    ap.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()

    # Read cookies array from stdin.
    try:
        raw_cookies = json.load(sys.stdin)
    except Exception as e:
        print(f"failed to parse stdin cookies JSON: {e}", file=sys.stderr)
        return 2
    if not isinstance(raw_cookies, list) or not raw_cookies:
        print("cookies must be a non-empty array", file=sys.stderr)
        return 2

    # linkedin-api expects a `requests.cookies.RequestsCookieJar`-like object,
    # but accepts a plain dict {name: value}. We pass the dict; library wraps.
    cookie_dict = {c["name"]: c["value"] for c in raw_cookies if "name" in c and "value" in c}
    if "li_at" not in cookie_dict and "li_rm" not in cookie_dict:
        print("li_at or li_rm cookie required for authentication", file=sys.stderr)
        return 2

    try:
        from linkedin_api import Linkedin
    except ImportError as e:
        print(f"linkedin_api import failed: {e}", file=sys.stderr)
        return 4

    # Authenticate via cookies-only. linkedin-api accepts an empty username/
    # password when `cookies=...` is provided. Pass `authenticate=False` to
    # skip the credential exchange entirely.
    try:
        api = Linkedin("", "", cookies=cookie_dict, authenticate=False)
    except TypeError:
        # Older versions used `authenticate` differently — fall back.
        api = Linkedin("", "", cookies=cookie_dict)
    except Exception as e:
        print(f"Linkedin() init failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 3

    try:
        if args.action == "get_profile":
            if not args.public_id:
                print("--public-id required for get_profile", file=sys.stderr)
                return 2
            data = api.get_profile(args.public_id)
        elif args.action == "get_profile_skills":
            if not args.public_id:
                print("--public-id required", file=sys.stderr)
                return 2
            data = api.get_profile_skills(args.public_id)
        elif args.action == "search_people":
            data = api.search_people(keywords=args.keywords, limit=args.limit)
        elif args.action == "get_feed_posts":
            data = api.get_feed_posts(limit=args.limit)
        else:
            print(f"unknown action: {args.action}", file=sys.stderr)
            return 2
    except Exception as e:
        print(f"linkedin-api action {args.action} failed: {type(e).__name__}: {e}",
              file=sys.stderr)
        return 3

    print(json.dumps(data, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
