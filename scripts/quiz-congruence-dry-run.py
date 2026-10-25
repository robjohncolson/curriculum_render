"""Reference prototype of the quiz 'explanation points to another option' detector (spec v1, final rules).

    python -I -X utf8 congruence_proto.py <ledger-quiz-rows.json> <peer-data.json> <curriculum.js>

Pure function `points_to(text, choices, picked, first_letter=None, prompt="")` -> (letter|None, why).
It never sees the answer key. Correctness is used only in main(), afterwards, to describe the corpus.
Rules folded in from the 2026-10-25 adversarial review: copula negation, generic item labels, slash /
notation / grade / abbreviation drops, change-vs-range for "X to Y", negation along lists, whole-paste
option text, first-letter discard on both signals, Spanish cues, negative-question prompts.
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

    # a negated letter passes its negation along a bare list: "ruled out A, B, C, D"
    refs.sort(key=lambda r: r[1])
    for k in range(1, len(refs)):
        prev, cur = refs[k - 1], refs[k]
        if prev[3] and not cur[3] and prev[1] < cur[1]:
            between = t[prev[1] + 1:cur[1]]
            if re.fullmatch(r"[\s,;&/]*(?:and|or|y|o|nor|,)?[\s,;&/]*", between):
                refs[k] = (cur[0], cur[1], cur[2], True)

    # fold --------------------------------------------------------------------------------------
    supported = {letter for letter, _, _, negated in refs if not negated}
    note = f"refs={[(l, s, 'neg' if n else 'pos') for l, _, s, n in refs]}"
    first = str(first_letter).upper() if first_letter else None
    if first:
        supported.discard(first)        # a retry naturally names the answer it leaves

    # the whole explanation is an option's text (pasted), not a phrase inside it ----------------
    norm = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(s))).strip().lower().rstrip(".")
    nt = norm(t)
    text_hits = set()
    for c in choices:
        v = norm(c.get("value", ""))
        if len(v) < 12 or len(v.split()) < 3 or not re.search(r"[a-z]", v) or v not in nt:
            continue
        extra_words = len(nt.split()) - len(v.split())
        if len(v) >= 0.7 * len(nt) or extra_words <= 3:
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
