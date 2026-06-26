import { google } from "googleapis";
import { notifyAdmin } from "./admin-alert.service";
import { getEnv, getRequiredEnv } from "./config";
import {
  GOOGLE_SHEET_EMPTY_ERROR,
  GOOGLE_SHEET_LOAD_FAILED_LOG,
  GOOGLE_SHEET_LOAD_FAILED_TEXT_PREFIX,
  GOOGLE_SHEET_LOAD_FAILED_TITLE,
  GOOGLE_SHEET_NO_VALID_EMPLOYEES_ERROR,
  GOOGLE_SHEET_SOURCE_NAME,
  GOOGLE_SHEET_UNKNOWN_ERROR,
  GOOGLE_SHEET_VALIDATION_ISSUES_TITLE,
  GOOGLE_SHEET_WARNING_TEXT_PREFIX,
} from "./constants";
import { type Employee } from "./data/employees";

let activeEmployeeLoad: Promise<Employee[]> | null = null;
let lastValidationSignature = "";

function getGoogleSheetId() {
  return getRequiredEnv("GOOGLE_SHEET_ID");
}

function getGoogleSheetName() {
  return getRequiredEnv("GOOGLE_SHEET_NAME");
}

function getSourceLabel() {
  return `${getGoogleSheetName()} (${getGoogleSheetId()})`;
}

function hasOauthConfig() {
  return (
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_ID")) &&
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_SECRET")) &&
    Boolean(getEnv("GOOGLE_OAUTH_REFRESH_TOKEN"))
  );
}

function hasAnyOauthConfig() {
  return (
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_ID")) ||
    Boolean(getEnv("GOOGLE_OAUTH_CLIENT_SECRET")) ||
    Boolean(getEnv("GOOGLE_OAUTH_REFRESH_TOKEN"))
  );
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isValidDate(day: number, month: number, year: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseStrictDayMonthYear(value: string) {
  const normalized = value.trim();

  if (!/^\d{2}-\d{2}-\d{4}$/.test(normalized)) {
    return null;
  }

  const [dayRaw, monthRaw, yearRaw] = normalized.split("-");
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (!isValidDate(day, month, year)) {
    return null;
  }

  return { day, month, year };
}

function normalizeBirthday(value: string) {
  const parsed = parseStrictDayMonthYear(value);

  if (!parsed) {
    return null;
  }

  return `${pad(parsed.month)}-${pad(parsed.day)}`;
}

function normalizeJoiningDate(value: string) {
  const parsed = parseStrictDayMonthYear(value);

  if (!parsed) {
    return null;
  }

  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
}

function findHeaderIndex(normalizedHeaders: string[], aliases: string[]) {
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(alias);

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function parseSheetRows(rows: string[][]) {
  const validationErrors: string[] = [];

  if (rows.length === 0) {
    return {
      employees: [],
      validationErrors: [GOOGLE_SHEET_EMPTY_ERROR],
    };
  }

  const headerRow = rows[0].map((cell) => String(cell).trim());
  const normalizedHeaders = headerRow.map(normalizeHeader);

  const employeeIdIndex = findHeaderIndex(normalizedHeaders, [
    "employeeid",
    "empid",
  ]);
  const nameIndex = findHeaderIndex(normalizedHeaders, ["fullname", "name"]);
  const emailIndex = findHeaderIndex(normalizedHeaders, ["email", "workemail"]);
  const birthdayIndex = findHeaderIndex(normalizedHeaders, ["birthday", "dob"]);
  const joiningDateIndex = findHeaderIndex(normalizedHeaders, [
    "joiningdate",
    "dateofjoining",
    "doj",
  ]);

  const missingHeaders: string[] = [];

  if (nameIndex < 0) {
    missingHeaders.push("Full Name");
  }

  if (emailIndex < 0) {
    missingHeaders.push("Email");
  }

  if (birthdayIndex < 0) {
    missingHeaders.push("Birthday");
  }

  if (joiningDateIndex < 0) {
    missingHeaders.push("Joining date");
  }

  if (missingHeaders.length > 0) {
    validationErrors.push(
      `Missing required header(s): ${missingHeaders.join(", ")}.`
    );

    return {
      employees: [],
      validationErrors,
    };
  }

  const employees: Employee[] = [];
  const seenEmails = new Set<string>();

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index].map((cell) => String(cell).trim());
    const rowNumber = index + 1;
    const employeeId =
      employeeIdIndex >= 0 ? row[employeeIdIndex] || `row-${rowNumber}` : `row-${rowNumber}`;
    const name = row[nameIndex] || "";
    const rawEmail = row[emailIndex] || "";
    const email = rawEmail.toLowerCase();
    const rawBirthday = row[birthdayIndex] || "";
    const rawJoiningDate = row[joiningDateIndex] || "";

    if (!name && !email && !rawBirthday && !rawJoiningDate) {
      continue;
    }

    if (!name) {
      validationErrors.push(`Row ${rowNumber}: full name is missing.`);
      continue;
    }

    if (!email) {
      validationErrors.push(`Row ${rowNumber}: email is missing.`);
      continue;
    }

    if (!isValidEmail(email)) {
      validationErrors.push(`Row ${rowNumber}: email "${rawEmail}" is invalid.`);
      continue;
    }

    if (seenEmails.has(email)) {
      validationErrors.push(
        `Row ${rowNumber}: duplicate email "${rawEmail}" found.`
      );
      continue;
    }

    if (!rawBirthday) {
      validationErrors.push(`Row ${rowNumber}: birthday is missing.`);
      continue;
    }

    const birthday = normalizeBirthday(rawBirthday);

    if (!birthday) {
      validationErrors.push(
        `Row ${rowNumber}: birthday "${rawBirthday}" is invalid. Use DD-MM-YYYY format.`
      );
      continue;
    }

    if (!rawJoiningDate) {
      validationErrors.push(`Row ${rowNumber}: joining date is missing.`);
      continue;
    }

    const joiningDate = normalizeJoiningDate(rawJoiningDate);

    if (!joiningDate) {
      validationErrors.push(
        `Row ${rowNumber}: joining date "${rawJoiningDate}" is invalid. Use DD-MM-YYYY format.`
      );
      continue;
    }

    seenEmails.add(email);
    employees.push({
      employeeId,
      name,
      email,
      birthday,
      joiningDate,
    });
  }

  if (employees.length === 0) {
    validationErrors.push(`No valid rows were found in ${GOOGLE_SHEET_SOURCE_NAME}.`);
  }

  return {
    employees,
    validationErrors,
  };
}

function buildGoogleAuthClient() {
  if (hasAnyOauthConfig()) {
    if (!hasOauthConfig()) {
      throw new Error(
        "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN must all be set together."
      );
    }

    const oauthClient = new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET")
    );

    oauthClient.setCredentials({
      refresh_token: getRequiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
    });

    return oauthClient;
  }

  throw new Error(
    "Missing required Google Sheets OAuth variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN."
  );
}

async function fetchSheetRows(): Promise<string[][]> {
  const auth = buildGoogleAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getGoogleSheetId(),
    range: getGoogleSheetName(),
  });

  return (response.data.values as string[][] | undefined) ?? [];
}

function buildValidationWarningBlocks(errors: string[]) {
  const topErrors = errors.slice(0, 8).map((error) => `• ${error}`);
  const moreCount = Math.max(0, errors.length - 8);

  const blocks: Array<Record<string, unknown>> = [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: GOOGLE_SHEET_VALIDATION_ISSUES_TITLE,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Source*\n${getSourceLabel()}` },
        { type: "mrkdwn", text: `*Issue Count*\n${errors.length}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: topErrors.join("\n"),
      },
    },
  ];

  if (moreCount > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `...and ${moreCount} more issue(s).`,
        },
      ],
    });
  }

  blocks.push({ type: "divider" });

  return blocks;
}

function buildFailureBlocks(errorMessage: string) {
  return [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: GOOGLE_SHEET_LOAD_FAILED_TITLE,
      },
    },
    {
      type: "section",
      fields: [{ type: "mrkdwn", text: `*Source*\n${getSourceLabel()}` }],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error*\n${errorMessage}`,
      },
    },
    { type: "divider" },
  ];
}

async function notifyValidationErrorsIfChanged(errors: string[]) {
  if (errors.length === 0) {
    lastValidationSignature = "";
    return;
  }

  const signature = errors.join("\n");

  if (signature === lastValidationSignature) {
    return;
  }

  lastValidationSignature = signature;

  await notifyAdmin({
    text: `${GOOGLE_SHEET_WARNING_TEXT_PREFIX} ${errors.length} issue(s).`,
    blocks: buildValidationWarningBlocks(errors),
    unfurlLinks: false,
  });
}

async function loadEmployees(trigger: string) {
  const rows = await fetchSheetRows();
  const { employees, validationErrors } = parseSheetRows(rows);

  await notifyValidationErrorsIfChanged(validationErrors);

  if (employees.length === 0) {
    throw new Error(GOOGLE_SHEET_NO_VALID_EMPLOYEES_ERROR);
  }

  console.log(
    `Loaded ${employees.length} employee(s) from ${GOOGLE_SHEET_SOURCE_NAME} [trigger=${trigger}]`
  );

  return employees;
}

export async function loadEmployeesFromGoogleSheet(trigger: string) {
  if (!activeEmployeeLoad) {
    activeEmployeeLoad = loadEmployees(trigger).finally(() => {
      activeEmployeeLoad = null;
    });
  }

  try {
    return await activeEmployeeLoad;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : GOOGLE_SHEET_UNKNOWN_ERROR;

    console.error(GOOGLE_SHEET_LOAD_FAILED_LOG, error);

    await notifyAdmin({
      text: `${GOOGLE_SHEET_LOAD_FAILED_TEXT_PREFIX} ${message}`,
      blocks: buildFailureBlocks(message),
      unfurlLinks: false,
    });

    throw error;
  }
}
