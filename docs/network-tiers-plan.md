# Multi-Tier Network Architecture Plan

## Overview

A resilient network architecture that gracefully degrades through three tiers:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         NETWORK TIER HIERARCHY                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  TIER 1: TURBO MODE (Internet Available)                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Student Browser → Railway Server → Groq API + Supabase              │  │
│  │  - Full AI grading (llama-3.3-70b)                                   │  │
│  │  - Cloud sync across devices                                         │  │
│  │  - Real-time peer data                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │ Internet fails                              │
│                              ▼                                             │
│  TIER 2: LAN MODE (Internet Down, LAN Up)                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Student Browser → Teacher's Computer (LAN IP)                       │  │
│  │  - Local Qwen 0.6B for tutoring/grading                              │  │
│  │  - LAN-based peer sync (optional)                                    │  │
│  │  - No cloud dependency                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │ LAN fails                                   │
│                              ▼                                             │
│  TIER 3: OFFLINE MODE (No Network)                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Student Browser → IndexedDB only                                    │  │
│  │  - Pattern-based auto-grading (Tier 1 grading rules)                 │  │
│  │  - Local storage, sync when back online                              │  │
│  │  - Future: Local model on student device (if specs allow)            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Tier Detection Logic

```javascript
NetworkTier = {
  TURBO: 'turbo',      // Internet + Railway + Groq
  LAN: 'lan',          // LAN tutor available
  OFFLINE: 'offline'   // Local only
}

async function detectNetworkTier() {
  // 1. Try Turbo Mode (Railway server with internet)
  if (await checkTurboMode()) {
    return NetworkTier.TURBO;
  }

  // 2. Try LAN Mode (teacher's local tutor)
  if (await checkLANTutor()) {
    return NetworkTier.LAN;
  }

  // 3. Fall back to Offline
  return NetworkTier.OFFLINE;
}

async function checkTurboMode() {
  if (!window.TURBO_MODE || !window.RAILWAY_SERVER_URL) return false;

  try {
    const res = await fetch(`${RAILWAY_SERVER_URL}/health`, {
      timeout: 3000
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkLANTutor() {
  const lanIP = getLANTutorIP();  // From localStorage or manual input
  if (!lanIP) return false;

  try {
    const res = await fetch(`http://${lanIP}:8765/health`, {
      timeout: 2000
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## LAN Tutor Discovery

### Option 1: Manual IP Entry (Simplest, Most Reliable)

Teacher writes IP on board, students enter it once.

```html
<!-- LAN Setup Modal -->
<div id="lanSetupModal" class="modal">
  <h3>Connect to Classroom Tutor</h3>
  <p>Enter the IP address shown by your teacher:</p>
  <input type="text" id="lanIPInput" placeholder="192.168.1.100">
  <button onclick="saveLANIP()">Connect</button>
  <button onclick="clearLANIP()">Disconnect</button>
  <p id="lanStatus"></p>
</div>
```

```javascript
function saveLANIP() {
  const ip = document.getElementById('lanIPInput').value.trim();
  if (!isValidIP(ip)) {
    showError('Invalid IP address');
    return;
  }

  localStorage.setItem('LAN_TUTOR_IP', ip);
  testLANConnection(ip);
}

function getLANTutorIP() {
  return localStorage.getItem('LAN_TUTOR_IP');
}

function clearLANIP() {
  localStorage.removeItem('LAN_TUTOR_IP');
  updateNetworkStatus();
}

async function testLANConnection(ip) {
  try {
    const res = await fetch(`http://${ip}:8765/status`);
    const data = await res.json();
    document.getElementById('lanStatus').textContent =
      `Connected! Model: ${data.description}`;
  } catch (e) {
    document.getElementById('lanStatus').textContent =
      `Failed to connect: ${e.message}`;
  }
}
```

### Option 2: QR Code (Teacher Displays, Students Scan)

Teacher's tutor server displays QR code with connection URL.

```python
# In server.py - add QR display endpoint
import qrcode
import io
import base64

@app.get('/qr')
def get_qr():
    # Get local IP
    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)

    # Generate QR
    url = f"http://{local_ip}:8765"
    qr = qrcode.make(url)
    buffer = io.BytesIO()
    qr.save(buffer, format='PNG')
    b64 = base64.b64encode(buffer.getvalue()).decode()

    return f'<img src="data:image/png;base64,{b64}" style="width:300px">'
```

### Option 3: Broadcast/Announce (Future Enhancement)

Teacher's server broadcasts presence on local network.

```javascript
// Student listens for announcements (requires WebSocket or polling)
// This is more complex and may not work on all school networks
```

---

## Server Changes (server.py)

### 1. Bind to All Interfaces

```python
# Change from:
server = HTTPServer(("localhost", port), TutorHandler)

# To:
server = HTTPServer(("0.0.0.0", port), TutorHandler)
```

### 2. Add CORS Headers

```python
class TutorHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # ... existing code ...
        self.send_cors_headers()  # Add to all responses
```

### 3. Display Local IP on Startup

```python
import socket

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def main():
    global tutor
    tutor = TutorCore(DEFAULT_MODEL)

    local_ip = get_local_ip()
    port = 8765

    server = HTTPServer(("0.0.0.0", port), TutorHandler)

    print(f"\n{'='*50}")
    print(f"LAN TUTOR READY")
    print(f"{'='*50}")
    print(f"Local:   http://localhost:{port}")
    print(f"Network: http://{local_ip}:{port}")
    print(f"\nTell students to enter: {local_ip}")
    print(f"{'='*50}\n")
```

---

## Frontend Integration (curriculum_render)

### Network Status Indicator

```html
<!-- Add to header area -->
<div id="networkStatus" class="network-indicator">
  <span class="status-dot"></span>
  <span class="status-text">Checking...</span>
  <button onclick="showLANSetup()" class="lan-config-btn">LAN</button>
</div>
```

```css
.network-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f0f0f0;
  border-radius: 20px;
  font-size: 13px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot.turbo { background: #27ae60; }  /* Green - full internet */
.status-dot.lan { background: #f39c12; }     /* Orange - LAN only */
.status-dot.offline { background: #e74c3c; } /* Red - offline */

.lan-config-btn {
  padding: 2px 8px;
  font-size: 11px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}
```

### Network Tier Manager

```javascript
// network_manager.js

const NetworkManager = {
  currentTier: null,
  lanIP: null,

  async initialize() {
    this.lanIP = localStorage.getItem('LAN_TUTOR_IP');
    await this.detectTier();

    // Re-check periodically
    setInterval(() => this.detectTier(), 30000);

    // Re-check on network change
    window.addEventListener('online', () => this.detectTier());
    window.addEventListener('offline', () => this.setTier('offline'));
  },

  async detectTier() {
    // Try Turbo first
    if (await this.checkTurbo()) {
      this.setTier('turbo');
      return;
    }

    // Try LAN
    if (await this.checkLAN()) {
      this.setTier('lan');
      return;
    }

    // Offline
    this.setTier('offline');
  },

  async checkTurbo() {
    if (!window.TURBO_MODE) return false;
    try {
      const res = await fetch(`${RAILWAY_SERVER_URL}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async checkLAN() {
    if (!this.lanIP) return false;
    try {
      const res = await fetch(`http://${this.lanIP}:8765/health`, {
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  setTier(tier) {
    this.currentTier = tier;
    this.updateUI(tier);
    console.log(`Network tier: ${tier}`);
  },

  updateUI(tier) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');

    dot.className = 'status-dot ' + tier;

    const labels = {
      turbo: 'Cloud Connected',
      lan: 'LAN Tutor',
      offline: 'Offline Mode'
    };
    text.textContent = labels[tier];
  },

  // Get the appropriate AI endpoint based on current tier
  getAIEndpoint() {
    switch (this.currentTier) {
      case 'turbo':
        return { url: `${RAILWAY_SERVER_URL}/api/ai/grade`, type: 'groq' };
      case 'lan':
        return { url: `http://${this.lanIP}:8765/ask`, type: 'qwen' };
      case 'offline':
      default:
        return null;  // Use local pattern matching only
    }
  },

  // Get tutor chat endpoint
  getTutorEndpoint() {
    switch (this.currentTier) {
      case 'turbo':
        return `${RAILWAY_SERVER_URL}/api/tutor/chat`;  // Proxied
      case 'lan':
        return `http://${this.lanIP}:8765/ask`;  // Direct
      default:
        return null;
    }
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  NetworkManager.initialize();
});
```

### Adaptive AI Grading

```javascript
// Modify grading to use appropriate tier

async function requestAIReview(questionId, questionType) {
  const endpoint = NetworkManager.getAIEndpoint();

  if (!endpoint) {
    // Offline - use pattern matching only
    return autoGradeLocally(questionId, questionType);
  }

  if (endpoint.type === 'groq') {
    // Turbo mode - full Groq grading
    return await callGroqGrading(questionId, questionType);
  }

  if (endpoint.type === 'qwen') {
    // LAN mode - use local Qwen
    return await callLANTutor(questionId, questionType);
  }
}

async function callLANTutor(questionId, questionType) {
  const question = getQuestionData(questionId);
  const studentAnswer = getStudentAnswer(questionId);

  // Format prompt for Qwen grading
  const prompt = `Grade this AP Statistics answer.

Question: ${question.prompt}
Student Answer: ${studentAnswer}

Is this correct? If not, what's wrong? Respond with:
- Score: E (correct), P (partial), or I (incorrect)
- Brief feedback`;

  try {
    const res = await fetch(`http://${NetworkManager.lanIP}:8765/ask?q=${encodeURIComponent(prompt)}`);
    const data = await res.json();

    // Parse Qwen response into grading format
    return parseQwenGradingResponse(data.response);
  } catch (e) {
    console.error('LAN grading failed:', e);
    return autoGradeLocally(questionId, questionType);
  }
}

function parseQwenGradingResponse(response) {
  // Extract score from response
  const scoreMatch = response.match(/Score:\s*([EPI])/i);
  const score = scoreMatch ? scoreMatch[1].toUpperCase() : 'P';

  return {
    score,
    feedback: response,
    _provider: 'qwen-lan',
    _model: 'qwen3-0.6b'
  };
}
```

---

## Configuration Summary

### Student Side (curriculum_render)

```javascript
// network_config.js (new file)

window.NETWORK_CONFIG = {
  // Tier 1: Turbo Mode
  TURBO_ENABLED: true,
  RAILWAY_SERVER_URL: 'https://your-app.railway.app',

  // Tier 2: LAN Mode
  LAN_ENABLED: true,
  LAN_TUTOR_PORT: 8765,
  // LAN_TUTOR_IP stored in localStorage

  // Tier 3: Offline Mode
  OFFLINE_AUTO_GRADE: true,
  OFFLINE_LOCAL_MODEL: false,  // Future: run model on student device

  // Detection intervals
  TIER_CHECK_INTERVAL_MS: 30000,
  HEALTH_CHECK_TIMEOUT_MS: 3000
};
```

### Teacher Side (server.py)

```python
# Already configured for multi-model support
# Just need to:
# 1. Bind to 0.0.0.0 (all interfaces)
# 2. Add CORS headers
# 3. Display LAN IP on startup
```

---

## User Flow

### Teacher Setup
1. Start tutor server: `python server.py`
2. Note the displayed LAN IP (e.g., `192.168.1.42`)
3. Write IP on board or display QR code
4. Leave server running during class

### Student Connection
1. Open curriculum_render app
2. If internet works → automatic Turbo mode
3. If internet down → app prompts for LAN IP
4. Student enters IP from board
5. App connects to teacher's tutor
6. IP saved for future sessions

### Automatic Fallback
```
Student submits answer
       │
       ▼
  ┌─ Check Turbo ─┐
  │ (3s timeout)  │
  │               │
  ▼               ▼
Success         Fail
  │               │
  │      ┌─ Check LAN ─┐
  │      │ (2s timeout) │
  │      │              │
  │      ▼              ▼
  │   Success        Fail
  │      │              │
  ▼      ▼              ▼
Groq   Qwen         Pattern
Grade  Grade        Match
```

---

## Future Enhancements

### 1. LAN Peer Sync
When in LAN mode, sync answers between students via teacher's computer:
- Teacher's server acts as local Supabase
- Students push/pull answers through teacher
- Maintains peer consensus even offline

### 2. Local Student Models
When laptops are upgraded or phones allowed:
- Bundle lightweight model (e.g., Qwen 0.5B quantized)
- Run in WebGPU/WebAssembly
- Full offline AI capability

### 3. Mesh Networking
Students with capable devices share model access:
- Peer-to-peer model serving
- Load distribution across class
- No single point of failure

### 4. Progressive Download
Pre-cache model weights when on good internet:
- Download during idle time
- Available for future offline use
- Automatic cleanup when space needed
