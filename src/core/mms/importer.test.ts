import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  MmsDataQualityError,
  MmsWorkbookCompatibilityError,
  inspectMmsWorkbookCompatibility,
  parseMmsWorkbookFile,
} from "./index";

const productionHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Qty",
  "Opr. Time",
  "Std. Cycle Time",
  "Part No.",
  "Product Name",
  "Machine Type",
  "Operator",
  "Stroke",
  "M. Factor",
] as const;

const downtimeHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Duration",
  "Revenue",
  "Reason_Type",
  "Reason",
  "Product Name",
  "Operator Name",
] as const;

const validProduction = [
  "31/07/2023",
  "Press 01",
  "Shift 1",
  "08:00:00",
  "16:00:00",
  100,
  "07:30:00",
  60,
  "PART-01",
  "Widget",
  "Hydraulic",
  "Asha",
  40,
  2,
] as const;

const validDowntime = [
  "31/07/2023",
  "Press 01",
  "Shift 1",
  "12:00:00",
  "12:30:00",
  "00:30:00",
  500,
  "Breakdown",
  "Hydraulic leak",
  "Widget",
  "Asha",
] as const;

function sheet(headers: readonly unknown[], rows: readonly (readonly unknown[])[]) {
  return XLSX.utils.aoa_to_sheet([
    ["3D Technopack Pvt Ltd"],
    [],
    [],
    [],
    [],
    [...headers],
    ...rows.map((row) => [...row]),
  ]);
}

function workbook(options?: {
  productionHeaders?: readonly unknown[];
  productionRows?: readonly (readonly unknown[])[];
  downtimeRows?: readonly (readonly unknown[])[];
}): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet(
      options?.productionHeaders ?? productionHeaders,
      options?.productionRows ?? [validProduction],
    ),
    "Product Log Book",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet(downtimeHeaders, options?.downtimeRows ?? [validDowntime]),
    "Down Time Details",
  );
  return book;
}

function fileBuffer(
  book: XLSX.WorkBook,
  bookType: "xls" | "xlsx" = "xlsx",
): ArrayBuffer {
  return XLSX.write(book, { type: "array", bookType }) as ArrayBuffer;
}

describe("MMS workbook importer", () => {
  it.each([
    ["xlsx" as const, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["xls" as const, "application/vnd.ms-excel"],
  ])("imports a valid .%s workbook without replacing reported quantity", (bookType, mimeType) => {
    const buffer = fileBuffer(workbook(), bookType);
    const result = parseMmsWorkbookFile({
      buffer,
      fileName: `sample.${bookType}`,
      mimeType,
      importedAt: "2026-08-24T00:00:00.000Z",
    });

    expect(result.compatibility.status).toBe("compatible");
    expect(result.productionRecords).toHaveLength(1);
    expect(result.downtimeRecords).toHaveLength(1);
    expect(result.productionRecords[0]).toMatchObject({
      sourceRow: 7,
      businessDate: "2023-07-31",
      quantities: {
        reported: 100,
        stroke: 40,
        multiplier: 2,
        calculatedFromStroke: 80,
      },
    });
    expect(result.productionRecords[0].issueCodes).toContain("QUANTITY_MISMATCH");
    expect(result.productionRecords[0].quantities.reported).toBe(100);
    expect(result.downtimeRecords[0].durationSeconds).toBe(1_800);
  });

  it("accepts header aliases and preserves source row evidence", () => {
    const aliased: unknown[] = [...productionHeaders];
    aliased[0] = "Production Date";
    aliased[5] = "Actual Qty";
    aliased[6] = "Operating Time";
    aliased[7] = "Standard Cycle Time";
    const buffer = fileBuffer(workbook({ productionHeaders: aliased }));
    const result = parseMmsWorkbookFile({
      buffer,
      fileName: "aliases.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.productionRecords[0].sourceSheet).toBe("Product Log Book");
    expect(result.productionRecords[0].sourceRow).toBe(7);
    expect(result.productionRecords[0].quantities.reported).toBe(100);
  });

  it("retains exact duplicates and negative rows as evidence but excludes them from totals", () => {
    const negative: unknown[] = [...validProduction];
    negative[5] = -10;
    const result = parseMmsWorkbookFile({
      buffer: fileBuffer(
        workbook({ productionRows: [validProduction, validProduction, negative] }),
      ),
      fileName: "exceptions.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.productionRecords).toHaveLength(3);
    expect(result.productionRecords[1].duplicateOf).toBe(
      result.productionRecords[0].id,
    );
    expect(result.productionRecords[1].includedInTotals).toBe(false);
    expect(result.productionRecords[2].includedInTotals).toBe(false);
    expect(result.stats.duplicateRecordsExcluded).toBe(1);
    expect(result.stats.negativeRecordsAwaitingClassification).toBe(1);
  });

  it("rejects a workbook that is missing a required column", () => {
    const headers = productionHeaders.filter((header) => header !== "Qty");
    const rowWithoutQty = validProduction.filter((_, index) => index !== 5);

    expect(() =>
      parseMmsWorkbookFile({
        buffer: fileBuffer(
          workbook({ productionHeaders: headers, productionRows: [rowWithoutQty] }),
        ),
        fileName: "missing-qty.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toThrow(MmsWorkbookCompatibilityError);
  });

  it("rejects files whose extension and binary signature disagree", () => {
    const xlsBuffer = fileBuffer(workbook(), "xls");
    expect(() =>
      parseMmsWorkbookFile({
        buffer: xlsBuffer,
        fileName: "renamed.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toThrow(MmsWorkbookCompatibilityError);
  });

  it("rejects macro-enabled workbooks before parsing", () => {
    expect(() =>
      parseMmsWorkbookFile({
        buffer: fileBuffer(workbook()),
        fileName: "macros.xlsm",
        mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
      }),
    ).toThrow(MmsWorkbookCompatibilityError);
  });

  it("discloses a cross-midnight time inference", () => {
    const nightShift: unknown[] = [...validProduction];
    nightShift[2] = "Shift 2";
    nightShift[3] = "20:00:00";
    nightShift[4] = "04:00:00";
    const result = parseMmsWorkbookFile({
      buffer: fileBuffer(workbook({ productionRows: [nightShift] })),
      fileName: "night-shift.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.productionRecords[0].endAt).toBe("2023-08-01T04:00:00");
    expect(result.productionRecords[0].issueCodes).toContain(
      "CROSS_MIDNIGHT_END_INFERRED",
    );
  });

  it("rejects an import when more than 25% of core rows are invalid", () => {
    const invalid: unknown[] = [...validProduction];
    invalid[5] = "not-a-number";
    expect(() =>
      parseMmsWorkbookFile({
        buffer: fileBuffer(workbook({ productionRows: [invalid] })),
        fileName: "invalid.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toThrow(MmsDataQualityError);
  });

  it("reports formulas and missing cached formula values", () => {
    const book = workbook();
    const productSheet = book.Sheets["Product Log Book"];
    productSheet.F7 = { t: "n", f: "40+60", v: 100 };
    productSheet.G7 = { t: "n", f: "0.3125" };
    const report = inspectMmsWorkbookCompatibility(book, {
      fileName: "formulas.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      byteLength: 1_024,
      signatureVerified: true,
    });

    expect(report.workbook.formulaCellCount).toBe(2);
    expect(report.workbook.formulaCellsWithoutCachedValue).toBe(1);
    expect(report.status).toBe("compatible_with_warnings");
  });
});

const realSamplePath = process.env.MMS_SAMPLE_PATH;

describe.skipIf(!realSamplePath)("verified MMS sample", () => {
  it("imports the real workbook without modifying or storing it", () => {
    const bytes = readFileSync(realSamplePath!);
    const buffer = new Uint8Array(bytes).buffer;
    const result = parseMmsWorkbookFile({
      buffer,
      fileName: "Sample1_31-07-23_To_25-12-24.xls",
      mimeType: "application/vnd.ms-excel",
    });

    expect(result.productionRecords).toHaveLength(13_617);
    expect(result.downtimeRecords).toHaveLength(30_848);
    expect(result.productionRecords[0].sourceRow).toBe(7);
    expect(result.stats.invalidRecordsExcluded).toBe(1);
    expect(result.stats.invalidCoreRowRate).toBeLessThan(0.001);
    expect(
      result.dataIssues
        .filter((issue) => issue.severity === "error")
        .map((issue) => `${issue.sheet}:${issue.rowNumber}:${issue.code}`),
    ).toEqual(["Down Time Details:14:INVALID_DURATION"]);
  });
});
