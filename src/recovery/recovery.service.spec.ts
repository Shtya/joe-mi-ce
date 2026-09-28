import * as XLSX from "xlsx";
import { RecoveryService } from "./recovery.service";

describe("RecoveryService GATMEA report mappings", () => {
  it("previews merging branches by Store Code and keeps linked data on the canonical store", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Branch", "Branch Name", "Chain", "Store Name", "Store Code"],
        [
          "Saco Al-Awali (Saco 1211)",
          "Saco Al-Awali (Saco 1211)",
          "SACO",
          "",
          "1211",
        ],
        ["Saco Makkah", "Saco Makkah", "SACO", "", "1211"],
      ]),
      "Store Name ",
    );
    const branches = [
      {
        id: "canonical",
        name: "Saco Al-Awali (Saco 1211)",
        code: "1211",
        chain: { id: "saco" },
      },
      {
        id: "duplicate",
        name: "Saco Makkah",
        code: "1211",
        chain: { id: "saco" },
      },
    ];
    const branchRepo = {
      find: jest.fn().mockResolvedValue(branches),
      softDelete: jest.fn(),
    };
    const productRepo = {
      find: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn(),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity.name === "Project")
          return {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue({
                where: jest.fn().mockReturnThis(),
                getOne: jest
                  .fn()
                  .mockResolvedValue({ id: "gatemea", name: "gatemea" }),
              }),
          };
        if (entity.name === "Branch") return branchRepo;
        if (entity.name === "Product") return productRepo;
        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager,
    };
    const service = new RecoveryService(
      { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } as any,
      {} as any,
    );

    const result = await service.importReport({
      type: "cleanup",
      projectName: "gatemea",
      dryRun: true,
      fileBuffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    });

    expect(result.rows).toContainEqual(
      expect.objectContaining({
        entity: "branches",
        action: "UPDATED",
        key: "branch=Saco Makkah -> Saco Al-Awali (Saco 1211)",
        ids: { branchId: "canonical", mergedBranchId: "duplicate" },
      }),
    );
    expect(manager.query).toHaveBeenCalled();
    expect(branchRepo.softDelete).toHaveBeenCalledWith("duplicate");
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it("previews the matched product and store mappings without saving in dry-run mode", async () => {
    const workbook = XLSX.utils.book_new();
    const items = XLSX.utils.aoa_to_sheet([
      [
        "system item name ",
        "brand ",
        "Proudect Name ",
        "Proudect Model Number  ",
        "Saco SKU",
        "Extra SKU",
        "Category",
      ],
      [
        "T90",
        "TINECO",
        "Deebot T90",
        "DEX95",
        "Not ACTV",
        "100523090",
        "Robovacume",
      ],
      [
        "FLOOR one S6 Stretch Steam",
        "TINECO",
        "",
        "SW151100AE",
        "112922",
        "100502501",
      ],
      [
        "Floor one S6 Stretch FW401400UK",
        "TINECO",
        "",
        "FW401400UK",
        "100609",
        "100372104",
      ],
      ["FLOOR ONE S6 STEAM", "TINECO", "", "SW151100AE", "112922", "100502501"],
    ]);
    const stores = XLSX.utils.aoa_to_sheet([
      [
        "Branch",
        "Branch Name",
        "Chain ",
        "Store Name ",
        "Store Code ",
        "Notes ",
      ],
      [
        "Saco Takhassusi",
        "Saco Takhassusi",
        "SACO",
        "Saco Takhassusi",
        "1103",
        null,
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, items, "Sheet1");
    XLSX.utils.book_append_sheet(workbook, stores, "Store Name ");
    const fileBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    const project = { id: "gatemea-project", name: "gatemea" };
    const productRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: "product-1",
          name: "T90",
          model: null,
          sacoSku: null,
          extraSku: null,
        },
        {
          id: "product-2",
          name: "FLOOR one S6 Stretch Steam",
          model: null,
          sacoSku: null,
          extraSku: null,
        },
        {
          id: "product-3",
          name: "Floor one S6 Stretch-FW401400UK",
          model: "FLOOR ONE S6 STEAM",
          sacoSku: null,
          extraSku: null,
        },
      ]),
      save: jest.fn(),
    };
    const branchRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: "branch-1", name: "Saco Takhassusi", code: null },
        ]),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) => {
        if (entity.name === "Project") {
          return {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(project),
            }),
          };
        }
        if (entity.name === "Product") return productRepo;
        if (entity.name === "Branch") return branchRepo;
        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager,
    };
    const service = new RecoveryService(
      { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } as any,
      {} as any,
    );

    const result = await service.importReport({
      type: "mappings" as any,
      projectName: "gatemea",
      dryRun: true,
      fileBuffer,
    });

    expect(result.summary).toEqual({
      existing: 0,
      created: 0,
      updated: 4,
      skipped: 0,
      duplicates: 1,
      unresolved: 0,
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        entity: "products",
        action: "UPDATED",
        key: "product=T90",
        changes: {
          model: { from: null, to: "DEX95" },
          sacoSku: { from: null, to: "Not ACTV" },
          extraSku: { from: null, to: "100523090" },
        },
      }),
      expect.objectContaining({
        entity: "products",
        action: "UPDATED",
        key: "product=FLOOR one S6 Stretch Steam",
        ids: { productId: "product-2" },
      }),
      expect.objectContaining({
        entity: "products",
        action: "UPDATED",
        key: "product=Floor one S6 Stretch FW401400UK",
        ids: { productId: "product-3" },
      }),
      expect.objectContaining({
        entity: "products",
        action: "DUPLICATE",
        key: "product=FLOOR ONE S6 STEAM",
        ids: { productId: "product-2" },
      }),
      expect.objectContaining({
        entity: "branches",
        action: "UPDATED",
        key: "branch=Saco Takhassusi",
        changes: { code: { from: null, to: "1103" } },
      }),
    ]);
    expect(productRepo.save).not.toHaveBeenCalled();
    expect(branchRepo.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
