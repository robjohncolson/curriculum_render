# Turbo Mode Troubleshooting Guide

## Quick Diagnosis Steps

### 1. Check Supabase Table Setup

Go to your Supabase project dashboard:
1. Navigate to **Table Editor**
2. Check if `answers` table exists
3. If not, run the simplified schema:
   - Go to **SQL Editor**
   - Paste contents of `supabase_schema_simple.sql`
   - Click **Run**

### 2. Check RLS (Row Level Security) Settings

In Supabase dashboard:
1. Go to **Authentication** → **Policies**
2. Find the `answers` table
3. Ensure RLS is **enabled** but with **permissive policies**:
   - Should have policies for SELECT, INSERT, UPDATE
   - All should allow `true` (public access)

### 3. Quick Fix for RLS Issues

If data isn't syncing, try this in the SQL Editor:

```sql
-- Temporarily disable RLS to test (NOT for production!)
ALTER TABLE answers DISABLE ROW LEVEL SECURITY;

-- Or create a completely open policy
DROP POLICY IF EXISTS "Enable all access" ON answers;
CREATE POLICY "Enable all access" ON answers
  FOR ALL USING (true) WITH CHECK (true);
```

### 4. Browser Console Checks

Open browser console (F12) and look for these messages:

✅ **Good Signs:**
- `🚀 Supabase client initialized`
- `✅ Turbo mode active - Supabase connected`
- `Found X local answers for [username]`
- `✅ Synced answer for [question_id] to cloud`

❌ **Issues to Address:**
- `Supabase test query error:` - Check table exists and RLS
- `Failed to sync answer:` - Check specific error message
- `No username found` - Need to set username first

### 5. Test Manual Sync

In browser console, run:
```javascript
// Test if Supabase is connected
console.log('Supabase client:', supabase);
console.log('Turbo mode active:', turboModeActive);

// Try manual sync
syncAllLocalAnswersToSupabase().then(result => {
    console.log('Manual sync result:', result);
});
```

### 6. Check Supabase Logs

In Supabase dashboard:
1. Go to **Logs** → **API Logs**
2. Look for recent requests
3. Check for 403 (permission) or 400 (bad request) errors

## Common Issues & Solutions

### Issue: "Turbo mode active" but no data in Supabase

**Cause:** RLS policies blocking writes

**Solution:**
1. Run `supabase_schema_simple.sql` again
2. Check that policies allow public access
3. Test with RLS temporarily disabled

### Issue: "relation 'answers' does not exist"

**Cause:** Tables not created

**Solution:**
1. Go to SQL Editor in Supabase
2. Run the schema SQL file
3. Verify tables exist in Table Editor

### Issue: Sync shows "0 answers to cloud" despite having local answers

**Cause:** Answer format mismatch or username issues

**Solution:**
1. Check username is set: `localStorage.getItem('consensusUsername')`
2. Check answer format: `JSON.parse(localStorage.getItem('answers_' + localStorage.getItem('consensusUsername')))`
3. Ensure answers have `value` and `timestamp` properties

### Issue: Real-time updates not working

**Cause:** Realtime not enabled for table

**Solution:**
1. Go to **Database** → **Replication**
2. Enable replication for `answers` table
3. Restart the page

## Testing Step-by-Step

### 1. Test Basic Connection
```javascript
// In browser console
supabase.from('answers').select('*').limit(1).then(console.log);
```

### 2. Test Insert
```javascript
// In browser console
supabase.from('answers').insert({
    username: 'test_user',
    question_id: 'test_q1',
    answer_value: 'A',
    timestamp: Date.now()
}).then(console.log);
```

### 3. Test Upsert
```javascript
// In browser console
supabase.from('answers').upsert({
    username: 'test_user',
    question_id: 'test_q1',
    answer_value: 'B',
    timestamp: Date.now()
}, { onConflict: 'username,question_id' }).then(console.log);
```

## Quick Reset

If nothing works, try a complete reset:

1. **In Supabase SQL Editor:**
```sql
-- Drop everything
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS badges CASCADE;

-- Re-run the schema
-- (paste supabase_schema_simple.sql here)
```

2. **In browser:**
- Clear browser cache
- Reload page
- Set username again
- Try submitting a new answer

## Contact Support

If issues persist:
1. Check Supabase service status
2. Verify your project isn't paused (free tier pauses after inactivity)
3. Check API quota limits in project settings