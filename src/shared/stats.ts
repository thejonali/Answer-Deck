import type { QuizAnswerInput, QuizResult } from "./types";

export function calculateQuizResult(answers: QuizAnswerInput[]): QuizResult {
  const totalQuestions = answers.length;
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const incorrectCount = totalQuestions - correctCount;
  const totalTimeMs = answers.reduce((sum, answer) => sum + answer.timeMs, 0);

  return {
    totalQuestions,
    correctCount,
    incorrectCount,
    percentage: totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100),
    totalTimeMs,
    averageTimeMs: totalQuestions === 0 ? 0 : Math.round(totalTimeMs / totalQuestions)
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function shuffleArray<T>(items: T[], seed = Date.now()): T[] {
  const copy = [...items];
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  const next = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

