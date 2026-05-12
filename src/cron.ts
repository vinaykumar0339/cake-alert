import cron from "node-cron";
import { isDevelopmentMode } from "./config";
import { sendBirthdayWishes } from "./birthday.service";
import {
  getSheetSyncCronExpression,
  syncEmployeesFromGoogleSheet,
} from "./google-sheet.service";

function getBirthdayCronExpression() {
  if (isDevelopmentMode()) {
    return "* * * * *";
  }

  return process.env.BIRTHDAY_WISH_CRON || "0 9 * * *";
}

export function startCron() {
  const birthdayCron = getBirthdayCronExpression();
  const sheetSyncCron = getSheetSyncCronExpression();

  console.log(`Birthday cron schedule: ${birthdayCron}`);
  console.log(`Sheet sync cron schedule: ${sheetSyncCron}`);

  cron.schedule(birthdayCron, async () => {
    console.log(`Running birthday cron (${birthdayCron})...`);

    try {
      await sendBirthdayWishes();
    } catch (error) {
      console.error("Birthday cron run failed.", error);
    }
  });

  cron.schedule(sheetSyncCron, async () => {
    console.log(`Running sheet sync cron (${sheetSyncCron})...`);

    try {
      await syncEmployeesFromGoogleSheet("cron");
    } catch (error) {
      console.error("Sheet sync cron run failed.", error);
    }
  });
}
