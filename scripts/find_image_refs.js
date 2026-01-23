/**
 * Script to find all image references in curriculum.js
 * Outputs a list of questions that need screenshots
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the curriculum file
const curriculumPath = path.join(__dirname, '..', 'data', 'curriculum.js');
const content = fs.readFileSync(curriculumPath, 'utf8');

// Extract the array (handle EMBEDDED_CURRICULUM = [...])
const jsonStart = content.indexOf('[');
const jsonEnd = content.lastIndexOf(']') + 1;
const jsonContent = content.slice(jsonStart, jsonEnd);

let questions;
try {
    questions = JSON.parse(jsonContent);
} catch (e) {
    // If JSON parse fails, try eval (for JS objects with comments etc)
    try {
        questions = eval(`(${jsonContent})`);
    } catch (e2) {
        console.error('Error parsing curriculum:', e.message);
        process.exit(1);
    }
}

// Collect all image references
const imageRefs = [];

function extractImages(obj, questionId, context = '') {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
        obj.forEach((item, idx) => extractImages(item, questionId, `${context}[${idx}]`));
        return;
    }

    // Check for image property
    if (obj.image) {
        imageRefs.push({
            questionId,
            imagePath: obj.image,
            imageAlt: obj.imageAlt || '',
            imageCaption: obj.imageCaption || '',
            context
        });
    }

    // Check for images array
    if (obj.images && Array.isArray(obj.images)) {
        obj.images.forEach((img, idx) => {
            if (img.image) {
                imageRefs.push({
                    questionId,
                    imagePath: img.image,
                    imageAlt: img.imageAlt || '',
                    imageCaption: img.imageCaption || '',
                    context: `${context}.images[${idx}]`
                });
            }
        });
    }

    // Recurse into nested objects
    for (const [key, value] of Object.entries(obj)) {
        if (key !== 'image' && key !== 'imageAlt' && key !== 'imageCaption' && key !== 'images') {
            extractImages(value, questionId, context ? `${context}.${key}` : key);
        }
    }
}

// Process each question
questions.forEach(question => {
    extractImages(question, question.id || 'unknown');
});

// Output results
console.log('='.repeat(80));
console.log('IMAGE REFERENCES IN CURRICULUM');
console.log('='.repeat(80));
console.log(`\nTotal images found: ${imageRefs.length}\n`);

// Group by unit
const byUnit = {};
imageRefs.forEach(ref => {
    const unit = ref.questionId.split('-')[0] || 'Unknown';
    if (!byUnit[unit]) byUnit[unit] = [];
    byUnit[unit].push(ref);
});

// Output by unit
for (const [unit, refs] of Object.entries(byUnit).sort()) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`${unit} (${refs.length} images)`);
    console.log('─'.repeat(40));

    refs.forEach(ref => {
        console.log(`\n  Question: ${ref.questionId}`);
        console.log(`  Path: ${ref.imagePath}`);
        if (ref.imageAlt) {
            console.log(`  Alt: ${ref.imageAlt.substring(0, 80)}${ref.imageAlt.length > 80 ? '...' : ''}`);
        }
        if (ref.context && ref.context !== 'attachments') {
            console.log(`  Context: ${ref.context}`);
        }
    });
}

// Check which images exist
console.log(`\n${'='.repeat(80)}`);
console.log('FILE STATUS CHECK');
console.log('='.repeat(80));

const assetsDir = path.join(__dirname, '..');
let missing = 0;
let found = 0;

imageRefs.forEach(ref => {
    const fullPath = path.join(assetsDir, ref.imagePath);
    const exists = fs.existsSync(fullPath);
    if (!exists) {
        missing++;
        console.log(`  MISSING: ${ref.imagePath} (${ref.questionId})`);
    } else {
        found++;
    }
});

console.log(`\n${'─'.repeat(40)}`);
console.log(`Summary: ${found} found, ${missing} missing`);
console.log('─'.repeat(40));

// Output CSV for easy tracking
const csvPath = path.join(__dirname, '..', 'docs', 'image_inventory.csv');
const csvLines = [
    'Question ID,Image Path,Alt Text,Caption,Exists'
];

imageRefs.forEach(ref => {
    const fullPath = path.join(assetsDir, ref.imagePath);
    const exists = fs.existsSync(fullPath) ? 'Yes' : 'No';
    const escapeCsv = (s) => `"${(s || '').replace(/"/g, '""')}"`;
    csvLines.push([
        ref.questionId,
        ref.imagePath,
        escapeCsv(ref.imageAlt),
        escapeCsv(ref.imageCaption),
        exists
    ].join(','));
});

// Ensure docs directory exists
const docsDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(csvPath, csvLines.join('\n'));
console.log(`\nCSV inventory saved to: docs/image_inventory.csv`);
