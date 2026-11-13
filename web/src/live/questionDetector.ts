/** Finds interview questions in noisy OCR text or speech transcripts, and remembers what was already handled. */

const FILLER = "(?:(?:so|okay|ok|alright|all right|right|well|and|now|great|good|thanks|thank you|next|then|um|uh|yeah|please)[,.]?\\s+)*";
const QUESTION_WORDS =
  "what|what's|why|how|how's|when|where|which|who|whom|whose|can you|could you|would you|will you|do you|did you|does|have you|has|are you|were you|is there|is it|is this|should|tell me|describe|explain|walk me through|talk me through|talk about|give me|give an example|define|discuss|outline|differentiate|compare|contrast|let's|how would|what would";
const TASK_WORDS = "write|implement|design|create|build|given|find|solve|reverse|sort|count|return|convert|suppose|imagine|list|name|calculate|determine|refactor|debug|fix";

const QUESTION_START = new RegExp(`^${FILLER}(?:${QUESTION_WORDS})\\b`, "i");
const TASK_START = new RegExp(`^${FILLER}(?:${TASK_WORDS})\\b`, "i");

export interface Candidate { text: string; score: number; task: boolean; index: number }

export function normalize(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const tokenSet = (t: string) => new Set(normalize(t).split(" ").filter(Boolean));

function trigrams(t: string): Map<string, number> {
  const s = ` ${normalize(t)} `;
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 2; i++) { const g = s.slice(i, i + 3); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}

/** True when two strings are the same question modulo OCR noise, punctuation or truncation. */
export function similar(a: string, b: string): boolean {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const A = tokenSet(a), B = tokenSet(b);
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  const union = A.size + B.size - common;
  if (union > 0 && common / union >= 0.7) return true;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size >= 4) {
    let inside = 0;
    small.forEach((w) => { if (large.has(w)) inside++; });
    if (inside / small.size >= 0.9) return true; // partially visible / truncated copy of the same question
  }
  const ga = trigrams(a), gb = trigrams(b);
  let inter = 0, total = 0;
  ga.forEach((n, g) => { inter += Math.min(n, gb.get(g) ?? 0); total += n; });
  gb.forEach((n) => { total += n; });
  return total > 0 && (2 * inter) / total >= 0.85;
}

function cleanSentence(s: string): string {
  return s.replace(/^[\s\-•*·>]+/, "").replace(/^\d{1,2}[.)]\s+/, "").replace(/\s+/g, " ").trim();
}

function splitSentences(raw: string): string[] {
  const out: string[] = [];
  for (const block of raw.replace(/\r/g, "").split(/\n{2,}/)) {
    // OCR wraps long sentences across lines. Only re-join when the previous line looks like a full-width,
    // unfinished line; short lines are UI labels / menu items and must stay separate.
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const maxLen = Math.max(0, ...lines.map((l) => l.length));
    let joined = "";
    let prev = "";
    for (const l of lines) {
      const wrapped = prev.length >= 30 && prev.length >= maxLen * 0.6 && !/[.?!:]$/.test(prev);
      joined += joined ? (wrapped ? " " : "\n") + l : l;
      prev = l;
    }
    for (const part of joined.split("\n")) {
      for (const s of part.split(/(?<=[.?!])\s+(?=[A-Z0-9"'(])/)) {
        const c = cleanSentence(s);
        if (c) out.push(c);
      }
    }
  }
  return out;
}

function letterRatio(s: string): number {
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  return s.length ? letters / s.length : 0;
}

export function findCandidates(raw: string): Candidate[] {
  const result: Candidate[] = [];
  splitSentences(raw).forEach((s, index) => {
    const words = s.split(/\s+/).length;
    if (s.length < 12 || words < 3 || words > 90 || letterRatio(s) < 0.6) return;
    let score = 0;
    const endsQ = /\?["')\]]*$/.test(s);
    const q = QUESTION_START.test(s);
    const task = TASK_START.test(s);
    if (endsQ) score += 3;
    if (q) score += 2;
    if (task && words >= 5) score += 2;
    if (words >= 4 && words <= 60) score += 1;
    if (score >= 3 || (q && words >= 4)) result.push({ text: s, score, task: task && !endsQ, index });
  });
  return result;
}

/**
 * screen: the newest/last strong question on a busy screen (chat windows put the newest at the bottom).
 * speech: every question-like sentence of one utterance, in order.
 */
export function extractQuestion(raw: string, mode: "screen" | "speech" = "screen"): string | null {
  if (!raw || raw.trim().length < 8) return null;
  const cands = findCandidates(raw);
  if (!cands.length) return null;
  if (mode === "speech") {
    const seen = new Set<string>();
    const parts = cands.map((c) => c.text).filter((t) => (seen.has(normalize(t)) ? false : (seen.add(normalize(t)), true)));
    return parts.join(" ").slice(0, 1500);
  }
  const strong = cands.filter((c) => c.score >= 5);
  const pick = (strong.length ? strong : cands)[(strong.length ? strong : cands).length - 1];
  if (!pick.task) return pick.text.slice(0, 1500);
  // Coding tasks often continue in the next sentences (constraints, examples).
  const all = splitSentences(raw);
  return all.slice(pick.index, pick.index + 3).join(" ").slice(0, 1500);
}

/** Speech-to-text hallucinations / filler that should never become a "question". */
const JUNK = new Set(["thank you", "thanks", "you", "bye", "okay", "ok", "yeah", "yes", "no", "uh", "um", "hmm", "thanks for watching", "thank you for watching", "mm hmm"]);
export function isJunkTranscript(t: string): boolean {
  const n = normalize(t);
  return n.length < 4 || JUNK.has(n);
}

/** Remembers handled questions (so the same one is never answered twice) and the app's own answers (so OCR can't loop on them). */
export class QuestionMemory {
  private seen: string[] = [];
  private ownSentences: string[] = [];
  private ownBlob = "";

  isDuplicate(q: string): boolean { return this.seen.some((s) => similar(s, q)); }
  remember(q: string) { this.seen.push(q); if (this.seen.length > 50) this.seen.shift(); }

  rememberOwn(answer: string) {
    for (const s of splitSentences(answer)) this.ownSentences.push(s);
    this.ownBlob += " " + normalize(answer);
    if (this.ownSentences.length > 400) this.ownSentences.splice(0, this.ownSentences.length - 400);
    if (this.ownBlob.length > 40000) this.ownBlob = this.ownBlob.slice(-40000);
  }

  isOwnText(q: string): boolean {
    const n = normalize(q);
    if (n.split(" ").length >= 5 && this.ownBlob.includes(n)) return true;
    return this.ownSentences.some((s) => similar(s, q));
  }

  clear() { this.seen = []; this.ownSentences = []; this.ownBlob = ""; }
}

/** Joins utterances that arrive close together ("Okay. ... So tell me about X?") before they are judged. */
export class UtteranceAggregator {
  private buf: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private flushMs: number, private onFlush: (text: string) => void) {}
  add(text: string) {
    this.buf.push(text.trim());
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.flushMs);
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const text = this.buf.join(" ").replace(/\s+/g, " ").trim();
    this.buf = [];
    if (text) this.onFlush(text);
  }
  cancel() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.buf = []; }
}
