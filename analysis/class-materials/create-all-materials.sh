#!/bin/bash
# Script to compile all LaTeX materials into PDFs

cd /mnt/c/Users/rober/OneDrive/Desktop/code/analysis/class-materials

echo "======================================"
echo "Compiling Period B Class Materials"
echo "======================================"
echo ""

echo "[1/6] Compiling exit ticket..."
pdflatex -interaction=nonstopmode exit-ticket-Q02.tex > /dev/null

echo "[2/6] Compiling weekend assignment..."
pdflatex -interaction=nonstopmode weekend-assignment.tex > /dev/null

echo "[3/6] Compiling student briefs..."
pdflatex -interaction=nonstopmode student-briefs-all.tex > /dev/null

echo "[4/6] Compiling Janelle's targeted practice packet..."
pdflatex -interaction=nonstopmode targeted-practice-Janelle.tex > /dev/null

echo "[5/6] Compiling Gabriella's targeted practice packet..."
pdflatex -interaction=nonstopmode targeted-practice-Gabriella.tex > /dev/null

echo "[6/6] Compiling teacher quick-reference..."
pdflatex -interaction=nonstopmode teacher-quick-reference.tex > /dev/null

echo ""
echo "Cleaning up auxiliary files..."
rm -f *.aux *.log *.out

echo ""
echo "======================================"
echo "SUCCESS! All PDFs created:"
echo "======================================"
ls -lh *.pdf | awk '{print "  " $9 " (" $5 ")"}'

echo ""
echo "======================================"
echo "PRINT INSTRUCTIONS FOR TOMORROW"
echo "======================================"
echo ""
echo "PRINT TONIGHT (before class):"
echo "  1. exit-ticket-Q02.pdf"
echo "       → Print 3 copies, cut into 12 quarter-sheets"
echo ""
echo "  2. student-briefs-all.pdf"
echo "       → Print 7 copies (1 per student)"
echo "       → Students: Edgar, Ana, Francois, Janelle, Hazel, Gabriella, Keily"
echo ""
echo "  3. weekend-assignment.pdf"
echo "       → Print 7 copies (1 per student)"
echo ""
echo "  4. targeted-practice-Janelle.pdf"
echo "       → Print 1 copy for Janelle (mango_panda)"
echo "       → Staple if multi-page"
echo ""
echo "  5. targeted-practice-Gabriella.pdf"
echo "       → Print 1 copy for Gabriella (guava_cat)"
echo "       → Staple if multi-page"
echo ""
echo "  6. teacher-quick-reference.pdf"
echo "       → Print 1 copy for your reference"
echo ""
echo "======================================"
echo "UPLOAD TO LMS TONIGHT:"
echo "======================================"
echo "  → Unit1-Review-Flashcards.csv (in ../docs/ folder)"
echo "  → Import to Blooket or share link with students"
echo ""
echo "======================================"
echo "TOTAL PRINT COUNT:"
echo "======================================"
echo "  3 pages (exit ticket) + 7 briefs + 7 assignments"
echo "  + 1 Janelle packet + 1 Gabriella packet + 1 teacher guide"
echo "  = Approximately 20-25 pages total"
echo ""
