import { randomUUID } from "node:crypto";
import { json } from "node:stream/consumers";
import { expect, test } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

// Account exports and passwords must stay out of traces and screenshots.
test.use({ trace: "off", screenshot: "off", hasTouch: true, isMobile: true });

test("credential forms use POST even before JavaScript runs", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    for (const path of ["/login", "/register", "/verify"]) {
      await page.goto(path);
      const form = page.locator("form").filter({
        has: page.locator("input[name=password], input[name=code]"),
      });
      await expect(form).toHaveAttribute("method", "post");
      await expect(form).toHaveAttribute("action", /^\/api\/auth\//);
      const noScriptNotice = form.locator("noscript > p");
      await expect(noScriptNotice).toBeVisible();
      await expect(noScriptNotice).toHaveText(
        "Enable JavaScript to use this form.",
      );
    }
  } finally {
    await context.close();
  }
});

test("a member exports personal data and deletes a private organization while transferring a shared one", async ({
  page,
}) => {
  const config = settings();
  const localDatabase = ["127.0.0.1", "localhost"].includes(
    new URL(config.DATABASE_URL).hostname,
  );
  test.skip(!config.isDemo || !localDatabase, "Requires local demo services");
  const email = randomUUID() + "@example.test";
  const successorEmail = randomUUID() + "@example.test";
  const password = randomUUID();
  const privateId = randomUUID();
  const sharedId = randomUUID();
  const db = database();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/register");
    const signup = page
      .locator("form")
      .filter({ has: page.getByLabel("Email", { exact: true }) });
    await expect(
      signup.getByRole("link", { name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(signup.getByText(/only fictional data/i)).toBeVisible();
    await signup.getByLabel("Name", { exact: true }).fill("Privacy fixture");
    await signup.getByLabel("Email", { exact: true }).fill(email);
    await signup.getByLabel("Password", { exact: true }).fill(password);
    await page.waitForFunction(() => {
      const proof =
        document.querySelector<HTMLInputElement>("[name=formProof]");
      return proof && Date.now() - Number(proof.value.split(".")[0]) >= 650;
    });
    await signup.getByRole("button", { name: "Create an account" }).click();
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();

    const owner = await db.user.findUniqueOrThrow({ where: { email } });
    const successor = await db.user.create({
      data: { email: successorEmail, name: "New owner" },
    });
    await db.organization.create({
      data: {
        id: privateId,
        name: "Private fixture",
        members: { create: [{ userId: owner.id, role: "owner" }] },
      },
    });
    await db.organization.create({
      data: {
        id: sharedId,
        name: "Shared fixture",
        members: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: successor.id, role: "viewer" },
          ],
        },
      },
    });
    await page.goto("/workspace/profile");
    await page.locator(".language-switch").click();
    await expect(
      page.getByRole("heading", { name: "I tuoi dati personali" }),
    ).toBeVisible();
    await page.getByText("Cancella il mio account", { exact: true }).click();
    await expect(page.getByLabel("Trasferisci la proprietà a")).toBeVisible();
    await page.getByText("Cancella il mio account", { exact: true }).click();
    await page.locator(".language-switch").click();
    await expect(
      page.getByRole("heading", { name: "Your personal data" }),
    ).toBeVisible();
    await page.getByText("Download my account data", { exact: true }).tap();
    const exportForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Download JSON" }) });
    await exportForm.getByLabel("Current password").fill("incorrect-password");
    await exportForm.getByRole("button").click();
    await expect(exportForm.getByRole("alert")).toContainText(
      "The password is incorrect.",
    );
    await exportForm.getByLabel("Current password").fill(password);
    const downloadStarted = page.waitForEvent("download");
    await exportForm.getByRole("button").click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe("relayhub-account.json");
    const stream = await download.createReadStream();
    if (!stream) {
      throw new Error("The export download did not contain a file");
    }
    const content = JSON.stringify(await json(stream));
    expect(content).toContain(email);
    expect(content).not.toContain(successorEmail);
    expect(content).not.toContain(password);
    await expect(exportForm.getByLabel("Current password")).toBeEmpty();

    await page.getByText("Delete my account", { exact: true }).click();
    const deletion = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Permanently delete my account",
      }),
    });
    await page.setViewportSize({ width: 320, height: 812 });
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(documentWidth).toBe(320);
    await deletion
      .getByRole("group", { name: "Private fixture" })
      .getByRole("checkbox")
      .check();
    await deletion
      .getByLabel("Transfer ownership to")
      .selectOption(successor.id);
    await deletion.getByLabel("Current password").fill(password);
    const accountConfirmation = deletion.getByRole("checkbox", {
      name: "I confirm permanent account deletion.",
    });
    await expect(accountConfirmation).not.toBeChecked();
    await deletion.getByRole("button").click();
    await expect(page).toHaveURL(/\/workspace\/profile$/);
    expect(await db.user.count({ where: { id: owner.id } })).toBe(1);
    await accountConfirmation.check();
    await deletion.getByRole("button").click();
    const confirmation = page.getByRole("dialog", {
      name: "Your account has been deleted.",
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Go to sign in" }).tap();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/workspace/profile");
    await expect(page).toHaveURL(/\/login$/);
    expect(await db.user.count({ where: { id: owner.id } })).toBe(0);
    expect(await db.organization.count({ where: { id: privateId } })).toBe(0);
    const remaining = await db.organizationMember.findMany({
      where: { organizationId: sharedId },
      select: { userId: true, role: true },
    });
    expect(remaining).toEqual([{ userId: successor.id, role: "owner" }]);
  } finally {
    await db.organization.deleteMany({
      where: { id: { in: [sharedId, privateId] } },
    });
    await db.user.deleteMany({
      where: { email: { in: [email, successorEmail] } },
    });
  }
});
