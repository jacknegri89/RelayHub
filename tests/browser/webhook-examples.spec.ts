import { expect, test } from "@playwright/test";

test("the homepage introduction and examples link work without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Send one webhook to multiple services",
      }),
    ).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "Create an account" }),
    ).toBeInViewport();
    await page.getByRole("link", { name: "View examples" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("region", { name: "What is a webhook?" }),
    ).toBeFocused();
  } finally {
    await context.close();
  }
});

test("a visitor follows a webhook, changes example and replays the exchange", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const signIn = navigation.getByRole("link", { name: "Sign in" });
  const register = page.getByRole("link", { name: "Create an account" });
  await expect(signIn).toHaveAttribute("href", "/login");
  await expect(register).toHaveAttribute("href", "/register");
  await expect(signIn).toBeInViewport({ ratio: 1 });
  await expect(register).toBeInViewport({ ratio: 1 });
  await expect(
    navigation.getByRole("link", { name: "Delivery guide" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send a test order" }),
  ).toBeInViewport({ ratio: 1 });
  await page.getByRole("link", { name: "View examples" }).click();
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

  await page.getByRole("link", { name: "Segui un evento" }).click();
  await expect(page).toHaveURL(/\/guide#journey$/);
  await expect(
    page.getByRole("link", { name: "Torna al simulatore" }),
  ).toHaveAttribute("href", "/#simulator");
  await expect(
    page.getByRole("link", { name: "Vedi gli esempi di webhook" }),
  ).toHaveAttribute("href", "/#webhooks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Guida alle consegne",
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
  await page.goto("/#ledger-title");
  await expect(page).toHaveURL(/\/guide#ledger-title$/);
  const acceptance = page
    .locator("details")
    .filter({ hasText: "Accettazione" });
  await acceptance.locator("summary").click();
  await expect(acceptance.locator("p")).toContainText("409");
});
