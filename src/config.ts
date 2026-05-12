const ALWAYS_REQUIRED_ENV_KEYS = [
  "SLACK_BOT_TOKEN",
  "ADMIN_SLACK_USER_IDS",
] as const;

type AlwaysRequiredEnvKey = (typeof ALWAYS_REQUIRED_ENV_KEYS)[number];

type OptionalEnvKey =
  | "GOOGLE_SHEET_ID"
  | "GOOGLE_SHEET_NAME"
  | "GOOGLE_SHEET_PUBLIC_CSV_URL";

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
  const missingAlwaysRequired = ALWAYS_REQUIRED_ENV_KEYS.filter((key) => {
    const value = getEnv(key);
    return !value;
  });

  if (missingAlwaysRequired.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingAlwaysRequired.join(", ")}`
    );
  }

  const publicCsvUrl = getEnv("GOOGLE_SHEET_PUBLIC_CSV_URL");

  if (isDevelopmentMode() && publicCsvUrl) {
    return;
  }

  const missingSheetConfig = ["GOOGLE_SHEET_ID", "GOOGLE_SHEET_NAME"].filter(
    (key) => !getEnv(key as OptionalEnvKey)
  );

  if (missingSheetConfig.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingSheetConfig.join(", ")}`
    );
  }
}
