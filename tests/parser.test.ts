import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseQuizText } from "../src/shared/parser";

function parseFixture(fileName: string, chapterName: string) {
  const fixturePath = join("tests", "fixtures", fileName);
  return parseQuizText({
    className: "Study Methods",
    chapterName,
    sourceFileName: fileName,
    rawInput: readFileSync(fixturePath, "utf8")
  });
}

describe("deterministic homework parser", () => {
  it("parses generic Chapter 1 counts and answer types", () => {
    const preview = parseFixture("Study_Skills_Chapter1.txt", "Chapter 1");
    const allQuestions = [...preview.ready, ...preview.needsCorrection];

    expect(preview.totalBlocks).toBe(5);
    expect(allQuestions).toHaveLength(5);
    expect(allQuestions.filter((question) => question.type === "multiple_choice")).toHaveLength(3);
    expect(allQuestions.filter((question) => question.type === "true_false")).toHaveLength(2);
    expect(allQuestions.filter((question) => question.sourceStatus === "INCORRECT")).toHaveLength(0);
    expect(preview.needsCorrection).toHaveLength(0);

    const question3 = allQuestions.find((question) => question.sourceQuestionNumber === 3);
    expect(question3?.choices).toHaveLength(5);
  });

  it("parses generic Chapter 2 counts and the marked incorrect true/false question", () => {
    const preview = parseFixture("Writing_Fundamentals_Chapter2.txt", "Chapter 2");
    const allQuestions = [...preview.ready, ...preview.needsCorrection];

    expect(preview.totalBlocks).toBe(6);
    expect(allQuestions).toHaveLength(6);
    expect(allQuestions.filter((question) => question.type === "multiple_choice")).toHaveLength(4);
    expect(allQuestions.filter((question) => question.type === "true_false")).toHaveLength(2);
    expect(allQuestions.filter((question) => question.sourceStatus === "INCORRECT")).toHaveLength(1);
    expect(preview.needsCorrection).toHaveLength(0);

    const question4 = allQuestions.find((question) => question.sourceQuestionNumber === 4);
    expect(question4).toBeDefined();
    expect(question4?.prompt).toBe(
      "Evidence should be listed without explanation so readers can interpret it alone."
    );
    expect(question4?.sourceSelectedAnswer).toBe("True");
    expect(question4?.choices.find((choice) => choice.isCorrect)?.text).toBe("False");
  });

  it("preserves multi-line answer text", () => {
    const preview = parseFixture("Writing_Fundamentals_Chapter2.txt", "Chapter 2");
    const question3 = preview.ready.find((question) => question.sourceQuestionNumber === 3);

    expect(question3?.choices.find((choice) => choice.isCorrect)?.text).toBe(
      "It connects one idea to the next by showing how the new point follows from the previous point"
    );
  });

  it("allows answer choices that differ only by letter case", () => {
    const preview = parseQuizText({
      className: "Hadoop",
      chapterName: "Chapter 5",
      sourceFileName: "chapter5.txt",
      rawInput: `6
Multiple Choice
CORRECT
1/1
Grade: 1 out of 1 point possible

The WritableComparable interface adds additional methods used to determine sort order between key objects; these methods are the ___________ methods.

    Option A

    CompareTo, Equals, and HashCode

    Option B

    compareTo, equalsTo, and hashcode

    Option C

    Correct:

    compareTo, equals, and hashCode
    Correct answer

    Option D

    comparableTo, equals, and hashCode

    Option E

    None of the above`
    });

    expect(preview.ready).toHaveLength(1);
    expect(preview.needsCorrection).toHaveLength(0);
    expect(preview.ready[0].choices.find((choice) => choice.isCorrect)?.label).toBe("C");
    expect(preview.ready[0].choices.find((choice) => choice.label === "A")?.text).toBe(
      "CompareTo, Equals, and HashCode"
    );
  });

  it("splits later questions that use bare numeric Canvas headers", () => {
    const preview = parseQuizText({
      className: "Hadoop",
      chapterName: "Chapter 5",
      sourceFileName: "chapter5.txt",
      rawInput: `17
Multiple Choice
CORRECT
1/1
Grade: 1 out of 1 point possible

What receives mapper output before reduce?

    Option A

    The input split

    Option B

    Correct:

    The shuffle and sort phase
    Correct answer

18
Multiple Choice
CORRECT
1/1
Grade: 1 out of 1 point possible

Which of these statements is correct.

    Option A

    The map input key and value types (K1 and V1) are different from the map output types (K2 and V2).

    Option B

    The map input key and value types (K1 and V1) are different from the map output types

    Option C

    The partition function operates on the intermediate key

    Option D

    A and B are correct

    Option E

    Correct:

    All of them are correct
    Correct answer`
    });

    expect(preview.totalBlocks).toBe(2);
    expect(preview.ready).toHaveLength(2);
    expect(preview.needsCorrection).toHaveLength(0);

    const question18 = preview.ready.find((question) => question.sourceQuestionNumber === 18);
    expect(question18?.prompt).toBe("Which of these statements is correct.");
    expect(question18?.choices.find((choice) => choice.isCorrect)?.text).toBe(
      "All of them are correct"
    );
  });

  it("routes malformed blocks to correction instead of guessing", () => {
    const preview = parseQuizText({
      className: "Study Methods",
      chapterName: "Broken",
      sourceFileName: "broken.txt",
      rawInput: `Question 1
1
Multiple Choice
CORRECT
1/1
Grade: 1 out of 1 point possible

What is missing?

    Option A

    A value`
    });

    expect(preview.ready).toHaveLength(0);
    expect(preview.needsCorrection).toHaveLength(1);
    expect(preview.needsCorrection[0].warnings).toContain("No correct answer marker was found.");
  });
});
