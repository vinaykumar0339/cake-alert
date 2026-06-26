import dotenv from "dotenv";
import path from "node:path";
import { notifyBotOnline } from "./admin-alert.service";
import { validateRequiredEnv } from "./config";
import { BOT_START_FAILED_LOG, BOT_STARTED_LOG } from "./constants";
import { startCron } from "./cron";

function getEnvFilePath() {
  const isProduction = process.env.NODE_ENV === "production";
  const normalizedNodeEnv = isProduction ? "production" : "development";

  process.env.NODE_ENV = normalizedNodeEnv;

  return path.resolve(
    process.cwd(),
    isProduction ? ".env.production" : ".env.dev"
  );
}

dotenv.config({ path: getEnvFilePath() });

async function main() {
  validateRequiredEnv();

  console.log(BOT_STARTED_LOG);

  await notifyBotOnline();
  startCron();
}

main().catch((error) => {
  console.error(BOT_START_FAILED_LOG, error);
  process.exitCode = 1;
});
