import cron from "node-cron";
import { getEnv } from "./config";
import { CELEBRATION_JOB_NAME } from "./constants";
import { sendBirthdayWishes } from "./birthday.service";

function getBirthdayCronExpression() {
  return getEnv("BIRTHDAY_WISH_CRON") || "0 9 * * *";
}

export function startCron() {
  const birthdayCron = getBirthdayCronExpression();

  console.log(`${CELEBRATION_JOB_NAME} cron schedule: ${birthdayCron}`);

  cron.schedule(birthdayCron, async () => {
    console.log(`Running ${CELEBRATION_JOB_NAME} cron (${birthdayCron})...`);

    try {
      await sendBirthdayWishes();
    } catch (error) {
      console.error(`${CELEBRATION_JOB_NAME} cron run failed.`, error);
    }
  });
}
