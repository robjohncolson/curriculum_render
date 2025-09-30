// Railway Server Configuration
// Set USE_RAILWAY to true to enable the Railway server integration

// Toggle this to enable/disable Railway server
window.USE_RAILWAY = true; // Set to true when your Railway server is deployed

// Your Railway server URL (update after deployment)
window.RAILWAY_SERVER_URL = 'https://curriculumrender-production.up.railway.app'; // Change to your Railway URL like 'https://your-app.up.railway.app'

// This configuration allows you to easily switch between:
// - Direct Supabase connection (USE_RAILWAY = false)
// - Railway server proxy (USE_RAILWAY = true)