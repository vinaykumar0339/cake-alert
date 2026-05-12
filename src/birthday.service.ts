import { notifyAdmin } from "./admin-alert.service";
import { isDevelopmentMode } from "./config";
import { getEmployeesFromStore } from "./data/employee.store";
import { getSlackClient } from "./slack";

const sentBirthdayKeys = new Set<string>();
let currentBirthdayDateKey = "";

type BirthdaySendFailure = {
  name: string;
  slackUserId: string;
  reason: string;
};

function getTodayMMDD() {
  const today = new Date();

  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${month}-${day}`;
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function buildBirthdayMessage(name: string, slackUserId: string) {
  return {
    text: `🎂 Happy Birthday, ${name}!`,
    blocks: [
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*:birthday: Happy Birthday <@${slackUserId}>!*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Wishing you a fantastic year ahead filled with joy, growth, and lots of cake! :tada:",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Enjoy your special day! :cake:",
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };
}

async function notifyBirthdaySendFailures(failures: BirthdaySendFailure[]) {
  if (failures.length === 0) {
    return;
  }

  const lines = failures
    .slice(0, 10)
    .map((failure) => `• ${failure.name} (<@${failure.slackUserId}>): ${failure.reason}`);
  const remaining = failures.length - lines.length;

  const blocks: Array<Record<string, unknown>> = [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:warning: Birthday Message Delivery Issues*",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: lines.join("\n"),
      },
    },
  ];

  if (remaining > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `...and ${remaining} more failure(s).`,
        },
      ],
    });
  }

  blocks.push({ type: "divider" });

  try {
    await notifyAdmin({
      text: `Birthday delivery failed for ${failures.length} user(s).`,
      blocks,
      unfurlLinks: false,
    });
  } catch (error) {
    console.error("Failed to notify admins about birthday send failures.", error);
  }
}

export async function sendBirthdayWishes() {
  const today = getTodayMMDD();
  const todayDateKey = getTodayDateKey();
  const isDev = isDevelopmentMode();

  if (!isDev && currentBirthdayDateKey !== todayDateKey) {
    currentBirthdayDateKey = todayDateKey;
    sentBirthdayKeys.clear();
  }

  const employees = getEmployeesFromStore();
  const sendFailures: BirthdaySendFailure[] = [];

  console.log("Today:", today);

  for (const employee of employees) {
    if (employee.birthday !== today) {
      continue;
    }

    const sentKey = `${todayDateKey}:${employee.slackUserId}`;

    if (!isDev && sentBirthdayKeys.has(sentKey)) {
      continue;
    }

    const message = buildBirthdayMessage(employee.name, employee.slackUserId);

    try {
      await getSlackClient().chat.postMessage({
        channel: employee.slackUserId,
        ...message,
        unfurl_links: false,
      });

      if (!isDev) {
        sentBirthdayKeys.add(sentKey);
      }
      console.log(`Sent birthday wish to ${employee.name}`);
    } catch (error) {
      const reason = extractSlackErrorReason(error);

      console.error(
        `Failed to send birthday wish to ${employee.name} (${employee.slackUserId}): ${reason}`
      );

      sendFailures.push({
        name: employee.name,
        slackUserId: employee.slackUserId,
        reason,
      });
    }
  }

  await notifyBirthdaySendFailures(sendFailures);
}
