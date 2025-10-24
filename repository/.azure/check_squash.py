import os
import subprocess
import sys

def get_env_branch(var):
    val = os.environ.get(var)
    if not val:
        print(f"Environment variable {var} not set.")
        sys.exit(1)
    # Remove refs/heads/ if present
    return val.replace("refs/heads/", "")

def run_git(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Git command failed: {' '.join(cmd)}\n{result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

def main():
    source_branch = "test"
    target_branch = "main"

    # Fetch both branches
    run_git(["git", "fetch", "origin", source_branch])
    run_git(["git", "fetch", "origin", target_branch])

    # Count commits unique to the PR branch
    count = run_git([
        "git", "rev-list", "--count", f"origin/{target_branch}..origin/{source_branch}"
    ])

    try:
        count_int = int(count)
    except ValueError:
        print(f"Unexpected output from git rev-list: {count}")
        sys.exit(1)

    if count_int == 1:
        print("PR is squashed to one commit.")
        sys.exit(0)
    else:
        print(f"PR has {count_int} commits. Please squash to a single commit before merging.")
        sys.exit(1)

if __name__ == "__main__":
    main()