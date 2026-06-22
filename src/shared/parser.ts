import { questionInputSchema } from "./schemas";
import type {
  ChoiceInput,
  ImportPreview,
  ParsedQuestion,
  QuestionInput,
  QuestionType,
  SourceStatus
} from "./types";

const OPTION_MARKER = /^\s*Option\s+([A-Z])\s*$/;
const HEADER_TYPE = /^(Multiple Choice|True\/False)$/;

export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\w]+|[^\w]+$/g, "")
    .trim();
}

export function parseQuizText(params: {
  rawInput: string;
  className: string;
  chapterName: string;
  sourceFileName?: string | null;
}): ImportPreview {
  const rawInput = params.rawInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = splitQuestionBlocks(rawInput);
  const ready: ParsedQuestion[] = [];
  const needsCorrection: ParsedQuestion[] = [];
  const skipped: ParsedQuestion[] = [];

  for (const block of blocks) {
    const parsed = parseQuestionBlock(block, params.sourceFileName ?? null);
    if (parsed.parseState === "ready") {
      ready.push(parsed);
    } else if (parsed.parseState === "needs_correction") {
      needsCorrection.push(parsed);
    } else {
      skipped.push(parsed);
    }
  }

  return {
    className: params.className,
    chapterName: params.chapterName,
    sourceFileName: params.sourceFileName ?? null,
    rawInput,
    totalBlocks: blocks.length,
    ready,
    needsCorrection,
    skipped
  };
}

export function splitQuestionBlocks(rawInput: string): string[] {
  const normalized = rawInput.trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const startIndexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isQuestionStart(lines, index)) {
      startIndexes.push(lineOffsets[index]);
    }
  }

  if (startIndexes.length === 0) {
    return [normalized];
  }

  const blocks: string[] = [];
  for (let index = 0; index < startIndexes.length; index += 1) {
    const start = startIndexes[index];
    const end = startIndexes[index + 1] ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    if (block) {
      blocks.push(block);
    }
  }
  return blocks;
}

function isQuestionStart(lines: string[], index: number): boolean {
  const current = lines[index].trim();
  if (index === 0 && /^\d+$/.test(current)) {
    const typeIndex = nextNonEmptyLineIndex(lines, index + 1);
    return typeIndex !== -1 && HEADER_TYPE.test(lines[typeIndex].trim());
  }

  if (!/^Question\s+\d+$/i.test(current)) {
    return false;
  }

  const numberIndex = nextNonEmptyLineIndex(lines, index + 1);
  const typeIndex = numberIndex === -1 ? -1 : nextNonEmptyLineIndex(lines, numberIndex + 1);
  return (
    numberIndex !== -1 &&
    typeIndex !== -1 &&
    /^\d+$/.test(lines[numberIndex].trim()) &&
    HEADER_TYPE.test(lines[typeIndex].trim())
  );
}

function nextNonEmptyLineIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return index;
    }
  }
  return -1;
}

export function parseQuestionBlock(block: string, sourceFileName: string | null): ParsedQuestion {
  const warnings: string[] = [];
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const typeIndex = lines.findIndex((line) => HEADER_TYPE.test(line.trim()));
  if (typeIndex === -1) {
    return makeNeedsCorrection(block, sourceFileName, ["Question type was not found."]);
  }

  const rawType = lines[typeIndex].trim();
  const type: QuestionType = rawType === "Multiple Choice" ? "multiple_choice" : "true_false";
  const questionNumber = parseQuestionNumber(lines, typeIndex);
  const sourceStatus = parseSourceStatus(lines);
  const sourceScoreLineIndex = lines.findIndex((line) => /^Grade:\s+/i.test(line.trim()));
  const contentStartIndex = sourceScoreLineIndex >= 0 ? sourceScoreLineIndex + 1 : typeIndex + 1;
  if (sourceScoreLineIndex === -1) {
    warnings.push("Grade line was not found.");
  }

  const contentLines = lines.slice(contentStartIndex);
  const answerStartIndex = findAnswerStartIndex(contentLines, type);
  if (answerStartIndex === -1) {
    return makeNeedsCorrection(block, sourceFileName, [
      ...warnings,
      "Answer choices were not found."
    ]);
  }

  const prompt = joinTextLines(contentLines.slice(0, answerStartIndex));
  if (!prompt) {
    warnings.push("Prompt was not found.");
  }

  const answerLines = contentLines.slice(answerStartIndex);
  const parsedAnswers =
    type === "multiple_choice"
      ? parseMultipleChoice(answerLines, warnings)
      : parseTrueFalse(answerLines, warnings);

  const question: QuestionInput = {
    sourceQuestionNumber: questionNumber,
    type,
    prompt,
    choices: parsedAnswers.choices,
    sourceStatus,
    sourceSelectedAnswer: parsedAnswers.sourceSelectedAnswer,
    sourceFileName,
    rawBlock: block
  };

  const validation = questionInputSchema.safeParse(question);
  if (!validation.success) {
    warnings.push(...validation.error.issues.map((issue) => issue.message));
  }

  return {
    ...question,
    parseState: warnings.length === 0 ? "ready" : "needs_correction",
    warnings,
    duplicateKey: normalizePrompt(prompt)
  };
}

function parseQuestionNumber(lines: string[], typeIndex: number): number | null {
  const previous = lines[typeIndex - 1]?.trim();
  const questionLine = lines[typeIndex - 2]?.trim();
  if (previous && /^\d+$/.test(previous)) {
    return Number(previous);
  }
  const match = questionLine?.match(/^Question\s+(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function parseSourceStatus(lines: string[]): SourceStatus {
  if (lines.some((line) => line.trim() === "CORRECT")) {
    return "CORRECT";
  }
  if (lines.some((line) => line.trim() === "INCORRECT")) {
    return "INCORRECT";
  }
  return "UNKNOWN";
}

function findAnswerStartIndex(lines: string[], type: QuestionType): number {
  if (type === "multiple_choice") {
    return lines.findIndex((line) => OPTION_MARKER.test(line.trim()));
  }
  return lines.findIndex((line) => {
    const trimmed = line.trim();
    return (
      trimmed === "True" ||
      trimmed === "False" ||
      trimmed === "TrueCorrect answer" ||
      trimmed === "FalseCorrect answer" ||
      /^Incorrect:\s*(True|False)$/i.test(trimmed)
    );
  });
}

function parseMultipleChoice(
  lines: string[],
  warnings: string[]
): { choices: ChoiceInput[]; sourceSelectedAnswer: string | null } {
  const choices: ChoiceInput[] = [];
  let current: { label: string; lines: string[]; isCorrect: boolean } | null = null;

  const flush = () => {
    if (!current) {
      return;
    }
    const text = cleanAnswerText(current.lines);
    choices.push({
      label: current.label,
      text,
      isCorrect: current.isCorrect
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const optionMatch = trimmed.match(OPTION_MARKER);
    if (optionMatch) {
      flush();
      current = { label: optionMatch[1], lines: [], isCorrect: false };
      continue;
    }
    if (!current) {
      continue;
    }
    if (trimmed === "Correct:") {
      current.isCorrect = true;
      continue;
    }
    current.lines.push(line);
  }
  flush();

  const correctCount = choices.filter((choice) => choice.isCorrect).length;
  if (correctCount === 0) {
    warnings.push("No correct answer marker was found.");
  } else if (correctCount > 1) {
    warnings.push("Multiple correct answer markers were found.");
  }
  if (choices.length < 2) {
    warnings.push("Fewer than two answer choices were found.");
  }
  if (choices.some((choice) => choice.text.length === 0)) {
    warnings.push("One or more answer choices are empty.");
  }

  return { choices, sourceSelectedAnswer: null };
}

function parseTrueFalse(
  lines: string[],
  warnings: string[]
): { choices: ChoiceInput[]; sourceSelectedAnswer: string | null } {
  let correctAnswer: "True" | "False" | null = null;
  let sourceSelectedAnswer: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const incorrectMatch = trimmed.match(/^Incorrect:\s*(True|False)$/i);
    if (incorrectMatch) {
      sourceSelectedAnswer = normalizeBooleanText(incorrectMatch[1]);
      continue;
    }
    if (trimmed === "TrueCorrect answer") {
      correctAnswer = "True";
    }
    if (trimmed === "FalseCorrect answer") {
      correctAnswer = "False";
    }
  }

  if (!correctAnswer) {
    warnings.push("No correct answer marker was found.");
  }

  return {
    choices: [
      { label: "A", text: "True", isCorrect: correctAnswer === "True" },
      { label: "B", text: "False", isCorrect: correctAnswer === "False" }
    ],
    sourceSelectedAnswer
  };
}

function cleanAnswerText(lines: string[]): string {
  return joinTextLines(
    lines.map((line) =>
      line
        .replace(/\bCorrect answer\b/g, "")
        .replace(/^Incorrect:\s*/i, "")
        .trim()
    )
  );
}

function joinTextLines(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBooleanText(value: string): "True" | "False" {
  return value.toLowerCase() === "true" ? "True" : "False";
}

function makeNeedsCorrection(
  block: string,
  sourceFileName: string | null,
  warnings: string[]
): ParsedQuestion {
  return {
    sourceQuestionNumber: null,
    type: "multiple_choice",
    prompt: "",
    choices: [],
    sourceStatus: "UNKNOWN",
    sourceSelectedAnswer: null,
    sourceFileName,
    rawBlock: block,
    parseState: "needs_correction",
    warnings
  };
}
