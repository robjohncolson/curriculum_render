#!/usr/bin/env python3
"""
Script to remove all quizzes arrays from units.js
"""

import re

def remove_all_quizzes(input_file, output_file):
    with open(input_file, 'r') as f:
        lines = f.readlines()

    print(f"Processing {len(lines)} lines...")

    new_lines = []
    i = 0
    removed_count = 0
    removed_lines_count = 0

    while i < len(lines):
        line = lines[i]

        # Check if this line contains "quizzes:"
        if 'quizzes:' in line:
            removed_count += 1
            start_line = i

            # Check if it's an empty array on the same line
            if 'quizzes: [],' in line or 'quizzes:[],' in line:
                # Skip this single line
                removed_lines_count += 1
                print(f"Removed empty quizzes at line {i+1}")
                i += 1
                continue
            else:
                # It's a multi-line array, find the closing bracket
                bracket_count = line.count('[') - line.count(']')
                end_line = i

                # Keep looking for the closing bracket
                while bracket_count > 0 and end_line < len(lines) - 1:
                    end_line += 1
                    bracket_count += lines[end_line].count('[') - lines[end_line].count(']')

                # Check if there's a comma after the closing bracket
                if end_line < len(lines):
                    # Look for the line with the closing bracket and comma
                    # The closing bracket might be followed by a comma on the same line
                    closing_line = lines[end_line]
                    # If the closing bracket line has a trailing comma, include it in removal
                    if '],' in closing_line:
                        # This is the common case
                        pass

                lines_removed = end_line - start_line + 1
                removed_lines_count += lines_removed
                print(f"Removed populated quizzes at lines {i+1}-{end_line+1} ({lines_removed} lines)")

                # Skip all lines from start to end (inclusive)
                i = end_line + 1
                continue

        # Keep this line
        new_lines.append(line)
        i += 1

    # Write the modified content
    with open(output_file, 'w') as f:
        f.writelines(new_lines)

    print(f"\n=== REMOVAL SUMMARY ===")
    print(f"Removed {removed_count} quizzes arrays")
    print(f"Removed {removed_lines_count} total lines")
    print(f"Original file: {len(lines)} lines")
    print(f"New file: {len(new_lines)} lines")
    print(f"Reduction: {len(lines) - len(new_lines)} lines")

if __name__ == "__main__":
    remove_all_quizzes("data/units.js", "data/units.js")
    print("\nFile has been updated!")
