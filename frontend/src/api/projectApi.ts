import axios from 'axios';
import type { Project, ProjectMember, CreateProjectRequest, AddMemberRequest } from '../types/project';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export const getAllProjects = async (): Promise<Project[]> => {
  const { data } = await api.get<Project[]>('/api/v1/projects');
  return data;
};

export const getProject = async (id: number): Promise<Project> => {
  const { data } = await api.get<Project>(`/api/v1/projects/${id}`);
  return data;
};

export const createProject = async (
  ownerId: number,
  request: CreateProjectRequest
): Promise<Project> => {
  const { data } = await api.post<Project>('/api/v1/projects', request, {
    params: { ownerId },
  });
  return data;
};

export const deleteProject = async (id: number, requesterId: number): Promise<void> => {
  await api.delete(`/api/v1/projects/${id}`, { params: { requesterId } });
};

export const getProjectMembers = async (projectId: number): Promise<ProjectMember[]> => {
  const { data } = await api.get<ProjectMember[]>(`/api/v1/projects/${projectId}/members`);
  return data;
};

export const addProjectMember = async (
  projectId: number,
  requesterId: number,
  request: AddMemberRequest
): Promise<ProjectMember> => {
  const { data } = await api.post<ProjectMember>(
    `/api/v1/projects/${projectId}/members`,
    request,
    { params: { requesterId } }
  );
  return data;
};

export const removeProjectMember = async (
  projectId: number,
  userId: number,
  requesterId: number
): Promise<void> => {
  await api.delete(`/api/v1/projects/${projectId}/members/${userId}`, {
    params: { requesterId },
  });
};

export const assignTestCase = async (
  testCaseId: number,
  assigneeId: number,
  requesterId: number
): Promise<void> => {
  await api.patch(`/api/v1/test-cases/${testCaseId}/assign`, null, {
    params: { assigneeId, requesterId },
  });
};
