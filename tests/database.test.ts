import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StudyDatabase } from "../src/server/database";
import type { QuestionInput } from "../src/shared/types";

function question(sourceQuestionNumber: number, correctText: string): QuestionInput {
  return {
    sourceQuestionNumber,
    type: "multiple_choice",
    prompt: "Which of these statements is correct.",
    choices: [
      { label: "A", text: "The map input key and value types are different", isCorrect: false },
      { label: "B", text: "The partition function operates on the intermediate key", isCorrect: false },
      { label: "C", text: correctText, isCorrect: true }
    ],
    sourceStatus: "CORRECT",
    sourceSelectedAnswer: null,
    sourceFileName: "chapter5.txt",
    rawBlock: `Question ${sourceQuestionNumber}`
  };
}

describe("study database imports", () => {
  it("allows repeated prompts when source question numbers differ", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "answerdeck-db-")), "study.sqlite");
    const database = new StudyDatabase(dbPath);

    try {
      const firstImport = database.saveImport({
        className: "Hadoop",
        chapterName: "Chapter 5",
        sourceFileName: "chapter5.txt",
        rawInput: "first",
        questions: [
          question(2, "They are all correct"),
          question(18, "All of them are correct")
        ],
        skippedRawBlocks: []
      });

      expect(firstImport.savedCount).toBe(2);
      expect(firstImport.duplicateCount).toBe(0);

      const secondImport = database.saveImport({
        className: "Hadoop",
        chapterName: "Chapter 5",
        sourceFileName: "chapter5.txt",
        rawInput: "repeat",
        questions: [question(18, "All of them are correct")],
        skippedRawBlocks: []
      });

      expect(secondImport.savedCount).toBe(0);
      expect(secondImport.duplicateCount).toBe(1);

      const classes = database.listClasses();
      const hadoop = classes.find((item) => item.name === "Hadoop");
      const chapter = hadoop?.chapters.find((item) => item.name === "Chapter 5");
      expect(chapter?.questionCount).toBe(2);

      const questions = database.getQuestions(hadoop!.id, [chapter!.id]);
      expect(questions.map((item) => item.sourceQuestionNumber).sort((a, b) => a! - b!)).toEqual([
        2,
        18
      ]);
    } finally {
      database.close();
    }
  });
});
