/**
 * Redox Chat System Prompt Tests
 *
 * Tests for the Edgar Redox Signaling AI tutor system prompt.
 * Ensures the prompt contains all required page structure references
 * to enable the AI to direct students to specific content.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'railway-server', 'server.js');
const serverCode = fs.readFileSync(serverPath, 'utf8');

// Extract the REDOX_SYSTEM_PROMPT from server.js
const promptMatch = serverCode.match(/const REDOX_SYSTEM_PROMPT = `([\s\S]*?)`;/);
const systemPrompt = promptMatch ? promptMatch[1] : '';

describe('Redox Chat System Prompt exists', () => {
    it('has REDOX_SYSTEM_PROMPT defined', () => {
        expect(serverCode).toMatch(/const REDOX_SYSTEM_PROMPT/);
    });

    it('prompt is non-empty', () => {
        expect(systemPrompt.length).toBeGreaterThan(1000);
    });
});

describe('System prompt contains page structure', () => {
    it('lists all 8 sections', () => {
        expect(systemPrompt).toMatch(/Introduction/);
        expect(systemPrompt).toMatch(/The Nature of ROS/);
        expect(systemPrompt).toMatch(/Concentration-Dependent Signals/);
        expect(systemPrompt).toMatch(/PTEN-Akt Example/);
        expect(systemPrompt).toMatch(/High ROS and Apoptosis/);
        expect(systemPrompt).toMatch(/Beyond Signaling/);
        expect(systemPrompt).toMatch(/Conclusion/);
        expect(systemPrompt).toMatch(/References/);
    });

    it('mentions section numbers for navigation', () => {
        expect(systemPrompt).toMatch(/Section 2/);
        expect(systemPrompt).toMatch(/Section 3/);
        expect(systemPrompt).toMatch(/Section 4/);
        expect(systemPrompt).toMatch(/Section 5/);
    });
});

describe('System prompt contains diagram references', () => {
    it('lists all 6 diagrams', () => {
        expect(systemPrompt).toMatch(/Electron Transport Chain.*ROS Production/);
        expect(systemPrompt).toMatch(/ROS Conversion Pathway/);
        expect(systemPrompt).toMatch(/Signaling Pathways Affected by ROS/);
        expect(systemPrompt).toMatch(/PTEN Oxidation.*Akt Activation/);
        expect(systemPrompt).toMatch(/Apoptosis Pathways/);
        expect(systemPrompt).toMatch(/Additional Roles of ROS/);
    });

    it('describes diagram content', () => {
        expect(systemPrompt).toMatch(/Complexes I-IV/);
        expect(systemPrompt).toMatch(/electron leak/);
        expect(systemPrompt).toMatch(/cytochrome c/);
        expect(systemPrompt).toMatch(/caspase/);
    });
});

describe('System prompt contains video references', () => {
    it('lists video creators', () => {
        expect(systemPrompt).toMatch(/Ninja Nerd/);
        expect(systemPrompt).toMatch(/Armando Hasudungan/);
        expect(systemPrompt).toMatch(/Joe DeMasi/);
        expect(systemPrompt).toMatch(/Khan Academy/);
        expect(systemPrompt).toMatch(/Dirty Medicine/);
    });

    it('includes video topics', () => {
        expect(systemPrompt).toMatch(/Electron Transport Chain/);
        expect(systemPrompt).toMatch(/Oxidative Stress/);
        expect(systemPrompt).toMatch(/PI3K\/Akt/);
        expect(systemPrompt).toMatch(/MAPK/);
        expect(systemPrompt).toMatch(/Warburg Effect/);
        expect(systemPrompt).toMatch(/Apoptosis/);
        expect(systemPrompt).toMatch(/p53/);
    });

    it('includes difficulty levels', () => {
        expect(systemPrompt).toMatch(/Advanced/);
        expect(systemPrompt).toMatch(/Intermediate/);
    });
});

describe('System prompt enforces brevity', () => {
    it('specifies maximum sentence limit', () => {
        expect(systemPrompt).toMatch(/6 sentences/i);
    });

    it('instructs to reference specific content', () => {
        expect(systemPrompt).toMatch(/Reference specific content/i);
    });

    it('provides example references', () => {
        expect(systemPrompt).toMatch(/Scroll down to Section/);
        expect(systemPrompt).toMatch(/Watch the.*video/i);
    });
});

describe('System prompt includes Edgar voice guidelines', () => {
    it('mentions Edgar writing style', () => {
        expect(systemPrompt).toMatch(/Edgar.*style/i);
    });

    it('includes physics/thermodynamics grounding', () => {
        expect(systemPrompt).toMatch(/thermodynamics|physics/i);
    });

    it('includes paradox theme', () => {
        expect(systemPrompt).toMatch(/paradox/i);
    });

    it('includes balance theme', () => {
        expect(systemPrompt).toMatch(/balance|equilibrium/i);
    });
});

describe('System prompt contains key biology concepts', () => {
    it('defines ROS types', () => {
        expect(systemPrompt).toMatch(/O₂•⁻|superoxide/i);
        expect(systemPrompt).toMatch(/H₂O₂|hydrogen peroxide/i);
        expect(systemPrompt).toMatch(/•OH|hydroxyl/i);
    });

    it('explains concentration effects', () => {
        expect(systemPrompt).toMatch(/low.*proliferation|growth/i);
        expect(systemPrompt).toMatch(/moderate.*differentiation|stress/i);
        expect(systemPrompt).toMatch(/high.*apoptosis/i);
    });

    it('covers PTEN mechanism', () => {
        expect(systemPrompt).toMatch(/PTEN/);
        expect(systemPrompt).toMatch(/Cys124|cysteine/i);
        expect(systemPrompt).toMatch(/PIP₃|PIP3/);
    });

    it('mentions key pathways', () => {
        expect(systemPrompt).toMatch(/ERK/);
        expect(systemPrompt).toMatch(/Akt/);
        expect(systemPrompt).toMatch(/JNK/);
        expect(systemPrompt).toMatch(/p38/);
    });
});

describe('Chat endpoint configuration', () => {
    it('has /api/ai/chat endpoint', () => {
        expect(serverCode).toMatch(/app\.post\(['"]\/api\/ai\/chat['"]/);
    });

    it('uses max_tokens limit for brevity', () => {
        // Should have reduced max_tokens (400) for brief responses
        expect(serverCode).toMatch(/max_tokens:\s*400/);
    });

    it('limits conversation history', () => {
        // Should slice history to prevent context overflow
        expect(serverCode).toMatch(/history\.slice\(-10\)/);
    });
});
