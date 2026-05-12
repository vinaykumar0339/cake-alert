import dotenv from "dotenv";
import { WebClient } from "@slack/web-api";

dotenv.config();

export const slackClient = new WebClient(
  process.env.SLACK_BOT_TOKEN
);