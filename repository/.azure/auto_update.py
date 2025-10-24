"""
RUN LOCALLY ONLY 

This script:
1. Gets untracked files from git status
2. Parses extension files to extract package names and versions
3. Updates extensions.json with new extensions and newer versions
"""

import json
import os
import re
import subprocess
import sys
from typing import Dict, List, Tuple, Optional

def run_git_command(command: List[str]) -> str:
    """Run a git command and return the output."""
    try:
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            cwd=os.path.dirname(__file__),
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running git command: {e}")
        return ""

def get_untracked_files() -> List[str]:
    """Get list of untracked files from git status."""
    output = run_git_command(["git", "status", "--porcelain"])
    untracked_files = []
    
    for line in output.split('\n'):
        if line.startswith('??'):
            file_path = line[3:].strip()
            if file_path.startswith('approved/') and file_path.endswith('.vsix'):
                untracked_files.append(file_path)
    
    return untracked_files

def normalize_filename(filename: str) -> str:
    """
    Normalize filename to lowercase and replace @ with -.
    
    Examples:
    - BroadcomMFD.ccf-1.2.2.vsix -> broadcommfd.ccf-1.2.2.vsix
    - BroadcomMFD.cobol-language-support-2.4.3@win32-x64.vsix -> broadcommfd.cobol-language-support-2.4.3-win32-x64.vsix
    """
    # Convert to lowercase and replace @ with -
    normalized = filename.lower().replace('@', '-')
    # Remove any spaces and replace with nothing (for cases like "3.0.2 (1)")
    normalized = re.sub(r'\s*\([0-9]+\)', '', normalized)
    return normalized

def parse_extension_filename(filename: str) -> Optional[Tuple[str, str]]:
    """
    Parse extension filename to extract package identifier and version.
    
    Returns: (package_name, version)
    
    Examples:
    - broadcommfd.ccf-1.2.2.vsix -> ('broadcommfd.ccf', '1.2.2')
    - broadcommfd.cobol-language-support-2.4.3-win32-x64.vsix -> ('broadcommfd.cobol-language-support', '2.4.3-win32-x64')
    - eamodio.gitlens-2025.8.805.vsix -> ('eamodio.gitlens', '2025.8.805')
    """
    # Remove .vsix extension
    name = filename.replace('.vsix', '')
    
    # Handle standard format: publisher.extension-version
    # Look for pattern: anything-version where version starts with a number
    match = re.match(r'^(.+)-([0-9]+(?:\.[0-9]+)*)(?:-(.+))?$', name)
    if match:
        package_name = match.group(1)
        version = match.group(2)
        if match.group(3):  # Additional version suffix
            version += f"-{match.group(3)}"
        return (package_name, version)
    
    print(f"Warning: Could not parse filename: {filename}")
    return None

def compare_versions(version1: str, version2: str) -> int:
    """
    Compare two version strings.
    Returns: 1 if version1 > version2, -1 if version1 < version2, 0 if equal
    """
    def normalize_version(v):
        # Remove platform suffixes for comparison
        v = re.sub(r'-win32-x64$', '', v)
        # Split by dots and convert to integers where possible
        parts = []
        for part in v.split('.'):
            try:
                parts.append(int(part))
            except ValueError:
                parts.append(part)
        return parts
    
    v1_parts = normalize_version(version1)
    v2_parts = normalize_version(version2)
    
    # Pad shorter version with zeros
    max_len = max(len(v1_parts), len(v2_parts))
    while len(v1_parts) < max_len:
        v1_parts.append(0)
    while len(v2_parts) < max_len:
        v2_parts.append(0)
    
    for p1, p2 in zip(v1_parts, v2_parts):
        if isinstance(p1, int) and isinstance(p2, int):
            if p1 > p2:
                return 1
            elif p1 < p2:
                return -1
        else:
            # String comparison for non-numeric parts
            if str(p1) > str(p2):
                return 1
            elif str(p1) < str(p2):
                return -1
    
    return 0

def extract_package_name_from_extension_name(package_name: str) -> str:
    """Extract the base package name without version for matching."""
    # Remove version pattern from the end
    match = re.match(r'^(.+)-[0-9]+(?:\.[0-9]+)*(?:-.*)?$', package_name)
    if match:
        return match.group(1)
    return package_name

def load_extensions_json() -> Dict:
    """Load the current extensions.json file."""
    try:
        with open('extensions.json', 'r', encoding='utf-8') as f:
            content = f.read()
            # Remove comments for JSON parsing
            content = re.sub(r'//.*', '', content)
            return json.loads(content)
    except Exception as e:
        print(f"Error loading extensions.json: {e}")
        sys.exit(1)

def save_extensions_json(data: Dict) -> None:
    """Save the updated extensions.json file."""
    try:
        with open('extensions.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("extensions.json updated successfully!")
    except Exception as e:
        print(f"Error saving extensions.json: {e}")

def rename_files(files_to_rename: List[Tuple[str, str]]) -> None:
    """Actually rename the files to their normalized versions."""
    for old_path, new_path in files_to_rename:
        try:
            os.rename(old_path, new_path)
            print(f"   Renamed: {old_path} -> {new_path}")
        except Exception as e:
            print(f"   Failed to rename {old_path}: {e}")

def main():
    """Main function to process extension updates."""
    print("Starting VS Code Extensions Auto-Update Process")
    print("=" * 60)
    
    # Get untracked files
    print("Getting untracked files from git...")
    untracked_files = get_untracked_files()
    
    if not untracked_files:
        print("No untracked .vsix files found in approved folder.")
        return
    
    print(f"Found {len(untracked_files)} untracked extension files:")
    for file in untracked_files:
        print(f"   - {file}")
    print()
    
    # Parse extension files and normalize filenames
    print("Parsing extension files and normalizing filenames...")
    new_extensions = {}
    files_to_rename = []
    
    for file_path in untracked_files:
        filename = os.path.basename(file_path)
        normalized_filename = normalize_filename(filename)
        
        # Check if file needs to be renamed
        if filename != normalized_filename:
            files_to_rename.append((file_path, f"approved/{normalized_filename}"))
            print(f"   RENAME: {filename} -> {normalized_filename}")
        
        # Parse the normalized filename
        parsed = parse_extension_filename(normalized_filename)
        
        if parsed:
            package_name, version = parsed
            new_extensions[package_name] = {
                'version': version,
                'filename': normalized_filename,
                'original_file_path': file_path,
                'normalized_file_path': f"approved/{normalized_filename}"
            }
            print(f"   {normalized_filename} -> {package_name} v{version}")
        else:
            print(f"   Failed to parse: {normalized_filename}")
    
    # Rename files to normalized versions
    if files_to_rename:
        print(f"\nRenaming {len(files_to_rename)} files to normalized format:")
        rename_files(files_to_rename)
    
    print()
    
    # Load current extensions.json
    print("Loading current extensions.json...")
    extensions_data = load_extensions_json()
    
    # Process updates and find new extensions
    print("Processing updates...")
    updates_made = False
    new_extensions_to_add = []
    existing_package_names = set()
    
    # Build set of existing package names for comparison
    for extension in extensions_data['approvedExtensions']:
        current_package_name = extension['packageName']
        base_package_name = extract_package_name_from_extension_name(current_package_name)
        existing_package_names.add(base_package_name.lower())
    
    for i, extension in enumerate(extensions_data['approvedExtensions']):
        current_package_name = extension['packageName']
        
        # Extract base package name for matching
        base_package_name = extract_package_name_from_extension_name(current_package_name)
        
        # Find matching new extension
        matching_new_extension = None
        for package_name, new_ext_info in new_extensions.items():
            if package_name == base_package_name.lower():
                matching_new_extension = (package_name, new_ext_info)
                break
        
        if matching_new_extension:
            package_name, new_ext_info = matching_new_extension
            new_version = new_ext_info['version']
            new_filename = new_ext_info['filename']
            
            # Compare versions
            current_version_match = re.search(r'-([0-9]+(?:\.[0-9]+)*(?:-.*?)?)(?:\.vsix)?$', current_package_name)
            if current_version_match:
                current_version = current_version_match.group(1)
                
                version_comparison = compare_versions(new_version, current_version)
                
                if version_comparison > 0:
                    print(f"   Updating {extension['name']}")
                    print(f"      Old: {current_package_name}")
                    
                    # Update package name with new version, ensuring lowercase
                    new_package_name = f"{package_name}-{new_version}".lower()
                    
                    extension['packageName'] = new_package_name
                    print(f"      New: {new_package_name}")
                    
                    updates_made = True
                    print()
                elif version_comparison == 0:
                    print(f"   {extension['name']} already up to date (v{current_version})")
                else:
                    print(f"   {extension['name']} - new version {new_version} is older than current {current_version}")
    
    # Check for completely new extensions
    for package_name, ext_info in new_extensions.items():
        if package_name not in existing_package_names:
            new_extensions_to_add.append({
                'name': package_name.replace('.', ' ').replace('-', ' ').title(),
                'packageName': f"{package_name}-{ext_info['version']}".lower()
            })
            print(f"   NEW EXTENSION: {package_name} v{ext_info['version']}")
    
    # Add new extensions to the approved list
    if new_extensions_to_add:
        print(f"\nAdding {len(new_extensions_to_add)} new extensions:")
        for new_ext in new_extensions_to_add:
            extensions_data['approvedExtensions'].append(new_ext)
            print(f"   Added: {new_ext['name']} ({new_ext['packageName']})")
        updates_made = True
    
    # Save updated extensions.json if changes were made
    if updates_made:
        save_extensions_json(extensions_data)
        print("Successfully updated extensions!")
    else:
        print("No updates needed - all extensions are up to date.")
    
    print()
    print("Auto-update process completed!")

if __name__ == "__main__":
    main()