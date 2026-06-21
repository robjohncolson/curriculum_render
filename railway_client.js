// Railway Server Integration for AP Stats Turbo Mode
  // This replaces direct Supabase calls with Railway server calls
  // Updated to write peer data to IndexedDB peerCache store

  // Configuration
  const RAILWAY_SERVER_URL = window.RAILWAY_SERVER_URL || 'https://your-app.up.railway.app';
  const USE_RAILWAY = window.USE_RAILWAY || false;

  // WebSocket connection
  let ws = null;
  let wsReconnectTimer = null;
  let wsConnected = false;
  let wsPingInterval = null;

  // Initialize Railway connection
  function initializeRailwayConnection() {
      if (!USE_RAILWAY) {
          console.log('Railway server disabled, using direct Supabase');
          return false;
      }

      // Skip if in LAN or offline mode - no point trying Railway
      if (typeof NetworkManager !== 'undefined' && NetworkManager.currentTier !== 'turbo') {
          console.log('🚂 Skipping Railway init - network tier is', NetworkManager.currentTier);
          return false;
      }

      console.log('🚂 Initializing Railway server connection...');

      // Capture original functions if not already captured
      if (typeof window.originalPushAnswer !== 'function' && typeof window.pushAnswerToSupabase === 'function') {
          window.originalPushAnswer = window.pushAnswerToSupabase;
      }
      if (typeof window.originalPullPeerData !== 'function' && typeof window.pullPeerDataFromSupabase === 'function') {
          window.originalPullPeerData = window.pullPeerDataFromSupabase;
      }

      // Test REST API connection
      fetch(`${RAILWAY_SERVER_URL}/health`)
          .then(res => res.json())
          .then(data => {
              console.log('✅ Railway server connected:', data);
              connectWebSocket();
          })
          .catch(error => {
              console.error('❌ Railway server unavailable:', error);
              console.log('Falling back to direct Supabase');
          });

      return true;
  }

  // Which app surface this page is, so the Desk's "Online Now" list can label
  // WHERE each classmate is. This copy is loaded by the quiz app (index.html) and
  // the cr worksheet variants. Derived purely from the URL — no per-page global.
  function _presenceSurface() {
      try {
          var file = ((location.pathname || '').toLowerCase().split('/').pop()) || '';
          var lesson = null;
          try {
              var qs = new URLSearchParams(location.search);
              if (qs.get('u')) lesson = 'U' + qs.get('u') + (qs.get('l') ? ' L' + qs.get('l') : '');
          } catch (e) {}
          // cr worksheet pages (u3l4.html, u3l67.html, *_live.html, mit_*) vs the quiz app.
          if (file && file !== 'index.html' && (/_live\.html$/.test(file) || /^u\d/.test(file) || /lesson/.test(file))) {
              return { surface: 'worksheet', lesson: lesson };
          }
          return { surface: 'quiz', lesson: lesson };
      } catch (e) { return { surface: 'quiz', lesson: null }; }
  }

  // Canonical presence username = the ROSTER username (lowercase, e.g. 'date_tiger'),
  // so this surface keys the SAME presence entry as the Desk + every other app.
  // cr's window.currentUsername is Title-cased by acceptUsername ('Date_Tiger'), which
  // would otherwise make the same person a SECOND presence entry (the "two Robert
  // Colson" bug). Fall back to currentUsername / consensusUsername when there's no
  // roster session (covers guests — their shared alias case is already consistent).
  function _presenceUsername() {
      try {
          var r = (window.rosterClient && typeof window.rosterClient.current === 'function')
              ? window.rosterClient.current() : null;
          if (r && r.username) return String(r.username).trim();
      } catch (e) {}
      return (window.currentUsername || localStorage.getItem('consensusUsername') || '').trim();
  }

  // Connect to WebSocket for real-time updates
  function connectWebSocket() {
      if (!USE_RAILWAY) return;

      const wsUrl = RAILWAY_SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://');

      try {
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
              console.log('🔌 WebSocket connected to Railway server');
              wsConnected = true;

              // Enable turbo mode when WebSocket connects
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: true }
              }));
              console.log('🏁 Turbo mode enabled via Railway connection');

              // Clear any reconnect timer
              if (wsReconnectTimer) {
                  clearTimeout(wsReconnectTimer);
                  wsReconnectTimer = null;
              }

              // Send ping every 30 seconds to keep connection alive
              if (wsPingInterval) clearInterval(wsPingInterval);
              wsPingInterval = setInterval(() => {
                  if (ws.readyState === WebSocket.OPEN) {
              const username = _presenceUsername();
              // Regular ping for latency
              ws.send(JSON.stringify({ type: 'ping' }));
              // Presence heartbeat
              if (username) {
                ws.send(JSON.stringify({ type: 'heartbeat', username }));
              }
                  }
              }, 30000);

          // Identify with the CANONICAL roster username (matches the Desk's casing)
          const username = _presenceUsername();
          if (username && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'identify', username, location: _presenceSurface() }));
          }
          };

          ws.onmessage = (event) => {
              try {
                  const data = JSON.parse(event.data);
                  handleWebSocketMessage(data);
              } catch (error) {
                  console.error('WebSocket message parse error:', error);
              }
          };

          ws.onclose = () => {
              console.log('WebSocket disconnected');
              wsConnected = false;

              // Disable turbo mode when WebSocket disconnects
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: false }
              }));
              console.log('🛑 Turbo mode disabled due to WebSocket disconnect');

              if (wsPingInterval) {
                  clearInterval(wsPingInterval);
                  wsPingInterval = null;
              }

              // Attempt to reconnect after 5 seconds
              wsReconnectTimer = setTimeout(() => {
                  console.log('Attempting WebSocket reconnection...');
                  connectWebSocket();
              }, 5000);
          };

          ws.onerror = (error) => {
              console.error('WebSocket error:', error);
              wsConnected = false;

              // Disable turbo mode when WebSocket errors
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: false }
              }));
              console.log('🛑 Turbo mode disabled due to WebSocket error');
          };

      } catch (error) {
          console.error('Failed to create WebSocket:', error);
          wsConnected = false;
      }
  }

  // Handle incoming WebSocket messages
  function handleWebSocketMessage(data) {
      switch (data.type) {
          case 'connected':
              console.log('✅ WebSocket:', data.message);
              // Also enable turbo mode when receiving connected message
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: true }
              }));
              break;

      case 'presence_snapshot': {
        // Initialize online set
        window.onlineUsers = new Set(data.users || []);
        // Inform UI/sprite system
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

      case 'user_online': {
        if (!window.onlineUsers) window.onlineUsers = new Set();
        window.onlineUsers.add(data.username);
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

      case 'user_offline': {
        if (!window.onlineUsers) window.onlineUsers = new Set();
        window.onlineUsers.delete(data.username);
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

          case 'answer_submitted':
              if (!data?.username || !data?.question_id || data.answer_value === undefined || data.timestamp === undefined) {
                  console.error('[WebSocket] Invalid or incomplete answer_submitted data received:', data);
                  break;
              }
              console.log(`📨 Received answer for ${data.question_id}, dispatching 'peer:answer' event.`);

              // Write to IDB peerCache for durability
              if (typeof waitForStorage === 'function') {
                  waitForStorage().then(storage => {
                      storage.set('peerCache', [data.username, data.question_id], {
                          peerUsername: data.username,
                          questionId: data.question_id,
                          value: data.answer_value,
                          timestamp: data.timestamp,
                          seenAt: Date.now()
                      }).catch(e => console.warn('Failed to cache peer answer in IDB:', e));
                  }).catch(e => console.warn('Storage not ready for peer answer caching:', e));
              }

              window.dispatchEvent(new CustomEvent('peer:answer', {
                  detail: {
                      username: data.username,
                      question_id: data.question_id,
                      answer_value: data.answer_value,
                      timestamp: data.timestamp
                  }
              }));
              break;

          case 'batch_submitted':
              console.log(`📦 Batch update: ${data.count} answers`);
              // Pull latest data from server
              pullPeerDataFromRailway();
              break;

          case 'realtime_update':
              console.log('🔄 Real-time update:', data.event);
              // Handle Supabase real-time updates relayed through server
              break;

          case 'pong':
              // Keep-alive response
              break;

          default:
              console.log('Unknown WebSocket message type:', data.type);
      }
  }

  // Railway-enhanced answer submission
  async function submitAnswerViaRailway(username, questionId, answerValue, timestamp) {
      const fallbackSubmit = typeof window.originalPushAnswer === 'function'
          ? window.originalPushAnswer
          : null;
      if (!USE_RAILWAY) {
          // Fall back to direct Supabase
          return fallbackSubmit ? fallbackSubmit(username, questionId, answerValue, timestamp) : false;
      }

      try {
          const payload = {
              username,
              question_id: questionId,
              answer_value: answerValue,
              timestamp: timestamp
          };
          console.log(`[Railway] submit ${questionId}: payload ready (${typeof answerValue})`);
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/submit-answer`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (result.success) {
              console.log(`✅ Answer synced via Railway (broadcast to ${result.broadcast} clients)`);
              return true;  // SUCCESS - Don't fall back!
          } else {
              throw new Error(result.error || 'Railway sync failed');
          }
      } catch (error) {
          console.error('Railway submit failed, falling back to direct Supabase:', error);
          // Only fall back if Railway actually failed
          return fallbackSubmit ? fallbackSubmit(username, questionId, answerValue, timestamp) : false;
      }
  }

  // Pull peer data from Railway server
  async function pullPeerDataFromRailway(since = 0) {
      if (!USE_RAILWAY) {
          // Fall back to direct Supabase
          return pullPeerDataFromSupabase();
      }

      try {
          const url = since > 0
              ? `${RAILWAY_SERVER_URL}/api/peer-data?since=${since}`
              : `${RAILWAY_SERVER_URL}/api/peer-data`;

          const response = await fetch(url);
          const result = await response.json();

          console.log(`📥 Pulled ${result.filtered} answers from Railway (${result.cached ? 'cached' : 'fresh'})`);

          // Convert to local storage format
          const peerData = {};
          result.data.forEach(answer => {
              if (!peerData[answer.username]) {
                  peerData[answer.username] = { answers: {} };
              }
              peerData[answer.username].answers[answer.question_id] = {
                  value: answer.answer_value,
                  timestamp: answer.timestamp
              };
          });

          // Update local storage (for backward compatibility)
          let currentUser = null;
          try {
              currentUser = localStorage.getItem('consensusUsername');
          } catch (e) {
              // localStorage may be blocked
          }

          // Also try to get from IDB
          if (!currentUser && typeof waitForStorage === 'function') {
              try {
                  const storage = await waitForStorage();
                  currentUser = await storage.getMeta('username');
              } catch (e) {
                  console.warn('Could not get username from IDB');
              }
          }

          for (const [username, userData] of Object.entries(peerData)) {
              if (username !== currentUser) {
                  // Write to localStorage for backward compatibility
                  try {
                      const key = `answers_${username}`;
                      const existing = JSON.parse(localStorage.getItem(key) || '{}');
                      Object.assign(existing, userData.answers);
                      localStorage.setItem(key, JSON.stringify(existing));
                  } catch (e) {
                      // localStorage may be blocked
                  }

                  // Write to IDB peerCache for durability
                  if (typeof waitForStorage === 'function') {
                      try {
                          const storage = await waitForStorage();
                          for (const [questionId, answer] of Object.entries(userData.answers)) {
                              await storage.set('peerCache', [username, questionId], {
                                  peerUsername: username,
                                  questionId,
                                  value: answer.value,
                                  timestamp: answer.timestamp,
                                  seenAt: Date.now()
                              });
                          }
                      } catch (e) {
                          console.warn('Failed to write peer data to IDB:', e);
                      }
                  }
              }
          }

          // Update timestamp display
          if (typeof updatePeerDataTimestamp === 'function') {
              updatePeerDataTimestamp();
          }

          return peerData;

      } catch (error) {
          console.error('Railway pull failed:', error);
          // Fall back to direct Supabase
          return pullPeerDataFromSupabase();
      }
  }

  // Get question statistics from Railway
  async function getQuestionStats(questionId) {
      if (!USE_RAILWAY) return null;

      try {
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/question-stats/${questionId}`);
          const stats = await response.json();

          console.log(`📊 Stats for ${questionId}:`, stats);
          return stats;

      } catch (error) {
          console.error('Failed to get question stats:', error);
          return null;
      }
  }

  // Batch submit answers via Railway
  async function batchSubmitViaRailway(answers) {
      if (!USE_RAILWAY) {
          // Fall back to direct batch push
          return batchPushAnswersToSupabase(answers);
      }

      try {
          const normalized = answers.map(answer => ({
              username: answer.username,
              question_id: answer.question_id,
              answer_value: answer.answer_value,
              timestamp: typeof answer.timestamp === 'string'
                  ? new Date(answer.timestamp).getTime()
                  : answer.timestamp
          }));
          console.log(`[Railway] batch submit: ${normalized.length} answers`);
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/batch-submit`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ answers: normalized })
          });

          const result = await response.json();

          if (result.success) {
              console.log(`✅ Batch synced ${result.count} answers via Railway`);
              return result.count;
          } else {
              throw new Error(result.error);
          }
      } catch (error) {
          console.error('Railway batch submit failed:', error);
          // Fall back to direct Supabase
          return batchPushAnswersToSupabase(answers);
      }
  }

  // Override existing functions when Railway is enabled
  if (USE_RAILWAY) {
      console.log('🚂 Railway mode enabled - overriding sync functions');

      // NOTE: Original functions are now captured inside initializeRailwayConnection()
      // to avoid race conditions with index.html loading

      // Override with Railway-enhanced versions
      window.pushAnswerToSupabase = submitAnswerViaRailway;
      window.pullPeerDataFromSupabase = () => pullPeerDataFromRailway();

      // Add new Railway-specific functions
      window.getQuestionStats = getQuestionStats;
      window.batchSubmitViaRailway = batchSubmitViaRailway;

      // Initialize on page load
      document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
              initializeRailwayConnection();
          }, 1000); // Give Supabase time to initialize first
      });
  }

  // Export functions for external use
  window.railwayClient = {
      initialize: initializeRailwayConnection,
      connectWebSocket,
      submitAnswer: submitAnswerViaRailway,
      pullPeerData: pullPeerDataFromRailway,
      getStats: getQuestionStats,
      batchSubmit: batchSubmitViaRailway,
      isConnected: () => wsConnected
  };

  console.log('🚂 Railway client loaded. Set USE_RAILWAY=true to enable.');