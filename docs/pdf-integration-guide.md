# PDF Integration Guide

## Overview
This guide explains how the PDF worksheet system is integrated into the curriculum renderer.

## Current PDFs
- `pdf/u2l2.pdf` - Topic 2.2: Representing Two Categorical Variables
- `pdf/u2l3.pdf` - Topic 2.3: Statistics for Two Categorical Variables
- `pdf/u2l4_1.pdf` - Topic 2.4: Representing the Relationship Between Two Quantitative Variables

## How It Works

### 1. Data Structure (`data/units.js`)
Each topic in the units data can now include a `pdf` field:

```javascript
{
  id: "2-2",
  name: "Topic 2.2",
  description: "Representing Two Categorical Variables",
  videos: [...],
  blookets: [...],
  pdf: "pdf/u2l2.pdf"  // ← PDF reference
}
```

### 2. UI Display (`index.html`)
The PDF appears in the Lesson Resources section when viewing a lesson:

- **Lesson Selector**: Shows a "📄 PDF" indicator on lesson buttons that have worksheets
- **Lesson View**: Displays a prominent "📄 Follow-Along Worksheet" link at the top of the resources section
- PDFs appear before videos and blookets for easy access

### 3. Styling (`css/styles.css`)
Custom styles make PDFs visually distinct:
- Red accent color (#e74c3c) for PDF links
- Hover effects for better UX
- Dark theme support
- Responsive design

## Adding New PDFs

### Step 1: Add the PDF file
Place your PDF in the `pdf/` folder with a consistent naming convention:
```
pdf/u1l5.pdf  (Unit 1, Lesson 5)
pdf/u3l7.pdf  (Unit 3, Lesson 7)
```

### Step 2: Update units.js
Find the corresponding topic and add the `pdf` field:

```javascript
{
  id: "1-5",
  name: "Topic 1.5",
  description: "Representing a Quantitative Variable with Graphs",
  videos: [...],
  pdf: "pdf/u1l5.pdf"  // Add this line
}
```

### Step 3: Test
1. Open `index.html` in a browser
2. Navigate to the unit and lesson
3. Verify the PDF indicator appears on the lesson button
4. Click into the lesson and verify the PDF link works

## Features

✅ **Automatic Detection**: The system automatically detects and displays PDFs
✅ **Multiple Resources**: PDFs work alongside videos and blookets
✅ **Visual Indicators**: Lesson buttons show which resources are available
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

## Future Enhancements
Potential improvements:
- Multiple PDFs per lesson
- PDF preview thumbnails
- Download progress indicators
- PDF metadata (page count, file size)

