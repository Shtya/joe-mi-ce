import * as ExcelJS from "exceljs";

/** Adds the visible payroll period sheet(s) to a report workbook, excluding the employee directory. */
export async function appendPayrollTimeSheet(
  reportBuffer: Buffer,
  payrollTimeSheetBuffer: Buffer,
): Promise<Buffer> {
  const reportWorkbook = new ExcelJS.Workbook();
  const payrollWorkbook = new ExcelJS.Workbook();
  await Promise.all([
    reportWorkbook.xlsx.load(reportBuffer),
    payrollWorkbook.xlsx.load(payrollTimeSheetBuffer),
  ]);

  const periodSheets = payrollWorkbook.worksheets.filter(
    (worksheet) =>
      worksheet.name !== "Employees_DB" && worksheet.state === "visible",
  );
  if (!periodSheets.length)
    throw new Error("Payroll time sheet has no visible period worksheet");

  for (const source of periodSheets) {
    if (reportWorkbook.getWorksheet(source.name))
      throw new Error(`Report already contains worksheet ${source.name}`);

    const destination = reportWorkbook.addWorksheet(source.name);
    destination.properties = structuredClone(source.properties);
    destination.pageSetup = structuredClone(source.pageSetup);
    destination.headerFooter = structuredClone(source.headerFooter);
    destination.views = structuredClone(source.views);
    destination.state = source.state;
    destination.columns = source.columns.map((column) => ({
      width: column.width,
      hidden: column.hidden,
      outlineLevel: column.outlineLevel,
      style: structuredClone(column.style),
    }));

    for (const merge of source.model.merges ?? [])
      destination.mergeCells(merge);

    source.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
      const destinationRow = destination.getRow(rowNumber);
      destinationRow.height = sourceRow.height;
      destinationRow.hidden = sourceRow.hidden;
      destinationRow.outlineLevel = sourceRow.outlineLevel;

      sourceRow.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
        const destinationCell = destinationRow.getCell(columnNumber);
        destinationCell.value =
          sourceCell.value instanceof Date
            ? new Date(sourceCell.value.getTime())
            : structuredClone(sourceCell.value);
        destinationCell.style = structuredClone(sourceCell.style);
        if (sourceCell.note !== undefined)
          destinationCell.note = structuredClone(sourceCell.note);
      });
    });
  }

  return Buffer.from(await reportWorkbook.xlsx.writeBuffer());
}
