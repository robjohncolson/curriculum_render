# PDF Integration Guide

## Overview
This guide explains how the PDF worksheet system is integrated into the curriculum renderer.

## Current PDFs
- Topic 2.2: 1 PDF (`u2l2.pdf`)
- Topic 2.3: 1 PDF (`u2l3.pdf`)
- Topic 2.4: 2 PDFs (`u2l4_1.pdf`, `u2l4_2.pdf`)

## How It Works

### 1. Data Structure (`data/units.js`)
Each topic in the units data can now include a `pdfs` array (note: plural):

```javascript
{
  id: "2-2",
  name: "Topic 2.2",
  description: "Representing Two Categorical Variables",
  videos: [...],
  blookets: [...],
  pdfs: ["pdf/u2l2.pdf"]  // ← Array of PDF references
}
```

**For multiple PDFs per lesson:**
```javascript
{
  id: "2-4",
  name: "Topic 2.4",
  description: "Representing the Relationship Between Two Quantitative Variables",
  videos: [
    { url: "...", altUrl: "..." },
    { url: "...", altUrl: "..." }
  ],
  pdfs: [
    "pdf/u2l4_1.pdf",  // Worksheet for Video 1
    "pdf/u2l4_2.pdf"   // Worksheet for Video 2
  ]
}
```

### 2. UI Display (`index.html`)
PDFs appear in the Lesson Resources section when viewing a lesson:

- **Lesson Selector**: Shows PDF count (e.g., "📄 2 PDFs") on lesson buttons
- **Lesson View**: Displays worksheets with automatic numbering:
  - Single PDF: "📄 Follow-Along Worksheet"
  - Multiple PDFs: "📄 Follow-Along Worksheet 1", "📄 Follow-Along Worksheet 2", etc.
- PDFs appear before videos and blookets for easy access
- Each PDF opens in a new tab when clicked

### 3. Styling (`css/styles.css`)
Custom styles make PDFs visually distinct:
- Red accent color (#e74c3c) for PDF links
- Hover effects for better UX
- Dark theme support
- Responsive design

## Adding New PDFs

### Step 1: Add the PDF file(s)
Place your PDF(s) in the `pdf/` folder with a consistent naming convention:
```
pdf/u1l5.pdf       (Unit 1, Lesson 5 - single worksheet)
pdf/u3l7_1.pdf     (Unit 3, Lesson 7 - worksheet 1)
pdf/u3l7_2.pdf     (Unit 3, Lesson 7 - worksheet 2)
```

### Step 2: Update units.js
Find the corresponding topic and add the `pdfs` array:

**For a single PDF:**
```javascript
{
  id: "1-5",
  name: "Topic 1.5",
  description: "Representing a Quantitative Variable with Graphs",
  videos: [...],
  pdfs: ["pdf/u1l5.pdf"]  // Add this line (note: array format)
}
```

**For multiple PDFs:**
```javascript
{
  id: "3-7",
  name: "Topic 3.7",
  description: "...",
  videos: [
    { url: "...", altUrl: "..." },
    { url: "...", altUrl: "..." }
  ],
  pdfs: [
    "pdf/u3l7_1.pdf",  // Correlates with first video
    "pdf/u3l7_2.pdf"   // Correlates with second video
  ]
}
```

### Step 3: Test
1. Open `index.html` in a browser
2. Navigate to the unit and lesson
3. Verify the PDF indicator appears on the lesson button
4. Click into the lesson and verify the PDF link works

## Features

✅ **Multiple PDFs per Lesson**: Each lesson can have multiple worksheets (one per video)
✅ **Automatic Numbering**: System automatically numbers worksheets when there are multiple
✅ **Automatic Detection**: The system automatically detects and displays PDFs
✅ **Multiple Resources**: PDFs work alongside videos and blookets
✅ **Visual Indicators**: Lesson buttons show resource counts (e.g., "📄 2 PDFs • 📹 2 videos")
✅ **Theme Support**: Works in both light and dark themes
✅ **Mobile Friendly**: Responsive design works on all devices

## Resource Display Order
When viewing a lesson, resources appear in this order:
1. 📄 PDF Worksheets (if available)
2. 📹 Videos (if available)
3. 🎮 Blooket Games (if available)

## Technical Details

### File Paths
- PDFs are stored in: `pdf/`
- Referenced in code as: `"pdf/filename.pdf"`
- Opened in new tab when clicked

### Browser Compatibility
- Modern browsers will display PDFs inline
- Mobile devices will prompt to download or open in PDF viewer
- All links open in new tabs (`target="_blank"`)

## Troubleshooting

**PDF doesn't appear:**
- Check the file path is correct in `units.js`
- Verify the PDF file exists in the `pdf/` folder
- Check browser console for errors

**PDF won't open:**
- Verify the PDF file isn't corrupted
- Check file permissions
- Try a different browser

**Styling looks wrong:**
- Clear browser cache
- Check `css/styles.css` is loaded
- Verify no CSS conflicts

## Best Practices

1. **Naming Convention**: Use consistent naming like `u{unit}l{lesson}_{number}.pdf`
   - Example: `u2l4_1.pdf`, `u2l4_2.pdf`

2. **One Worksheet per Video**: When a lesson has multiple videos, create one worksheet for each video

3. **Array Format**: Always use array format for `pdfs`, even for single PDFs:
   - ✅ Good: `pdfs: ["pdf/u2l2.pdf"]`
   - ❌ Bad: `pdf: "pdf/u2l2.pdf"` (old format, no longer supported)

4. **Order Matters**: List PDFs in the same order as their corresponding videos

## Future Enhancements
Potential improvements:
- PDF preview thumbnails
- Download progress indicators
- PDF metadata (page count, file size)
- Optional titles for each PDF (instead of just numbering)

