/**
 * Grade Coach ("Why so low?") endpoint tests
 *
 * Static parse of railway-server/server.js (same style as redox-chat.test.js).
 * Verifies the /api/ai/coach endpoint + COACH_SYSTEM_PROMPT grounding rules +
 * the buildCoachFacts helper. The coach must be grounded in handed facts and
 * must never invent work.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'railway-server', 'server.js');
const serverCode = fs.readFileSync(serverPath, 'utf8');

const promptMatch = serverCode.match(/const COACH_SYSTEM_PROMPT = `([\s\S]*?)`;/);
const systemPrompt = promptMatch ? promptMatch[1] : '';

describe('Coach system prompt exists', () => {
  it('has COACH_SYSTEM_PROMPT defined', () => {
    expect(serverCode).toMatch(/const COACH_SYSTEM_PROMPT/);
  });

  it('prompt is non-empty', () => {
    expect(systemPrompt.length).toBeGreaterThan(500);
  });

  it('is an AP Statistics coaching voice', () => {
    expect(systemPrompt).toMatch(/AP Statistics/);
  });
});

describe('Coach prompt enforces grounding (never invent)', () => {
  it('uses ONLY the provided facts', () => {
    expect(systemPrompt).toMatch(/ONLY the facts provided/i);
  });

  it('forbids inventing assignments/scores/tasks', () => {
    expect(systemPrompt).toMatch(/NEVER invent/i);
  });

  it('bans generic "study more" advice', () => {
    expect(systemPrompt).toMatch(/study more/i);
  });
});

describe('Coach prompt explains the two-track / 40% gate model', () => {
  it('names the PC track', () => {
    expect(systemPrompt).toMatch(/PC \(Progress-Check mastery\)/);
  });

  it('names the Work track', () => {
    expect(systemPrompt).toMatch(/Work track/);
  });

  it('explains the 40% gate', () => {
    expect(systemPrompt).toMatch(/40%/);
    expect(systemPrompt).toMatch(/gate|penaliz/i);
  });

  it('tells the AI to name the biggest bottleneck first', () => {
    expect(systemPrompt).toMatch(/bottleneck/i);
  });
});

describe('Coach prompt is direct + brief (not Socratic)', () => {
  it('is direct, not a Socratic quiz', () => {
    expect(systemPrompt).toMatch(/NOT a Socratic/i);
  });

  it('enforces a brevity target', () => {
    expect(systemPrompt).toMatch(/120-180 words/);
  });

  it('asks for 2-3 concrete actions', () => {
    expect(systemPrompt).toMatch(/2-3 concrete/i);
  });
});

describe('buildCoachFacts helper', () => {
  it('is defined', () => {
    expect(serverCode).toMatch(/function buildCoachFacts\(/);
  });

  it('handles un-attempted (null) values defensively', () => {
    expect(serverCode).toMatch(/not yet attempted/);
  });

  it('surfaces the next task and weak lessons', () => {
    expect(serverCode).toMatch(/earliest unfinished assignment/);
    expect(serverCode).toMatch(/weakLessons/);
  });
});

describe('Coach endpoint configuration', () => {
  it('registers POST /api/ai/coach', () => {
    expect(serverCode).toMatch(/app\.post\(['"]\/api\/ai\/coach['"]/);
  });

  it('requires a context object', () => {
    expect(serverCode).toMatch(/context is required/);
  });

  it('returns 503 when AI is unavailable', () => {
    // The coach branch must guard on AI_AVAILABLE like the other AI routes.
    const coachIdx = serverCode.indexOf("'/api/ai/coach'");
    expect(coachIdx).toBeGreaterThan(-1);
    const coachBlock = serverCode.slice(coachIdx, coachIdx + 2000);
    expect(coachBlock).toMatch(/!AI_AVAILABLE/);
    expect(coachBlock).toMatch(/503/);
  });

  it('reuses the grading queue with free-form (non-JSON) output', () => {
    const coachIdx = serverCode.indexOf("'/api/ai/coach'");
    const coachBlock = serverCode.slice(coachIdx, coachIdx + 2000);
    expect(coachBlock).toMatch(/gradingQueue\.add/);
    expect(coachBlock).toMatch(/skipJsonFormat:\s*true/);
    expect(coachBlock).toMatch(/rawResponse:\s*true/);
  });

  it('injects the facts into the system message (grounds every turn)', () => {
    const coachIdx = serverCode.indexOf("'/api/ai/coach'");
    const coachBlock = serverCode.slice(coachIdx, coachIdx + 2000);
    expect(coachBlock).toMatch(/buildCoachFacts\(context\)/);
    expect(coachBlock).toMatch(/systemMessage/);
  });

  it('limits conversation history', () => {
    const coachIdx = serverCode.indexOf("'/api/ai/coach'");
    const coachBlock = serverCode.slice(coachIdx, coachIdx + 2000);
    expect(coachBlock).toMatch(/history\.slice\(-8\)/);
  });
});

describe('Coach facts: no-quiz topics + unit label + unrecorded-work coaching', () => {
  it('only mentions a quiz when one exists (quizTotal > 0)', () => {
    expect(serverCode).toMatch(/w\.quizTotal\s*>\s*0/);
  });

  it('strips the leading U from the unit label (no "Unit U1")', () => {
    expect(serverCode).toMatch(/replace\(\/\^\[Uu\]\/,/);
  });

  it('coaches that unrecorded work shows 0% (check/submit while signed in)', () => {
    expect(systemPrompt).toMatch(/not recorded yet/);
    expect(systemPrompt).toMatch(/CHECKED\/submitted while signed in/);
  });
});

describe('Coach facts: prioritize the lowest-scoring component (biggest win)', () => {
  it('surfaces a BIGGEST WIN line from ctx.biggestWin', () => {
    expect(serverCode).toMatch(/BIGGEST WIN \(lead with this\)/);
    expect(serverCode).toMatch(/ctx\.biggestWin/);
  });

  it('suppresses the earliest-unfinished line when a biggest win exists', () => {
    expect(serverCode).toMatch(/!ctx\.biggestWin && ctx\.nextTask/);
  });

  it('the prompt tells the AI to lead with the lowest-scoring component, not earliest-unfinished', () => {
    expect(systemPrompt).toMatch(/LOWEST-scoring component/);
    expect(systemPrompt).toMatch(/NOT the earliest-unfinished/);
  });
});

describe('Coach: Blooket make-up awareness', () => {
  it('the prompt explains the Blooket flashcard make-up (80%)', () => {
    expect(systemPrompt).toMatch(/Blooket/);
    expect(systemPrompt).toMatch(/flashcards/);
    expect(systemPrompt).toMatch(/80%/);
    expect(systemPrompt).toMatch(/make it up|make-up/i);
  });

  it('the prompt forbids inventing a Blooket for a lesson that has none', () => {
    expect(systemPrompt).toMatch(/never invent a Blooket/i);
  });

  it('buildCoachFacts surfaces the Work-track breakdown (incl. the Blooket sub-track)', () => {
    expect(serverCode).toMatch(/Work track breakdown/);
    expect(serverCode).toMatch(/ctx\.workTracks/);
  });

  it('buildCoachFacts lists undone Blookets as make-up opportunities', () => {
    expect(serverCode).toMatch(/ctx\.blooket/);
    expect(serverCode).toMatch(/make each up to 80%/);
    expect(serverCode).toMatch(/b\.todo/);
  });

  it('a weak-lesson line includes Blooket only when the lesson has one', () => {
    expect(serverCode).toMatch(/w\.hasBlooket/);
    expect(serverCode).toMatch(/Blooket not done/);
  });
});

describe('Coach: PC track not-open-yet (no PC pushing before the fall)', () => {
  it('prompt forbids recommending PC work when the PC track is NOT OPEN YET', () => {
    expect(systemPrompt).toMatch(/NOT OPEN YET/);
    expect(systemPrompt).toMatch(/NEVER tell the student to do, complete, raise/i);
  });
  it('buildCoachFacts has a pcDue-driven NOT OPEN YET branch (explicit pcDue === false)', () => {
    expect(serverCode).toMatch(/ctx\.pcDue === false/);
    expect(serverCode).toMatch(/NOT OPEN YET/);
    expect(serverCode).toMatch(/do NOT tell the student to work on Progress Checks/);
  });
});

describe('Coach: flashcard completion/unlock gate', () => {
  it('prompt names flashcards as the completion + unlock gate', () => {
    expect(systemPrompt).toMatch(/COMPLETION and next-lesson UNLOCK gate/);
    expect(systemPrompt).toMatch(/NEXT-STEP GATE/);
  });
  it('prompt frames flashcards as completing/unlocking, not a grade jump', () => {
    expect(systemPrompt).toMatch(/NOT as a big grade jump/);
  });
  it('prompt frames Blooket as mean-of-recorded (a missing one is NOT counted as 0)', () => {
    expect(systemPrompt).toMatch(/NOT counted as 0/);
  });
  it('prompt: a strong single-track grade is affirmed, not given a manufactured bottleneck', () => {
    expect(systemPrompt).toMatch(/do NOT manufacture a bottleneck/);
  });
  it('buildCoachFacts emits a NEXT-STEP GATE line from ctx.flashcardGate', () => {
    expect(serverCode).toMatch(/ctx\.flashcardGate/);
    expect(serverCode).toMatch(/NEXT-STEP GATE/);
  });
});

describe('Coach: re-submit advice is gated (not proactive for undone work)', () => {
  it('does not proactively tell students to re-submit undone work', () => {
    expect(systemPrompt).toMatch(/Do NOT proactively tell a student to "re-submit"/);
    expect(systemPrompt).toMatch(/for undone work, tell them to DO it/);
  });
});

// Behavioral: actually run buildCoachFacts over the observed scenario.
function buildFacts(ctx) {
  const start = serverCode.indexOf('function buildCoachFacts(');
  let depth = 0, end = -1;
  for (let j = serverCode.indexOf('{', start); j < serverCode.length; j++) {
    if (serverCode[j] === '{') depth++;
    else if (serverCode[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const fnSrc = serverCode.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(fnSrc + '\nreturn buildCoachFacts;')()(ctx);
}

describe('buildCoachFacts behavior (the observed Elmer scenario)', () => {
  it('pcDue=false: says PCs are NOT OPEN YET and emits no PC-deficit note', () => {
    const facts = buildFacts({ quarter: 'Q1', grade: 100, ceiling: 100, pcAvg: null, pcDue: false, workAvg: 100, lessonsGraded: 1, lessonsDue: 1, lessonsTotal: 38, flashcardGate: [] });
    expect(facts).toMatch(/NOT OPEN YET/);
    expect(facts).not.toMatch(/PC track is below the 40% gate/);
  });
  it('pcDue=true + null pcAvg: keeps the normal "not yet attempted" framing', () => {
    const facts = buildFacts({ quarter: 'Q1', grade: 50, pcAvg: null, pcDue: true, workAvg: 50, flashcardGate: [] });
    expect(facts).toMatch(/PC \(Progress-Check mastery\) track: not yet attempted/);
    expect(facts).not.toMatch(/NOT OPEN YET/);
  });
  it('pcDue undefined (older client): falls back to normal framing, never NOT OPEN YET', () => {
    const facts = buildFacts({ quarter: 'Q1', pcAvg: null, workAvg: 100, flashcardGate: [] });
    expect(facts).not.toMatch(/NOT OPEN YET/);
    expect(facts).toMatch(/PC \(Progress-Check mastery\) track: not yet attempted/);
  });
  it('flashcardGate present: emits a NEXT-STEP GATE line naming the topic', () => {
    const facts = buildFacts({ quarter: 'Q1', pcAvg: null, pcDue: false, workAvg: 100, flashcardGate: [{ lesson: '1.1', worksheet: 100, blooket: null }] });
    expect(facts).toMatch(/NEXT-STEP GATE/);
    expect(facts).toMatch(/Topic 1\.1/);
  });
});
