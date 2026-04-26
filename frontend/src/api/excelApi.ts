import axios from 'axios';
import type {
  UploadResponse, SheetSummary, SheetDataResponse,
  ProjectSheetDataResponse, RowWithMeta, UpdateRowRequest, PageResponse,
} from '../types/testDesign';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export const uploadExcel = async (
  file: File,
  uploaderId?: number,
  projectId?: number,
  executionDateColumnName?: string,
  channelColumnName?: string,
): Promise<UploadResponse> => {
  const form = new FormData();
  form.append('file', file);
  const params: Record<string, string | number> = {};
  if (uploaderId != null) params.uploaderId = uploaderId;
  if (projectId != null) params.projectId = projectId;
  if (executionDateColumnName) params.executionDateColumnName = executionDateColumnName;
  if (channelColumnName) params.channelColumnName = channelColumnName;
  const { data } = await api.post<UploadResponse>('/api/v1/excel/upload', form, { params });
  return data;
};

export const getAllSheets = async (
  page = 0,
  size = 20
): Promise<PageResponse<SheetSummary>> => {
  const { data } = await api.get<PageResponse<SheetSummary>>('/api/v1/excel/sheets', {
    params: { page, size },
  });
  return data;
};

export const getSheetData = async (sheetId: number): Promise<SheetDataResponse> => {
  const { data } = await api.get<SheetDataResponse>(`/api/v1/excel/sheets/${sheetId}`);
  return data;
};

export const getSheetByProject = async (projectId: number): Promise<ProjectSheetDataResponse> => {
  const { data } = await api.get<ProjectSheetDataResponse>(`/api/v1/excel/sheets/by-project/${projectId}`);
  return data;
};

export const updateRow = async (
  sheetId: number,
  rowId: number,
  requesterId: number,
  body: UpdateRowRequest,
): Promise<RowWithMeta> => {
  const { data } = await api.patch<RowWithMeta>(
    `/api/v1/excel/sheets/${sheetId}/rows/${rowId}`,
    body,
    { params: { requesterId } },
  );
  return data;
};

export const deleteSheet = async (sheetId: number): Promise<void> => {
  await api.delete(`/api/v1/excel/sheets/${sheetId}`);
};

export const addRow = async (
  sheetId: number,
  requesterId: number,
): Promise<RowWithMeta> => {
  const { data } = await api.post<RowWithMeta>(
    `/api/v1/excel/sheets/${sheetId}/rows`,
    null,
    { params: { requesterId } },
  );
  return data;
};

export const deleteRow = async (
  sheetId: number,
  rowId: number,
  requesterId: number,
): Promise<void> => {
  await api.delete(`/api/v1/excel/sheets/${sheetId}/rows/${rowId}`, {
    params: { requesterId },
  });
};

export const replaceSheet = async (
  file: File,
  uploaderId: number | undefined,
  projectId: number,
  executionDateColumnName?: string,
  channelColumnName?: string,
): Promise<UploadResponse> => {
  const form = new FormData();
  form.append('file', file);
  const params: Record<string, string | number> = { projectId };
  if (uploaderId != null) params.uploaderId = uploaderId;
  if (executionDateColumnName) params.executionDateColumnName = executionDateColumnName;
  if (channelColumnName) params.channelColumnName = channelColumnName;
  const { data } = await api.post<UploadResponse>('/api/v1/excel/replace', form, { params });
  return data;
};

export const parseTestCaseHeaders = async (file: File): Promise<string[]> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<string[]>('/api/v1/excel/parse-headers', form);
  return data;
};
