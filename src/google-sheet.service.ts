import { google } from "googleapis";
import { getEnv, getRequiredEnv, isDevelopmentMode } from "./config";
import { notifyAdmin } from "./admin-alert.service";
import {
  getEmployeesFromStore,
  replaceEmployeesInStore,
} from "./data/employee.store";
import { type Employee } from "./data/employees";

type EmployeeUpdate = {
  before: Employee;
  after: Employee;
};

type EmployeeSyncDiff = {
  added: Employee[];
  removed: Employee[];
  updated: EmployeeUpdate[];
};

let isSyncInProgress = false;
let lastValidationSignature = "";

function getSheetSyncCronExpressionFromEnv() {
  if (isDevelopmentMode()) {
    return "*/2 * * * *";
  }

  return process.env.SHEET_SYNC_CRON || "*/15 * * * *";
}

function getGoogleSheetId() {
  return getRequiredEnv("GOOGLE_SHEET_ID");
}

function getGoogleSheetName() {
  return getRequiredEnv("GOOGLE_SHEET_NAME");
}

function getPublicSheetCsvUrl() {
  return getEnv("GOOGLE_SHEET_PUBLIC_CSV_URL");
}

function shouldUsePublicCsvSource() {
  return isDevelopmentMode() && Boolean(getPublicSheetCsvUrl());
}

function getSourceLabel() {
  if (shouldUsePublicCsvSource()) {
    return "Public CSV (dev mode)";
  }

  return `${getGoogleSheetName()} (${getGoogleSheetId()})`;
}

function getSourceLinkText() {
  if (!shouldUsePublicCsvSource()) {
    return null;
  }

  const publicCsvUrl = getPublicSheetCsvUrl();
  if (!publicCsvUrl) {
    return null;
  }

  return `<${publicCsvUrl}|Open source CSV>`;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isValidBirthday(value: string) {
  if (!/^\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [monthRaw, dayRaw] = value.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isLikelySlackUserId(value: string) {
  return /^[UWB][A-Z0-9]+$/.test(value);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
}

function parseCsvRows(csvText: string): string[][] {
  return csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseCsvLine);
}

function parseSheetRows(rows: string[][]) {
  const validationErrors: string[] = [];

  if (rows.length === 0) {
    return {
      employees: [],
      validationErrors: ["Google Sheet is empty."],
    };
  }

  const headerRow = rows[0].map((cell) => String(cell).trim());
  const normalizedHeaders = headerRow.map(normalizeHeader);

  const requiredHeaders = ["name", "slackuserid", "birthday"] as const;
  const missingHeaders = requiredHeaders.filter(
    (header) => !normalizedHeaders.includes(header)
  );

  if (missingHeaders.length > 0) {
    validationErrors.push(
      `Missing required header(s): ${missingHeaders.join(", ")}. Expected header row to include name, slackUserId, birthday.`
    );

    return {
      employees: [],
      validationErrors,
    };
  }

  const nameIndex = normalizedHeaders.indexOf("name");
  const slackUserIdIndex = normalizedHeaders.indexOf("slackuserid");
  const birthdayIndex = normalizedHeaders.indexOf("birthday");

  const employees: Employee[] = [];
  const seenSlackUserIds = new Set<string>();

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index].map((cell) => String(cell).trim());
    const rowNumber = index + 1;

    const name = row[nameIndex] || "";
    const slackUserId = row[slackUserIdIndex] || "";
    const birthday = row[birthdayIndex] || "";

    if (!name && !slackUserId && !birthday) {
      continue;
    }

    if (!name) {
      validationErrors.push(`Row ${rowNumber}: name is missing.`);
      continue;
    }

    if (!slackUserId) {
      validationErrors.push(`Row ${rowNumber}: slackUserId is missing.`);
      continue;
    }

    if (!isLikelySlackUserId(slackUserId)) {
      validationErrors.push(
        `Row ${rowNumber}: slackUserId "${slackUserId}" looks invalid. Use a member ID like U012AB3CD.`
      );
      continue;
    }

    if (seenSlackUserIds.has(slackUserId)) {
      validationErrors.push(
        `Row ${rowNumber}: duplicate slackUserId "${slackUserId}" found. Each employee must be unique.`
      );
      continue;
    }

    if (!birthday) {
      validationErrors.push(`Row ${rowNumber}: birthday is missing.`);
      continue;
    }

    if (!isValidBirthday(birthday)) {
      validationErrors.push(
        `Row ${rowNumber}: birthday "${birthday}" is invalid. Use MM-DD format, e.g. 08-20.`
      );
      continue;
    }

    seenSlackUserIds.add(slackUserId);
    employees.push({ name, slackUserId, birthday });
  }

  if (employees.length === 0) {
    validationErrors.push("No valid rows were found in Google Sheet.");

    return {
      employees: [],
      validationErrors,
    };
  }

  return {
    employees,
    validationErrors,
  };
}

async function fetchSheetRowsFromPublicCsv(): Promise<string[][]> {
  const publicCsvUrl = getPublicSheetCsvUrl();

  if (!publicCsvUrl) {
    throw new Error("GOOGLE_SHEET_PUBLIC_CSV_URL is not configured");
  }

  const response = await fetch(publicCsvUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch public CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  return parseCsvRows(csvText);
}

async function fetchSheetRowsFromGoogleApi(): Promise<string[][]> {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getGoogleSheetId(),
    range: getGoogleSheetName(),
  });

  return (response.data.values as string[][] | undefined) ?? [];
}

async function fetchSheetRows(): Promise<string[][]> {
  if (shouldUsePublicCsvSource()) {
    return fetchSheetRowsFromPublicCsv();
  }

  return fetchSheetRowsFromGoogleApi();
}

function toEmployeeMap(employees: Employee[]) {
  return new Map(employees.map((employee) => [employee.slackUserId, employee]));
}

function diffEmployees(previous: Employee[], next: Employee[]): EmployeeSyncDiff {
  const previousMap = toEmployeeMap(previous);
  const nextMap = toEmployeeMap(next);

  const added: Employee[] = [];
  const removed: Employee[] = [];
  const updated: EmployeeUpdate[] = [];

  for (const [slackUserId, nextEmployee] of nextMap.entries()) {
    const previousEmployee = previousMap.get(slackUserId);

    if (!previousEmployee) {
      added.push(nextEmployee);
      continue;
    }

    if (
      previousEmployee.name !== nextEmployee.name ||
      previousEmployee.birthday !== nextEmployee.birthday
    ) {
      updated.push({ before: previousEmployee, after: nextEmployee });
    }
  }

  for (const [slackUserId, previousEmployee] of previousMap.entries()) {
    if (!nextMap.has(slackUserId)) {
      removed.push(previousEmployee);
    }
  }

  return { added, removed, updated };
}

function formatEmployee(employee: Employee) {
  return `${employee.name} (<@${employee.slackUserId}>, ${employee.birthday})`;
}

function buildListSection(title: string, lines: string[]) {
  if (lines.length === 0) {
    return null;
  }

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title}*\n${lines.join("\n")}`,
    },
  };
}

function buildSyncSummaryBlocks(args: {
  trigger: string;
  total: number;
  diff: EmployeeSyncDiff;
}) {
  const { trigger, total, diff } = args;
  const addedLines = diff.added.slice(0, 8).map((employee) => `• ${formatEmployee(employee)}`);
  const removedLines = diff.removed
    .slice(0, 8)
    .map((employee) => `• ${formatEmployee(employee)}`);
  const updatedLines = diff.updated.slice(0, 8).map((change) => {
    const before = `${change.before.name}/${change.before.birthday}`;
    const after = `${change.after.name}/${change.after.birthday}`;
    return `• <@${change.after.slackUserId}>: ${before} -> ${after}`;
  });

  const blocks: Array<Record<string, unknown>> = [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:satellite: Cake Alert Sheet Sync* • \`${trigger}\``,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Source*\n${getSourceLabel()}` },
        { type: "mrkdwn", text: `*Employees*\n${total}` },
        { type: "mrkdwn", text: `*Added*\n${diff.added.length}` },
        { type: "mrkdwn", text: `*Removed*\n${diff.removed.length}` },
        { type: "mrkdwn", text: `*Updated*\n${diff.updated.length}` },
      ],
    },
  ];

  const sourceLinkText = getSourceLinkText();
  if (sourceLinkText) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: sourceLinkText }],
    });
  }

  const addedBlock = buildListSection("Added Entries", addedLines);
  if (addedBlock) {
    blocks.push(addedBlock);
  }

  const removedBlock = buildListSection("Removed Entries", removedLines);
  if (removedBlock) {
    blocks.push(removedBlock);
  }

  const updatedBlock = buildListSection("Updated Entries", updatedLines);
  if (updatedBlock) {
    blocks.push(updatedBlock);
  }

  if (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.updated.length === 0
  ) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "No employee changes detected in this sync.",
        },
      ],
    });
  }

  blocks.push(
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Synced at ${new Date().toISOString()}`,
        },
      ],
    },
    { type: "divider" }
  );

  return blocks;
}

function buildSyncSummaryText(args: {
  trigger: string;
  total: number;
  diff: EmployeeSyncDiff;
}) {
  const { trigger, total, diff } = args;
  return [
    `Cake Alert sheet sync completed [${trigger}]`,
    `Source: ${getSourceLabel()}`,
    `Employees: ${total}`,
    `Added: ${diff.added.length}, Removed: ${diff.removed.length}, Updated: ${diff.updated.length}`,
  ].join(" | ");
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
        text: "*:warning: Cake Alert Sheet Validation Issues*",
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
        text: "*:x: Cake Alert Sheet Sync Failed*",
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Source*\n${getSourceLabel()}` },
      ],
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
    text: `Cake Alert sheet sync warning: ${errors.length} issue(s).`,
    blocks: buildValidationWarningBlocks(errors),
    unfurlLinks: false,
  });
}

export function getSheetSyncCronExpression() {
  return getSheetSyncCronExpressionFromEnv();
}

export async function syncEmployeesFromGoogleSheet(trigger: string) {
  if (isSyncInProgress) {
    console.log("Skipping sheet sync because previous sync is still in progress.");
    return;
  }

  isSyncInProgress = true;

  try {
    const previousEmployees = getEmployeesFromStore();
    const rows = await fetchSheetRows();
    const { employees, validationErrors } = parseSheetRows(rows);
    const diff = diffEmployees(previousEmployees, employees);

    replaceEmployeesInStore(employees);

    console.log(
      `Synced ${employees.length} employee(s) from Google Sheet [trigger=${trigger}]`
    );

    await notifyValidationErrorsIfChanged(validationErrors);

    await notifyAdmin({
      text: buildSyncSummaryText({ trigger, total: employees.length, diff }),
      blocks: buildSyncSummaryBlocks({
        trigger,
        total: employees.length,
        diff,
      }),
      unfurlLinks: false,
    });
  } catch (error) {
    console.error("Google Sheet sync failed. Keeping existing in-memory data.", error);

    await notifyAdmin({
      text: `Cake Alert sheet sync failed: ${(error as Error).message}`,
      blocks: buildFailureBlocks((error as Error).message),
      unfurlLinks: false,
    });
  } finally {
    isSyncInProgress = false;
  }
}
