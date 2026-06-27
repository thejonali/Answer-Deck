import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissedQuestionQuiz } from "../src/client/api";

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
