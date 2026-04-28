import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});

export interface ExecutionSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  passed: number;
  failed: number;
  blocked: number;
  notApplicable: number;
  notDelivered: number;
  totalDefects: number;
  openDefects: number;
}

export interface DailyActivity {
  date: string;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  notApplicable: number;
  notDelivered: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface ChannelExecution {
  channel: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  inProgress: number;
  notStarted: number;
  notApplicable: number;
  notDelivered: number;
}

export interface DetectedVsResolvedPoint {
  date: string;
  detected: number;
  resolved: number;
}

export interface DefectReportRow {
  defectId: string;
  summary: string | null;
  status: string | null;
  detectedDate: string | null;
  resolvedDate: string | null;
  impactedScenarios: number;
  allData: Record<string, string>;
}

export interface ProjectReportSummary {
  projectName: string;
  generatedAt: string;
  highlights: string;
  executionSummary: ExecutionSummary;
  executionByStatus: StatusCount[];
  dailyTrend: DailyActivity[];
  defectByStatus: StatusCount[];
  defectBySeverity: StatusCount[];
  channelExecution: ChannelExecution[];
  detectedVsResolved: DetectedVsResolvedPoint[];
  defects: DefectReportRow[];
  defectColumns: string[];
}

export const getProjectReportSummary = async (
  projectId: number,
  trendDays = 14,
): Promise<ProjectReportSummary> => {
  const { data } = await api.get<ProjectReportSummary>(
    `/api/v1/reports/project/${projectId}/summary`,
    { params: { trendDays } },
  );
  return data;
};

export const saveReportHighlights = async (
  projectId: number,
  highlights: string,
): Promise<void> => {
  await api.patch(`/api/v1/reports/project/${projectId}/highlights`, { highlights });
};
