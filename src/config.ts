import { validateRequiredKeychainSecrets } from "./keychain";

const ALWAYS_REQUIRED_ENV_KEYS = [
  "ADMIN_SLACK_USER_IDS",
  "WISHES_SLACK_TARGET_IDS",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_NAME",
] as const;

type AlwaysRequiredEnvKey = (typeof ALWAYS_REQUIRED_ENV_KEYS)[number];

type OptionalEnvKey = "BIRTHDAY_WISH_CRON";

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

  validateRequiredKeychainSecrets();
}
