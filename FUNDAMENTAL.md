# AP Statistics Consensus App - Simplified Architecture

## Overview
This app extends the existing quiz_renderer.html (vanilla JS/HTML/CSS with Chart.js and MathJax) to create a consensus-based learning tool for AP Statistics. It uses curriculum.json for questions (MCQ and FRQ types only). Key principles:
- Answer-naive: No answer keys, solutions, or correctness checks—remove all such logic.
- Offline-resilient: Browser-based, uses localStorage for data, file exports/imports for manual sync (thumb drive).
- Consensus-driven: Post-submission views show distributions (MCQ dotplots) or peer responses/votes (FRQ), with 70% thresholds.
- User accountability: Usernames tie to visible contributions (answers, reasons, votes) for reputation.
- Minimal UI: Unpolished but functional—inline elements, no popups, low-tech.

## System Definition
**S** = **Q** ∪ **U** ∪ **S** ∪ **V** ∪ **P**

Where:
- **Q** (Questions): Rendering from curriculum.json - 4 atoms
- **U** (User): Identity and inputs - 5 atoms
- **S** (Storage/Sync): Local data and file ops - 6 atoms
- **V** (Views): Distributions and peer interactions - 7 atoms
- **P** (Progress/Filters): Navigation and limits - 4 atoms

Total: 26 irreducible atoms (simplified from original 58).

## Core Atoms

### Questions Subsystem (Q)
**Data Atoms** (2):
1. `questionId: String` - e.g., "U1-L2-Q01"
2. `type: Enum{"multiple-choice", "free-response"}`

**Function Atoms** (2):
1. `renderQuestion: Object → HTML` - Display prompt, attachments (charts/tables/LaTeX)
2. `parseFRQParts: String → Array<String>` - Fallback to single textarea; no auto-parsing sub-parts

### User Subsystem (U)
**Data Atoms** (3):
1. `username: String` - For accountability/reputation
2. `answers: Record<QuestionId, Value>` - MCQ: String (choice); FRQ: String (big textarea text)
3. `reasons: Record<QuestionId, String>` - Optional explanation text (unlimited)

**Function Atoms** (2):
1. `promptUsername: () → String` - Input on first run
2. `submitAnswer: (QuestionId, Value) → Void` - Store with attempt count (max 3)

### Storage/Sync Subsystem (S)
**Data Atoms** (3):
1. `classData: JSON` - {users: {username: {answers, reasons, votes, timestamps, attempts}}}
2. `timestamps: Record<QuestionId, Float>` - For merge conflicts
3. `attempts: Record<QuestionId, Int>` - Per question (max 3 for answers)

**Function Atoms** (3):
1. `saveToLocal: JSON → Void` - Use localStorage
2. `exportData: () → File` - Download username.json (personal) or class_data.json (master)
3. `importMerge: File(s) → JSON` - Merge with timestamp priority; multi-file for class sync

### Views Subsystem (V)
**Data Atoms** (3):
1. `votes: Record<QuestionId, Record<Username, {vote: "approve"|"disapprove", reason: String}>>` - Per FRQ (unlimited)
2. `consensusThreshold: Float` - Hardcoded 0.7 (70%)
3. `contributors: Array<Username>` - For lists in views

**Function Atoms** (4):
1. `aggregateMCQ: Array<Answers> → ChartData` - Counts for dotplot
2. `aggregateFRQ: Array<Responses> → SortedList` - By net votes (approves - disapproves)
3. `checkConsensus: Aggregates → String` - "Consensus on [mode]" if ≥70%; vote-based for FRQ
4. `renderView: QuestionId → HTML` - Dotplot/list + lists with usernames/reasons/votes; self-preview if no peers

### Progress/Filters Subsystem (P)
**Data Atoms** (2):
1. `completed: Set<QuestionId>` - For unlocking views
2. `filters: {unit: String, lesson: String, type: Enum, id: String}`

**Function Atoms** (2):
1. `applyFilters: Filters → Array<Questions>` - Re-render subset
2. `tagQuiz: String → Void` - e.g., "_pre" or "_post" for re-assessments/comparisons

## System Invariants
1. **Answer-Naive**: No access to answerKey/solution/reasoning.
2. **Attempt Limits**: ∀ question q: attempts(q) ≤ 3 for answers; unlimited for reasons/votes.
3. **Partial FRQ**: Allow incomplete parts; views/votes per submitted content.
4. **Consensus**: MCQ: mode / total ≥ 0.7; FRQ: net votes / total votes ≥ 0.7 per response.
5. **Reputation**: All views show usernames tied to contributions.
6. **Offline**: All ops via localStorage/files; no server.
7. **Merge Safety**: Latest timestamp wins conflicts.
8. **Self-Preview**: Views work with self-data only if no peers synced.

## Dependency Graph