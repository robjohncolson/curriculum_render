/**
 * Curriculum Data Tests
 *
 * Tests for curriculum/units data structure integrity
 * - Unit structure validation
 * - Topic structure validation
 * - Resource links (blookets, pdfs, videos)
 * - Regression tests for specific content
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================
// LOAD CURRICULUM DATA
// ============================================

let ALL_UNITS_DATA;

beforeAll(() => {
    // Load the units.js file and extract ALL_UNITS_DATA
    const unitsPath = join(__dirname, '../data/units.js');
    const fileContent = readFileSync(unitsPath, 'utf-8');

    // Extract the ALL_UNITS_DATA array using eval in a controlled way
    // We wrap it to capture the variable
    const wrappedContent = fileContent + '\nALL_UNITS_DATA;';
    ALL_UNITS_DATA = eval(wrappedContent);
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getUnit(unitId) {
    return ALL_UNITS_DATA.find(u => u.unitId === unitId);
}

function getTopic(unitId, topicId) {
    const unit = getUnit(unitId);
    if (!unit) return null;
    return unit.topics.find(t => t.id === topicId);
}

// ============================================
// TESTS
// ============================================

describe('Curriculum Data Structure', () => {
    describe('Units Array', () => {
        it('should have 9 units', () => {
            expect(ALL_UNITS_DATA.length).toBe(9);
        });

        it('should have all required unit properties', () => {
            ALL_UNITS_DATA.forEach(unit => {
                expect(unit).toHaveProperty('unitId');
                expect(unit).toHaveProperty('displayName');
                expect(unit).toHaveProperty('examWeight');
                expect(unit).toHaveProperty('topics');
                expect(Array.isArray(unit.topics)).toBe(true);
            });
        });

        it('should have units in correct order', () => {
            const unitIds = ALL_UNITS_DATA.map(u => u.unitId);
            expect(unitIds).toEqual([
                'unit1', 'unit2', 'unit3', 'unit4', 'unit5',
                'unit6', 'unit7', 'unit8', 'unit9'
            ]);
        });
    });

    describe('Topic Structure', () => {
        it('should have required topic properties', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    expect(topic).toHaveProperty('id');
                    expect(topic).toHaveProperty('name');
                    expect(topic).toHaveProperty('description');
                    // videos may be empty for capstone
                    expect(topic).toHaveProperty('videos');
                });
            });
        });

        it('should have valid topic id format', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    // Format: "N-M" or "N-capstone" where N is unit number
                    expect(topic.id).toMatch(/^\d+-(\d+|capstone)$/);
                });
            });
        });

        it('should have capstone topics for each unit', () => {
            ALL_UNITS_DATA.forEach(unit => {
                const capstone = unit.topics.find(t => t.id.endsWith('-capstone'));
                expect(capstone).toBeDefined();
                expect(capstone.isCapstone).toBe(true);
            });
        });
    });

    describe('Video Structure', () => {
        it('should have valid video objects with url property', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.videos && topic.videos.length > 0) {
                        topic.videos.forEach(video => {
                            expect(video).toHaveProperty('url');
                            expect(video.url).toMatch(/^https?:\/\//);
                        });
                    }
                });
            });
        });
    });

    describe('Blookets Structure', () => {
        it('should have valid blooket objects with url and title', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.blookets && topic.blookets.length > 0) {
                        topic.blookets.forEach(blooket => {
                            expect(blooket).toHaveProperty('url');
                            expect(blooket).toHaveProperty('title');
                            expect(blooket.url).toMatch(/^https?:\/\//);
                        });
                    }
                });
            });
        });
    });

    describe('PDFs Structure', () => {
        it('should have valid pdf objects or strings', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.pdfs && topic.pdfs.length > 0) {
                        topic.pdfs.forEach(pdf => {
                            if (typeof pdf === 'string') {
                                // Simple string format
                                expect(pdf.length).toBeGreaterThan(0);
                            } else if (typeof pdf === 'object') {
                                // Object format with url and label
                                expect(pdf).toHaveProperty('url');
                                expect(pdf).toHaveProperty('label');
                            }
                        });
                    }
                });
            });
        });
    });
});

describe('Unit 4 Content Regression Tests', () => {
    describe('Topic 4.1 - Random and Non-Random Patterns', () => {
        let topic;

        beforeAll(() => {
            topic = getTopic('unit4', '4-1');
        });

        it('should exist', () => {
            expect(topic).toBeDefined();
        });

        it('should have correct name and description', () => {
            expect(topic.name).toBe('Topic 4.1');
            expect(topic.description).toContain('Random and Non-Random Patterns');
        });

        it('should have at least one video', () => {
            expect(topic.videos).toBeDefined();
            expect(topic.videos.length).toBeGreaterThanOrEqual(1);
        });

        it('should have blookets array with u4l1-2 blooket', () => {
            expect(topic.blookets).toBeDefined();
            expect(topic.blookets.length).toBeGreaterThanOrEqual(1);

            const u4Blooket = topic.blookets.find(b =>
                b.url === 'https://dashboard.blooket.com/set/696edcfa2761a89ccdaf2fdc'
            );
            expect(u4Blooket).toBeDefined();
            expect(u4Blooket.title).toBe('u4l1-2blooket');
        });

        it('should have pdfs array with follow-along worksheet', () => {
            expect(topic.pdfs).toBeDefined();
            expect(topic.pdfs.length).toBeGreaterThanOrEqual(1);

            const worksheet = topic.pdfs.find(p =>
                p.url === 'https://robjohncolson.github.io/apstats-live-worksheet/u4_lesson1-2_live.html'
            );
            expect(worksheet).toBeDefined();
            expect(worksheet.label).toContain('Follow-Along Worksheet');
        });
    });

    describe('Topic 4.2 - Estimating Probabilities Using Simulation', () => {
        let topic;

        beforeAll(() => {
            topic = getTopic('unit4', '4-2');
        });

        it('should exist', () => {
            expect(topic).toBeDefined();
        });

        it('should have correct name and description', () => {
            expect(topic.name).toBe('Topic 4.2');
            expect(topic.description).toContain('Estimating Probabilities');
        });

        it('should have at least two videos', () => {
            expect(topic.videos).toBeDefined();
            expect(topic.videos.length).toBeGreaterThanOrEqual(2);
        });

        it('should have blookets array with u4l1-2 blooket', () => {
            expect(topic.blookets).toBeDefined();
            expect(topic.blookets.length).toBeGreaterThanOrEqual(1);

            const u4Blooket = topic.blookets.find(b =>
                b.url === 'https://dashboard.blooket.com/set/696edcfa2761a89ccdaf2fdc'
            );
            expect(u4Blooket).toBeDefined();
            expect(u4Blooket.title).toBe('u4l1-2blooket');
        });

        it('should have pdfs array with follow-along worksheet', () => {
            expect(topic.pdfs).toBeDefined();
            expect(topic.pdfs.length).toBeGreaterThanOrEqual(1);

            const worksheet = topic.pdfs.find(p =>
                p.url === 'https://robjohncolson.github.io/apstats-live-worksheet/u4_lesson1-2_live.html'
            );
            expect(worksheet).toBeDefined();
            expect(worksheet.label).toContain('Follow-Along Worksheet');
        });
    });

    describe('Unit 4 Blooket URL Consistency', () => {
        it('should have same blooket URL for lessons 1 and 2', () => {
            const topic1 = getTopic('unit4', '4-1');
            const topic2 = getTopic('unit4', '4-2');

            const blooket1 = topic1.blookets.find(b => b.title === 'u4l1-2blooket');
            const blooket2 = topic2.blookets.find(b => b.title === 'u4l1-2blooket');

            expect(blooket1.url).toBe(blooket2.url);
        });

        it('should have same worksheet URL for lessons 1 and 2', () => {
            const topic1 = getTopic('unit4', '4-1');
            const topic2 = getTopic('unit4', '4-2');

            const worksheet1 = topic1.pdfs.find(p =>
                p.url.includes('u4_lesson1-2_live.html')
            );
            const worksheet2 = topic2.pdfs.find(p =>
                p.url.includes('u4_lesson1-2_live.html')
            );

            expect(worksheet1.url).toBe(worksheet2.url);
        });
    });
});

describe('Resource URL Validation', () => {
    describe('Blooket URLs', () => {
        it('should all be valid Blooket dashboard URLs', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.blookets) {
                        topic.blookets.forEach(blooket => {
                            if (blooket.url.includes('blooket.com')) {
                                expect(blooket.url).toMatch(
                                    /^https:\/\/dashboard\.blooket\.com\/set\/[a-f0-9]+$/
                                );
                            }
                        });
                    }
                });
            });
        });
    });

    describe('AP Classroom URLs', () => {
        it('should all be valid AP Classroom URLs', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.videos) {
                        topic.videos.forEach(video => {
                            if (video.url.includes('apclassroom')) {
                                expect(video.url).toMatch(
                                    /^https:\/\/apclassroom\.collegeboard\.org\/d\/[a-z0-9]+\?sui=\d+,\d+$/
                                );
                            }
                        });
                    }
                });
            });
        });
    });

    describe('GitHub Pages URLs', () => {
        it('should be valid robjohncolson GitHub Pages URLs', () => {
            ALL_UNITS_DATA.forEach(unit => {
                unit.topics.forEach(topic => {
                    if (topic.pdfs) {
                        topic.pdfs.forEach(pdf => {
                            const url = typeof pdf === 'string' ? pdf : pdf.url;
                            if (url && url.includes('robjohncolson.github.io')) {
                                expect(url).toMatch(
                                    /^https:\/\/robjohncolson\.github\.io\/[a-z0-9-]+\/[a-z0-9_-]+\.html$/i
                                );
                            }
                        });
                    }
                });
            });
        });
    });
});
