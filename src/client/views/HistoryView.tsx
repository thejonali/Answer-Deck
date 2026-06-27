import { useEffect, useState } from "react";
import { listHistory } from "../api";
import { Metric } from "../components/Metric";
import { formatDateTime } from "../utils/formatDateTime";
import { formatDuration } from "../../shared/stats";
import type { QuizHistoryItem } from "../../shared/types";

export function HistoryView({
  classesVersion,
  onRetryMissed
}: {
  classesVersion: number;
  onRetryMissed: (sessionId: number) => void;
}) {
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listHistory().then(setHistory).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  const totalAttempts = history.length;
  const averageAccuracy =
    totalAttempts === 0
      ? 0
      : Math.round(
          history.reduce((sum, item) => sum + (item.correctCount / Math.max(item.totalQuestions, 1)) * 100, 0) /
            totalAttempts
        );
  const totalQuestions = history.reduce((sum, item) => sum + item.totalQuestions, 0);
  const totalMissed = history.reduce((sum, item) => sum + item.incorrectCount, 0);

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Performance record</p>
          <h2>Attempt History</h2>
        </div>
      </header>
      {error && <div className="notice error">{error}</div>}
      <div className="summary-row">
        <Metric label="Attempts" value={totalAttempts} />
        <Metric label="Avg accuracy" value={`${averageAccuracy}%`} />
        <Metric label="Questions" value={totalQuestions} />
        <Metric label="Missed" value={totalMissed} />
      </div>
      <div className="history-list">
        {history.map((attempt) => {
          const accuracy = Math.round((attempt.correctCount / Math.max(attempt.totalQuestions, 1)) * 100);
          return (
            <article className="history-item" key={attempt.id}>
              <div className="history-header">
                <div>
                  <p className="chapter-label">{attempt.className}</p>
                  <h3>{accuracy}% accuracy</h3>
                </div>
                <span className={`status-pill ${accuracy >= 80 ? "ok" : accuracy >= 60 ? "warn" : "neutral"}`}>
                  {attempt.correctCount}/{attempt.totalQuestions}
                </span>
              </div>
              <div className="history-meta">
                <span>{formatDateTime(attempt.completedAt)}</span>
                <span>{attempt.chapterNames.join(", ") || "No chapters recorded"}</span>
                <span>{attempt.mode === "single_chapter" ? "Single chapter" : "Combined chapters"}</span>
                <span>{attempt.averageSecondsPerQuestion.toFixed(1)}s avg</span>
                {attempt.parentSessionId !== null && <span>Missed-answer retry</span>}
              </div>
              {attempt.missedQuestions.length > 0 && (
                <div className="history-actions">
                  <button className="ghost-action" onClick={() => onRetryMissed(attempt.id)}>
                    Retest missed answers ({attempt.missedQuestions.length})
                  </button>
                </div>
              )}
              {attempt.missedQuestions.length > 0 ? (
                <details className="history-details">
                  <summary>{attempt.missedQuestions.length} missed question(s)</summary>
                  <div className="history-missed-list">
                    {attempt.missedQuestions.map((missed) => (
                      <div className="history-missed" key={`${attempt.id}-${missed.questionId}`}>
                        <p>{missed.prompt}</p>
                        <span>
                          Your answer: <strong>{missed.selectedAnswer}</strong>
                        </span>
                        <span>
                          Correct: <strong>{missed.correctAnswer}</strong>
                        </span>
                        <span>{formatDuration(missed.timeMs)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <div className="notice success compact-notice">No missed questions recorded.</div>
              )}
            </article>
          );
        })}
        {history.length === 0 && <p className="muted">Completed practice sessions will appear here.</p>}
      </div>
    </section>
  );
}
