import { WebClient } from "@slack/web-api";
import { getRequiredEnv } from "./config";

let slackClient: WebClient | null = null;
const slackUserIdByEmail = new Map<string, string>();

export function getSlackClient() {
  if (slackClient) {
    return slackClient;
  }

  slackClient = new WebClient(getRequiredEnv("SLACK_BOT_TOKEN"));
  return slackClient;
}

export async function lookupSlackUserIdByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (slackUserIdByEmail.has(normalizedEmail)) {
    return slackUserIdByEmail.get(normalizedEmail) ?? null;
  }

  const response = await getSlackClient().users.lookupByEmail({
    email: normalizedEmail,
  });
  const slackUserId = response.user?.id ?? null;

  if (slackUserId) {
    slackUserIdByEmail.set(normalizedEmail, slackUserId);
  }

  return slackUserId;
}
