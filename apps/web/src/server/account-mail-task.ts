import { after } from "next/server";
import { log } from "@relayhub/shared/log";

export function scheduleAccountMail(task: () => Promise<void>) {
  after(async () => {
    try {
      await task();
    } catch {
      // Provider and database exceptions can contain headers or query values.
      log("error", "account_email_task_failed");
    }
  });
}
