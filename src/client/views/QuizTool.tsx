import { BarChart3, Check, ChevronRight, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getQuestions, listClasses, saveQuizSession } from "../api";
import { Metric } from "../components/Metric";
import { calculateQuizResult, formatDuration, shuffleArray } from "../../shared/stats";
import type { QuizAnswerInput, StoredChapter, StoredClass, StoredQuestion } from "../../shared/types";

export function QuizTool({
  classesVersion,
  onSessionSaved
}: {
  classesVersion: number;
  onSessionSaved: () => void;
}) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [questionLimit, setQuestionLimit] = useState(20);
  const [shuffle, setShuffle] = useState(true);
  const [quizQuestions, setQuizQuestions] = useState<StoredQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswerInput[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState(performance.now());
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedChapters = selectedClass?.chapters.filter((chapter) => selectedChapterIds.includes(chapter.id)) ?? [];
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
      const limited = ordered.slice(0, Math.min(questionLimit, loaded.length));
      if (limited.length === 0) {
        setError("No questions are available for this selection.");
        return;
      }
      setQuizQuestions(limited);
      setCurrentIndex(0);
      setAnswers([]);
      setSelectedChoiceId(null);
      setStartedAt(new Date().toISOString());
      setCompleted(false);
      setQuestionStartedAt(performance.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load quiz questions.");
    }
  }

  async function finishQuiz(finalAnswers: QuizAnswerInput[]) {
    if (!selectedClassId || !startedAt) {
      return;
    }
    setCompleted(true);
    await saveQuizSession({
      classId: selectedClassId,
      chapterIds: selectedChapterIds,
      mode: selectedChapterIds.length === 1 ? "single_chapter" : "combined_chapters",
      startedAt,
      completedAt: new Date().toISOString(),
      answers: finalAnswers
    })
      .then(onSessionSaved)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to save quiz."));
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
    setAnswers((current) => [...current, answer]);
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
        onRestart={() => {
          setCompleted(false);
          setQuizQuestions([]);
          setAnswers([]);
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
        {quizQuestions.length === 0 && (
          <button className="primary-action" onClick={startQuiz}>
            <Play size={18} /> Start
          </button>
        )}
      </header>

      {error && <div className="notice error">{error}</div>}

      {quizQuestions.length === 0 ? (
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
              Question limit
              <input
                type="number"
                min={1}
                value={questionLimit}
                onChange={(event) => setQuestionLimit(Number(event.target.value))}
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
            Shuffle questions
          </label>
        </section>
      ) : (
        <section className="quiz-stage">
          <div className="quiz-progress">
            <span>
              {currentIndex + 1} / {quizQuestions.length}
            </span>
            <progress value={currentIndex + 1} max={quizQuestions.length} />
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
            {currentAnswer && (
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
  onRestart
}: {
  answers: QuizAnswerInput[];
  questions: StoredQuestion[];
  chapters: StoredChapter[];
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
        <button className="primary-action" onClick={onRestart}>
          <RotateCcw size={18} /> New quiz
        </button>
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

