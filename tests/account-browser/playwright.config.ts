import { defineConfig } from "@playwright/test";
import standard from "../../playwright.config";

export default defineConfig({
  ...standard,
  testDir: ".",
  testMatch: "account-mail.spec.ts",
  use: { ...standard.use, trace: "off", screenshot: "off" },
});
