# Turbo Mode Setup Guide

## Overview
Turbo Mode adds automatic cloud synchronization to the AP Stats Consensus Quiz application using Supabase. When enabled, it automatically syncs student answers in real-time, eliminating the need for manual file exports/imports.

## Features
- ⚡ Real-time answer synchronization across all students
- 📊 Automatic peer data updates (no manual import needed)
- 🔄 Seamless fallback to offline mode when internet is unavailable
- 📈 Live teacher dashboard for monitoring class progress
- ⏱️ "Peer data current as of" timestamp indicator

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project (free tier is sufficient for classroom use)
3. Wait for the project to initialize (~2 minutes)

### 2. Set Up the Database

1. In your Supabase project dashboard, go to the SQL Editor
2. Open the file `supabase_schema.sql` from this repository
3. Copy and paste the entire contents into the SQL editor
4. Click "Run" to create the tables and functions

### 3. Configure the Application

1. In your Supabase project dashboard, go to Settings → API
2. Copy your project URL (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
3. Copy your anon/public key (a long string starting with `eyJ...`)
4. Edit the file `supabase_config.js`:
   ```javascript
   const SUPABASE_URL = 'your-project-url-here';
   const SUPABASE_ANON_KEY = 'your-anon-key-here';
   ```
5. Save the file

### 4. Deploy the Application

Upload all files to your web server, maintaining the directory structure. The application will automatically detect the Supabase configuration and enable turbo mode.

## How It Works

### For Students

When turbo mode is active:
- Answers sync automatically to the cloud after each submission
- Peer responses update in real-time without page refresh
- A timestamp shows when peer data was last updated
- If internet fails, the app seamlessly falls back to local storage

The app displays: "📊 Peer data current as of: [timestamp]"
- With turbo mode: Shows "Just now" or recent time
- Without turbo mode: Shows time of last manual import

### For Teachers

Access the teacher dashboard at `teacher_dashboard.html` to see:
- Real-time student progress
- Answer distribution for each question
- Student activity timestamps
- Class-wide statistics

No authentication is needed - the dashboard is read-only and shows public class data.

## Fallback Behavior

The app maintains full functionality even without internet:

1. **Good Internet**: Turbo mode active
   - Automatic sync every answer
   - Real-time peer updates
   - Live dashboard updates

2. **Poor/No Internet**: Offline mode
   - Saves all data locally
   - Manual export/import workflow available
   - Syncs automatically when connection restored

## Troubleshooting

### Turbo Mode Not Activating

Check browser console for messages:
- "🚀 Supabase client initialized" = Configuration successful
- "📝 Supabase config not set" = Check supabase_config.js
- "🔌 Turbo mode inactive" = Connection issues

### Data Not Syncing

1. Verify Supabase credentials in `supabase_config.js`
2. Check Supabase dashboard for API limits
3. Ensure tables were created (run SQL schema)
4. Check browser console for error messages

### Teacher Dashboard Issues

1. Ensure same Supabase credentials in both files
2. Check that students have submitted answers
3. Verify Supabase project is active (not paused)

## Bandwidth & Costs

Free Supabase tier includes:
- 500MB database
- 2GB bandwidth
- 50MB file storage
- 500K API requests/month

This is sufficient for:
- ~100 students
- Full semester of daily use
- Real-time synchronization

## Privacy & Security

- No personal information stored (username only)
- All class data is visible to all participants (by design)
- Teacher dashboard is read-only
- No authentication required (simplicity over security)

## Migration Guide

If you have existing data:

1. Students export their current data (Save button)
2. Enable turbo mode (add Supabase config)
3. Students continue working - data auto-syncs
4. Old export/import buttons remain functional as backup

## Support

For issues or questions:
- Check browser console for error messages
- Verify Supabase project status
- Ensure proper file permissions on web server
- Test with a simple answer submission first