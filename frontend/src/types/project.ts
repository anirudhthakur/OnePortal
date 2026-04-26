export type ProjectRole = 'OWNER' | 'TESTER' | 'VIEWER';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  userId: number;
  username: string;
  email: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface AddMemberRequest {
  userId: number;
  role: ProjectRole;
}
