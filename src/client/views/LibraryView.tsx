import { Check, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteQuestion as deleteStoredQuestion, getQuestions, listClasses, renameChapter, renameClass, updateQuestion as updateStoredQuestion } from "../api";
import { Metric } from "../components/Metric";
import { questionInputSchema } from "../../shared/schemas";
import type { ChoiceInput, QuestionInput, StoredClass, StoredQuestion } from "../../shared/types";

type EditableStoredQuestion = StoredQuestion & { draftChoices: ChoiceInput[] };

export function LibraryView({ classesVersion }: { classesVersion: number }) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [classDraft, setClassDraft] = useState("");
  const [chapterDraft, setChapterDraft] = useState("");
  const [questions, setQuestions] = useState<EditableStoredQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedChapter = selectedClass?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;
  const totalQuestions = classes.reduce(
    (sum, item) => sum + item.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questionCount, 0),
    0
  );

  useEffect(() => {
    if (!selectedClass) {
      setClassDraft("");
      return;
    }
    setClassDraft(selectedClass.name);
  }, [selectedClass?.id, selectedClass?.name]);

  useEffect(() => {
    if (!selectedChapter) {
      setChapterDraft("");
      setQuestions([]);
      return;
    }
    setChapterDraft(selectedChapter.name);
    getQuestions(selectedChapter.classId, [selectedChapter.id])
      .then((loaded) =>
        setQuestions(
          loaded.map((question) => ({
            ...question,
            draftChoices: question.choices.map((choice) => ({
              label: choice.label,
              text: choice.text,
              isCorrect: choice.isCorrect
            }))
          }))
        )
      )
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load questions."));
  }, [selectedChapter?.id]);

  async function refreshClasses() {
    setClasses(await listClasses());
  }

  async function handleRenameClass() {
    if (!selectedClass || !classDraft.trim()) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await renameClass(selectedClass.id, classDraft.trim());
      await refreshClasses();
      setMessage("Class name updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rename class.");
    }
  }

  async function handleRenameChapter() {
    if (!selectedChapter || !chapterDraft.trim()) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await renameChapter(selectedChapter.id, chapterDraft.trim());
      await refreshClasses();
      setMessage("Chapter name updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rename chapter.");
    }
  }

  async function handleSaveQuestion(question: EditableStoredQuestion) {
    setError(null);
    setMessage(null);
    const payload: QuestionInput = {
      sourceQuestionNumber: question.sourceQuestionNumber,
      type: question.type,
      prompt: question.prompt,
      choices: question.draftChoices,
      sourceStatus: question.sourceStatus,
      sourceSelectedAnswer: question.sourceSelectedAnswer,
      sourceFileName: null,
      rawBlock: question.prompt
    };
    const parsed = questionInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    try {
      await updateStoredQuestion(question.id, parsed.data);
      setMessage("Question updated.");
      if (selectedClassId && selectedChapterId) {
        const loaded = await getQuestions(selectedClassId, [selectedChapterId]);
        setQuestions(
          loaded.map((item) => ({
            ...item,
            draftChoices: item.choices.map((choice) => ({
              label: choice.label,
              text: choice.text,
              isCorrect: choice.isCorrect
            }))
          }))
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save question.");
    }
  }

  async function handleDeleteQuestion(questionId: number) {
    if (!window.confirm("Delete this question from the library?")) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await deleteStoredQuestion(questionId);
      setQuestions((current) => current.filter((question) => question.id !== questionId));
      await refreshClasses();
      setMessage("Question deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete question.");
    }
  }

  function updateLibraryQuestion(
    questionId: number,
    updater: (question: EditableStoredQuestion) => EditableStoredQuestion
  ) {
    setQuestions((current) => current.map((question) => (question.id === questionId ? updater(question) : question)));
  }

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Database</p>
          <h2>Question Library</h2>
        </div>
      </header>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <div className="summary-row">
        <Metric label="Classes" value={classes.length} />
        <Metric label="Questions" value={totalQuestions} />
      </div>
      <section className="panel library-editor">
        <div className="field-grid">
          <label>
            Class
            <select
              value={selectedClassId ?? ""}
              onChange={(event) => {
                setSelectedClassId(Number(event.target.value) || null);
                setSelectedChapterId(null);
                setQuestions([]);
                setMessage(null);
              }}
            >
              <option value="">Choose class to edit</option>
              {classes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chapter
            <select
              value={selectedChapterId ?? ""}
              disabled={!selectedClass}
              onChange={(event) => {
                setSelectedChapterId(Number(event.target.value) || null);
                setMessage(null);
              }}
            >
              <option value="">Choose chapter to edit</option>
              {selectedClass?.chapters.map((chapter) => (
                <option value={chapter.id} key={chapter.id}>
                  {chapter.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedClass && (
          <div className="edit-row">
            <label>
              Rename class
              <input value={classDraft} onChange={(event) => setClassDraft(event.target.value)} />
            </label>
            <button className="ghost-action" onClick={handleRenameClass} disabled={!classDraft.trim()}>
              <Save size={16} /> Save Class
            </button>
          </div>
        )}

        {selectedChapter && (
          <div className="edit-row">
            <label>
              Rename chapter
              <input value={chapterDraft} onChange={(event) => setChapterDraft(event.target.value)} />
            </label>
            <button className="ghost-action" onClick={handleRenameChapter} disabled={!chapterDraft.trim()}>
              <Save size={16} /> Save Chapter
            </button>
          </div>
        )}
      </section>

      <div className="library-list">
        {questions.map((question) => (
          <QuestionLibraryEditor
            key={question.id}
            question={question}
            onChange={(updater) => updateLibraryQuestion(question.id, updater)}
            onSave={() => handleSaveQuestion(question)}
            onDelete={() => handleDeleteQuestion(question.id)}
          />
        ))}
        {selectedChapter && questions.length === 0 && <p className="muted">No questions in this chapter.</p>}
        {classes.length === 0 && <p className="muted">No saved questions yet.</p>}
      </div>
    </section>
  );
}


function QuestionLibraryEditor({
  question,
  onChange,
  onSave,
  onDelete
}: {
  question: EditableStoredQuestion;
  onChange: (updater: (question: EditableStoredQuestion) => EditableStoredQuestion) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  function updateChoice(index: number, patch: Partial<ChoiceInput>) {
    onChange((current) => ({
      ...current,
      draftChoices: current.draftChoices.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, ...patch } : choice
      )
    }));
  }

  function markCorrect(index: number) {
    onChange((current) => ({
      ...current,
      draftChoices: current.draftChoices.map((choice, choiceIndex) => ({
        ...choice,
        isCorrect: choiceIndex === index
      }))
    }));
  }

  function addChoice() {
    onChange((current) => ({
      ...current,
      draftChoices: [
        ...current.draftChoices,
        { label: String.fromCharCode(65 + current.draftChoices.length), text: "", isCorrect: false }
      ]
    }));
  }

  function removeChoice(index: number) {
    onChange((current) => ({
      ...current,
      draftChoices: current.draftChoices.filter((_, choiceIndex) => choiceIndex !== index)
    }));
  }

  return (
    <article className="review-item library-question-editor">
      <div className="review-topline">
        <div>
          <strong>Question {question.sourceQuestionNumber ?? question.id}</strong>
          <span className="status-pill neutral">{question.type === "true_false" ? "True/False" : "Multiple choice"}</span>
        </div>
        <div className="inline-actions">
          <button className="ghost-action" onClick={onSave}>
            <Save size={16} /> Save
          </button>
          <button className="danger-action" onClick={onDelete}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
      <label>
        Prompt
        <textarea
          className="prompt-editor"
          value={question.prompt}
          onChange={(event) => onChange((current) => ({ ...current, prompt: event.target.value }))}
        />
      </label>
      <div className="field-grid compact">
        <label>
          Type
          <select
            value={question.type}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                type: event.target.value as StoredQuestion["type"],
                draftChoices:
                  event.target.value === "true_false"
                    ? [
                        { label: "A", text: "True", isCorrect: current.draftChoices[0]?.isCorrect ?? false },
                        { label: "B", text: "False", isCorrect: current.draftChoices[1]?.isCorrect ?? true }
                      ]
                    : current.draftChoices
              }))
            }
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="true_false">True/False</option>
          </select>
        </label>
        <label>
          Source selected
          <input
            value={question.sourceSelectedAnswer ?? ""}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                sourceSelectedAnswer: event.target.value.trim() || null
              }))
            }
          />
        </label>
      </div>
      <div className="choice-editor-list">
        {question.draftChoices.map((choice, index) => (
          <div className="choice-editor library-choice-editor" key={`${choice.label}-${index}`}>
            <button
              className={`icon-toggle ${choice.isCorrect ? "selected" : ""}`}
              onClick={() => markCorrect(index)}
              title="Mark correct answer"
              type="button"
            >
              <Check size={16} />
            </button>
            <input
              className="choice-label"
              value={choice.label}
              onChange={(event) => updateChoice(index, { label: event.target.value })}
              aria-label="Choice label"
            />
            <input
              value={choice.text}
              onChange={(event) => updateChoice(index, { text: event.target.value })}
              aria-label={`Choice ${choice.label}`}
            />
            {question.type === "multiple_choice" && (
              <button className="icon-toggle danger-icon" onClick={() => removeChoice(index)} title="Remove choice">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {question.type === "multiple_choice" && (
          <button className="ghost-action add-choice" onClick={addChoice} type="button">
            Add choice
          </button>
        )}
      </div>
    </article>
  );
}

