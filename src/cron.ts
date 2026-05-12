import cron from "node-cron";
import { sendBirthdayWishes } from "./birthday.service";

export function startCron() {
  cron.schedule("* * * * *", async () => {
    console.log("Running birthday cron...");

    await sendBirthdayWishes();
  });
}