import dotenv from "dotenv";
import { notifyBotOnline } from "./admin-alert.service";
import { validateRequiredEnv } from "./config";
import { startCron } from "./cron";
import { syncEmployeesFromGoogleSheet } from "./google-sheet.service";

dotenv.config();

async function main() {
  validateRequiredEnv();

  console.log("🎂 Cake Alert Bot Started");

  await notifyBotOnline();
  await syncEmployeesFromGoogleSheet("startup");

  startCron();
}

main().catch((error) => {
  console.error("Cake Alert Bot failed to start.", error);
  process.exitCode = 1;
});
