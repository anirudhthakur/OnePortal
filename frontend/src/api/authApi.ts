import axios from 'axios';
import type { User } from './userApi';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export interface SignupResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  enabled: boolean;
  createdAt: string;
}

export const login = async (username: string, password: string): Promise<User> => {
  const { data } = await api.post<User>('/api/v1/auth/login', { username, password });
  return data;
};

export const signup = async (
  username: string,
  email: string,
  password: string,
): Promise<SignupResponse> => {
  const { data } = await api.post<SignupResponse>('/api/v1/auth/signup', { username, email, password });
  return data;
};

export const verifyPassword = async (userId: number, password: string): Promise<boolean> => {
  const { data } = await api.post<{ valid: boolean }>('/api/v1/auth/verify-password', { userId, password });
  return data.valid;
};

export const approveUser = async (
  userId: number,
  role: string,
  requesterId: number,
): Promise<User> => {
  const { data } = await api.post<User>(`/api/v1/users/${userId}/approve`, null, {
    params: { requesterId, role },
  });
  return data;
};

export const getPendingUsers = async (): Promise<User[]> => {
  const { data } = await api.get<{ content: User[] }>('/api/v1/users/pending', {
    params: { size: 200 },
  });
  return data.content;
};
