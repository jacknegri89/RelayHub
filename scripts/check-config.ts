import { settings } from "@relayhub/shared/config";

try {
  settings();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
}
