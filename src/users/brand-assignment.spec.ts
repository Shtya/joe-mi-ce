import { BadRequestException } from "@nestjs/common";
import { BrandAssignmentMode } from "enums/BrandAssignmentMode.enum";
import { ERole } from "enums/Role.enum";
import { UsersService } from "./users.service";

describe("UsersService brand assignment", () => {
  const brandRepo = {
    find: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn(),
  };
  const dataSource = {
    getRepository: jest.fn(() => brandRepo),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      userRepo as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
  });

  it("defaults users to all brand access and clears explicit brands", async () => {
    const user: any = {
      brandAssignmentMode: undefined,
      assignedBrands: [{ id: "brand-1" }],
    };

    await service.applyBrandAssignment(user, "project-1");

    expect(user.brandAssignmentMode).toBe(BrandAssignmentMode.ALL);
    expect(user.assignedBrands).toEqual([]);
  });

  it("rejects custom assignment without brand ids", async () => {
    await expect(
      service.validateBrandAssignment(
        "project-1",
        BrandAssignmentMode.CUSTOM,
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects custom assignment when any brand is outside the project", async () => {
    brandRepo.find.mockResolvedValue([{ id: "brand-1" }]);

    await expect(
      service.validateBrandAssignment("project-1", BrandAssignmentMode.CUSTOM, [
        "brand-1",
        "brand-2",
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(brandRepo.find).toHaveBeenCalledWith({
      where: {
        id: expect.anything(),
        project_id: "project-1",
      },
    });
  });

  it("resolves custom scope to same-project assigned brand ids", async () => {
    userRepo.findOne
      .mockResolvedValueOnce({
        id: "user-1",
        project_id: "project-1",
        role: { name: ERole.PROMOTER },
        brandAssignmentMode: BrandAssignmentMode.CUSTOM,
        assignedBrands: [{ id: "brand-1" }, { id: "brand-2" }],
      })
      .mockResolvedValueOnce({
        id: "user-1",
        project_id: "project-1",
      });

    const scope = await service.resolveBrandAccessScope("user-1");

    expect(scope).toEqual({
      isSuper: false,
      projectId: "project-1",
      mode: BrandAssignmentMode.CUSTOM,
      brandIds: ["brand-1", "brand-2"],
    });
    expect(service.canAccessBrand(scope, "brand-2")).toBe(true);
    expect(service.canAccessBrand(scope, "brand-3")).toBe(false);
  });
});
