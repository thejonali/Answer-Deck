import { Check, Layers, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getQuestions, listClasses } from "../api";
import { Metric } from "../components/Metric";
import { formatDuration, shuffleArray } from "../../shared/stats";
import type { StoredClass, StoredQuestion } from "../../shared/types";

type FlashcardReview = { questionId: number; remembered: boolean; timeMs: number };

export function FlashcardTool({ classesVersion }: { classesVersion: number }) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [cardLimit, setCardLimit] = useState(20);
  const [shuffle, setShuffle] = useState(true);
  const [cards, setCards] = useState<StoredQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviews, setReviews] = useState<FlashcardReview[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(performance.now());
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedChapters = selectedClass?.chapters.filter((chapter) => selectedChapterIds.includes(chapter.id)) ?? [];
  const currentCard = cards[currentIndex];

  async function startFlashcards() {
    if (!selectedClassId || selectedChapterIds.length === 0) {
      setError("Choose a class and at least one chapter.");
      return;
    }

    try {
      const loaded = await getQuestions(selectedClassId, selectedChapterIds);
      const ordered = shuffle ? shuffleArray(loaded) : loaded;
      const limited = ordered.slice(0, Math.min(cardLimit, ordered.length));
      if (limited.length === 0) {
        setError("No questions are available for this selection.");
        return;
      }
      setCards(limited);
      setCurrentIndex(0);
      setReviews([]);
      setIsRevealed(false);
      setCardStartedAt(performance.now());
      setCompleted(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load flashcards.");
    }
  }

  function recordReview(remembered: boolean) {
    if (!currentCard || !isRevealed) {
      return;
    }

    const nextReviews = [
      ...reviews,
      {
        questionId: currentCard.id,
        remembered,
        timeMs: Math.round(performance.now() - cardStartedAt)
      }
    ];
    setReviews(nextReviews);

    if (currentIndex + 1 >= cards.length) {
      setCompleted(true);
      return;
    }

    setCurrentIndex((value) => value + 1);
    setIsRevealed(false);
    setCardStartedAt(performance.now());
  }

  function resetFlashcards() {
    setCards([]);
    setCurrentIndex(0);
    setReviews([]);
    setIsRevealed(false);
    setCompleted(false);
    setError(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentCard || completed) {
        return;
      }
      if (event.key === " " && !isRevealed) {
        event.preventDefault();
        setIsRevealed(true);
      }
      if (event.key === "1" && isRevealed) {
        recordReview(false);
      }
      if (event.key === "2" && isRevealed) {
        recordReview(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (completed) {
    const rememberedCount = reviews.filter((review) => review.remembered).length;
    const missedReviews = reviews.filter((review) => !review.remembered);
    const percentage = reviews.length === 0 ? 0 : Math.round((rememberedCount / reviews.length) * 100);
    const totalTimeMs = reviews.reduce((sum, review) => sum + review.timeMs, 0);
    const missedCards = missedReviews.map((review) => ({
      review,
      question: cards.find((card) => card.id === review.questionId)!
    }));

    return (
      <section className="tool-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Flashcard results</p>
            <h2>{percentage}% remembered</h2>
          </div>
          <button className="primary-action" onClick={resetFlashcards}>
            <RotateCcw size={18} /> New flashcards
          </button>
        </header>

        <div className="summary-row">
          <Metric label="Remembered" value={rememberedCount} />
          <Metric label="Needs review" value={missedReviews.length} />
          <Metric label="Cards" value={reviews.length} />
          <Metric label="Total time" value={formatDuration(totalTimeMs)} />
        </div>

        <section className="panel">
          <div className="section-title">
            <Layers size={18} />
            <h3>Cards to revisit</h3>
          </div>
          {missedCards.length === 0 ? (
            <p className="muted">No missed flashcards in this run.</p>
          ) : (
            <div className="missed-list">
              {missedCards.map(({ review, question }) => {
                const correct = question.choices.find((choice) => choice.isCorrect);
                return (
                  <article className="missed-item" key={question.id}>
                    <p className="chapter-label">{question.chapterName}</p>
                    <h4>{question.prompt}</h4>
                    <div className="missed-answers">
                      <span>Correct: {correct?.text ?? "No correct answer saved"}</span>
                      <span>Time: {formatDuration(review.timeMs)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Flashcard review</p>
          <h2>Review with flashcards</h2>
        </div>
        {cards.length === 0 && (
          <button className="primary-action" onClick={startFlashcards}>
            <Layers size={18} /> Start
          </button>
        )}
      </header>

      {error && <div className="notice error">{error}</div>}

      {cards.length === 0 ? (
        <section className="panel quiz-setup">
          <div className="field-grid">
            <label>
              Class
              <select
                value={selectedClassId ?? ""}
                onChange={(event) => {
                  setSelectedClassId(Number(event.target.value) || null);
                  setSelectedChapterIds([]);
                }}
              >
                <option value="">Choose class</option>
                {classes.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Card limit
              <input
                type="number"
                min={1}
                value={cardLimit}
                onChange={(event) => setCardLimit(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="chapter-picker">
            {selectedClass?.chapters.map((chapter) => (
              <label className="chapter-option" key={chapter.id}>
                <input
                  type="checkbox"
                  checked={selectedChapterIds.includes(chapter.id)}
                  onChange={(event) => {
                    setSelectedChapterIds((current) =>
                      event.target.checked
                        ? [...current, chapter.id]
                        : current.filter((chapterId) => chapterId !== chapter.id)
                    );
                  }}
                />
                <span>{chapter.name}</span>
                <em>{chapter.questionCount}</em>
              </label>
            ))}
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
            Shuffle cards
          </label>
        </section>
      ) : (
        <section className="flashcard-stage">
          <div className="quiz-progress">
            <span>
              {currentIndex + 1} / {cards.length}
            </span>
            <progress value={currentIndex + 1} max={cards.length} />
          </div>
          <article className={`flashcard-card ${isRevealed ? "is-revealed" : ""}`}>
            <div className="flashcard-face">
              <p className="chapter-label">{currentCard.chapterName}</p>
              <h3>{currentCard.prompt}</h3>
            </div>

            {isRevealed ? (
              <div className="flashcard-answer">
                <span className="status-pill ok">Correct answer</span>
                <strong>{currentCard.choices.find((choice) => choice.isCorrect)?.text ?? "No correct answer saved"}</strong>
                <div className="flashcard-choice-list">
                  {currentCard.choices.map((choice) => (
                    <span className={choice.isCorrect ? "correct" : ""} key={choice.id}>
                      {choice.label}. {choice.text}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flashcard-answer hidden-answer">
                <span>Answer hidden</span>
              </div>
            )}

            <div className="flashcard-actions">
              {isRevealed ? (
                <>
                  <button className="ghost-action" onClick={() => recordReview(false)}>
                    <X size={18} /> Missed
                  </button>
                  <button className="primary-action" onClick={() => recordReview(true)}>
                    <Check size={18} /> Got it
                  </button>
                </>
              ) : (
                <button className="primary-action" onClick={() => setIsRevealed(true)}>
                  Reveal answer
                </button>
              )}
            </div>
          </article>
        </section>
      )}
    </section>
  );
}

