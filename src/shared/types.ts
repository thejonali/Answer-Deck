export type QuestionType = "multiple_choice" | "true_false";
export type SourceStatus = "CORRECT" | "INCORRECT" | "UNKNOWN";
export type ParseState = "ready" | "needs_correction" | "skipped";

export interface ChoiceInput {
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  sourceQuestionNumber: number | null;
  type: QuestionType;
  prompt: string;
  choices: ChoiceInput[];
  sourceStatus: SourceStatus;
  sourceSelectedAnswer: string | null;
  sourceFileName: string | null;
  rawBlock: string;
}

export interface ParsedQuestion extends QuestionInput {
  parseState: ParseState;
  warnings: string[];
  duplicateKey?: string;
}

export interface ImportPreview {
  className: string;
  chapterName: string;
  sourceFileName: string | null;
  rawInput: string;
  totalBlocks: number;
  ready: ParsedQuestion[];
  needsCorrection: ParsedQuestion[];
  skipped: ParsedQuestion[];
}

export interface StoredClass {
  id: number;
  name: string;
  chapters: StoredChapter[];
}

export interface StoredChapter {
  id: number;
  classId: number;
  name: string;
  questionCount: number;
}

export interface StoredChoice {
  id: number;
  questionId: number;
  label: string;
  text: string;
  sortOrder: number;
  isCorrect: boolean;
}

export interface StoredQuestion {
  id: number;
  classId: number;
  chapterId: number;
  className: string;
  chapterName: string;
  type: QuestionType;
  prompt: string;
  sourceQuestionNumber: number | null;
  sourceStatus: SourceStatus;
  sourceSelectedAnswer: string | null;
  choices: StoredChoice[];
}

export interface QuizAnswerInput {
  questionId: number;
  selectedChoiceId: number;
  correctChoiceId: number;
  isCorrect: boolean;
  timeMs: number;
}

export interface QuizSessionInput {
  classId: number;
  chapterIds: number[];
  mode: "single_chapter" | "combined_chapters";
  parentSessionId: number | null;
  startedAt: string;
  completedAt: string;
  answers: QuizAnswerInput[];
}

export interface QuizResult {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  percentage: number;
  totalTimeMs: number;
  averageTimeMs: number;
}

export interface QuizHistoryMissedQuestion {
  questionId: number;
  chapterName: string;
  prompt: string;
  selectedAnswer: string;
  correctAnswer: string;
  timeMs: number;
}

export interface QuizHistoryItem {
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
  chapterNames: string[];
  missedQuestions: QuizHistoryMissedQuestion[];
}

export interface QuizHistoryGroup {
  rootSessionId: number;
  className: string;
  chapterNames: string[];
  completedAt: string;
  attempts: QuizHistoryItem[];
}

export interface MissedQuestionQuiz {
  sourceSessionId: number;
  rootSessionId: number;
  classId: number;
  chapterIds: number[];
  questions: StoredQuestion[];
}
