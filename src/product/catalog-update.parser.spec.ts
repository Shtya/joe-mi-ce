import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as ExcelJS from "exceljs";
import {
  buildCatalogSku,
  parseCatalogUpdateRows,
} from "./catalog-update.parser";
import { loadCatalogUpdateWorkbook } from "./catalog-update.workbook";

describe("buildCatalogSku", () => {
  it("puts a usable SACO SKU before a usable Extra SKU", () => {
    expect(buildCatalogSku("111521", "100487287")).toEqual({
      value: "111521 - 100487287",
      ignoredComponents: [],
    });
  });

  it("omits inactive SKU placeholders", () => {
    expect(buildCatalogSku("115738", "Not in RSP's")).toEqual({
      value: "115738",
      ignoredComponents: [
        {
          source: "extraSku",
          value: "Not in RSP's",
          reason: "inactive_placeholder",
        },
      ],
    });
  });

  it("stores an equal SACO and Extra SKU only once", () => {
    expect(buildCatalogSku("12345", "12345")).toEqual({
      value: "12345",
      ignoredComponents: [],
    });
  });

  it.each(["Not Active", "Not ACTV", "Inactive", "N/A", "NA"])(
    "omits %s as an inactive SKU placeholder",
    (placeholder) => {
      expect(buildCatalogSku(placeholder, "100527248")).toEqual({
        value: "100527248",
        ignoredComponents: [
          {
            source: "sacoSku",
            value: placeholder,
            reason: "inactive_placeholder",
          },
        ],
      });
    },
  );
});

describe("parseCatalogUpdateRows", () => {
  const headers = [
    null,
    "system item name ",
    "brand ",
    "Proudect Name ",
    "Proudect Model Number  ",
    "Saco SKU ",
    "Extra SKU ",
    "Category",
    "RSP",
  ];

  it("parses the supplied misspelled headers and preserves worksheet row numbers", () => {
    const result = parseCatalogUpdateRows([
      [null, null, null, "Actual ", null, null, null, null, null],
      headers,
      [
        null,
        " I5 Stretch ",
        "TINECO",
        "Tineco Floor One i5 strech",
        "FW441700AE",
        "111521",
        "100487287",
        "Floor Washer",
        1799,
      ],
    ]);

    expect(result.headerRowNumber).toBe(2);
    expect(result.rows).toEqual([
      expect.objectContaining({
        excelRowNumber: 3,
        matchName: "I5 Stretch",
        normalizedMatchName: "i5 stretch",
        name: "Tineco Floor One i5 strech",
        model: "FW441700AE",
        sacoSku: "111521",
        extraSku: "100487287",
        sku: "111521 - 100487287",
        price: 1799,
        errors: [],
      }),
    ]);
  });

  it("returns row errors instead of converting an invalid RSP to zero", () => {
    const result = parseCatalogUpdateRows([
      headers,
      [
        null,
        "T30C White",
        "ECOVACS",
        "T30C prime White",
        "DLX88-white",
        "115738",
        "Not in RSP's",
        "Robovacume",
        "not-a-price",
      ],
    ]);

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        excelRowNumber: 2,
        price: null,
        errors: ["RSP must be a finite non-negative number"],
      }),
    );
  });

  it("reports missing required headers", () => {
    const result = parseCatalogUpdateRows([
      ["system item name", "Proudect Name", "RSP"],
      ["I5 Stretch", "Tineco Floor One i5 strech", 1799],
    ]);

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      "Missing required workbook headers: Proudect Model Number, Saco SKU, Extra SKU",
    ]);
  });
});

describe("loadCatalogUpdateWorkbook", () => {
  it("reads only the first worksheet and reports ignored worksheets", async () => {
    const workbook = new ExcelJS.Workbook();
    const source = workbook.addWorksheet("Sheet1");
    source.addRow([
      null,
      "system item name",
      "Proudect Name",
      "Proudect Model Number",
      "Saco SKU",
      "Extra SKU",
      "RSP",
    ]);
    source.addRow([
      null,
      "I5 Stretch",
      "Tineco Floor One i5 strech",
      "FW441700AE",
      "111521",
      "100487287",
      1799,
    ]);
    workbook.addWorksheet("Store Name").addRow(["this sheet must be ignored"]);

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "catalog-update-"),
    );
    const filePath = path.join(directory, "catalog-update.xlsx");
    await workbook.xlsx.writeFile(filePath);

    try {
      await expect(loadCatalogUpdateWorkbook(filePath)).resolves.toEqual(
        expect.objectContaining({
          worksheetName: "Sheet1",
          ignoredWorksheetNames: ["Store Name"],
          rows: [
            expect.objectContaining({
              excelRowNumber: 2,
              matchName: "I5 Stretch",
            }),
          ],
        }),
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
