import axios from 'axios';
import type {
  ParseHeadersResponse,
  DefectSheetSummary,
  DefectPageResponse,
  DefectRowResponse,
  DropdownItem,
  UpdateDefectRowRequest,
} from '../types/defect';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export const parseHeaders = async (file: File): Promise<ParseHeadersResponse> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<ParseHeadersResponse>('/api/v1/defects/parse-headers', form);
  return data;
};

export const saveDefectSheet = async (
  file: File,
  projectId: number,
  requesterId: number,
  idColumnName: string,
  summaryColumnName: string,
  statusColumnName?: string,
): Promise<DefectSheetSummary> => {
  const form = new FormData();
  form.append('file', file);
  const params: Record<string, string | number> = { projectId, requesterId, idColumnName, summaryColumnName };
  if (statusColumnName) params.statusColumnName = statusColumnName;
  const { data } = await api.post<DefectSheetSummary>('/api/v1/defects/sheets', form, { params });
  return data;
};

export const getDefectSheetByProject = async (
  projectId: number,
): Promise<DefectSheetSummary> => {
  const { data } = await api.get<DefectSheetSummary>(
    `/api/v1/defects/sheets/by-project/${projectId}`,
  );
  return data;
};

export const getDefectRows = async (
  sheetId: number,
  page = 0,
  size = 50,
): Promise<DefectPageResponse> => {
  const { data } = await api.get<DefectPageResponse>(
    `/api/v1/defects/sheets/${sheetId}/rows`,
    { params: { page, size } },
  );
  return data;
};

export const updateDefectRow = async (
  sheetId: number,
  rowId: number,
  requesterId: number,
  body: UpdateDefectRowRequest,
): Promise<DefectRowResponse> => {
  const { data } = await api.patch<DefectRowResponse>(
    `/api/v1/defects/sheets/${sheetId}/rows/${rowId}`,
    body,
    { params: { requesterId } },
  );
  return data;
};

export const addDefectRow = async (
  sheetId: number,
  requesterId: number,
): Promise<DefectRowResponse> => {
  const { data } = await api.post<DefectRowResponse>(
    `/api/v1/defects/sheets/${sheetId}/rows`,
    null,
    { params: { requesterId } },
  );
  return data;
};

export const deleteDefectRow = async (
  sheetId: number,
  rowId: number,
  requesterId: number,
): Promise<void> => {
  await api.delete(`/api/v1/defects/sheets/${sheetId}/rows/${rowId}`, {
    params: { requesterId },
  });
};

export const getDefectDropdown = async (
  projectId: number,
): Promise<DropdownItem[]> => {
  const { data } = await api.get<DropdownItem[]>('/api/v1/defects/dropdown', {
    params: { projectId },
  });
  return data;
};

export const deleteDefectSheet = async (
  sheetId: number,
  requesterId: number,
): Promise<void> => {
  await api.delete(`/api/v1/defects/sheets/${sheetId}`, {
    params: { requesterId },
  });
};
