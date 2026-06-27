import type {
  ImportPreview,
  MissedQuestionQuiz,
  QuestionInput,
  QuizHistoryItem,
  QuizSessionInput,
  StoredClass,
  StoredQuestion
} from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options
  });

  const responseText = await response.text();
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error("The server returned an unexpected response. Restart AnswerDeck and try again.");
  }

  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : response.statusText || "Request failed.";
    throw new Error(error);
  }
  return body as T;
}

export function previewImport(input: {
  className: string;
  chapterName: string;
  sourceFileName: string | null;
  rawInput: string;
}) {
  return request<ImportPreview>("/api/import/preview", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function saveImport(input: {
  className: string;
  chapterName: string;
  sourceFileName: string | null;
  rawInput: string;
  questions: QuestionInput[];
  skippedRawBlocks: string[];
}) {
  return request<{
    importBatchId: number;
    savedCount: number;
    skippedCount: number;
    duplicateCount: number;
    classId: number;
    chapterId: number;
  }>("/api/import/save", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listClasses() {
  return request<StoredClass[]>("/api/classes");
}

export function listHistory() {
  return request<QuizHistoryItem[]>("/api/history");
}

export function renameClass(classId: number, name: string) {
  return request<{ ok: true }>(`/api/classes/${classId}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export function renameChapter(chapterId: number, name: string) {
  return request<{ ok: true }>(`/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export function getQuestions(classId: number, chapterIds: number[]) {
  const params = new URLSearchParams({
    classId: String(classId),
    chapterIds: chapterIds.join(",")
  });
  return request<StoredQuestion[]>(`/api/questions?${params}`);
}

export function saveQuizSession(input: QuizSessionInput) {
  return request<{ sessionId: number }>("/api/quiz-sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getMissedQuestionQuiz(sessionId: number) {
  return request<MissedQuestionQuiz>(`/api/quiz-sessions/${sessionId}/missed-questions`);
}

export function updateQuestion(questionId: number, input: QuestionInput) {
  return request<{ ok: true }>(`/api/questions/${questionId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteQuestion(questionId: number) {
  return request<{ ok: true }>(`/api/questions/${questionId}`, {
    method: "DELETE"
  });
}
