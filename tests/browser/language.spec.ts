import { expect, test } from "@playwright/test";

test("language follows navigation and preserves a partially completed registration", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "placeholder",
    "At least 12 characters",
  );
  await page.getByLabel("Name", { exact: true }).fill("Relay Operator");
  await page.getByRole("button", { name: "Passa all’italiano" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "placeholder",
    "Almeno 12 caratteri",
  );
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(
    "Relay Operator",
  );
  await expect(
    page.getByRole("heading", { name: "Crea un account" }),
  ).toBeVisible();
  await page.locator('a[href="/cookies"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.getByText(/relayhub_lang/)).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Cookie Policy", exact: true }),
  ).toBeVisible();
});
