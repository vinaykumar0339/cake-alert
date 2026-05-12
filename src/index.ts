import dotenv from "dotenv";
import { startCron } from "./cron";

dotenv.config();

console.log("🎂 Cake Alert Bot Started");

startCron();