// Simple Railway server for AP Stats Turbo Mode
// No build step required - just plain Node.js

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://bzqbhtrurzzavhqbgqrs.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWJodHJ1cnp6YXZocWJncXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTc1NDMsImV4cCI6MjA3NDc3MzU0M30.xDHsAxOlv0uprE9epz-M_Emn6q3mRegtTpFt0sl9uBo'
);

// In-memory cache with TTL
const cache = {
  peerData: null,
  questionStats: new Map(),
  lastUpdate: 0,
  TTL: 30000 // 30 seconds cache
};

// Track connected WebSocket clients
const wsClients = new Set();

// Presence tracking (in-memory)
const presence = new Map(); // username -> { lastSeen: number, connections: Set<WebSocket> }
const wsToUser = new Map(); // ws -> username
const PRESENCE_TTL_MS = parseInt(process.env.PRESENCE_TTL_MS || '45000', 10);

// Helper to check cache validity
function isCacheValid(lastUpdate, ttl = cache.TTL) {
  return Date.now() - lastUpdate < ttl;
}

// Convert timestamps to numbers if they're strings
function normalizeTimestamp(timestamp) {
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return timestamp;
}

// ============================
// REST API ENDPOINTS
// ============================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections: wsClients.size,
    cache: isCacheValid(cache.lastUpdate) ? 'warm' : 'cold',
    timestamp: new Date().toISOString()
  });
});

// Get all peer data with optional delta
app.get('/api/peer-data', async (req, res) => {
  try {
    const since = req.query.since ? parseInt(req.query.since) : 0;

    // Use cache if valid
    if (isCacheValid(cache.lastUpdate) && cache.peerData) {
      const filteredData = since > 0
        ? cache.peerData.filter(a => a.timestamp > since)
        : cache.peerData;

      return res.json({
        data: filteredData,
        total: cache.peerData.length,
        filtered: filteredData.length,
        cached: true,
        lastUpdate: cache.lastUpdate
      });
    }

    // Fetch from Supabase
    const { data, error } = await supabase
      .from('answers')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) throw error;

    // Normalize timestamps
    const normalizedData = data.map(answer => ({
      ...answer,
      timestamp: normalizeTimestamp(answer.timestamp)
    }));

    // Update cache
    cache.peerData = normalizedData;
    cache.lastUpdate = Date.now();

    // Filter by timestamp if requested
    const filteredData = since > 0
      ? normalizedData.filter(a => a.timestamp > since)
      : normalizedData;

    res.json({
      data: filteredData,
      total: normalizedData.length,
      filtered: filteredData.length,
      cached: false,
      lastUpdate: cache.lastUpdate
    });

  } catch (error) {
    console.error('Error fetching peer data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get question statistics
app.get('/api/question-stats/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;

    // Check cache
    const cached = cache.questionStats.get(questionId);
    if (cached && isCacheValid(cached.timestamp, 60000)) { // 1 minute cache for stats
      return res.json(cached.data);
    }

    // Calculate stats from Supabase
    const { data, error } = await supabase
      .from('answers')
      .select('answer_value, username')
      .eq('question_id', questionId);

    if (error) throw error;

    // Calculate distribution
    const distribution = {};
    const users = new Set();

    data.forEach(answer => {
      distribution[answer.answer_value] = (distribution[answer.answer_value] || 0) + 1;
      users.add(answer.username);
    });

    // Find consensus (most common answer)
    let consensus = null;
    let maxCount = 0;
    Object.entries(distribution).forEach(([value, count]) => {
      if (count > maxCount) {
        maxCount = count;
        consensus = value;
      }
    });

    // Convert to percentages
    const total = data.length;
    const percentages = {};
    Object.entries(distribution).forEach(([value, count]) => {
      percentages[value] = Math.round((count / total) * 100);
    });

    const stats = {
      questionId,
      consensus,
      distribution: percentages,
      totalResponses: total,
      uniqueUsers: users.size,
      timestamp: Date.now()
    };

    // Cache the results
    cache.questionStats.set(questionId, {
      data: stats,
      timestamp: Date.now()
    });

    res.json(stats);

  } catch (error) {
    console.error('Error calculating stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit answer (proxies to Supabase and broadcasts via WebSocket)
app.post('/api/submit-answer', async (req, res) => {
  try {
    const { username, question_id, answer_value, timestamp } = req.body;

    // Normalize timestamp
    const normalizedTimestamp = normalizeTimestamp(timestamp || Date.now());
    const answerSize = (() => {
      try {
        return typeof answer_value === 'string'
          ? answer_value.length
          : JSON.stringify(answer_value).length;
      } catch (err) {
        return -1;
      }
    })();
    const sizeLabel = answerSize >= 0 ? `${answerSize} chars` : 'received';
    console.log(`📨 submit-answer ${question_id}: answer_value ${sizeLabel}`);

    // Upsert to Supabase
    const { data, error } = await supabase
      .from('answers')
      .upsert([{
        username,
        question_id,
        answer_value,
        timestamp: normalizedTimestamp
      }], { onConflict: 'username,question_id' });

    if (error) throw error;

    // Invalidate cache
    cache.lastUpdate = 0;
    cache.questionStats.delete(question_id);

    // Broadcast to WebSocket clients
    const update = {
      type: 'answer_submitted',
      username,
      question_id,
      answer_value,
      timestamp: normalizedTimestamp
    };

    broadcastToClients(update);

    res.json({
      success: true,
      timestamp: normalizedTimestamp,
      broadcast: wsClients.size
    });

  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch submit answers
app.post('/api/batch-submit', async (req, res) => {
  try {
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid answers array' });
    }

    // Normalize all timestamps
    const normalizedAnswers = answers.map(answer => ({
      username: answer.username,
      question_id: answer.question_id,
      answer_value: answer.answer_value,
      timestamp: normalizeTimestamp(answer.timestamp || Date.now())
    }));
    console.log(`📦 batch-submit ${normalizedAnswers.length} answers`);

    // Batch upsert to Supabase
    const { data, error } = await supabase
      .from('answers')
      .upsert(normalizedAnswers, { onConflict: 'username,question_id' });

    if (error) throw error;

    // Invalidate cache
    cache.lastUpdate = 0;
    cache.questionStats.clear();

    // Broadcast batch update
    const update = {
      type: 'batch_submitted',
      count: normalizedAnswers.length,
      timestamp: Date.now()
    };

    broadcastToClients(update);

    res.json({
      success: true,
      count: normalizedAnswers.length,
      broadcast: wsClients.size
    });

  } catch (error) {
    console.error('Error batch submitting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================
// AI GRADING ENDPOINTS (Groq only)
// ============================

// Groq API Key
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Groq rate limits: 30 RPM for free tier, be conservative
const GROQ_RATE_LIMIT = {
  maxRequestsPerMinute: 25,  // Stay under 30 RPM limit
  minDelayBetweenRequests: 2500  // 2.5 seconds between requests
};

// Request queue for rate limiting
class GradingQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.requestsThisMinute = 0;
    this.minuteStart = Date.now();
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();

      try {
        // Check rate limit window
        const now = Date.now();
        if (now - this.minuteStart > 60000) {
          this.requestsThisMinute = 0;
          this.minuteStart = now;
        }

        // Wait if we've hit the per-minute limit
        if (this.requestsThisMinute >= GROQ_RATE_LIMIT.maxRequestsPerMinute) {
          const waitTime = 60000 - (now - this.minuteStart) + 1000;
          console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
          await this.delay(waitTime);
          this.requestsThisMinute = 0;
          this.minuteStart = Date.now();
        }

        // Ensure minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < GROQ_RATE_LIMIT.minDelayBetweenRequests) {
          const waitTime = GROQ_RATE_LIMIT.minDelayBetweenRequests - timeSinceLastRequest;
          await this.delay(waitTime);
        }

        // Execute the task
        this.lastRequestTime = Date.now();
        this.requestsThisMinute++;
        const result = await task();
        resolve(result);

      } catch (error) {
        // Check if it's a rate limit error (429)
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          console.log('⚠️ Hit rate limit, backing off 30s...');
          await this.delay(30000);
          // Re-queue the task
          this.queue.unshift({ task, resolve, reject });
        } else {
          reject(error);
        }
      }
    }

    this.processing = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueLength() {
    return this.queue.length;
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      requestsThisMinute: this.requestsThisMinute,
      processing: this.processing
    };
  }
}

const gradingQueue = new GradingQueue();

// Check AI availability
app.get('/api/ai/status', (req, res) => {
  const stats = gradingQueue.getStats();
  res.json({
    available: !!GROQ_API_KEY,
    provider: 'groq',
    model: GROQ_MODEL,
    queue: stats,
    rateLimit: {
      maxPerMinute: GROQ_RATE_LIMIT.maxRequestsPerMinute,
      currentUsage: stats.requestsThisMinute
    }
  });
});

// Grade FRQ answer with AI
app.post('/api/ai/grade', async (req, res) => {
  try {
    const { scenario, answers, prompt, aiPromptTemplate } = req.body;

    if (!scenario || !answers) {
      return res.status(400).json({ error: 'Missing scenario or answers' });
    }

    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY not configured' });
    }

    // Build the prompt
    const gradingPrompt = prompt || buildDefaultGradingPrompt(scenario, answers, aiPromptTemplate);

    const queuePos = gradingQueue.getQueueLength();
    console.log(`🤖 AI grading queued (position ${queuePos}): ${scenario.questionId || 'unknown'}`);

    // Queue the request
    const result = await gradingQueue.add(() => callGroq(gradingPrompt));

    // Add metadata
    result._provider = 'groq';
    result._model = GROQ_MODEL;
    result._gradingMode = 'ai';
    result._serverGraded = true;

    console.log(`✅ AI grading complete: score=${result.score || 'unknown'}`);

    res.json(result);
  } catch (err) {
    console.error('AI grading error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Call Groq API with llama-3.3-70b-versatile
async function callGroq(prompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an AP Statistics teacher grading student responses. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from Groq');
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse Groq response as JSON');
  }
}

// Build default grading prompt
function buildDefaultGradingPrompt(scenario, answers, template) {
  if (template) {
    // Replace template placeholders
    let prompt = template;
    for (const [key, value] of Object.entries(scenario)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''));
    }
    for (const [key, value] of Object.entries(answers)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}Answer\\}\\}`, 'g'), String(value || ''));
      prompt = prompt.replace(/\{\{answer\}\}/gi, String(value || ''));
    }
    return prompt;
  }

  // Default prompt
  const answerText = Object.entries(answers)
    .map(([field, value]) => `${field}: ${value}`)
    .join('\n');

  return `You are an AP Statistics teacher grading a student's free-response answer.

Question: ${scenario.prompt || scenario.topic || 'AP Statistics FRQ'}
Part: ${scenario.partId || 'answer'}

Expected elements to check:
${(scenario.expectedElements || []).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'Standard AP Statistics rubric elements'}

Student's Answer:
${answerText}

Grade the response using the AP FRQ rubric:
- E (Essentially correct): All key elements present and correct
- P (Partially correct): Some key elements present, minor errors
- I (Incorrect): Missing most key elements or major errors

Respond in JSON format:
{
  "score": "E" or "P" or "I",
  "feedback": "Brief explanation of the score",
  "matched": ["list of correct elements"],
  "missing": ["list of missing elements"]
}`;
}

// Get server statistics
app.get('/api/stats', async (req, res) => {
  try {
    // Get counts from Supabase
    const { count: totalAnswers } = await supabase
      .from('answers')
      .select('*', { count: 'exact', head: true });

    const { data: users } = await supabase
      .from('answers')
      .select('username')
      .limit(1000);

    const uniqueUsers = new Set(users?.map(u => u.username) || []);

    res.json({
      totalAnswers,
      uniqueUsers: uniqueUsers.size,
      connectedClients: wsClients.size,
      cacheStatus: isCacheValid(cache.lastUpdate) ? 'warm' : 'cold',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 + ' MB'
    });

  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================
// WEBSOCKET SERVER
// ============================

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for connections`);
  console.log(`🗄️ Connected to Supabase`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  wsClients.add(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AP Stats Turbo Server',
    clients: wsClients.size
  }));

  // Send initial presence snapshot
  sendPresenceSnapshot(ws);

  // Handle client messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'identify': {
          const username = (data.username || '').trim();
          if (!username) break;
          wsToUser.set(ws, username);
          let info = presence.get(username);
          if (!info) {
            info = { lastSeen: Date.now(), connections: new Set() };
            presence.set(username, info);
          }
          info.connections.add(ws);
          info.lastSeen = Date.now();
          // Broadcast user online
          broadcastToClients({ type: 'user_online', username, timestamp: Date.now() });
          break;
        }

        case 'heartbeat': {
          const username = (data.username || wsToUser.get(ws) || '').trim();
          if (!username) break;
          let info = presence.get(username);
          if (!info) {
            info = { lastSeen: Date.now(), connections: new Set([ws]) };
            presence.set(username, info);
          }
          info.lastSeen = Date.now();
          break;
        }

        case 'subscribe':
          // Client wants to subscribe to a specific question
          ws.questionId = data.questionId;
          ws.send(JSON.stringify({
            type: 'subscribed',
            questionId: data.questionId
          }));
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    wsClients.delete(ws);
    // Remove from presence map
    const username = wsToUser.get(ws);
    if (username) {
      const info = presence.get(username);
      if (info) {
        info.connections.delete(ws);
        if (info.connections.size === 0) {
          // Defer offline broadcast to allow quick reconnects; rely on TTL cleanup
          info.lastSeen = Date.now();
        }
      }
      wsToUser.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
    wsToUser.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcastToClients(data) {
  const message = JSON.stringify(data);

  wsClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
      }
    }
  });
}

// Presence helpers
function getOnlineUsernames() {
  const now = Date.now();
  const users = [];
  presence.forEach((info, username) => {
    if (info.connections && info.connections.size > 0 && (now - info.lastSeen) < PRESENCE_TTL_MS) {
      users.push(username);
    }
  });
  return users;
}

function sendPresenceSnapshot(ws) {
  try {
    const users = getOnlineUsernames();
    ws.send(JSON.stringify({ type: 'presence_snapshot', users, timestamp: Date.now() }));
  } catch (e) {
    console.error('Failed to send presence snapshot:', e);
  }
}

// Set up Supabase real-time subscription
const subscription = supabase
  .channel('answers_changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'answers' },
    (payload) => {
      console.log('Real-time update from Supabase:', payload);

      // Invalidate cache
      cache.lastUpdate = 0;

      // Broadcast to all WebSocket clients
      broadcastToClients({
        type: 'realtime_update',
        event: payload.eventType,
        data: payload.new || payload.old,
        timestamp: Date.now()
      });
    }
  )
  .subscribe();

console.log('📊 Subscribed to Supabase real-time updates');

// Periodic presence cleanup and offline broadcast
setInterval(() => {
  const now = Date.now();
  const toOffline = [];
  presence.forEach((info, username) => {
    const isConnected = info.connections && info.connections.size > 0;
    if (!isConnected && (now - info.lastSeen) > PRESENCE_TTL_MS) {
      toOffline.push(username);
    }
  });
  toOffline.forEach((username) => {
    presence.delete(username);
    broadcastToClients({ type: 'user_offline', username, timestamp: Date.now() });
  });
}, Math.max(5000, Math.floor(PRESENCE_TTL_MS / 3)));

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});