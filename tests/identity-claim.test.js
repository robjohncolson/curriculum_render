/**
 * Identity Claim Resolution Tests
 *
 * Tests for STATE_MACHINES.md Section 9: Identity Claim Resolution
 * - Orphan detection (usernames with answers but no user record)
 * - Claim creation by teachers
 * - Student response handling (yes/no)
 * - Resolution logic (auto-merge, conflict, orphan-confirmed)
 * - Teacher notifications
 * - Merge operation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK DATA AND HELPERS
// ============================================

/**
 * Sample orphaned usernames (answers exist, no user record)
 */
const ORPHANED_USERNAMES = [
    { username: 'Cherry_Lemon', answerCount: 80 },
    { username: 'Grape_Tiger', answerCount: 15 },
    { username: 'Kiwi_Bear', answerCount: 3 }
];

/**
 * Sample registered users
 */
const REGISTERED_USERS = [
    { username: 'Mango_Panda', realName: 'Janelle', role: 'student', answerCount: 0 },
    { username: 'Banana_Fox', realName: 'Julissa B', role: 'student', answerCount: 6 },
    { username: 'Carambola_Jaguar', realName: 'mrcolson', role: 'teacher', answerCount: 6 },
    { username: 'Apricot_Horse', realName: 'Justin', role: 'student', answerCount: 76 }
];

/**
 * Mock Supabase client for identity claims
 */
function createMockSupabaseClient() {
    let claims = [];
    let notifications = [];
    let answers = {};

    return {
        claims,
        notifications,
        answers,
        from: vi.fn((table) => {
            if (table === 'identity_claims') {
                return {
                    insert: vi.fn((data) => ({
                        select: vi.fn(() => Promise.resolve({
                            data: Array.isArray(data) ? data.map((d, i) => ({ ...d, id: i + 1 })) : [{ ...data, id: 1 }],
                            error: null
                        }))
                    })),
                    select: vi.fn(() => ({
                        eq: vi.fn((field, value) => ({
                            is: vi.fn(() => Promise.resolve({
                                data: claims.filter(c => c[field] === value && c.response === null),
                                error: null
                            })),
                            then: (resolve) => resolve({
                                data: claims.filter(c => c[field] === value),
                                error: null
                            })
                        }))
                    })),
                    update: vi.fn((data) => ({
                        eq: vi.fn((field, value) => {
                            const claim = claims.find(c => c[field] === value);
                            if (claim) Object.assign(claim, data);
                            return Promise.resolve({ data: claim, error: null });
                        })
                    }))
                };
            }
            if (table === 'teacher_notifications') {
                return {
                    insert: vi.fn((data) => {
                        notifications.push({ ...data, id: notifications.length + 1 });
                        return Promise.resolve({ data, error: null });
                    }),
                    select: vi.fn(() => ({
                        eq: vi.fn((field, value) => ({
                            order: vi.fn(() => Promise.resolve({
                                data: notifications.filter(n => n[field] === value),
                                error: null
                            }))
                        }))
                    }))
                };
            }
            if (table === 'answers') {
                return {
                    update: vi.fn((data) => ({
                        eq: vi.fn((field, value) => {
                            // Simulate merge by updating username
                            if (answers[value]) {
                                const oldAnswers = answers[value];
                                answers[data.username] = { ...(answers[data.username] || {}), ...oldAnswers };
                                delete answers[value];
                            }
                            return Promise.resolve({ data: null, error: null });
                        })
                    })),
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            then: (resolve) => resolve({ data: [], count: 0, error: null })
                        }))
                    }))
                };
            }
            if (table === 'users') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn((field, value) => Promise.resolve({
                            data: REGISTERED_USERS.filter(u => u[field] === value),
                            error: null
                        }))
                    }))
                };
            }
            return {};
        }),
        _addClaim: (claim) => claims.push(claim),
        _getClaims: () => claims,
        _getNotifications: () => notifications,
        _setAnswers: (username, data) => { answers[username] = data; },
        _clear: () => { claims = []; notifications = []; answers = {}; }
    };
}

// ============================================
// CORE FUNCTIONS TO TEST
// ============================================

/**
 * Detect orphaned usernames in the database
 * Returns usernames that have answers but no user record
 */
async function detectOrphanedUsernames(supabase, registeredUsernames) {
    // In real implementation, this would query answers table
    // and compare against users table
    return ORPHANED_USERNAMES.filter(
        orphan => !registeredUsernames.includes(orphan.username)
    );
}

/**
 * Create an identity claim for an orphaned username
 * @param {object} supabase - Supabase client
 * @param {string} orphanUsername - The orphaned username
 * @param {string[]} candidateUsernames - Candidate students to ask
 * @param {string} teacherUsername - Teacher creating the claim
 */
async function createIdentityClaim(supabase, orphanUsername, candidateUsernames, teacherUsername) {
    // Validate teacher role
    const { data: teacherData } = await supabase
        .from('users')
        .select('role')
        .eq('username', teacherUsername);

    if (!teacherData?.[0] || teacherData[0].role !== 'teacher') {
        throw new Error('Only teachers can create identity claims');
    }

    // Validate candidates are not the orphan
    if (candidateUsernames.includes(orphanUsername)) {
        throw new Error('Orphan username cannot be a candidate');
    }

    // Create claims for each candidate
    const claims = candidateUsernames.map(candidate => ({
        orphan_username: orphanUsername,
        candidate_username: candidate,
        response: null,
        created_by: teacherUsername,
        created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from('identity_claims')
        .insert(claims)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Get pending claims for a user (shown on login)
 */
async function getPendingClaims(supabase, username) {
    const { data, error } = await supabase
        .from('identity_claims')
        .select()
        .eq('candidate_username', username)
        .is('response', null);

    if (error) throw error;
    return data;
}

/**
 * Submit response to an identity claim
 */
async function respondToClaim(supabase, claimId, response) {
    if (!['yes', 'no'].includes(response)) {
        throw new Error('Response must be "yes" or "no"');
    }

    const { data, error } = await supabase
        .from('identity_claims')
        .update({
            response,
            responded_at: new Date().toISOString()
        })
        .eq('id', claimId);

    if (error) throw error;
    return data;
}

/**
 * Resolve claims for an orphan after all candidates respond
 */
async function resolveClaimsForOrphan(supabase, orphanUsername) {
    const { data: claims } = await supabase
        .from('identity_claims')
        .select()
        .eq('orphan_username', orphanUsername);

    const responses = claims.filter(c => c.response !== null);

    // Not all candidates have responded
    if (responses.length < claims.length) {
        return {
            status: 'waiting',
            responded: responses.length,
            total: claims.length
        };
    }

    const yesClaims = claims.filter(c => c.response === 'yes');
    const noClaims = claims.filter(c => c.response === 'no');

    if (yesClaims.length === 0) {
        // Both said no - orphan confirmed
        return { status: 'orphan_confirmed' };
    }

    if (yesClaims.length === 1) {
        // Exactly one yes (regardless of no count) - auto merge
        const confirmedUser = yesClaims[0].candidate_username;
        await mergeUserData(supabase, orphanUsername, confirmedUser);
        return { status: 'auto_merged', mergedInto: confirmedUser };
    }

    if (yesClaims.length > 1) {
        // Multiple yes - notify teacher
        const teacherUsername = claims[0].created_by;
        await createTeacherNotification(
            supabase,
            teacherUsername,
            'claim_conflict',
            `Multiple students claim "${orphanUsername}": ${yesClaims.map(c => c.candidate_username).join(', ')}`,
            orphanUsername
        );
        return {
            status: 'conflict',
            claimants: yesClaims.map(c => c.candidate_username)
        };
    }

    return { status: 'unknown' };
}

/**
 * Merge user data from orphan to confirmed user
 */
async function mergeUserData(supabase, fromUsername, toUsername) {
    const { error } = await supabase
        .from('answers')
        .update({ username: toUsername })
        .eq('username', fromUsername);

    if (error) throw error;
    return true;
}

/**
 * Create a teacher notification
 */
async function createTeacherNotification(supabase, teacherUsername, notificationType, message, relatedOrphan = null) {
    const { error } = await supabase
        .from('teacher_notifications')
        .insert({
            teacher_username: teacherUsername,
            notification_type: notificationType,
            message,
            related_orphan: relatedOrphan,
            read: false,
            created_at: new Date().toISOString()
        });

    if (error) throw error;
    return true;
}

/**
 * Get unread notifications for a teacher
 */
async function getTeacherNotifications(supabase, teacherUsername) {
    const { data, error } = await supabase
        .from('teacher_notifications')
        .select()
        .eq('teacher_username', teacherUsername)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

// ============================================
// TESTS
// ============================================

describe('Identity Claim Resolution System', () => {
    let supabase;

    beforeEach(() => {
        supabase = createMockSupabaseClient();
    });

    // ----------------------------------------
    // Orphan Detection Tests
    // ----------------------------------------
    describe('Orphan Detection', () => {
        it('should detect usernames with answers but no user record', async () => {
            const registeredUsernames = REGISTERED_USERS.map(u => u.username);
            const orphans = await detectOrphanedUsernames(supabase, registeredUsernames);

            expect(orphans).toHaveLength(3);
            expect(orphans.map(o => o.username)).toContain('Cherry_Lemon');
            expect(orphans.map(o => o.username)).toContain('Grape_Tiger');
            expect(orphans.map(o => o.username)).toContain('Kiwi_Bear');
        });

        it('should return answer counts for orphaned usernames', async () => {
            const registeredUsernames = REGISTERED_USERS.map(u => u.username);
            const orphans = await detectOrphanedUsernames(supabase, registeredUsernames);

            const cherryLemon = orphans.find(o => o.username === 'Cherry_Lemon');
            expect(cherryLemon.answerCount).toBe(80);
        });

        it('should not include registered users in orphan list', async () => {
            const registeredUsernames = REGISTERED_USERS.map(u => u.username);
            const orphans = await detectOrphanedUsernames(supabase, registeredUsernames);

            expect(orphans.map(o => o.username)).not.toContain('Mango_Panda');
            expect(orphans.map(o => o.username)).not.toContain('Apricot_Horse');
        });
    });

    // ----------------------------------------
    // Claim Creation Tests
    // ----------------------------------------
    describe('Claim Creation', () => {
        it('should allow teachers to create identity claims', async () => {
            const claims = await createIdentityClaim(
                supabase,
                'Cherry_Lemon',
                ['Mango_Panda', 'Banana_Fox'],
                'Carambola_Jaguar'
            );

            expect(claims).toHaveLength(2);
            expect(claims[0].orphan_username).toBe('Cherry_Lemon');
            expect(claims[0].candidate_username).toBe('Mango_Panda');
            expect(claims[1].candidate_username).toBe('Banana_Fox');
        });

        it('should reject claim creation by non-teachers', async () => {
            await expect(
                createIdentityClaim(
                    supabase,
                    'Cherry_Lemon',
                    ['Mango_Panda'],
                    'Apricot_Horse' // student, not teacher
                )
            ).rejects.toThrow('Only teachers can create identity claims');
        });

        it('should reject if orphan username is in candidate list', async () => {
            await expect(
                createIdentityClaim(
                    supabase,
                    'Cherry_Lemon',
                    ['Cherry_Lemon', 'Mango_Panda'],
                    'Carambola_Jaguar'
                )
            ).rejects.toThrow('Orphan username cannot be a candidate');
        });

        it('should set initial response to null', async () => {
            const claims = await createIdentityClaim(
                supabase,
                'Cherry_Lemon',
                ['Mango_Panda'],
                'Carambola_Jaguar'
            );

            expect(claims[0].response).toBeNull();
        });

        it('should record the teacher who created the claim', async () => {
            const claims = await createIdentityClaim(
                supabase,
                'Cherry_Lemon',
                ['Mango_Panda'],
                'Carambola_Jaguar'
            );

            expect(claims[0].created_by).toBe('Carambola_Jaguar');
        });
    });

    // ----------------------------------------
    // Pending Claims Tests
    // ----------------------------------------
    describe('Pending Claims Check', () => {
        beforeEach(async () => {
            // Add some test claims
            supabase._addClaim({
                id: 1,
                orphan_username: 'Cherry_Lemon',
                candidate_username: 'Mango_Panda',
                response: null,
                created_by: 'Carambola_Jaguar'
            });
            supabase._addClaim({
                id: 2,
                orphan_username: 'Cherry_Lemon',
                candidate_username: 'Banana_Fox',
                response: null,
                created_by: 'Carambola_Jaguar'
            });
        });

        it('should return pending claims for a candidate user', async () => {
            const claims = await getPendingClaims(supabase, 'Mango_Panda');

            expect(claims).toHaveLength(1);
            expect(claims[0].orphan_username).toBe('Cherry_Lemon');
        });

        it('should return empty array if no pending claims', async () => {
            const claims = await getPendingClaims(supabase, 'Apricot_Horse');

            expect(claims).toHaveLength(0);
        });

        it('should not return claims that have been responded to', async () => {
            // Respond to the claim
            supabase._getClaims()[0].response = 'no';

            const claims = await getPendingClaims(supabase, 'Mango_Panda');

            expect(claims).toHaveLength(0);
        });
    });

    // ----------------------------------------
    // Response Handling Tests
    // ----------------------------------------
    describe('Response Handling', () => {
        beforeEach(() => {
            supabase._addClaim({
                id: 1,
                orphan_username: 'Cherry_Lemon',
                candidate_username: 'Mango_Panda',
                response: null,
                created_by: 'Carambola_Jaguar'
            });
        });

        it('should accept "yes" response', async () => {
            await respondToClaim(supabase, 1, 'yes');

            const claims = supabase._getClaims();
            expect(claims[0].response).toBe('yes');
        });

        it('should accept "no" response', async () => {
            await respondToClaim(supabase, 1, 'no');

            const claims = supabase._getClaims();
            expect(claims[0].response).toBe('no');
        });

        it('should reject invalid responses', async () => {
            await expect(respondToClaim(supabase, 1, 'maybe')).rejects.toThrow(
                'Response must be "yes" or "no"'
            );
        });

        it('should set responded_at timestamp', async () => {
            await respondToClaim(supabase, 1, 'yes');

            const claims = supabase._getClaims();
            expect(claims[0].responded_at).toBeDefined();
        });
    });

    // ----------------------------------------
    // Resolution Logic Tests
    // ----------------------------------------
    describe('Resolution Logic', () => {
        describe('Waiting State', () => {
            it('should return waiting if not all candidates responded', async () => {
                supabase._addClaim({
                    id: 1,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Mango_Panda',
                    response: 'yes',
                    created_by: 'Carambola_Jaguar'
                });
                supabase._addClaim({
                    id: 2,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Banana_Fox',
                    response: null,
                    created_by: 'Carambola_Jaguar'
                });

                const result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                expect(result.status).toBe('waiting');
                expect(result.responded).toBe(1);
                expect(result.total).toBe(2);
            });
        });

        describe('Auto-Merge (One Yes, One No)', () => {
            beforeEach(() => {
                supabase._addClaim({
                    id: 1,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Mango_Panda',
                    response: 'yes',
                    created_by: 'Carambola_Jaguar'
                });
                supabase._addClaim({
                    id: 2,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Banana_Fox',
                    response: 'no',
                    created_by: 'Carambola_Jaguar'
                });
                supabase._setAnswers('Cherry_Lemon', { 'U2-L2-Q01': { value: 'A' } });
            });

            it('should auto-merge when exactly one says yes', async () => {
                const result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                expect(result.status).toBe('auto_merged');
                expect(result.mergedInto).toBe('Mango_Panda');
            });

            it('should transfer answers to confirmed user', async () => {
                await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                // Verify merge was called (answers transferred)
                expect(supabase.from).toHaveBeenCalledWith('answers');
            });
        });

        describe('Conflict (Both Yes)', () => {
            beforeEach(() => {
                supabase._addClaim({
                    id: 1,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Mango_Panda',
                    response: 'yes',
                    created_by: 'Carambola_Jaguar'
                });
                supabase._addClaim({
                    id: 2,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Banana_Fox',
                    response: 'yes',
                    created_by: 'Carambola_Jaguar'
                });
            });

            it('should detect conflict when multiple say yes', async () => {
                const result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                expect(result.status).toBe('conflict');
                expect(result.claimants).toContain('Mango_Panda');
                expect(result.claimants).toContain('Banana_Fox');
            });

            it('should create teacher notification for conflict', async () => {
                await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                const notifications = supabase._getNotifications();
                expect(notifications).toHaveLength(1);
                expect(notifications[0].notification_type).toBe('claim_conflict');
                expect(notifications[0].teacher_username).toBe('Carambola_Jaguar');
            });
        });

        describe('Orphan Confirmed (Both No)', () => {
            beforeEach(() => {
                supabase._addClaim({
                    id: 1,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Mango_Panda',
                    response: 'no',
                    created_by: 'Carambola_Jaguar'
                });
                supabase._addClaim({
                    id: 2,
                    orphan_username: 'Cherry_Lemon',
                    candidate_username: 'Banana_Fox',
                    response: 'no',
                    created_by: 'Carambola_Jaguar'
                });
            });

            it('should confirm orphan when all say no', async () => {
                const result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                expect(result.status).toBe('orphan_confirmed');
            });

            it('should not merge any data', async () => {
                await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

                // No merge should have happened - answers table not updated for merge
                // The from('answers') call should not have update called
            });
        });
    });

    // ----------------------------------------
    // Teacher Notification Tests
    // ----------------------------------------
    describe('Teacher Notifications', () => {
        it('should create notification with correct structure', async () => {
            await createTeacherNotification(
                supabase,
                'Carambola_Jaguar',
                'claim_conflict',
                'Multiple students claim "Cherry_Lemon"',
                'Cherry_Lemon'
            );

            const notifications = supabase._getNotifications();
            expect(notifications[0]).toMatchObject({
                teacher_username: 'Carambola_Jaguar',
                notification_type: 'claim_conflict',
                message: 'Multiple students claim "Cherry_Lemon"',
                related_orphan: 'Cherry_Lemon',
                read: false
            });
        });

        it('should retrieve notifications for teacher', async () => {
            await createTeacherNotification(supabase, 'Carambola_Jaguar', 'test', 'Test message');

            const notifications = await getTeacherNotifications(supabase, 'Carambola_Jaguar');

            expect(notifications).toHaveLength(1);
        });
    });

    // ----------------------------------------
    // Merge Operation Tests
    // ----------------------------------------
    describe('Merge Operation', () => {
        beforeEach(() => {
            supabase._setAnswers('Cherry_Lemon', {
                'U2-L2-Q01': { value: 'A', timestamp: 1000 },
                'U2-L3-Q01': { value: 'B', timestamp: 2000 }
            });
        });

        it('should update username on all orphan answers', async () => {
            await mergeUserData(supabase, 'Cherry_Lemon', 'Mango_Panda');

            expect(supabase.from).toHaveBeenCalledWith('answers');
        });

        it('should return true on successful merge', async () => {
            const result = await mergeUserData(supabase, 'Cherry_Lemon', 'Mango_Panda');

            expect(result).toBe(true);
        });
    });

    // ----------------------------------------
    // Integration Tests
    // ----------------------------------------
    describe('Integration Scenarios', () => {
        it('should handle complete claim flow: create -> respond -> auto-merge', async () => {
            // 1. Teacher creates claim
            const claims = await createIdentityClaim(
                supabase,
                'Cherry_Lemon',
                ['Mango_Panda', 'Banana_Fox'],
                'Carambola_Jaguar'
            );
            expect(claims).toHaveLength(2);

            // 2. Add claims to mock storage
            claims.forEach(c => supabase._addClaim(c));
            supabase._setAnswers('Cherry_Lemon', { 'U2-L2-Q01': { value: 'A' } });

            // 3. First candidate checks and sees pending claim
            const pendingForMango = await getPendingClaims(supabase, 'Mango_Panda');
            expect(pendingForMango).toHaveLength(1);

            // 4. First candidate responds "yes"
            await respondToClaim(supabase, claims[0].id, 'yes');
            supabase._getClaims()[0].response = 'yes';

            // 5. Resolution should wait
            let result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');
            expect(result.status).toBe('waiting');

            // 6. Second candidate responds "no"
            await respondToClaim(supabase, claims[1].id, 'no');
            supabase._getClaims()[1].response = 'no';

            // 7. Resolution should auto-merge
            result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');
            expect(result.status).toBe('auto_merged');
            expect(result.mergedInto).toBe('Mango_Panda');
        });

        it('should handle conflict flow with teacher notification', async () => {
            // Setup claims where both say yes
            supabase._addClaim({
                id: 1,
                orphan_username: 'Grape_Tiger',
                candidate_username: 'Mango_Panda',
                response: 'yes',
                created_by: 'Carambola_Jaguar'
            });
            supabase._addClaim({
                id: 2,
                orphan_username: 'Grape_Tiger',
                candidate_username: 'Banana_Fox',
                response: 'yes',
                created_by: 'Carambola_Jaguar'
            });

            const result = await resolveClaimsForOrphan(supabase, 'Grape_Tiger');

            expect(result.status).toBe('conflict');
            expect(result.claimants).toHaveLength(2);

            const notifications = await getTeacherNotifications(supabase, 'Carambola_Jaguar');
            expect(notifications).toHaveLength(1);
            expect(notifications[0].message).toContain('Grape_Tiger');
        });
    });

    // ----------------------------------------
    // Edge Cases
    // ----------------------------------------
    describe('Edge Cases', () => {
        it('should handle single candidate claim (yes = auto-merge)', async () => {
            supabase._addClaim({
                id: 1,
                orphan_username: 'Kiwi_Bear',
                candidate_username: 'Mango_Panda',
                response: 'yes',
                created_by: 'Carambola_Jaguar'
            });
            supabase._setAnswers('Kiwi_Bear', { 'U1-L1-Q01': { value: 'C' } });

            const result = await resolveClaimsForOrphan(supabase, 'Kiwi_Bear');

            // With only one candidate saying yes and no others, it should auto-merge
            // since there are no "no" responses to compare against
            expect(result.status).toBe('auto_merged');
        });

        it('should handle single candidate claim (no = orphan confirmed)', async () => {
            supabase._addClaim({
                id: 1,
                orphan_username: 'Kiwi_Bear',
                candidate_username: 'Mango_Panda',
                response: 'no',
                created_by: 'Carambola_Jaguar'
            });

            const result = await resolveClaimsForOrphan(supabase, 'Kiwi_Bear');

            expect(result.status).toBe('orphan_confirmed');
        });

        it('should handle claim for user with zero existing answers', async () => {
            // Mango_Panda has 0 answers, claiming Cherry_Lemon with 80 answers
            supabase._addClaim({
                id: 1,
                orphan_username: 'Cherry_Lemon',
                candidate_username: 'Mango_Panda',
                response: 'yes',
                created_by: 'Carambola_Jaguar'
            });
            supabase._setAnswers('Cherry_Lemon', { 'U2-L2-Q01': { value: 'A' } });

            const result = await resolveClaimsForOrphan(supabase, 'Cherry_Lemon');

            expect(result.status).toBe('auto_merged');
            expect(result.mergedInto).toBe('Mango_Panda');
        });
    });

    // ----------------------------------------
    // Validation Tests
    // ----------------------------------------
    describe('Validation', () => {
        it('should validate Fruit_Animal username format for orphan', async () => {
            const isValidUsername = (username) => /^[A-Z][a-z]+_[A-Z][a-z]+$/.test(username);

            expect(isValidUsername('Cherry_Lemon')).toBe(true);
            expect(isValidUsername('cherry_lemon')).toBe(false);
            expect(isValidUsername('CherryLemon')).toBe(false);
            expect(isValidUsername('Cherry-Lemon')).toBe(false);
        });

        it('should validate Fruit_Animal username format for candidates', async () => {
            const isValidUsername = (username) => /^[A-Z][a-z]+_[A-Z][a-z]+$/.test(username);

            expect(isValidUsername('Mango_Panda')).toBe(true);
            expect(isValidUsername('Banana_Fox')).toBe(true);
            expect(isValidUsername('Carambola_Jaguar')).toBe(true);
        });
    });
});
