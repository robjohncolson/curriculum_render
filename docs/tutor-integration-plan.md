# AP Statistics Tutor Integration Plan

## Overview

Integrate the fine-tuned Qwen model tutor (running locally on port 8765) with the curriculum_render quiz application.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CURRICULUM_RENDER                          │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ index.html  │───►│ Railway      │───►│ Groq API         │   │
│  │ (Frontend)  │    │ Server:3000  │    │ (llama-3.3-70b)  │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│        │                   │                                    │
│        │                   ▼                                    │
│        │            ┌──────────────┐                           │
│        └───────────►│ Supabase     │                           │
│                     │ (Cloud DB)   │                           │
│                     └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      APSTATS-RAG (Separate)                     │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │ Browser     │───►│ server.py:8765                       │   │
│  │ (Standalone)│    │ - Fine-tuned Qwen3-0.6B/1.7B         │   │
│  └─────────────┘    │ - Multi-turn conversation            │   │
│                     │ - No RAG (pure model knowledge)      │   │
│                     └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                      INTEGRATED SYSTEM                          │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ index.html  │───►│ Railway      │───►│ Groq API         │   │
│  │ + Tutor UI  │    │ Server:3000  │    │ (grading only)   │   │
│  └─────────────┘    └──────┬───────┘    └──────────────────┘   │
│        │                   │                                    │
│        │                   ▼                                    │
│        │            ┌──────────────┐                           │
│        │            │ Tutor Proxy  │                           │
│        │            │ /api/tutor/* │                           │
│        │            └──────┬───────┘                           │
│        │                   │                                    │
│        │                   ▼                                    │
│        │            ┌──────────────────────────────────────┐   │
│        │            │ apstats-rag server.py:8765           │   │
│        │            │ (Local fine-tuned Qwen models)       │   │
│        │            └──────────────────────────────────────┘   │
│        │                                                        │
│        ▼                                                        │
│  ┌──────────────┐                                              │
│  │ Supabase     │                                              │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Railway Server - Add Tutor Proxy Endpoints

**File: `railway-server/server.js`**

Add these endpoints to proxy requests to the local tutor server:

```javascript
// ============================
// AP STATS TUTOR PROXY
// ============================

const TUTOR_SERVER_URL = process.env.TUTOR_SERVER_URL || 'http://localhost:8765';

// Proxy chat to local tutor
app.post('/api/tutor/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await fetch(`${TUTOR_SERVER_URL}/ask?q=${encodeURIComponent(message)}`);
    const data = await response.json();

    res.json({
      response: data.response,
      _provider: 'local-qwen',
      _model: 'qwen3-0.6b'
    });

  } catch (error) {
    console.error('Tutor proxy error:', error.message);
    // Fallback to Groq if local tutor unavailable
    res.status(503).json({
      error: 'Local tutor unavailable',
      fallback: true
    });
  }
});

// Get tutor status
app.get('/api/tutor/status', async (req, res) => {
  try {
    const response = await fetch(`${TUTOR_SERVER_URL}/status`);
    const data = await response.json();
    res.json({ available: true, ...data });
  } catch (error) {
    res.json({ available: false, error: error.message });
  }
});

// Switch tutor model
app.post('/api/tutor/model', async (req, res) => {
  try {
    const { model } = req.body;
    const response = await fetch(`${TUTOR_SERVER_URL}/models?switch=${model}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

// Clear tutor conversation
app.post('/api/tutor/clear', async (req, res) => {
  try {
    const response = await fetch(`${TUTOR_SERVER_URL}/clear`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});
```

### Phase 2: Frontend - Add Tutor Chat Panel

**File: `index.html`** (add to the page)

```html
<!-- Tutor Chat Panel (collapsible sidebar) -->
<div id="tutorPanel" class="tutor-panel collapsed">
  <div class="tutor-header" onclick="toggleTutorPanel()">
    <span class="tutor-icon">🎓</span>
    <span class="tutor-title">AP Stats Tutor</span>
    <span class="tutor-toggle">◀</span>
  </div>

  <div class="tutor-body">
    <div class="tutor-model-select">
      <select id="tutorModel" onchange="switchTutorModel()">
        <option value="qwen3-0.6b">Qwen3 0.6B (Fast)</option>
        <option value="qwen3-1.7b">Qwen3 1.7B (Quality)</option>
      </select>
      <button onclick="clearTutorChat()" class="btn-clear-tutor">Clear</button>
    </div>

    <div id="tutorMessages" class="tutor-messages">
      <div class="tutor-message assistant">
        Hi! I'm your AP Statistics tutor. Ask me anything about the concepts you're learning!
      </div>
    </div>

    <div class="tutor-input-area">
      <input type="text" id="tutorInput" placeholder="Ask about statistics..."
             onkeypress="if(event.key==='Enter')sendTutorMessage()">
      <button onclick="sendTutorMessage()">Send</button>
    </div>
  </div>
</div>
```

**CSS additions:**

```css
.tutor-panel {
  position: fixed;
  right: 0;
  top: 100px;
  width: 350px;
  height: calc(100vh - 120px);
  background: white;
  border-left: 2px solid #3498db;
  box-shadow: -2px 0 10px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
  z-index: 1000;
}

.tutor-panel.collapsed {
  transform: translateX(310px);
}

.tutor-panel.collapsed .tutor-toggle {
  transform: rotate(180deg);
}

.tutor-header {
  background: #3498db;
  color: white;
  padding: 12px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
}

.tutor-messages {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.tutor-message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  max-width: 90%;
  line-height: 1.4;
  white-space: pre-wrap;
}

.tutor-message.user {
  background: #3498db;
  color: white;
  margin-left: auto;
}

.tutor-message.assistant {
  background: #ecf0f1;
  color: #2c3e50;
}

.tutor-input-area {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #ddd;
}

.tutor-input-area input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.tutor-input-area button {
  padding: 10px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
```

**JavaScript additions:**

```javascript
// ============================
// TUTOR PANEL FUNCTIONS
// ============================

let tutorAvailable = false;

async function checkTutorStatus() {
  try {
    const res = await fetch('/api/tutor/status');
    const data = await res.json();
    tutorAvailable = data.available;

    if (tutorAvailable) {
      document.getElementById('tutorPanel').style.display = 'flex';
      document.getElementById('tutorModel').value = data.current_model;
    } else {
      document.getElementById('tutorPanel').style.display = 'none';
    }
  } catch (e) {
    tutorAvailable = false;
    document.getElementById('tutorPanel').style.display = 'none';
  }
}

function toggleTutorPanel() {
  document.getElementById('tutorPanel').classList.toggle('collapsed');
}

async function sendTutorMessage() {
  const input = document.getElementById('tutorInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';

  const messagesDiv = document.getElementById('tutorMessages');

  // Add user message
  messagesDiv.innerHTML += `<div class="tutor-message user">${escapeHtml(message)}</div>`;

  // Add thinking indicator
  const thinkingId = 'thinking-' + Date.now();
  messagesDiv.innerHTML += `<div id="${thinkingId}" class="tutor-message assistant" style="color:#7f8c8d;font-style:italic;">Thinking...</div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  try {
    const res = await fetch('/api/tutor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    // Replace thinking with response
    const thinkingDiv = document.getElementById(thinkingId);
    thinkingDiv.style.color = '';
    thinkingDiv.style.fontStyle = '';
    thinkingDiv.textContent = data.response;

  } catch (e) {
    document.getElementById(thinkingId).textContent = 'Error: Could not reach tutor';
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function switchTutorModel() {
  const model = document.getElementById('tutorModel').value;
  try {
    await fetch('/api/tutor/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
  } catch (e) {
    console.error('Failed to switch model:', e);
  }
}

async function clearTutorChat() {
  try {
    await fetch('/api/tutor/clear', { method: 'POST' });
    document.getElementById('tutorMessages').innerHTML =
      '<div class="tutor-message assistant">Chat cleared! Ask me anything about AP Statistics.</div>';
  } catch (e) {
    console.error('Failed to clear chat:', e);
  }
}

// Check tutor status on load
document.addEventListener('DOMContentLoaded', checkTutorStatus);
```

### Phase 3: Context-Aware Tutoring

Enhance the tutor to understand what question the student is currently viewing:

```javascript
// When student views a question, update tutor context
function onQuestionFocus(questionId) {
  const framework = getFrameworkForQuestion(questionId);

  if (framework && tutorAvailable) {
    // Send context to tutor (optional enhancement)
    fetch('/api/tutor/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId,
        unit: framework.unit,
        lesson: framework.lesson,
        topic: framework.topic
      })
    });
  }
}
```

---

## Deployment Considerations

### Local Development
```bash
# Terminal 1: Run tutor server
cd C:\Users\rober\Downloads\Projects\not-school\apstats-rag
python server.py

# Terminal 2: Run Railway server
cd C:\Users\rober\Downloads\Projects\school\curriculum_render\railway-server
npm run dev

# Terminal 3: Serve frontend
cd C:\Users\rober\Downloads\Projects\school\curriculum_render
npx http-server -p 8000
```

### Production Deployment

**Option A: Same Machine**
- Railway server runs on the same machine as tutor
- Set `TUTOR_SERVER_URL=http://localhost:8765`

**Option B: Separate Machines**
- Deploy tutor server to a machine with sufficient RAM (4GB+ for 1.7B model)
- Set `TUTOR_SERVER_URL=http://<tutor-machine-ip>:8765`

**Option C: Cloud with GPU (Future)**
- Deploy tutor to a cloud instance with GPU
- Faster inference, but recurring cost

---

## Feature Roadmap

### v1.0 - Basic Integration (This Plan)
- [x] Tutor panel in sidebar
- [x] Model switching
- [x] Conversation history
- [x] Clear chat

### v1.1 - Context Awareness
- [ ] Detect current question being viewed
- [ ] Inject question context into tutor prompt
- [ ] "Help me with this question" button on each question

### v1.2 - Smart Hints
- [ ] Tutor provides hints without giving answers
- [ ] Progressive hint system (general → specific)
- [ ] Track hints used per question

### v1.3 - Grading Integration
- [ ] Tutor explains why an answer was marked incorrect
- [ ] Appeal support through tutor conversation
- [ ] Learning recommendations based on wrong answers

---

## API Reference

### Tutor Endpoints (via Railway proxy)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tutor/chat` | POST | Send message, get response |
| `/api/tutor/status` | GET | Check tutor availability and current model |
| `/api/tutor/model` | POST | Switch between Qwen models |
| `/api/tutor/clear` | POST | Clear conversation history |
| `/api/tutor/context` | POST | Set current question context (v1.1) |

### Request/Response Examples

**Chat:**
```javascript
// Request
POST /api/tutor/chat
{ "message": "What is a Type I error?" }

// Response
{
  "response": "A Type I error occurs when...",
  "_provider": "local-qwen",
  "_model": "qwen3-0.6b"
}
```

**Status:**
```javascript
// Response
{
  "available": true,
  "current_model": "qwen3-0.6b",
  "description": "Qwen3 0.6B - Fast (~30s)",
  "conversation_length": 4
}
```
