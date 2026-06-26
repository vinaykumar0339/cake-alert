import { notifyAdmin } from "./admin-alert.service";
import { getRequiredEnv, isDevelopmentMode } from "./config";
import {
  CELEBRATION_DELIVERY_ISSUES_TITLE,
  CELEBRATION_TYPES,
  GOOGLE_SHEET_BIRTHDAY_CRON_TRIGGER,
  SLACK_USER_NOT_FOUND_REASON,
} from "./constants";
import { loadEmployeesFromGoogleSheet } from "./google-sheet.service";
import { getSlackClient, lookupSlackUserIdByEmail } from "./slack";

const sentCelebrationKeys = new Set<string>();
let currentCelebrationDateKey = "";

type CelebrationType =
  (typeof CELEBRATION_TYPES)[keyof typeof CELEBRATION_TYPES];

type CelebrationSendFailure = {
  name: string;
  email: string;
  celebrationType: CelebrationType;
  targetId: string;
  reason: string;
};

function getWishesSlackTargetIds() {
  return getRequiredEnv("WISHES_SLACK_TARGET_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

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

function getMonthDayFromIsoDate(value: string) {
  return value.slice(5, 10);
}

function getWorkAnniversaryYears(joiningDate: string, todayDateKey: string) {
  const joiningYear = Number(joiningDate.slice(0, 4));
  const currentYear = Number(todayDateKey.slice(0, 4));
  return currentYear - joiningYear;
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

function buildBirthdayMessage(name: string, celebrantReference: string) {
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
          text: `It’s ${celebrantReference}’s Birthday!!! :tada:`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Let’s take a moment to wish them all the happiness, success, and a wonderful year ahead.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Here’s to a wonderful year ahead and, of course, lots of cake :birthday: :cake:",
        },
      },
    ],
  };
}

function buildWorkAnniversaryMessage(
  name: string,
  celebrantReference: string,
  years: number
) {
  return {
    text: `🎉 Happy Work Anniversary, ${name}!`,
    blocks: [
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Happy Work Anniversary, ${celebrantReference}! :confetti_ball:`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Congratulations on completing ${years} amazing year${years === 1 ? "" : "s"} with us!`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Your hard work, dedication, and contributions are truly appreciated.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Wishing you continued success and many more milestones ahead! :rocket:",
        },
      },
    ],
  };
}

async function notifyCelebrationSendFailures(failures: CelebrationSendFailure[]) {
  if (failures.length === 0) {
    return;
  }

  const lines = failures
    .slice(0, 10)
    .map(
      (failure) =>
        `• ${failure.name} (${failure.email}, ${failure.celebrationType}, target=${failure.targetId}): ${failure.reason}`
    );
  const remaining = failures.length - lines.length;

  const blocks: Array<Record<string, unknown>> = [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: CELEBRATION_DELIVERY_ISSUES_TITLE,
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
      text: `Celebration delivery failed for ${failures.length} message(s).`,
      blocks,
      unfurlLinks: false,
    });
  } catch (error) {
    console.error("Failed to notify admins about celebration send failures.", error);
  }
}

export async function sendBirthdayWishes() {
  const today = getTodayMMDD();
  const todayDateKey = getTodayDateKey();
  const isDev = isDevelopmentMode();
  const wishesSlackTargetIds = getWishesSlackTargetIds();

  if (!isDev && currentCelebrationDateKey !== todayDateKey) {
    currentCelebrationDateKey = todayDateKey;
    sentCelebrationKeys.clear();
  }

  const employees = await loadEmployeesFromGoogleSheet(
    GOOGLE_SHEET_BIRTHDAY_CRON_TRIGGER
  );
  const sendFailures: CelebrationSendFailure[] = [];
  const birthdayCelebrants = employees.filter((employee) => employee.birthday === today);
  const workAnniversaryCelebrants = employees.filter(
    (employee) => getMonthDayFromIsoDate(employee.joiningDate) === today
  );

  console.log("Today:", today);
  console.log(
    `Matched ${birthdayCelebrants.length} birthday(s) and ${workAnniversaryCelebrants.length} work anniversary(ies) for ${today}.`
  );

  if (birthdayCelebrants.length === 0 && workAnniversaryCelebrants.length === 0) {
    console.log("No celebrations found for today.");
  }

  for (const employee of employees) {
    const shouldCelebrateBirthday = employee.birthday === today;
    const shouldCelebrateWorkAnniversary =
      getMonthDayFromIsoDate(employee.joiningDate) === today;

    if (!shouldCelebrateBirthday && !shouldCelebrateWorkAnniversary) {
      continue;
    }

    let slackUserId: string | null = null;

    try {
      slackUserId = await lookupSlackUserIdByEmail(employee.email);
    } catch (error) {
      const reason = extractSlackErrorReason(error);

      console.error(
        `Failed to resolve Slack user for ${employee.name} (${employee.email}): ${reason}`
      );
    }

    if (!slackUserId) {
      console.warn(
        `Falling back to employee name for wishes because Slack user lookup failed for ${employee.name} (${employee.email}). ${SLACK_USER_NOT_FOUND_REASON}`
      );
    }

    const celebrantReference = slackUserId ? `<@${slackUserId}>` : employee.name;

    if (shouldCelebrateBirthday) {
      for (const targetId of wishesSlackTargetIds) {
        const sentKey = `${todayDateKey}:${CELEBRATION_TYPES.birthday}:${employee.email.toLowerCase()}:${targetId}`;

        if (isDev || !sentCelebrationKeys.has(sentKey)) {
          const message = buildBirthdayMessage(employee.name, celebrantReference);

          try {
            await getSlackClient().chat.postMessage({
              channel: targetId,
              ...message,
              unfurl_links: false,
            });

            if (!isDev) {
              sentCelebrationKeys.add(sentKey);
            }

            console.log(`Sent birthday wish to ${employee.name} in ${targetId}`);
          } catch (error) {
            const reason = extractSlackErrorReason(error);

            console.error(
              `Failed to send birthday wish to ${employee.name} (${employee.email}) in ${targetId}: ${reason}`
            );

            sendFailures.push({
              name: employee.name,
              email: employee.email,
              celebrationType: CELEBRATION_TYPES.birthday,
              targetId,
              reason,
            });
          }
        }
      }
    }

    if (shouldCelebrateWorkAnniversary) {
      const years = getWorkAnniversaryYears(employee.joiningDate, todayDateKey);

      if (years <= 0) {
        continue;
      }

      for (const targetId of wishesSlackTargetIds) {
        const sentKey = `${todayDateKey}:${CELEBRATION_TYPES.workAnniversary}:${employee.email.toLowerCase()}:${targetId}`;

        if (isDev || !sentCelebrationKeys.has(sentKey)) {
          const message = buildWorkAnniversaryMessage(
            employee.name,
            celebrantReference,
            years
          );

          try {
            await getSlackClient().chat.postMessage({
              channel: targetId,
              ...message,
              unfurl_links: false,
            });

            if (!isDev) {
              sentCelebrationKeys.add(sentKey);
            }

            console.log(
              `Sent work anniversary wish to ${employee.name} for ${years} year(s) in ${targetId}`
            );
          } catch (error) {
            const reason = extractSlackErrorReason(error);

            console.error(
              `Failed to send work anniversary wish to ${employee.name} (${employee.email}) in ${targetId}: ${reason}`
            );

            sendFailures.push({
              name: employee.name,
              email: employee.email,
              celebrationType: CELEBRATION_TYPES.workAnniversary,
              targetId,
              reason,
            });
          }
        }
      }
    }
  }

  await notifyCelebrationSendFailures(sendFailures);
}
