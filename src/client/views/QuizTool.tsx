import { BarChart3, Check, ChevronRight, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getMissedQuestionQuiz, getQuestions, listClasses, saveQuizSession } from "../api";
import { Metric } from "../components/Metric";
import { calculateQuizResult, formatDuration, shuffleArray } from "../../shared/stats";
import type { QuizAnswerInput, StoredChapter, StoredClass, StoredQuestion } from "../../shared/types";

const quickQuestionLimits = [10, 20, 30, 50];

export function QuizTool({
  classesVersion,
  onSessionSaved,
  retryRequest,
  onRetryHandled
}: {
  classesVersion: number;
  onSessionSaved: () => void;
  retryRequest: { sessionId: number; requestId: number } | null;
  onRetryHandled: () => void;
}) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [includeAllQuestions, setIncludeAllQuestions] = useState(true);
  const [questionLimit, setQuestionLimit] = useState(20);
  const [shuffle, setShuffle] = useState(true);
  const [scrambleAnswers, setScrambleAnswers] = useState(true);
  const [reviewAtEnd, setReviewAtEnd] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<StoredQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswerInput[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState(performance.now());
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [parentSessionId, setParentSessionId] = useState<number | null>(null);
  const [savedSessionId, setSavedSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledRetryRequest = useRef<number | null>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  useEffect(() => {
    if (!retryRequest || handledRetryRequest.current === retryRequest.requestId) {
      return;
    }
    handledRetryRequest.current = retryRequest.requestId;
    void startMissedQuiz(retryRequest.sessionId).finally(onRetryHandled);
  }, [retryRequest]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedChapters = selectedClass?.chapters.filter((chapter) => selectedChapterIds.includes(chapter.id)) ?? [];
  const selectedQuestionCount = selectedChapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
  const normalizedQuestionLimit = Math.max(1, Math.floor(questionLimit) || 20);
  const sessionQuestionCount = includeAllQuestions
    ? selectedQuestionCount
    : Math.min(normalizedQuestionLimit, selectedQuestionCount);
  const currentQuestion = quizQuestions[currentIndex];
  const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);

  async function startQuiz() {
    if (!selectedClassId || selectedChapterIds.length === 0) {
      setError("Choose a class and at least one chapter.");
      return;
    }
    try {
      const loaded = await getQuestions(selectedClassId, selectedChapterIds);
      const ordered = shuffle ? shuffleArray(loaded) : loaded;
      const limited = includeAllQuestions ? ordered : ordered.slice(0, Math.min(normalizedQuestionLimit, ordered.length));
      const answerSeed = Date.now();
      const prepared = scrambleAnswers
        ? limited.map((question, index) => ({
            ...question,
            choices: shuffleArray(question.choices, answerSeed + question.id + index)
          }))
        : limited;
      if (limited.length === 0) {
        setError("No questions are available for this selection.");
        return;
      }
      setQuizQuestions(prepared);
      setCurrentIndex(0);
      setAnswers([]);
      setSelectedChoiceId(null);
      setStartedAt(new Date().toISOString());
      setCompleted(false);
      setParentSessionId(null);
      setSavedSessionId(null);
      setQuestionStartedAt(performance.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load quiz questions.");
    }
  }

  function endQuiz() {
    setQuizQuestions([]);
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedChoiceId(null);
    setStartedAt(null);
    setParentSessionId(null);
    setSavedSessionId(null);
  }

  async function startMissedQuiz(sessionId: number) {
    try {
      const retry = await getMissedQuestionQuiz(sessionId);
      if (retry.questions.length === 0) {
        setError("That attempt has no missed questions to retry.");
        return;
      }
      const answerSeed = Date.now();
      const prepared = scrambleAnswers
        ? retry.questions.map((question, index) => ({
            ...question,
            choices: shuffleArray(question.choices, answerSeed + question.id + index)
          }))
        : retry.questions;
      setSelectedClassId(retry.classId);
      setSelectedChapterIds(retry.chapterIds);
      setQuizQuestions(prepared);
      setCurrentIndex(0);
      setAnswers([]);
      setSelectedChoiceId(null);
      setStartedAt(new Date().toISOString());
      setCompleted(false);
      setParentSessionId(retry.sourceSessionId);
      setSavedSessionId(null);
      setQuestionStartedAt(performance.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load missed questions.");
    }
  }

  async function finishQuiz(finalAnswers: QuizAnswerInput[]) {
    if (!selectedClassId || !startedAt) {
      return;
    }
    setCompleted(true);
    setSavedSessionId(null);
    try {
      const saved = await saveQuizSession({
        classId: selectedClassId,
        chapterIds: selectedChapterIds,
        mode: selectedChapterIds.length === 1 ? "single_chapter" : "combined_chapters",
        parentSessionId,
        startedAt,
        completedAt: new Date().toISOString(),
        answers: finalAnswers
      });
      setSavedSessionId(saved.sessionId);
      onSessionSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save quiz.");
    }
  }

  function answerQuestion(choiceId: number) {
    if (!currentQuestion || currentAnswer) {
      return;
    }
    const correctChoice = currentQuestion.choices.find((choice) => choice.isCorrect);
    if (!correctChoice) {
      setError("This question has no correct answer saved.");
      return;
    }
    const answer: QuizAnswerInput = {
      questionId: currentQuestion.id,
      selectedChoiceId: choiceId,
      correctChoiceId: correctChoice.id,
      isCorrect: choiceId === correctChoice.id,
      timeMs: Math.round(performance.now() - questionStartedAt)
    };
    setSelectedChoiceId(choiceId);
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    if (!reviewAtEnd) {
      return;
    }

    if (currentIndex + 1 >= quizQuestions.length) {
      void finishQuiz(nextAnswers);
      return;
    }

    setCurrentIndex((value) => value + 1);
    setSelectedChoiceId(null);
    setQuestionStartedAt(performance.now());
  }

  function nextQuestion() {
    if (currentIndex + 1 >= quizQuestions.length) {
      void finishQuiz(answers);
      return;
    }
    setCurrentIndex((value) => value + 1);
    setSelectedChoiceId(null);
    setQuestionStartedAt(performance.now());
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentQuestion || completed) {
        return;
      }
      const numeric = Number(event.key);
      if (numeric >= 1 && numeric <= currentQuestion.choices.length && !currentAnswer) {
        answerQuestion(currentQuestion.choices[numeric - 1].id);
      }
      if (event.key === "Enter" && currentAnswer) {
        nextQuestion();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (completed) {
    return (
      <ResultsView
        answers={answers}
        questions={quizQuestions}
        chapters={selectedChapters}
        sessionId={savedSessionId}
        onRetryMissed={startMissedQuiz}
        onRestart={() => {
          setCompleted(false);
          setQuizQuestions([]);
          setAnswers([]);
          setParentSessionId(null);
          setSavedSessionId(null);
        }}
      />
    );
  }

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Practice session</p>
          <h2>Build a practice session</h2>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}

      {quizQuestions.length === 0 ? (
        <section className="panel quiz-setup guided-setup">
          <div className="setup-builder">
            <div className="setup-main">
              <div className="setup-control-row">
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
                <div className="count-control">
                  <span className="control-label">Question count</span>
                  <div className="segmented-control count-mode" role="group" aria-label="Question count">
                    <button
                      type="button"
                      className={includeAllQuestions ? "active" : ""}
                      aria-pressed={includeAllQuestions}
                      onClick={() => setIncludeAllQuestions(true)}
                    >
                      All questions
                    </button>
                    <button
                      type="button"
                      className={!includeAllQuestions ? "active" : ""}
                      aria-pressed={!includeAllQuestions}
                      onClick={() => setIncludeAllQuestions(false)}
                    >
                      Custom limit
                    </button>
                  </div>
                  {!includeAllQuestions && (
                    <div className="limit-control">
                      <label>
                        Limit
                        <input
                          type="number"
                          min={1}
                          max={selectedQuestionCount || undefined}
                          value={questionLimit}
                          onChange={(event) => setQuestionLimit(Number(event.target.value))}
                        />
                      </label>
                      <div className="quick-limit-row" aria-label="Quick question presets">
                        {quickQuestionLimits.map((limit) => (
                          <button
                            type="button"
                            className={normalizedQuestionLimit === limit ? "active" : ""}
                            key={limit}
                            onClick={() => setQuestionLimit(limit)}
                          >
                            {limit}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="chapter-section">
                <span className="control-label">Chapters</span>
                <div className="chapter-picker">
                  {selectedClass?.chapters.map((chapter) => {
                    const isSelected = selectedChapterIds.includes(chapter.id);
                    return (
                      <label className={`chapter-option ${isSelected ? "selected" : ""}`} key={chapter.id}>
                        <input
                          type="checkbox"
                          checked={isSelected}
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
                    );
                  })}
                </div>
                {!selectedClass && <p className="muted">Choose a class to select chapters.</p>}
              </div>
            </div>

            <aside className="session-summary-panel">
              <h3>Session summary</h3>
              <div className="summary-stats compact-summary">
                <Metric label="Questions" value={sessionQuestionCount} />
                <Metric
                  label={includeAllQuestions ? "Chapters" : "Available"}
                  value={includeAllQuestions ? selectedChapters.length : selectedQuestionCount}
                />
              </div>
              <div className="setup-meter" aria-hidden="true">
                <span
                  style={{
                    width:
                      selectedQuestionCount === 0
                        ? "0%"
                        : `${Math.max(3, Math.min(100, (sessionQuestionCount / selectedQuestionCount) * 100))}%`
                  }}
                />
              </div>
              <label className="summary-toggle">
                <span>
                  <strong>Shuffle questions</strong>
                  <em>
                    {includeAllQuestions
                      ? "Randomize question order"
                      : `Draw ${sessionQuestionCount} questions from selected chapters`}
                  </em>
                </span>
                <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
              </label>
              <label className="summary-toggle">
                <span>
                  <strong>Scramble answers</strong>
                  <em>Randomize answer order</em>
                </span>
                <input
                  type="checkbox"
                  checked={scrambleAnswers}
                  onChange={(event) => setScrambleAnswers(event.target.checked)}
                />
              </label>
              <label className="summary-toggle">
                <span>
                  <strong>Review at end</strong>
                  <em>Advance immediately and hide feedback until results</em>
                </span>
                <input
                  type="checkbox"
                  checked={reviewAtEnd}
                  onChange={(event) => setReviewAtEnd(event.target.checked)}
                />
              </label>
              <button className="primary-action setup-start-action" onClick={startQuiz}>
                <Play size={18} /> Start quiz
              </button>
            </aside>
          </div>
        </section>
      ) : (
        <section className="quiz-stage">
          <div className="quiz-toolbar">
            <div className="quiz-progress">
              <span>{currentIndex + 1} / {quizQuestions.length}</span>
              <progress aria-label="Quiz progress" value={currentIndex + 1} max={quizQuestions.length} />
            </div>
            <button className="quiz-end-action" onClick={endQuiz}>End quiz</button>
          </div>
          <article className="question-card">
            <p className="chapter-label">{currentQuestion.chapterName}</p>
            <h3>{currentQuestion.prompt}</h3>
            <div className="answer-grid">
              {currentQuestion.choices.map((choice, index) => {
                const isSelected = selectedChoiceId === choice.id;
                const isAnswered = Boolean(currentAnswer);
                const className = [
                  "answer-button",
                  isSelected ? "selected" : "",
                  isAnswered && choice.isCorrect ? "correct" : "",
                  isAnswered && isSelected && !choice.isCorrect ? "wrong" : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={choice.id}
                    className={className}
                    onClick={() => answerQuestion(choice.id)}
                    disabled={isAnswered}
                  >
                    <span>{index + 1}</span>
                    {choice.text}
                  </button>
                );
              })}
            </div>
            {currentAnswer && !reviewAtEnd && (
              <div className={`feedback ${currentAnswer.isCorrect ? "ok" : "bad"}`}>
                {currentAnswer.isCorrect ? <Check size={18} /> : <X size={18} />}
                {currentAnswer.isCorrect ? "Correct" : "Incorrect"}
                <button className="primary-action" onClick={nextQuestion}>
                  {currentIndex + 1 === quizQuestions.length ? "Finish" : "Next"} <ChevronRight size={18} />
                </button>
              </div>
            )}
          </article>
        </section>
      )}
    </section>
  );
}


function ResultsView({
  answers,
  questions,
  chapters,
  sessionId,
  onRetryMissed,
  onRestart
}: {
  answers: QuizAnswerInput[];
  questions: StoredQuestion[];
  chapters: StoredChapter[];
  sessionId: number | null;
  onRetryMissed: (sessionId: number) => void;
  onRestart: () => void;
}) {
  const result = calculateQuizResult(answers);
  const missed = answers
    .filter((answer) => !answer.isCorrect)
    .map((answer) => {
      const question = questions.find((item) => item.id === answer.questionId)!;
      return {
        answer,
        question,
        selected: question.choices.find((choice) => choice.id === answer.selectedChoiceId)!,
        correct: question.choices.find((choice) => choice.id === answer.correctChoiceId)!
      };
    });
  const chapterBars = chapters.map((chapter) => {
    const chapterQuestionIds = new Set(
      questions.filter((question) => question.chapterId === chapter.id).map((question) => question.id)
    );
    const chapterAnswers = answers.filter((answer) => chapterQuestionIds.has(answer.questionId));
    const correct = chapterAnswers.filter((answer) => answer.isCorrect).length;
    return {
      name: chapter.name,
      accuracy: chapterAnswers.length === 0 ? 0 : Math.round((correct / chapterAnswers.length) * 100)
    };
  });
  const pieData = [
    { name: "Correct", value: result.correctCount },
    { name: "Incorrect", value: result.incorrectCount }
  ];

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Session results</p>
          <h2>{result.percentage}% accuracy</h2>
        </div>
        <div className="inline-actions">
          {missed.length > 0 && (
            <button
              className="primary-action"
              onClick={() => sessionId !== null && void onRetryMissed(sessionId)}
              disabled={sessionId === null}
            >
              <RotateCcw size={18} /> {sessionId === null ? "Saving attempt..." : `Retest missed answers (${missed.length})`}
            </button>
          )}
          <button className="ghost-action" onClick={onRestart}>
            <Play size={18} /> New quiz
          </button>
        </div>
      </header>
      <div className="summary-row">
        <Metric label="Correct" value={result.correctCount} />
        <Metric label="Incorrect" value={result.incorrectCount} />
        <Metric label="Total time" value={formatDuration(result.totalTimeMs)} />
        <Metric label="Avg / question" value={formatDuration(result.averageTimeMs)} />
      </div>
      <div className="chart-grid">
        <section className="panel chart-panel">
          <h3>Score split</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} innerRadius={62} outerRadius={92} dataKey="value" paddingAngle={4}>
                <Cell fill="#1f9d68" />
                <Cell fill="#d84a4a" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </section>
        <section className="panel chart-panel">
          <h3>Accuracy by chapter</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chapterBars}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="accuracy" fill="#2e6de8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <section className="missed-list">
        <div className="section-title">
          <BarChart3 size={18} />
          <h3>Missed questions</h3>
        </div>
        {missed.length === 0 && <div className="notice success">No missed questions in this quiz.</div>}
        {missed.map(({ answer, question, selected, correct }) => (
          <article className="missed-item" key={answer.questionId}>
            <p className="chapter-label">{question.chapterName}</p>
            <h4>{question.prompt}</h4>
            <div className="missed-answers">
              <span>
                Your answer: <strong>{selected.text}</strong>
              </span>
              <span>
                Correct answer: <strong>{correct.text}</strong>
              </span>
              <span>Time: {formatDuration(answer.timeMs)}</span>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
