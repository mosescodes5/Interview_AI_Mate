import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionMemory, UtteranceAggregator, extractQuestion, isJunkTranscript, similar } from "./questionDetector";

describe("extractQuestion (screen)", () => {
  it("finds a question in noisy OCR output", () => {
    const ocr = `File  Edit  View  Help
Meeting - Interviewer
Q 3 of 10
What is the difference between let and const in JavaScript?
Type your answer here...
Send   Cancel`;
    expect(extractQuestion(ocr)).toBe("What is the difference between let and const in JavaScript?");
  });

  it("re-joins lines wrapped by OCR", () => {
    const ocr = "Can you explain how the event loop\nworks in Node.js and why it matters\nfor performance?";
    expect(extractQuestion(ocr)).toBe("Can you explain how the event loop works in Node.js and why it matters for performance?");
  });

  it("prefers the newest question when several are visible", () => {
    const ocr = "What is a closure?\nA closure is a function that remembers its scope.\nHow would you design a rate limiter for an API?";
    expect(extractQuestion(ocr)).toBe("How would you design a rate limiter for an API?");
  });

  it("recognises imperative interview prompts without a question mark", () => {
    expect(extractQuestion("Tell me about a time you disagreed with a teammate and how you handled it.")).toMatch(/^Tell me about a time/);
  });

  it("keeps the constraints of a coding task", () => {
    const q = extractQuestion("Write a function that reverses a linked list. It must run in O(n) time. Input is the head node.");
    expect(q).toContain("reverses a linked list");
    expect(q).toContain("O(n)");
  });

  it("returns null for screens with no question", () => {
    expect(extractQuestion("File Edit View\nInbox (4)\nSettings Profile Logout\n12:45 PM")).toBeNull();
    expect(extractQuestion("const x = a.b?.c ?? d; // 0x1F |||| ~~~~")).toBeNull();
    expect(extractQuestion("")).toBeNull();
  });
});

describe("extractQuestion (speech)", () => {
  it("drops pleasantries and keeps every question", () => {
    const t = "Okay, thanks for joining us today. Can you explain closures? And could you give me a short example?";
    const q = extractQuestion(t, "speech")!;
    expect(q).toContain("explain closures");
    expect(q).toContain("short example");
    expect(q).not.toContain("thanks for joining");
  });
  it("ignores small talk", () => {
    expect(extractQuestion("Yeah the weather has been pretty nice lately.", "speech")).toBeNull();
  });
});

describe("similar / QuestionMemory", () => {
  it("treats OCR variations of the same question as duplicates", () => {
    expect(similar("What is the difference between let and const?", "What is the difference between let and cons?")).toBe(true);
    expect(similar("What is the difference between let and const?", "what is the difference between let and const")).toBe(true);
    expect(similar("What is the difference between let and const?", "What is a closure in JavaScript?")).toBe(false);
  });
  it("treats a truncated copy as a duplicate but a follow-up as new", () => {
    expect(similar("Can you explain how the event loop works in Node.js?", "explain how the event loop works in Node.js")).toBe(true);
    expect(similar("Can you explain how the event loop works in Node.js?", "Can you explain how the event loop works in browsers and why microtasks matter?")).toBe(false);
  });
  it("remembers questions and ignores the app's own answers", () => {
    const m = new QuestionMemory();
    expect(m.isDuplicate("What is a closure in JavaScript?")).toBe(false);
    m.remember("What is a closure in JavaScript?");
    expect(m.isDuplicate("What is a closure in javascript")).toBe(true);
    m.rememberOwn("A closure is a function that keeps access to its scope. Why does that matter? Because it enables private state in modules.");
    expect(m.isOwnText("Why does that matter? Because it enables private state in modules.")).toBe(true);
    expect(m.isOwnText("How does garbage collection work in V8?")).toBe(false);
    m.clear();
    expect(m.isDuplicate("What is a closure in JavaScript?")).toBe(false);
  });
});

describe("transcript helpers", () => {
  it("flags whisper junk", () => {
    ["Thank you.", "you", " Okay ", "um"].forEach((t) => expect(isJunkTranscript(t)).toBe(true));
    expect(isJunkTranscript("Tell me about yourself")).toBe(false);
  });
  describe("UtteranceAggregator", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it("merges utterances that arrive close together", () => {
      const got: string[] = [];
      const a = new UtteranceAggregator(1000, (t) => got.push(t));
      a.add("Okay."); vi.advanceTimersByTime(600); a.add("So tell me about yourself?");
      vi.advanceTimersByTime(999); expect(got).toEqual([]);
      vi.advanceTimersByTime(2); expect(got).toEqual(["Okay. So tell me about yourself?"]);
    });
    it("cancel drops pending text", () => {
      const got: string[] = [];
      const a = new UtteranceAggregator(500, (t) => got.push(t));
      a.add("hello there"); a.cancel(); vi.advanceTimersByTime(1000);
      expect(got).toEqual([]);
    });
  });
});
