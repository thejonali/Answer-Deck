import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  it("adds retry lineage columns to an existing quiz session table", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "answerdeck-db-")), "study.sqlite");
    const legacyDatabase = new DatabaseSync(dbPath);
    legacyDatabase.exec(`
      CREATE TABLE classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        incorrect_count INTEGER NOT NULL,
        average_seconds_per_question REAL NOT NULL
      );
    `);
    legacyDatabase.close();

    const database = new StudyDatabase(dbPath);
    database.close();

    const migratedDatabase = new DatabaseSync(dbPath);
    try {
      const columns = migratedDatabase.prepare("PRAGMA table_info('quiz_sessions')").all() as Array<{
        name: string;
      }>;
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["parent_session_id", "root_session_id"])
      );
    } finally {
      migratedDatabase.close();
    }
  });

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

  it("tracks missed-question retries by immediate parent and root attempt", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "answerdeck-db-")), "study.sqlite");
    const database = new StudyDatabase(dbPath);

    try {
      const savedImport = database.saveImport({
        className: "Hadoop",
        chapterName: "Chapter 5",
        sourceFileName: "chapter5.txt",
        rawInput: "quiz lineage",
        questions: [question(2, "They are all correct"), question(18, "All of them are correct")],
        skippedRawBlocks: []
      });
      const questions = database.getQuestions(savedImport.classId, [savedImport.chapterId]);
      const [missedQuestion, correctQuestion] = questions;
      const missedCorrectChoice = missedQuestion.choices.find((choice) => choice.isCorrect)!;
      const missedWrongChoice = missedQuestion.choices.find((choice) => !choice.isCorrect)!;
      const correctChoice = correctQuestion.choices.find((choice) => choice.isCorrect)!;
      const root = database.saveQuizSession({
        classId: savedImport.classId,
        chapterIds: [savedImport.chapterId],
        mode: "single_chapter",
        parentSessionId: null,
        startedAt: "2026-06-27T12:00:00.000Z",
        completedAt: "2026-06-27T12:01:00.000Z",
        answers: [
          {
            questionId: missedQuestion.id,
            selectedChoiceId: missedWrongChoice.id,
            correctChoiceId: missedCorrectChoice.id,
            isCorrect: false,
            timeMs: 1000
          },
          {
            questionId: correctQuestion.id,
            selectedChoiceId: correctChoice.id,
            correctChoiceId: correctChoice.id,
            isCorrect: true,
            timeMs: 800
          }
        ]
      });

      const retryQuiz = database.getMissedQuestionQuiz(root.sessionId);
      expect(retryQuiz?.questions.map((item) => item.id)).toEqual([missedQuestion.id]);
      expect(retryQuiz?.rootSessionId).toBe(root.sessionId);

      const child = database.saveQuizSession({
        classId: savedImport.classId,
        chapterIds: [savedImport.chapterId],
        mode: "single_chapter",
        parentSessionId: root.sessionId,
        startedAt: "2026-06-27T12:02:00.000Z",
        completedAt: "2026-06-27T12:02:30.000Z",
        answers: [
          {
            questionId: missedQuestion.id,
            selectedChoiceId: missedWrongChoice.id,
            correctChoiceId: missedCorrectChoice.id,
            isCorrect: false,
            timeMs: 700
          }
        ]
      });
      const grandchild = database.saveQuizSession({
        classId: savedImport.classId,
        chapterIds: [savedImport.chapterId],
        mode: "single_chapter",
        parentSessionId: child.sessionId,
        startedAt: "2026-06-27T12:03:00.000Z",
        completedAt: "2026-06-27T12:03:15.000Z",
        answers: [
          {
            questionId: missedQuestion.id,
            selectedChoiceId: missedCorrectChoice.id,
            correctChoiceId: missedCorrectChoice.id,
            isCorrect: true,
            timeMs: 600
          }
        ]
      });

      const history = database.listQuizHistory();
      const childHistory = history.find((item) => item.id === child.sessionId)!;
      const grandchildHistory = history.find((item) => item.id === grandchild.sessionId)!;
      expect(childHistory.parentSessionId).toBe(root.sessionId);
      expect(childHistory.rootSessionId).toBe(root.sessionId);
      expect(grandchildHistory.parentSessionId).toBe(child.sessionId);
      expect(grandchildHistory.rootSessionId).toBe(root.sessionId);

      const recentHistory = database.listRecentQuizHistory();
      expect(recentHistory).toHaveLength(1);
      expect(recentHistory[0].rootSessionId).toBe(root.sessionId);
      expect(recentHistory[0].attempts.map((item) => item.id)).toEqual([
        root.sessionId,
        child.sessionId,
        grandchild.sessionId
      ]);
      expect(recentHistory[0].attempts.map((item) => item.incorrectCount)).toEqual([1, 1, 0]);

      const report = database.getPerformanceReport({
        classId: null,
        chapterId: null,
        from: null,
        to: null,
        attemptType: "all",
        page: 1,
        pageSize: 25
      });
      expect(report.kpis).toEqual({
        attempts: 3,
        questionsAnswered: 4,
        weightedAccuracy: 50,
        firstPassAccuracy: 50,
        latestMastery: 100,
        averageSecondsPerQuestion: 0.8,
        retryRecovery: 50,
        unresolvedQuestions: 0
      });
      expect(report.trend.map((point) => point.attemptType)).toEqual(["original", "retry", "retry"]);
      expect(report.activity).toEqual([{ date: "2026-06-27", correct: 2, incorrect: 2 }]);
      expect(report.chapters).toEqual([
        expect.objectContaining({
          chapterName: "Chapter 5",
          questionsAnswered: 4,
          accuracy: 50,
          latestMastery: 100,
          unresolvedQuestions: 0
        })
      ]);
      expect(report.retryFunnel).toEqual({ missed: 1, retested: 1, recovered: 1, stillMissed: 0 });
      expect(report.weakQuestions).toEqual([
        expect.objectContaining({ questionId: missedQuestion.id, answers: 3, misses: 2, latestCorrect: true })
      ]);
      expect(report.attempts.items.map((attempt) => attempt.id)).toEqual([
        grandchild.sessionId,
        child.sessionId,
        root.sessionId
      ]);

      const originalReport = database.getPerformanceReport({
        classId: savedImport.classId,
        chapterId: savedImport.chapterId,
        from: "2026-06-27",
        to: "2026-06-27",
        attemptType: "original",
        page: 1,
        pageSize: 1
      });
      expect(originalReport.kpis).toEqual(
        expect.objectContaining({
          attempts: 1,
          questionsAnswered: 2,
          weightedAccuracy: 50,
          latestMastery: 50,
          retryRecovery: 0,
          unresolvedQuestions: 1
        })
      );
      expect(originalReport.attempts.total).toBe(1);
      expect(originalReport.attempts.items).toHaveLength(1);
    } finally {
      database.close();
    }
  });
});
