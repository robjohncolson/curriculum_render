// Diagnostic functions for Turbo Mode sync
// Run these in browser console to diagnose sync issues

// Function to see all local peer data
function checkLocalPeerData() {
    const allKeys = Object.keys(localStorage);
    const answerKeys = allKeys.filter(key => key.startsWith('answers_'));

    console.log('=== Local Peer Data Summary ===');
    console.log(`Found ${answerKeys.length} users with local data:`);

    let totalAnswers = 0;
    const summary = [];

    answerKeys.forEach(key => {
        const username = key.replace('answers_', '');
        const answers = JSON.parse(localStorage.getItem(key) || '{}');
        const answerCount = Object.keys(answers).length;
        totalAnswers += answerCount;

        if (answerCount > 0) {
            summary.push(`  ${username}: ${answerCount} answers`);
        }
    });

    summary.forEach(s => console.log(s));
    console.log(`Total: ${totalAnswers} answers across ${answerKeys.length} users`);

    return { users: answerKeys.length, answers: totalAnswers };
}

// Function to check classData
function checkClassData() {
    const classData = JSON.parse(localStorage.getItem('classData') || '{}');

    if (!classData.users) {
        console.log('No classData.users found');
        return;
    }

    console.log('=== ClassData Summary ===');
    const users = Object.keys(classData.users);
    console.log(`Found ${users.length} users in classData:`);

    let totalAnswers = 0;

    users.forEach(username => {
        const userData = classData.users[username];
        if (userData.answers) {
            const answerCount = Object.keys(userData.answers).length;
            totalAnswers += answerCount;
            console.log(`  ${username}: ${answerCount} answers`);
        }
    });

    console.log(`Total: ${totalAnswers} answers in classData`);

    return { users: users.length, answers: totalAnswers };
}

// Function to sync all peer data manually
async function manualSyncAllPeers() {
    if (!turboModeActive) {
        console.log('❌ Turbo mode not active. Check connection first.');
        return;
    }

    console.log('Starting full peer data sync...');

    // Try both sync methods
    console.log('Method 1: Syncing from individual answer keys...');
    const result1 = await syncAllLocalAnswersToSupabase();

    console.log('Method 2: Syncing from classData...');
    const result2 = await syncClassDataToSupabase();

    console.log('Sync complete! Check Supabase dashboard.');

    return { method1: result1, method2: result2 };
}

// Function to compare local vs Supabase data
async function compareLocalVsSupabase() {
    if (!supabase) {
        console.log('❌ Supabase not initialized');
        return;
    }

    // Get Supabase data
    const { data: supabaseData, error } = await supabase
        .from('answers')
        .select('*');

    if (error) {
        console.error('Failed to fetch from Supabase:', error);
        return;
    }

    // Get local data count
    const local = checkLocalPeerData();

    // Analyze Supabase data
    const supabaseUsers = new Set(supabaseData.map(a => a.username));
    const supabaseCount = supabaseData.length;

    console.log('\n=== Comparison ===');
    console.log(`Local: ${local.answers} answers from ${local.users} users`);
    console.log(`Supabase: ${supabaseCount} answers from ${supabaseUsers.size} users`);

    if (local.answers > supabaseCount) {
        console.log(`⚠️ Local has ${local.answers - supabaseCount} more answers - run manualSyncAllPeers()`);
    } else if (supabaseCount > local.answers) {
        console.log(`📥 Supabase has ${supabaseCount - local.answers} more answers - pull peer data`);
    } else {
        console.log('✅ Data appears to be in sync');
    }

    return {
        local: { answers: local.answers, users: local.users },
        supabase: { answers: supabaseCount, users: supabaseUsers.size }
    };
}

// Function to pull all peer data from Supabase and update local
async function pullAllPeerData() {
    if (!supabase) {
        console.log('❌ Supabase not initialized');
        return;
    }

    const currentUser = localStorage.getItem('consensusUsername');

    const { data, error } = await supabase
        .from('answers')
        .select('*');

    if (error) {
        console.error('Failed to pull from Supabase:', error);
        return;
    }

    console.log(`Pulled ${data.length} answers from Supabase`);

    // Group by user and update localStorage
    const userGroups = {};
    data.forEach(answer => {
        if (!userGroups[answer.username]) {
            userGroups[answer.username] = {};
        }
        userGroups[answer.username][answer.question_id] = {
            value: answer.answer_value,
            timestamp: parseInt(answer.timestamp)
        };
    });

    let updateCount = 0;
    Object.entries(userGroups).forEach(([username, answers]) => {
        // Don't overwrite current user's data
        if (username !== currentUser) {
            const key = `answers_${username}`;
            localStorage.setItem(key, JSON.stringify(answers));
            updateCount++;
            console.log(`  Updated ${username}: ${Object.keys(answers).length} answers`);
        }
    });

    console.log(`✅ Updated ${updateCount} users' data in localStorage`);

    // Update timestamp display
    updatePeerDataTimestamp();

    return updateCount;
}

// Export functions to global scope
window.checkLocalPeerData = checkLocalPeerData;
window.checkClassData = checkClassData;
window.manualSyncAllPeers = manualSyncAllPeers;
window.compareLocalVsSupabase = compareLocalVsSupabase;
window.pullAllPeerData = pullAllPeerData;

console.log('🔧 Sync diagnostic functions loaded. Available commands:');
console.log('  checkLocalPeerData() - See all local peer data');
console.log('  checkClassData() - See classData structure');
console.log('  manualSyncAllPeers() - Sync all local data to Supabase');
console.log('  compareLocalVsSupabase() - Compare local vs cloud data');
console.log('  pullAllPeerData() - Pull all peer data from Supabase');