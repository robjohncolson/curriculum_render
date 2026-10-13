/**
 * CED2026_SINGLE_SOURCE_SPEC §2 + §4 — old lesson keys are never printed.
 *
 * Boots the real page scripts in jsdom (same harness as quiz-settled-dom.test.js),
 * loads the real bank through the real crosswalk, and renders every quiz-chrome
 * surface: unit menu, topic pickers, quiz headings (menu path, Desk-embedded
 * ?u=&l= path, bonus lesson, PC makeup), question tags, resource labels and the
 * cloud-restore chips.
 *
 * Exclusion rule (by CONTEXT, never by allow-listing numbers): only quiz chrome
 * is scanned — question prompts, choices and tables are content and may hold any
 * decimal. In chrome text a `d.dd` number is allowed only when it IS the CED
 * topic of the lesson being shown; percentages are not lesson keys. The old
 * U#-L# / u#l# forms are never allowed in visible text (ids, data-* and the
 * "stored as …" tooltip are attributes, so textContent never sees them).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const crosswalk = JSON.parse(readFileSync(resolve(ROOT, 'data/2026-crosswalk.json'), 'utf8'));

const OLD_ID_FORM = /\bU\d+[-_]?L\d+\b|\bu\d+l\d+/i;
const DECIMAL = /(?<![\d.])([1-9]\.\d{1,2})(?![\d.]|\s*%)/g;

function pageScripts() {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const sources = [];
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        const src = /src="([^"]+)"/.exec(match[1]);
        if (src) {
            const file = resolve(ROOT, src[1]);
            if (/^https?:/.test(src[1]) || !existsSync(file)) continue;
            sources.push(readFileSync(file, 'utf8'));
            continue;
        }
        // Every inline block: the unit menu / topic picker / quiz heading live in
        // the block AFTER the main quiz script.
        sources.push(match[2]);
    }
    return sources;
}

let w;
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function bootPage() {
    const dom = new JSDOM('<!doctype html><body><div id="questionsContainer"></div></body>', {
        url: 'https://quiz.test/',
        runScripts: 'dangerously',
        virtualConsole: new VirtualConsole()
    });
    const win = dom.window;
    win.fetch = () => new Promise(() => {});
    win.alert = () => {};
    win.confirm = () => true;
    win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
    for (const code of pageScripts()) {
        const el = win.document.createElement('script');
        el.textContent = code;
        win.document.body.appendChild(el);
    }
    win.onload = null;
    win.Chart = function () { return { destroy() {}, update() {} }; };
    win.SY2627_CROSSWALK = crosswalk;
    win.eval(`
        currentUsername = 'Me'; window.currentUsername = 'Me';
        classData = { users: { Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} } } };
        initializeFromEmbeddedData();
    `);
    return win;
}

function text(selector) {
    return [...w.document.querySelectorAll(selector)].map(el => el.textContent.replace(/\s+/g, ' ').trim());
}

// Returns the offending tokens in `chromeText` given the CED topics that may appear.
function rawKeyLeaks(chromeText, allowedTopics) {
    const leaks = [];
    const oldForm = OLD_ID_FORM.exec(chromeText);
    if (oldForm) leaks.push(oldForm[0]);
    for (const match of chromeText.matchAll(DECIMAL)) {
        if (!allowedTopics.includes(match[1])) leaks.push(match[1]);
    }
    return leaks;
}

function cedTopicOfOldKey(oldKey) {
    const entry = crosswalk.map[oldKey];
    return entry?.status === 'core' ? entry.newTopic : null;
}

beforeAll(() => { w = bootPage(); });
afterAll(() => { try { w.close(); } catch (_) {} });

describe('quiz chrome never prints an old lesson key', () => {
    it('unit menu', () => {
        w.eval('renderUnitMenu()');
        const cards = text('.unit-card');
        expect(cards).toHaveLength(5);
        cards.forEach(card => expect(rawKeyLeaks(card, []), card).toEqual([]));
    });

    it('topic pickers for every unit (each button may show only its own topic)', () => {
        const units = w.eval('Object.keys(allCurriculumData)');
        // renderLessonSelector is async (awaits resources) — render each unit and read it.
        return units.reduce((chain, unit) => chain.then(async () => {
            await w.eval(`(async () => { currentNewUnit = ${unit}; allUnitTopics = byNewUnit[${unit}]; await renderLessonSelector(allCurriculumData[${unit}].unitInfo); })()`);
            const heading = text('.lesson-selector h3')[0];
            expect(heading, `unit ${unit}`).toMatch(new RegExp(`^Unit ${unit}: \\S`));
            expect(rawKeyLeaks(heading, []), heading).toEqual([]);

            const buttons = [...w.document.querySelectorAll('.lesson-btn')];
            expect(buttons.length, `unit ${unit}`).toBeGreaterThan(0);
            buttons.forEach(button => {
                const topic = button.id.replace(/^topic-btn-/, '').replace('-', '.');
                const label = button.textContent.replace(/\s+/g, ' ').trim();
                expect(rawKeyLeaks(label, [topic]), label).toEqual([]);
            });
        }), Promise.resolve());
    });

    it('quiz heading + resource labels for every CED topic opened from the menu', async () => {
        const topicsByUnit = w.eval('Object.fromEntries(Object.entries(byNewUnit).map(([u, t]) => [u, Object.keys(t)]))');
        for (const [unit, topics] of Object.entries(topicsByUnit)) {
            for (const topic of topics) {
                await w.eval(`(async () => { selectUnit(${unit}); await loadTopic('${topic}'); })()`);
                const chrome = [...text('.app-controls'), ...text('.resources-section h3'), ...text('.blooket-item'), ...text('.pdf-label')];
                expect(chrome[0], topic).toContain(`Topic ${topic}:`);
                chrome.forEach(line => expect(rawKeyLeaks(line, [topic]), `${topic}: ${line}`).toEqual([]));
            }
        }
    });

    it('Desk-embedded ?u=&l= headings for every old lesson in the bank, bonus included', async () => {
        const oldKeys = w.eval(`[...new Set(EMBEDDED_CURRICULUM.map(q => SY2627Overlay.oldTopicOf(q.id)).filter(Boolean))]`);
        expect(oldKeys).toContain('3.7');

        for (const oldKey of oldKeys) {
            const [oldUnit, oldLesson] = oldKey.split('.');
            const opened = await w.eval(`navigateToLesson(${oldUnit}, ${oldLesson})`);
            expect(opened, oldKey).toBe(true);

            const topic = cedTopicOfOldKey(oldKey);
            const heading = text('.app-controls')[0];
            if (topic) {
                expect(heading, oldKey).toContain(`Topic ${topic}:`);
            } else {
                expect(heading, oldKey).toContain('★ Beyond the Exam');
            }
            expect(rawKeyLeaks(heading, topic ? [topic] : []), `${oldKey}: ${heading}`).toEqual([]);
        }
    });

    it('PC makeup heading shows the Progress Check label, not its locator', async () => {
        await w.eval(`loadLessonWithResources({
            questions: [{ id: 'PC26-U1-A-01', type: 'multiple-choice', prompt: 'x', choices: [] }],
            newUnit: 1, newTopic: 'U1-PC-A', newLabel: 'Unit 1 Progress Check — Part A', updateUrl: false
        })`);
        const heading = text('.app-controls')[0];
        expect(heading).toContain('Unit 1 Progress Check — Part A');
        expect(heading).not.toContain('U1-PC');
    });

    it('PC heading survives every rerender path (incremental update, incremental rebuild, legacy)', async () => {
        await w.eval(`loadLessonWithResources({
            questions: [{ id: 'PC26-U1-A-01', type: 'multiple-choice', prompt: 'x', choices: [] }],
            newUnit: 1, newTopic: 'U1-PC-A', newLabel: 'Unit 1 Progress Check — Part A', updateUrl: false
        })`);

        // questions-list exists -> renderQuizIncremental takes its header-UPDATE branch.
        w.eval('renderQuizIncremental()');
        expect(text('.app-controls')[0]).toContain('Unit 1 Progress Check — Part A');

        // No questions-list -> the incremental renderer rebuilds the header from scratch.
        w.eval(`document.getElementById('questions-list').remove(); renderQuizIncremental();`);
        expect(text('.app-controls')[0]).toContain('Unit 1 Progress Check — Part A');

        w.eval('renderQuizLegacy()');
        const heading = text('.app-controls')[0];
        expect(heading).toContain('Unit 1 Progress Check — Part A');
        expect(heading).not.toMatch(/^Unit 1:\s*-/);
    });

    it('a rerender after switching lessons shows the NEW lesson heading, not the saved PC one', async () => {
        await w.eval(`loadLessonWithResources({
            questions: [{ id: 'PC26-U1-A-01', type: 'multiple-choice', prompt: 'x', choices: [] }],
            newUnit: 1, newTopic: 'U1-PC-A', newLabel: 'Unit 1 Progress Check — Part A', updateUrl: false
        })`);
        await w.eval('navigateToLesson(3, 5)');
        w.eval('renderQuizIncremental()');
        const heading = text('.app-controls')[0];
        expect(heading).toContain('Topic 1.13:');
        expect(heading).not.toContain('Progress Check');
    });

    it('every question card tag in the bank shows its CED topic (old id only in the tooltip)', () => {
        const rows = w.eval(`EMBEDDED_CURRICULUM.map((q, i) => {
            const host = document.createElement('div');
            host.innerHTML = renderQuestion(q, i).html;
            const tag = host.querySelector('.question-id');
            return { id: q.id, text: tag.textContent.trim(), title: tag.getAttribute('title') };
        })`);
        expect(rows).toHaveLength(367);
        rows.forEach(row => {
            const topic = cedTopicOfOldKey(w.eval(`SY2627Overlay.oldTopicOf('${row.id}')`));
            expect(row.title, row.id).toBe(`stored as ${row.id}`);
            expect(rawKeyLeaks(row.text, topic ? [topic] : []), `${row.id}: ${row.text}`).toEqual([]);
            if (topic) expect(row.text, row.id).toMatch(new RegExp(`^${topic.replace('.', '\\.')}( · Day \\d)? · Q\\d+$`));
            else expect(row.text, row.id).toMatch(/^★ Beyond the Exam · Q\d+$/);
        });
    });

    it('cloud-restore chips group by CED topic', () => {
        const ids = ['U3-L5-Q01', 'U3-L6-Q02', 'U3-L7-Q01', 'U1-PC-Q03', 'U6-L2-Q01'];
        w.eval(`(() => {
            const lessons = {};
            ${JSON.stringify(ids)}.forEach(id => {
                const key = cloudLessonDisplayKey(id);
                lessons[key] = lessons[key] || { answered: 0 };
                lessons[key].answered++;
            });
            showSyncProgressScreen({ title: 't', subtitle: 's', total: 5, details: { lessons }, onSkip() {} });
        })()`);
        const details = text('#syncProgressDetails')[0];
        expect(details).toContain('1.13 (2/?)');
        expect(details).toContain('★ Beyond the Exam (1/?)');
        expect(details).toContain('Progress Check (1/?)');
        expect(rawKeyLeaks(details, ['1.13', cedTopicOfOldKey('6.2')]), details).toEqual([]);
        w.document.getElementById('syncProgressScreen')?.remove();
    });

    it('resource titles that embed the old key are relabelled', () => {
        const title = (raw, topicId) => w.eval(`SY2627Overlay.resourceTitle(${JSON.stringify(raw)}, '${topicId}')`);
        expect(title('u3l5blooket', '3-5')).toBe('1.13 Blooket');
        expect(title('u1l10blooket_Review', '1-10')).toBe(`${cedTopicOfOldKey('1.10')} Blooket (Review)`);
        expect(title('u3l7blooket', '3-7')).toBe('★ Beyond the Exam Blooket');
        expect(title('u2l4_2blooket', '2-4')).toBe(`${cedTopicOfOldKey('2.4')} Blooket (2)`);
        expect(title('U1l8blooket', '1-8')).toBe(`${cedTopicOfOldKey('1.8')} Blooket`);
        expect(title('Practice Drills App', '3-5')).toBe('Practice Drills App');
    });

    it('the leak detector itself flags old keys and ignores content-style numbers', () => {
        expect(rawKeyLeaks('Unit 3, Lesson 3.5', ['1.13'])).toEqual(['3.5']);
        expect(rawKeyLeaks('Chart Wizard · U3-L5-Q01', [])).toEqual(['U3-L5']);
        expect(rawKeyLeaks('🎮 u3l5blooket', [])).toEqual(['u3l5']);
        expect(rawKeyLeaks('Topic 1.13: Experimental Design · 45% done', ['1.13'])).toEqual([]);
        expect(rawKeyLeaks('Score 2.5%', [])).toEqual([]);
    });
});
