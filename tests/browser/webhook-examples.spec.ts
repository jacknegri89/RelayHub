import { expect, test } from "@playwright/test";

test("a visitor follows a webhook, changes example and replays the exchange", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore webhook examples" }).click();
  const guide = page.getByRole("region", { name: "What is a webhook?" });
  await expect(guide).toBeFocused();
  await expect(guide.getByText("payment_intent.succeeded")).toBeVisible();
  await guide.getByRole("button", { name: "GitHub", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    guide.getByRole("button", { name: "GitHub", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(guide.getByText("Build server", { exact: true })).toBeVisible();
  await expect(
    guide.getByRole("link", { name: "Read the GitHub guide" }),
  ).toHaveAttribute(
    "href",
    "https://docs.github.com/en/webhooks/about-webhooks",
  );
  await guide.getByRole("button", { name: "Replay exchange" }).click();
  await expect
    .poll(() =>
      guide
        .locator("svg")
        .evaluate((diagram) =>
          diagram
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"),
        ),
    )
    .toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Passa all’italiano" }).click();
  const italianGuide = page.getByRole("region", { name: "Cos’è un webhook?" });
  await italianGuide
    .getByRole("button", { name: "Shopify", exact: true })
    .click();
  await expect(italianGuide.getByText("orders/create")).toBeVisible();
  await expect(
    italianGuide.getByText("Magazzino", { exact: true }),
  ).toBeVisible();
  await expect(
    italianGuide.getByRole("button", { name: "Rivedi lo scambio" }),
  ).toHaveCount(0);
  expect(
    await italianGuide
      .locator("svg")
      .evaluate((diagram) => diagram.getAnimations({ subtree: true }).length),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );

  const stages = page.getByRole("group", { name: "Fasi della consegna" });
  await stages.getByRole("radio", { name: "Verifica" }).focus();
  for (let step = 1; step < 4; step++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(stages.getByRole("radio", { name: "Riprova" })).toBeChecked();
  await expect(page.locator("#journey-caption")).toContainText("503 → 204");
  await expect(page.locator("#journey-caption")).toContainText(
    "Solo la fatturazione richiede un nuovo tentativo",
  );
});
