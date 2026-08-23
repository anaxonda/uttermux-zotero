#!/usr/bin/env python3
"""Create a reproducible Mozilla/Zotero JSON update manifest for one XPI."""

import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xpi", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    xpi = Path(args.xpi)
    with zipfile.ZipFile(xpi) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    application = manifest["applications"]["zotero"]
    update = {
        "version": manifest["version"],
        "update_link": args.url,
        "update_hash": "sha256:" + hashlib.sha256(xpi.read_bytes()).hexdigest(),
        "applications": {"zotero": {
            "strict_min_version": application["strict_min_version"],
            "strict_max_version": application["strict_max_version"],
        }},
    }
    document = {"addons": {application["id"]: {"updates": [update]}}}
    Path(args.output).write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
