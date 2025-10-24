import os
import json
import sys

APPROVED_DIR = os.path.join(os.path.dirname(__file__), "..", "approved")
EXT_JSON = os.path.join(os.path.dirname(__file__), "..", "extensions.json")

def get_vsix_files(approved_dir):
    return sorted([
        f for f in os.listdir(approved_dir)
        if os.path.isfile(os.path.join(approved_dir, f)) and f.endswith(".vsix")
    ])

def get_package_names_from_json(json_path):
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    return sorted([
        ext["packageName"] for ext in data.get("approvedExtensions", [])
    ])

def main():
    vsix_files = get_vsix_files(APPROVED_DIR)
    json_packages = get_package_names_from_json(EXT_JSON)

    vsix_bases = set(os.path.splitext(f)[0] for f in vsix_files)
    json_bases = set(pkg[:-5] if pkg.endswith(".vsix") else pkg for pkg in json_packages)

    issues = []

    # VSIX files not in extensions.json
    for vsix_base in vsix_bases - json_bases:
        vsix_file = f"{vsix_base}.vsix"
        issues.append({
            "Type": "Missing in extensions.json",
            "VSIX file": vsix_file,
            "packageName": "",
            "Details": f"{vsix_file} not found in extensions.json"
        })

    # extensions.json entries not in approved folder
    for pkg in json_packages:
        base = pkg[:-5] if pkg.endswith(".vsix") else pkg
        if base not in vsix_bases:
            issues.append({
                "Type": "Missing VSIX file",
                "VSIX file": "",
                "packageName": pkg,
                "Details": f"{pkg} not found in approved folder"
            })

    if issues:
        print("| Type | VSIX file | packageName | Details |")
        print("|------|-----------|-------------|---------|")
        for issue in issues:
            print(f"| {issue['Type']} | {issue['VSIX file']} | {issue['packageName']} | {issue['Details']} |")
        sys.exit(1)
    else:
        print("✅ All VSIX files and extensions.json entries are consistent.")
        sys.exit(0)

if __name__ == "__main__":
    main()