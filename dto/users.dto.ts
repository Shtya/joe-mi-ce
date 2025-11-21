// dtos/user.dto.ts
export class UserResponseDto {
  id: string;
  username: string;
  name: string;
  mobile: string;
  avatar_url: string;
  device_id: string;
  is_active: boolean;
  role: string;
  branch?: {
    id: string;
    name: string;
  };
  created_at: Date;
}

export class UsersByBranchResponseDto {
  branchId: string;
  branchName: string;
  users: UserResponseDto[];
}

export class ProjectUsersResponseDto {
  projectId: string;
  projectName: string;
  branches: UsersByBranchResponseDto[];
  totalUsers: number;
}