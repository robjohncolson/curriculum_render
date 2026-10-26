"""Reference prototype of the quiz 'explanation points to another option' detector (spec v1, final rules).

    python -I -X utf8 congruence_proto.py <ledger-quiz-rows.json> <peer-data.json> <curriculum.js>

Pure function `points_to(text, choices, picked, first_letter=None, prompt="")` -> (letter|None, why).
It never sees the answer key. Correctness is used only in main(), afterwards, to describe the corpus.
Rules folded in from the 2026-10-25 adversarial review: copula negation, generic item labels, slash /
notation / grade / abbreviation drops, change-vs-range for "X to Y", negation along lists, whole-paste
option text, first-letter discard on both signals, Spanish cues, negative-question prompts.
Added after the 2026-10-26 teacher test (spec §4 R1, R2): the whole paste also matches an option without
its leading article, and a bare-number option is named by its value ("0.19 because" names "0.190") when the
number leads, follows a pick word or a negation, or continues such a list. A pasted option the explanation
rejects ("not the law of large numbers") is no hit.
Second review round: a leading number counts only alone or before a reason ("0.19 because", never "0.19 is
P(at least 3)"), a fraction, ratio or product typed in words or with spaces is arithmetic, a negation after a list
of numbers reaches back along it, and "A is independent of itself" keeps its label A.
"""
import json
import re
import sys

NOUN_CUES = {"option", "choice", "answer", "letter", "ans", "opt",
             "opción", "opcion", "respuesta", "letra", "inciso", "alternativa"}
VERB_CUES = {"is", "its", "it's", "be", "was", "pick", "picked", "chose", "choose", "choosing",
             "select", "selected", "think", "thought", "say", "said", "with", "keep", "keeping",
             "picking", "to", "go", "went", "going", "stick", "stay", "now", "actually", "definitely",
             "probably", "likely", "maybe", "either", "guess", "guessed", "put", "putting", "pressed",
             "clicked", "click", "press", "meant", "mean", "want", "wanted", "chosen",
             "es", "sería", "seria", "era", "elegí", "elegi", "escogí", "escogi", "puse", "pongo",
             "marqué", "marque", "seleccioné", "seleccione", "creo", "pienso", "la", "opté", "opte"}
AFTER_CUES = {"because", "since", "as", "bc", "b/c", "cuz", "cause", "is", "was", "would", "will",
              "makes", "seems", "due", "which", "and", "but", "so", "for", "the", "it", "if", "when",
              "porque", "ya", "pues", "es", "era", "por", "y", "pero"}
NEG_BEFORE = {"not", "isn't", "isnt", "wasn't", "wasnt", "aren't", "can't", "cant", "cannot", "couldn't",
              "wouldn't", "shouldn't", "doesn't", "doesnt", "didn't", "didnt", "don't", "dont", "never",
              "no", "eliminate", "eliminated", "eliminating", "rule", "ruled", "out", "instead",
              "rather", "than", "except", "unless", "wrong", "incorrect", "nor", "against", "without",
              "originally", "initially", "first", "previously", "before", "earlier", "from",
              "tampoco", "nunca", "excepto", "vez", "antes", "primero", "incorrecta", "incorrecto", "mal"}
NEG_AFTER = {"wrong", "incorrect", "not", "isn't", "isnt", "can't", "cant", "cannot", "doesn't",
             "doesnt", "didn't", "didnt", "false", "impossible", "unlikely", "wouldn't", "fails",
             "ignores", "only", "never", "too", "out",
             "no", "incorrecta", "incorrecto", "mal", "tampoco", "nunca"}
# a copula or modal may sit between the letter and the negation word: "C is wrong", "D would be wrong"
COPULA = {"is", "was", "isnt", "isn't", "are", "be", "being", "would", "could", "can", "cant", "can't",
          "will", "might", "may", "does", "do", "did", "seems", "seemed", "makes", "made", "looks",
          "sounds", "also", "still", "just", "really", "probably", "definitely", "es", "era", "está"}
# "X to Y" is a change of mind only after one of these (or with an arrow); otherwise it is a range/comparison
CHANGE_VERBS = {"changed", "change", "changing", "switched", "switch", "switching", "moved", "move",
                "swapped", "swap", "went", "cambié", "cambie", "cambio"}
GRADE_OR_NAME_BEFORE = {"a", "an", "got", "get", "getting", "earned", "scored", "mr", "mrs", "ms", "dr",
                        "vitamin", "hepatitis", "grade"}
# a question that asks for the FALSE / NOT supported statement: "D is not supported" names the answer
NEGATIVE_QUESTION = re.compile(r"\b(not|false|incorrect|least|cannot|never|invalid|except)\b", re.I)
LABEL_NOUNS = r"(?:events?|groups?|teams?|treatments?|samples?|plans?|parts?|machines?|brands?|types?|classes|" \
              r"players?|lines?|routes?|regions?|airports?|stations?|cities|schools?|stores?|models?|versions?|" \
              r"methods?|grupo|grupos|evento|eventos|región|region|regiones|muestra|muestras|plan|planes|tipo|tipos|" \
              r"group|team|treatment|sample|plan|part|machine|brand|type|class|player|line|route|" \
              r"method|model|version|store|school|city|company|diet|drug|variety|bag|box|coin|die|" \
              r"histogram|graph|plot|distribution|dataset|data set|set|study|design|survey|test|" \
              r"section|strategy|scenario|table|chart|curve|point|region|interval|variable|" \
              r"population|batch|lot|location|site|branch|supplier|factory|farm|field|plant|" \
              r"fertilizer|species|breed|dog|cat|student|person|worker|employee|candidate|" \
              r"restaurant|hotel|airline|flight|train|bus|car|truck|road|highway|bridge|" \
              r"program|course|teacher|instructor|coach|doctor|hospital|clinic|lab|" \
              r"quiz|exam|form|list|column|row|bin|cell|block|unit|level|grade|tier|" \
              r"patient|subject|participant|volunteer|respondent|customer|client|user|voter|" \
              r"squad|club|league|division|conference|district|county|state|country|" \
              r"stock|fund|portfolio|account|bank|loan|card|policy|package|bundle|" \
              r"recipe|dish|meal|menu|flavor|color|colour|shade|paint|fabric|material|agency|agencies|" \
              r"simulation|simulations|strain|strains|department|departments|condition|conditions)"

WORD = re.compile(r"\S+")


def _tokens(text):
    return [(m.start(), m.end(), m.group(0)) for m in WORD.finditer(text)]


def _strip(tok):
    return re.sub(r"^[^\w']+|[^\w']+$", "", tok).lower()


def _clean_item_text(prompt, choices):
    """Prompt + choice texts with HTML tags and LaTeX delimiters removed ("\\(B\\)" -> " B ")."""
    corpus = " ".join([prompt or ""] + [str(c.get("value", "")) for c in choices])
    corpus = re.sub(r"<[^>]+>", " ", corpus)
    corpus = re.sub(r"\\[\(\)\[\]]|\$", " ", corpus)
    return re.sub(r"\s+", " ", corpus)


def label_info(prompt, choices):
    """(letters the item itself prints as labels, cleaned item text).
    Every standalone uppercase A-E the item prints is a label ("random variable B", "Agency B",
    "events A and B", "P(A)"), except an "A" that is the article (followed by a lowercase word);
    plus LaTeX subscripts (\\mu_A, \\bar{x}_B) and "<label noun> A" even when lowercase follows."""
    corpus = _clean_item_text(prompt, choices)
    found = set()
    for m in re.finditer(r"(?<![A-Za-z0-9])([A-E])(?![A-Za-z0-9])", corpus):
        letter = m.group(1)
        if letter == "A" and re.match(r"\s[a-z]", corpus[m.end():m.end() + 2]):
            continue
        found.add(letter)
    for m in re.finditer(r"_\{?([A-E])\}?", corpus):
        found.add(m.group(1))
    for m in re.finditer(r"\b" + LABEL_NOUNS + r"\s+((?:[A-E]\b(?:\s*,\s*|\s*,?\s*(?:and|or|y|o)\s+|\s+)?)+)", corpus, flags=re.I):
        for letter in re.findall(r"\b([A-E])\b", m.group(1)):
            found.add(letter.upper())
    for m in re.finditer(r"\b[A-Za-z]\(\s*([A-E])\b", corpus):
        found.add(m.group(1))
    return found, corpus


def label_letters(prompt, choices):
    return label_info(prompt, choices)[0]


# a bare number: optional sign and $, digits (thousands commas allowed), optional decimals, optional %
NUMBER = re.compile(r"[+-]?\$?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)?(?:\.[0-9]+)?%?")
NUMBER_RUN = re.compile(r"[+\-$0-9.,%]+")
LATEX_SPAN = re.compile(r"\\\(.*?\\\)|\\\[.*?\\\]")   # \( ... \) and \[ ... \]
# arithmetic: an operator, or two numbers joined as a fraction, ratio or product ("1 / 30", "(9)/(38)", "1:5",
# "9 of the 38", "1 in 5", "9 divided by 51", "(39)(87)", "1 fifth"). Never a lone "/", which "b/c" uses.
SHOWS_WORK = re.compile(r"[=+*×÷]"
                        r"|[0-9][ )%]*(?:/|:|over|out of|of|of the|in|per|times|divided by|multiplied by|x)[ (]*[$.]?[0-9]"
                        r"|[0-9] *\) *\( *[$.]?[0-9]"
                        r"|[0-9] *(?:halves|half|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?"
                        r"|tenths?|hundredths?)(?![a-z])", re.I)
# what may follow a number that leads the explanation for it to be the pick: nothing, or a reason ("0.19",
# "0.19 because"). "0.19 is P(at least 3)", "5 is the intercept", "0 books has 0.35" describe a step.
LEAD_REST = re.compile(r"[ .,!?;:)\]\"']*(?:\Z|(?:because|since|bc|b/c|cuz|cause|porque|pues)(?:\Z|[ .,!?;:)\]\"']))", re.I)
# "N percent" in the question, however it is spelled: "19 percent", "19 %", "19 per cent". The end is no ASCII
# letter or digit, so no Unicode table decides it (the browser's and Python's differ).
PERCENT_AFTER = re.compile(r" ?(?:%|percent|per cent)(?![A-Za-z0-9])", re.I)
# what may touch a number in an explanation: a space or plain punctuation. Never a letter or digit ("0l19",
# "x2"), a slash or brace (a fraction: "9/51", "\frac{9}{51}"), or any other character, so no Unicode table
# decides it (the browser's and Python's differ).
NUMBER_EDGE = re.compile(r"[\s()\[\]\"':;!?]")
BARE_LIST = re.compile(r"[\s,;&/]*(?:and|or|y|o|nor|,)?[\s,;&/]*")
# a word right before a number that makes it the student's pick, as "chose C" does a letter: "I picked 0.19",
# "its 0.19". "is" counts only after "it" or a noun cue ("the answer is 0.19"): "the probability is 0.19" is working.
NUMBER_CUES = NOUN_CUES | {"its", "it's", "pick", "picked", "picking", "chose", "choose", "choosing", "chosen", "select",
                           "selected", "think", "thought", "guess", "guessed", "put", "putting", "clicked", "click",
                           "pressed", "press", "meant", "want", "wanted", "keep", "keeping", "stick", "stay", "actually",
                           "definitely", "probably", "likely", "maybe", "elegí", "elegi", "escogí", "escogi", "puse",
                           "pongo", "marqué", "marque", "seleccioné", "seleccione", "creo", "pienso", "opté", "opte"}


def _norm(s):
    """Option or explanation text as the whole-paste rule compares it: no tags, one space, lowercase, no final dot."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(s))).strip().lower().rstrip(".")


def _without_article(v, raw):
    """v without one leading article ("the law of large numbers" -> "law of large numbers"). A capital A is a
    label, not the article, when the option names another letter too ("A and B are independent") or a copula
    follows it ("A is independent of itself")."""
    for article in ("the ", "an ", "a "):
        if not v.startswith(article):
            continue
        if article == "a " and _a_is_label(str(raw)):
            return v
        return v[len(article):]
    return v


def _a_is_label(raw):
    """True when an option's leading A names event A: another letter A-E follows, or a copula right after it."""
    if re.search(r"(?<![A-Za-z0-9])[A-E](?![A-Za-z0-9])", raw.strip()[1:]):
        return True
    words = raw.split()
    return len(words) > 1 and words[0] == "A" and _strip(words[1]) in COPULA


def _number_value(s):
    """The value of a bare number ("0.190" -> 0.19, "19%" -> 0.19, "$1,200" -> 1200.0), else None."""
    if not NUMBER.fullmatch(s) or not re.search(r"[0-9]", s):
        return None
    value = float(s.replace("$", "").replace(",", "").rstrip("%"))
    return value / 100 if s.endswith("%") else value


def _numbers_in(text, loose=False):
    """(start, end, value) of every bare number in text: a maximal run of number characters with the
    sentence punctuation after it trimmed, and a space or plain punctuation on each side (NUMBER_EDGE).
    loose (the question's own text) takes every run, so all the item prints counts as printed."""
    found = []
    for m in NUMBER_RUN.finditer(text):
        before, after = text[m.start() - 1:m.start()], text[m.end():m.end() + 1]
        if not loose and ((before and not NUMBER_EDGE.fullmatch(before)) or (after and not NUMBER_EDGE.fullmatch(after))):
            continue
        run = m.group(0).rstrip(".,")
        value = _number_value(run)
        if value is not None:
            found.append((m.start(), m.start() + len(run), value))
    return found


def _prompt_numbers(prompt):
    """Every number the question prints, plus N/100 for "N percent" ("15 percent of callers" -> 15, 0.15).
    LaTeX's escaped percent is a percent and its spacing is nothing: "\\(19\\ \\%\\)" prints 0.19. A hyphen
    after a digit is a dash, not a sign: "19-percent", "10-20"."""
    text = _clean_item_text(prompt, []).replace("\\%", "%")
    text = re.sub(r"\\[ ,;:!]", "", text)
    text = re.sub(r"([0-9])-", r"\1 ", text)
    values = set()
    for _, end, value in _numbers_in(text, loose=True):
        values.add(value)
        if PERCENT_AFTER.match(text, end):
            values.add(value / 100)
    return values


def _numeric_options(choices):
    """{value: letter} for the options whose whole text is a bare number no other option shares. Only text
    counts: a number value prints differently here and in the browser (1e-06 against 0.000001)."""
    letters = {}
    for c in choices:
        if not c.get("key") or not isinstance(c.get("value"), str):
            continue
        value = _number_value(_norm(c.get("value", "")))
        if value is not None:
            letters.setdefault(value, []).append(str(c.get("key")).upper())
    return {value: found[0] for value, found in letters.items() if len(found) == 1}


def _inside_notation(t, pos):
    """True when the letter sits inside P(...), E[...], Var(...): an identifier right before the
    unmatched opening bracket."""
    depth = 0
    for i in range(pos - 1, -1, -1):
        ch = t[i]
        if ch in ")]":
            depth += 1
        elif ch in "([":
            if depth == 0:
                return i > 0 and (t[i - 1].isalpha() or t[i - 1] in "(|")
            depth -= 1
        elif ch in ".!?":
            return False
    return False


def _paste_context(nt, form):
    """(before, after, raw before) around the first place of a pasted option in nt, the words Step 2 reads
    around a letter. A word the option only starts or ends inside ("numbers?") is not one of them."""
    at = nt.find(form)
    head, tail = nt[:at], nt[at + len(form):]
    before_raw = head.split()
    if head and head[-1] != " ":
        before_raw = before_raw[:-1]
    after = tail.split()
    if tail and tail[0] != " ":
        after = after[1:]
    before_raw = before_raw[-6:]
    return [_strip(w) for w in before_raw], [_strip(w) for w in after[:3]], before_raw


def _number_cue(before):
    """A pick word right before a number: "its 0.19", "I picked 0.19", "the answer is 0.19"."""
    if before and before[-1] in NUMBER_CUES:
        return True
    return len(before) > 1 and before[-1] in ("is", "was", "es", "era") and (before[-2] in NUMBER_CUES or before[-2] == "it")


def points_to(text, choices, picked, first_letter=None, prompt=""):
    keys = [str(c.get("key", "")).upper() for c in choices if c.get("key")]
    if not isinstance(text, str) or not text.strip() or not keys:
        return None, "empty"
    t = text.replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    t = re.sub(r"\s+", " ", t).strip()
    toks = _tokens(t)
    labels, item_text = label_info(prompt, choices)
    negative_question = bool(NEGATIVE_QUESTION.search(re.sub(r"<[^>]+>", " ", prompt or "")))

    refs = []        # (letter, position, strength, negated)
    consumed = set()  # positions claimed by the change / range patterns

    def tok_index_at(pos):
        for i, (s, e, _) in enumerate(toks):
            if s <= pos < e:
                return i
        return None

    def context(pos):
        i = tok_index_at(pos)
        if i is None:
            return [], [], None
        before = [_strip(x[2]) for x in toks[max(0, i - 6):i]]
        after = [_strip(x[2]) for x in toks[i + 1:i + 4]]
        return before, after, i

    def raw_before(i):
        return [x[2] for x in toks[max(0, i - 6):i]]

    def is_letter(tok):
        return tok.upper() in keys

    def negation(before, after, before_raw=()):
        # before: "not C", "ruled out C", "instead of C", "en vez de C"
        if any(w in NEG_BEFORE for w in before[-3:]):
            return True
        # "I don't really think it is C": a verb cue within 4 tokens, negated 1-2 tokens before the cue;
        # the scan stops at a clause break ("no es la C, es la D": the "no" belongs to C only)
        for k in range(1, min(4, len(before)) + 1):
            cue = before[-k]
            raw = before_raw[-k] if len(before_raw) >= k else cue
            if raw.endswith((",", ";", ".", ":")):
                break
            if cue in VERB_CUES:
                for w in before[-k - 2:-k]:
                    if w in NEG_BEFORE:
                        return True
        # after: "C wrong", "C is wrong", "C would be wrong" — but "c not d" keeps C (the negation is D's),
        # and in a negative question ("which is NOT supported") "D is not supported" names the answer
        if after and after[0] in NEG_AFTER and not (len(after) > 1 and is_letter(after[1])):
            return True
        if negative_question:
            return False
        if len(after) > 1 and after[0] in COPULA and after[1] in NEG_AFTER and not (len(after) > 2 and is_letter(after[2])):
            return True
        if len(after) > 2 and after[0] in COPULA and after[1] in COPULA and after[2] in NEG_AFTER:
            return True
        return False

    def add(letter, pos, strength):
        letter = letter.upper()
        if letter not in keys or pos in consumed:
            return
        before, after, i = context(pos)
        if i is None:
            return
        tok = toks[i][2]
        # numbers next to the letter: "5 C 2", "10 C 3" (combinatorics), never an option
        if (before and re.fullmatch(r"[\d.,%]+", before[-1] or "x")) or (after and re.fullmatch(r"[\d.,%]+", after[0] or "x")):
            return
        # "got a B", "an A on the test" (a grade); "Dr. B", "vitamin C" (a name)
        if before and before[-1] in GRADE_OR_NAME_BEFORE:
            return
        # "Region C", "Group B", "Airport S": a label in the student's own sentence
        if before and re.fullmatch(LABEL_NOUNS, before[-1] or "") and strength == "upper":
            return
        # the item's own "<word> X" bigram ("Agency B", "letter A", "Condition B") is a label
        if before and before[-1] and strength in ("upper", "noun") \
                and re.search(r"(?<![A-Za-z])" + re.escape(before[-1]) + r"\s+" + letter + r"(?![A-Za-z0-9])", item_text, flags=re.I):
            return
        # P(A), P(B|A), P(A and B), E[X]: notation
        if _inside_notation(t, pos):
            return
        if pos >= 1 and t[pos - 1] == "|":
            return
        if t[pos + 1:pos + 2] in ("|", "∩", "∪", "'", "^", "ᶜ", "(", "["):
            return
        # b/c, a/b, A/B testing: a letter touching a slash is an abbreviation
        if t[pos + 1:pos + 2] == "/" or t[pos - 1:pos] == "/":
            return
        # E.g., C.I., A.M.: dotted abbreviations; 20°C
        if re.match(r"^[A-Za-z]\.[A-Za-z]", tok) or t[pos - 1:pos] == "°":
            return
        # "y = a + bx, the slope is b": in an explanation that writes an equation, a lowercase letter
        # after a verb is a variable, not an option (noun cues like "option b" still count)
        if strength == "verb" and t[pos].islower() and "=" in t:
            return
        refs.append((letter, pos, strength, negation(before, after, raw_before(i))))

    # change of mind vs range / comparison -------------------------------------------------
    for m in re.finditer(r"(?<![A-Za-z0-9])\(?([A-Ea-e])\)?\s*(->|→|=>|to|into|-|–|—|through|thru)\s*\(?([A-Ea-e])\)?(?![A-Za-z0-9])", t):
        a, b = m.group(1).upper(), m.group(3).upper()
        sep = m.group(2)
        if a not in keys or b not in keys or a == b:
            continue
        lead = [_strip(x) for x in t[max(0, m.start() - 40):m.start()].split()][-3:]
        arrow = sep in ("->", "→", "=>")
        change = arrow or (sep in ("to", "into") and any(w in CHANGE_VERBS for w in lead))
        if change:
            refs.append((a, m.start(1), "change", True))
            refs.append((b, m.start(3), "change", False))
            consumed.update({m.start(1), m.start(3)})
        elif ord(a) < ord(b) and sep in ("-", "–", "—", "to", "through", "thru"):
            before, after, i3 = context(m.start(3))
            neg = negation(before, after, raw_before(i3) if i3 is not None else ())
            for code in range(ord(a), ord(b) + 1):
                refs.append((chr(code), m.start(1), "range", neg))
            consumed.update({m.start(1), m.start(3)})

    # strong cues -----------------------------------------------------------------------------
    noun_alt = "|".join(sorted((re.escape(w) for w in NOUN_CUES if w.isalpha()), key=len, reverse=True))
    for m in re.finditer(r"(?<![\w])(?:" + noun_alt + r")\s*[:#]?\s*(?:la\s+|el\s+|the\s+)?\(?([A-Ea-e])\)?(?![A-Za-z0-9/])", t, flags=re.I):
        add(m.group(1), m.start(1), "noun")
    for m in re.finditer(r"(?<![A-Za-z0-9])\(([A-Ea-e])\)", t):
        add(m.group(1), m.start(1), "paren")
    m = re.match(r"\s*\(?([A-Ea-e])[.):\-](?:\s|$)", t)
    if m:
        add(m.group(1), m.start(1), "lead")
    verb_alt = "|".join(sorted(map(re.escape, VERB_CUES - {"to", "with", "either"})))
    for m in re.finditer(r"\b(" + verb_alt + r")\s+(?:be\s+|that\s+|it'?s\s+|answer\s+|option\s+|choice\s+)?\(?([B-Eb-e])\)?(?![A-Za-z0-9/])", t, flags=re.I):
        add(m.group(2), m.start(2), "verb")

    # plain uppercase letters -----------------------------------------------------------------
    for m in re.finditer(r"(?<![A-Za-z0-9/])([A-E])(?![A-Za-z0-9/])", t):
        letter, pos = m.group(1), m.start(1)
        before, after, i = context(pos)
        if i is None:
            continue
        tok = toks[i][2]
        after_char = t[m.end(1):m.end(1) + 1]
        cue = (bool(before) and before[-1] in (NOUN_CUES | VERB_CUES)) \
            or after_char in ".,;:!?)" \
            or (bool(after) and after[0] in AFTER_CUES) \
            or tok.endswith((".", ",", ")", ":", ";", "!", "?"))
        if letter == "A" and not cue:
            continue            # the article: "A sample of 30..."
        if letter in labels and not (bool(before) and before[-1] in (NOUN_CUES | VERB_CUES)):
            continue            # a letter the item uses as a label needs an explicit cue
        add(letter, pos, "upper")

    # a bare-number option named by its value: "0.19 because" names B when B is 0.190 ----------------
    # Never inside LaTeX, never a number the item itself prints, and not at all in an explanation
    # that shows arithmetic (".55+.40 = .95 then subtract": its numbers are steps, not the answer).
    # Like a plain "A", a number needs a cue: it leads the explanation, follows a pick word or a
    # negation, or continues a bare list of them ("0.19 or 0.474"). Elsewhere it is working: "1 minus
    # 0.19", "the observed count is 58".
    numeric = _numeric_options(choices)
    number_ends = {}   # a number reference's start -> its end, for the bare-list pass below
    if numeric and not SHOWS_WORK.search(t):
        printed = _prompt_numbers(prompt)
        unlatexed = LATEX_SPAN.sub(lambda m: " " * len(m.group(0)), t)
        lead_at = re.match(r"[(\[\"']*", t).end()
        list_from = None   # the end of the last number reference
        for start, end, value in _numbers_in(unlatexed):
            if value not in numeric or value in printed:
                continue
            before, after, i = context(start)
            negated = negation(before, after, raw_before(i))
            listed = list_from is not None and BARE_LIST.fullmatch(t[list_from:start])
            leads = start == lead_at and LEAD_REST.match(t, end)
            if not (leads or _number_cue(before) or negated or listed):
                continue
            refs.append((numeric[value], start, "number", negated))
            number_ends[start] = end
            list_from = end

    # a negated letter passes its negation along a bare list: "ruled out A, B, C, D"
    refs.sort(key=lambda r: r[1])
    for k in range(1, len(refs)):
        prev, cur = refs[k - 1], refs[k]
        if prev[3] and not cur[3] and prev[1] < cur[1]:
            prev_end = number_ends[prev[1]] if prev[2] == "number" else prev[1] + 1
            if BARE_LIST.fullmatch(t[prev_end:cur[1]]):
                refs[k] = (cur[0], cur[1], cur[2], True)
    # and a negation after a bare list of numbers reaches back along it: "I think 0.19 and 0.474 are wrong"
    for k in range(len(refs) - 1, 0, -1):
        prev, cur = refs[k - 1], refs[k]
        if cur[3] and not prev[3] and prev[2] == cur[2] == "number" and BARE_LIST.fullmatch(t[number_ends[prev[1]]:cur[1]]):
            refs[k - 1] = (prev[0], prev[1], prev[2], True)

    # fold --------------------------------------------------------------------------------------
    supported = {letter for letter, _, _, negated in refs if not negated}
    note = f"refs={[(l, s, 'neg' if n else 'pos') for l, _, s, n in refs]}"
    first = str(first_letter).upper() if first_letter else None
    if first:
        supported.discard(first)        # a retry naturally names the answer it leaves

    # the whole explanation is an option's text (pasted), not a phrase inside it ----------------
    # (also without its leading article: "law of large numbers" is "The law of large numbers"), and never
    # one the words around it reject by the Step 2 rules: "not the law of large numbers", "… is wrong"
    nt = _norm(t)
    text_hits = set()
    for c in choices:
        v = _norm(c.get("value", ""))
        for form in (v, _without_article(v, c.get("value", ""))):
            if len(form) < 12 or len(form.split()) < 3 or not re.search(r"[a-z]", form) or form not in nt:
                continue
            extra_words = len(nt.split()) - len(form.split())
            if not (len(form) >= 0.7 * len(nt) or extra_words <= 3):
                continue
            if negation(*_paste_context(nt, form)):
                continue
            text_hits.add(str(c.get("key")).upper())
    if first:
        text_hits.discard(first)
    if len(text_hits) == 1:
        hit = next(iter(text_hits))
        if not supported:
            supported = {hit}
            note += f" text={hit}"
        elif supported != {hit}:
            return None, note + f" text-conflict={hit}"
    if len(supported) == 1:
        return next(iter(supported)), note
    return None, note + (" ambiguous" if len(supported) > 1 else " none")


def main():
    ledger_path, peer_path, bank_path = sys.argv[1:4]
    s = open(bank_path, encoding="utf-8").read()
    bank = json.loads(s[s.find("["):s.rfind("]") + 1])
    items = {q["id"]: q for q in bank if q.get("type") == "multiple-choice"}

    rows = json.load(open(ledger_path, encoding="utf-8"))
    first = {}
    for r in rows:
        if int(r.get("attempt") or 1) == 1:
            first[(r["student_id"], r["item_id"])] = str(r.get("response") or "").upper()

    def run(corpus, name):
        print(f"\n===== {name}: {len(corpus)} explanations")
        flagged, mention, agree, unclear = [], 0, 0, 0
        for r in corpus:
            q = items.get(r["item"])
            if not q:
                continue
            choices = (q.get("attachments") or {}).get("choices") or []
            pt, why = points_to(r["text"], choices, r["pick"], r.get("first"), q.get("prompt", ""))
            if "refs=[]" not in why:
                mention += 1
            if pt is None:
                unclear += 1
            elif pt == r["pick"]:
                agree += 1
            else:
                key = str(q.get("answerKey") or "").upper()
                flagged.append((r, pt, why, key))
        print(f"mention a letter or option: {mention}  | agree with pick: {agree} | unclear: {unclear} | FLAGGED: {len(flagged)}")
        for r, pt, why, key in flagged:
            tag = "text names the key, pick is wrong" if (pt == key and r["pick"] != key) else \
                  ("pick right, text names a wrong letter" if r["pick"] == key else "both wrong")
            print(f"- item {r['item']} attempt {r.get('attempt')} first={r.get('first')} pick={r['pick']} -> text points to {pt} [{tag}]\n    {why}")

    ledger = []
    for r in rows:
        if isinstance(r.get("reasoning"), str) and r["reasoning"].strip():
            att = int(r.get("attempt") or 1)
            ledger.append({"item": r["item_id"], "pick": str(r.get("response") or "").upper(), "text": r["reasoning"],
                           "attempt": att, "first": first.get((r["student_id"], r["item_id"])) if att == 2 else None})
    run(ledger, "roster ledger (both attempts)")

    peer = json.load(open(peer_path, encoding="utf-8")).get("data", [])
    peer_rows = [{"item": p["question_id"], "pick": str(p.get("answer_value") or "").upper(), "text": p["reasoning"], "attempt": None, "first": None}
                 for p in peer if isinstance(p.get("reasoning"), str) and p["reasoning"].strip()]
    run(peer_rows, "cr peer table (latest row per student/item)")

    print("\n===== synthetic cases")
    ch = [{"key": k, "value": v} for k, v in zip("ABCDE", ["the mean increases", "the median is resistant to outliers so it stays about the same", "both change equally", "neither changes", "cannot be determined"])]
    cases = [
        ("C because the outlier pulls everything", "D", None, "C"),
        ("I think it's C", "D", None, "C"),
        ("(c) obviously", "D", None, "C"),
        ("option c", "D", None, "C"),
        ("A sample of 30 is large enough so the mean changes", "D", None, None),
        ("chose A.", "D", None, "A"),
        ("not C, the outlier matters", "D", None, None),
        ("I was between C and D but the outlier matters", "D", None, None),
        ("I thought D at first but the median is resistant so C", "C", "D", "C"),
        ("I thought D at first but the median is resistant", "C", "D", None),
        ("D is still right because the outlier only affects the mean", "D", "D", None),
        ("changed from D to C after rereading", "C", "D", "C"),
        ("the median is resistant to outliers so it stays about the same", "D", None, "B"),
        ("5 C 2 = 10 ways", "D", None, None),
        ("Group B had the higher mean so the answer is D", "D", None, "D"),
        ("I misread it", "C", "D", None),
    ]
    ok = True
    for text, pick, first_letter, expect in cases:
        pt, why = points_to(text, ch, pick, first_letter, "Compare Group A and Group B.")
        flag = "FLAG" if (pt is not None and pt != pick) else "----"
        status = "ok" if pt == expect else "MISMATCH"
        ok &= status == "ok"
        print(f"  {status:8} {flag} pick={pick} first={first_letter} -> {pt} expected {expect}: {text!r}  {why}")
    print("synthetic all ok:", ok)


if __name__ == "__main__":
    main()
