export interface ParseHeadersResponse {
  columns: string[];
}

export interface DefectSheetSummary {
  sheetId: number;
  fileName: string;
  sheetName: string;
  projectId: number;
  idColumnName: string;
  summaryColumnName: string;
  statusColumnName: string | null;
  detectedDateColumnName: string | null;
  resolvedDateColumnName: string | null;
  severityColumnName: string | null;
  totalRows: number;
  createdAt: string;
  uploadedByUsername: string | null;
}

export interface DefectRowResponse {
  rowId: number;
  rowIndex: number;
  defectId: string;
  summary: string | null;
  data: Record<string, string>;
  updatedAt: string | null;
  updatedByUsername: string | null;
}

export interface DefectPageResponse {
  sheetId: number;
  fileName: string;
  sheetName: string;
  columns: string[];
  rows: DefectRowResponse[];
  totalRows: number;
}

export interface DropdownItem {
  rowId: number;
  defectId: string;
  summary: string | null;
}

export interface UpdateDefectRowRequest {
  rowData?: Record<string, string>;
  defectId?: string;
  summary?: string;
}
