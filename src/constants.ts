export const APP_NAME = "Cake Alert";
export const BOT_NAME = "Vymo Wishes";

export const CELEBRATION_JOB_NAME = "celebration";
export const CELEBRATION_MONITORING_TEXT =
  ":white_check_mark: Bot started successfully and is now monitoring celebrations.";
export const BOT_ONLINE_TITLE = `${APP_NAME} Bot Online`;
export const BOT_ONLINE_TEXT = `${BOT_NAME} bot is online.`;
export const BOT_STARTED_LOG = `🎂 ${APP_NAME} Bot Started`;
export const BOT_START_FAILED_LOG = `${APP_NAME} Bot failed to start.`;

export const GOOGLE_SHEET_SOURCE_NAME = "Google Sheet";
export const GOOGLE_SHEET_BIRTHDAY_CRON_TRIGGER = "birthday-cron";
export const GOOGLE_SHEET_EMPTY_ERROR = `${GOOGLE_SHEET_SOURCE_NAME} is empty.`;
export const GOOGLE_SHEET_NO_VALID_EMPLOYEES_ERROR = `No valid employees found in ${GOOGLE_SHEET_SOURCE_NAME}.`;
export const GOOGLE_SHEET_LOAD_FAILED_LOG = `${GOOGLE_SHEET_SOURCE_NAME} load failed.`;
export const GOOGLE_SHEET_UNKNOWN_ERROR = `Unknown ${GOOGLE_SHEET_SOURCE_NAME} error.`;
export const GOOGLE_SHEET_VALIDATION_ISSUES_TITLE = `*:warning: ${APP_NAME} Sheet Validation Issues*`;
export const GOOGLE_SHEET_LOAD_FAILED_TITLE = `*:x: ${APP_NAME} Sheet Load Failed*`;
export const GOOGLE_SHEET_WARNING_TEXT_PREFIX = `${APP_NAME} sheet warning:`;
export const GOOGLE_SHEET_LOAD_FAILED_TEXT_PREFIX = `${APP_NAME} sheet load failed:`;

export const CELEBRATION_DELIVERY_ISSUES_TITLE =
  "*:warning: Celebration Message Delivery Issues*";
export const SLACK_USER_NOT_FOUND_REASON = "Slack user not found for employee email.";

export const CELEBRATION_TYPES = {
  birthday: "birthday",
  workAnniversary: "work-anniversary",
} as const;
