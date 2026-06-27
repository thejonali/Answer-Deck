import { z } from "zod";

export const choiceInputSchema = z.object({
  label: z.string().trim().min(1),
  text: z.string().trim().min(1),
  isCorrect: z.boolean()
});

export const questionInputSchema = z
  .object({
    sourceQuestionNumber: z.number().int().positive().nullable(),
    type: z.enum(["multiple_choice", "true_false"]),
    prompt: z.string().trim().min(1),
    choices: z.array(choiceInputSchema).min(2),
    sourceStatus: z.enum(["CORRECT", "INCORRECT", "UNKNOWN"]),
    sourceSelectedAnswer: z.string().trim().min(1).nullable(),
    sourceFileName: z.string().trim().min(1).nullable(),
    rawBlock: z.string().trim().min(1)
  })
  .superRefine((question, ctx) => {
    const correctCount = question.choices.filter((choice) => choice.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one answer choice must be marked correct.",
        path: ["choices"]
      });
    }

    const normalizedChoices = new Set(question.choices.map((choice) => choice.text.trim()));
    if (normalizedChoices.size !== question.choices.length) {
      ctx.addIssue({
        code: "custom",
        message: "Answer choices must not be duplicated.",
        path: ["choices"]
      });
    }
  });

export const importPreviewRequestSchema = z.object({
  className: z.string().trim().min(1),
  chapterName: z.string().trim().min(1),
  sourceFileName: z.string().trim().min(1).nullable().optional(),
  rawInput: z.string().trim().min(1)
});

export const importSaveRequestSchema = z.object({
  className: z.string().trim().min(1),
  chapterName: z.string().trim().min(1),
  sourceFileName: z.string().trim().min(1).nullable().optional(),
  rawInput: z.string().trim().min(1),
  questions: z.array(questionInputSchema),
  skippedRawBlocks: z.array(z.string()).default([])
});

export const quizSessionInputSchema = z.object({
  classId: z.number().int().positive(),
  chapterIds: z.array(z.number().int().positive()).min(1),
  mode: z.enum(["single_chapter", "combined_chapters"]),
  parentSessionId: z.number().int().positive().nullable().default(null),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  answers: z.array(
    z.object({
      questionId: z.number().int().positive(),
      selectedChoiceId: z.number().int().positive(),
      correctChoiceId: z.number().int().positive(),
      isCorrect: z.boolean(),
      timeMs: z.number().int().nonnegative()
    })
  )
});
