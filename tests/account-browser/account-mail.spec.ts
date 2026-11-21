import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { database } from "@relayhub/db";

const baseURL = new URL(process.env.RELAYHUB_BASE_URL ?? "");
const mailpit = new URL(process.env.RELAYHUB_TEST_MAILPIT_URL ?? "");
const dbURL = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.RELAYHUB_MODE !== "demo" ||
  ![baseURL, mailpit, dbURL].every((url) =>
    ["127.0.0.1", "localhost"].includes(url.hostname),
  )
) {
  throw new Error(
    "Run the account browser test with an isolated local demo and local Mailpit.",
  );
}
async function waitForProof(page: Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector<HTMLInputElement>("[name=formProof]");
    return input && Date.now() - Number(input.value.split(".")[0]) >= 650;
  });
}

async function inboxLink(
  email: string,
  path: string,
  ids: Set<string>,
  browserPage: Page,
) {
  let link: URL | undefined;
  let html = "";
  // Only read this run's synthetic mailbox; never scan or clear an entire inbox.
  await expect
    .poll(
      async () => {
        const search = new URL("/api/v1/search", mailpit);
        search.searchParams.set("query", "to:" + email);
        const { messages } = (await (await fetch(search)).json()) as {
          messages: { ID: string }[];
        };
        for (const mail of messages) {
          ids.add(mail.ID);
          const response = await fetch(
            new URL("/api/v1/message/" + mail.ID, mailpit),
          );
          const message = (await response.json()) as {
            Text: string;
            HTML: string;
          };
          const candidate = message.Text.split(/\s+/).find((word) =>
            word.startsWith(baseURL.origin + path + "#"),
          );
          if (candidate) {
            link = new URL(candidate);
            html = message.HTML;
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  if (!link) {
    throw new Error("Missing account link");
  }
  // Inspect the delivered markup without navigating to a token or printing it on a failed assertion.
  const matchingAction = await browserPage.evaluate(
    ({ html, url }) => {
      const message = new DOMParser().parseFromString(html, "text/html");
      return Array.from(message.querySelectorAll("a[href]")).some((anchor) => {
        const label = anchor.textContent?.trim();
        return (
          anchor.getAttribute("href") === url && Boolean(label) && label !== url
        );
      });
    },
    { html, url: link.href },
  );
  expect(
    matchingAction,
    "The HTML action must use the same link as the text part",
  ).toBe(true);
  return link;
}

test("confirms an address and resets a password from real local messages", async ({
  page,
  browser,
}) => {
  const email = randomUUID() + "@relayhub.example";
  const currentPassword = randomUUID();
  const newPassword = randomUUID();
  const ids = new Set<string>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const resetBrowser = await browser.newContext({
    baseURL: baseURL.origin,
    viewport: { width: 375, height: 800 },
  });
  const resetPage = await resetBrowser.newPage();
  resetPage.on("pageerror", (error) => errors.push(error.name));
  try {
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("Account acceptance");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(currentPassword);
    await waitForProof(page);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    const verification = await inboxLink(email, "/confirm-email", ids, page);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(currentPassword);
    await waitForProof(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();
    await page.goto(verification.href);
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await expect(page.getByText("Your email is verified.")).toBeVisible();
    expect(Boolean(new URL(page.url()).hash)).toBe(false);
    await page.goto("/workspace/security");
    await expect(
      page.getByText("Verified address", { exact: false }),
    ).toBeVisible();

    await resetPage.goto("/login");
    await resetPage
      .getByRole("link", { name: "Forgot your password?" })
      .click();
    await resetPage.getByRole("button", { name: "Passa all’italiano" }).click();
    await expect(
      resetPage.getByRole("heading", { name: "Password dimenticata?" }),
    ).toBeVisible();
    await resetPage.getByLabel("Email", { exact: true }).fill(email);
    await waitForProof(resetPage);
    await resetPage
      .getByRole("button", { name: "Richiedi link di recupero" })
      .click();
    await expect(
      resetPage.getByText("Se questo indirizzo appartiene", { exact: false }),
    ).toBeVisible();
    const reset = await inboxLink(email, "/reset-password", ids, resetPage);
    await resetPage.goto(reset.href);
    await resetPage.getByLabel("Nuova password").fill(newPassword);
    await resetPage
      .getByRole("button", { name: "Salva la nuova password" })
      .click();
    await expect(
      resetPage.getByText("La password è stata cambiata.", { exact: false }),
    ).toBeVisible();
    expect(Boolean(new URL(resetPage.url()).hash)).toBe(false);
    expect(
      await resetPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await waitForProof(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await resetBrowser.close();
    if (ids.size) {
      await fetch(new URL("/api/v1/messages", mailpit), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ IDs: [...ids] }),
      });
    }
    const db = database();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (user) {
      await db.verification.deleteMany({
        where: {
          OR: [{ id: "relayhub-mailbox:" + user.id }, { value: user.id }],
        },
      });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});
