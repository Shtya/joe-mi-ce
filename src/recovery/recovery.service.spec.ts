import * as XLSX from "xlsx";
import { RecoveryService } from "./recovery.service";

describe("RecoveryService GATMEA report mappings", () => {
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
      updated: 2,
      skipped: 0,
      duplicates: 0,
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
