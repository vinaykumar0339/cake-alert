import { employees } from "./data/employees";
import { slackClient } from "./slack";

function getTodayMMDD() {
  const today = new Date();

  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${month}-${day}`;
}

function buildBirthdayMessage(name: string, slackUserId: string) {
  return {
    text: `🎂 Happy Birthday, ${name}!`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:birthday: *Happy Birthday <@${slackUserId}>!*`,
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
    ],
  };
}

export async function sendBirthdayWishes() {
  const today = getTodayMMDD();

  console.log("Today:", today);

  for (const employee of employees) {
    if (employee.birthday === today) {
      const message = buildBirthdayMessage(employee.name, employee.slackUserId);

      await slackClient.chat.postMessage({
        channel: employee.slackUserId,
        ...message,
      });

      console.log(`Sent birthday wish to ${employee.name}`);
    }
  }
}
