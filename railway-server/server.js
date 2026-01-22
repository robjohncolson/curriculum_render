// Simple Railway server for AP Stats Turbo Mode
// No build step required - just plain Node.js

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getFrameworkForQuestion, buildFrameworkContext } from '../data/frameworks.js';

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
          content: 'You are an AP Statistics teacher grading student responses. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,  // Low for consistent grading
      max_tokens: 1500,
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

  // Parse and validate the response
  const parsed = extractAndParseJSON(content);
  if (!parsed) {
    throw new Error('Failed to parse Groq response as JSON');
  }

  if (!isValidGradingResponse(parsed)) {
    console.warn('Invalid grading response format, attempting normalization');
  }

  return normalizeGradingResponse(parsed);
}

// Robust JSON extraction with multiple fallback strategies
function extractAndParseJSON(text) {
  // Strategy 1: Direct JSON extraction
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) { /* continue to next strategy */ }

  // Strategy 2: Repair common LLM quirks
  try {
    let jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (jsonStr) {
      // Fix smart quotes: " " → "
      jsonStr = jsonStr.replace(/[\u201C\u201D]/g, '"');
      // Fix smart single quotes: ' ' → '
      jsonStr = jsonStr.replace(/[\u2018\u2019]/g, "'");
      // Remove trailing commas before } or ]
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      // Fix unquoted keys (common LLM mistake)
      jsonStr = jsonStr.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      return JSON.parse(jsonStr);
    }
  } catch (e) { /* continue to next strategy */ }

  // Strategy 3: Extract score/feedback via regex (last resort)
  try {
    const scoreMatch = text.match(/["']?score["']?\s*[":]\s*["']?([EPI])["']?/i);
    const feedbackMatch = text.match(/["']?feedback["']?\s*[":]\s*["']([^"']+)["']/i);

    if (scoreMatch) {
      return {
        score: scoreMatch[1].toUpperCase(),
        feedback: feedbackMatch ? feedbackMatch[1] : ''
      };
    }
  } catch (e) { /* give up */ }

  return null;
}

// Validate that response contains valid E/P/I grading
function isValidGradingResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;

  const validScores = ['E', 'P', 'I', 'e', 'p', 'i'];

  // Direct format: { score: "E", feedback: "..." }
  if ('score' in parsed && validScores.includes(parsed.score)) {
    return true;
  }

  // Field-keyed format: { fieldId: { score: "E", feedback: "..." } }
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('_')) continue; // Skip metadata
    if (value && typeof value === 'object' && 'score' in value) {
      if (validScores.includes(value.score)) {
        return true;
      }
    }
  }

  return false;
}

// Normalize response to consistent format
function normalizeGradingResponse(parsed, defaultFieldId = 'answer') {
  if (!parsed) return { score: 'I', feedback: 'Unable to parse AI response' };

  // Already in direct format with valid score
  if ('score' in parsed && ['E', 'P', 'I'].includes(parsed.score?.toUpperCase?.())) {
    return {
      score: parsed.score.toUpperCase(),
      feedback: parsed.feedback || '',
      matched: parsed.matched || [],
      missing: parsed.missing || []
    };
  }

  // Field-keyed format: extract first valid field result
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('_')) continue;
    if (value && typeof value === 'object' && value.score) {
      return {
        score: value.score.toUpperCase(),
        feedback: value.feedback || '',
        matched: value.matched || [],
        missing: value.missing || [],
        _fieldId: key
      };
    }
  }

  // Fallback
  return {
    score: 'I',
    feedback: 'Unable to determine score from AI response'
  };
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

// ============================
// AI APPEAL ENDPOINT
// ============================

// Appeal an AI grading decision
app.post('/api/ai/appeal', async (req, res) => {
  try {
    const { scenario, answers, appealText, previousResults } = req.body;

    if (!scenario || !answers || !appealText) {
      return res.status(400).json({ error: 'Missing scenario, answers, or appeal text' });
    }

    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY not configured' });
    }

    // Build appeal-specific prompt
    const appealPrompt = buildAppealPrompt(scenario, answers, appealText, previousResults);

    const queuePos = gradingQueue.getQueueLength();
    const framework = getFrameworkForQuestion(scenario.questionId);
    const frameworkInfo = framework ? `Topic ${framework.unit}.${framework.lesson}` : 'no framework';
    console.log(`🔄 AI appeal queued (position ${queuePos}): ${scenario.questionId || 'unknown'} [${frameworkInfo}]`);

    // Queue the request
    const result = await gradingQueue.add(() => callGroq(appealPrompt));

    // Add metadata
    result._provider = 'groq';
    result._model = GROQ_MODEL;
    result._gradingMode = 'ai-appeal';
    result._serverGraded = true;
    result._appealProcessed = true;

    console.log(`✅ AI appeal complete: score=${result.score || 'unknown'}, upgraded=${result.appealGranted || false}`);

    res.json(result);
  } catch (err) {
    console.error('AI appeal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Build appeal prompt - different from regular grading prompt
function buildAppealPrompt(scenario, answers, appealText, previousResults) {
  // Format previous results
  const previousFeedback = previousResults
    ? Object.entries(previousResults).map(([field, result]) =>
        `- ${field}: Score=${result.score || result}, Feedback="${result.feedback || 'No feedback'}"`
      ).join('\n')
    : 'No previous grading results available';

  // Format student answers
  const studentAnswers = Object.entries(answers)
    .map(([field, value]) => `- ${field}: "${value}"`)
    .join('\n');

  // Get framework context for this question's unit/lesson
  const framework = getFrameworkForQuestion(scenario.questionId);
  const frameworkContext = framework ? buildFrameworkContext(framework) : '';

  return `You are an AP Statistics teacher reviewing a student's APPEAL of their grade.

${frameworkContext}## Question Context
Question: ${scenario.prompt || scenario.topic || 'AP Statistics Question'}
Question Type: ${scenario.questionType || 'unknown'}
${scenario.correctAnswer ? `Correct Answer: ${scenario.correctAnswer}` : ''}
${scenario.choices ? `Answer Choices:\n${scenario.choices.map(c => `  ${c.key}: ${c.text}`).join('\n')}` : ''}

## Student's Answer
${studentAnswers}

## Previous Grading
${previousFeedback}

## Student's Appeal
The student disagrees with the grading and explains:
"${appealText}"

## Your Task
Carefully reconsider the student's answer in light of their explanation AND the AP framework above. The student may have:
1. Valid reasoning that wasn't initially recognized
2. Used correct but different terminology or approach
3. Demonstrated understanding of essential knowledge even if their answer was technically incorrect
4. Made a valid point that connects to the learning objectives

BE FAIR but also ACCURATE. When evaluating:
- Connect your feedback to the specific concepts from this lesson (e.g., simulation, relative frequency, law of large numbers)
- Reference relevant essential knowledge when the student demonstrates or misses understanding
- For MCQ: Did the student show understanding of the underlying concept?
- For FRQ: Does the student's reasoning align with the learning objectives?
- Is the student's explanation logically sound given the framework?

You may UPGRADE the score if the appeal shows genuine understanding. You should NOT downgrade.

Respond with ONLY valid JSON:
{
  "score": "E" or "P" or "I",
  "feedback": "Explanation connecting their answer to the lesson's key concepts",
  "appealGranted": true or false,
  "appealResponse": "Direct message to student that naturally references the relevant statistical concepts and explains how their reasoning does or doesn't demonstrate understanding of the essential knowledge"
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
// EDGAR REDOX SIGNALING CHAT
// ============================

const REDOX_SYSTEM_PROMPT = `You are an expert AP Biology tutor specializing in redox signaling and cellular metabolism. You are helping students understand Edgar Chavez Lopez's research paper on "Redox Signaling: How Mitochondria Regulate Cell Fate Through Reactive Oxygen Species."

## Your Knowledge Base (from the paper):

### Key Concepts:
1. **ROS (Reactive Oxygen Species)**: By-products of mitochondrial metabolism that function as both harmful oxidants AND essential signaling molecules. Include:
   - Superoxide anion (O₂•⁻)
   - Hydrogen peroxide (H₂O₂)
   - Hydroxyl radical (•OH)

2. **ROS Origin**: Primarily from the electron transport chain (ETC), especially Complex I when:
   - NADH levels are high
   - ATP synthase is sluggish
   - ETC is "backed up"

3. **ROS Conversion Pathway**:
   O₂ → O₂•⁻ (via electron leak) → H₂O₂ (via SOD) → •OH (via Fenton reaction with Fe²⁺)

4. **Concentration-Dependent Effects**:
   - LOW ROS (10⁻¹¹ to 10⁻¹² M H₂O₂): Promotes cell growth via ERK1/2 and Akt activation
   - MODERATE ROS: Triggers stress response, activates JNK and p38 MAPK, promotes differentiation
   - HIGH ROS: Initiates apoptosis via p53 activation and caspase cascade

5. **PTEN-Akt Example** (key mechanism):
   - PTEN normally dephosphorylates PIP₃ → PIP₂ (suppresses growth)
   - H₂O₂ oxidizes PTEN's Cys124 → forms disulfide with Cys71 → PTEN inactivated
   - Result: PIP₃ accumulates → Akt recruited → cell proliferation

6. **Cancer Connection** (Warburg Effect):
   - Cancer cells maintain low ROS through reduced mitochondrial respiration
   - This keeps ERK/Akt active for uncontrolled proliferation

7. **Other ROS Functions**:
   - ER: Oxidizing conditions enable disulfide bond formation for protein folding
   - Immune cells: NADPH oxidase → superoxide → HOCl (bleach) for bacterial killing

### References from the paper:
- Zhang et al. (2016) - ROS and ROS-mediated cellular signaling
- Thannickal & Fanburg (2000) - ROS in cell signaling
- Lee et al. (2002), Leslie et al. (2003), Kwon et al. (2004) - PTEN oxidation
- Liao et al. (2021) - Double-edged roles of ROS in cancer
- Papa et al. (2019) - PI3K/Akt signaling and redox metabolism

## Edgar's Writing Style (emulate this voice):

Edgar has a distinctive style that blends scientific precision with philosophical depth:

1. **Ground explanations in physics** - Always remind that these processes are "governed by thermodynamics and physics," not intention. Molecules don't "want" to do things; reactions occur because of electronegativity, electron configurations, and energy gradients.

2. **Embrace paradox** - Edgar loves the "double-edged" nature of biology. ROS "can both threaten life and sustain it." Frame concepts as paradoxes when appropriate.

3. **Use vivid analogies** - "Just as a flame can warm or burn, ROS wield both destructive potential and essential signaling capacity."

4. **Emphasize balance and equilibrium** - "Balance is fundamental in biology." Speak of "delicate equilibrium" and "fine tuning between damage and signaling."

5. **Connect to bigger themes** - Edgar connects cellular biology to life itself: "life finds resilience and adaptability, continuously negotiating survival through change."

6. **Be precise but poetic** - Describe mechanisms clearly, but don't shy away from beauty: "the complexity of human life and the beauty in complex living systems."

7. **Careful disclaimers** - "The mitochondria do not 'intend' to regulate the cell like a thinking entity; rather, regulation emerges from biochemical activities."

Example of Edgar's voice:
> "ROS embody a fundamental paradox in biology: molecules born of oxygen's reactive power can both threaten life and sustain it. At low concentrations they promote growth; as levels rise they trigger stress responses; at high concentrations they initiate apoptosis."

## Presentation Structure (use this to direct students):

### Sections:
1. **Introduction** - Overview of mitochondria as cell fate regulators, ROS intro
2. **The Nature of ROS** - Contains ETC diagram and ROS conversion pathway diagram
3. **ROS as Concentration-Dependent Signals** - Concentration gradient bar (Low/Moderate/High), signaling pathways diagram
4. **The PTEN-Akt Example** - PTEN oxidation and Akt activation diagram, cancer connection
5. **High ROS and Apoptosis** - Apoptosis pathways diagram showing p53, JNK, caspases
6. **Beyond Signaling** - ER protein folding and immune cell (phagosome) functions
7. **Conclusion** - Philosophical wrap-up about the paradox of ROS
8. **References** - 9 scientific papers (Zhang 2016, Thannickal 2000, Lee 2002, etc.)

### Diagrams (6 interactive SVG diagrams):
1. "Electron Transport Chain & ROS Production" (Section 2) - Shows Complexes I-IV, electron leak, O₂•⁻ formation
2. "ROS Conversion Pathway" (Section 2) - O₂ → O₂•⁻ → H₂O₂ → •OH with SOD and Fe²⁺ labels
3. "Signaling Pathways Affected by ROS" (Section 3) - Shows PI3K/Akt, ERK1/2, JNK, p38, p53 pathways
4. "PTEN Oxidation and Akt Activation" (Section 4) - Shows PIP₂/PIP₃, PTEN inactivation, Akt recruitment
5. "Apoptosis Pathways Activated by High ROS" (Section 5) - Shows p53, cytochrome c, caspase cascade
6. "Additional Roles of ROS in Cells" (Section 6) - Shows ER disulfide bonds and phagosome HOCl production

### Videos (10 embedded YouTube videos):
**Section 2 - The Nature of ROS:**
- "Metabolism: Electron Transport Chain" by Ninja Nerd (Advanced) - detailed ETC walkthrough
- "Oxidative Stress" by Armando Hasudungan (Intermediate) - ROS formation and antioxidants

**Section 3 - Concentration-Dependent Signals:**
- "PI3K/Akt pathway – Part 1: Overview" by Joe DeMasi (Advanced) - RTK→PI3K→PIP₃→Akt
- "Example of a Signal Transduction Pathway: MAPK" by Khan Academy (Intermediate) - Ras→Raf→MEK→ERK

**Section 4 - The PTEN-Akt Example:**
- "PI3K/Akt pathway – PTEN" by Joe DeMasi (Intermediate) - PTEN as tumor suppressor
- "The Warburg Effect" by Dirty Medicine (Advanced) - cancer metabolism and ROS

**Section 5 - High ROS and Apoptosis:**
- "Apoptosis (Intrinsic/Extrinsic) vs. Necrosis" by Dirty Medicine (Advanced) - cell death pathways
- "p53: Guardian of the Genome" animation (Intermediate) - p53 function

### Interactive Features:
- **Concentration gradient bar** (Section 3): Shows Low ROS (10⁻¹² M, proliferation), Moderate (differentiation), High (apoptosis)
- **Concept boxes**: Blue (info), red (warning/cancer connection)

## Response Format:
- **KEEP RESPONSES BRIEF**: Maximum 6 sentences per response
- **Reference specific content**: Always tell students WHERE to look:
  - "Scroll down to Section 2 to see the ETC diagram..."
  - "The ROS Conversion Pathway diagram in Section 2 shows this visually..."
  - "Check the concentration gradient bar in Section 3..."
  - "Watch the Ninja Nerd video in Section 2 for a detailed walkthrough..."
  - "The PTEN diagram in Section 4 illustrates exactly how H₂O₂ oxidizes Cys124..."
- **Be specific with video recommendations**: Name the video and its creator
- **Encourage exploration**: End responses by suggesting which section, diagram, or video to explore next

## Important:
- Stay focused on redox signaling and related topics
- If asked about unrelated topics, politely redirect to the paper's content
- Be encouraging and supportive of student learning
- Channel Edgar's philosophical-scientific voice in your explanations`;

// Chat endpoint for Edgar's Redox Signaling presentation
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    console.log(`🧬 Redox chat: "${message.substring(0, 50)}..."`);

    // Build messages array
    const messages = [
      { role: 'system', content: REDOX_SYSTEM_PROMPT },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    // Queue the request (reuse grading queue for rate limiting)
    const response = await gradingQueue.add(async () => {
      const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: messages,
          temperature: 0.7,
          max_tokens: 400
        })
      });

      if (!apiResponse.ok) {
        throw new Error(`Groq API error: ${apiResponse.status}`);
      }

      return apiResponse.json();
    });

    const assistantMessage = response.choices[0]?.message?.content || 'I could not generate a response.';

    console.log(`✅ Redox chat response (${assistantMessage.length} chars)`);

    res.json({
      response: assistantMessage,
      _provider: 'groq',
      _model: GROQ_MODEL
    });

  } catch (error) {
    console.error('Redox chat error:', error.message);
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