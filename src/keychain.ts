import { spawnSync } from "node:child_process";

const KEYCHAIN_SERVICE_NAME = "vymo_wishes";

const KEYCHAIN_ACCOUNTS = {
  slackBotToken: "vymo_wishes_slack_bot_token",
  googleOauthClientId: "vymo_wishes_google_oauth_client_id",
  googleOauthClientSecret: "vymo_wishes_google_oauth_client_secret",
  googleOauthRefreshToken: "vymo_wishes_google_oauth_refresh_token",
} as const;

type KeychainAccountKey = keyof typeof KEYCHAIN_ACCOUNTS;

type GoogleOauthKeychainSecrets = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type RequiredKeychainAccountKey = keyof typeof KEYCHAIN_ACCOUNTS;

function assertMacOsKeychainAvailable() {
  if (process.platform !== "darwin") {
    throw new Error(
      "Vymo Wishes secrets are loaded from macOS Keychain, which is only available on macOS."
    );
  }
}

function readEncodedKeychainValue(account: string) {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE_NAME, "-w"],
    {
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function decodeBase64Secret(encodedValue: string, account: string) {
  try {
    return Buffer.from(encodedValue, "base64").toString("utf8").trim();
  } catch {
    throw new Error(
      `Keychain secret for account "${account}" under service "${KEYCHAIN_SERVICE_NAME}" is not valid base64.`
    );
  }
}

function getRequiredKeychainSecret(key: KeychainAccountKey) {
  assertMacOsKeychainAvailable();

  const account = KEYCHAIN_ACCOUNTS[key];
  const encodedValue = readEncodedKeychainValue(account);

  if (!encodedValue) {
    throw new Error(
      `Missing Keychain secret for account "${account}" under service "${KEYCHAIN_SERVICE_NAME}".`
    );
  }

  const decodedValue = decodeBase64Secret(encodedValue, account);

  if (!decodedValue) {
    throw new Error(
      `Keychain secret for account "${account}" under service "${KEYCHAIN_SERVICE_NAME}" is empty.`
    );
  }

  return decodedValue;
}

export function validateRequiredKeychainSecrets() {
  const missingAccounts = Object.entries(KEYCHAIN_ACCOUNTS)
    .filter(([, account]) => !readEncodedKeychainValue(account))
    .map(([, account]) => account);

  assertMacOsKeychainAvailable();

  if (missingAccounts.length > 0) {
    throw new Error(
      `Missing required Keychain secrets under service "${KEYCHAIN_SERVICE_NAME}": ${missingAccounts.join(", ")}.`
    );
  }
}

export function getRequiredKeychainValue(key: RequiredKeychainAccountKey) {
  return getRequiredKeychainSecret(key);
}

export function getGoogleOauthKeychainSecrets(): GoogleOauthKeychainSecrets {
  return {
    clientId: getRequiredKeychainSecret("googleOauthClientId"),
    clientSecret: getRequiredKeychainSecret("googleOauthClientSecret"),
    refreshToken: getRequiredKeychainSecret("googleOauthRefreshToken"),
  };
}

export function getGoogleOauthKeychainSetupSummary() {
  return {
    serviceName: KEYCHAIN_SERVICE_NAME,
    accounts: KEYCHAIN_ACCOUNTS,
  };
}
