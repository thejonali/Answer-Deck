import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const performanceReportFixture = {
  kpis: {
    attempts: 2,
    questionsAnswered: 12,
    weightedAccuracy: 75,
    firstPassAccuracy: 70,
    latestMastery: 80,
    averageSecondsPerQuestion: 6.5,
    retryRecovery: 100,
    unresolvedQuestions: 1
  },
  trend: [
    {
      sessionId: 1,
      completedAt: "2026-06-27T12:00:00.000Z",
      attemptType: "original",
      accuracy: 70,
      questionsAnswered: 10
    },
    {
      sessionId: 2,
      completedAt: "2026-06-27T12:05:00.000Z",
      attemptType: "retry",
      accuracy: 100,
      questionsAnswered: 2
    }
  ],
  activity: [{ date: "2026-06-27", correct: 9, incorrect: 3 }],
  chapters: [
    {
      chapterId: 10,
      className: "Math",
      chapterName: "Chapter 1",
      questionsAnswered: 12,
      accuracy: 75,
      latestMastery: 80,
      unresolvedQuestions: 1
    }
  ],
  retryFunnel: { missed: 3, retested: 2, recovered: 2, stillMissed: 0 },
  weakQuestions: [
    {
      questionId: 100,
      className: "Math",
      chapterName: "Chapter 1",
      prompt: "What is two plus two?",
      answers: 2,
      misses: 1,
      latestCorrect: true,
      averageSeconds: 5
    }
  ],
  attempts: {
    items: [
      {
        id: 1,
        parentSessionId: null,
        rootSessionId: null,
        className: "Math",
        chapterNames: ["Chapter 1"],
        completedAt: "2026-06-27T12:00:00.000Z",
        totalQuestions: 10,
        correctCount: 7,
        averageSecondsPerQuestion: 6.5
      }
    ],
    total: 1,
    page: 1,
    pageSize: 25
  }
};

test("loads the local study app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Import question set" })).toBeVisible();
  await page.getByRole("button", { name: /Practice/ }).click();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  await expect(page.getByText("Practice session", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All questions" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Scramble answers")).toBeChecked();
  await expect(page.getByLabel("Review at end")).not.toBeChecked();
  await expect(page.getByLabel("Limit")).toHaveCount(0);
  await page.getByRole("button", { name: "Custom limit" }).click();
  await expect(page.getByLabel("Limit")).toHaveValue("20");
  await expect(page.getByRole("button", { name: "20" })).toHaveClass(/active/);
  await page.getByRole("button", { name: /Flashcards/ }).click();
  await expect(page.getByRole("heading", { name: "Review with flashcards" })).toBeVisible();
  await page.getByRole("button", { name: /^Quiz$/ }).click();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  await page.getByRole("button", { name: /Attempts/ }).click();
  await expect(page.getByRole("heading", { name: "Recent Attempts" })).toBeVisible();
  await page.getByRole("button", { name: /Reports/ }).click();
  await expect(page.getByRole("heading", { name: "Performance Reports" })).toBeVisible();
  await page.getByRole("button", { name: /Library/ }).click();
  await expect(page.getByRole("heading", { name: "Question Library" })).toBeVisible();
});

test("filters and renders performance reports without page overflow", async ({ page }) => {
  await page.route("**/api/classes", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Math", chapters: [{ id: 10, classId: 1, name: "Chapter 1", questionCount: 10 }] }]
    })
  );
  await page.route("**/api/reports/performance?*", (route) => route.fulfill({ json: performanceReportFixture }));

  await page.goto("/");
  await page.getByRole("button", { name: /Reports/ }).click();
  await expect(page.getByText("First-pass accuracy", { exact: true })).toBeVisible();
  await expect(page.locator(".report-primary-kpi").filter({ hasText: "First-pass accuracy" }).locator("strong")).toHaveText(
    "70%"
  );
  await expect(page.getByText("Updated from 1 attempt", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accuracy over time" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weak and repeated questions" })).toBeVisible();
  await expect(page.getByText("What is two plus two?", { exact: true })).toBeVisible();

  await page.getByLabel("Class").selectOption("1");
  await expect(page.getByLabel("Chapter")).toBeEnabled();
  await expect(page.getByLabel("Chapter").getByRole("option", { name: "Chapter 1" })).toHaveCount(1);
  const presetRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/reports/performance" && url.searchParams.has("from") && url.searchParams.has("to");
  });
  await page.getByRole("button", { name: "30 days" }).click();
  await presetRequest;
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Custom" }).click();
  await expect(page.getByLabel("From")).toBeVisible();
  await expect(page.getByLabel("To")).toBeVisible();
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("From")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 1000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
  const tableOverflow = await page.locator(".report-table-scroll").first().evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  }));
  expect(tableOverflow.scrollWidth).toBeGreaterThanOrEqual(tableOverflow.clientWidth);
});

test("uses a subdued end action and discards a quiz ended early", async ({ page }) => {
  let sessionWasSaved = false;
  await page.route("**/api/classes", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Math", chapters: [{ id: 10, classId: 1, name: "Chapter 1", questionCount: 2 }] }]
    })
  );
  await page.route("**/api/questions?*", (route) =>
    route.fulfill({
      json: [
        {
          id: 100,
          classId: 1,
          chapterId: 10,
          className: "Math",
          chapterName: "Chapter 1",
          type: "multiple_choice",
          prompt: "What is two plus two?",
          sourceQuestionNumber: 1,
          sourceStatus: "UNKNOWN",
          sourceSelectedAnswer: null,
          choices: [
            { id: 1000, questionId: 100, label: "A", text: "4", sortOrder: 0, isCorrect: true },
            { id: 1001, questionId: 100, label: "B", text: "5", sortOrder: 1, isCorrect: false }
          ]
        },
        {
          id: 101,
          classId: 1,
          chapterId: 10,
          className: "Math",
          chapterName: "Chapter 1",
          type: "multiple_choice",
          prompt: "What is three plus three?",
          sourceQuestionNumber: 2,
          sourceStatus: "UNKNOWN",
          sourceSelectedAnswer: null,
          choices: [
            { id: 1010, questionId: 101, label: "A", text: "6", sortOrder: 0, isCorrect: true },
            { id: 1011, questionId: 101, label: "B", text: "7", sortOrder: 1, isCorrect: false }
          ]
        }
      ]
    })
  );
  await page.route("**/api/quiz-sessions", (route) => {
    sessionWasSaved = true;
    return route.fulfill({ json: { sessionId: 1 } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Practice/ }).click();
  await page.getByLabel("Class").selectOption("1");
  await page.getByText("Chapter 1", { exact: true }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();

  await expect(page.getByText("Practice session", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Elapsed time")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End quiz" })).toHaveClass(/quiz-end-action/);

  const correctChoice = page.locator(".answer-button.correct");
  await page.locator(".answer-button").filter({ hasText: /^(1|2)\s*(4|6)$/ }).first().click();
  await expect(correctChoice).toHaveCount(1);

  await page.getByRole("button", { name: "End quiz" }).click();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  expect(sessionWasSaved).toBe(false);
});

test("uses toolbar navigation for review-at-end quizzes", async ({ page }) => {
  let savedSessionCount = 0;
  const savedAnswers: Array<{ questionId: number; selectedChoiceId: number; isCorrect: boolean }> = [];
  await page.route("**/api/classes", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Math", chapters: [{ id: 10, classId: 1, name: "Chapter 1", questionCount: 2 }] }]
    })
  );
  await page.route("**/api/questions?*", (route) =>
    route.fulfill({
      json: [
        {
          id: 100,
          classId: 1,
          chapterId: 10,
          className: "Math",
          chapterName: "Chapter 1",
          type: "multiple_choice",
          prompt: "What is two plus two?",
          sourceQuestionNumber: 1,
          sourceStatus: "UNKNOWN",
          sourceSelectedAnswer: null,
          choices: [
            { id: 1000, questionId: 100, label: "A", text: "4", sortOrder: 0, isCorrect: true },
            { id: 1001, questionId: 100, label: "B", text: "5", sortOrder: 1, isCorrect: false }
          ]
        },
        {
          id: 101,
          classId: 1,
          chapterId: 10,
          className: "Math",
          chapterName: "Chapter 1",
          type: "multiple_choice",
          prompt: "What is three plus three?",
          sourceQuestionNumber: 2,
          sourceStatus: "UNKNOWN",
          sourceSelectedAnswer: null,
          choices: [
            { id: 1010, questionId: 101, label: "A", text: "6", sortOrder: 0, isCorrect: true },
            { id: 1011, questionId: 101, label: "B", text: "7", sortOrder: 1, isCorrect: false }
          ]
        }
      ]
    })
  );
  await page.route("**/api/quiz-sessions", async (route) => {
    const body = route.request().postDataJSON() as { answers: typeof savedAnswers };
    savedSessionCount += 1;
    savedAnswers.push(...body.answers);
    return route.fulfill({ json: { sessionId: 1 } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Practice/ }).click();
  await page.getByLabel("Class").selectOption("1");
  await page.getByText("Chapter 1", { exact: true }).click();
  await page.getByLabel("Review at end").check();
  await page.getByLabel("Shuffle questions").uncheck();
  await page.getByLabel("Scramble answers").uncheck();
  await page.getByRole("button", { name: "Start quiz" }).click();

  await expect(page.getByRole("button", { name: "Previous question" })).toBeDisabled();
  await page.locator(".answer-button").filter({ hasText: /^1\s*4$/ }).click();
  await expect(page.getByRole("heading", { name: "What is three plus three?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous question" })).toBeVisible();

  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(page.getByRole("heading", { name: "What is two plus two?" })).toBeVisible();
  await expect(page.locator(".answer-button").filter({ hasText: /^1\s*4$/ })).toHaveClass(/selected/);
  await expect(page.locator(".answer-button.correct, .answer-button.wrong")).toHaveCount(0);
  await page.locator(".answer-button").filter({ hasText: /^2\s*5$/ }).click();
  await expect(page.locator(".answer-button").filter({ hasText: /^2\s*5$/ })).toHaveClass(/selected/);
  await expect(page.getByRole("heading", { name: "What is two plus two?" })).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();

  await page.locator(".answer-button").filter({ hasText: /^1\s*6$/ }).click();
  await expect(page.getByRole("heading", { name: "What is three plus three?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish quiz" })).toBeVisible();
  expect(savedSessionCount).toBe(0);

  await page.getByRole("button", { name: "Previous question" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Finish quiz" }).click();
  await expect(page.getByText("Session results", { exact: true })).toBeVisible();
  expect(savedSessionCount).toBe(1);
  expect(savedAnswers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ questionId: 100, selectedChoiceId: 1001, isCorrect: false })
    ])
  );
});

test("retries missed answers from session results and records the source attempt", async ({ page }) => {
  const sessionBodies: Array<{ parentSessionId: number | null }> = [];
  const quizQuestion = {
    id: 100,
    classId: 1,
    chapterId: 10,
    className: "Math",
    chapterName: "Chapter 1",
    type: "multiple_choice",
    prompt: "What is two plus two?",
    sourceQuestionNumber: 1,
    sourceStatus: "UNKNOWN",
    sourceSelectedAnswer: null,
    choices: [
      { id: 1000, questionId: 100, label: "A", text: "4", sortOrder: 0, isCorrect: true },
      { id: 1001, questionId: 100, label: "B", text: "5", sortOrder: 1, isCorrect: false }
    ]
  };
  await page.route("**/api/classes", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Math", chapters: [{ id: 10, classId: 1, name: "Chapter 1", questionCount: 1 }] }]
    })
  );
  await page.route("**/api/questions?*", (route) => route.fulfill({ json: [quizQuestion] }));
  await page.route("**/api/quiz-sessions/42/missed-questions", (route) =>
    route.fulfill({
      json: {
        sourceSessionId: 42,
        rootSessionId: 42,
        classId: 1,
        chapterIds: [10],
        questions: [quizQuestion]
      }
    })
  );
  await page.route("**/api/quiz-sessions", async (route) => {
    sessionBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { sessionId: sessionBodies.length === 1 ? 42 : 43 } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Practice/ }).click();
  await page.getByLabel("Class").selectOption("1");
  await page.getByText("Chapter 1", { exact: true }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByRole("button", { name: /5$/ }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page.getByText("Session results", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retest missed answers (1)" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "New quiz" })).toBeVisible();
  expect(sessionBodies[0].parentSessionId).toBeNull();

  await page.getByRole("button", { name: "Retest missed answers (1)" }).click();
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /4$/ }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("100% accuracy", { exact: true })).toBeVisible();
  expect(sessionBodies[1].parentSessionId).toBe(42);
});

test("starts a missed-answer quiz from attempt history", async ({ page }) => {
  const quizQuestion = {
    id: 100,
    classId: 1,
    chapterId: 10,
    className: "Math",
    chapterName: "Chapter 1",
    type: "multiple_choice",
    prompt: "What is two plus two?",
    sourceQuestionNumber: 1,
    sourceStatus: "UNKNOWN",
    sourceSelectedAnswer: null,
    choices: [
      { id: 1000, questionId: 100, label: "A", text: "4", sortOrder: 0, isCorrect: true },
      { id: 1001, questionId: 100, label: "B", text: "5", sortOrder: 1, isCorrect: false }
    ]
  };
  await page.route("**/api/history/recent", (route) =>
    route.fulfill({
      json: [
        {
          rootSessionId: 42,
          className: "Math",
          completedAt: "2026-06-27T12:01:00.000Z",
          chapterNames: ["Chapter 1"],
          attempts: [
            {
              id: 42,
              parentSessionId: null,
              rootSessionId: null,
              className: "Math",
              mode: "single_chapter",
              startedAt: "2026-06-27T12:00:00.000Z",
              completedAt: "2026-06-27T12:01:00.000Z",
              totalQuestions: 1,
              correctCount: 0,
              incorrectCount: 1,
              averageSecondsPerQuestion: 2,
              chapterNames: ["Chapter 1"],
              missedQuestions: [
                {
                  questionId: 100,
                  chapterName: "Chapter 1",
                  prompt: quizQuestion.prompt,
                  selectedAnswer: "5",
                  correctAnswer: "4",
                  timeMs: 2000
                }
              ]
            }
          ]
        }
      ]
    })
  );
  await page.route("**/api/classes", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Math", chapters: [{ id: 10, classId: 1, name: "Chapter 1", questionCount: 1 }] }]
    })
  );
  await page.route("**/api/quiz-sessions/42/missed-questions", (route) =>
    route.fulfill({
      json: {
        sourceSessionId: 42,
        rootSessionId: 42,
        classId: 1,
        chapterIds: [10],
        questions: [quizQuestion]
      }
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: /Attempts/ }).click();
  const retryMissedButton = page.getByRole("button", { name: "Retest missed answers (1)" });
  await retryMissedButton.waitFor();
  await retryMissedButton.click();
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: quizQuestion.prompt })).toBeVisible();
});

test("import review metrics stay inside the review panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).first().click();
  await page.getByLabel("New class name").fill("Writing Lab");
  await page.getByLabel("New chapter name").fill("Chapter 2");
  await page
    .locator("textarea")
    .fill(readFileSync(join("tests", "fixtures", "Writing_Fundamentals_Chapter2.txt"), "utf8"));
  await page.getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByText("6 ready, 0 need correction, 0 skipped.")).toBeVisible();

  const panelBox = await page.locator(".import-state-panel").boundingBox();
  expect(panelBox).not.toBeNull();

  const metricBoxes = await page.locator(".import-summary-row .metric").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    })
  );

  for (const box of metricBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(panelBox!.x - 1);
    expect(box.right).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
  }
});

test("previews the standard structured JSON input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New" }).first().click();
  await page.getByLabel("New class name").fill("Structured Import Lab");
  await page.getByLabel("New chapter name").fill("Template Chapter");
  await page.getByRole("button", { name: "Structured JSON" }).click();
  await page.getByRole("button", { name: /Insert Template/ }).click();
  await page.getByRole("button", { name: /Preview/ }).click();

  await expect(page.getByText("2 ready, 0 need correction, 0 skipped.")).toBeVisible();
  await expect(page.locator(".review-item").first().getByLabel("Prompt")).toHaveValue(
    "Which practice best supports long-term retention?"
  );
});
