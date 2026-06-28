import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ChoiceInput,
  MissedQuestionQuiz,
  QuestionInput,
  QuizHistoryGroup,
  QuizSessionInput,
  QuizHistoryItem,
  QuizHistoryMissedQuestion,
  SourceStatus,
  StoredChapter,
  StoredClass,
  StoredQuestion
} from "../shared/types";
import { normalizePrompt } from "../shared/parser";
import { calculateQuizResult } from "../shared/stats";

export interface SaveImportResult {
  importBatchId: number;
  savedCount: number;
  skippedCount: number;
  duplicateCount: number;
  classId: number;
  chapterId: number;
}

interface QuestionRow {
  id: number;
  classId: number;
  chapterId: number;
  className: string;
  chapterName: string;
  type: "multiple_choice" | "true_false";
  prompt: string;
  sourceQuestionNumber: number | null;
  sourceStatus: SourceStatus;
  sourceSelectedAnswer: string | null;
}

interface ChoiceRow {
  id: number;
  questionId: number;
  label: string;
  text: string;
  sortOrder: number;
  isCorrect: number;
}

interface QuizHistoryRow {
  id: number;
  parentSessionId: number | null;
  rootSessionId: number | null;
  className: string;
  mode: "single_chapter" | "combined_chapters";
  startedAt: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  averageSecondsPerQuestion: number;
  chapterNames: string | null;
}

export class StudyDatabase {
  private db: DatabaseSync;

  constructor(dbPath = "data/study.sqlite") {
    const absolutePath = resolve(dbPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    this.db = new DatabaseSync(absolutePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(class_id, name)
      );

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        normalized_prompt TEXT NOT NULL,
        source_file_name TEXT,
        source_question_number INTEGER,
        source_status TEXT NOT NULL,
        source_selected_answer TEXT,
        raw_block TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS choices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        text TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        source_file_name TEXT,
        raw_input TEXT NOT NULL,
        total_blocks INTEGER NOT NULL,
        saved_count INTEGER NOT NULL,
        skipped_count INTEGER NOT NULL,
        needs_correction_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS import_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        raw_block TEXT NOT NULL,
        source_question_number INTEGER,
        issue_code TEXT NOT NULL,
        message TEXT NOT NULL,
        resolution TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        parent_session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE SET NULL,
        root_session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE SET NULL,
        mode TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        incorrect_count INTEGER NOT NULL,
        average_seconds_per_question REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quiz_session_chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS quiz_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        selected_choice_id INTEGER NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
        correct_choice_id INTEGER NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
        is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
        time_ms INTEGER NOT NULL,
        answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.migrateQuestionDuplicatePolicy();
    this.migrateQuizSessionLineage();
  }

  private migrateQuizSessionLineage() {
    const columns = this.db.prepare("PRAGMA table_info('quiz_sessions')").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("parent_session_id")) {
      this.db.exec(
        "ALTER TABLE quiz_sessions ADD COLUMN parent_session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE SET NULL"
      );
    }
    if (!columnNames.has("root_session_id")) {
      this.db.exec(
        "ALTER TABLE quiz_sessions ADD COLUMN root_session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE SET NULL"
      );
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS quiz_sessions_parent_session_id
      ON quiz_sessions(parent_session_id);

      CREATE INDEX IF NOT EXISTS quiz_sessions_root_session_id
      ON quiz_sessions(root_session_id);
    `);
  }

  private migrateQuestionDuplicatePolicy() {
    if (this.hasPromptOnlyQuestionUniqueConstraint()) {
      this.rebuildQuestionsTableWithoutPromptUniqueConstraint();
    }

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS questions_unique_source_number
      ON questions(class_id, chapter_id, source_question_number)
      WHERE source_question_number IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS questions_unique_unnumbered_prompt
      ON questions(class_id, chapter_id, normalized_prompt)
      WHERE source_question_number IS NULL;
    `);
  }

  private hasPromptOnlyQuestionUniqueConstraint(): boolean {
    const indexes = this.db.prepare("PRAGMA index_list('questions')").all() as Array<{
      name: string;
      unique: number;
      origin: string;
    }>;

    return indexes.some((index) => {
      if (!index.unique || index.origin !== "u") {
        return false;
      }
      const columns = this.db.prepare(`PRAGMA index_info('${index.name}')`).all() as Array<{
        name: string;
      }>;
      return columns.map((column) => column.name).join(",") === "class_id,chapter_id,normalized_prompt";
    });
  }

  private rebuildQuestionsTableWithoutPromptUniqueConstraint() {
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.db.exec(`
        BEGIN;

        CREATE TABLE questions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          prompt TEXT NOT NULL,
          normalized_prompt TEXT NOT NULL,
          source_file_name TEXT,
          source_question_number INTEGER,
          source_status TEXT NOT NULL,
          source_selected_answer TEXT,
          raw_block TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO questions_new (
          id, class_id, chapter_id, type, prompt, normalized_prompt, source_file_name,
          source_question_number, source_status, source_selected_answer, raw_block, created_at, updated_at
        )
        SELECT
          id, class_id, chapter_id, type, prompt, normalized_prompt, source_file_name,
          source_question_number, source_status, source_selected_answer, raw_block, created_at, updated_at
        FROM questions;

        DROP TABLE questions;
        ALTER TABLE questions_new RENAME TO questions;

        COMMIT;
      `);
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  upsertClass(name: string): number {
    this.db
      .prepare(
        "INSERT INTO classes (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP"
      )
      .run(name);
    const row = this.db.prepare("SELECT id FROM classes WHERE name = ?").get(name) as { id: number };
    return row.id;
  }

  upsertChapter(classId: number, name: string): number {
    this.db
      .prepare(
        "INSERT INTO chapters (class_id, name) VALUES (?, ?) ON CONFLICT(class_id, name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP"
      )
      .run(classId, name);
    const row = this.db
      .prepare("SELECT id FROM chapters WHERE class_id = ? AND name = ?")
      .get(classId, name) as { id: number };
    return row.id;
  }

  saveImport(params: {
    className: string;
    chapterName: string;
    sourceFileName: string | null;
    rawInput: string;
    questions: QuestionInput[];
    skippedRawBlocks: string[];
  }): SaveImportResult {
    this.db.exec("BEGIN");
    try {
      const classId = this.upsertClass(params.className);
      const chapterId = this.upsertChapter(classId, params.chapterName);

      let savedCount = 0;
      let duplicateCount = 0;

      const insertQuestion = this.db.prepare(`
        INSERT INTO questions (
          class_id, chapter_id, type, prompt, normalized_prompt, source_file_name,
          source_question_number, source_status, source_selected_answer, raw_block
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertChoice = this.db.prepare(`
        INSERT INTO choices (question_id, label, text, sort_order, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `);
      const duplicateBySourceNumber = this.db.prepare(
        "SELECT id FROM questions WHERE class_id = ? AND chapter_id = ? AND source_question_number = ?"
      );
      const duplicateByPrompt = this.db.prepare(
        `SELECT id FROM questions
        WHERE class_id = ? AND chapter_id = ? AND normalized_prompt = ? AND source_question_number IS NULL`
      );

      for (const question of params.questions) {
        const normalized = normalizePrompt(question.prompt);
        const duplicate =
          question.sourceQuestionNumber === null
            ? duplicateByPrompt.get(classId, chapterId, normalized)
            : duplicateBySourceNumber.get(classId, chapterId, question.sourceQuestionNumber);
        if (duplicate) {
          duplicateCount += 1;
          continue;
        }

        const result = insertQuestion.run(
          classId,
          chapterId,
          question.type,
          question.prompt,
          normalized,
          question.sourceFileName,
          question.sourceQuestionNumber,
          question.sourceStatus,
          question.sourceSelectedAnswer,
          question.rawBlock
        );
        const questionId = Number(result.lastInsertRowid);
        question.choices.forEach((choice: ChoiceInput, index) => {
          insertChoice.run(questionId, choice.label, choice.text, index, choice.isCorrect ? 1 : 0);
        });
        savedCount += 1;
      }

      const skippedCount = params.skippedRawBlocks.length + duplicateCount;
      const batchResult = this.db
        .prepare(
          `INSERT INTO import_batches (
            class_id, chapter_id, source_file_name, raw_input, total_blocks,
            saved_count, skipped_count, needs_correction_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          classId,
          chapterId,
          params.sourceFileName,
          params.rawInput,
          params.questions.length + params.skippedRawBlocks.length,
          savedCount,
          skippedCount,
          0
        );
      const importBatchId = Number(batchResult.lastInsertRowid);

      const insertIssue = this.db.prepare(`
        INSERT INTO import_issues (
          import_batch_id, raw_block, source_question_number, issue_code, message, resolution
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      params.skippedRawBlocks.forEach((rawBlock) => {
        insertIssue.run(importBatchId, rawBlock, null, "SKIPPED_BY_USER", "Question skipped by user.", "skipped");
      });

      this.db.exec("COMMIT");
      return { importBatchId, savedCount, skippedCount, duplicateCount, classId, chapterId };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listClasses(): StoredClass[] {
    const classRows = this.db
      .prepare("SELECT id, name FROM classes ORDER BY name")
      .all() as Array<{ id: number; name: string }>;
    const chapterStatement = this.db.prepare(`
      SELECT chapters.id, chapters.class_id as classId, chapters.name, COUNT(questions.id) as questionCount
      FROM chapters
      LEFT JOIN questions ON questions.chapter_id = chapters.id
      WHERE chapters.class_id = ?
      GROUP BY chapters.id
      ORDER BY chapters.name
    `);

    return classRows.map((classRow) => ({
      id: classRow.id,
      name: classRow.name,
      chapters: chapterStatement.all(classRow.id) as unknown as StoredChapter[]
    }));
  }

  updateClassName(classId: number, name: string): void {
    this.db
      .prepare("UPDATE classes SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(name, classId);
  }

  updateChapterName(chapterId: number, name: string): void {
    this.db
      .prepare("UPDATE chapters SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(name, chapterId);
  }

  getQuestions(classId: number, chapterIds: number[]): StoredQuestion[] {
    const placeholders = chapterIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT
          questions.id, questions.class_id as classId, questions.chapter_id as chapterId,
          classes.name as className, chapters.name as chapterName, questions.type,
          questions.prompt, questions.source_question_number as sourceQuestionNumber,
          questions.source_status as sourceStatus, questions.source_selected_answer as sourceSelectedAnswer
        FROM questions
        JOIN classes ON classes.id = questions.class_id
        JOIN chapters ON chapters.id = questions.chapter_id
        WHERE questions.class_id = ? AND questions.chapter_id IN (${placeholders})
        ORDER BY questions.id`
      )
      .all(classId, ...chapterIds) as unknown as QuestionRow[];

    const choiceStatement = this.db.prepare(`
      SELECT id, question_id as questionId, label, text, sort_order as sortOrder, is_correct as isCorrect
      FROM choices
      WHERE question_id = ?
      ORDER BY sort_order
    `);

    return rows.map((row) => ({
      ...row,
      sourceStatus: row.sourceStatus,
      choices: (choiceStatement.all(row.id) as unknown as ChoiceRow[]).map((choice) => ({
        ...choice,
        isCorrect: Boolean(choice.isCorrect)
      }))
    }));
  }

  updateQuestion(questionId: number, question: QuestionInput): void {
    const normalized = normalizePrompt(question.prompt);

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE questions
          SET type = ?, prompt = ?, normalized_prompt = ?, source_status = ?,
              source_selected_answer = ?, raw_block = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
        )
        .run(
          question.type,
          question.prompt,
          normalized,
          question.sourceStatus,
          question.sourceSelectedAnswer,
          question.rawBlock,
          questionId
        );

      this.db.prepare("DELETE FROM choices WHERE question_id = ?").run(questionId);
      const insertChoice = this.db.prepare(`
        INSERT INTO choices (question_id, label, text, sort_order, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `);
      question.choices.forEach((choice, index) => {
        insertChoice.run(questionId, choice.label, choice.text, index, choice.isCorrect ? 1 : 0);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteQuestion(questionId: number): void {
    this.db.prepare("DELETE FROM questions WHERE id = ?").run(questionId);
  }

  saveQuizSession(input: QuizSessionInput): { sessionId: number } {
    this.db.exec("BEGIN");
    try {
      let rootSessionId: number | null = null;
      if (input.parentSessionId !== null) {
        const parent = this.db
          .prepare(
            `SELECT id, class_id as classId, COALESCE(root_session_id, id) as rootSessionId
            FROM quiz_sessions WHERE id = ?`
          )
          .get(input.parentSessionId) as
          | { id: number; classId: number; rootSessionId: number }
          | undefined;
        if (!parent || parent.classId !== input.classId) {
          throw new Error("The retry source must be an existing attempt from the same class.");
        }

        const missedRows = this.db
          .prepare(
            "SELECT question_id as questionId FROM quiz_answers WHERE quiz_session_id = ? AND is_correct = 0"
          )
          .all(input.parentSessionId) as Array<{ questionId: number }>;
        const missedIds = new Set(missedRows.map((row) => row.questionId));
        const answerIds = new Set(input.answers.map((answer) => answer.questionId));
        if (
          missedIds.size === 0 ||
          missedIds.size !== input.answers.length ||
          answerIds.size !== input.answers.length ||
          [...answerIds].some((questionId) => !missedIds.has(questionId))
        ) {
          throw new Error("A retry must answer exactly the questions missed in its source attempt.");
        }
        rootSessionId = parent.rootSessionId;
      }

      const result = calculateQuizResult(input.answers);
      const sessionResult = this.db
        .prepare(
          `INSERT INTO quiz_sessions (
            class_id, parent_session_id, root_session_id, mode, started_at, completed_at, total_questions,
            correct_count, incorrect_count, average_seconds_per_question
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.classId,
          input.parentSessionId,
          rootSessionId,
          input.mode,
          input.startedAt,
          input.completedAt,
          result.totalQuestions,
          result.correctCount,
          result.incorrectCount,
          result.averageTimeMs / 1000
        );
      const sessionId = Number(sessionResult.lastInsertRowid);

      const insertChapter = this.db.prepare(
        "INSERT INTO quiz_session_chapters (quiz_session_id, chapter_id) VALUES (?, ?)"
      );
      input.chapterIds.forEach((chapterId) => insertChapter.run(sessionId, chapterId));

      const insertAnswer = this.db.prepare(`
        INSERT INTO quiz_answers (
          quiz_session_id, question_id, selected_choice_id, correct_choice_id, is_correct, time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      input.answers.forEach((answer) => {
        insertAnswer.run(
          sessionId,
          answer.questionId,
          answer.selectedChoiceId,
          answer.correctChoiceId,
          answer.isCorrect ? 1 : 0,
          answer.timeMs
        );
      });

      this.db.exec("COMMIT");
      return { sessionId };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listQuizHistory(): QuizHistoryItem[] {
    const rows = this.listQuizHistoryRows();
    return this.hydrateQuizHistory(rows);
  }

  listRecentQuizHistory(limit = 8): QuizHistoryGroup[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const rootRows = this.db
      .prepare(
        `SELECT id
        FROM quiz_sessions
        WHERE parent_session_id IS NULL
        ORDER BY completed_at DESC, id DESC
        LIMIT ?`
      )
      .all(safeLimit) as Array<{ id: number }>;

    if (rootRows.length === 0) {
      return [];
    }

    const rootIds = rootRows.map((row) => row.id);
    const placeholders = rootIds.map(() => "?").join(", ");
    const rows = this.listQuizHistoryRows(
      `WHERE quiz_sessions.id IN (${placeholders}) OR quiz_sessions.root_session_id IN (${placeholders})`,
      [...rootIds, ...rootIds]
    );
    const history = this.hydrateQuizHistory(rows);

    return rootIds.map((rootSessionId) => {
      const attempts = history
        .filter((attempt) => (attempt.rootSessionId ?? attempt.id) === rootSessionId)
        .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.id - right.id);
      const rootAttempt = attempts.find((attempt) => attempt.id === rootSessionId) ?? attempts[0];
      const latestAttempt = attempts.at(-1) ?? rootAttempt;

      return {
        rootSessionId,
        className: rootAttempt.className,
        chapterNames: rootAttempt.chapterNames,
        completedAt: latestAttempt.completedAt,
        attempts
      };
    });
  }

  private listQuizHistoryRows(whereClause = "", parameters: number[] = []): QuizHistoryRow[] {
    return this.db
      .prepare(
        `SELECT
          quiz_sessions.id,
          quiz_sessions.parent_session_id as parentSessionId,
          quiz_sessions.root_session_id as rootSessionId,
          classes.name as className,
          quiz_sessions.mode,
          quiz_sessions.started_at as startedAt,
          quiz_sessions.completed_at as completedAt,
          quiz_sessions.total_questions as totalQuestions,
          quiz_sessions.correct_count as correctCount,
          quiz_sessions.incorrect_count as incorrectCount,
          quiz_sessions.average_seconds_per_question as averageSecondsPerQuestion,
          GROUP_CONCAT(chapters.name, '||') as chapterNames
        FROM quiz_sessions
        JOIN classes ON classes.id = quiz_sessions.class_id
        LEFT JOIN quiz_session_chapters ON quiz_session_chapters.quiz_session_id = quiz_sessions.id
        LEFT JOIN chapters ON chapters.id = quiz_session_chapters.chapter_id
        ${whereClause}
        GROUP BY quiz_sessions.id
        ORDER BY quiz_sessions.completed_at DESC, quiz_sessions.id DESC`
      )
      .all(...parameters) as unknown as QuizHistoryRow[];
  }

  private hydrateQuizHistory(rows: QuizHistoryRow[]): QuizHistoryItem[] {
    const missedStatement = this.db.prepare(
      `SELECT
        questions.id as questionId,
        chapters.name as chapterName,
        questions.prompt,
        selected.text as selectedAnswer,
        correct.text as correctAnswer,
        quiz_answers.time_ms as timeMs
      FROM quiz_answers
      JOIN questions ON questions.id = quiz_answers.question_id
      JOIN chapters ON chapters.id = questions.chapter_id
      JOIN choices selected ON selected.id = quiz_answers.selected_choice_id
      JOIN choices correct ON correct.id = quiz_answers.correct_choice_id
      WHERE quiz_answers.quiz_session_id = ? AND quiz_answers.is_correct = 0
      ORDER BY quiz_answers.id`
    );

    return rows.map((row) => ({
      id: row.id,
      parentSessionId: row.parentSessionId,
      rootSessionId: row.rootSessionId,
      className: row.className,
      mode: row.mode,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      totalQuestions: row.totalQuestions,
      correctCount: row.correctCount,
      incorrectCount: row.incorrectCount,
      averageSecondsPerQuestion: row.averageSecondsPerQuestion,
      chapterNames: row.chapterNames ? row.chapterNames.split("||") : [],
      missedQuestions: missedStatement.all(row.id) as unknown as QuizHistoryMissedQuestion[]
    }));
  }

  getMissedQuestionQuiz(sessionId: number): MissedQuestionQuiz | null {
    const session = this.db
      .prepare(
        `SELECT id, class_id as classId, COALESCE(root_session_id, id) as rootSessionId
        FROM quiz_sessions WHERE id = ?`
      )
      .get(sessionId) as { id: number; classId: number; rootSessionId: number } | undefined;
    if (!session) {
      return null;
    }

    const questionIds = (
      this.db
        .prepare(
          `SELECT question_id as questionId
          FROM quiz_answers
          WHERE quiz_session_id = ? AND is_correct = 0
          ORDER BY id`
        )
        .all(sessionId) as Array<{ questionId: number }>
    ).map((row) => row.questionId);
    const questions = this.getQuestionsByIds(session.classId, questionIds);

    return {
      sourceSessionId: sessionId,
      rootSessionId: session.rootSessionId,
      classId: session.classId,
      chapterIds: [...new Set(questions.map((question) => question.chapterId))],
      questions
    };
  }

  private getQuestionsByIds(classId: number, questionIds: number[]): StoredQuestion[] {
    if (questionIds.length === 0) {
      return [];
    }

    const placeholders = questionIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT
          questions.id, questions.class_id as classId, questions.chapter_id as chapterId,
          classes.name as className, chapters.name as chapterName, questions.type,
          questions.prompt, questions.source_question_number as sourceQuestionNumber,
          questions.source_status as sourceStatus, questions.source_selected_answer as sourceSelectedAnswer
        FROM questions
        JOIN classes ON classes.id = questions.class_id
        JOIN chapters ON chapters.id = questions.chapter_id
        WHERE questions.class_id = ? AND questions.id IN (${placeholders})`
      )
      .all(classId, ...questionIds) as unknown as QuestionRow[];
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const choiceStatement = this.db.prepare(`
      SELECT id, question_id as questionId, label, text, sort_order as sortOrder, is_correct as isCorrect
      FROM choices WHERE question_id = ? ORDER BY sort_order
    `);

    return questionIds.flatMap((questionId) => {
      const row = rowsById.get(questionId);
      if (!row) {
        return [];
      }
      return [{
        ...row,
        choices: (choiceStatement.all(row.id) as unknown as ChoiceRow[]).map((choice) => ({
          ...choice,
          isCorrect: Boolean(choice.isCorrect)
        }))
      }];
    });
  }

  exportData() {
    return {
      classes: this.listClasses(),
      questions: this.db.prepare("SELECT * FROM questions ORDER BY id").all(),
      choices: this.db.prepare("SELECT * FROM choices ORDER BY question_id, sort_order").all(),
      quizHistory: this.listQuizHistory(),
      quizSessions: this.db.prepare("SELECT * FROM quiz_sessions ORDER BY id").all(),
      quizAnswers: this.db.prepare("SELECT * FROM quiz_answers ORDER BY id").all()
    };
  }
}
