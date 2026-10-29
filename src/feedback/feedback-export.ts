import { existsSync } from "fs";
import { extname, join, relative, resolve } from "path";
import * as ExcelJS from "exceljs";
import { Feedback } from "entities/feedback.entity";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

type FeedbackExportRow = Pick<
  Feedback,
  | "created_at"
  | "type"
  | "message"
  | "is_resolved"
  | "resolved_at"
  | "attachment_urls"
  | "user"
  | "project"
  | "resolvedBy"
> & {
  exportBranchName?: string;
};

function getLocalImagePath(
  attachmentUrl: string,
  uploadRoot: string,
): string | null {
  if (!attachmentUrl.startsWith("/uploads/feedback/")) return null;

  const relativeAttachmentPath = attachmentUrl.slice(
    "/uploads/feedback/".length,
  );
  const root = resolve(uploadRoot);
  const path = resolve(join(root, relativeAttachmentPath));
  const pathRelativeToRoot = relative(root, path);

  if (
    !pathRelativeToRoot ||
    pathRelativeToRoot.startsWith("..") ||
    pathRelativeToRoot.split(/[\\/]/).includes("..") ||
    !IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) ||
    !existsSync(path)
  ) {
    return null;
  }

  return path;
}

function formatUser(user: Feedback["user"]): string {
  if (!user) return "";
  return [user.name, user.username].filter(Boolean).join(" / ");
}

export async function buildFeedbackWorkbook(
  feedbacks: FeedbackExportRow[],
  uploadRoot: string,
  publicBaseUrl = "",
): Promise<Buffer> {
  const localImages = feedbacks.map((feedback) =>
    (feedback.attachment_urls ?? [])
      .map((url) => getLocalImagePath(url, uploadRoot))
      .filter((path): path is string => Boolean(path)),
  );
  const imageColumnCount = Math.max(
    0,
    ...localImages.map((images) => images.length),
  );
  const attachmentColumnCount = Math.max(
    0,
    ...feedbacks.map((feedback) => feedback.attachment_urls?.length ?? 0),
  );

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Feedback");
  const columns = [
    { header: "Created At", key: "created_at", width: 24 },
    { header: "Type", key: "type", width: 18 },
    { header: "Message", key: "message", width: 48 },
    { header: "Branch", key: "branch", width: 28 },
    { header: "Submitted By", key: "submitted_by", width: 30 },
    { header: "Mobile", key: "mobile", width: 18 },
    { header: "Resolved", key: "is_resolved", width: 14 },
    { header: "Resolved At", key: "resolved_at", width: 24 },
    { header: "Resolved By", key: "resolved_by", width: 30 },
    ...Array.from({ length: attachmentColumnCount }, (_, index) => ({
      header: `Attachment ${index + 1}`,
      key: `attachment_${index + 1}`,
      width: 48,
    })),
    ...Array.from({ length: imageColumnCount }, (_, index) => ({
      header: `Image ${index + 1}`,
      key: `image_${index + 1}`,
      width: 18,
    })),
  ];
  worksheet.columns = columns;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: "A1",
    to: `${String.fromCharCode(65 + columns.length - 1)}1`,
  };

  feedbacks.forEach((feedback, feedbackIndex) => {
    const attachmentUrls = feedback.attachment_urls ?? [];
    const row = worksheet.addRow({
      created_at: feedback.created_at,
      type: feedback.type,
      message: feedback.message,
      branch: feedback.exportBranchName ?? "",
      submitted_by: formatUser(feedback.user),
      mobile: feedback.user?.mobile ?? "",
      is_resolved: feedback.is_resolved ? "Yes" : "No",
      resolved_at: feedback.resolved_at,
      resolved_by: formatUser(feedback.resolvedBy),
    });

    attachmentUrls.forEach((url, attachmentIndex) => {
      const cell = row.getCell(10 + attachmentIndex);
      const hyperlink = /^https?:\/\//i.test(url)
        ? url
        : `${publicBaseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
      cell.value = {
        text: url,
        hyperlink,
        tooltip: "Open attachment",
      };
      cell.font = { color: { argb: "FF0563C1" }, underline: true };
    });

    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    const images = localImages[feedbackIndex];
    if (images.length) row.height = 72;
    images.forEach((imagePath, imageIndex) => {
      const extension: "jpeg" | "png" = [".jpg", ".jpeg"].includes(
        extname(imagePath).toLowerCase(),
      )
        ? "jpeg"
        : "png";
      const imageId = workbook.addImage({ filename: imagePath, extension });
      worksheet.addImage(imageId, {
        tl: {
          col: 9 + attachmentColumnCount + imageIndex,
          row: row.number - 1,
        },
        ext: { width: 88, height: 66 },
      });
    });
  });

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  });
  worksheet.getRow(1).height = 30;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
