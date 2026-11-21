import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

// The one-time reveal is the object of this check. Keep browser artifacts free of bearer credentials.
test.use({ trace: "off", screenshot: "off" });

test("an owner grants and revokes access for a reporting service", async ({
  page,
}) => {
  const db = database();
  const config = settings();
  test.skip(!config.isDemo, "Requires an isolated demo workspace");
  const email = randomUUID() + "@relayhub.example";
  const name = "API browser " + randomUUID();
  try {
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("Reporting owner");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(randomUUID());
    await page.waitForFunction(() => {
      const proof =
        document.querySelector<HTMLInputElement>("[name=formProof]");
      return proof && Date.now() - Number(proof.value.split(".")[0]) >= 650;
    });
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    const keyName = page.getByLabel("Key name", { exact: true });
    await expect(keyName).toBeHidden();
    await page.getByText("Issue a new key", { exact: true }).click();
    await expect(keyName).toHaveAttribute("placeholder", /\S/);
    await keyName.fill("Delivery reports");
    await page.getByRole("button", { name: "Create API key" }).click();
    const reveal = page.getByLabel("API key", { exact: true });
    const key = await reveal.inputValue();
    const url = new URL("/api/v1/events", config.RELAYHUB_BASE_URL);
    const readEvents = () =>
      fetch(url, { headers: { authorization: "Bearer " + key } });
    const allowed = await readEvents();
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ items: [], nextCursor: null });
    await page.reload();
    await expect(reveal).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revoke key" }).click();
    await expect.poll(async () => (await readEvents()).status).toBe(401);
  } finally {
    await db.organization.deleteMany({
      where: { name, members: { some: { user: { email } } } },
    });
    await db.user.deleteMany({ where: { email } });
  }
});
