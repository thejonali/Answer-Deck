import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  await expect(page.getByRole("heading", { name: "Attempt History" })).toBeVisible();
  await page.getByRole("button", { name: /Library/ }).click();
  await expect(page.getByRole("heading", { name: "Question Library" })).toBeVisible();
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
