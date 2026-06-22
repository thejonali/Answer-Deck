import { describe, expect, it } from "vitest";
import { calculateQuizResult, formatDuration, shuffleArray } from "../src/shared/stats";

describe("quiz stats", () => {
  it("calculates score and timing", () => {
    const result = calculateQuizResult([
      { questionId: 1, selectedChoiceId: 1, correctChoiceId: 1, isCorrect: true, timeMs: 1000 },
      { questionId: 2, selectedChoiceId: 3, correctChoiceId: 4, isCorrect: false, timeMs: 3000 }
    ]);

    expect(result).toEqual({
      totalQuestions: 2,
      correctCount: 1,
      incorrectCount: 1,
      percentage: 50,
      totalTimeMs: 4000,
      averageTimeMs: 2000
    });
  });

  it("formats durations", () => {
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(75_000)).toBe("1m 15s");
  });

  it("shuffles deterministically with a seed", () => {
    expect(shuffleArray([1, 2, 3, 4, 5], 42)).toEqual(shuffleArray([1, 2, 3, 4, 5], 42));
  });
});

