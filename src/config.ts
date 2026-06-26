const ALWAYS_REQUIRED_ENV_KEYS = [
  "SLACK_BOT_TOKEN",
  "ADMIN_SLACK_USER_IDS",
  "WISHES_SLACK_TARGET_IDS",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_NAME",
] as const;

type AlwaysRequiredEnvKey = (typeof ALWAYS_REQUIRED_ENV_KEYS)[number];

type OptionalEnvKey =
  | "BIRTHDAY_WISH_CRON"
  | "GOOGLE_OAUTH_CLIENT_ID"
  | "GOOGLE_OAUTH_CLIENT_SECRET"
  | "GOOGLE_OAUTH_REFRESH_TOKEN";

type EnvKey = AlwaysRequiredEnvKey | OptionalEnvKey;

export function getEnv(key: EnvKey): string | undefined {
  return process.env[key]?.trim();
}

export function getRequiredEnv(key: EnvKey): string {
  const value = getEnv(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function isDevelopmentMode() {
  return process.env.NODE_ENV === "development";
}

export function validateRequiredEnv() {
  const missingRequired = ALWAYS_REQUIRED_ENV_KEYS.filter((key) => {
    const value = getEnv(key);
    return !value;
  });

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingRequired.join(", ")}`
    );
  }

  const hasAnyOauthConfig =
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_ID")) ||
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_SECRET")) ||
    Boolean(getEnv("GOOGLE_OAUTH_REFRESH_TOKEN"));

  const hasOauthConfig =
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_ID")) &&
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_SECRET")) &&
    Boolean(getEnv("GOOGLE_OAUTH_REFRESH_TOKEN"));

  if (hasAnyOauthConfig && !hasOauthConfig) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN must all be set together."
    );
  }

  if (!hasOauthConfig) {
    throw new Error(
      "Missing required Google Sheets OAuth variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN."
    );
  }
}
