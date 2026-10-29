import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Feedback } from "entities/feedback.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { UsersService } from "src/users/users.service";
import { FeedbackService } from "./feedback.service";

describe("FeedbackService project assignment", () => {
  let service: FeedbackService;
  const user = Object.assign(new User(), { id: "submitter" });
  const project = Object.assign(new Project(), { id: "bissell-saudi" });
  const dto = { type: "RTV", message: "Broken handle" };
  const feedbackRepo = {
    create: (values: Partial<Feedback>) =>
      Object.assign(new Feedback(), values),
    save: jest.fn(async (feedback: Feedback) => feedback),
  };
  const userRepo = { findOne: jest.fn() };
  const projectRepo = { findOne: jest.fn() };
  const usersService = { resolveProjectIdFromUser: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    userRepo.findOne.mockResolvedValue(user);
    projectRepo.findOne.mockResolvedValue(project);
    usersService.resolveProjectIdFromUser.mockResolvedValue(project.id);
    const module = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getRepositoryToken(Feedback), useValue: feedbackRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = module.get(FeedbackService);
  });

  it("assigns the submitter's project when the client omits projectId", async () => {
    const result = await service.create(
      dto,
      ["/uploads/feedback/photo.jpg"],
      user,
    );
    expect(result.project).toEqual(project);
    expect(result.user).toEqual(user);
    expect(result.attachment_urls).toEqual(["/uploads/feedback/photo.jpg"]);
  });

  it("assigns the selected user's project for submissions on their behalf", async () => {
    const result = await service.create({ ...dto, userId: user.id }, []);
    expect(result.project).toEqual(project);
    expect(result.user).toEqual(user);
  });

  it("accepts an explicit project matching the submitter's project", async () => {
    const result = await service.create(
      { ...dto, projectId: project.id },
      [],
      user,
    );
    expect(result.project).toEqual(project);
  });

  it("rejects a project belonging to another tenant", async () => {
    await expect(
      service.create({ ...dto, projectId: "other-project" }, [], user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(feedbackRepo.save).not.toHaveBeenCalled();
  });

  it("does not save unassigned feedback when the user has no project", async () => {
    usersService.resolveProjectIdFromUser.mockRejectedValue(
      new ForbiddenException("User is not assigned to any project"),
    );
    await expect(service.create(dto, [], user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(feedbackRepo.save).not.toHaveBeenCalled();
  });

  it("rejects a missing submitter instead of saving orphan feedback", async () => {
    await expect(service.create(dto, [])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(feedbackRepo.save).not.toHaveBeenCalled();
  });

  it("rejects a submitter that no longer exists", async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.create(dto, [], user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(feedbackRepo.save).not.toHaveBeenCalled();
  });

  it("rejects a project that no longer exists", async () => {
    projectRepo.findOne.mockResolvedValue(null);
    await expect(service.create(dto, [], user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(feedbackRepo.save).not.toHaveBeenCalled();
  });
});
