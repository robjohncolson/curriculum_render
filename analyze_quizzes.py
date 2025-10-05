#!/usr/bin/env python3
"""
Script to analyze all quizzes arrays in units.js and prepare for their removal
"""

import re

def analyze_quizzes_arrays(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()

    total_lines = len(lines)
    print(f"Total lines in file: {total_lines}")

    # Find all quizzes array starts
    quizzes_starts = []
    empty_quizzes = []
    populated_quizzes = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check if this line starts a quizzes array
        if 'quizzes:' in line:
            start_line = i + 1  # Convert to 1-based line numbering

            # Check if it's an empty array on the same line
            if 'quizzes: []' in line or 'quizzes:[]' in line:
                empty_quizzes.append({
                    'start': start_line,
                    'end': start_line,
                    'type': 'empty',
                    'content': line.strip()
                })
            else:
                # It's a multi-line array, find the closing bracket
                bracket_count = line.count('[') - line.count(']')
                end_line = i

                # Keep looking for the closing bracket
                while bracket_count > 0 and end_line < len(lines) - 1:
                    end_line += 1
                    bracket_count += lines[end_line].count('[') - lines[end_line].count(']')

                populated_quizzes.append({
                    'start': start_line,
                    'end': end_line + 1,  # Convert to 1-based
                    'type': 'populated',
                    'lines': end_line - i + 1,
                    'preview': lines[i].strip()[:50] + '...' if len(lines[i].strip()) > 50 else lines[i].strip()
                })
        i += 1

    # Summary statistics
    print(f"\n=== QUIZZES ARRAY ANALYSIS ===")
    print(f"Total quizzes arrays found: {len(empty_quizzes) + len(populated_quizzes)}")
    print(f"  - Empty arrays: {len(empty_quizzes)}")
    print(f"  - Populated arrays: {len(populated_quizzes)}")

    # Show sample of empty arrays
    print(f"\n=== EMPTY QUIZZES (first 5) ===")
    for q in empty_quizzes[:5]:
        print(f"  Line {q['start']}: {q['content']}")
    if len(empty_quizzes) > 5:
        print(f"  ... and {len(empty_quizzes) - 5} more")

    # Show populated arrays
    print(f"\n=== POPULATED QUIZZES (first 10) ===")
    for q in populated_quizzes[:10]:
        print(f"  Lines {q['start']}-{q['end']} ({q['lines']} lines): {q['preview']}")
    if len(populated_quizzes) > 10:
        print(f"  ... and {len(populated_quizzes) - 10} more")

    # Calculate total lines to be removed
    total_lines_to_remove = len(empty_quizzes)  # Each empty is 1 line
    for q in populated_quizzes:
        total_lines_to_remove += q['lines']

    print(f"\n=== REMOVAL IMPACT ===")
    print(f"Total lines to be removed: {total_lines_to_remove}")
    print(f"File will shrink from {total_lines} to approximately {total_lines - total_lines_to_remove} lines")

    # Check for different formatting patterns
    print(f"\n=== FORMATTING PATTERNS ===")
    patterns = {
        'with_space': 0,
        'no_space': 0,
        'multiline_start': 0
    }

    for line_num, line in enumerate(lines, 1):
        if 'quizzes: [' in line:
            patterns['with_space'] += 1
        elif 'quizzes:[' in line:
            patterns['no_space'] += 1
        elif 'quizzes:' in line and '[' not in line:
            patterns['multiline_start'] += 1

    print(f"  'quizzes: [' pattern: {patterns['with_space']} occurrences")
    print(f"  'quizzes:[' pattern: {patterns['no_space']} occurrences")
    print(f"  'quizzes:' on separate line from '[': {patterns['multiline_start']} occurrences")

    return {
        'total': len(empty_quizzes) + len(populated_quizzes),
        'empty': empty_quizzes,
        'populated': populated_quizzes,
        'lines_to_remove': total_lines_to_remove
    }

if __name__ == "__main__":
    result = analyze_quizzes_arrays("data/units.js")