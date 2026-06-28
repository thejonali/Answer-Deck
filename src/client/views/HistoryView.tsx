import { useEffect, useState } from "react";
import { listRecentHistory } from "../api";
import { formatDateTime } from "../utils/formatDateTime";
import { formatDuration } from "../../shared/stats";
import type { QuizHistoryGroup, QuizHistoryItem } from "../../shared/types";

const RECENT_GROUP_LIMIT = 8;

function accuracy(attempt: QuizHistoryItem) {
  return Math.round((attempt.correctCount / Math.max(attempt.totalQuestions, 1)) * 100);
}

function AttemptDetail({
  attempt,
  index,
  onRetryMissed
}: {
  attempt: QuizHistoryItem;
  index: number;
  onRetryMissed: (sessionId: number) => void;
}) {
  const score = accuracy(attempt);

  return (
    <article className="history-attempt-step">
      <div className="history-attempt-summary">
        <div>
          <p className="chapter-label">{index === 0 ? "Original attempt" : `Retest ${index}`}</p>
          <strong>{score}% accuracy</strong>
        </div>
        <span className={`status-pill ${score >= 80 ? "ok" : score >= 60 ? "warn" : "neutral"}`}>
          {attempt.correctCount}/{attempt.totalQuestions}
        </span>
      </div>
      <div className="history-meta">
        <span>{formatDateTime(attempt.completedAt)}</span>
        <span>{attempt.averageSecondsPerQuestion.toFixed(1)}s avg</span>
        <span>{attempt.incorrectCount} missed</span>
      </div>
      {attempt.missedQuestions.length > 0 && (
        <div className="history-actions">
          <button className="ghost-action" onClick={() => onRetryMissed(attempt.id)}>
            Retest missed answers ({attempt.missedQuestions.length})
          </button>
        </div>
      )}
      {attempt.missedQuestions.length > 0 ? (
        <details className="history-details nested-history-details">
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
}

function AttemptGroup({
  group,
  onRetryMissed
}: {
  group: QuizHistoryGroup;
  onRetryMissed: (sessionId: number) => void;
}) {
  const original = group.attempts[0];
  const latest = group.attempts.at(-1) ?? original;
  const latestAccuracy = accuracy(latest);
  const scoreProgression = group.attempts.map((attempt) => `${accuracy(attempt)}%`).join(" → ");

  return (
    <article className="history-item compact-history-item">
      <div className="history-header">
        <div>
          <p className="chapter-label">{group.className}</p>
          <h3>{group.chapterNames.join(", ") || "No chapters recorded"}</h3>
        </div>
        <span className={`status-pill ${latestAccuracy >= 80 ? "ok" : latestAccuracy >= 60 ? "warn" : "neutral"}`}>
          {latest.correctCount}/{latest.totalQuestions}
        </span>
      </div>
      <div className="history-score-progression" aria-label={`Score progression: ${scoreProgression}`}>
        {scoreProgression}
      </div>
      <div className="history-meta">
        <span>{formatDateTime(group.completedAt)}</span>
        <span>{original.totalQuestions} original questions</span>
        <span>{group.attempts.length === 1 ? "1 attempt" : `${group.attempts.length} linked attempts`}</span>
        <span>{latest.averageSecondsPerQuestion.toFixed(1)}s latest avg</span>
        <span>{latest.incorrectCount} remaining missed</span>
      </div>
      {latest.missedQuestions.length > 0 && (
        <div className="history-actions">
          <button className="ghost-action" onClick={() => onRetryMissed(latest.id)}>
            Retest missed answers ({latest.missedQuestions.length})
          </button>
        </div>
      )}
      <details className="history-details group-history-details">
        <summary>{group.attempts.length === 1 ? "View attempt details" : "View attempt chain"}</summary>
        <div className="history-attempt-chain">
          {group.attempts.map((attempt, index) => (
            <AttemptDetail key={attempt.id} attempt={attempt} index={index} onRetryMissed={onRetryMissed} />
          ))}
        </div>
      </details>
    </article>
  );
}

export function HistoryView({
  classesVersion,
  onRetryMissed,
  onViewReports
}: {
  classesVersion: number;
  onRetryMissed: (sessionId: number) => void;
  onViewReports: () => void;
}) {
  const [history, setHistory] = useState<QuizHistoryGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    listRecentHistory().then(setHistory).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Performance record</p>
          <h2>Recent Attempts</h2>
          <p className="page-description">Your latest quiz attempts, with missed-answer retests grouped together.</p>
        </div>
        <button className="ghost-action" onClick={onViewReports}>
          View performance reports
        </button>
      </header>
      {error && <div className="notice error">{error}</div>}
      <div className="history-list compact-history-list">
        {history.map((group) => (
          <AttemptGroup key={group.rootSessionId} group={group} onRetryMissed={onRetryMissed} />
        ))}
        {history.length === 0 && <p className="muted">Completed practice sessions will appear here.</p>}
      </div>
      {history.length > 0 && (
        <p className="history-limit-note muted">Showing up to {RECENT_GROUP_LIMIT} recent attempt groups.</p>
      )}
    </section>
  );
}
