#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.join(__dirname, '..');
const CURRICULUM_PATH = path.join(ROOT_DIR, 'data', 'curriculum.js');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'analysis');

const KNOWN_TYPES = [
  'histogram',
  'dotplot',
  'boxplot',
  'scatter',
  'bar',
  'pie',
  'line',
  'numberline',
  'normal',
  'chisquare'
];

const KEYWORD_PATTERNS = [
  { label: 'histogram', type: 'histogram', patterns: [/\bhistogram(s)?\b/i] },
  { label: 'dotplot', type: 'dotplot', patterns: [/\b(dot\s*plot|dotplot)s?\b/i] },
  { label: 'boxplot', type: 'boxplot', patterns: [/\bbox\s*-?\s*(and\s*-?\s*whisker|plot)\b/i, /\bboxplot(s)?\b/i] },
  { label: 'scatterplot', type: 'scatter', patterns: [/\bscatter\s*(plot|diagram)\b/i, /\bscatterplot(s)?\b/i] },
  { label: 'bar chart', type: 'bar', patterns: [/\bbar\s*(chart|graph)s?\b/i] },
  { label: 'pie chart', type: 'pie', patterns: [/\bpie\s*chart(s)?\b/i] },
  { label: 'line graph', type: 'line', patterns: [/\bline\s*(graph|plot)s?\b/i] },
  { label: 'number line', type: 'numberline', patterns: [/\bnumber\s*line(s)?\b/i] },
  { label: 'normal curve', type: 'normal', patterns: [/\bnormal\s*(distribution|curve)\b/i, /\bN\s*\(/i] },
  { label: 'chi-square', type: 'chisquare', patterns: [/\bchi[-\s]?square\b/i, /χ\^?2/i, /chi\s*\^?2/i] },
  { label: 'stem-and-leaf', type: 'other:stemleaf', patterns: [/stem-?and-?leaf/i] },
  { label: 'mosaic', type: 'other:mosaic', patterns: [/\bmosaic\b/i] },
  { label: 'violin', type: 'other:violin', patterns: [/\bviolin\b/i] },
  { label: 'treemap', type: 'other:treemap', patterns: [/\btreemap\b/i] },
  { label: 'sankey', type: 'other:sankey', patterns: [/\bsankey\b/i] },
  { label: 'heatmap', type: 'other:heatmap', patterns: [/\bheat\s*map\b/i] },
  { label: 'matrix', type: 'other:matrix', patterns: [/\bmatrix\b/i] }
];

const DIRECT_TYPE_ALIASES = [
  { type: 'histogram', aliases: ['histogram', 'histograms'] },
  { type: 'dotplot', aliases: ['dot plot', 'dotplot', 'dot plots', 'dotplots'] },
  {
    type: 'boxplot',
    aliases: ['box plot', 'boxplot', 'box plots', 'boxplots', 'box-and-whisker', 'box and whisker', 'box-and-whisker plot']
  },
  { type: 'scatter', aliases: ['scatter', 'scatterplot', 'scatter plot', 'scatter diagram'] },
  { type: 'bar', aliases: ['bar', 'bar chart', 'bar graph'] },
  { type: 'pie', aliases: ['pie', 'pie chart'] },
  { type: 'line', aliases: ['line', 'line graph', 'line plot'] },
  { type: 'numberline', aliases: ['number line', 'numberline'] },
  { type: 'normal', aliases: ['normal', 'normal curve', 'normal distribution', 'n('] },
  { type: 'chisquare', aliases: ['chi-square', 'chi square', 'chisquare', 'chi^2', 'χ^2'] },
  { type: 'other:stemleaf', aliases: ['stem-and-leaf', 'stem and leaf'] },
  { type: 'other:mosaic', aliases: ['mosaic'] },
  { type: 'other:violin', aliases: ['violin', 'violin plot'] },
  { type: 'other:treemap', aliases: ['treemap'] },
  { type: 'other:sankey', aliases: ['sankey'] },
  { type: 'other:heatmap', aliases: ['heatmap', 'heat map'] },
  { type: 'other:matrix', aliases: ['matrix'] }
];

const DIRECT_TYPE_MAP = buildDirectTypeMap();

function buildDirectTypeMap() {
  const map = new Map();
  DIRECT_TYPE_ALIASES.forEach(({ type, aliases }) => {
    aliases.forEach((alias) => {
      const normalized = alias.trim().toLowerCase();
      if (!normalized) return;
      const collapsed = normalized.replace(/\s+/g, ' ');
      map.set(collapsed, type);
      const sanitized = normalized.replace(/[^a-z0-9]+/g, '');
      if (sanitized) {
        map.set(sanitized, type);
      }
    });
  });
  return map;
}

function parseArgs(argv) {
  const options = {
    idsOnly: false,
    typeFilter: null,
    unitFilter: null
  };

  argv.forEach((arg) => {
    if (arg === '--ids-only') {
      options.idsOnly = true;
      return;
    }

    const [key, value] = arg.split('=');
    if (!value) {
      return;
    }

    if (key === '--type') {
      options.typeFilter = value.toLowerCase();
    } else if (key === '--unit') {
      options.unitFilter = value;
    }
  });

  return options;
}

function loadCurriculum(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const vmResult = tryVmEvaluateCurriculum(source, filePath);

  let root = null;
  let questions = [];

  if (vmResult.success) {
    root = vmResult.root;
    questions = vmResult.questions || [];
  } else {
    console.warn(`[Curriculum] VM evaluation failed: ${vmResult.error.message}`);
  }

  if (!root) {
    const fallback = fallbackParseCurriculum(source);
    root = fallback.root;
    questions = fallback.questions;
  }

  if (!root) {
    throw new Error('Unable to load curriculum data. No root object determined.');
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    questions = extractTopLevelQuestions(root);
  }

  console.log(`[Curriculum] Extracted ${questions.length} top-level questions`);

  return { root, questions };
}

function tryVmEvaluateCurriculum(source, filePath) {
  console.log('[Curriculum] Using VM evaluation');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: { log: () => {} },
    require: () => {
      throw new Error('require is disabled in this sandbox');
    }
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  try {
    const suffix =
      `\nif (typeof EMBEDDED_CURRICULUM !== 'undefined') { globalThis.__CURRICULUM__ = EMBEDDED_CURRICULUM; }` +
      `\nif (typeof module !== 'undefined' && module.exports) { globalThis.__CURRICULUM__ = globalThis.__CURRICULUM__ || module.exports; }`;
    vm.runInNewContext(`${source}\n${suffix}`, sandbox, {
      filename: path.basename(filePath)
    });
  } catch (error) {
    return { success: false, error };
  }

  const root = sandbox.__CURRICULUM__ || sandbox.EMBEDDED_CURRICULUM || sandbox.module.exports || sandbox.exports || null;
  const questions = extractTopLevelQuestions(root);

  return { success: true, root, questions };
}

function fallbackParseCurriculum(source) {
  console.warn('[Curriculum] Using fallback parser');
  try {
    const questions = parseQuestionsArrayFromSource(source);
    return { root: { questions }, questions };
  } catch (error) {
    throw new Error(`Fallback parser failed: ${error.message}`);
  }
}

function extractTopLevelQuestions(root) {
  if (!root) return [];
  if (Array.isArray(root)) {
    return root;
  }
  if (typeof root !== 'object') {
    return [];
  }
  if (Array.isArray(root.questions)) {
    return root.questions;
  }
  if (root.EMBEDDED_CURRICULUM && Array.isArray(root.EMBEDDED_CURRICULUM.questions)) {
    return root.EMBEDDED_CURRICULUM.questions;
  }
  if (Array.isArray(root.curriculum)) {
    return root.curriculum;
  }
  return [];
}

function parseQuestionsArrayFromSource(source) {
  const block = extractArrayLiteralBlock(source, 'questions');
  const sandbox = { result: null };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(`result = (${block});`, sandbox, {});
  } catch (error) {
    throw new Error(`Failed to evaluate questions array: ${error.message}`);
  }
  if (!Array.isArray(sandbox.result)) {
    throw new Error('Extracted value is not an array.');
  }
  return sandbox.result;
}

function extractArrayLiteralBlock(source, key) {
  const keyRegex = new RegExp(`${key}\\s*[:=]\\s*\\[`);
  const match = keyRegex.exec(source);
  if (!match) {
    throw new Error(`Unable to locate ${key} array in source.`);
  }
  let index = source.indexOf('[', match.index);
  if (index === -1) {
    throw new Error(`Unable to locate opening bracket for ${key} array.`);
  }

  let depth = 0;
  let i = index;
  let inString = false;
  let stringChar = '';
  while (i < source.length) {
    const char = source[i];
    const nextChar = source[i + 1];
    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      i += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      i += 1;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(index, i + 1);
      }
    }
    i += 1;
  }

  throw new Error(`Unable to find closing bracket for ${key} array.`);
}

function isFrq(question) {
  if (!question || typeof question !== 'object') return false;
  if (typeof question.type === 'string' && question.type.toLowerCase() === 'free-response') return true;
  if (typeof question.id === 'string' && /frq/i.test(question.id)) return true;
  return false;
}

function isQuestionLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const QUESTION_KEYS = [
    'prompt',
    'question',
    'stem',
    'body',
    'type',
    'id',
    'parts',
    'answers',
    'solution',
    'solutions',
    'responses'
  ];
  return QUESTION_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function collectFrqsFromRoot(root) {
  const frqs = [];
  const stats = {
    totalQuestionNodes: 0,
    totalFrqs: 0,
    perUnit: new Map(),
    perUnitLesson: new Map()
  };

  const visitedObjects = new WeakSet();
  const seenFrqs = new WeakSet();

  function recordFrq(frq) {
    if (seenFrqs.has(frq)) {
      return;
    }
    seenFrqs.add(frq);
    frqs.push(frq);
    stats.totalFrqs += 1;

    const directUnit = frq.unit != null && frq.unit !== '' ? String(frq.unit) : '';
    const directLesson = frq.lesson != null && frq.lesson !== '' ? String(frq.lesson) : '';
    const { unit: parsedUnit, lesson: parsedLesson } = parseIdParts(frq.id || '');
    const unit = directUnit || parsedUnit || 'unknown';
    const lesson = directLesson || parsedLesson || '';

    if (!stats.perUnit.has(unit)) {
      stats.perUnit.set(unit, { count: 0, lessons: new Map() });
    }
    const unitEntry = stats.perUnit.get(unit);
    unitEntry.count += 1;
    if (lesson) {
      if (!unitEntry.lessons.has(lesson)) {
        unitEntry.lessons.set(lesson, 0);
      }
      unitEntry.lessons.set(lesson, unitEntry.lessons.get(lesson) + 1);
    }

    const unitLessonKey = `${unit}::${lesson || 'all'}`;
    if (!stats.perUnitLesson.has(unitLessonKey)) {
      stats.perUnitLesson.set(unitLessonKey, 0);
    }
    stats.perUnitLesson.set(unitLessonKey, stats.perUnitLesson.get(unitLessonKey) + 1);
  }

  function traverse(node) {
    if (node == null) return;
    if (typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    if (visitedObjects.has(node)) {
      return;
    }
    visitedObjects.add(node);

    if (isQuestionLike(node)) {
      stats.totalQuestionNodes += 1;
    }

    if (isFrq(node)) {
      recordFrq(node);
    }

    for (const value of Object.values(node)) {
      traverse(value);
    }
  }

  try {
    traverse(root);
  } catch (error) {
    console.warn(`[Coverage] Traversal warning: ${error.message}`);
  }

  const unitKeys = Array.from(stats.perUnit.keys());
  const knownUnitKeys = unitKeys.filter((key) => key !== 'unknown');
  stats.unitCount = knownUnitKeys.length > 0 ? knownUnitKeys.length : unitKeys.length;

  return { frqs, stats };
}

const TEXT_KEY_REGEX = /(prompt|solution|instruction|text|reason|explanation|stem|question|body|scenario|context|rubric|step|part|response|answer)/i;

function collectRelevantStrings(value, pathKeys = [], strings = []) {
  if (value == null) {
    return strings;
  }

  if (typeof value === 'string') {
    const lastKey = pathKeys[pathKeys.length - 1];
    if (!lastKey || TEXT_KEY_REGEX.test(lastKey) || pathKeys.some((k) => TEXT_KEY_REGEX.test(k))) {
      strings.push(value);
    }
    return strings;
  }

  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectRelevantStrings(item, pathKeys.concat(String(idx)), strings));
    return strings;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, val]) => collectRelevantStrings(val, pathKeys.concat(key), strings));
  }
  return strings;
}

function cleanText(str) {
  if (!str) return '';
  let text = str;
  text = text.replace(/\\chi/g, 'chi');
  text = text.replace(/χ/g, 'chi');
  text = text.replace(/\$[^$]*\$/g, ' ');
  text = text.replace(/\\\([^)]*\\\)/g, ' ');
  text = text.replace(/\\\[[^\]]*\\\]/g, ' ');
  text = text.replace(/\\[a-zA-Z]+/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

function cloneRegex(regex, extraFlags = '') {
  const flags = Array.from(new Set((regex.flags + extraFlags).split('')))
    .filter(Boolean)
    .join('')
    .replace(/g/g, '');
  return new RegExp(regex.source, flags);
}

function findAllMatches(regex, text) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const searchRegex = new RegExp(regex.source, flags);
  const matches = [];
  let match;
  while ((match = searchRegex.exec(text)) !== null) {
    matches.push({ index: match.index, match });
    if (match.index === searchRegex.lastIndex) {
      searchRegex.lastIndex += 1;
    }
  }
  return matches;
}

function windowContains(text, start, end, regexes) {
  const slice = text.slice(Math.max(0, start), Math.min(text.length, end));
  return regexes.some((regex) => cloneRegex(regex).test(slice));
}

function detectNearby(text, anchorRegexes, targetRegexes, windowBefore = 80, windowAfter = 160) {
  for (const anchorRegex of anchorRegexes) {
    const anchorMatches = findAllMatches(anchorRegex, text);
    for (const match of anchorMatches) {
      const start = match.index - windowBefore;
      const end = match.index + windowAfter;
      if (windowContains(text, start, end, targetRegexes)) {
        return true;
      }
    }
  }
  return false;
}

const REGRESSION_KEYWORDS = [
  /regression line/i,
  /least\s*squares/i,
  /best[-\s]*fit/i,
  /trend\s*line/i,
  /ŷ/,
  /y-?hat/i,
  /equation of (the )?line/i,
  /slope-?intercept/i
];

const RESIDUAL_PLOT_REGEX = /residual\s*plot/i;
const NORMAL_REGEX = /normal/i;
const MEAN_REGEX = /mean/i;
const SD_REGEXES = [/\bsd\b/i, /standard\s*deviation/i];
const BOXPLOT_REGEXES = [/box\s*-?\s*plot/i, /boxplot/i, /box[-\s]*and[-\s]*whisker/i];
const FIVE_NUMBER_REGEXES = [/five[-\s]*number\s*summary/i, /\bq1\b/i, /\bq3\b/i, /\biqr\b/i];
const HISTOGRAM_REGEXES = [/histogram/i];
const FREQ_TABLE_REGEXES = [/frequency\s*table/i];

const SUBFLAG_TYPE_MAP = {
  scatterNeedsRegression: ['scatter'],
  residualPlot: ['scatter'],
  normalParams: ['normal'],
  boxplotFiveNumber: ['boxplot'],
  histogramFromTable: ['histogram']
};

function detectSubFlagsFromText(text) {
  const lowerText = text.toLowerCase();
  const scatterNeedsRegression = REGRESSION_KEYWORDS.some((regex) => cloneRegex(regex, 'i').test(text));
  const residualPlot = cloneRegex(RESIDUAL_PLOT_REGEX, 'i').test(text);

  let normalParams = false;
  const normalMatches = findAllMatches(NORMAL_REGEX, lowerText);
  if (normalMatches.length > 0) {
    const meanMatches = findAllMatches(MEAN_REGEX, lowerText);
    const sdMatches = SD_REGEXES.flatMap((regex) => findAllMatches(regex, lowerText));
    for (const normalMatch of normalMatches) {
      const windowStart = normalMatch.index - 100;
      const windowEnd = normalMatch.index + 140;
      const hasMean = meanMatches.some((m) => m.index >= windowStart && m.index <= windowEnd);
      const hasSd = sdMatches.some((m) => m.index >= windowStart && m.index <= windowEnd);
      if (hasMean && hasSd) {
        normalParams = true;
        break;
      }
    }
  }

  const boxplotFiveNumber = detectNearby(lowerText, BOXPLOT_REGEXES, FIVE_NUMBER_REGEXES, 100, 140);
  const histogramFromTable = detectNearby(lowerText, HISTOGRAM_REGEXES, FREQ_TABLE_REGEXES, 80, 140);

  return {
    scatterNeedsRegression,
    residualPlot,
    normalParams,
    boxplotFiveNumber,
    histogramFromTable
  };
}

function deriveSubFlagsByType(types, subFlags) {
  const result = {};
  const typeList = Array.isArray(types) ? types : [];
  const typeSet = new Set(typeList);

  const relevantTypes = typeList.length > 0 ? typeList : Object.values(SUBFLAG_TYPE_MAP).flat();
  relevantTypes.forEach((type) => {
    const flagsForType = {};
    let hasFlag = false;
    for (const [flag, relatedTypes] of Object.entries(SUBFLAG_TYPE_MAP)) {
      if (subFlags[flag] && (!relatedTypes || relatedTypes.includes(type))) {
        flagsForType[flag] = true;
        hasFlag = true;
      }
    }
    if (hasFlag || typeSet.has(type)) {
      result[type] = flagsForType;
    }
  });
  return result;
}

function detectTypesFromText(text, origin) {
  const cleaned = cleanText(text);
  const matches = [];
  const seen = new Set();
  for (const pattern of KEYWORD_PATTERNS) {
    if (pattern.patterns.some((regex) => regex.test(cleaned))) {
      if (!seen.has(pattern.type)) {
        seen.add(pattern.type);
        matches.push({ type: pattern.type, origin, label: pattern.label });
      }
    }
  }
  return matches;
}

function extractCandidateTokens(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,\/;]|\band\b|\bor\b/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalizeDirectToken(token) {
  if (!token) return null;
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  const collapsed = normalized.replace(/\s+/g, ' ');
  if (DIRECT_TYPE_MAP.has(collapsed)) {
    return DIRECT_TYPE_MAP.get(collapsed);
  }
  const sanitized = normalized.replace(/[^a-z0-9]+/g, '');
  if (DIRECT_TYPE_MAP.has(sanitized)) {
    return DIRECT_TYPE_MAP.get(sanitized);
  }
  return null;
}

function resolveTypesFromRawString(raw, origin) {
  if (typeof raw !== 'string') return [];
  const matches = [];
  const seenTypes = new Set();

  const candidates = extractCandidateTokens(raw);
  if (candidates.length === 0) {
    candidates.push(raw);
  }

  candidates.forEach((candidate) => {
    const canonical = canonicalizeDirectToken(candidate);
    if (canonical && !seenTypes.has(canonical)) {
      seenTypes.add(canonical);
      matches.push({ type: canonical, origin, label: canonical });
    }
  });

  const keywordMatches = detectTypesFromText(raw, origin);
  keywordMatches.forEach((match) => {
    if (!seenTypes.has(match.type)) {
      seenTypes.add(match.type);
      matches.push(match);
    }
  });

  return matches;
}

function sanitizeOtherToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  const token = cleaned.replace(/[^a-z0-9]+/g, '');
  if (!token) return null;
  return `other:${token}`;
}

function parseIdParts(id) {
  if (typeof id !== 'string') return { unit: '', lesson: '' };
  const unitMatch = id.match(/U(\d+)/i);
  const lessonMatch = id.match(/-L(\d+)/i);
  const result = {
    unit: unitMatch ? unitMatch[1] : '',
    lesson: lessonMatch ? lessonMatch[1] : ''
  };
  if (!result.lesson && /-PC/i.test(id)) {
    result.lesson = 'PC';
  }
  return result;
}

function snippetFromText(text, length = 120) {
  if (!text) return '';
  const cleaned = cleanText(text).replace(/\s+/g, ' ');
  if (cleaned.length <= length) return cleaned;
  return `${cleaned.slice(0, length - 1)}…`;
}

function analyzeFrq(frq) {
  const detections = [];
  let requiresChart = false;
  const flagTypeSet = new Set();
  const flagTypes = [];
  const keywordTypeSet = new Set();
  const keywordTypes = [];

  function addType(targetSet, targetList, type) {
    if (!type) return;
    if (!targetSet.has(type)) {
      targetSet.add(type);
      targetList.push(type);
    }
  }

  function handleMatches(matches, targetSet, targetList) {
    for (const match of matches) {
      addType(targetSet, targetList, match.type);
      detections.push(`${match.origin}:${match.label}`);
    }
  }

  function traverseForFlags(value) {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(traverseForFlags);
      return;
    }
    if (typeof value !== 'object') return;

    for (const [key, val] of Object.entries(value)) {
      if (key === 'requiresGraph') {
        if (val) {
          requiresChart = true;
          if (typeof val === 'string') {
            const matches = resolveTypesFromRawString(val, 'flag:requiresGraph');
            if (matches.length > 0) {
              handleMatches(matches, flagTypeSet, flagTypes);
            } else {
              const fallback = sanitizeOtherToken(val);
              if (fallback) {
                addType(flagTypeSet, flagTypes, fallback);
                detections.push('flag:requiresGraph:' + fallback);
              } else {
                detections.push('flag:requiresGraph');
              }
            }
          } else {
            detections.push('flag:requiresGraph');
          }
        }
      } else if (key === 'chartType') {
        if (val != null) {
          requiresChart = true;
          const values = Array.isArray(val) ? val : [val];
          values.forEach((entry) => {
            if (typeof entry === 'string') {
              const matches = resolveTypesFromRawString(entry, 'flag:chartType');
              if (matches.length > 0) {
                handleMatches(matches, flagTypeSet, flagTypes);
              } else {
                const fallback = sanitizeOtherToken(entry);
                if (fallback) {
                  addType(flagTypeSet, flagTypes, fallback);
                  detections.push('flag:chartType:' + fallback);
                }
              }
            }
          });
        }
      }

      if (val && typeof val === 'object') {
        traverseForFlags(val);
      } else if (Array.isArray(val)) {
        traverseForFlags(val);
      }
    }
  }

  traverseForFlags(frq);

  const textChunks = collectRelevantStrings({
    prompt: frq.prompt,
    solution: frq.solution,
    instructions: frq.instructions,
    reasoning: frq.reasoning,
    explanation: frq.explanation
  });

  if (Array.isArray(frq.parts)) {
    collectRelevantStrings(frq.parts, ['parts'], textChunks);
  }
  if (frq.context) {
    collectRelevantStrings(frq.context, ['context'], textChunks);
  }

  const uniqueChunks = Array.from(new Set(textChunks.filter(Boolean)));

  for (const chunk of uniqueChunks) {
    const matches = detectTypesFromText(chunk, 'keyword');
    handleMatches(matches, keywordTypeSet, keywordTypes);
  }

  if (keywordTypes.length > 0) {
    requiresChart = true;
  }

  let finalTypes = [];
  if (flagTypes.length > 0) {
    finalTypes = flagTypes.slice();
  } else if (keywordTypes.length > 0) {
    finalTypes = keywordTypes.slice();
  } else if (requiresChart) {
    const fallback = 'other:unspecified';
    finalTypes = [fallback];
    detections.push('fallback:' + fallback);
  }

  const dedupDetections = Array.from(new Set(detections));

  let chartType = null;
  let typeList = [];
  if (finalTypes.length === 0) {
    chartType = 'words-only';
    requiresChart = false;
  } else if (finalTypes.length === 1) {
    chartType = finalTypes[0];
    typeList = [chartType];
  } else {
    chartType = 'multi';
    typeList = finalTypes;
  }

  const promptText = typeof frq.prompt === 'string' ? frq.prompt : uniqueChunks[0] || '';
  const promptSnippet = snippetFromText(promptText, 120);
  const fullPrompt = typeof frq.prompt === 'string' ? frq.prompt : uniqueChunks.join('\n\n');
  const combinedText = uniqueChunks.join('\n\n');
  const { unit, lesson } = parseIdParts(frq.id || '');

  const isWordsOnly = chartType === 'words-only';

  const subFlags = detectSubFlagsFromText(combinedText);
  const subFlagTypes = chartType === 'multi' ? typeList : chartType === 'words-only' ? [] : [chartType];
  const subFlagsByType = deriveSubFlagsByType(subFlagTypes, subFlags);

  return {
    id: frq.id || '',
    unit,
    lesson,
    originalType: frq.type || '',
    requiresChart: !isWordsOnly,
    chartType,
    types: chartType === 'multi' ? typeList : [],
    detectionSources: dedupDetections,
    promptSnippet,
    fullPrompt,
    subFlags,
    subFlagsByType,
    unknownReason: isWordsOnly ? 'noKeywordsNoFlags' : null
  };
}

function buildSummary(records) {
  const summary = {
    totalFrqs: records.length,
    wordsOnly: 0,
    chartFrqs: 0,
    byType: {},
    unknowns: []
  };

  for (const type of KNOWN_TYPES) {
    summary.byType[type] = { count: 0, ids: [] };
  }
  summary.byType.multi = { count: 0, items: [] };
  const otherMap = new Map();

  records.forEach((record) => {
    if (!record.requiresChart) {
      summary.wordsOnly += 1;
      summary.unknowns.push({ id: record.id, reason: record.unknownReason || 'noKeywordsNoFlags' });
      return;
    }

    summary.chartFrqs += 1;

    if (record.chartType === 'multi') {
      summary.byType.multi.count += 1;
      summary.byType.multi.items.push({ id: record.id, types: record.types.slice() });
      return;
    }

    const chartType = record.chartType;
    if (KNOWN_TYPES.includes(chartType)) {
      summary.byType[chartType].count += 1;
      summary.byType[chartType].ids.push(record.id);
    } else if (chartType.startsWith('other:')) {
      const token = chartType.slice('other:'.length);
      if (!otherMap.has(token)) {
        otherMap.set(token, { token, count: 0, ids: [] });
      }
      const entry = otherMap.get(token);
      entry.count += 1;
      entry.ids.push(record.id);
    }
  });

  summary.byType.other = Array.from(otherMap.values()).sort((a, b) => a.token.localeCompare(b.token));
  for (const type of KNOWN_TYPES) {
    summary.byType[type].ids.sort();
  }
  summary.byType.multi.items.sort((a, b) => a.id.localeCompare(b.id));
  summary.unknowns.sort((a, b) => a.id.localeCompare(b.id));
  return summary;
}

function writeJson(summary, records, filePath) {
  const jsonData = {
    totalFrqs: summary.totalFrqs,
    wordsOnly: summary.wordsOnly,
    chartFrqs: summary.chartFrqs,
    byType: {
      histogram: summary.byType.histogram,
      dotplot: summary.byType.dotplot,
      boxplot: summary.byType.boxplot,
      scatter: summary.byType.scatter,
      bar: summary.byType.bar,
      pie: summary.byType.pie,
      line: summary.byType.line,
      numberline: summary.byType.numberline,
      normal: summary.byType.normal,
      chisquare: summary.byType.chisquare,
      multi: summary.byType.multi,
      other: summary.byType.other
    },
    unknowns: summary.unknowns,
    items: records.map((record) => ({
      id: record.id,
      unit: record.unit,
      lesson: record.lesson,
      originalType: record.originalType,
      requiresChart: record.requiresChart,
      chartType: record.chartType,
      types: record.chartType === 'multi' ? record.types : [],
      detectionSources: record.detectionSources,
      promptSnippet: record.promptSnippet,
      fullPrompt: record.fullPrompt,
      subFlags: record.subFlags,
      subFlagsByType: record.subFlagsByType,
      unknownReason: record.unknownReason
    }))
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
}

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCsv(records, filePath) {
  const headers = [
    'id',
    'unit',
    'lesson',
    'type',
    'requiresChart',
    'chartType',
    'types',
    'detection',
    'subFlags',
    'subFlagsByType',
    'promptSnippet',
    'fullPrompt'
  ];
  const lines = [headers.join(',')];
  records.forEach((record) => {
    const typesField = record.chartType === 'multi' ? record.types.join(';') : '';
    const detectionField = record.detectionSources.join(';');
    const subFlagsField = Object.entries(record.subFlags || {})
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .join(';');
    const subFlagsByTypeField = Object.entries(record.subFlagsByType || {})
      .map(([type, flags]) => {
        const keys = Object.keys(flags || {});
        if (keys.length === 0) {
          return `${type}:`;
        }
        return `${type}:${keys.join('|')}`;
      })
      .join(';');
    const row = [
      csvEscape(record.id),
      csvEscape(record.unit),
      csvEscape(record.lesson),
      csvEscape(record.originalType),
      csvEscape(record.requiresChart),
      csvEscape(record.chartType),
      csvEscape(typesField),
      csvEscape(detectionField),
      csvEscape(subFlagsField),
      csvEscape(subFlagsByTypeField),
      csvEscape(record.promptSnippet),
      csvEscape(record.fullPrompt)
    ];
    lines.push(row.join(','));
  });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function buildTypeOrder(typesIterable) {
  const typeSet = new Set(typesIterable);
  const ordered = [];
  KNOWN_TYPES.forEach((type) => {
    if (typeSet.has(type)) {
      ordered.push(type);
      typeSet.delete(type);
    }
  });
  if (typeSet.has('multi')) {
    ordered.push('multi');
    typeSet.delete('multi');
  }
  const remaining = Array.from(typeSet).sort((a, b) => a.localeCompare(b));
  return ordered.concat(remaining);
}

function writeFullPromptsFile(records, filePath) {
  const groups = new Map();
  records
    .filter((record) => record.requiresChart)
    .forEach((record) => {
      const key = record.chartType;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record);
    });

  const orderedTypes = buildTypeOrder(groups.keys());
  const lines = [];
  orderedTypes.forEach((type) => {
    const items = groups.get(type).slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    lines.push(`=== ${type} (${items.length}) ===`);
    items.forEach((record) => {
      lines.push(record.id || '(no-id)');
      lines.push(record.fullPrompt || '');
      lines.push('');
    });
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function writeIdsByTypeFile(records, filePath) {
  const groups = new Map();
  records
    .filter((record) => record.requiresChart)
    .forEach((record) => {
      const key = record.chartType;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record.id || '(no-id)');
    });

  const orderedTypes = buildTypeOrder(groups.keys());
  const lines = [];
  orderedTypes.forEach((type) => {
    const ids = groups.get(type).slice().sort((a, b) => a.localeCompare(b));
    lines.push(`=== ${type} ===`);
    ids.forEach((id) => lines.push(id));
    lines.push('');
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function printSummary(summary, records) {
  console.log(`Total FRQs: ${summary.totalFrqs}`);
  console.log(`Words-only: ${summary.wordsOnly}`);
  console.log(`Chart FRQs: ${summary.chartFrqs}`);
  console.log('Counts by chart type:');
  for (const type of KNOWN_TYPES) {
    const entry = summary.byType[type];
    console.log(`  ${type}: ${entry.count}`);
  }
  console.log(`  multi: ${summary.byType.multi.count}`);
  if (summary.byType.other.length > 0) {
    summary.byType.other.forEach((entry) => {
      console.log(`  other:${entry.token}: ${entry.count}`);
    });
  }
  const unknowns = summary.unknowns.slice(0, 10);
  if (unknowns.length > 0) {
    console.log('Top unknown/words-only FRQs:');
    const recordMap = new Map(records.map((r) => [r.id, r]));
    unknowns.forEach((item) => {
      const record = recordMap.get(item.id);
      const snippet = record ? record.promptSnippet : '';
      console.log(`  ${item.id}: ${snippet}`);
    });
  }
}

function sortUnitKeys(a, b) {
  if (a === 'unknown') return 1;
  if (b === 'unknown') return -1;
  const numA = Number(a);
  const numB = Number(b);
  const isNumA = !Number.isNaN(numA);
  const isNumB = !Number.isNaN(numB);
  if (isNumA && isNumB) {
    return numA - numB;
  }
  if (isNumA) return -1;
  if (isNumB) return 1;
  return String(a).localeCompare(String(b));
}

function printCoverageSummary(stats) {
  console.log(
    `[Coverage] Scanned ${stats.totalQuestionNodes} question nodes; Found ${stats.totalFrqs} FRQs across ${stats.unitCount || 0} units.`
  );
  if (stats.perUnit.size === 0) {
    return;
  }
  console.log('[Coverage] FRQs per unit:');
  const unitEntries = Array.from(stats.perUnit.entries()).sort(([a], [b]) => sortUnitKeys(a, b));
  unitEntries.forEach(([unit, data]) => {
    const lessonEntries = Array.from(data.lessons.entries())
      .sort(([a], [b]) => sortUnitKeys(a, b))
      .map(([lesson, count]) => `L${lesson}:${count}`);
    if (lessonEntries.length > 0) {
      console.log(`  Unit ${unit}: ${data.count} (lessons ${lessonEntries.join(', ')})`);
    } else {
      console.log(`  Unit ${unit}: ${data.count}`);
    }
  });
}

function filterRecordsForOutput(records, options) {
  return records.filter((record) => {
    if (!record.requiresChart) {
      return false;
    }

    if (options.typeFilter) {
      const filter = options.typeFilter.toLowerCase();
      const chartType = (record.chartType || '').toLowerCase();
      const matchesChart = chartType === filter;
      const matchesMulti = chartType === 'multi' && record.types.some((type) => type.toLowerCase() === filter);
      if (!matchesChart && !matchesMulti) {
        return false;
      }
    }

    if (options.unitFilter) {
      const unit = record.unit != null ? String(record.unit) : '';
      if (unit !== String(options.unitFilter)) {
        return false;
      }
    }

    return true;
  });
}

function printFrqDetails(records, options) {
  const filtered = filterRecordsForOutput(records, options);
  if (filtered.length === 0) {
    console.log('[Details] No FRQs matched the provided filters.');
    return;
  }

  const groups = new Map();
  filtered.forEach((record) => {
    const key = record.chartType;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  });

  const orderedTypes = buildTypeOrder(groups.keys());
  orderedTypes.forEach((type) => {
    const items = groups.get(type).slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    console.log(`=== ${type} (${items.length}) ===`);
    items.forEach((record) => {
      if (options.idsOnly) {
        console.log(`${record.id || '(no-id)'} ${record.chartType}`);
        return;
      }

      console.log(`ID: ${record.id || '(no-id)'}`);
      console.log(`  chartType: ${record.chartType}`);
      if (record.chartType === 'multi' && Array.isArray(record.types) && record.types.length > 0) {
        console.log(`  types: ${record.types.join(', ')}`);
      }
      const activeFlags = Object.entries(record.subFlags || {})
        .filter(([, value]) => Boolean(value))
        .map(([key]) => `${key}=true`);
      if (activeFlags.length > 0) {
        console.log(`  subFlags: ${activeFlags.join(', ')}`);
      }

      const perTypeFlags = Object.entries(record.subFlagsByType || {})
        .map(([typeKey, flags]) => {
          const keys = Object.keys(flags || {});
          if (keys.length === 0) {
            return `${typeKey}:none`;
          }
          return `${typeKey}:${keys.join('|')}`;
        })
        .filter(Boolean);
      if (perTypeFlags.length > 0) {
        console.log(`  subFlagsByType: ${perTypeFlags.join('; ')}`);
      }

      console.log('  prompt:');
      const promptLines = (record.fullPrompt || '').split(/\r?\n/);
      promptLines.forEach((line) => {
        console.log(`    ${line}`);
      });
      console.log('');
    });
  });
}

function main() {
  const cliOptions = parseArgs(process.argv.slice(2));
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const { root } = loadCurriculum(CURRICULUM_PATH);
    const { frqs, stats } = collectFrqsFromRoot(root);
    const records = frqs.map(analyzeFrq);
    const summary = buildSummary(records);
    writeJson(summary, records, path.join(OUTPUT_DIR, 'frq_chart_inventory.json'));
    writeCsv(records, path.join(OUTPUT_DIR, 'frq_chart_inventory.csv'));
    writeFullPromptsFile(records, path.join(OUTPUT_DIR, 'frq_chart_full_prompts.txt'));
    writeIdsByTypeFile(records, path.join(OUTPUT_DIR, 'frq_ids_by_type.txt'));
    printCoverageSummary(stats);
    printSummary(summary, records);
    printFrqDetails(records, cliOptions);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
