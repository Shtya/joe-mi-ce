import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import * as ExcelJS from "exceljs";
import { buildFeedbackWorkbook } from "./feedback-export";

describe("buildFeedbackWorkbook", () => {
  it("exports feedback details, attachment URLs, and local image attachments", async () => {
    const uploadRoot = await mkdtemp(join(tmpdir(), "feedback-export-"));
    const imagePath = join(uploadRoot, "photo.png");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    await writeFile(imagePath, png);

    const workbookBuffer = await buildFeedbackWorkbook(
      [
        {
          created_at: new Date("2026-10-28T08:30:00.000Z"),
          type: "Bug",
          message: "The image upload is not visible",
          is_resolved: false,
          resolved_at: null,
          attachment_urls: [
            "/uploads/feedback/photo.png",
            "/uploads/feedback/manual.pdf",
          ],
          user: { name: "Sara", username: "sara@example.com", mobile: "0123" },
          project: { name: "Demo Project" },
          resolvedBy: null,
          exportBranchName: "Riyadh Branch",
        },
      ] as any,
      uploadRoot,
      "https://api.example.com",
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);
    const worksheet = workbook.getWorksheet("Feedback");

    expect(worksheet.getRow(1).values).not.toContain("Feedback ID");
    expect(worksheet.getRow(1).values).not.toContain("Project");
    expect(worksheet.getCell("D2").value).toBe("Riyadh Branch");
    expect(worksheet.getCell("J2").value).toEqual({
      text: "/uploads/feedback/photo.png",
      hyperlink: "https://api.example.com/uploads/feedback/photo.png",
    });
    expect(worksheet.getCell("K2").value).toEqual({
      text: "/uploads/feedback/manual.pdf",
      hyperlink: "https://api.example.com/uploads/feedback/manual.pdf",
    });
    expect(workbook.model.media).toHaveLength(1);
  });
});
