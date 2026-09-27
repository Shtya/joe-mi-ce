import { Test, TestingModule } from "@nestjs/testing";
import { ExportService } from "./export.service";
import { DataSource } from "typeorm";
import { HttpService } from "@nestjs/axios";

describe("ExportService", () => {
  let service: ExportService;

  const mockDataSource = {
    getRepository: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    mockDataSource.getRepository.mockReset();
    mockHttpService.get.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  describe("GATMEA project scoping", () => {
    it("recognizes the project filter used by the sales export URL", async () => {
      const findOne = jest.fn().mockResolvedValue({ name: "GATMEA" });
      mockDataSource.getRepository.mockReturnValue({ findOne });

      expect(
        (service as any).extractProjectIdFromExportUrl(
          "/api/v1/sales?filters[project][id]=c9f7df79-b342-4b8d-aa71-0de112f47254",
        ),
      ).toBe("c9f7df79-b342-4b8d-aa71-0de112f47254");

      const result = await (service as any).isGatemeaProjectExport(
        "/api/v1/sales?filters[project][id]=c9f7df79-b342-4b8d-aa71-0de112f47254",
        [],
      );

      expect(findOne).toHaveBeenCalledWith({
        where: { id: "c9f7df79-b342-4b8d-aa71-0de112f47254" },
        select: { id: true, name: true },
      });
      expect(await findOne.mock.results[0].value).toEqual({ name: "GATMEA" });
      expect(result).toBe(true);
    });

    it("fails closed for a project other than GATMEA", async () => {
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ name: "Another project" }),
      });

      const result = await (service as any).isGatemeaProjectExport(
        "/api/v1/stock/project/c9f7df79-b342-4b8d-aa71-0de112f47254",
        [],
      );

      expect(result).toBe(false);
    });
  });

  describe("cleanDataForExport - Unplanned Module", () => {
    it("should filter and order columns correctly for unplanned module", () => {
      const sampleData = [
        {
          id: "1",
          date: "2026-03-05",
          status: "UNPLANNED_CLOSED",
          checkInTime: "2026-03-05T08:00:00Z",
          checkOutTime: "2026-03-05T17:00:00Z",
          checkInDocument: "/uploads/in.jpg",
          checkOutDocument: "/uploads/out.jpg",
          user: {
            id: "u1",
            name: "John Doe",
            username: "johndoe",
          },
          branch: {
            id: "b1",
            name: "Main Branch",
            city: {
              id: "c1",
              name: "Cairo",
            },
            chain: {
              id: "ch1",
              name: "Alpha Chain",
            },
          },
          shift: {
            startTime: "08:00:00",
            endTime: "17:00:00",
          },
        },
      ];

      const result = (service as any).cleanDataForExport(
        sampleData,
        "unplanned",
      );

      expect(result).toHaveLength(1);
      const cleaned = result[0];

      // Expected order of keys
      const expectedKeys = [
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
        "Status Code",
      ];

      // Assert keys and order
      expect(Object.keys(cleaned)).toEqual(expectedKeys);

      // Assert specific values
      expect(cleaned["user name"]).toBe("John Doe");
      expect(cleaned["user username"]).toBe("johndoe");
      expect(cleaned["city name"]).toBe("Cairo");
      expect(cleaned["Chain"]).toBe("Alpha Chain");
      expect(cleaned["branch name"]).toBe("Main Branch");
      expect(cleaned["status"]).toBe("UNPLANNED_CLOSED");
      expect(cleaned["Status Code"]).toBe(1);
      expect(cleaned["Duration"]).toBeDefined();
    });
  });

  describe("cleanDataForExport - General Journey and Sale Cleanup", () => {
    it("exports GATMEA stock with explicit branch code and chain-specific SKU columns", () => {
      const result = (service as any).cleanDataForExport(
        [
          {
            quantity: 4,
            branch: {
              name: "Saco Takhassusi",
              code: "1103",
              chain: { name: "SACO" },
            },
            product: {
              name: "T90",
              model: "DEX95",
              sku: "DEX95",
              sacoSku: "Not ACTV",
              extraSku: "100523090",
            },
          },
        ],
        "stock",
        true,
      );

      expect(result[0]).toEqual({
        branch: "Saco Takhassusi",
        "branch code": "1103",
        chain: "SACO",
        "product name": "T90",
        "product model": "DEX95",
        "saco sku": "Not ACTV",
        "extra sku": "100523090",
        quantity: 4,
      });
    });

    it("keeps non-GATMEA stock exports on the existing generic layout", () => {
      const result = (service as any).cleanDataForExport(
        [
          {
            quantity: 4,
            branch: { name: "Other branch", code: "9999" },
            product: {
              name: "Other product",
              model: "OTHER-1",
              sacoSku: "SACO-1",
              extraSku: "EXTRA-1",
            },
          },
        ],
        "stock",
        false,
      );

      expect(result[0]["branch code"]).toBeUndefined();
      expect(result[0]["saco sku"]).toBeUndefined();
      expect(result[0]["extra sku"]).toBeUndefined();
    });

    it("should aggressively clean metadata fields for journeys", () => {
      const sampleData = [
        {
          id: "j1",
          "user mobile": "0123456789",
          "user avatar_url": "http://avatar.com/1.png",
          "user password": "secret_password",
          "role name": "Promoter",
          "role description": "Promoter role",
          "branch lat": 30.01,
          "branch lng": 31.02,
          "branch salesTargetType": "amount",
          "chain logoUrl": "http://logo.com/c1.png",
          type: "planned",
          status: "COMPLETED",
          date: "2026-03-05",
          "user name": "John Doe",
        },
      ];

      const result = (service as any).cleanDataForExport(sampleData, "journey");
      const cleaned = result[0];

      // Fields that should be removed
      expect(cleaned["user mobile"]).toBeUndefined();
      expect(cleaned["user avatar_url"]).toBeUndefined();
      expect(cleaned["user password"]).toBeUndefined();
      expect(cleaned["role name"]).toBeUndefined();
      expect(cleaned["branch lat"]).toBeUndefined();
      expect(cleaned["chain logoUrl"]).toBeUndefined();
      expect(cleaned["type"]).toBeUndefined();

      // Fields that should remain
      expect(cleaned["user name"]).toBe("John Doe");
      expect(cleaned["status"]).toBe("COMPLETED");
    });

    it("should apply strict whitelist for sale, removing unlisted fields", () => {
      const sampleSaleData = [
        {
          id: "s1",
          sale_date: "2026-03-05T10:00:00",
          price: 150,
          total_amount: 300,
          quantity: 2,
          "role name": "Distributor", // Should be removed by strict whitelist
          user: { name: "John", username: "john_d", mobile: "0551234567" },
          branch: {
            name: "Al Riyadh",
            code: "1103",
            chain: { name: "Jarir" },
            city: { name: "Riyadh" },
          },
          product: {
            brand: { name: "Samsung" },
            category: { name: "Electronics" },
            name: "Galaxy S24",
            model: "S24",
            sacoSku: "112233",
            extraSku: "100112233",
          },
        },
      ];

      const result = (service as any).cleanDataForExport(
        sampleSaleData,
        "sale",
        true,
      );
      const cleaned = result[0];

      // Fields that should be removed by the whitelist
      expect(cleaned["role name"]).toBeUndefined();
      expect(cleaned["sale_date"]).toBeUndefined();

      // Only allowed fields should be present
      expect(cleaned["user name"]).toBe("John");
      expect(cleaned["user username"]).toBe("john_d");
      expect(cleaned["user mobile"]).toBe("0551234567");
      // Branch and Chain may be capitalized depending on which key lands last
      const branchVal = cleaned["branch"] || cleaned["Branch"];
      const chainVal = cleaned["chain"] || cleaned["Chain"];
      expect(branchVal).toBe("Al Riyadh");
      expect(chainVal).toBe("Jarir");
      expect(cleaned["city name"]).toBe("Riyadh");
      expect(cleaned["branch code"]).toBe("1103");
      expect(cleaned["brand"]).toBe("Samsung");
      expect(cleaned["categories"]).toBe("Electronics");
      expect(cleaned["product name"]).toBe("Galaxy S24");
      expect(cleaned["product model"]).toBe("S24");
      expect(cleaned["saco sku"]).toBe("112233");
      expect(cleaned["extra sku"]).toBe("100112233");
      expect(cleaned["price"]).toBe(150);
      expect(cleaned["total amount"]).toBe(300);
      expect(cleaned["quantity"]).toBe(2);
    });

    it("does not add GATMEA-only sale columns to other projects", () => {
      const result = (service as any).cleanDataForExport(
        [
          {
            sale_date: "2026-03-05T10:00:00",
            branch: { name: "Other branch", code: "9999" },
            product: {
              name: "Other product",
              model: "OTHER-1",
              sacoSku: "SACO-1",
              extraSku: "EXTRA-1",
            },
          },
        ],
        "sale",
        false,
      );

      expect(result[0]["branch code"]).toBeUndefined();
      expect(result[0]["saco sku"]).toBeUndefined();
      expect(result[0]["extra sku"]).toBeUndefined();
      expect(result[0]["product model"]).toBe("OTHER-1");
    });
  });

  describe("Duration and Late Time - Detailed Scenarios", () => {
    it("should calculate correct duration for standard 9-hour shift", () => {
      const data = [
        {
          checkInTime: "2026-03-05 08:00:00",
          checkOutTime: "2026-03-05 17:00:00",
        },
      ];
      const result = (service as any).cleanDataForExport(data, "journey");
      expect(result[0]["Duration"]).toBe("9h 0m");
    });

    it("should calculate correct duration spanning across days", () => {
      const data = [
        {
          checkInTime: "2026-03-05 22:00:00",
          checkOutTime: "2026-03-06 02:30:00",
        },
      ];
      const result = (service as any).cleanDataForExport(data, "journey");
      expect(result[0]["Duration"]).toBe("4h 30m");
    });

    it("should handle negative duration where checkout is before checkin", () => {
      const data = [
        {
          checkInTime: "2026-03-05 10:00:00",
          checkOutTime: "2026-03-05 09:00:00",
        },
      ];
      const result = (service as any).cleanDataForExport(data, "journey");
      expect(result[0]["Duration"]).toBe("Invalid (Out before In)");
    });

    it("should calculate late time correctly against HH:mm:ss shift start", () => {
      const data = [
        {
          checkInTime: "2026-03-05 08:15:00",
          shift: { startTime: "08:00:00" },
        },
      ];
      const result = (service as any).cleanDataForExport(data, "journey");
      expect(result[0]["Late Time"]).toBe("15 mins");
    });

    it('should report "On time" if checked in exactly at or before shift start', () => {
      const data = [
        {
          checkInTime: "2026-03-05 07:55:00",
          shift: { startTime: "08:00:00" },
        },
      ];
      const result = (service as any).cleanDataForExport(data, "journey");
      expect(result[0]["Late Time"]).toBe("On time");
    });
  });
});
