import { describe, it, expect } from "vitest";
import {
  evenSplit, clampInt, sessionKeyOf, keyToDate, daysSince, addDaysKey, daysUntilKey,
  todayKey, planElapsed, normalizePlan, planView,
  validateAiQuestion, isDuplicateAi, aiSignature, normalizeText, isStoredAiQuestionUsable,
  sanitizeExplainPlus, classifyGrammarSkill, nextReviewEntry, REVIEW_INTERVALS,
  resolveSessionOrder,
} from "./logic.js";

const mkPlan = (o = {}) => ({
  v: 2, start: todayKey(), duration: 14,
  order: Array.from({ length: 100 }, (_, i) => i), completed: [], revision: [],
  pauseAccum: 0, pauseStart: null, today: null, ...o,
});

describe("distribution", () => {
  it("evenSplit spreads remainder on the first days", () => {
    expect(evenSplit(1210, 14)).toEqual([87,87,87,87,87,87,86,86,86,86,86,86,86,86]);
    expect(evenSplit(1210, 14).reduce((a,b)=>a+b,0)).toBe(1210);
    expect(evenSplit(10, 3)).toEqual([4,3,3]);
    expect(evenSplit(0, 5)).toEqual([0,0,0,0,0]);
  });
  it("clampInt bounds and coerces", () => {
    expect(clampInt(200,1,120)).toBe(120);
    expect(clampInt(0,1,120)).toBe(1);
    expect(clampInt("abc",1,120)).toBe(1);
    expect(clampInt(14,1,120)).toBe(14);
  });
});

describe("dates", () => {
  it("keyToDate / daysSince / addDaysKey / daysUntilKey are consistent", () => {
    expect(addDaysKey("2026-01-01", 31)).toBe("2026-02-01");
    expect(daysSince(addDaysKey(todayKey(), -5))).toBe(5);
    expect(daysUntilKey(addDaysKey(todayKey(), 3))).toBe(3);
    expect(keyToDate("2026-07-20").getMonth()).toBe(6);
  });
});

describe("session keys", () => {
  it("maps mode/cat/lvl to stable keys", () => {
    expect(sessionKeyOf({ mode:"all", cat:"grammar" })).toBe("all:grammar");
    expect(sessionKeyOf({ mode:"all", cat:"reading" })).toBe("all:reading");
    expect(sessionKeyOf({ mode:"level", lvl:"B2" })).toBe("level:B2");
    expect(sessionKeyOf({ mode:"plan" })).toBe("plan");
    expect(sessionKeyOf({ mode:"rapid" })).toBe("rapid");
    expect(sessionKeyOf(null)).toBe(null);
  });
  it("resolveSessionOrder drops ids that no longer resolve", () => {
    const ALL = [{ id:0 }, { id:1 }, { id:2 }];
    expect(resolveSessionOrder([0, 99, 2], ALL, []).map(x=>x.id)).toEqual([0,2]);
    expect(resolveSessionOrder([999], ALL, [])).toEqual([]);
  });
});

describe("plan engine", () => {
  it("elapsed discounts paused days", () => {
    const p = { start: addDaysKey(todayKey(), -5), pauseStart: addDaysKey(todayKey(), -2), pauseAccum: 0 };
    expect(planElapsed(p)).toBe(3);
  });
  it("fresh plan assigns an even first-day quota", () => {
    const v = planView(mkPlan());
    expect(v.assigned).toBe(Math.ceil(100 / 14)); // 8
    expect(v.dayNum).toBe(1);
    expect(v.remToday).toBe(8);
    expect(v.finished).toBe(false);
  });
  it("missed days redistribute the remainder over the days that remain", () => {
    const v = planView(mkPlan({ start: addDaysKey(todayKey(), -4) })); // day index 4
    expect(v.dayNum).toBe(5);
    expect(v.daysRemaining).toBe(10);
    expect(v.assigned).toBe(Math.ceil(100 / 10)); // 10, heavier but not impossible
    expect(v.assigned).toBeGreaterThan(8);
  });
  it("finished plan reports 100%", () => {
    const v = planView(mkPlan({ completed: Array.from({ length: 100 }, (_, i) => i) }));
    expect(v.finished).toBe(true);
    expect(v.remaining).toBe(0);
    expect(v.pct).toBe(100);
  });
  it("normalizePlan keeps completed, drops stale ids, rebuilds order", () => {
    const norm = normalizePlan({ start: todayKey(), duration: 14, order: [2, 999, 1], completed: [2, 999] }, [0,1,2,3]);
    expect(norm.completed).toEqual([2]);              // 999 dropped
    expect(new Set(norm.order)).toEqual(new Set([0,1,2,3])); // all current ids present
    expect(norm.duration).toBe(14);
  });
});

describe("AI question validation", () => {
  const good = { sentence:"Il faut que tu ___ prudent.", options:["sois","es","être","seras"], correct:0, rule:"subjonctif", why:[null,"indicatif","infinitif","futur"], level:"B2" };
  it("accepts a valid question", () => { expect(validateAiQuestion(good)).toBe(null); });
  it("rejects malformed shapes", () => {
    expect(validateAiQuestion("nope")).not.toBe(null);
    expect(validateAiQuestion({ ...good, options:["a","b","c"] })).not.toBe(null);       // 3 options
    expect(validateAiQuestion({ ...good, options:["sois","Sois","être","seras"] })).not.toBe(null); // dup
    expect(validateAiQuestion({ ...good, correct:7 })).not.toBe(null);                    // range
    expect(validateAiQuestion({ ...good, why:[null,"a","b"] })).not.toBe(null);           // why length
    expect(validateAiQuestion({ ...good, rule:"  " })).not.toBe(null);                    // empty rule
    expect(validateAiQuestion({ ...good, level:"Z9" })).not.toBe(null);                   // bad level
    expect(validateAiQuestion({ ...good, sentence:"pas de trou" })).not.toBe(null);       // no blank
  });
  it("dedup is order- and accent-insensitive", () => {
    expect(isDuplicateAi({ ...good, options:["seras","être","es","sois"], correct:3 }, [good])).toBe(true);
    expect(isDuplicateAi({ ...good, sentence:"Bien qu'il ___ tard." }, [good])).toBe(false);
    expect(aiSignature(good)).toBe(aiSignature({ ...good, options:["seras","être","es","sois"], correct:3 }));
  });
  it("isStoredAiQuestionUsable gates corrupt stored items", () => {
    expect(isStoredAiQuestionUsable(good)).toBe(true);
    expect(isStoredAiQuestionUsable({ ...good, options:["a","b"] })).toBe(false);
    expect(isStoredAiQuestionUsable(null)).toBe(false);
  });
  it("normalizeText strips accents/case/punctuation", () => {
    expect(normalizeText("Être")).toBe(normalizeText("etre"));
  });
});

describe("Explain+ parsing", () => {
  const good = '{"reasoningType":"direct","evidence":[{"quote":"x","explanation":"y"}],"correctionSummary":"a","whyYourAnswerIsWrong":"b"}';
  it("parses valid JSON", () => { expect(sanitizeExplainPlus(good)).not.toBe(null); });
  it("tolerates prose and code fences around the JSON", () => {
    expect(sanitizeExplainPlus("Voici :\n```json\n"+good+"\n```\nVoilà")).not.toBe(null);
  });
  it("rejects truncated / missing-field output", () => {
    expect(sanitizeExplainPlus('{"evidence":[{"quote":"abc')).toBe(null);
    expect(sanitizeExplainPlus('{"evidence":[],"correctionSummary":"","whyYourAnswerIsWrong":""}')).toBe(null);
    expect(sanitizeExplainPlus("désolé")).toBe(null);
  });
});

describe("skill classification", () => {
  it("classifies by rule keyword and option shape", () => {
    expect(classifyGrammarSkill({ rule:"le subjonctif après il faut que", sentence:"", options:[] }).key).toBe("subjunctive");
    expect(classifyGrammarSkill({ rule:"", sentence:"j'habite ___ Canada", options:["à","au","du","en"] }).key).toBe("prepositions");
    expect(classifyGrammarSkill({ rule:"", sentence:"je ___ appelle", options:["le","la","les","lui"] }).key).toBe("object-pronouns");
  });
});

describe("spaced review scheduling", () => {
  it("correct advances the box; a miss resets it", () => {
    const first = nextReviewEntry(undefined, true);
    expect(first.box).toBe(1);
    expect(daysUntilKey(first.due)).toBe(REVIEW_INTERVALS[1]);
    const wrong = nextReviewEntry({ box: 3 }, false);
    expect(wrong.box).toBe(0);
    expect(daysUntilKey(wrong.due)).toBe(REVIEW_INTERVALS[0]);
    const capped = nextReviewEntry({ box: 5 }, true);
    expect(capped.box).toBe(REVIEW_INTERVALS.length - 1);
  });
});
