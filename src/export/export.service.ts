import { Injectable, BadRequestException } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { splitLocalDateTime } from "common/date.util";
import * as ExcelJS from "exceljs";
import * as dayjs from "dayjs";
import { Branch } from "entities/branch.entity";
import { Product } from "entities/products/product.entity";
import { Sale } from "entities/products/sale.entity";
import { Stock } from "entities/products/stock.entity";
import { User } from "entities/user.entity";
import { Shift } from "entities/employee/shift.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { Chain } from "entities/locations/chain.entity";
import { City } from "entities/locations/city.entity";
import { Country } from "entities/locations/country.entity";
import { Region } from "entities/locations/region.entity";
import { Brand } from "entities/products/brand.entity";
import { Category } from "entities/products/category.entity";
import { Audit } from "entities/audit.entity";
import { Competitor } from "entities/competitor.entity";
import { Permission } from "entities/permissions.entity";
import { Role } from "entities/role.entity";
import { SurveyFeedback } from "entities/survey-feedback.entity";
import { Survey } from "entities/survey.entity";
import { CheckIn, Journey, JourneyPlan } from "entities/all_plans.entity";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export enum ModuleName {
  SALE = "sale",
  PRODUCT = "product",
  STOCK = "stock",
  BRANCH = "branch",
  USER = "user",

  CHECKIN = "checkin",
  JOURNEY = "journey",
  JOURNEYPLAN = "journeyplan",
  SHIFT = "shift",
  VACATION = "vacation",

  CHAIN = "chain",
  CITY = "city",
  COUNTRY = "country",
  REGION = "region",

  BRAND = "brand",
  CATEGORY = "category",

  AUDIT = "audit",
  COMPETITOR = "competitor",

  PERMISSION = "permission",
  ROLE = "role",

  SURVEYFEEDBACK = "surveyfeedback",
  SURVEY = "survey",
}

export const moduleRepoMap: Record<ModuleName, any> = {
  [ModuleName.SALE]: Sale,
  [ModuleName.PRODUCT]: Product,
  [ModuleName.STOCK]: Stock,
  [ModuleName.BRANCH]: Branch,
  [ModuleName.USER]: User,

  [ModuleName.CHECKIN]: CheckIn,
  [ModuleName.JOURNEY]: Journey,
  [ModuleName.JOURNEYPLAN]: JourneyPlan,
  [ModuleName.SHIFT]: Shift,
  [ModuleName.VACATION]: Vacation,

  [ModuleName.CHAIN]: Chain,
  [ModuleName.CITY]: City,
  [ModuleName.COUNTRY]: Country,
  [ModuleName.REGION]: Region,

  [ModuleName.BRAND]: Brand,
  [ModuleName.CATEGORY]: Category,

  [ModuleName.AUDIT]: Audit,
  [ModuleName.COMPETITOR]: Competitor,

  [ModuleName.PERMISSION]: Permission,
  [ModuleName.ROLE]: Role,

  [ModuleName.SURVEYFEEDBACK]: SurveyFeedback,
  [ModuleName.SURVEY]: Survey,
};

@Injectable()
export class ExportService {
  constructor(
    public readonly dataSource: DataSource,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Extract main entity name from URL
   */
  private extractMainEntityFromUrl(url: string): string {
    try {
      // First check for module query param
      const queryMatch = url.match(/[?&]module=([^&]+)/);
      if (queryMatch && queryMatch[1]) {
        return queryMatch[1].toLowerCase();
      }

      const urlWithoutQuery = url.split("?")[0];
      const parts = urlWithoutQuery.split("/");

      // Look for specific entities first, regardless of where they are in the path
      const specificEntities = [
        "journey",
        "journeyplan",
        "checkin",
        "sale",
        "sales",
        "product",
        "stock",
        "shift",
        "vacation",
        "audit",
        "competitor",
        "survey",
        "user",
      ];

      for (const part of parts) {
        const lowerPart = part.toLowerCase();
        for (const entity of specificEntities) {
          if (lowerPart.includes(entity)) {
            return entity;
          }
        }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i] && parts[i].trim() !== "") {
          let entity = parts[i].toLowerCase();

          // Skip if it looks like a UUID
          if (
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              entity,
            )
          ) {
            continue;
          }

          // Skip common non-entity parts
          if (["api", "v1", "export", "by-url"].includes(entity)) {
            continue;
          }

          entity = entity.replace(/\.(json|xml|csv)$/, "");
          return entity;
        }
      }

      return "data";
    } catch (error) {
      console.error("Error extracting entity from URL:", error);
      return "data";
    }
  }

  /**
   * Extract data from response
   */
  private extractDataFromResponse(response: any): any[] {
    const paginationFields = [
      "current_page",
      "per_page",
      "last_page",
      "total",
      "next_page_url",
      "prev_page_url",
      "from",
      "to",
      "path",
      "first_page_url",
      "last_page_url",
      "links",
    ];

    if (response && typeof response === "object") {
      if (Array.isArray(response.records)) {
        return response.records;
      }

      if (Array.isArray(response.data)) {
        return response.data;
      }

      if (Array.isArray(response.items)) {
        return response.items;
      }

      if (Array.isArray(response)) {
        return response;
      }

      const isPaginated = paginationFields.some((field) => field in response);
      if (isPaginated) {
        const cleanData: any = {};
        Object.keys(response).forEach((key) => {
          if (!paginationFields.includes(key)) {
            cleanData[key] = response[key];
          }
        });

        if (Array.isArray(cleanData.records)) {
          return cleanData.records;
        }
        if (Array.isArray(cleanData.data)) {
          return cleanData.data;
        }

        return [cleanData];
      }

      return [response];
    }

    return [];
  }

  /**
   * Convert Records 0, Records 1, etc. columns into separate rows
   */
  private convertRecordsColumnsToRows(data: any[]): any[] {
    const allRows: any[] = [];

    data.forEach((row) => {
      const recordKeys = Object.keys(row).filter(
        (key) => key.startsWith("Records ") && key.match(/Records \d+/),
      );

      if (recordKeys.length === 0) {
        allRows.push(row);
        return;
      }

      const recordNumbers = [
        ...new Set(
          recordKeys
            .map((key) => {
              const match = key.match(/Records (\d+)/);
              return match ? parseInt(match[1]) : -1;
            })
            .filter((num) => num >= 0),
        ),
      ].sort((a, b) => a - b);

      recordNumbers.forEach((recordNum) => {
        const newRow: any = {};

        Object.keys(row).forEach((key) => {
          if (!key.startsWith("Records ")) {
            newRow[key] = row[key];
          }
        });

        const recordPrefix = `Records ${recordNum} `;
        Object.keys(row).forEach((key) => {
          if (key.startsWith(recordPrefix)) {
            const fieldName = key.substring(recordPrefix.length);
            newRow[fieldName] = row[key];
          }
        });

        allRows.push(newRow);
      });
    });

    return allRows;
  }

  /**
   * Flatten object with entity-aware prefixes
   * Remove all ID fields and only show branch name when not main entity
   */
  private flattenObjectWithEntityPrefixes(
    obj: any,
    mainEntity: string = "",
    currentEntity: string = "",
    result: any = {},
    visited: Set<any> = new Set(),
    depth: number = 0,
  ): any {
    if (!obj || typeof obj !== "object" || visited.has(obj)) {
      return result;
    }

    visited.add(obj);

    // Strictly exclude ALL ID fields and metadata
    const idFieldPatterns = [
      /id$/i, // Ends with "id" (case insensitive)
      /_id$/i, // Ends with "_id"
      /Id$/i, // Ends with "Id"
      /identifier$/i, // Ends with "identifier"
      /uuid$/i, // Ends with "uuid"
      /ref$/i, // Ends with "ref"
      /code$/i, // Ends with "code" (unless it's the main field)
      /^created_/i, // Starts with "created_"
      /^updated_/i, // Starts with "updated_"
      /^deleted_/i, // Starts with "deleted_"
      /owner/i, // Contains "owner"
      /userid/i, // Contains "userid"
      /_by$/i, // Ends with "_by"
      /_at$/i, // Ends with "_at"
      /^__/i, // Starts with "__"
      /password/i, // Contains "password"
      /token/i, // Contains "token"
      /secret/i, // Contains "secret"
      /key$/i, // Ends with "key"
      /project/i,
      /project\s+/i, // "project" followed by space(s) (for "project name", "project manager")
      /^\s*project\s+/i,
      /project_/i, // Contains "project_"
      /_project_/i, // Contains "_project_" (sandwiched)
      /^project_/i, // Starts with "project_"
      /Project[A-Z]/i,
    ];

    // Fields to explicitly include even if they might match patterns above
    const explicitlyIncludeFields = [
      "name",
      "title",
      "description",
      "price",
      "cost",
      "discount",
      "quantity",
      "model",
      "sku",
      "code",
      "image_url",
      "logo_url",
      "url",
      "is_high_priority",
      "priority",
      "status",
      "branch",
      "location",
      "email",
      "phone",
      "address",
      "type",
      "category",
      "brand",
      "stock",
      "amount",
      "total",
      "date",
      "time",
      "start_date",
      "end_date",
      "duration",
      "notes",
      "comments",
      "rating",
      "score",
      "percentage",
      "rate",
      "value",
      "size",
      "weight",
      "dimensions",
      "check in time",
      "check out time",
      "check in image",
      "check out image",
      "check in document",
      "check out document",
      "late time",
      "branch",
      "chain",
    ];

    for (const key in obj) {
      const keyLower = key.toLowerCase();
      const value = obj[key];

      if (value === null || value === undefined || value === "") {
        continue;
      }

      // Check if this is an explicitly included field
      const isExplicitlyIncluded = explicitlyIncludeFields.some(
        (field) => keyLower === field.toLowerCase(),
      );

      // Check if this matches any ID field pattern
      const matchesIdPattern = idFieldPatterns.some((pattern) =>
        pattern.test(key),
      );

      // Skip if it matches ID pattern AND is not explicitly included
      if (matchesIdPattern && !isExplicitlyIncluded) {
        continue;
      }

      // Determine entity prefix
      let entityPrefix = currentEntity;

      // Common entity names
      const entityNames = [
        "product",
        "brand",
        "category",
        "project",
        "user",
        "branch",
        "stock",
        "sale",
        "order",
        "chain",
        "city",
        "country",
        "region",
        "role",
        "permission",
        "survey",
        "audit",
        "competitor",
        "shift",
        "vacation",
        "checkin",
        "journey",
        "journeyplan",
        "feedback",
      ];

      if (entityNames.includes(keyLower)) {
        entityPrefix = key;
      } else if (!entityPrefix && mainEntity) {
        entityPrefix = mainEntity;
      }

      const fullKey =
        entityPrefix && depth > 0 ? `${entityPrefix} ${key}` : key;

      if (Array.isArray(value)) {
        if (value.length > 0) {
          if (typeof value[0] === "object") {
            const itemPrefix = key.endsWith("s") ? key.slice(0, -1) : key;
            if (entityNames.includes(itemPrefix.toLowerCase()) && depth < 2) {
              this.flattenObjectWithEntityPrefixes(
                value[0],
                mainEntity,
                itemPrefix,
                result,
                visited,
                depth + 1,
              );
            } else {
              // Skip arrays of objects for simplicity
              continue;
            }
          } else {
            result[fullKey] = value.join(", ");
          }
        }
      } else if (value instanceof Date) {
        // Format as YYYY-MM-DD HH:mm:ss
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        const hours = String(value.getHours()).padStart(2, "0");
        const minutes = String(value.getMinutes()).padStart(2, "0");
        const seconds = String(value.getSeconds()).padStart(2, "0");
        result[fullKey] =
          `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      } else if (typeof value === "object") {
        // Recursively flatten nested objects with depth limit
        const nestedPrefix = entityNames.includes(keyLower)
          ? key
          : entityPrefix;
        if (depth < 2) {
          this.flattenObjectWithEntityPrefixes(
            value,
            mainEntity,
            nestedPrefix,
            result,
            visited,
            depth + 1,
          );
        }
      } else {
        result[fullKey] = value;
      }
    }

    visited.delete(obj);
    return result;
  }

  /**
   * Clean and organize data with main entity first
   */
  private cleanDataForExport(data: any[], mainEntity: string): any[] {
    const baseUrl = "https://ce-api.joe-mi.com";
    const mainEntityLower = mainEntity.toLowerCase();

    // First pass: Pre-calculate total late time per user for the given dataset
    const userTotalLateMins: Record<string, number> = {};
    if (
      mainEntityLower.includes("journey") ||
      mainEntityLower.includes("unplanned") ||
      mainEntityLower.includes("journeyplan")
    ) {
      data.forEach((item) => {
        const userId = item.user?.id || item.userId || item.user_id;
        if (!userId) return;

        const checkInTimeStr = item.checkInTime || item.checkin?.checkInTime;
        let shiftStartTimeStr = item.shiftStartTime;
        if (!shiftStartTimeStr && item.shift?.startTime) {
          shiftStartTimeStr = item.shift.startTime;
        }

        if (checkInTimeStr && shiftStartTimeStr) {
          const checkInDate = dayjs(checkInTimeStr);
          let shiftStartDate: dayjs.Dayjs;
          if (
            shiftStartTimeStr.includes("T") ||
            shiftStartTimeStr.includes("-")
          ) {
            shiftStartDate = dayjs(shiftStartTimeStr);
          } else {
            const [sHrs, sMins] = shiftStartTimeStr.split(":").map(Number);
            shiftStartDate = dayjs(checkInDate)
              .hour(sHrs)
              .minute(sMins)
              .second(0)
              .millisecond(0);
          }
          if (
            checkInDate.isValid() &&
            shiftStartDate.isValid() &&
            checkInDate.isAfter(shiftStartDate)
          ) {
            const lateMins = checkInDate.diff(shiftStartDate, "minute");
            userTotalLateMins[userId] =
              (userTotalLateMins[userId] || 0) + lateMins;
          }
        }
      });
    }

    return data.map((item) => {
      const flattened = this.flattenObjectWithEntityPrefixes(item, mainEntity);

      const isActuallyUnplanned =
        mainEntityLower.includes("unplanned") ||
        item.unplanned !== undefined ||
        item.module === "unplanned";

      const effectiveEntityLower = isActuallyUnplanned
        ? "unplanned"
        : mainEntityLower;

      // Helper to split DateTime into Date and Time columns
      const splitDateTime = (date: any, dateKey: string, timeKey: string) => {
        const { date: d, time: t } = splitLocalDateTime(date);
        flattened[dateKey] = d;
        flattened[timeKey] = t;
      };

      // Special handling for Journey and Unplanned visits
      if (
        mainEntityLower.includes("journey") ||
        mainEntityLower.includes("unplanned") ||
        mainEntityLower.includes("journeyplan")
      ) {
        // Calculate Status Code: 0=Absent/Unplanned Absent, 1=Present/Unplanned Present, 2=Closed/Unplanned Closed
        let statusCode = 0;

        // Try to find status in various fields
        const statusVal =
          item.status ||
          item.journeyStatus ||
          item.attendanceStatusText ||
          (item.attendanceStatusText &&
            (item.attendanceStatusText.en || item.attendanceStatusText));

        if (statusVal) {
          const lowerStatus = String(statusVal).toLowerCase();
          if (lowerStatus.includes("closed")) {
            statusCode = 1;
          } else if (lowerStatus.includes("present")) {
            statusCode = 1;
          } else {
            statusCode = 0;
          }
        }

        // Ensure Status Code is added to the flattened object with a prominent key
        flattened["Status Code"] = statusCode;

        // Normalize Check-in/out data (handle both flat and nested structures)
        const checkInTimeStr = item.checkInTime || item.checkin?.checkInTime;
        const checkOutTimeStr = item.checkOutTime || item.checkin?.checkOutTime;
        const checkInDoc =
          item.checkInDocument || item.checkin?.checkInDocument;
        const checkOutDoc =
          item.checkOutDocument || item.checkin?.checkOutDocument;

        // Handle Shift data for late calculation
        let shiftStartTimeStr = item.shiftStartTime; // From optimized plan (ISO or similar)
        if (!shiftStartTimeStr && item.shift?.startTime) {
          shiftStartTimeStr = item.shift.startTime; // From nested shift (HH:mm:ss)
        }

        // Calculate Duration using dayjs for robustness
        if (checkInTimeStr && checkOutTimeStr) {
          const start = dayjs(checkInTimeStr);
          const end = dayjs(checkOutTimeStr);

          if (start.isValid() && end.isValid()) {
            const diffMins = end.diff(start, "minute");

            if (diffMins < 0) {
              flattened["Duration"] = "Invalid (Out before In)";
            } else {
              const hrs = Math.floor(diffMins / 60);
              const mins = diffMins % 60;

              // If duration is extremely long (e.g. > 24h), it might be a forgotten checkout
              // but we still show it as requested by the user's screenshot showing 555h
              flattened["Duration"] = `${hrs}h ${mins}m`;
            }
          } else {
            flattened["Duration"] = "-";
          }
        } else {
          flattened["Duration"] = "-";
        }

        // Calculate Late Time using dayjs
        if (checkInTimeStr && shiftStartTimeStr) {
          const checkInDate = dayjs(checkInTimeStr);
          let shiftStartDate: dayjs.Dayjs;

          // If shiftStartTimeStr is full ISO/Date string
          if (
            shiftStartTimeStr.includes("T") ||
            shiftStartTimeStr.includes("-")
          ) {
            shiftStartDate = dayjs(shiftStartTimeStr);
          } else {
            // Assume HH:mm:ss and use checkInDate's date part
            const [sHrs, sMins] = shiftStartTimeStr.split(":").map(Number);
            shiftStartDate = dayjs(checkInDate)
              .hour(sHrs)
              .minute(sMins)
              .second(0)
              .millisecond(0);
          }

          if (
            checkInDate.isValid() &&
            shiftStartDate.isValid() &&
            checkInDate.isAfter(shiftStartDate)
          ) {
            const lateMins = checkInDate.diff(shiftStartDate, "minute");
            flattened["Late Time"] = `${lateMins} mins`;
          } else if (checkInDate.isValid() && shiftStartDate.isValid()) {
            flattened["Late Time"] = "On time";
          } else {
            flattened["Late Time"] = "-";
          }
        } else {
          flattened["Late Time"] = "-";
        }

        const userId = item.user?.id || item.userId || item.user_id;
        if (userId && userTotalLateMins[userId]) {
          const tMins = userTotalLateMins[userId];
          const hrs = Math.floor(tMins / 60);
          const mins = tMins % 60;
          flattened["Total Late Time"] =
            hrs > 0 ? `${hrs}h ${mins}m` : `${mins} mins`;
        } else {
          flattened["Total Late Time"] = "-";
        }

        // Add Check in/out times and images (Split into Date and Time)
        splitDateTime(checkInTimeStr, "Check in date", "Check in time");
        splitDateTime(checkOutTimeStr, "Check out date", "Check out time");

        // Remove the original combined datetime columns if they exist to avoid duplication
        delete flattened["checkin checkInTime"];
        delete flattened["checkin checkOutTime"];
        delete flattened["checkInTime"];
        delete flattened["checkOutTime"];

        // Image URL formatting
        const formatImageUrl = (path: string) => {
          if (!path) return "-";
          if (path.startsWith("http")) return path;
          return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
        };

        flattened["Check in image"] = formatImageUrl(checkInDoc);
        flattened["Check out image"] = formatImageUrl(checkOutDoc);

        // Normalize Branch Name (Handle flat 'branchName' vs nested 'branch name')
        if (flattened["branchName"]) {
          flattened["branch name"] = flattened["branchName"];
          delete flattened["branchName"];
        }
        // Ensure explicit Branch key exists for backward compatibility if needed,
        // but prefer 'branch name' for the ordered list
        if (!flattened["Branch"] && flattened["branch name"]) {
          flattened["Branch"] = flattened["branch name"];
        }

        // Define preferred column order based on user request
        const preferredOrder = [
          "branch name", // Assuming flattened key logic produces this or similar
          "chain name",
          "date",
          "user name",
          "promoterName", // Special case for optimized plans
          "name",
          "Check in time",
          "date",
          "Check out time",
          "city name",
          "shift name",
          "shift starttime",
          "shift endtime",
          "Duration",
          "Check in image",
          "Check out image",
          "status",
          "Status Code",
        ];

        // Reconstruct the object with ordered keys first, then any remaining keys
        const orderedFlattened: any = {};

        // Add preferred columns if they exist
        preferredOrder.forEach((key) => {
          // Case-insensitive match for keys in flattened object
          const existingKey = Object.keys(flattened).find(
            (k) => k.toLowerCase() === key.toLowerCase(),
          );
          if (existingKey) {
            orderedFlattened[existingKey] = flattened[existingKey];
            delete flattened[existingKey]; // Remove from source so we don't duplicate
          }
        });

        // Add remaining keys that were not in the preferred list
        Object.keys(flattened).forEach((key) => {
          orderedFlattened[key] = flattened[key];
        });

        // Replace flattened object with the ordered one
        Object.keys(orderedFlattened).forEach((key) => delete flattened[key]); // Clear original
        Object.assign(flattened, orderedFlattened); // Fills with new order (JavaScript object property order is generally preserved for non-integer keys)
      }

      // Special handling for Sale entity
      if (mainEntityLower === "sale" || mainEntityLower === "sales") {
        const saleDate = item.sale_date || item.created_at;
        splitDateTime(saleDate, "Date of sale", "Time of sale");

        // Explicitly extract User fields from nested user object
        if (item.user) {
          flattened["user name"] = item.user.name || item.user.fullName || "-";
          flattened["user username"] =
            item.user.username || item.user.email || "-";
          flattened["user mobile"] = item.user.mobile || item.user.phone || "-";
        }

        // Explicitly extract Branch, Chain, City
        if (item.branch) {
          flattened["branch"] = item.branch.name || "-";
          if (item.branch.chain) {
            flattened["chain"] = item.branch.chain.name || "-";
          }
          if (item.branch.city) {
            flattened["city name"] = item.branch.city.name || "-";
          }
        }

        // Explicitly extract Product fields
        if (item.product) {
          // brand is a relation: item.product.brand is a Brand object with .name
          flattened["brand"] =
            (typeof item.product.brand === "object"
              ? item.product.brand?.name
              : item.product.brand) || "-";
          // category is a relation: item.product.category is a Category object with .name
          flattened["categories"] =
            (typeof item.product.category === "object"
              ? item.product.category?.name
              : item.product.category) || "-";
          flattened["product model"] =
            item.product.model || item.product.name || "-";
          flattened["product name"] = item.product.name || "-";
        }

        // Price comes from the Sale itself, not from the Product
        flattened["price"] = item.price ?? "-";
        // Total amount and quantity come from the Sale
        flattened["total amount"] =
          item.total_amount ?? item.totalAmount ?? "-";
        flattened["quantity"] = item.quantity ?? "-";

        // ID of the sale
        flattened["id"] = item.id || "-";
      }

      // Add branch and chain explicitly if they are not picked up correctly for any entity
      if (item.branch) {
        flattened["Branch"] =
          item.branch.name || item.branch.title || flattened["branch"];
        if (item.branch.chain) {
          flattened["Chain"] =
            item.branch.chain.name ||
            item.branch.chain.title ||
            flattened["chain"];
        }
      }

      // --- Aggressive Cleanup for Journeys and Unplanned ---
      if (
        mainEntityLower.includes("journey") ||
        mainEntityLower.includes("unplanned")
      ) {
        const journeyKeysToRemove = [
          "user active",
          "user is active",
          "checkin geo",
          "checkin iswithinradius",
          "checkin id",
          "checkin checkindocument",
          "checkin checkoutdocument",
          "checkin checkintime",
          "checkin checkouttime",
          "checkin image",
          "checkin notein",
          "checkin noteout",
          "user password",
          "user token",
          "user secret",
          "user id",
          "iswithinradius",
          "geo",
          "branch id",
          "chain id",
          "product id",
          "check in document",
          "check out document",
          "user mobile",
          "user avatar_url",
          "user is_active",
          "role name",
          "role description",
          "branch lat",
          "branch lng",
          "branch image_url",
          "branch salestargettype",
          "branch autocreatesalestargets",
          "branch defaultsaletargetamount",
          "chain logourl",
          "type",
        ];

        Object.keys(flattened).forEach((key) => {
          const keyLower = key.toLowerCase();
          const shouldRemove = journeyKeysToRemove.some(
            (k) => keyLower === k || keyLower.startsWith(k + " "),
          );

          if (
            shouldRemove ||
            keyLower.includes("iswithinradius") ||
            keyLower.includes("geo")
          ) {
            delete flattened[key];
          }

          if (
            keyLower === "branch" &&
            flattened["Branch"] &&
            key !== "Branch"
          ) {
            delete flattened[key];
          }
          if (keyLower === "chain" && flattened["Chain"] && key !== "Chain") {
            delete flattened[key];
          }
        });
      }

      // --- Strict Whitelist for Sales ---
      if (mainEntityLower.includes("sale")) {
        // Only keep these specific fields in this exact order
        const saleColumnOrder = [
          "user name",
          "user username",
          "user mobile",
          "city name",
          "chain",
          "branch",
          "brand",
          "categories",
          "product name",
          "product model",
          "price",
          "total amount",
          "quantity",
          "date of sale",
          "time of sale",
        ];

        // Re-map all normalized keys so we can find matches regardless of casing
        const normalizedFlattened: Record<string, string> = {};
        Object.keys(flattened).forEach((key) => {
          normalizedFlattened[key.toLowerCase()] = key;
        });

        // Build a fresh ordered object with only the allowed columns
        const saleOrdered: Record<string, any> = {};
        for (const col of saleColumnOrder) {
          const originalKey = normalizedFlattened[col];
          if (originalKey !== undefined) {
            saleOrdered[originalKey] = flattened[originalKey];
          }
        }

        // Replace flattened with saleOrdered
        Object.keys(flattened).forEach((key) => delete flattened[key]);
        Object.assign(flattened, saleOrdered);
      }

      // Also ensure ANY field that is a date string is formatted correctly
      // AND ensure ANY field that looks like an image/file path has the full URL
      Object.keys(flattened).forEach((key) => {
        const val = flattened[key];
        const keyLower = key.toLowerCase();

        // Date formatting
        if (
          typeof val === "string" &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
        ) {
          const { date: ld, time: lt } = splitLocalDateTime(val);
          if (ld !== "-") {
            flattened[key] = `${ld} ${lt}`;
          }
        }

        // Image/File URL formatting
        // Check if key implies an image or file, OR if the value looks like a path
        const isImageField =
          keyLower.includes("image") ||
          keyLower.includes("photo") ||
          keyLower.includes("logo") ||
          keyLower.includes("icon") ||
          keyLower.includes("document") ||
          keyLower.includes("file") ||
          keyLower.includes("avatar") ||
          keyLower.includes("url"); // Careful with generic 'url'

        if (
          typeof val === "string" &&
          (isImageField ||
            val.startsWith("/uploads") ||
            val.startsWith("/public"))
        ) {
          if (val.startsWith("/") && !val.startsWith("http")) {
            flattened[key] = `${baseUrl}${val}`;
          } else if (
            !val.startsWith("http") &&
            val.includes("/") &&
            val.includes(".")
          ) {
            // Likely a relative path like 'uploads/file.jpg' without leading slash
            // But be careful not to prefix things that aren't paths
            if (val.match(/\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx)$/i)) {
              flattened[key] = `${baseUrl}/${val}`;
            }
          }
        }
      });

      // --- Unplanned: keep ONLY the requested columns in the exact order ---
      // This is moved to the end to ensure it captures all post-processed fields
      if (effectiveEntityLower.includes("unplanned")) {
        const unplannedAllowedKeys = [
          "user name",
          "user username",
          "city name",
          "Chain",
          "branch name",
          "Check in time",
          "Check out time",
          "date",
          "Check in image",
          "Check out image",
          "status",
          "shift startTime",
          "shift endTime",
          "Duration",
          "Late Time",
          "Total Late Time",
          "Status Code",
        ];

        const unplannedFiltered: any = {};
        unplannedAllowedKeys.forEach((allowed) => {
          // Case-insensitive lookup
          const match = Object.keys(flattened).find(
            (k) => k.toLowerCase() === allowed.toLowerCase(),
          );
          if (match !== undefined) {
            unplannedFiltered[allowed] = flattened[match];
          }
        });

        // Replace flattened content with the filtered set
        Object.keys(flattened).forEach((k) => delete flattened[k]);
        Object.assign(flattened, unplannedFiltered);
      }

      return flattened;
    });
  }

  /**
   * Get entity color for header grouping
   */
  private getEntityColor(entity: string): string {
    const colorMap: Record<string, string> = {
      // Main product-related entities
      product: "FFE2EFDA", // Light green
      products: "FFE2EFDA",

      // Brand and category
      brand: "FFD9E1F2", // Light blue
      brands: "FFD9E1F2",
      category: "FFE2EFDA", // Light green
      categories: "FFE2EFDA",

      // Branch and location
      branch: "FFDCE6F1", // Light blue
      branches: "FFDCE6F1",
      location: "FFDCE6F1",
      locations: "FFDCE6F1",

      // User and people
      user: "FFF2DCDB", // Light pink
      users: "FFF2DCDB",
      person: "FFF2DCDB",
      people: "FFF2DCDB",

      // Stock and inventory
      stock: "FFEDEDED", // Light gray
      stocks: "FFEDEDED",
      inventory: "FFEDEDED",

      // Sales and orders
      sale: "FFFDE9D9", // Light orange
      sales: "FFFDE9D9",
      order: "FFFDE9D9",
      orders: "FFFDE9D9",

      // Projects
      project: "FFE4DFEC", // Light purple
      projects: "FFE4DFEC",

      // Default
      default: "FFFFFFFF", // White
    };

    return colorMap[entity.toLowerCase()] || colorMap.default;
  }

  /**
   * Get field priority score for ordering
   */
  private getFieldPriority(fieldName: string): number {
    const fieldLower = fieldName.toLowerCase();

    // Highest priority fields (0-99)
    if (fieldLower.includes("name")) return 10;
    if (fieldLower.includes("title")) return 20;
    if (fieldLower.includes("description")) return 30;

    // High priority fields (100-199)
    if (fieldLower.includes("price")) return 110;
    if (fieldLower.includes("cost")) return 120;
    if (fieldLower.includes("amount")) return 130;
    if (fieldLower.includes("total")) return 140;
    if (fieldLower.includes("quantity")) return 150;
    if (fieldLower.includes("qty")) return 160;

    // Medium priority fields (200-299)
    if (fieldLower.includes("model")) return 210;
    if (fieldLower.includes("sku")) return 220;
    if (fieldLower.includes("code")) return 230;
    if (fieldLower.includes("type")) return 240;
    if (fieldLower.includes("category")) return 250;
    if (fieldLower.includes("brand")) return 260;

    // Status fields (300-399)
    if (fieldLower.includes("status")) return 310;
    if (fieldLower.includes("is_")) return 320;
    if (fieldLower.includes("priority")) return 330;

    // Contact fields (400-499)
    if (fieldLower.includes("email")) return 410;
    if (fieldLower.includes("phone")) return 420;
    if (fieldLower.includes("address")) return 430;

    // Location fields (500-599)
    if (fieldLower.includes("branch")) return 510;
    if (fieldLower.includes("chain")) return 515;
    if (fieldLower.includes("location")) return 520;
    if (fieldLower.includes("city")) return 530;
    if (fieldLower.includes("country")) return 540;
    if (fieldLower.includes("region")) return 550;

    // Date fields (600-699)
    if (fieldLower.includes("date")) return 610;
    if (fieldLower.includes("time")) return 620;
    if (fieldLower.includes("created")) return 630;
    if (fieldLower.includes("updated")) return 640;

    // URL fields (700-799)
    if (fieldLower.includes("url")) return 710;
    if (fieldLower.includes("image")) return 720;
    if (fieldLower.includes("logo")) return 730;
    if (fieldLower.includes("photo")) return 740;

    // Other numeric fields (800-899)
    if (fieldLower.includes("discount")) return 810;
    if (fieldLower.includes("rate")) return 820;
    if (fieldLower.includes("rating")) return 830;
    if (fieldLower.includes("score")) return 840;
    if (fieldLower.includes("percentage")) return 850;

    // Text fields (900-999)
    if (fieldLower.includes("notes")) return 910;
    if (fieldLower.includes("comments")) return 920;
    if (fieldLower.includes("remark")) return 930;
    if (fieldLower.includes("detail")) return 940;

    // Default (1000+)
    return 1000 + fieldName.length;
  }

  /**
   * Get entity priority for ordering
   */
  private getEntityPriority(entityName: string, mainEntity: string): number {
    if (entityName === mainEntity) return 0;

    const entityLower = entityName.toLowerCase();

    // Common related entities get higher priority
    if (entityLower.includes("branch")) return 100;
    if (entityLower.includes("chain")) return 150;
    if (entityLower.includes("user")) return 200;
    if (entityLower.includes("product")) return 300;
    if (entityLower.includes("brand")) return 400;
    if (entityLower.includes("category")) return 500;
    if (entityLower.includes("project")) return 600;
    if (entityLower.includes("stock")) return 700;
    if (entityLower.includes("sale")) return 800;

    // Other entities
    return 1000;
  }

  /**
   * Group columns by entity with intelligent ordering
   */
  private groupColumnsByEntity(
    data: any[],
    mainEntity: string,
  ): { header: string; key: string; width?: number; entity?: string }[] {
    if (data.length === 0) return [];

    const allColumns = new Set<string>();

    data.forEach((row) => {
      Object.keys(row).forEach((key) => allColumns.add(key));
    });

    // Group columns by entity
    const columnsByEntity = new Map<
      string,
      { key: string; displayName: string; fieldName: string }[]
    >();

    allColumns.forEach((key) => {
      // Extract entity from key
      const parts = key.split(" ");
      let entity = mainEntity;
      let fieldName = key;

      if (parts.length > 1) {
        const firstPart = parts[0].toLowerCase();
        const commonEntities = [
          "product",
          "brand",
          "category",
          "project",
          "user",
          "branch",
          "stock",
          "sale",
          "order",
          "chain",
          "city",
          "country",
          "region",
          "role",
          "permission",
          "survey",
          "audit",
          "competitor",
          "shift",
          "vacation",
          "checkin",
          "journey",
          "journeyplan",
        ];

        if (commonEntities.includes(firstPart)) {
          entity = parts[0];
          fieldName = parts.slice(1).join(" ");
        }
      }

      if (!columnsByEntity.has(entity)) {
        columnsByEntity.set(entity, []);
      }

      // Format display name (clean up underscores and capitalize)
      let displayName = fieldName
        .replace(/_/g, " ")
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ");

      // Special handling for common abbreviations
      displayName = displayName
        .replace("Url", "URL")
        .replace("Sku", "SKU")
        .replace("Id", "ID")
        .replace("Qty", "Qty")
        .replace("Is ", "Is ");

      columnsByEntity.get(entity)!.push({ key, displayName, fieldName });
    });

    // Sort entities by priority
    const allEntities = Array.from(columnsByEntity.keys());
    const sortedEntities = allEntities.sort((a, b) => {
      const aPriority = this.getEntityPriority(a, mainEntity);
      const bPriority = this.getEntityPriority(b, mainEntity);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.localeCompare(b);
    });

    const columns: {
      header: string;
      key: string;
      width?: number;
      entity?: string;
    }[] = [];

    sortedEntities.forEach((entity) => {
      const entityColumns = columnsByEntity.get(entity)!;

      // Sort columns within each entity based on field priority
      entityColumns.sort((a, b) => {
        const aPriority = this.getFieldPriority(a.fieldName);
        const bPriority = this.getFieldPriority(b.fieldName);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.displayName.localeCompare(b.displayName);
      });

      // Add columns for this entity
      entityColumns.forEach(({ key, displayName }) => {
        let header = displayName;

        // Only add entity prefix for non-main entities
        if (entity !== mainEntity) {
          header = `${entity.charAt(0).toUpperCase() + entity.slice(1)} ${displayName}`;
        }

        columns.push({
          header: header,
          key: key,
          width: this.calculateColumnWidth(key),
          entity: entity,
        });
      });
    });

    return columns;
  }

  /**
   * Calculate column width based on field type
   */
  private calculateColumnWidth(key: string): number {
    const lowerKey = key.toLowerCase();

    if (
      lowerKey.includes("description") ||
      lowerKey.includes("notes") ||
      lowerKey.includes("comments")
    ) {
      return 45;
    }

    if (lowerKey.includes("name") || lowerKey.includes("title")) {
      return 30;
    }

    if (lowerKey.includes("address") || lowerKey.includes("location")) {
      return 40;
    }

    if (
      lowerKey.includes("image") ||
      lowerKey.includes("url") ||
      lowerKey.includes("logo")
    ) {
      return 50;
    }

    if (lowerKey.includes("email")) {
      return 35;
    }

    if (
      lowerKey.includes("price") ||
      lowerKey.includes("cost") ||
      lowerKey.includes("amount") ||
      lowerKey.includes("total")
    ) {
      return 18;
    }

    if (lowerKey.includes("quantity") || lowerKey.includes("qty")) {
      return 15;
    }

    if (
      lowerKey.includes("model") ||
      lowerKey.includes("sku") ||
      lowerKey.includes("code")
    ) {
      return 25;
    }

    if (lowerKey.includes("branch") || lowerKey.includes("chain")) {
      return 25;
    }

    if (lowerKey.includes("date") || lowerKey.includes("time")) {
      return 22; // Wider for HH:mm:ss
    }

    if (lowerKey.includes("duration") || lowerKey.includes("late")) {
      return 20;
    }

    if (lowerKey.includes("phone")) {
      return 20;
    }

    return 20;
  }

  /**
   * Process and export data to Excel with optimized UX
   */
  async exportRowsToExcel(
    res: any,
    rows: any[],
    mainEntity: string,
    options: {
      sheetName?: string;
      fileName?: string;
    } = {},
  ) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || "Report");

    // Clean and process data
    const cleanedData = this.cleanDataForExport(rows, mainEntity);
    const finalData = this.convertRecordsColumnsToRows(cleanedData);

    // For Journey/Unplanned, use the exact order from cleanDataForExport
    // For others, use the intelligent grouping
    let worksheetColumns: any[] = [];
    let groupedColumns: {
      header: string;
      key: string;
      width?: number;
      entity?: string;
    }[] = [];

    // Check if this is a Journey/Unplanned/Sale export based on multiple factors
    const isJourneyOrUnplannedOrSale =
      (mainEntity || "").toLowerCase().includes("journey") ||
      (mainEntity || "").toLowerCase().includes("unplanned") ||
      (mainEntity || "").toLowerCase().includes("sale") ||
      (options.fileName || "").toLowerCase().includes("unplanned") ||
      (cleanedData.length > 0 &&
        cleanedData[0]["Status Code"] !== undefined &&
        cleanedData[0]["Duration"] !== undefined);

    if (isJourneyOrUnplannedOrSale && cleanedData.length > 0) {
      // Use keys from the first row directly as they are already ordered
      const firstRow = finalData[0];
      groupedColumns = Object.keys(firstRow).map((key) => ({
        header: key,
        key: key,
        width: this.calculateColumnWidth(key),
        entity: mainEntity, // Use main entity for all columns to have uniform color
      }));
    } else {
      // Get grouped columns with main entity first
      groupedColumns = this.groupColumnsByEntity(finalData, mainEntity);
    }

    // Create worksheet columns from groupedColumns
    worksheetColumns = groupedColumns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    worksheet.columns = worksheetColumns;

    // Add data rows
    finalData.forEach((rowData) => {
      const rowValues: any = {};

      worksheetColumns.forEach((col) => {
        const value = rowData[col.key];
        if (value !== null && value !== undefined && value !== "") {
          // Format dates and numbers if needed
          if (
            col.key.toLowerCase().includes("date") &&
            typeof value === "string"
          ) {
            rowValues[col.key] = value;
          } else if (typeof value === "number") {
            rowValues[col.key] = value;
          } else {
            rowValues[col.key] = String(value);
          }
        }
      });

      if (Object.keys(rowValues).length > 0) {
        const row = worksheet.addRow(rowValues);
        row.eachCell((cell) => {
          // Simple center alignment for all cells
          cell.alignment = { horizontal: "center", vertical: "middle" };
        });
      }
    });

    // Format header row with color grouping
    if (worksheet.rowCount > 0) {
      const headerRow = worksheet.getRow(1);

      let currentEntity = "";
      let entityStartCol = 1;
      let currentCol = 1;

      groupedColumns.forEach((col) => {
        // Apply entity grouping colors
        if (col.entity !== currentEntity) {
          // Apply color to previous entity group if exists
          if (currentEntity && currentCol > entityStartCol) {
            this.applyEntityColor(
              worksheet,
              entityStartCol,
              currentCol - 1,
              currentEntity,
            );
          }

          // Start new entity group
          currentEntity = col.entity!;
          entityStartCol = currentCol;
        }

        currentCol++;
      });

      // Apply color to last entity group
      if (currentEntity && currentCol > entityStartCol) {
        this.applyEntityColor(
          worksheet,
          entityStartCol,
          currentCol - 1,
          currentEntity,
        );
      }

      // Format individual header cells
      groupedColumns.forEach((col, index) => {
        const cell = headerRow.getCell(index + 1);

        cell.value = col.header;
        cell.font = {
          bold: true,
          size: 11,
          color: { argb: "FF000000" }, // Black text for contrast
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };

        // Add subtle border to separate groups
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    }

    // Format data rows with subtle styling
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        // Alternate row colors for better readability
        if (i % 2 === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF9F9F9" },
          };
        }

        // Add subtle border
        cell.border = {
          top: { style: "thin", color: { argb: "FFEEEEEE" } },
          left: { style: "thin", color: { argb: "FFEEEEEE" } },
          bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
          right: { style: "thin", color: { argb: "FFEEEEEE" } },
        };

        // Ensure alignment
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    }

    // Auto-size columns
    worksheet.columns.forEach((col) => {
      let max = col.header?.toString().length || 10;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value ? String(cell.value) : "";
          if (v.length > max) max = v.length;
        });
      }
      col.width = Math.min(max + 2, col.width || 60);
    });

    // Freeze header row
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const isJourney =
      (mainEntity || "").toLowerCase().includes("journey") ||
      (options.fileName || "").toLowerCase().includes("unplanned") ||
      rows.some(
        (r) => r && (r.journeyPlan || r.journey || r.type === "unplanned"),
      );

    let fileName = options.fileName;
    if (
      isJourney ||
      (fileName && fileName.toLowerCase().includes("unplanned_export"))
    ) {
      fileName = "visting history";
    }

    const finalFileName = (fileName || mainEntity || "export") + ".xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${finalFileName}"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Apply color to a range of header cells for an entity group
   */
  private applyEntityColor(
    worksheet: ExcelJS.Worksheet,
    startCol: number,
    endCol: number,
    entity: string,
  ): void {
    const headerRow = worksheet.getRow(1);
    const color = this.getEntityColor(entity);

    for (let col = startCol; col <= endCol; col++) {
      const cell = headerRow.getCell(col);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    }
  }

  async exportFromUrlOnly(
    url: string,
    res: any,
    fileName?: string,
    authHeader?: any,
    moduleOverride?: string,
  ) {
    try {
      if (!url) {
        throw new BadRequestException("URL parameter is required");
      }

      const rawData = await this.fetchDataFromUrl(url, authHeader);
      const data = this.extractDataFromResponse(rawData);

      // Extract main entity from URL, allowing override from query param
      const mainEntity = moduleOverride || this.extractMainEntityFromUrl(url);

      console.log(
        `[DEBUG] Extracted mainEntity: ${mainEntity} from URL: ${url}`,
      );
      console.log(
        `[DEBUG] Processing ${data.length} ${mainEntity} records for export`,
      );
      console.log(
        `[DEBUG] First record sample:`,
        data[0] ? JSON.stringify(data[0]).substring(0, 200) : "None",
      );

      // Default fileName to 'visting history' for journeys or if it contains 'unplanned'
      let finalFileName = fileName;
      if (
        mainEntity.toLowerCase().includes("journey") ||
        (fileName && fileName.toLowerCase().includes("unplanned"))
      ) {
        finalFileName = "visting history";
      }

      return this.exportRowsToExcel(res, data, mainEntity, {
        fileName: finalFileName,
        sheetName:
          (finalFileName || mainEntity || "Report").charAt(0).toUpperCase() +
          (finalFileName || mainEntity || "Report").slice(1),
      });
    } catch (error) {
      console.error("Export error:", error);
      throw new BadRequestException(`Failed to export data: ${error.message}`);
    }
  }

  async exportEntityToExcel(
    dataSource: DataSource,
    moduleName: string,
    res: any,
    options: {
      exportLimit?: number | string;
    } = {},
  ) {
    const normalized = (moduleName || "").toLowerCase().trim() as ModuleName;

    const entityClass = moduleRepoMap[normalized];
    if (!entityClass) {
      const allowed = Object.values(ModuleName);
      throw new BadRequestException({
        message: `Invalid module "${moduleName}". Allowed modules are: ${allowed.join(", ")}`,
        allowedModules: allowed,
      });
    }

    const repository: Repository<any> = dataSource.getRepository(entityClass);

    const rawLimit = options.exportLimit;
    let take: number | undefined;

    if (
      rawLimit === "all" ||
      (typeof rawLimit === "string" && rawLimit.toLowerCase().trim() === "all")
    ) {
      take = undefined;
    } else if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
      take = 1000;
    } else {
      const n = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
      take = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
    }

    const findOptions: any = {};
    if (take !== undefined) findOptions.take = take;
    findOptions.relations = this.getRelationsForEntity(normalized);

    const data = await repository.find(findOptions);

    return this.exportRowsToExcel(res, data, normalized, {
      fileName: normalized,
      sheetName: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    });
  }

  private async fetchDataFromUrl(
    url: string,
    authorization?: string,
  ): Promise<any> {
    try {
      const cleanUrl = url.startsWith("/") ? url.substring(1) : url;
      const baseUrl =
        process.env.MAIN_API_URL ||
        `http://localhost:${process.env.PORT || 3030}`;
      const fullUrl = cleanUrl.startsWith("http")
        ? cleanUrl
        : `${baseUrl}/${cleanUrl}`;

      console.log(`[ExportService] Fetching data from: ${fullUrl}`);
      if (!authorization) {
        console.warn(
          `[ExportService] No authorization header provided for request to: ${cleanUrl}`,
        );
      }

      const headers: any = {
        "Content-Type": "application/json",
      };

      if (authorization) {
        headers.Authorization = `${authorization}`;
      }

      const response = await firstValueFrom(
        this.httpService.get(fullUrl, { headers }),
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(
        `[ExportService] Error fetching data from ${url}. Status: ${status}`,
        data || error.message,
      );

      let errorMessage = `Failed to fetch data from ${url}`;
      if (status === 401) {
        errorMessage += `: Unauthorized (401). Please ensure you have valid credentials.`;
      } else {
        errorMessage += `: ${data?.message || error.message}`;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Helper method to get relations for each entity type
   */
  private getRelationsForEntity(moduleName: ModuleName): string[] {
    const relationMap: Partial<Record<ModuleName, string[]>> = {
      [ModuleName.SALE]: ["product", "branch", "branch.chain", "user"],
      [ModuleName.PRODUCT]: ["brand", "category", "stocks"],
      [ModuleName.STOCK]: ["product", "branch", "branch.chain"],
      [ModuleName.USER]: ["branch", "branch.chain", "role"],
      [ModuleName.BRANCH]: ["chain", "city", "region", "country"],
      [ModuleName.CHECKIN]: ["branch", "branch.chain", "user"],
      [ModuleName.JOURNEY]: ["branch", "branch.chain", "user"],
      [ModuleName.JOURNEYPLAN]: ["branch", "branch.chain", "user", "checkin"],
      [ModuleName.SHIFT]: ["user"],
      [ModuleName.VACATION]: ["user"],
      [ModuleName.CHAIN]: ["branches"],
      [ModuleName.CITY]: ["branches", "region", "country"],
      [ModuleName.COUNTRY]: ["regions", "cities", "branches"],
      [ModuleName.REGION]: ["country", "cities", "branches"],
      [ModuleName.BRAND]: ["products"],
      [ModuleName.CATEGORY]: ["products"],
      [ModuleName.ROLE]: ["permissions", "users"],
      [ModuleName.SURVEYFEEDBACK]: ["survey", "user", "branch"],
      [ModuleName.SURVEY]: ["feedbacks", "branch"],
    };

    return relationMap[moduleName] || [];
  }
}
