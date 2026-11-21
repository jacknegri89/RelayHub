import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Enrollment and recovery are deliberately inspected here. Keep their one-time values out of saved artifacts.
test.use({ trace: "off", screenshot: "off" });

function authenticatorCode(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")]
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, "0"),
    )
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

async function waitForFormProof(page: Page) {
  await page.waitForFunction(() => {
    const proof = document.querySelector<HTMLInputElement>("[name=formProof]");
    return proof && Date.now() - Number(proof.value.split(".")[0]) >= 650;
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await waitForFormProof(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("public registration, authenticator challenge, one-use recovery and disabling MFA", async ({
  page,
}) => {
  const email = "factor-" + randomUUID() + "@relayhub.example";
  const password = randomUUID();
  await page.goto("/register");
  await expect(
    page.getByRole("link", { name: "Privacy Policy" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Cookie Policy" })).toBeVisible();
  await expect(page.getByLabel("Invitation code")).toHaveCount(0);
  await page.getByLabel("Name").fill("MFA verification");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await waitForFormProof(page);
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();

  await page.getByLabel("Account menu", { exact: true }).click();
  await page
    .locator("details.account-menu")
    .getByRole("link", { name: "Security", exact: true })
    .click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Passa all’italiano" }).click();
  await expect(
    page.getByRole("heading", { name: "Sicurezza dell’account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Password attuale")).toHaveValue(password);
  await expect(
    page.getByRole("button", { name: "Configura l’app di autenticazione" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByLabel("Current password")).toHaveValue(password);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("img", { name: "Authenticator setup QR code" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await expect(
    page.getByRole("heading", { name: "Add RelayHub to your authenticator" }),
  ).toBeFocused();
  await expect(page.getByLabel("Manual setup key")).toBeHidden();
  await page.getByText("Enter a setup key instead", { exact: true }).click();
  const secret = await page.getByLabel("Manual setup key").inputValue();
  await page.getByLabel("Authenticator code").fill(authenticatorCode(secret));
  await page
    .getByRole("button", { name: "Enable two-factor authentication" })
    .click();
  await expect(
    page.getByText("Two-factor authentication is enabled.", { exact: false }),
  ).toBeVisible();
  const recoveryCodes = page.getByRole("list", { name: "Recovery codes" });
  await expect(recoveryCodes).toBeVisible();
  const recoveryCode = await recoveryCodes
    .locator("code")
    .first()
    .textContent();
  if (!recoveryCode) {
    throw new Error("No recovery code was issued");
  }
  await page.getByRole("button", { name: "I saved my recovery codes" }).click();
  await expect(recoveryCodes).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "How you sign in" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/verify$/);
  const workspaceBeforeFactor = await page.request.get("/workspace", {
    maxRedirects: 0,
  });
  expect(workspaceBeforeFactor.status()).toBe(307);
  const currentCode = authenticatorCode(secret);
  let wrongCode = "000000";
  if (currentCode === wrongCode) {
    wrongCode = "999999";
  }
  await page.getByLabel("Authenticator code").fill(wrongCode);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The code did not match. Try again.",
  );
  await page.getByLabel("Authenticator code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/verify$/);
  await page.getByText("Use a recovery code", { exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode);
  await page.getByRole("button", { name: "Verify recovery code" }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/verify$/);
  await page.getByText("Use a recovery code", { exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode);
  await page.getByRole("button", { name: "Verify recovery code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The recovery code did not match or was already used.",
  );
  await expect(page.getByLabel("Authenticator code")).toHaveCount(0);
  await page.getByRole("button", { name: "Use an authenticator code" }).click();
  await expect(page.getByLabel("Authenticator code")).toBeFocused();
  await page.getByLabel("Authenticator code").fill(authenticatorCode(secret));
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();

  await page.getByLabel("Account menu", { exact: true }).click();
  await page
    .locator("details.account-menu")
    .getByRole("link", { name: "Security", exact: true })
    .click();
  await expect(page.getByLabel("Current password")).toBeHidden();
  await page
    .getByText("Turn off the extra sign-in step", { exact: true })
    .click();
  await page.getByLabel("Current password").fill(password);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Disable two-factor authentication" })
    .click();
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email, password);
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();
});
