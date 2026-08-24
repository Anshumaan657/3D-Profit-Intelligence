export type MmsWorkbookFormat = "xls" | "xlsx";

export type MmsCanonicalSheetName =
  | "Product Log Book"
  | "Down Time Details";

export type MmsCompatibilityStatus =
  | "compatible"
  | "compatible_with_warnings"
  | "rejected";

export type MmsIssueSeverity = "info" | "warning" | "error";

export type MmsCompatibilityIssueCode =
  | "UNSUPPORTED_FILE_FORMAT"
  | "FILE_TOO_LARGE"
  | "MIME_TYPE_MISMATCH"
  | "FILE_SIGNATURE_MISMATCH"
  | "WORKBOOK_PARSE_FAILED"
  | "PASSWORD_PROTECTED"
  | "MISSING_REQUIRED_SHEET"
  | "AMBIGUOUS_SHEET"
  | "HEADER_ROW_NOT_FOUND"
  | "MISSING_REQUIRED_COLUMN"
  | "DUPLICATE_CANONICAL_COLUMN"
  | "UNKNOWN_COLUMN"
  | "OPTIONAL_COLUMN_MISSING"
  | "SHEET_ROW_LIMIT_EXCEEDED"
  | "WORKBOOK_ROW_LIMIT_EXCEEDED"
  | "SHEET_COLUMN_LIMIT_EXCEEDED"
  | "FORMULA_CELLS_PRESENT"
  | "FORMULA_WITHOUT_CACHED_VALUE";

export type MmsWorkbookCompatibilityIssue = {
  code: MmsCompatibilityIssueCode;
  severity: MmsIssueSeverity;
  message: string;
  sheet?: MmsCanonicalSheetName;
  actualSheetName?: string;
  column?: string;
  cell?: string;
};

export type MmsWorkbookSheetCompatibility = {
  canonicalName: MmsCanonicalSheetName;
  actualName: string | null;
  headerRowNumber: number | null;
  estimatedRowCount: number;
  estimatedColumnCount: number;
  mappedColumns: Record<string, string>;
  missingRequiredColumns: string[];
  missingOptionalColumns: string[];
  unknownColumns: string[];
  formulaCellCount: number;
  formulaCellsWithoutCachedValue: number;
};

export type MmsWorkbookCompatibilityReport = {
  contractVersion: string;
  status: MmsCompatibilityStatus;
  generatedAt: string;
  file: {
    name: string;
    format: MmsWorkbookFormat | null;
    mimeType: string;
    byteLength: number;
    signatureVerified: boolean;
    originalFilePreserved: true;
  };
  workbook: {
    sheetCount: number;
    estimatedRowsAcrossRequiredSheets: number;
    formulaCellCount: number;
    formulaCellsWithoutCachedValue: number;
  };
  sheets: MmsWorkbookSheetCompatibility[];
  issues: MmsWorkbookCompatibilityIssue[];
};

export type MmsContractSourceRow = {
  rowNumber: number;
  values: Record<string, unknown>;
};

export type MmsWorkbookContractExtraction = {
  report: MmsWorkbookCompatibilityReport;
  productionRows: MmsContractSourceRow[];
  downtimeRows: MmsContractSourceRow[];
};

export type MmsDataIssueCode =
  | "BUSINESS_DATE_INFERRED"
  | "CROSS_MIDNIGHT_END_INFERRED"
  | "DUPLICATE_RECORD"
  | "INVALID_DATE"
  | "INVALID_DURATION"
  | "INVALID_INTERVAL"
  | "INVALID_NUMBER"
  | "MISSING_MACHINE"
  | "MISSING_MACHINE_TYPE"
  | "MISSING_OPERATOR"
  | "MISSING_PRODUCT"
  | "MISSING_REASON"
  | "MISSING_REQUIRED_VALUE"
  | "MISSING_SHIFT"
  | "NEGATIVE_VALUE_REQUIRES_CLASSIFICATION"
  | "OVERLAPPING_INTERVAL"
  | "QUANTITY_MISMATCH"
  | "UNREPORTED_DOWNTIME";

export type MmsDataIssue = {
  id: string;
  code: MmsDataIssueCode;
  severity: Exclude<MmsIssueSeverity, "info">;
  message: string;
  sheet: MmsCanonicalSheetName;
  rowNumber: number;
  recordId: string;
  field?: string;
  relatedRecordId?: string;
};

export type MmsOperatorReference = {
  raw: string;
  names: string[];
  isMissing: boolean;
};

export type MmsProductReference = {
  partNumber: string;
  partName: string;
  partErpCode: string;
  productName: string;
  erpCode: string;
};

export type CanonicalMmsRecordBase = {
  id: string;
  fingerprint: string;
  sourceSheet: MmsCanonicalSheetName;
  sourceRow: number;
  businessDate: string | null;
  startAt: string | null;
  endAt: string | null;
  startSortKey: number | null;
  endSortKey: number | null;
  machine: string;
  shift: string;
  issueCodes: MmsDataIssueCode[];
  duplicateOf: string | null;
  isValid: boolean;
  includedInTotals: boolean;
};

export type CanonicalProductionRecord = CanonicalMmsRecordBase & {
  sourceSheet: "Product Log Book";
  machineType: string | null;
  product: MmsProductReference;
  operator: MmsOperatorReference;
  timesSeconds: {
    shift: number | null;
    allowed: number | null;
    operative: number | null;
    nonOperative: number | null;
    downtime: number | null;
    systemOff: number | null;
    setup: number | null;
    additionalOvertime: number | null;
    productionGap: number | null;
  };
  cycleTimesSeconds: {
    standard: number | null;
    approved: number | null;
    achieved: number | null;
  };
  quantities: {
    reported: number | null;
    stroke: number | null;
    multiplier: number | null;
    calculatedFromStroke: number | null;
    shiftTarget: number | null;
    operativeTimeTarget: number | null;
    productionLoss: number | null;
    rejected: number | null;
    reworked: number | null;
    errorStroke: number | null;
  };
  costs: {
    part: number | null;
    component: number | null;
    machinePerHour: number | null;
    operatorPerHour: number | null;
  };
  scrapPerPart: number | null;
  qualityInterlock: string;
  processDependency: string;
  proxy: string;
  toolRequired: string;
};

export type CanonicalDowntimeRecord = CanonicalMmsRecordBase & {
  sourceSheet: "Down Time Details";
  durationSeconds: number | null;
  productName: string;
  operator: MmsOperatorReference;
  reasonType: string;
  reason: string;
  isUnreported: boolean;
  reportedMachineHourLoss: number | null;
};

export type MmsImportStats = {
  productionRowsRead: number;
  downtimeRowsRead: number;
  productionTotalRowsExcluded: number;
  downtimeTotalRowsExcluded: number;
  duplicateRecordsExcluded: number;
  invalidRecordsExcluded: number;
  negativeRecordsAwaitingClassification: number;
  errorCount: number;
  warningCount: number;
  invalidCoreRowRate: number;
};

export type CanonicalMmsImport = {
  source: {
    company: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
    importedAt: string;
    contractVersion: string;
  };
  compatibility: MmsWorkbookCompatibilityReport;
  productionRecords: CanonicalProductionRecord[];
  downtimeRecords: CanonicalDowntimeRecord[];
  dataIssues: MmsDataIssue[];
  stats: MmsImportStats;
};

export type MmsImportSummary = {
  source: CanonicalMmsImport["source"];
  compatibility: MmsWorkbookCompatibilityReport;
  stats: MmsImportStats;
  dateRange: [string, string] | null;
  machineCount: number;
  productCount: number;
  productionRecordCount: number;
  downtimeRecordCount: number;
  issuePreview: MmsDataIssue[];
  totalDataIssueCount: number;
};

export type MmsImportWorkerRequest = {
  type: "parse";
  requestId: string;
  file: {
    name: string;
    mimeType: string;
    byteLength: number;
    lastModified: number;
    buffer: ArrayBuffer;
  };
};

export type MmsImportWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: number;
      stage: string;
    }
  | {
      type: "success";
      requestId: string;
      summary: MmsImportSummary;
    }
  | {
      type: "failure";
      requestId: string;
      message: string;
      compatibility?: MmsWorkbookCompatibilityReport;
      stats?: MmsImportStats;
      dataIssues?: MmsDataIssue[];
    };
