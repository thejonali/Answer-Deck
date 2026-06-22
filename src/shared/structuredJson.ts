import { z } from "zod";
import { questionInputSchema } from "./schemas";
import type { ImportPreview, ParsedQuestion, QuestionInput, QuestionType, SourceStatus } from "./types";
import { normalizePrompt } from "./parser";

const structuredChoiceSchema = z.object({
  label: z.string().trim().min(1),
  text: z.string().trim().min(1),
  isCorrect: z.boolean()
});

const structuredQuestionSchema = z.object({
  sourceQuestionNumber: z.number().int().positive().nullable().optional(),
  type: z.enum(["multiple_choice", "true_false"]),
  prompt: z.string().trim().min(1),
  choices: z.array(structuredChoiceSchema).min(2),
  sourceStatus: z.enum(["CORRECT", "INCORRECT", "UNKNOWN"]).optional(),
  sourceSelectedAnswer: z.string().trim().min(1).nullable().optional(),
  rawBlock: z.string().trim().min(1).optional()
});

const structuredImportSchema = z.union([
  z.object({
    version: z.number().int().positive().optional(),
    questions: z.array(z.unknown()).min(1)
  }),
  z.array(z.unknown()).min(1)
]);

export const structuredJsonTemplate = JSON.stringify(
  {
    version: 1,
    questions: [
      {
        sourceQuestionNumber: 1,
        type: "multiple_choice",
        prompt: "Which practice best supports long-term retention?",
        choices: [
          { label: "A", text: "Reviewing once the night before", isCorrect: false },
          { label: "B", text: "Spacing review across multiple days", isCorrect: true },
          { label: "C", text: "Only rereading highlighted notes", isCorrect: false },
          { label: "D", text: "Skipping missed questions", isCorrect: false }
        ],
        sourceStatus: "UNKNOWN",
        sourceSelectedAnswer: null
      },
      {
        sourceQuestionNumber: 2,
        type: "true_false",
        prompt: "A flashcard should have exactly one correct answer.",
        choices: [
          { label: "A", text: "True", isCorrect: true },
          { label: "B", text: "False", isCorrect: false }
        ],
        sourceStatus: "UNKNOWN",
        sourceSelectedAnswer: null
      }
    ]
  },
  null,
  2
);

export function parseStructuredQuestionJson(params: {
  rawInput: string;
  className: string;
  chapterName: string;
  sourceFileName?: string | null;
}): ImportPreview {
  const parsedJson = parseJson(params.rawInput);
  const topLevel = structuredImportSchema.safeParse(parsedJson);
  if (!topLevel.success) {
    throw new Error("Structured JSON must be an object with a questions array or an array of questions.");
  }

  const questionItems = Array.isArray(topLevel.data) ? topLevel.data : topLevel.data.questions;
  const ready: ParsedQuestion[] = [];
  const needsCorrection: ParsedQuestion[] = [];

  questionItems.forEach((item, index) => {
    const parsedQuestion = parseStructuredQuestion(item, index, params.sourceFileName ?? null);
    if (parsedQuestion.parseState === "ready") {
      ready.push(parsedQuestion);
    } else {
      needsCorrection.push(parsedQuestion);
    }
  });

  return {
    className: params.className,
    chapterName: params.chapterName,
    sourceFileName: params.sourceFileName ?? null,
    rawInput: params.rawInput,
    totalBlocks: questionItems.length,
    ready,
    needsCorrection,
    skipped: []
  };
}

function parseJson(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput);
  } catch {
    throw new Error("Structured JSON could not be parsed. Check for missing commas, quotes, or brackets.");
  }
}

function parseStructuredQuestion(item: unknown, index: number, sourceFileName: string | null): ParsedQuestion {
  const rawBlock = JSON.stringify(item, null, 2);
  const parsed = structuredQuestionSchema.safeParse(item);
  if (!parsed.success) {
    return makeCorrectionQuestion(item, index, sourceFileName, rawBlock, parsed.error.issues.map((issue) => issue.message));
  }

  const question: QuestionInput = {
    sourceQuestionNumber: parsed.data.sourceQuestionNumber ?? null,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    choices: parsed.data.choices,
    sourceStatus: parsed.data.sourceStatus ?? "UNKNOWN",
    sourceSelectedAnswer: parsed.data.sourceSelectedAnswer ?? null,
    sourceFileName,
    rawBlock: parsed.data.rawBlock ?? rawBlock
  };
  const validated = questionInputSchema.safeParse(question);
  const warnings = validated.success ? [] : validated.error.issues.map((issue) => issue.message);

  return {
    ...question,
    parseState: warnings.length === 0 ? "ready" : "needs_correction",
    warnings,
    duplicateKey: normalizePrompt(question.prompt)
  };
}

function makeCorrectionQuestion(
  item: unknown,
  index: number,
  sourceFileName: string | null,
  rawBlock: string,
  warnings: string[]
): ParsedQuestion {
  const value = isRecord(item) ? item : {};
  return {
    sourceQuestionNumber: typeof value.sourceQuestionNumber === "number" ? value.sourceQuestionNumber : index + 1,
    type: isQuestionType(value.type) ? value.type : "multiple_choice",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    choices: Array.isArray(value.choices) ? coerceChoices(value.choices) : [],
    sourceStatus: isSourceStatus(value.sourceStatus) ? value.sourceStatus : "UNKNOWN",
    sourceSelectedAnswer: typeof value.sourceSelectedAnswer === "string" ? value.sourceSelectedAnswer : null,
    sourceFileName,
    rawBlock,
    parseState: "needs_correction",
    warnings,
    duplicateKey: typeof value.prompt === "string" ? normalizePrompt(value.prompt) : undefined
  };
}

function coerceChoices(choices: unknown[]): QuestionInput["choices"] {
  return choices.map((choice, index) => {
    const value = isRecord(choice) ? choice : {};
    return {
      label: typeof value.label === "string" ? value.label : String.fromCharCode(65 + index),
      text: typeof value.text === "string" ? value.text : "",
      isCorrect: typeof value.isCorrect === "boolean" ? value.isCorrect : false
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === "multiple_choice" || value === "true_false";
}

function isSourceStatus(value: unknown): value is SourceStatus {
  return value === "CORRECT" || value === "INCORRECT" || value === "UNKNOWN";
}
