// Fall-2026 CED display overlay.
// Question ids remain in the historical U#-L# form; this module only maps them
// to the new five-unit labels and topic buckets used by the quiz UI.
(function attachSY2627Overlay(global) {
    'use strict';

    const NEW_UNIT_LABELS = Object.freeze({
        1: 'Exploring One-Variable Data & Collecting Data',
        2: 'Probability, Random Variables & Distributions',
        3: 'Inference for Categorical Data: Proportions',
        4: 'Inference for Quantitative Data: Means',
        5: 'Regression Analysis'
    });

    function oldTopicOf(id) {
        if (typeof id !== 'string') return null;

        const match = id.match(/U(\d+)-L(\d+)/i);
        if (!match) return null;

        return `${match[1]}.${match[2]}`;
    }

    function crosswalkEntryForId(id, crosswalk) {
        const oldTopic = oldTopicOf(id);
        if (!oldTopic) return null;

        return crosswalk?.map?.[oldTopic] || null;
    }

    function requireCoreEntry(item, crosswalk) {
        const entry = crosswalkEntryForId(item?.id, crosswalk);
        if (entry?.status !== 'core' || !entry.newUnit || !entry.newTopic) {
            throw new Error(`No core Fall-2026 crosswalk entry for ${item?.id || 'unknown item'}`);
        }

        return entry;
    }

    function groupByNewUnit(items, crosswalk) {
        const byNewUnit = {};

        items.forEach((item) => {
            const entry = requireCoreEntry(item, crosswalk);
            const unitTopics = byNewUnit[entry.newUnit] ||= {};
            const topicQuestions = unitTopics[entry.newTopic] ||= [];
            topicQuestions.push(item);
        });

        return byNewUnit;
    }

    function compareTopicNumbers(left, right) {
        const leftParts = String(left).split('.').map(Number);
        const rightParts = String(right).split('.').map(Number);

        if (leftParts[0] !== rightParts[0]) {
            return leftParts[0] - rightParts[0];
        }

        return leftParts[1] - rightParts[1];
    }

    function questionsForOldLocator(items, oldUnit, oldLesson) {
        if (String(oldLesson).toUpperCase() === 'PC') return [];

        const unitNumber = Number.parseInt(oldUnit, 10);
        const lessonNumber = Number.parseInt(oldLesson, 10);
        if (!Number.isInteger(unitNumber) || !Number.isInteger(lessonNumber)) return [];

        const prefix = `U${unitNumber}-L${lessonNumber}-`.toUpperCase();
        return items.filter((item) => item.id.toUpperCase().startsWith(prefix));
    }

    function contextForQuestions(questions, crosswalk) {
        if (!questions?.length) return null;

        // Tolerant (unlike groupByNewUnit, which stays fail-loud): ids that don't
        // resolve to a core crosswalk entry — e.g. PC26 items served through the
        // makeup path — return null, and the caller falls back to an explicit
        // newUnit/newTopic/newLabel. Never throws.
        const entry = crosswalkEntryForId(questions[0] && questions[0].id, crosswalk);
        if (!entry || entry.status !== 'core' || !entry.newUnit || !entry.newTopic) return null;
        return {
            newUnit: entry.newUnit,
            newTopic: entry.newTopic,
            newLabel: entry.newLabel
        };
    }

    function oldTopicsForQuestions(questions) {
        const oldTopics = new Set();

        questions.forEach((question) => {
            const oldTopic = oldTopicOf(question.id);
            if (oldTopic) oldTopics.add(oldTopic);
        });

        return Array.from(oldTopics).sort(compareTopicNumbers);
    }

    function resourceTopicsForQuestions(resources, questions) {
        if (!Array.isArray(resources)) return [];

        return oldTopicsForQuestions(questions).flatMap((oldTopic) => {
            const [oldUnit, oldLesson] = oldTopic.split('.');
            const unitResources = resources.find((unit) => unit.unitId === `unit${oldUnit}`);
            if (!unitResources?.topics) return [];

            const topic = unitResources.topics.find((candidate) => {
                return candidate.id === `${oldUnit}-${oldLesson}`;
            });

            return topic ? [topic] : [];
        });
    }

    global.SY2627Overlay = Object.freeze({
        NEW_UNIT_LABELS,
        compareTopicNumbers,
        contextForQuestions,
        crosswalkEntryForId,
        groupByNewUnit,
        oldTopicOf,
        oldTopicsForQuestions,
        questionsForOldLocator,
        resourceTopicsForQuestions
    });
})(typeof window !== 'undefined' ? window : globalThis);
