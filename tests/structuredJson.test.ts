import { describe, expect, it } from "vitest";
import { parseStructuredQuestionJson, structuredJsonTemplate } from "../src/shared/structuredJson";

describe("structured JSON import parser", () => {
  it("parses the standard JSON template into ready questions", () => {
    const preview = parseStructuredQuestionJson({
      className: "Study Methods",
      chapterName: "Structured Import",
      sourceFileName: "answerdeck-import-template.json",
      rawInput: structuredJsonTemplate
    });

    expect(preview.totalBlocks).toBe(2);
    expect(preview.ready).toHaveLength(2);
    expect(preview.needsCorrection).toHaveLength(0);
    expect(preview.ready[0].choices.find((choice) => choice.isCorrect)?.text).toBe(
      "Spacing review across multiple days"
    );
  });

  it("routes invalid JSON questions to correction instead of saving them as ready", () => {
    const preview = parseStructuredQuestionJson({
      className: "Study Methods",
      chapterName: "Structured Import",
      sourceFileName: "bad.json",
      rawInput: JSON.stringify({
        version: 1,
        questions: [
          {
            type: "multiple_choice",
            prompt: "Which option is valid?",
            choices: [
              { label: "A", text: "First", isCorrect: false },
              { label: "B", text: "Second", isCorrect: false }
            ]
          }
        ]
      })
    });

    expect(preview.ready).toHaveLength(0);
    expect(preview.needsCorrection).toHaveLength(1);
    expect(preview.needsCorrection[0].warnings).toContain("Exactly one answer choice must be marked correct.");
  });
});
