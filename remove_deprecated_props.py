#!/usr/bin/env python3
"""
Script to remove deprecated properties from units.js:
- completed: false,
- completionDate: null
- current: false
"""

import re

def remove_deprecated_properties(input_file, output_file):
    with open(input_file, 'r') as f:
        lines = f.readlines()

    print(f"Processing {len(lines)} lines...")

    new_lines = []
    i = 0
    removed_completed = 0
    removed_completion_date = 0
    removed_current = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check if this line contains "completed: false,"
        if stripped == "completed: false,":
            removed_completed += 1
            print(f"Removed 'completed: false,' at line {i+1}")
            i += 1
            continue

        # Check if this line contains "completionDate: null"
        if stripped == "completionDate: null":
            removed_completion_date += 1
            print(f"Removed 'completionDate: null' at line {i+1}")
            i += 1
            continue

        # Check if this line contains "current: false"
        if stripped == "current: false":
            removed_current += 1
            print(f"Removed 'current: false' at line {i+1}")
            i += 1
            continue

        # Keep this line
        new_lines.append(line)
        i += 1

    # Write the modified content
    with open(output_file, 'w') as f:
        f.writelines(new_lines)

    print(f"\n=== REMOVAL SUMMARY ===")
    print(f"Removed {removed_completed} 'completed: false,' lines")
    print(f"Removed {removed_completion_date} 'completionDate: null' lines")
    print(f"Removed {removed_current} 'current: false' lines")
    print(f"Total lines removed: {removed_completed + removed_completion_date + removed_current}")
    print(f"Original file: {len(lines)} lines")
    print(f"New file: {len(new_lines)} lines")
    print(f"Reduction: {len(lines) - len(new_lines)} lines")

if __name__ == "__main__":
    remove_deprecated_properties("data/units.js", "data/units.js")
    print("\nFile has been updated!")
