# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AP Statistics Consensus Learning App - a browser-based quiz renderer that creates a consensus-driven learning tool for AP Statistics. The app is answer-naive (no answer keys or correctness checks), offline-resilient (uses localStorage and file exports/imports), and focuses on peer consensus with a 70% agreement threshold.

## Architecture

The system consists of:
- `quiz_renderer.html`: Single-file vanilla JavaScript/HTML/CSS application with Chart.js and MathJax integration
- `curriculum.json`: Large dataset (1.6MB) containing AP Statistics questions in MCQ and FRQ formats
- `FUNDAMENTAL.md`: Architecture documentation defining 26 irreducible atoms across 5 subsystems (Questions, User, Storage/Sync, Views, Progress/Filters)

## Key Development Principles

1. **Answer-Naive**: Remove any logic related to answer keys, solutions, or correctness checks from curriculum.json data
2. **Single-File Architecture**: All functionality is contained within quiz_renderer.html - no separate JS/CSS files
3. **Offline-First**: Uses localStorage for persistence, file import/export for manual sync (thumb drive model)
4. **Consensus-Driven**: 70% threshold for consensus on MCQ (mode-based) and FRQ (vote-based)
5. **Minimal UI**: Functional but unpolished - inline elements, no popups, low-tech approach

## Common Commands

Since this is a standalone HTML application with no build process:
- **Run locally**: Open `quiz_renderer.html` directly in a browser
- **Test changes**: Refresh the browser (F5 or Ctrl+R)
- **Debug**: Use browser DevTools console (F12)
- **Clear local data**: Use the Clear All Data button in the UI or clear localStorage via DevTools

## Code Structure

The `quiz_renderer.html` file contains:
- Embedded CSS styles in `<style>` tag
- Chart.js and MathJax loaded from CDN
- All JavaScript logic inline in `<script>` tags
- Extensive functions for question rendering, answer submission, data aggregation, and file I/O

## Important Implementation Notes

- Questions are identified by IDs like "U1-L2-Q01" (Unit-Lesson-Question format)
- Maximum 3 answer attempts per question, unlimited reasoning/voting
- Username required for accountability/reputation tracking
- Timestamps used for merge conflict resolution in multi-user sync
- FRQ responses stored as single textarea strings (no automatic sub-part parsing)