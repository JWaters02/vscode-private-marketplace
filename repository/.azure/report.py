import argparse
import json
import subprocess
import requests
import sys
import re

def get_file_from_git(ref, path):
    try:
        result = subprocess.run(
            ["git", "show", f"{ref}:{path}"],
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError:
        return {}
    except json.JSONDecodeError:
        return {}

def extract_version(package_name):
    match = re.search(r'(\d+\.\d+\.\d+([-\w]*)?)', package_name)
    if match:
        return match.group(1)
    return package_name  # fallback to full packageName if version not found

def extract_extensions(data):
    # Returns {packageName: (name, packageName, category)}
    return {
        e["packageName"]: (
            e.get("name", ""),
            e.get("packageName", ""),
            e.get("category", "")
        )
        for e in data.get("approvedExtensions", [])
        if "packageName" in e and "name" in e
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--webhook", required=True)
    parser.add_argument("--branch", default="test")
    args = parser.parse_args()

    subprocess.run(["git", "fetch", "origin", args.branch], check=True)

    prev_data = get_file_from_git("HEAD~1", "extensions.json")
    curr_data = get_file_from_git("HEAD", "extensions.json")

    prev = extract_extensions(prev_data)
    curr = extract_extensions(curr_data)

    if prev == curr:
        print("No changes detected in extensions.json")
        return

    # Build reverse lookup for names to packageName
    prev_names = {v[0]: k for k, v in prev.items()}
    curr_names = {v[0]: k for k, v in curr.items()}

    updated = []
    removed = []
    added = []

    # Find updated (by name or packageName)
    matched_prev = set()
    matched_curr = set()
    for prev_pkg, (prev_name, prev_pkg_full, prev_cat) in prev.items():
        for curr_pkg, (curr_name, curr_pkg_full, curr_cat) in curr.items():
            if prev_name == curr_name or prev_pkg == curr_pkg:
                if prev_name != curr_name or prev_pkg != curr_pkg:
                    prev_version = extract_version(prev_pkg_full)
                    curr_version = extract_version(curr_pkg_full)
                    updated.append(f"{prev_name} {prev_version} -> {curr_name} {curr_version}")
                matched_prev.add(prev_pkg)
                matched_curr.add(curr_pkg)
                break

    # Find removed
    removed_candidates = []
    for prev_pkg, (prev_name, prev_pkg_full, prev_cat) in prev.items():
        if prev_pkg not in matched_prev and prev_name not in curr_names:
            prev_version = extract_version(prev_pkg_full)
            removed_candidates.append((prev_name, prev_version, prev_cat, prev_pkg_full))

    # Find added
    added_candidates = []
    for curr_pkg, (curr_name, curr_pkg_full, curr_cat) in curr.items():
        if curr_pkg not in matched_curr and curr_name not in prev_names:
            curr_version = extract_version(curr_pkg_full)
            added_candidates.append((curr_name, curr_version, curr_cat, curr_pkg_full))

    # Try to pair up removed and added as updates (name+version change)
    used_removed = set()
    used_added = set()
    for i, (r_name, r_version, r_cat, r_pkg_full) in enumerate(removed_candidates):
        for j, (a_name, a_version, a_cat, a_pkg_full) in enumerate(added_candidates):
            # Heuristic: same category and not already matched
            if r_cat == a_cat and i not in used_removed and j not in used_added:
                updated.append(f"{r_name} {r_version} -> {a_name} {a_version}")
                used_removed.add(i)
                used_added.add(j)
                break

    # Anything not paired is truly removed/added
    for i, (r_name, r_version, _, _) in enumerate(removed_candidates):
        if i not in used_removed:
            removed.append(f"{r_name} {r_version}")
    for j, (a_name, a_version, _, _) in enumerate(added_candidates):
        if j not in used_added:
            added.append(f"{a_name} {a_version}")

    # Build message
    lines = []
    if args.branch == "test":
        lines.append(f"Changes detected in test branch:")

    if added:
        lines.append("*Added*")
        for name in added:
            lines.append(f"- {name}")
        lines.append("") 
    if updated:
        lines.append("*Updated*")
        for name in updated:
            lines.append(f"- {name}")
        lines.append("")
    if removed:
        lines.append("*Removed*")
        for name in removed:
            lines.append(f"- {name}")
        lines.append("") 

    # Remove trailing empty lines
    while lines and lines[-1] == "":
        lines.pop()

    message = {
        "text": "🔔 *Approved VS Code Extensions Change Detected* 🔔\n\n" + "\n".join(lines)
    }

    resp = requests.post(args.webhook, json=message)
    if not resp.ok:
        print("Failed to post to Google Chat:", resp.text, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()