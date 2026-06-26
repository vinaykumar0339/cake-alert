import { getRequiredEnv } from "./config";
import {
  BOT_ONLINE_TEXT,
  BOT_ONLINE_TITLE,
  CELEBRATION_MONITORING_TEXT,
} from "./constants";
import { getSlackClient } from "./slack";

type AdminMessage = {
  text: string;
  blocks?: Array<Record<string, unknown>>;
  unfurlLinks?: boolean;
};

type AdminDeliveryFailure = {
  recipientId: string;
  reason: string;
};

function getAdminSlackUserIds() {
  return getRequiredEnv("ADMIN_SLACK_USER_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function extractSlackErrorReason(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybe = error as { data?: { error?: string }; message?: string };

    if (maybe.data?.error) {
      return maybe.data.error;
    }

    if (maybe.message) {
      return maybe.message;
    }
  }

  return String(error);
}

async function sendToRecipients(
  message: AdminMessage,
  recipientIds: string[],
  recipientLabel: string
) {
  const slackClient = getSlackClient();

  const responses = await Promise.allSettled(
    recipientIds.map((recipientId) => {
      const payload = message.blocks
        ? {
            channel: recipientId,
            text: message.text,
            blocks: message.blocks,
            unfurl_links: message.unfurlLinks ?? false,
          }
        : {
            channel: recipientId,
            text: message.text,
            unfurl_links: message.unfurlLinks ?? false,
          };

      return slackClient.chat.postMessage(payload);
    })
  );

  const failures: AdminDeliveryFailure[] = [];
  let successCount = 0;

  responses.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successCount += 1;
      return;
    }

    failures.push({
      recipientId: recipientIds[index],
      reason: extractSlackErrorReason(result.reason),
    });
  });

  if (failures.length > 0) {
    console.warn(
      `${recipientLabel} notification failed for ${failures.length} recipient(s): ${failures
        .map((failure) => `${failure.recipientId}(${failure.reason})`)
        .join(", ")}`
    );
  }

  if (successCount === 0) {
    throw new Error(
      `Failed to send ${recipientLabel.toLowerCase()} notification to all recipients: ${failures
        .map((failure) => `${failure.recipientId}(${failure.reason})`)
        .join(", ")}`
    );
  }
}

export async function notifyAdmin(message: string | AdminMessage) {
  if (typeof message === "string") {
    await sendToRecipients({ text: message }, getAdminSlackUserIds(), "Admin");
    return;
  }

  await sendToRecipients(message, getAdminSlackUserIds(), "Admin");
}

export async function notifyBotOnline() {
  await notifyAdmin({
    text: BOT_ONLINE_TEXT,
    blocks: [
      {
        type: "divider",
      },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: BOT_ONLINE_TITLE,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: CELEBRATION_MONITORING_TEXT,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Started at ${new Date().toISOString()}`,
          },
        ],
      },
      {
        type: "divider",
      },
    ],
    unfurlLinks: false,
  });
}
