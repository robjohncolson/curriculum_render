// Simple Railway server for AP Stats Turbo Mode
// No build step required - just plain Node.js

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

// Initialize Groq for FRQ grading (free tier)
const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY
}) : null;

// Initialize Google Gemini for FRQ grading
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Available AI models for grading
// See https://console.groq.com/docs/deprecations for Groq model status
const AI_MODELS = {
  'gemini-flash': {
    name: 'Google Gemini 2.0 Flash',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    available: !!gemini
  },
  'gemini-flash-lite': {
    name: 'Google Gemini 2.0 Flash-Lite',
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    available: !!gemini
  },
  'groq-llama': {
    name: 'Groq Llama 3.3 70B',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    available: !!groq
  },
  'groq-qwen': {
    name: 'Groq Qwen3 32B',
    provider: 'groq',
    model: 'qwen/qwen3-32b',
    available: !!groq
  },
  'groq-llama4': {
    name: 'Groq Llama 4 Scout',
    provider: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    available: !!groq
  }
};

// Default model - Gemini 2.0 Flash is fast and capable on free tier
const DEFAULT_MODEL = process.env.DEFAULT_GRADING_MODEL || 'gemini-flash';

if (!groq && !gemini) {
  console.warn('⚠️ No AI API keys configured - FRQ grading will be disabled');
} else {
  console.log('🤖 AI Models available:');
  Object.entries(AI_MODELS).forEach(([key, config]) => {
    console.log(`   ${config.available ? '✅' : '❌'} ${key}: ${config.name}`);
  });
}

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
// USER MANAGEMENT ENDPOINTS
// ============================

// Get all users (for dropdown list)
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('username, real_name, user_type, password')
      .order('real_name', { ascending: true });

    if (error) throw error;

    // Return users with password status (not the actual password)
    const users = data.map(user => ({
      username: user.username,
      realName: user.real_name,
      userType: user.user_type,
      hasPassword: !!user.password
    }));

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific user by username
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('username, real_name, user_type, password')
      .eq('username', username)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json({
      username: data.username,
      realName: data.real_name,
      userType: data.user_type,
      hasPassword: !!data.password
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Look up user by real name
app.get('/api/users/by-name/:realName', async (req, res) => {
  try {
    const { realName } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('username, real_name, user_type, password')
      .ilike('real_name', realName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json({
      username: data.username,
      realName: data.real_name,
      userType: data.user_type,
      hasPassword: !!data.password
    });
  } catch (error) {
    console.error('Error fetching user by name:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new user
app.post('/api/users', async (req, res) => {
  try {
    const { username, realName, password, userType = 'student' } = req.body;

    if (!username || !realName) {
      return res.status(400).json({ error: 'Username and realName are required' });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{
        username,
        real_name: realName,
        password: password || null,
        user_type: userType
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      throw error;
    }

    console.log(`👤 New user created: ${realName} (${username})`);

    res.json({
      success: true,
      user: {
        username: data.username,
        realName: data.real_name,
        userType: data.user_type,
        hasPassword: !!data.password
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify user password
app.post('/api/users/verify', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const { data, error } = await supabase
      .from('users')
      .select('username, real_name, user_type, password')
      .eq('username', username)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    // If user has no password, allow access (first-time setup)
    if (!data.password) {
      return res.json({
        success: true,
        needsPasswordSetup: true,
        user: {
          username: data.username,
          realName: data.real_name,
          userType: data.user_type
        }
      });
    }

    // Verify password (simple string comparison - pedagogy app)
    if (data.password !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({
      success: true,
      needsPasswordSetup: false,
      user: {
        username: data.username,
        realName: data.real_name,
        userType: data.user_type
      }
    });
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user (set/reset password, update name, etc.)
app.put('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { password, realName, userType } = req.body;

    const updates = {};
    if (password !== undefined) updates.password = password;
    if (realName !== undefined) updates.real_name = realName;
    if (userType !== undefined) updates.user_type = userType;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('username', username)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    console.log(`👤 User updated: ${username}`);

    res.json({
      success: true,
      user: {
        username: data.username,
        realName: data.real_name,
        userType: data.user_type,
        hasPassword: !!data.password
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's password (teacher only - requires master password)
app.post('/api/users/:username/password', async (req, res) => {
  try {
    const { username } = req.params;
    const { masterPassword } = req.body;

    // Verify master password
    if (masterPassword !== 'googly231') {
      return res.status(403).json({ error: 'Invalid master password' });
    }

    const { data, error } = await supabase
      .from('users')
      .select('password')
      .eq('username', username)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json({
      password: data.password || '(no password set)'
    });
  } catch (error) {
    console.error('Error getting user password:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk import users (for CSV migration)
app.post('/api/users/bulk-import', async (req, res) => {
  try {
    const { users, masterPassword } = req.body;

    // Verify master password
    if (masterPassword !== 'googly231') {
      return res.status(403).json({ error: 'Invalid master password' });
    }

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Users array is required' });
    }

    const records = users.map(u => ({
      username: u.username,
      real_name: u.realName,
      password: u.password || null,
      user_type: u.userType || 'student'
    }));

    const { data, error } = await supabase
      .from('users')
      .upsert(records, { onConflict: 'username' })
      .select();

    if (error) throw error;

    console.log(`👥 Bulk imported ${data.length} users`);

    res.json({
      success: true,
      imported: data.length
    });
  } catch (error) {
    console.error('Error bulk importing users:', error);
    res.status(500).json({ error: error.message });
  }
});

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
// FRQ GRADING ENDPOINT
// ============================

/**
 * Build the grading prompt for the LLM
 * Uses AP Statistics E/P/I scoring framework
 */
function buildGradingPrompt(question, studentAnswer, rubric, modelAnswer) {
  const rubricText = rubric.map(part => {
    let text = `Part ${part.part} (${part.maxPoints} point${part.maxPoints > 1 ? 's' : ''}):\n`;
    text += `Criteria:\n${part.criteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`;
    if (part.scoringNotes) {
      text += `\nScoring Notes: ${part.scoringNotes}`;
    }
    return text;
  }).join('\n\n');

  // Check if this includes chart data that needs special evaluation
  const hasChartData = studentAnswer.includes("STUDENT'S CHART SUBMISSION:");
  const hasExpectedChart = modelAnswer && modelAnswer.includes('Expected Chart:');

  // Build chart-specific instructions if applicable
  let chartInstructions = '';
  if (hasChartData || hasExpectedChart) {
    chartInstructions = `
IMPORTANT - CHART EVALUATION INSTRUCTIONS:
When grading charts, you MUST carefully evaluate completeness and accuracy:

1. DATA COMPLETENESS: Count the actual number of data points/bars/values the student provided vs. what is expected.
   - If the model answer expects 10 bars and student only has 2, that is ~20% complete - score as I (Incorrect)
   - If student has 7-9 out of 10 expected values, that might be P (Partially Correct)
   - Only give E (Essentially Correct) if student has ALL or nearly all expected data points

2. DATA ACCURACY: Compare the actual values submitted against expected values.
   - Are the frequencies/heights correct for each category?
   - Are categories properly labeled?
   - Is the scale appropriate?

3. CHART TYPE: Is the correct chart type used (bar, histogram, dotplot, etc.)?

4. LABELS & FORMATTING: Does the chart have proper axis labels, title, and formatting?

BE STRICT about completeness. A chart with only 20-30% of the required bars/values should NEVER receive E or P scores for that component. Missing data is a critical error.
`;
  }

  return `You are an AP Statistics exam grader. Grade the following free response question using the official AP scoring rubric.

SCORING SYSTEM:
- E (Essentially Correct) = Full credit for the part
- P (Partially Correct) = Half credit for the part
- I (Incorrect) = No credit for the part
${chartInstructions}
QUESTION:
${question}

${modelAnswer ? `MODEL ANSWER (for reference - use this to determine expected values and completeness):\n${modelAnswer}\n` : ''}

SCORING RUBRIC:
${rubricText}

STUDENT'S ANSWER:
${studentAnswer}

Please grade each part of the rubric and provide:
1. A score (E, P, or I) for each part
2. Brief justification for each score (for charts: specify how many data points were provided vs expected)
3. Specific feedback on what was correct/incorrect
4. Total points earned (E=full points, P=half points, I=0)

Respond in this exact JSON format:
{
  "parts": [
    {
      "part": "a",
      "score": "E|P|I",
      "points": <number>,
      "maxPoints": <number>,
      "justification": "Brief explanation of score",
      "feedback": "Specific feedback for student"
    }
  ],
  "totalPoints": <number>,
  "maxPoints": <number>,
  "overallFeedback": "Summary feedback for the student",
  "strengths": ["List of things done well"],
  "improvements": ["List of areas to improve"]
}`;
}

/**
 * Get available AI models for grading
 */
app.get('/api/grading-models', (req, res) => {
  const available = Object.entries(AI_MODELS)
    .filter(([, config]) => config.available)
    .map(([key, config]) => ({
      id: key,
      name: config.name,
      provider: config.provider
    }));

  res.json({
    models: available,
    default: DEFAULT_MODEL,
    anyAvailable: available.length > 0
  });
});

/**
 * Grade using Groq API
 */
async function gradeWithGroq(prompt, modelId) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are an experienced AP Statistics exam grader. Be fair but rigorous. Always respond with valid JSON only, no markdown formatting.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    model: AI_MODELS[modelId]?.model || 'llama-3.1-70b-versatile',
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });

  return completion.choices[0]?.message?.content;
}

/**
 * Grade using Gemini API
 */
async function gradeWithGemini(prompt, modelId) {
  const modelName = AI_MODELS[modelId]?.model || 'gemini-2.0-flash';
  const model = gemini.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json'
    }
  });

  const systemInstruction = 'You are an experienced AP Statistics exam grader. Be fair but rigorous. Always respond with valid JSON only, no markdown formatting.';

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${prompt}` }] }]
  });

  return result.response.text();
}

/**
 * Grade an FRQ answer using AI (supports multiple providers)
 */
app.post('/api/grade-frq', async (req, res) => {
  try {
    // Check if any AI is available
    if (!groq && !gemini) {
      return res.status(503).json({
        error: 'FRQ grading service unavailable - no AI API keys configured'
      });
    }

    const {
      questionId,
      questionText,
      studentAnswer,
      rubric,
      modelAnswer,
      username,
      totalPoints,
      preferredModel // Optional: 'groq-llama', 'gemini-pro', 'gemini-flash'
    } = req.body;

    // Validation
    if (!studentAnswer || !rubric || !Array.isArray(rubric)) {
      return res.status(400).json({
        error: 'Missing required fields: studentAnswer and rubric (array) are required'
      });
    }

    if (studentAnswer.trim().length < 10) {
      return res.status(400).json({
        error: 'Answer too short to grade meaningfully'
      });
    }

    // Select model - use preferred if available, otherwise fall back to default, then any available
    let selectedModel = preferredModel;
    if (!selectedModel || !AI_MODELS[selectedModel]?.available) {
      selectedModel = AI_MODELS[DEFAULT_MODEL]?.available ? DEFAULT_MODEL : null;
    }
    if (!selectedModel) {
      // Fall back to any available model
      selectedModel = Object.keys(AI_MODELS).find(key => AI_MODELS[key].available);
    }

    if (!selectedModel) {
      return res.status(503).json({
        error: 'No AI models available for grading'
      });
    }

    const modelConfig = AI_MODELS[selectedModel];
    console.log(`📝 Grading FRQ ${questionId || 'unknown'} for ${username || 'anonymous'} using ${modelConfig.name}`);

    // Build the grading prompt
    const prompt = buildGradingPrompt(
      questionText || 'See rubric for question context',
      studentAnswer,
      rubric,
      modelAnswer
    );

    // Call the appropriate AI provider
    let responseText;
    if (modelConfig.provider === 'groq') {
      responseText = await gradeWithGroq(prompt, selectedModel);
    } else if (modelConfig.provider === 'gemini') {
      responseText = await gradeWithGemini(prompt, selectedModel);
    }

    if (!responseText) {
      throw new Error('Empty response from grading model');
    }

    // Parse the JSON response (handle potential markdown wrapping)
    let gradeResult;
    try {
      // Strip markdown code blocks if present
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7);
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      gradeResult = JSON.parse(cleanedResponse.trim());
    } catch (parseError) {
      console.error('Failed to parse grading response:', responseText);
      throw new Error('Invalid response format from grading model');
    }

    // Add metadata
    gradeResult.questionId = questionId;
    gradeResult.username = username;
    gradeResult.gradedAt = new Date().toISOString();
    gradeResult.model = modelConfig.name;
    gradeResult.modelId = selectedModel;

    // Optionally store the grade in Supabase
    if (questionId && username) {
      try {
        await supabase
          .from('frq_grades')
          .upsert([{
            username,
            question_id: questionId,
            student_answer: studentAnswer,
            grade_result: gradeResult,
            total_points: gradeResult.totalPoints,
            max_points: gradeResult.maxPoints,
            graded_at: gradeResult.gradedAt
          }], { onConflict: 'username,question_id' });

        console.log(`💾 Grade saved for ${username} on ${questionId}`);
      } catch (dbError) {
        // Don't fail the request if DB save fails
        console.error('Failed to save grade to DB:', dbError);
      }
    }

    console.log(`✅ Graded ${questionId}: ${gradeResult.totalPoints}/${gradeResult.maxPoints} points (${modelConfig.name})`);

    res.json({
      success: true,
      grade: gradeResult
    });

  } catch (error) {
    console.error('Error grading FRQ:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to grade response. Please try again.'
    });
  }
});

/**
 * Get a student's FRQ grades
 */
app.get('/api/frq-grades/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { questionId } = req.query;

    let query = supabase
      .from('frq_grades')
      .select('*')
      .eq('username', username);

    if (questionId) {
      query = query.eq('question_id', questionId);
    }

    const { data, error } = await query.order('graded_at', { ascending: false });

    if (error) throw error;

    res.json({ grades: data || [] });
  } catch (error) {
    console.error('Error fetching FRQ grades:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get grading statistics for a question (teacher view)
 */
app.get('/api/frq-stats/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;

    const { data, error } = await supabase
      .from('frq_grades')
      .select('username, total_points, max_points, graded_at')
      .eq('question_id', questionId);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({
        questionId,
        totalGraded: 0,
        averageScore: 0,
        scoreDistribution: {}
      });
    }

    // Calculate statistics
    const scores = data.map(g => g.total_points);
    const maxPoints = data[0].max_points;
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Score distribution
    const distribution = {};
    scores.forEach(score => {
      const percentage = Math.round((score / maxPoints) * 100);
      const bucket = percentage >= 80 ? 'excellent' :
                     percentage >= 60 ? 'good' :
                     percentage >= 40 ? 'fair' : 'needs-work';
      distribution[bucket] = (distribution[bucket] || 0) + 1;
    });

    res.json({
      questionId,
      totalGraded: data.length,
      maxPoints,
      averageScore: Math.round(averageScore * 100) / 100,
      averagePercentage: Math.round((averageScore / maxPoints) * 100),
      scoreDistribution: distribution,
      grades: data
    });

  } catch (error) {
    console.error('Error fetching FRQ stats:', error);
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