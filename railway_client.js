// Railway Server Integration for AP Stats Turbo Mode
  // This replaces direct Supabase calls with Railway server calls

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

      console.log('🚂 Initializing Railway server connection...');

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
              const username = (window.currentUsername || localStorage.getItem('consensusUsername') || '').trim();
              // Regular ping for latency
              ws.send(JSON.stringify({ type: 'ping' }));
              // Presence heartbeat
              if (username) {
                ws.send(JSON.stringify({ type: 'heartbeat', username }));
              }
                  }
              }, 30000);

          // Identify with current username as soon as connected
          const username = (window.currentUsername || localStorage.getItem('consensusUsername') || '').trim();
          if (username) {
            ws.send(JSON.stringify({ type: 'identify', username }));
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
      if (!USE_RAILWAY) {
          // Fall back to direct Supabase
          return window.originalPushAnswer(username, questionId, answerValue, timestamp);
      }

      try {
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/submit-answer`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  username,
                  question_id: questionId,
                  answer_value: answerValue,
                  timestamp: timestamp
              })
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
          return window.originalPushAnswer(username, questionId, answerValue, timestamp);
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

          // Update local storage
          const currentUser = localStorage.getItem('consensusUsername');
          for (const [username, userData] of Object.entries(peerData)) {
              if (username !== currentUser) {
                  const key = `answers_${username}`;
                  const existing = JSON.parse(localStorage.getItem(key) || '{}');

                  // Merge with existing data
                  Object.assign(existing, userData.answers);
                  localStorage.setItem(key, JSON.stringify(existing));
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
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/batch-submit`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ answers })
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

      // Store original functions BEFORE overriding
      window.originalPushAnswer = window.pushAnswerToSupabase;
      window.originalPullPeerData = window.pullPeerDataFromSupabase;

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