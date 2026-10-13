// Fall-2026 CED display overlay.
// Question ids remain in the historical U#-L# form; this module only maps them
// to the new five-unit labels and topic buckets used by the quiz UI.
//
// ALL mapping data comes from the vendored crosswalk (data/2026-crosswalk.json,
// copied from follow-alongs/2026-crosswalk.json by
// follow-alongs/scripts/sync-ced-crosswalk.mjs — never hand-edit the copy).
// The old key ("3.5", "U3-L5") is opaque storage: every student-facing string
// goes through topicLabelForId / questionLabel / topicHeading / unitLabel.
(function attachSY2627Overlay(global) {
    'use strict';

    // Used ONLY while the crosswalk carries no `units` map. Once the source
    // crosswalk adds `units: { "1": "..." }`, applyCrosswalk overwrites these.
    const FALLBACK_UNIT_LABELS = Object.freeze({
        1: 'Exploring One-Variable Data & Collecting Data',
        2: 'Probability, Random Variables & Distributions',
        3: 'Inference for Categorical Data: Proportions',
        4: 'Inference for Quantitative Data: Means',
        5: 'Regression Analysis'
    });

    const BONUS_PREFIX = '★ Beyond the Exam';

    // Live object: index.html captures this reference at parse time, before the
    // crosswalk fetch resolves, so applyCrosswalk mutates it in place.
    const NEW_UNIT_LABELS = Object.assign({}, FALLBACK_UNIT_LABELS);

    function currentCrosswalk(crosswalk) {
        return crosswalk || global.SY2627_CROSSWALK || null;
    }

    function unitLabelsFromCrosswalk(crosswalk) {
        const units = crosswalk?.units || crosswalk?.unitLabels;
        if (!units || typeof units !== 'object') return {};

        const labels = {};
        Object.entries(units).forEach(([unit, value]) => {
            const label = typeof value === 'string' ? value : (value?.label || value?.title);
            if (label) labels[unit] = String(label);
        });
        return labels;
    }

    function applyCrosswalk(crosswalk) {
        const labels = unitLabelsFromCrosswalk(crosswalk);
        Object.assign(NEW_UNIT_LABELS, labels);
        return crosswalk;
    }

    function unitLabel(newUnit, crosswalk) {
        const labels = unitLabelsFromCrosswalk(currentCrosswalk(crosswalk));
        return labels[newUnit] || NEW_UNIT_LABELS[newUnit] || '';
    }

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

    function isCoreEntry(entry) {
        return entry?.status === 'core' && Boolean(entry.newUnit) && Boolean(entry.newTopic);
    }

    function isBonusEntry(entry) {
        return entry?.status === 'bonus';
    }

    function bonusLabel(entry) {
        const label = String(entry?.newLabel || 'Additional practice')
            .replace(/^Beyond the Exam:\s*/i, '');
        return label;
    }

    function compareTopicNumbers(left, right) {
        const leftParts = String(left).split('.').map(Number);
        const rightParts = String(right).split('.').map(Number);

        if (leftParts[0] !== rightParts[0]) {
            return leftParts[0] - rightParts[0];
        }

        return leftParts[1] - rightParts[1];
    }

    // Old keys folded into one CED topic, in old-key order (1.13 = [3.5, 3.6]).
    function oldKeysForTopic(newTopic, crosswalk) {
        const map = crosswalk?.map || {};
        return Object.keys(map)
            .filter((oldKey) => isCoreEntry(map[oldKey]) && map[oldKey].newTopic === newTopic)
            .sort(compareTopicNumbers);
    }

    // Spec shape: { topic, text, unit, status }. status is 'core' | 'bonus' |
    // 'unmapped'; text never contains the old key.
    function topicLabelForId(id, crosswalk) {
        return topicLabelForOldKey(oldTopicOf(id), crosswalk);
    }

    function topicLabelForOldKey(oldTopic, crosswalk) {
        const map = currentCrosswalk(crosswalk);
        const entry = oldTopic ? map?.map?.[oldTopic] : null;

        if (isBonusEntry(entry)) {
            return {
                topic: null,
                text: `${BONUS_PREFIX} · ${bonusLabel(entry)}`,
                label: bonusLabel(entry),
                unit: entry.bonusUnit || null,
                status: 'bonus',
                day: null
            };
        }

        if (isCoreEntry(entry)) {
            const group = oldKeysForTopic(entry.newTopic, map);
            const day = group.length > 1 ? group.indexOf(oldTopic) + 1 : null;
            return {
                topic: entry.newTopic,
                text: `${entry.newTopic} · ${entry.newLabel}`,
                label: entry.newLabel,
                unit: entry.newUnit,
                status: 'core',
                day
            };
        }

        return { topic: null, text: '', label: '', unit: null, status: 'unmapped', day: null };
    }

    // Short visible tag for one question: "1.13 · Day 2 · Q1".
    function questionLabel(id, crosswalk) {
        const questionMatch = typeof id === 'string' ? id.match(/-Q(\d+)$/i) : null;
        const questionPart = questionMatch ? `Q${Number(questionMatch[1])}` : '';
        const label = topicLabelForId(id, crosswalk);

        let prefix = '';
        if (label.status === 'core') {
            prefix = label.day ? `${label.topic} · Day ${label.day}` : label.topic;
        } else if (label.status === 'bonus') {
            prefix = BONUS_PREFIX;
        }

        return [prefix, questionPart].filter(Boolean).join(' · ');
    }

    // Resource titles like "u3l5blooket" / "u4l3-5blooket" carry the old key:
    // show "1.13 Blooket" instead. Hand-written titles pass through unchanged.
    // resourceTopicId is the units.js topic id ("3-5").
    function resourceTitle(title, resourceTopicId, crosswalk) {
        const text = String(title || '');
        const match = /^u\d+[_-]?l[\d-]+(.*)$/i.exec(text.trim());
        if (!match || !/blooket/i.test(match[1])) return text;

        // "u2l4_2blooket" -> "(2)", "u1l10blooket_Review" -> "(Review)"
        const rest = match[1].replace(/blooket/i, ' ').replace(/[_\s-]+/g, ' ').trim();
        const suffix = rest ? ` (${rest})` : '';
        const oldKey = String(resourceTopicId || '').replace('-', '.');
        const label = topicLabelForOldKey(oldKey, crosswalk);
        if (label.status === 'core') return `${label.topic} Blooket${suffix}`;
        if (label.status === 'bonus') return `${BONUS_PREFIX} Blooket${suffix}`;
        return `Blooket${suffix}`;
    }

    // Quiz page heading. Core: "Unit 1, Topic 1.13: Experimental Design".
    // Bonus: "Unit 1 · ★ Beyond the Exam: ...". Anything else (PC makeup): the
    // caller's label alone — never a raw locator like "U1-PC-A".
    function topicHeading(context) {
        const newUnit = context?.newUnit;
        const newTopic = context?.newTopic;
        const newLabel = String(context?.newLabel || '');

        if (context?.bonus) {
            const bonusText = `${BONUS_PREFIX}: ${newLabel.replace(/^★?\s*Beyond the Exam\s*[:·]\s*/i, '')}`;
            return newUnit ? `Unit ${newUnit} · ${bonusText}` : bonusText;
        }

        if (newUnit && /^[1-5]\.\d+$/.test(String(newTopic || ''))) {
            return `Unit ${newUnit}, Topic ${newTopic}: ${newLabel}`;
        }

        if (/^Unit\s+\d/i.test(newLabel) || !newUnit) return newLabel;
        return `Unit ${newUnit}: ${newLabel}`;
    }

    // Groups bank items into {newUnit: {newTopic: [items]}}. Core-only: bonus
    // ("Beyond the Exam") items are left out of the topic menu — they stay
    // reachable through their old-id locator (?u=3&l=7). An id with no
    // crosswalk entry at all still fails loud.
    function groupByNewUnit(items, crosswalk) {
        applyCrosswalk(crosswalk);
        const byNewUnit = {};

        items.forEach((item) => {
            const entry = crosswalkEntryForId(item?.id, crosswalk);
            if (isBonusEntry(entry)) return;
            if (!isCoreEntry(entry)) {
                throw new Error(`No core Fall-2026 crosswalk entry for ${item?.id || 'unknown item'}`);
            }

            const unitTopics = byNewUnit[entry.newUnit] ||= {};
            const topicQuestions = unitTopics[entry.newTopic] ||= [];
            topicQuestions.push(item);
        });

        return byNewUnit;
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
        // resolve to a crosswalk entry — e.g. PC26 items served through the
        // makeup path — return null, and the caller falls back to an explicit
        // newUnit/newTopic/newLabel. Never throws.
        const entry = crosswalkEntryForId(questions[0] && questions[0].id, crosswalk);

        if (isBonusEntry(entry) && entry.bonusUnit) {
            return {
                newUnit: entry.bonusUnit,
                newTopic: null,
                newLabel: bonusLabel(entry),
                bonus: true
            };
        }

        if (!isCoreEntry(entry)) return null;
        return {
            newUnit: entry.newUnit,
            newTopic: entry.newTopic,
            newLabel: entry.newLabel,
            bonus: false
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

    // index.html starts the crosswalk fetch before this script runs; pick up
    // its unit labels as soon as it lands.
    if (global.SY2627_CROSSWALK) applyCrosswalk(global.SY2627_CROSSWALK);
    if (global.SY2627_CROSSWALK_READY && typeof global.SY2627_CROSSWALK_READY.then === 'function') {
        global.SY2627_CROSSWALK_READY.then(applyCrosswalk, () => {});
    }

    global.SY2627Overlay = Object.freeze({
        NEW_UNIT_LABELS,
        applyCrosswalk,
        compareTopicNumbers,
        contextForQuestions,
        crosswalkEntryForId,
        groupByNewUnit,
        oldTopicOf,
        oldTopicsForQuestions,
        questionLabel,
        questionsForOldLocator,
        resourceTitle,
        resourceTopicsForQuestions,
        topicHeading,
        topicLabelForId,
        topicLabelForOldKey,
        unitLabel
    });
})(typeof window !== 'undefined' ? window : globalThis);
