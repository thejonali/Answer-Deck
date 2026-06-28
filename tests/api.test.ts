import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissedQuestionQuiz } from "../src/client/api";
import { performanceReportQuerySchema } from "../src/shared/schemas";

describe("API responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains how to recover when a stale server returns HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>AnswerDeck</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
    );

    await expect(getMissedQuestionQuiz(42)).rejects.toThrow(
      "The server returned an unexpected response. Restart AnswerDeck and try again."
    );
  });
});

describe("report query validation", () => {
  it("accepts omitted filters and applies pagination defaults", () => {
    expect(performanceReportQuerySchema.parse({})).toEqual({
      attemptType: "all",
      page: 1,
      pageSize: 25
    });
  });

  it("coerces explicit report filters from query strings", () => {
    expect(
      performanceReportQuerySchema.parse({
        classId: "1",
        chapterId: "2",
        from: "2026-06-01",
        to: "2026-06-28",
        attemptType: "retry",
        page: "2",
        pageSize: "10"
      })
    ).toEqual({
      classId: 1,
      chapterId: 2,
      from: "2026-06-01",
      to: "2026-06-28",
      attemptType: "retry",
      page: 2,
      pageSize: 10
    });
  });
});
