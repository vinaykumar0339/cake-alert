import { getRequiredEnv } from "./config";
import { getSlackClient } from "./slack";

type AdminMessage = {
  text: string;
  blocks?: Array<Record<string, unknown>>;
  unfurlLinks?: boolean;
};

type AdminDeliveryFailure = {
  adminId: string;
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

async function sendToAdmins(message: AdminMessage) {
  const slackClient = getSlackClient();
  const adminIds = getAdminSlackUserIds();

  const responses = await Promise.allSettled(
    adminIds.map((adminId) => {
      const payload = message.blocks
        ? {
            channel: adminId,
            text: message.text,
            blocks: message.blocks,
            unfurl_links: message.unfurlLinks ?? false,
          }
        : {
            channel: adminId,
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
      adminId: adminIds[index],
      reason: extractSlackErrorReason(result.reason),
    });
  });

  if (failures.length > 0) {
    console.warn(
      `Admin notification failed for ${failures.length} admin(s): ${failures
        .map((failure) => `${failure.adminId}(${failure.reason})`)
        .join(", ")}`
    );
  }

  if (successCount === 0) {
    throw new Error(
      `Failed to send admin notification to all admins: ${failures
        .map((failure) => `${failure.adminId}(${failure.reason})`)
        .join(", ")}`
    );
  }
}

export async function notifyAdmin(message: string | AdminMessage) {
  if (typeof message === "string") {
    await sendToAdmins({ text: message });
    return;
  }

  await sendToAdmins(message);
}

export async function notifyBotOnline() {
  await sendToAdmins({
    text: "Cake Alert bot is online.",
    blocks: [
      {
        type: "divider",
      },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Cake Alert Bot Online",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":white_check_mark: Bot started successfully and is now monitoring birthdays.",
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
