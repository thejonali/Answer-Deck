import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("loads the local study app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Import question set" })).toBeVisible();
  await page.getByRole("button", { name: /Practice/ }).click();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await page.getByRole("button", { name: /Flashcards/ }).click();
  await expect(page.getByRole("heading", { name: "Review with flashcards" })).toBeVisible();
  await page.getByRole("button", { name: /^Quiz$/ }).click();
  await expect(page.getByRole("heading", { name: "Build a practice session" })).toBeVisible();
  await page.getByRole("button", { name: /Attempts/ }).click();
  await expect(page.getByRole("heading", { name: "Attempt History" })).toBeVisible();
  await page.getByRole("button", { name: /Library/ }).click();
  await expect(page.getByRole("heading", { name: "Question Library" })).toBeVisible();
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
