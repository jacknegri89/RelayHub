import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

test("a member edits their profile and sees the saved identity after reload", async ({
  page,
}) => {
  test.skip(!settings().isDemo, "Requires an isolated demo workspace");
  const email = randomUUID() + "@example.test";
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/workspace/profile");
    await expect(page).toHaveURL(/\/login$/);
    const origin = new URL(page.url()).origin;
    const anonymousEdit = await page.request.post("/api/profile", {
      headers: { origin },
      data: { name: "Marta Rossi" },
    });
    expect(anonymousEdit.status()).toBe(401);
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("Initial name");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(randomUUID());
    await page.waitForFunction(() => {
      const proof =
        document.querySelector<HTMLInputElement>("[name=formProof]");
      return proof && Date.now() - Number(proof.value.split(".")[0]) >= 650;
    });
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();
    await page.getByLabel("Account menu", { exact: true }).click();
    await page
      .locator(".account-menu")
      .getByRole("link", { name: "Profile", exact: true })
      .click();
    const accountMenuAudit = await new AxeBuilder({ page })
      .withRules(["label-content-name-mismatch"])
      .analyze();
    expect(accountMenuAudit.violations).toEqual([]);
    const unconfirmedEdit = await page.request.post("/api/profile", {
      headers: { origin },
      data: { name: "Other name" },
    });
    expect(unconfirmedEdit.status()).toBe(403);
    await page.getByLabel("Display name").fill("   ");
    await page.getByRole("button", { name: "Save profile" }).click();
    const profileForm = page
      .locator("form")
      .filter({ has: page.getByLabel("Display name") });
    await expect(profileForm.getByRole("alert")).toContainText("Enter a name");
    await page.getByLabel("Display name").fill("  Marta Rossi  ");
    await page.getByRole("radio", { name: "Initials" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Signal" })).toBeChecked();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(profileForm.getByRole("status")).toHaveText("Profile saved.");
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Marta Rossi");
    await expect(page.getByRole("radio", { name: "Signal" })).toBeChecked();
    await page.getByLabel("Account menu", { exact: true }).click();
    await expect(page.locator(".account-menu")).toContainText("Marta Rossi");
    await expect(page.locator(".account-menu summary img")).toHaveAttribute(
      "src",
      "/avatars/signal.png",
    );
  } finally {
    await database().user.deleteMany({ where: { email } });
  }
});
