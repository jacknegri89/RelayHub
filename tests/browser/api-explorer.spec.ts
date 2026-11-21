import { expect, test } from "@playwright/test";

test("visitors can inspect and copy real read API commands without making API calls", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const outgoing: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/")) {
      outgoing.push(request.url());
    }
  });
  await page.goto("/guide");
  await page.getByRole("link", { name: "Explore the API" }).click();
  await expect(page).toHaveURL(/\/#api-explorer$/);
  const explorer = page.getByRole("region", { name: "Explore the API" });
  const code = explorer.locator("pre code");
  await expect(code).toContainText("/api/v1/events");
  await expect(code).toContainText("eventType=github.push");
  await explorer.getByRole("radio", { name: "GitHub pushes" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    explorer.getByRole("radio", { name: "Failed deliveries" }),
  ).toBeChecked();
  await expect(code).toContainText("status=failed");
  await page.keyboard.press("ArrowRight");
  await expect(code).toContainText("status=retry_scheduled");
  await expect(code).toContainText("/api/v1/deliveries");
  await expect(code).toContainText("Authorization: Bearer $RELAYHUB_API_KEY");
  await expect(
    explorer.getByRole("link", { name: "OpenAPI reference" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/jacknegri89/RelayHub/blob/main/docs/api.yaml",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await explorer.getByRole("button", { name: "Copy command" }).click();
  await expect(explorer.getByRole("status")).toHaveText("Command copied.");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // Windows uses CRLF for the same multiline command in the system clipboard.
  expect(clipboard.replaceAll("\r\n", "\n")).toBe(await code.textContent());
  await explorer.locator("summary").click();
  await expect(
    explorer.getByText("RELAYHUB_BASE_URL", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  expect(outgoing).toEqual([]);
});

test("the Italian explorer keeps the command selectable when the clipboard is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Passa all’italiano" }).click();
  const explorer = page.getByRole("region", { name: "Esplora le API" });
  await explorer.getByRole("radio", { name: "Consegne fallite" }).check();
  const code = explorer.locator("pre code");
  await explorer.getByRole("button", { name: "Copia comando" }).click();
  await expect(explorer.getByRole("status")).toContainText("Copia manualmente");
  await expect(code).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    await code.textContent(),
  );
  await explorer.getByRole("radio", { name: "Tentativi programmati" }).check();
  await expect(explorer.getByRole("status")).toBeEmpty();
});
