import { WebClient } from "@slack/web-api";
import { getRequiredEnv } from "./config";

let slackClient: WebClient | null = null;

export function getSlackClient() {
  if (slackClient) {
    return slackClient;
  }

  slackClient = new WebClient(getRequiredEnv("SLACK_BOT_TOKEN"));
  return slackClient;
}
