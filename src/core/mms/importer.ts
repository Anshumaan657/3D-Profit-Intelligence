import * as XLSX from "xlsx";

import type {
  CanonicalDowntimeRecord,
  CanonicalMmsImport,
  CanonicalMmsRecordBase,
  CanonicalProductionRecord,
  MmsContractSourceRow,
  MmsDataIssue,
  MmsDataIssueCode,
  MmsImportStats,
  MmsImportSummary,
  MmsOperatorReference,
} from "./types";
import {
  extractMmsWorkbookContractRows,
  MMS_WORKBOOK_CONTRACT_VERSION,
  MMS_WORKBOOK_LIMITS,
  MmsWorkbookCompatibilityError,
  validateMmsFileEnvelope,
  workbookParseFailureReport,
} from "./workbook-contract";

const PRODUCT_SHEET = "Product Log Book" as const;
const DOWNTIME_SHEET = "Down Time Details" as const;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const TEXT_MISSING_MARKERS = new Set(["", "NONE", "N/A", "NA", "-"]);

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type TimelineRecord = CanonicalProductionRecord | CanonicalDowntimeRecord;

export class MmsDataQualityError extends Error {
  readonly result: CanonicalMmsImport;

  constructor(result: CanonicalMmsImport) {
    super(
      `Workbook import rejected because ${(result.stats.invalidCoreRowRate * 100).toFixed(1)}% of core rows are invalid; the configured limit is ${MMS_WORKBOOK_LIMITS.maximumInvalidCoreRowRate * 100}%.`,
    );
    this.name = "MmsDataQualityError";
    this.result = result;
  }
}

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalized(value: unknown): string {
  return clean(value).toUpperCase();
}

function isBlank(value: unknown): boolean {
  return value == null || clean(value) === "";
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = clean(value).replaceAll(",", "");
  if (!raw || TEXT_MISSING_MARKERS.has(raw.toUpperCase())) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function validDateParts(parts: LocalDateTime): boolean {
  if (
    parts.year < 1900 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return false;
  }
  const check = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );
  return (
    check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() === parts.month - 1 &&
    check.getUTCDate() === parts.day
  );
}

function applyMeridiem(hour: number, meridiem?: string): number {
  if (meridiem?.toUpperCase() === "PM" && hour < 12) return hour + 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) return 0;
  return hour;
}

function parsedDateTime(
  value: unknown,
  baseDate?: Pick<LocalDateTime, "year" | "month" | "day"> | null,
): LocalDateTime | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    };
    return validDateParts(parts) ? parts : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (!decoded) return null;
    const hasDate = decoded.y >= 1900 && decoded.d >= 1;
    const parts = {
      year: hasDate ? decoded.y : (baseDate?.year ?? 0),
      month: hasDate ? decoded.m : (baseDate?.month ?? 0),
      day: hasDate ? decoded.d : (baseDate?.day ?? 0),
      hour: decoded.H,
      minute: decoded.M,
      second: Math.round(decoded.S),
    };
    return validDateParts(parts) ? parts : null;
  }

  const raw = clean(value).replace(/\s+/g, " ");
  const dayFirst = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  const yearFirst = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  const timeOnly = raw.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
  );
  let parts: LocalDateTime | null = null;
  if (dayFirst) {
    parts = {
      year: Number(dayFirst[3]),
      month: Number(dayFirst[2]),
      day: Number(dayFirst[1]),
      hour: applyMeridiem(Number(dayFirst[4] ?? 0), dayFirst[7]),
      minute: Number(dayFirst[5] ?? 0),
      second: Number(dayFirst[6] ?? 0),
    };
  } else if (yearFirst) {
    parts = {
      year: Number(yearFirst[1]),
      month: Number(yearFirst[2]),
      day: Number(yearFirst[3]),
      hour: applyMeridiem(Number(yearFirst[4] ?? 0), yearFirst[7]),
      minute: Number(yearFirst[5] ?? 0),
      second: Number(yearFirst[6] ?? 0),
    };
  } else if (timeOnly && baseDate) {
    parts = {
      ...baseDate,
      hour: applyMeridiem(Number(timeOnly[1]), timeOnly[4]),
      minute: Number(timeOnly[2]),
      second: Number(timeOnly[3] ?? 0),
    };
  }
  return parts && validDateParts(parts) ? parts : null;
}

function dateOnly(parts: LocalDateTime | null): string | null {
  if (!parts) return null;
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function localIso(parts: LocalDateTime | null): string | null {
  if (!parts) return null;
  return `${dateOnly(parts)}T${String(parts.hour).padStart(2, "0")}:${String(
    parts.minute,
  ).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function sortKey(parts: LocalDateTime | null): number | null {
  if (!parts) return null;
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function addOneDay(parts: LocalDateTime): LocalDateTime {
  const value = new Date(sortKey(parts) ?? 0);
  value.setUTCDate(value.getUTCDate() + 1);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
  };
}

function normalizeIntervalEnd(
  start: LocalDateTime | null,
  end: LocalDateTime | null,
  shift: string,
): { end: LocalDateTime | null; inferred: boolean } {
  if (!start || !end || (sortKey(end) ?? 0) > (sortKey(start) ?? 0)) {
    return { end, inferred: false };
  }
  const nightShift =
    normalized(shift).includes("SHIFT 2") ||
    (start.hour >= 12 && end.hour < 12);
  if (!nightShift) return { end, inferred: false };
  const adjusted = addOneDay(end);
  const duration = (sortKey(adjusted) ?? 0) - (sortKey(start) ?? 0);
  if (duration <= 0 || duration > SECONDS_PER_DAY * 1000) {
    return { end, inferred: false };
  }
  return { end: adjusted, inferred: true };
}

function clockDurationSeconds(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return (
      value.getHours() * SECONDS_PER_HOUR +
      value.getMinutes() * 60 +
      value.getSeconds()
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * SECONDS_PER_DAY);
  }
  const match = clean(value).match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (minutes > 59 || seconds > 59) return null;
  return hours * SECONDS_PER_HOUR + minutes * 60 + seconds;
}

function secondsValue(value: unknown): number | null {
  const number = numeric(value);
  if (number != null) return number;
  return clockDurationSeconds(value);
}

function operatorReference(value: unknown): MmsOperatorReference {
  const raw = clean(value);
  const tokens = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const names = tokens.filter((item) => normalized(item) !== "NO OPERATOR");
  return {
    raw,
    names,
    isMissing: !raw || tokens.some((item) => normalized(item) === "NO OPERATOR"),
  };
}

function isTotalLabel(value: unknown): boolean {
  return normalized(value).replace(/[=>\s]/g, "") === "TOTAL";
}

function isProductionTotalRow(row: MmsContractSourceRow): boolean {
  return (
    isTotalLabel(row.values["Part No."]) ||
    isTotalLabel(row.values.Machine) ||
    isTotalLabel(row.values.Shift)
  );
}

function isDowntimeTotalRow(row: MmsContractSourceRow): boolean {
  return isTotalLabel(row.values.Machine) || isTotalLabel(row.values.Shift);
}

function addIssue(
  issues: MmsDataIssue[],
  record: TimelineRecord,
  code: MmsDataIssueCode,
  severity: "warning" | "error",
  message: string,
  field?: string,
  relatedRecordId?: string,
): void {
  if (!record.issueCodes.includes(code)) record.issueCodes.push(code);
  issues.push({
    id: `DQ-${stableHash(
      [record.sourceSheet, record.sourceRow, code, field, relatedRecordId].join("|"),
    )}`,
    code,
    severity,
    message,
    sheet: record.sourceSheet,
    rowNumber: record.sourceRow,
    recordId: record.id,
    field,
    relatedRecordId,
  });
}

function flagRequiredText(
  issues: MmsDataIssue[],
  record: TimelineRecord,
  value: string,
  field: string,
  code: "MISSING_MACHINE" | "MISSING_SHIFT",
): void {
  if (!value) addIssue(issues, record, code, "error", `${field} is blank.`, field);
}

function flagParsedValue(
  issues: MmsDataIssue[],
  record: TimelineRecord,
  raw: unknown,
  parsed: number | null,
  field: string,
  options: { required?: boolean; duration?: boolean } = {},
): void {
  if (parsed == null) {
    if (options.required && isBlank(raw)) {
      addIssue(
        issues,
        record,
        "MISSING_REQUIRED_VALUE",
        "error",
        `${field} is required but blank.`,
        field,
      );
    } else if (!isBlank(raw)) {
      addIssue(
        issues,
        record,
        options.duration ? "INVALID_DURATION" : "INVALID_NUMBER",
        "error",
        `${field} could not be parsed.`,
        field,
      );
    }
    return;
  }
  if (parsed < 0) {
    addIssue(
      issues,
      record,
      "NEGATIVE_VALUE_REQUIRES_CLASSIFICATION",
      "warning",
      `${field} is negative and has been excluded from ordinary totals until classified.`,
      field,
    );
    record.includedInTotals = false;
  }
}

function flagDateFields(
  issues: MmsDataIssue[],
  record: TimelineRecord,
  values: {
    rawDate: unknown;
    parsedDate: LocalDateTime | null;
    rawStart: unknown;
    start: LocalDateTime | null;
    rawEnd: unknown;
    end: LocalDateTime | null;
  },
): void {
  if (!values.parsedDate && !record.businessDate) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlank(values.rawDate) ? "Date is blank and could not be inferred." : "Date could not be parsed.",
      "Date",
    );
  }
  if (!values.start) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlank(values.rawStart) ? "From Time is blank." : "From Time could not be parsed.",
      "From Time",
    );
  }
  if (!values.end) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlank(values.rawEnd) ? "Till Time is blank." : "Till Time could not be parsed.",
      "Till Time",
    );
  }
  if (
    values.start &&
    values.end &&
    (sortKey(values.end) ?? 0) <= (sortKey(values.start) ?? 0)
  ) {
    addIssue(
      issues,
      record,
      "INVALID_INTERVAL",
      "error",
      "Till Time must be later than From Time.",
      "Till Time",
    );
  }
}

function recordBase(options: {
  prefix: "PI" | "DT";
  sourceSheet: typeof PRODUCT_SHEET | typeof DOWNTIME_SHEET;
  sourceRow: number;
  businessDate: string | null;
  start: LocalDateTime | null;
  end: LocalDateTime | null;
  machine: string;
  shift: string;
  fingerprint: string;
}): CanonicalMmsRecordBase {
  return {
    id: `${options.prefix}-${stableHash(
      `${options.sourceSheet}|${options.sourceRow}|${options.fingerprint}`,
    )}`,
    fingerprint: stableHash(options.fingerprint),
    sourceSheet: options.sourceSheet,
    sourceRow: options.sourceRow,
    businessDate: options.businessDate,
    startAt: localIso(options.start),
    endAt: localIso(options.end),
    startSortKey: sortKey(options.start),
    endSortKey: sortKey(options.end),
    machine: options.machine,
    shift: options.shift,
    issueCodes: [],
    duplicateOf: null,
    isValid: true,
    includedInTotals: true,
  };
}

function parseProductionRecord(
  row: MmsContractSourceRow,
  issues: MmsDataIssue[],
): CanonicalProductionRecord {
  const values = row.values;
  const machine = clean(values.Machine);
  const shift = clean(values.Shift);
  const parsedBusinessDate = parsedDateTime(values.Date);
  const dateBase = parsedBusinessDate
    ? {
        year: parsedBusinessDate.year,
        month: parsedBusinessDate.month,
        day: parsedBusinessDate.day,
      }
    : null;
  const start = parsedDateTime(values["From Time"], dateBase);
  const inferredBase = dateBase ??
    (start
      ? { year: start.year, month: start.month, day: start.day }
      : null);
  const rawEnd = parsedDateTime(values["Till Time"], inferredBase);
  const normalizedEnd = normalizeIntervalEnd(start, rawEnd, shift);
  const businessDate = dateOnly(parsedBusinessDate) ?? dateOnly(start);
  const partNumber = clean(values["Part No."]);
  const partName = clean(values["Part Name"]);
  const productName = clean(values["Product Name"]);
  const productKey = productName || partNumber || partName;
  const reported = numeric(values.Qty);
  const rejected = numeric(values["Reject Qty"]);
  const reworked = numeric(values["Rework Qty"]);
  const operative = clockDurationSeconds(values["Opr. Time"]);
  const stroke = numeric(values.Stroke);
  const multiplier = numeric(values["M. Factor"]);
  const calculatedFromStroke =
    stroke != null && multiplier != null ? stroke * multiplier : null;
  const fingerprint = [
    PRODUCT_SHEET,
    businessDate,
    normalized(machine),
    normalized(shift),
    normalized(productKey),
    localIso(start),
    localIso(normalizedEnd.end),
    reported,
    rejected,
    reworked,
    operative,
  ].join("|");

  const base = recordBase({
    prefix: "PI",
    sourceSheet: PRODUCT_SHEET,
    sourceRow: row.rowNumber,
    businessDate,
    start,
    end: normalizedEnd.end,
    machine,
    shift,
    fingerprint,
  });
  const rawMachineType = clean(values["Machine Type"]);
  const record: CanonicalProductionRecord = {
    ...base,
    sourceSheet: PRODUCT_SHEET,
    machineType:
      !rawMachineType || normalized(rawMachineType) === "NO TYPE"
        ? null
        : rawMachineType,
    product: {
      partNumber,
      partName,
      partErpCode: clean(values["Part ERP Code"]),
      productName,
      erpCode: clean(values["ERP Code"]),
    },
    operator: operatorReference(values.Operator),
    timesSeconds: {
      shift: clockDurationSeconds(values["Shift Time"]),
      allowed: clockDurationSeconds(values["Allowed Time"]),
      operative,
      nonOperative: clockDurationSeconds(values["Non Opr. Time"]),
      downtime: clockDurationSeconds(values["Down Time"]),
      systemOff: clockDurationSeconds(values["System Off"]),
      setup: secondsValue(values["Setup Time"]),
      additionalOvertime: secondsValue(values["Additional Over Time"]),
      productionGap: secondsValue(values["Prod Gap Between"]),
    },
    cycleTimesSeconds: {
      standard: secondsValue(values["Std. Cycle Time"]),
      approved: secondsValue(values["Approved Cycle Time"]),
      achieved: secondsValue(values["Achieve Cycle Time"]),
    },
    quantities: {
      reported,
      stroke,
      multiplier,
      calculatedFromStroke,
      shiftTarget: numeric(values["Shift Target"]),
      operativeTimeTarget: numeric(values["Opr. Time Target"]),
      productionLoss: numeric(values["Product Loss"]),
      rejected,
      reworked,
      errorStroke: numeric(values["Error Stroke"]),
    },
    costs: {
      part: numeric(values["Part Cost"]),
      component: numeric(values["Component Cost"]),
      machinePerHour: numeric(values["Running Hrs Cost"]),
      operatorPerHour: numeric(values["Operator Per Hrs Cost"]),
    },
    scrapPerPart: numeric(values["Scrap part"]),
    qualityInterlock: clean(values["Quality Interlock"]),
    processDependency: clean(values["Process Dependency"]),
    proxy: clean(values.Proxy),
    toolRequired: clean(values["Tool Yes/No"]),
  };

  flagRequiredText(issues, record, machine, "Machine", "MISSING_MACHINE");
  flagRequiredText(issues, record, shift, "Shift", "MISSING_SHIFT");
  flagDateFields(issues, record, {
    rawDate: values.Date,
    parsedDate: parsedBusinessDate,
    rawStart: values["From Time"],
    start,
    rawEnd: values["Till Time"],
    end: normalizedEnd.end,
  });
  if (!parsedBusinessDate && businessDate) {
    addIssue(
      issues,
      record,
      "BUSINESS_DATE_INFERRED",
      "warning",
      "Business date was inferred from From Time.",
      "Date",
    );
  }
  if (normalizedEnd.inferred) {
    addIssue(
      issues,
      record,
      "CROSS_MIDNIGHT_END_INFERRED",
      "warning",
      "Till Time was interpreted as the following day for a night-shift interval.",
      "Till Time",
    );
  }
  if (!partNumber && !productName) {
    addIssue(
      issues,
      record,
      "MISSING_PRODUCT",
      "warning",
      "Part number and product name are both blank.",
      "Product Name",
    );
  }
  if (record.operator.isMissing) {
    addIssue(
      issues,
      record,
      "MISSING_OPERATOR",
      "warning",
      "Operator was not entered.",
      "Operator",
    );
  }
  if (!record.machineType) {
    addIssue(
      issues,
      record,
      "MISSING_MACHINE_TYPE",
      "warning",
      "Machine Type was not entered.",
      "Machine Type",
    );
  }

  const durationFields: Array<[string, unknown, number | null, boolean]> = [
    ["Opr. Time", values["Opr. Time"], record.timesSeconds.operative, true],
    ["Shift Time", values["Shift Time"], record.timesSeconds.shift, false],
    ["Allowed Time", values["Allowed Time"], record.timesSeconds.allowed, false],
    ["Non Opr. Time", values["Non Opr. Time"], record.timesSeconds.nonOperative, false],
    ["Down Time", values["Down Time"], record.timesSeconds.downtime, false],
    ["System Off", values["System Off"], record.timesSeconds.systemOff, false],
    ["Setup Time", values["Setup Time"], record.timesSeconds.setup, false],
    ["Additional Over Time", values["Additional Over Time"], record.timesSeconds.additionalOvertime, false],
    ["Prod Gap Between", values["Prod Gap Between"], record.timesSeconds.productionGap, false],
    ["Std. Cycle Time", values["Std. Cycle Time"], record.cycleTimesSeconds.standard, true],
    ["Approved Cycle Time", values["Approved Cycle Time"], record.cycleTimesSeconds.approved, false],
    ["Achieve Cycle Time", values["Achieve Cycle Time"], record.cycleTimesSeconds.achieved, false],
  ];
  for (const [field, raw, parsed, required] of durationFields) {
    flagParsedValue(issues, record, raw, parsed, field, {
      required,
      duration: true,
    });
  }
  const numberFields: Array<[string, unknown, number | null, boolean]> = [
    ["Qty", values.Qty, record.quantities.reported, true],
    ["Stroke", values.Stroke, record.quantities.stroke, false],
    ["M. Factor", values["M. Factor"], record.quantities.multiplier, false],
    ["Shift Target", values["Shift Target"], record.quantities.shiftTarget, false],
    ["Opr. Time Target", values["Opr. Time Target"], record.quantities.operativeTimeTarget, false],
    ["Product Loss", values["Product Loss"], record.quantities.productionLoss, false],
    ["Reject Qty", values["Reject Qty"], record.quantities.rejected, false],
    ["Rework Qty", values["Rework Qty"], record.quantities.reworked, false],
    ["Error Stroke", values["Error Stroke"], record.quantities.errorStroke, false],
    ["Part Cost", values["Part Cost"], record.costs.part, false],
    ["Component Cost", values["Component Cost"], record.costs.component, false],
    ["Running Hrs Cost", values["Running Hrs Cost"], record.costs.machinePerHour, false],
    ["Operator Per Hrs Cost", values["Operator Per Hrs Cost"], record.costs.operatorPerHour, false],
    ["Scrap part", values["Scrap part"], record.scrapPerPart, false],
  ];
  for (const [field, raw, parsed, required] of numberFields) {
    flagParsedValue(issues, record, raw, parsed, field, { required });
  }
  if (
    reported != null &&
    calculatedFromStroke != null &&
    Math.abs(reported - calculatedFromStroke) > 0.0001
  ) {
    addIssue(
      issues,
      record,
      "QUANTITY_MISMATCH",
      "warning",
      `Reported Qty ${reported} does not match Stroke × M. Factor ${calculatedFromStroke}. Reported Qty remains authoritative.`,
      "Qty",
    );
  }
  return record;
}

function parseDowntimeRecord(
  row: MmsContractSourceRow,
  issues: MmsDataIssue[],
): CanonicalDowntimeRecord {
  const values = row.values;
  const machine = clean(values.Machine);
  const shift = clean(values.Shift);
  const parsedBusinessDate = parsedDateTime(values.Date);
  const dateBase = parsedBusinessDate
    ? {
        year: parsedBusinessDate.year,
        month: parsedBusinessDate.month,
        day: parsedBusinessDate.day,
      }
    : null;
  const start = parsedDateTime(values["From Time"], dateBase);
  const inferredBase = dateBase ??
    (start
      ? { year: start.year, month: start.month, day: start.day }
      : null);
  const rawEnd = parsedDateTime(values["Till Time"], inferredBase);
  const normalizedEnd = normalizeIntervalEnd(start, rawEnd, shift);
  const businessDate = dateOnly(parsedBusinessDate) ?? dateOnly(start);
  const durationSeconds = clockDurationSeconds(values.Duration);
  const productName = clean(values["Product Name"]);
  const reasonType = clean(values.Reason_Type);
  const reason = clean(values.Reason);
  const reportedMachineHourLoss = numeric(values.Revenue);
  const fingerprint = [
    DOWNTIME_SHEET,
    businessDate,
    normalized(machine),
    normalized(shift),
    normalized(productName),
    localIso(start),
    localIso(normalizedEnd.end),
    durationSeconds,
    normalized(reasonType),
    normalized(reason),
    reportedMachineHourLoss,
  ].join("|");
  const base = recordBase({
    prefix: "DT",
    sourceSheet: DOWNTIME_SHEET,
    sourceRow: row.rowNumber,
    businessDate,
    start,
    end: normalizedEnd.end,
    machine,
    shift,
    fingerprint,
  });
  const record: CanonicalDowntimeRecord = {
    ...base,
    sourceSheet: DOWNTIME_SHEET,
    durationSeconds,
    productName,
    operator: operatorReference(values["Operator Name"]),
    reasonType,
    reason,
    isUnreported: normalized(reason) === "UNREPORTED",
    reportedMachineHourLoss,
  };

  flagRequiredText(issues, record, machine, "Machine", "MISSING_MACHINE");
  flagRequiredText(issues, record, shift, "Shift", "MISSING_SHIFT");
  flagDateFields(issues, record, {
    rawDate: values.Date,
    parsedDate: parsedBusinessDate,
    rawStart: values["From Time"],
    start,
    rawEnd: values["Till Time"],
    end: normalizedEnd.end,
  });
  if (!parsedBusinessDate && businessDate) {
    addIssue(
      issues,
      record,
      "BUSINESS_DATE_INFERRED",
      "warning",
      "Business date was inferred from From Time.",
      "Date",
    );
  }
  if (normalizedEnd.inferred) {
    addIssue(
      issues,
      record,
      "CROSS_MIDNIGHT_END_INFERRED",
      "warning",
      "Till Time was interpreted as the following day for a night-shift event.",
      "Till Time",
    );
  }
  flagParsedValue(
    issues,
    record,
    values.Duration,
    durationSeconds,
    "Duration",
    { required: true, duration: true },
  );
  flagParsedValue(
    issues,
    record,
    values.Revenue,
    reportedMachineHourLoss,
    "Revenue",
  );
  if (record.operator.isMissing) {
    addIssue(
      issues,
      record,
      "MISSING_OPERATOR",
      "warning",
      "Operator was not entered.",
      "Operator Name",
    );
  }
  if (!reason) {
    addIssue(
      issues,
      record,
      "MISSING_REASON",
      "warning",
      "Downtime reason is blank.",
      "Reason",
    );
  } else if (record.isUnreported) {
    addIssue(
      issues,
      record,
      "UNREPORTED_DOWNTIME",
      "warning",
      "Downtime reason is UNREPORTED.",
      "Reason",
    );
  }
  return record;
}

function markDuplicates(records: TimelineRecord[], issues: MmsDataIssue[]): void {
  const seen = new Map<string, TimelineRecord>();
  for (const record of records) {
    const previous = seen.get(record.fingerprint);
    if (!previous) {
      seen.set(record.fingerprint, record);
      continue;
    }
    record.duplicateOf = previous.id;
    record.includedInTotals = false;
    addIssue(
      issues,
      record,
      "DUPLICATE_RECORD",
      "warning",
      `Exact duplicate of ${previous.id}; retained as evidence and excluded from totals.`,
      undefined,
      previous.id,
    );
  }
}

function flagOverlaps(records: TimelineRecord[], issues: MmsDataIssue[]): void {
  const groups = new Map<string, TimelineRecord[]>();
  for (const record of records) {
    if (
      !record.machine ||
      record.startSortKey == null ||
      record.endSortKey == null ||
      record.duplicateOf
    ) {
      continue;
    }
    const key = normalized(record.machine);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.startSortKey ?? 0) - (b.startSortKey ?? 0));
    let active: TimelineRecord | null = null;
    for (const current of group) {
      if (
        active &&
        current.startSortKey != null &&
        active.endSortKey != null &&
        current.startSortKey < active.endSortKey
      ) {
        addIssue(
          issues,
          current,
          "OVERLAPPING_INTERVAL",
          "warning",
          `Interval overlaps ${active.id} on the same machine and requires review before additive calculations.`,
          undefined,
          active.id,
        );
      }
      if (!active || (current.endSortKey ?? 0) > (active.endSortKey ?? 0)) {
        active = current;
      }
    }
  }
}

function finalizeValidity(
  records: TimelineRecord[],
  issues: MmsDataIssue[],
): void {
  const invalidIds = new Set(
    issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.recordId),
  );
  for (const record of records) {
    record.isValid = !invalidIds.has(record.id);
    if (!record.isValid) record.includedInTotals = false;
  }
}

function companyName(workbook: XLSX.WorkBook): string {
  const firstSheetName = workbook.SheetNames[0];
  const value = firstSheetName
    ? workbook.Sheets[firstSheetName]?.A1?.v
    : undefined;
  return clean(value) || "Imported MMS dataset";
}

function buildStats(options: {
  productionRowsRead: number;
  downtimeRowsRead: number;
  productionTotalRowsExcluded: number;
  downtimeTotalRowsExcluded: number;
  records: TimelineRecord[];
  issues: MmsDataIssue[];
}): MmsImportStats {
  const invalidRecords = options.records.filter((record) => !record.isValid).length;
  const coreRows = options.records.length;
  return {
    productionRowsRead: options.productionRowsRead,
    downtimeRowsRead: options.downtimeRowsRead,
    productionTotalRowsExcluded: options.productionTotalRowsExcluded,
    downtimeTotalRowsExcluded: options.downtimeTotalRowsExcluded,
    duplicateRecordsExcluded: options.records.filter((record) => record.duplicateOf)
      .length,
    invalidRecordsExcluded: invalidRecords,
    negativeRecordsAwaitingClassification: options.records.filter((record) =>
      record.issueCodes.includes("NEGATIVE_VALUE_REQUIRES_CLASSIFICATION"),
    ).length,
    errorCount: options.issues.filter((issue) => issue.severity === "error").length,
    warningCount: options.issues.filter((issue) => issue.severity === "warning")
      .length,
    invalidCoreRowRate: coreRows === 0 ? 1 : invalidRecords / coreRows,
  };
}

export function canonicalizeMmsRows(options: {
  workbook: XLSX.WorkBook;
  fileName: string;
  mimeType: string;
  byteLength: number;
  importedAt?: string;
  signatureVerified: boolean;
}): CanonicalMmsImport {
  const extracted = extractMmsWorkbookContractRows(options.workbook, {
    fileName: options.fileName,
    mimeType: options.mimeType,
    byteLength: options.byteLength,
    signatureVerified: options.signatureVerified,
  });
  const productionRows = extracted.productionRows.filter(
    (row) => !isProductionTotalRow(row),
  );
  const downtimeRows = extracted.downtimeRows.filter(
    (row) => !isDowntimeTotalRow(row),
  );
  const issues: MmsDataIssue[] = [];
  const productionRecords = productionRows.map((row) =>
    parseProductionRecord(row, issues),
  );
  const downtimeRecords = downtimeRows.map((row) =>
    parseDowntimeRecord(row, issues),
  );
  const allRecords: TimelineRecord[] = [
    ...productionRecords,
    ...downtimeRecords,
  ];
  markDuplicates(productionRecords, issues);
  markDuplicates(downtimeRecords, issues);
  flagOverlaps(productionRecords, issues);
  flagOverlaps(downtimeRecords, issues);
  finalizeValidity(allRecords, issues);
  const stats = buildStats({
    productionRowsRead: extracted.productionRows.length,
    downtimeRowsRead: extracted.downtimeRows.length,
    productionTotalRowsExcluded:
      extracted.productionRows.length - productionRows.length,
    downtimeTotalRowsExcluded: extracted.downtimeRows.length - downtimeRows.length,
    records: allRecords,
    issues,
  });
  return {
    source: {
      company: companyName(options.workbook),
      fileName: options.fileName,
      mimeType: options.mimeType,
      byteLength: options.byteLength,
      importedAt: options.importedAt ?? new Date().toISOString(),
      contractVersion: MMS_WORKBOOK_CONTRACT_VERSION,
    },
    compatibility: extracted.report,
    productionRecords,
    downtimeRecords,
    dataIssues: issues,
    stats,
  };
}

export function parseMmsWorkbookFile(options: {
  buffer: ArrayBuffer;
  fileName: string;
  mimeType?: string;
  importedAt?: string;
}): CanonicalMmsImport {
  const mimeType = options.mimeType ?? "";
  const envelope = validateMmsFileEnvelope({
    fileName: options.fileName,
    mimeType,
    buffer: options.buffer,
  });
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(options.buffer, {
      type: "array",
      cellDates: false,
      cellFormula: true,
      cellNF: false,
      cellText: false,
      bookFiles: false,
      bookVBA: false,
      WTF: false,
    });
  } catch (error) {
    throw new MmsWorkbookCompatibilityError(
      workbookParseFailureReport({
        fileName: options.fileName,
        mimeType,
        byteLength: options.buffer.byteLength,
        format: envelope.format,
        signatureVerified: envelope.signatureVerified,
        error,
      }),
    );
  }
  const result = canonicalizeMmsRows({
    workbook,
    fileName: options.fileName,
    mimeType,
    byteLength: options.buffer.byteLength,
    importedAt: options.importedAt,
    signatureVerified: envelope.signatureVerified,
  });
  if (
    result.stats.invalidCoreRowRate >
    MMS_WORKBOOK_LIMITS.maximumInvalidCoreRowRate
  ) {
    throw new MmsDataQualityError(result);
  }
  return result;
}

export function summarizeMmsImport(result: CanonicalMmsImport): MmsImportSummary {
  const dates = [
    ...result.productionRecords.map((record) => record.businessDate),
    ...result.downtimeRecords.map((record) => record.businessDate),
  ].filter((value): value is string => Boolean(value));
  dates.sort();
  const machines = new Set(
    [...result.productionRecords, ...result.downtimeRecords]
      .map((record) => normalized(record.machine))
      .filter(Boolean),
  );
  const products = new Set(
    result.productionRecords
      .map((record) =>
        normalized(
          record.product.productName ||
            record.product.partNumber ||
            record.product.partName,
        ),
      )
      .filter(Boolean),
  );
  const issuePreview = [...result.dataIssues]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      if (a.sheet !== b.sheet) return a.sheet.localeCompare(b.sheet);
      return a.rowNumber - b.rowNumber;
    })
    .slice(0, 100);
  return {
    source: result.source,
    catalog: {
      products: [...new Set(result.productionRecords.filter(record => record.includedInTotals).map(record => record.product.partNumber || record.product.productName || record.product.partName).filter(Boolean))].sort(),
      machines: [...new Set([...result.productionRecords, ...result.downtimeRecords].filter(record => record.includedInTotals).map(record => record.machine).filter(Boolean))].sort(),
    },
    compatibility: result.compatibility,
    stats: result.stats,
    dateRange: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : null,
    machineCount: machines.size,
    productCount: products.size,
    productionRecordCount: result.productionRecords.length,
    downtimeRecordCount: result.downtimeRecords.length,
    issuePreview,
    totalDataIssueCount: result.dataIssues.length,
  };
}
