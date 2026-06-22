import { Check, Clipboard, Download, FileText, ListChecks, RotateCcw, Save, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { listClasses, previewImport, saveImport } from "../api";
import { Metric } from "../components/Metric";
import { questionInputSchema } from "../../shared/schemas";
import { parseStructuredQuestionJson, structuredJsonTemplate } from "../../shared/structuredJson";
import type { ChoiceInput, ImportPreview, ParsedQuestion, QuestionInput, StoredClass } from "../../shared/types";

type EditableQuestion = ParsedQuestion & { localId: string; skipped?: boolean };
type DestinationMode = "existing" | "new";
type ImportFormat = "graded_quiz" | "structured_json";

const gradedQuizPlaceholder = `Paste a graded quiz export here, or upload one of the .txt files.`;
const structuredJsonPlaceholder = `Paste structured JSON here, or insert the standard template.`;

export function ImportTool({
  classesVersion,
  onSaved
}: {
  classesVersion: number;
  onSaved: () => void;
}) {
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [classMode, setClassMode] = useState<DestinationMode>("existing");
  const [chapterMode, setChapterMode] = useState<DestinationMode>("existing");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [newClassName, setNewClassName] = useState("");
  const [newChapterName, setNewChapterName] = useState("");
  const [importFormat, setImportFormat] = useState<ImportFormat>("graded_quiz");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    listClasses().then(setClasses).catch((caught) => setError(String(caught)));
  }, [classesVersion]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const selectedChapter = selectedClass?.chapters.find((item) => item.id === selectedChapterId) ?? null;
  const className = classMode === "existing" ? selectedClass?.name ?? "" : newClassName.trim();
  const chapterName = chapterMode === "existing" ? selectedChapter?.name ?? "" : newChapterName.trim();
  const canPreview = Boolean(className && chapterName && rawInput.trim());

  useEffect(() => {
    setPreview(null);
    setQuestions([]);
    setMessage(null);
  }, [className, chapterName]);

  const inputPlaceholder = importFormat === "graded_quiz" ? gradedQuizPlaceholder : structuredJsonPlaceholder;
  const acceptedFileTypes =
    importFormat === "graded_quiz" ? ".txt,text/plain" : ".json,application/json,text/plain";

  async function handlePreview() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!className || !chapterName) {
        throw new Error("Choose an existing class/chapter or create a new destination before previewing.");
      }
      const result =
        importFormat === "graded_quiz"
          ? await previewImport({ className, chapterName, sourceFileName, rawInput })
          : parseStructuredQuestionJson({ className, chapterName, sourceFileName, rawInput });
      setPreview(result);
      setQuestions(
        [...result.ready, ...result.needsCorrection].map((question, index) => ({
          ...question,
          localId: `${question.sourceQuestionNumber ?? "unknown"}-${index}`
        }))
      );
      setMessage(
        `${result.ready.length} ready, ${result.needsCorrection.length} need correction, ${result.skipped.length} skipped.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to preview import.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setSourceFileName(file.name);
    setRawInput(await file.text());
  }

  async function handleCopyTemplate() {
    try {
      await navigator.clipboard.writeText(structuredJsonTemplate);
      setMessage("Structured JSON template copied.");
      setError(null);
    } catch {
      setError("Unable to copy template. Insert the template and copy it from the input instead.");
    }
  }

  function handleDownloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([structuredJsonTemplate], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "answerdeck-import-template.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!className || !chapterName) {
        throw new Error("Choose an existing class/chapter or create a new destination before saving.");
      }
      const validQuestions: QuestionInput[] = [];
      const skippedRawBlocks: string[] = [...(preview?.skipped.map((item) => item.rawBlock) ?? [])];

      for (const question of questions) {
        if (question.skipped) {
          skippedRawBlocks.push(question.rawBlock);
          continue;
        }
        const parsed = questionInputSchema.safeParse(toQuestionInput(question));
        if (!parsed.success) {
          throw new Error(
            `Question ${question.sourceQuestionNumber ?? ""} still needs correction: ${parsed.error.issues
              .map((issue) => issue.message)
              .join(" ")}`
          );
        }
        validQuestions.push(parsed.data);
      }

      const result = await saveImport({
        className,
        chapterName,
        sourceFileName,
        rawInput,
        questions: validQuestions,
        skippedRawBlocks
      });
      setMessage(
        `Saved ${result.savedCount} questions. Skipped ${result.skippedCount}, including ${result.duplicateCount} duplicates.`
      );
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save import.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateQuestion(localId: string, updater: (question: EditableQuestion) => EditableQuestion) {
    setQuestions((current) =>
      current.map((question) => (question.localId === localId ? updater(question) : question))
    );
  }

  return (
    <section className="tool-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Question intake</p>
          <h2>Import question set</h2>
        </div>
        <button className="primary-action" onClick={handlePreview} disabled={isBusy || !canPreview}>
          <ListChecks size={18} /> Preview
        </button>
      </header>

      <div className="import-grid">
        <section className="panel">
          <div className="destination-grid">
            <fieldset className="destination-fieldset">
              <legend>Class destination</legend>
              <div className="segmented-control">
                <button
                  type="button"
                  className={classMode === "existing" ? "active" : ""}
                  onClick={() => {
                    setClassMode("existing");
                    setPreview(null);
                  }}
                >
                  Existing
                </button>
                <button
                  type="button"
                  className={classMode === "new" ? "active" : ""}
                  onClick={() => {
                    setClassMode("new");
                    setChapterMode("new");
                    setSelectedClassId(null);
                    setSelectedChapterId(null);
                    setPreview(null);
                  }}
                >
                  New
                </button>
              </div>
              {classMode === "existing" ? (
                <label>
                  Select class
                  <select
                    value={selectedClassId ?? ""}
                    onChange={(event) => {
                      setSelectedClassId(Number(event.target.value) || null);
                      setSelectedChapterId(null);
                      setPreview(null);
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
              ) : (
                <label>
                  New class name
                  <input
                    value={newClassName}
                    onChange={(event) => {
                      setNewClassName(event.target.value);
                      setPreview(null);
                    }}
                    placeholder="Study Methods"
                  />
                </label>
              )}
            </fieldset>

            <fieldset className="destination-fieldset">
              <legend>Chapter destination</legend>
              <div className="segmented-control">
                <button
                  type="button"
                  className={chapterMode === "existing" ? "active" : ""}
                  disabled={classMode === "new" || !selectedClass}
                  onClick={() => {
                    setChapterMode("existing");
                    setPreview(null);
                  }}
                >
                  Existing
                </button>
                <button
                  type="button"
                  className={chapterMode === "new" ? "active" : ""}
                  onClick={() => {
                    setChapterMode("new");
                    setSelectedChapterId(null);
                    setPreview(null);
                  }}
                >
                  New
                </button>
              </div>
              {chapterMode === "existing" && classMode === "existing" ? (
                <label>
                  Select chapter
                  <select
                    value={selectedChapterId ?? ""}
                    disabled={!selectedClass}
                    onChange={(event) => {
                      setSelectedChapterId(Number(event.target.value) || null);
                      setPreview(null);
                    }}
                  >
                    <option value="">Choose chapter</option>
                    {selectedClass?.chapters.map((chapter) => (
                      <option value={chapter.id} key={chapter.id}>
                        {chapter.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  New chapter name
                  <input
                    value={newChapterName}
                    onChange={(event) => {
                      setNewChapterName(event.target.value);
                      setPreview(null);
                    }}
                    placeholder="Chapter 3"
                  />
                </label>
              )}
            </fieldset>
          </div>
          {classMode === "existing" && chapterMode === "existing" && selectedClass && selectedChapter && (
            <div className="notice warning">
              Import will add valid questions to existing set: {selectedClass.name} / {selectedChapter.name}.
            </div>
          )}
          <fieldset className="destination-fieldset import-format-fieldset">
            <legend>Input format</legend>
            <div className="segmented-control">
              <button
                type="button"
                className={importFormat === "graded_quiz" ? "active" : ""}
                onClick={() => {
                  setImportFormat("graded_quiz");
                  setPreview(null);
                  setQuestions([]);
                  setMessage(null);
                }}
              >
                Graded Quiz Export
              </button>
              <button
                type="button"
                className={importFormat === "structured_json" ? "active" : ""}
                onClick={() => {
                  setImportFormat("structured_json");
                  setPreview(null);
                  setQuestions([]);
                  setMessage(null);
                }}
              >
                Structured JSON
              </button>
            </div>
            {importFormat === "structured_json" && (
              <div className="template-actions">
                <button
                  type="button"
                  className="ghost-action"
                  onClick={() => {
                    setRawInput(structuredJsonTemplate);
                    setSourceFileName("answerdeck-import-template.json");
                    setPreview(null);
                    setQuestions([]);
                  }}
                >
                  <FileText size={16} /> Insert Template
                </button>
                <button type="button" className="ghost-action" onClick={handleCopyTemplate}>
                  <Clipboard size={16} /> Copy Template
                </button>
                <button type="button" className="ghost-action" onClick={handleDownloadTemplate}>
                  <Download size={16} /> Download JSON
                </button>
              </div>
            )}
          </fieldset>
          <label className="file-input">
            <FileText size={18} />
            <span>{sourceFileName ?? (importFormat === "graded_quiz" ? "Choose .txt file" : "Choose .json file")}</span>
            <input type="file" accept={acceptedFileTypes} onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
          <textarea
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            placeholder={inputPlaceholder}
            spellCheck={false}
          />
        </section>

        <section className="panel import-state-panel">
          <div className="panel-heading">
            <h3>Import Review</h3>
            {preview && (
              <button className="primary-action" onClick={handleSave} disabled={isBusy}>
                <Save size={18} /> Save Questions
              </button>
            )}
          </div>
          {message && <div className="notice success">{message}</div>}
          {error && <div className="notice error">{error}</div>}
          {!preview && <p className="muted">Preview parsed questions before anything is saved.</p>}
          {preview && (
            <div className="import-summary-row">
              <Metric label="Blocks" value={preview.totalBlocks} />
              <Metric label="Ready" value={questions.filter((q) => !q.skipped && q.warnings.length === 0).length} />
              <Metric label="Needs review" value={questions.filter((q) => !q.skipped && q.warnings.length > 0).length} />
              <Metric label="Skipped" value={questions.filter((q) => q.skipped).length + preview.skipped.length} />
            </div>
          )}
        </section>
      </div>

      {questions.length > 0 && (
        <section className="question-review">
          {questions.map((question) => (
            <QuestionEditor
              key={question.localId}
              question={question}
              onChange={(next) => updateQuestion(question.localId, () => next)}
              onSkip={() => updateQuestion(question.localId, (current) => ({ ...current, skipped: true }))}
              onRestore={() => updateQuestion(question.localId, (current) => ({ ...current, skipped: false }))}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function QuestionEditor({
  question,
  onChange,
  onSkip,
  onRestore
}: {
  question: EditableQuestion;
  onChange: (question: EditableQuestion) => void;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const validation = questionInputSchema.safeParse(toQuestionInput(question));
  const status = question.skipped ? "Skipped" : validation.success ? "Ready" : "Needs correction";

  function updateChoice(index: number, patch: Partial<ChoiceInput>) {
    const choices = question.choices.map((choice, choiceIndex) =>
      choiceIndex === index ? { ...choice, ...patch } : choice
    );
    onChange({ ...question, choices, warnings: validation.success ? [] : question.warnings });
  }

  function markCorrect(index: number) {
    onChange({
      ...question,
      choices: question.choices.map((choice, choiceIndex) => ({
        ...choice,
        isCorrect: choiceIndex === index
      }))
    });
  }

  function addChoice() {
    const label = String.fromCharCode(65 + question.choices.length);
    onChange({
      ...question,
      choices: [...question.choices, { label, text: "", isCorrect: false }]
    });
  }

  return (
    <article className={`review-item ${question.skipped ? "is-skipped" : ""}`}>
      <div className="review-topline">
        <div>
          <strong>Question {question.sourceQuestionNumber ?? "unknown"}</strong>
          <span className={`status-pill ${status === "Ready" ? "ok" : status === "Skipped" ? "neutral" : "warn"}`}>
            {status}
          </span>
          {question.sourceStatus === "INCORRECT" && <span className="status-pill warn">Source incorrect</span>}
        </div>
        {question.skipped ? (
          <button className="ghost-action" onClick={onRestore}>
            <RotateCcw size={16} /> Restore
          </button>
        ) : (
          <button className="ghost-action" onClick={onSkip}>
            <SkipForward size={16} /> Skip
          </button>
        )}
      </div>
      {!validation.success && (
        <div className="notice warning">
          {validation.error.issues.map((issue) => issue.message).join(" ")}
        </div>
      )}
      {question.warnings.length > 0 && (
        <ul className="warning-list">
          {question.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <label>
        Prompt
        <textarea
          className="prompt-editor"
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        />
      </label>
      <div className="field-grid compact">
        <label>
          Type
          <select
            value={question.type}
            onChange={(event) =>
              onChange({
                ...question,
                type: event.target.value as EditableQuestion["type"],
                choices:
                  event.target.value === "true_false"
                    ? [
                        { label: "A", text: "True", isCorrect: false },
                        { label: "B", text: "False", isCorrect: true }
                      ]
                    : question.choices
              })
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
              onChange({ ...question, sourceSelectedAnswer: event.target.value.trim() || null })
            }
          />
        </label>
      </div>
      <div className="choice-editor-list">
        {question.choices.map((choice, index) => (
          <div className="choice-editor" key={`${choice.label}-${index}`}>
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
          </div>
        ))}
        {question.type === "multiple_choice" && (
          <button className="ghost-action add-choice" onClick={addChoice} type="button">
            Add choice
          </button>
        )}
      </div>
      <details>
        <summary>Raw block</summary>
        <pre>{question.rawBlock}</pre>
      </details>
    </article>
  );
}

function toQuestionInput(question: EditableQuestion): QuestionInput {
  return {
    sourceQuestionNumber: question.sourceQuestionNumber,
    type: question.type,
    prompt: question.prompt,
    choices: question.choices,
    sourceStatus: question.sourceStatus,
    sourceSelectedAnswer: question.sourceSelectedAnswer,
    sourceFileName: question.sourceFileName,
    rawBlock: question.rawBlock
  };
}

