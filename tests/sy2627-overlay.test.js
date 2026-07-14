import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const curriculumSource = readFileSync(resolve(ROOT, 'data/curriculum.js'), 'utf8');
const crosswalk = JSON.parse(
    readFileSync(resolve(ROOT, 'data/2026-crosswalk.json'), 'utf8')
);
const dataManagerSource = readFileSync(resolve(ROOT, 'js/data_manager.js'), 'utf8');
const overlaySource = readFileSync(resolve(ROOT, 'js/sy2627_overlay.js'), 'utf8');

function functionBody(source, name) {
    const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
    if (!match) throw new Error(`Function not found: ${name}`);

    let index = source.indexOf('(', match.index);
    let parenthesisDepth = 0;
    for (; index < source.length; index++) {
        if (source[index] === '(') parenthesisDepth++;
        if (source[index] !== ')') continue;

        parenthesisDepth--;
        if (parenthesisDepth === 0) {
            index++;
            break;
        }
    }

    let braceDepth = 0;
    for (let cursor = source.indexOf('{', index); cursor < source.length; cursor++) {
        if (source[cursor] === '{') braceDepth++;
        if (source[cursor] !== '}') continue;

        braceDepth--;
        if (braceDepth === 0) return source.slice(match.index, cursor + 1);
    }

    throw new Error(`Unbalanced function: ${name}`);
}

function bootOverlay() {
    const questionsContainer = { innerHTML: '' };
    const sandbox = {
        URL,
        URLSearchParams,
        console: {
            error() {},
            info() {},
            log() {},
            warn() {}
        },
        document: {
            getElementById(id) {
                return id === 'questionsContainer' ? questionsContainer : null;
            }
        },
        location: { search: '' }
    };
    sandbox.window = sandbox;

    const context = createContext(sandbox);
    runInContext(overlaySource, context);
    sandbox.SY2627_CROSSWALK = crosswalk;

    const renderUnitMenuSource = functionBody(html, 'renderUnitMenu');
    runInContext(`
        let allCurriculumData = {};
        let byNewUnit = {};
        let currentNewUnit = null;
        let currentUnit = null;
        let currentTopic = null;
        let currentLesson = null;
        let currentQuestions = [];
        let allUnitQuestions = [];
        let allUnitTopics = {};
        const NEW_UNIT_LABELS = SY2627Overlay.NEW_UNIT_LABELS;
        function isQuestionAnswered() { return false; }
        ${renderUnitMenuSource}
    `, context);

    runInContext(curriculumSource, context);
    runInContext(dataManagerSource, context);

    const state = runInContext(`
        initializeFromEmbeddedData();
        ({
            allCurriculumData,
            bank: EMBEDDED_CURRICULUM,
            byNewUnit,
            menuHtml: document.getElementById('questionsContainer').innerHTML
        });
    `, context);

    return { context, sandbox, state };
}

describe('Fall-2026 curriculum overlay smoke test', () => {
    it('loads the crosswalk before the embedded bank and renders exactly five units', () => {
        const crosswalkLoaderIndex = html.indexOf("fetch('data/2026-crosswalk.json')");
        const overlayIndex = html.indexOf('<script src="js/sy2627_overlay.js"></script>');
        const curriculumIndex = html.indexOf('<script src="data/curriculum.js"></script>');

        expect(crosswalkLoaderIndex).toBeGreaterThan(-1);
        expect(overlayIndex).toBeGreaterThan(crosswalkLoaderIndex);
        expect(curriculumIndex).toBeGreaterThan(overlayIndex);

        const { state } = bootOverlay();
        expect(Object.keys(state.allCurriculumData)).toEqual(['1', '2', '3', '4', '5']);
        expect(state.menuHtml.match(/class="unit-card"/g)).toHaveLength(5);
    });

    it('places every surviving item in its core new-unit/new-topic bucket', () => {
        const { sandbox, state } = bootOverlay();
        const groupedItems = Object.values(state.byNewUnit)
            .flatMap(unitTopics => Object.values(unitTopics))
            .flat();
        const groupedIds = new Set(groupedItems.map(item => item.id));

        expect(state.bank).toHaveLength(367);
        expect(groupedItems).toHaveLength(367);
        expect(groupedIds.size).toBe(367);

        state.bank.forEach(item => {
            const oldTopic = sandbox.SY2627Overlay.oldTopicOf(item.id);
            const entry = crosswalk.map[oldTopic];

            expect(entry?.status, item.id).toBe('core');
            expect(
                state.byNewUnit[entry.newUnit][entry.newTopic].some(candidate => {
                    return candidate.id === item.id;
                }),
                item.id
            ).toBe(true);
        });
    });

    it('keeps ?u=6&l=2 as an old-id locator displayed under new Unit 3', async () => {
        const { context, sandbox } = bootOverlay();
        sandbox.location.search = '?u=6&l=2';
        sandbox.loadLessonWithResources = async selection => {
            sandbox.renderedSelection = selection;
            return true;
        };

        runInContext(functionBody(html, 'navigateToLesson'), context);
        runInContext(functionBody(html, 'handleURLNavigation'), context);
        await runInContext('handleURLNavigation()', context);

        const navigationState = runInContext(`({
            currentNewUnit,
            currentTopic
        })`, context);
        const renderedQuestions = sandbox.renderedSelection.questions;

        expect(renderedQuestions.length).toBeGreaterThan(0);
        expect(renderedQuestions.every(item => item.id.startsWith('U6-L2-'))).toBe(true);
        expect(navigationState.currentNewUnit).toBe(3);
        expect(navigationState.currentTopic).toBe('3.3');
        expect(sandbox.renderedSelection.newTopic).toBe('3.3');
    });
});
