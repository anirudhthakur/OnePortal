import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export type UserRole = 'ADMIN' | 'TESTER' | 'VIEWER';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const getAllUsers = async (size = 100): Promise<User[]> => {
  const { data } = await api.get<PageResponse<User>>('/api/v1/users', { params: { size } });
  return data.content;
};

export const createUser = async (request: CreateUserRequest): Promise<User> => {
  const { data } = await api.post<User>('/api/v1/users', request);
  return data;
};

export const deleteUser = async (id: number): Promise<void> => {
  await api.delete(`/api/v1/users/${id}`);
};
