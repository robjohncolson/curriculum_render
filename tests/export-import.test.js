/**
 * Export/Import Tests
 *
 * Tests for STATE_MACHINES.md Section 10:
 * - Recovery pack building
 * - Pack validation
 * - Data merging logic
 * - Timestamp-based conflict resolution
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Recovery Pack Schema Version
 */
const SCHEMA_VERSION = '2.0.0';
const PACK_VERSION = 'student-recovery-pack';

/**
 * Build recovery pack manifest
 */
function buildManifest(username, appVersion = '1.0.0') {
    return {
        version: PACK_VERSION,
        schemaVersion: SCHEMA_VERSION,
        username: username,
        timestampISO: new Date().toISOString(),
        timestamp: Date.now(),
        appBuild: appVersion,
        integrity: {
            checksumSha256: null
        }
    };
}

/**
 * Build recovery pack
 */
function buildRecoveryPack(username, userData, appVersion = '1.0.0') {
    const manifest = buildManifest(username, appVersion);

    const pack = {
        manifest,
        data: {
            answers: userData.answers || {},
            reasons: userData.reasons || {},
            attempts: userData.attempts || {},
            progress: userData.progress || {},
            badges: userData.badges || {},
            charts: userData.charts || {},
            preferences: userData.preferences || {}
        }
    };

    return pack;
}

/**
 * Compute simple checksum (mock - real impl uses SHA-256)
 */
function computeChecksum(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Validate recovery pack structure
 */
function validateRecoveryPack(pack) {
    const warnings = [];

    if (!pack) {
        return { ok: false, warnings: ['Pack is null or undefined'] };
    }

    if (!pack.manifest) {
        return { ok: false, warnings: ['Missing manifest'] };
    }

    if (!pack.manifest.version) {
        warnings.push('Missing manifest version');
    }

    if (pack.manifest.version !== PACK_VERSION) {
        warnings.push(`Unknown pack version: ${pack.manifest.version}`);
    }

    if (!pack.data) {
        return { ok: false, warnings: ['Missing data payload'] };
    }

    // Check for expected data fields
    const expectedFields = ['answers', 'reasons', 'attempts', 'progress', 'badges', 'charts'];
    for (const field of expectedFields) {
        if (pack.data[field] === undefined) {
            warnings.push(`Missing data field: ${field}`);
        }
    }

    return {
        ok: true,
        warnings,
        checksum: pack.manifest.integrity?.checksumSha256 || null
    };
}

/**
 * Standardize answer format
 * Legacy: "A" -> New: { value: "A", timestamp: 0 }
 */
function standardizeAnswerFormat(answers, defaultTimestamp = 0) {
    const standardized = {};

    for (const [qId, answer] of Object.entries(answers)) {
        if (typeof answer === 'string') {
            standardized[qId] = { value: answer, timestamp: defaultTimestamp };
        } else if (typeof answer === 'object' && answer !== null) {
            standardized[qId] = {
                value: answer.value ?? answer,
                timestamp: answer.timestamp ?? defaultTimestamp
            };
        } else {
            standardized[qId] = { value: answer, timestamp: defaultTimestamp };
        }
    }

    return standardized;
}

/**
 * Merge answers with timestamp-based conflict resolution
 * Newer timestamp wins
 */
function mergeAnswers(existing, imported) {
    const merged = { ...existing };

    for (const [qId, importedAns] of Object.entries(imported)) {
        const existingTs = existing[qId]?.timestamp || 0;
        const newTs = importedAns.timestamp || 0;

        if (newTs > existingTs) {
            // New is newer: UPDATE
            merged[qId] = importedAns;
        }
        // Otherwise keep existing (newTs <= existingTs)
    }

    return merged;
}

/**
 * Merge attempts - keep MAX
 */
function mergeAttempts(existing, imported) {
    const merged = { ...existing };

    for (const [qId, importedCount] of Object.entries(imported)) {
        const existingCount = existing[qId] || 0;
        merged[qId] = Math.max(existingCount, importedCount);
    }

    return merged;
}

/**
 * Merge progress - keep MAX
 */
function mergeProgress(existing, imported) {
    const merged = { ...existing };

    for (const [key, importedValue] of Object.entries(imported)) {
        const existingValue = existing[key] || 0;

        if (typeof importedValue === 'number' && typeof existingValue === 'number') {
            merged[key] = Math.max(existingValue, importedValue);
        } else if (importedValue && !existingValue) {
            merged[key] = importedValue;
        }
    }

    return merged;
}

/**
 * Merge badges - keep earliest timestamp
 */
function mergeBadges(existing, imported) {
    const merged = { ...existing };

    for (const [badgeId, importedBadge] of Object.entries(imported)) {
        if (!existing[badgeId]) {
            merged[badgeId] = importedBadge;
        } else {
            const existingTs = existing[badgeId].earnedAt || existing[badgeId].timestamp || Infinity;
            const importedTs = importedBadge.earnedAt || importedBadge.timestamp || Infinity;

            if (importedTs < existingTs) {
                merged[badgeId] = importedBadge;
            }
        }
    }

    return merged;
}

/**
 * Full data merge
 */
function mergeUserData(existing, imported) {
    // Standardize answer formats
    const existingAnswers = standardizeAnswerFormat(existing.answers || {});
    const importedAnswers = standardizeAnswerFormat(imported.answers || {});

    return {
        answers: mergeAnswers(existingAnswers, importedAnswers),
        reasons: { ...existing.reasons, ...imported.reasons }, // Simple overwrite
        attempts: mergeAttempts(existing.attempts || {}, imported.attempts || {}),
        progress: mergeProgress(existing.progress || {}, imported.progress || {}),
        badges: mergeBadges(existing.badges || {}, imported.badges || {}),
        charts: { ...existing.charts, ...imported.charts }, // Simple overwrite
        preferences: imported.preferences || existing.preferences || {}
    };
}

/**
 * Generate filename for export
 */
function generateExportFilename(username) {
    const date = new Date().toISOString().split('T')[0];
    return `${username}_backup_${date}.json`;
}

// ============================================
// TESTS
// ============================================

describe('Export/Import System', () => {
    describe('Manifest Building', () => {
        it('should create manifest with correct version', () => {
            const manifest = buildManifest('Apple_Tiger');

            expect(manifest.version).toBe(PACK_VERSION);
            expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
        });

        it('should include username', () => {
            const manifest = buildManifest('Apple_Tiger');
            expect(manifest.username).toBe('Apple_Tiger');
        });

        it('should include timestamps', () => {
            const manifest = buildManifest('Apple_Tiger');

            expect(manifest.timestamp).toBeGreaterThan(0);
            expect(manifest.timestampISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('should include app build version', () => {
            const manifest = buildManifest('Apple_Tiger', '2.5.0');
            expect(manifest.appBuild).toBe('2.5.0');
        });

        it('should initialize integrity with null checksum', () => {
            const manifest = buildManifest('Apple_Tiger');
            expect(manifest.integrity).toBeDefined();
            expect(manifest.integrity.checksumSha256).toBeNull();
        });
    });

    describe('Recovery Pack Building', () => {
        it('should build complete pack with all data fields', () => {
            const userData = {
                answers: { 'Q1': { value: 'A', timestamp: 1000 } },
                reasons: { 'Q1': 'Because' },
                attempts: { 'Q1': 2 },
                progress: { 'U1-L1': 100 },
                badges: { 'first_correct': { earnedAt: 1000 } },
                charts: {},
                preferences: { theme: 'dark' }
            };

            const pack = buildRecoveryPack('Apple_Tiger', userData);

            expect(pack.manifest).toBeDefined();
            expect(pack.data.answers).toEqual(userData.answers);
            expect(pack.data.reasons).toEqual(userData.reasons);
            expect(pack.data.attempts).toEqual(userData.attempts);
            expect(pack.data.progress).toEqual(userData.progress);
            expect(pack.data.badges).toEqual(userData.badges);
            expect(pack.data.preferences).toEqual(userData.preferences);
        });

        it('should handle empty user data', () => {
            const pack = buildRecoveryPack('Apple_Tiger', {});

            expect(pack.data.answers).toEqual({});
            expect(pack.data.reasons).toEqual({});
            expect(pack.data.attempts).toEqual({});
        });
    });

    describe('Pack Validation', () => {
        it('should validate correct pack', () => {
            const pack = buildRecoveryPack('Apple_Tiger', {
                answers: {},
                reasons: {},
                attempts: {},
                progress: {},
                badges: {},
                charts: {}
            });

            const result = validateRecoveryPack(pack);

            expect(result.ok).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('should reject null pack', () => {
            const result = validateRecoveryPack(null);

            expect(result.ok).toBe(false);
            expect(result.warnings).toContain('Pack is null or undefined');
        });

        it('should reject pack without manifest', () => {
            const result = validateRecoveryPack({ data: {} });

            expect(result.ok).toBe(false);
            expect(result.warnings).toContain('Missing manifest');
        });

        it('should reject pack without data', () => {
            const result = validateRecoveryPack({ manifest: { version: PACK_VERSION } });

            expect(result.ok).toBe(false);
            expect(result.warnings).toContain('Missing data payload');
        });

        it('should warn about missing data fields', () => {
            const pack = {
                manifest: { version: PACK_VERSION },
                data: {} // Missing all expected fields
            };

            const result = validateRecoveryPack(pack);

            expect(result.ok).toBe(true); // Still valid, but with warnings
            expect(result.warnings).toContain('Missing data field: answers');
            expect(result.warnings).toContain('Missing data field: reasons');
        });

        it('should warn about unknown pack version', () => {
            const pack = {
                manifest: { version: 'unknown-version' },
                data: { answers: {}, reasons: {}, attempts: {}, progress: {}, badges: {}, charts: {} }
            };

            const result = validateRecoveryPack(pack);

            expect(result.warnings).toContain('Unknown pack version: unknown-version');
        });
    });

    describe('Answer Format Standardization', () => {
        it('should convert string answers to object format', () => {
            const answers = { 'Q1': 'A', 'Q2': 'B' };
            const standardized = standardizeAnswerFormat(answers);

            expect(standardized['Q1']).toEqual({ value: 'A', timestamp: 0 });
            expect(standardized['Q2']).toEqual({ value: 'B', timestamp: 0 });
        });

        it('should preserve object answers', () => {
            const answers = {
                'Q1': { value: 'A', timestamp: 1000 },
                'Q2': { value: 'B', timestamp: 2000 }
            };
            const standardized = standardizeAnswerFormat(answers);

            expect(standardized['Q1']).toEqual({ value: 'A', timestamp: 1000 });
            expect(standardized['Q2']).toEqual({ value: 'B', timestamp: 2000 });
        });

        it('should handle mixed formats', () => {
            const answers = {
                'Q1': 'A',                           // Legacy
                'Q2': { value: 'B', timestamp: 1000 } // New
            };
            const standardized = standardizeAnswerFormat(answers);

            expect(standardized['Q1']).toEqual({ value: 'A', timestamp: 0 });
            expect(standardized['Q2']).toEqual({ value: 'B', timestamp: 1000 });
        });

        it('should use default timestamp when missing', () => {
            const answers = { 'Q1': { value: 'A' } };
            const standardized = standardizeAnswerFormat(answers, 5000);

            expect(standardized['Q1'].timestamp).toBe(5000);
        });
    });

    describe('Answer Merging', () => {
        it('should keep existing when newer', () => {
            const existing = { 'Q1': { value: 'A', timestamp: 2000 } };
            const imported = { 'Q1': { value: 'B', timestamp: 1000 } };

            const merged = mergeAnswers(existing, imported);

            expect(merged['Q1'].value).toBe('A');
        });

        it('should update when imported is newer', () => {
            const existing = { 'Q1': { value: 'A', timestamp: 1000 } };
            const imported = { 'Q1': { value: 'B', timestamp: 2000 } };

            const merged = mergeAnswers(existing, imported);

            expect(merged['Q1'].value).toBe('B');
        });

        it('should keep existing when timestamps equal', () => {
            const existing = { 'Q1': { value: 'A', timestamp: 1000 } };
            const imported = { 'Q1': { value: 'B', timestamp: 1000 } };

            const merged = mergeAnswers(existing, imported);

            expect(merged['Q1'].value).toBe('A');
        });

        it('should add new questions from imported', () => {
            const existing = { 'Q1': { value: 'A', timestamp: 1000 } };
            const imported = { 'Q2': { value: 'B', timestamp: 2000 } };

            const merged = mergeAnswers(existing, imported);

            expect(merged['Q1'].value).toBe('A');
            expect(merged['Q2'].value).toBe('B');
        });

        it('should handle empty existing', () => {
            const merged = mergeAnswers({}, { 'Q1': { value: 'A', timestamp: 1000 } });
            expect(merged['Q1'].value).toBe('A');
        });

        it('should handle empty imported', () => {
            const existing = { 'Q1': { value: 'A', timestamp: 1000 } };
            const merged = mergeAnswers(existing, {});

            expect(merged['Q1'].value).toBe('A');
        });
    });

    describe('Attempts Merging', () => {
        it('should keep maximum attempt count', () => {
            const existing = { 'Q1': 3, 'Q2': 1 };
            const imported = { 'Q1': 2, 'Q2': 5 };

            const merged = mergeAttempts(existing, imported);

            expect(merged['Q1']).toBe(3);
            expect(merged['Q2']).toBe(5);
        });

        it('should add new questions from imported', () => {
            const existing = { 'Q1': 3 };
            const imported = { 'Q2': 2 };

            const merged = mergeAttempts(existing, imported);

            expect(merged['Q1']).toBe(3);
            expect(merged['Q2']).toBe(2);
        });
    });

    describe('Progress Merging', () => {
        it('should keep maximum progress', () => {
            const existing = { 'U1-L1': 50, 'U1-L2': 100 };
            const imported = { 'U1-L1': 75, 'U1-L2': 25 };

            const merged = mergeProgress(existing, imported);

            expect(merged['U1-L1']).toBe(75);
            expect(merged['U1-L2']).toBe(100);
        });
    });

    describe('Badge Merging', () => {
        it('should keep earliest badge timestamp', () => {
            const existing = {
                'first_correct': { earnedAt: 2000 }
            };
            const imported = {
                'first_correct': { earnedAt: 1000 }
            };

            const merged = mergeBadges(existing, imported);

            expect(merged['first_correct'].earnedAt).toBe(1000);
        });

        it('should keep existing if earlier', () => {
            const existing = {
                'first_correct': { earnedAt: 1000 }
            };
            const imported = {
                'first_correct': { earnedAt: 2000 }
            };

            const merged = mergeBadges(existing, imported);

            expect(merged['first_correct'].earnedAt).toBe(1000);
        });

        it('should add new badges from imported', () => {
            const existing = { 'badge1': { earnedAt: 1000 } };
            const imported = { 'badge2': { earnedAt: 2000 } };

            const merged = mergeBadges(existing, imported);

            expect(merged['badge1']).toBeDefined();
            expect(merged['badge2']).toBeDefined();
        });
    });

    describe('Full Data Merge', () => {
        it('should merge all data types correctly', () => {
            const existing = {
                answers: { 'Q1': 'A' },
                reasons: { 'Q1': 'Old reason' },
                attempts: { 'Q1': 1 },
                progress: { 'U1-L1': 50 },
                badges: {},
                charts: {},
                preferences: { theme: 'light' }
            };

            const imported = {
                answers: { 'Q1': { value: 'B', timestamp: 1000 }, 'Q2': { value: 'C', timestamp: 2000 } },
                reasons: { 'Q1': 'New reason', 'Q2': 'Reason 2' },
                attempts: { 'Q1': 3, 'Q2': 1 },
                progress: { 'U1-L1': 100 },
                badges: { 'first_correct': { earnedAt: 1000 } },
                charts: { 'chart1': {} },
                preferences: { theme: 'dark' }
            };

            const merged = mergeUserData(existing, imported);

            // Answers: Q1 existing has timestamp 0, imported has 1000, so imported wins
            expect(merged.answers['Q1'].value).toBe('B');
            expect(merged.answers['Q2'].value).toBe('C');

            // Reasons: simple overwrite
            expect(merged.reasons['Q1']).toBe('New reason');

            // Attempts: max
            expect(merged.attempts['Q1']).toBe(3);

            // Progress: max
            expect(merged.progress['U1-L1']).toBe(100);

            // Badges: added
            expect(merged.badges['first_correct']).toBeDefined();

            // Preferences: imported wins
            expect(merged.preferences.theme).toBe('dark');
        });
    });

    describe('Filename Generation', () => {
        it('should include username', () => {
            const filename = generateExportFilename('Apple_Tiger');
            expect(filename).toContain('Apple_Tiger');
        });

        it('should include date', () => {
            const filename = generateExportFilename('Apple_Tiger');
            expect(filename).toMatch(/_backup_\d{4}-\d{2}-\d{2}/);
        });

        it('should have .json extension', () => {
            const filename = generateExportFilename('Apple_Tiger');
            expect(filename).toMatch(/\.json$/);
        });
    });

    describe('Checksum', () => {
        it('should compute consistent checksum', () => {
            const data = { answers: { 'Q1': 'A' } };
            const checksum1 = computeChecksum(data);
            const checksum2 = computeChecksum(data);

            expect(checksum1).toBe(checksum2);
        });

        it('should compute different checksum for different data', () => {
            const data1 = { answers: { 'Q1': 'A' } };
            const data2 = { answers: { 'Q1': 'B' } };

            const checksum1 = computeChecksum(data1);
            const checksum2 = computeChecksum(data2);

            expect(checksum1).not.toBe(checksum2);
        });

        it('should return hex string', () => {
            const checksum = computeChecksum({ test: 'data' });
            expect(checksum).toMatch(/^[0-9a-f]+$/);
        });
    });
});
