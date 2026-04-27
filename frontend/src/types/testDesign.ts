export interface UploadResponse {
  sheetId: number;
  fileName: string;
  sheetName: string;
  totalRows: number;
  columns: string[];
}

export interface SheetSummary {
  sheetId: number;
  fileName: string;
  sheetName: string;
  totalRows: number;
  createdAt: string;
  uploadedByUsername: string | null;
  projectId: number | null;
}

export interface SheetDataResponse {
  sheetId: number;
  fileName: string;
  sheetName: string;
  columns: string[];
  rows: Record<string, string>[];
}

export type RowStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'NOT_APPLICABLE' | 'NOT_DELIVERED';

export interface RowWithMeta {
  rowId: number;
  rowIndex: number;
  assignedToId: number | null;
  assignedToUsername: string | null;
  rowStatus: RowStatus | null;
  data: Record<string, string>;
  linkedDefectIds: number[] | null;
  updatedAt: string | null;
  updatedByUsername: string | null;
}

export interface ProjectSheetDataResponse {
  sheetId: number;
  fileName: string;
  sheetName: string;
  projectId: number;
  columns: string[];
  rows: RowWithMeta[];
}

export interface UpdateRowRequest {
  assignedToId?: number | null;
  rowStatus?: RowStatus | null;
  rowData?: Record<string, string>;
  linkedDefectIds?: number[];
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
