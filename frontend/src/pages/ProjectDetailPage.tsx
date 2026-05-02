import { useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderKanban, Users, AlertCircle,
  ChevronRight, UserCheck, X, UserPlus,
  Upload, FileSpreadsheet, TableProperties,
  BarChart2, PieChartIcon, Bug, ExternalLink,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  getProject, getProjectMembers, addProjectMember, removeProjectMember,
} from '../api/projectApi';
import { getSheetByProject, uploadExcel, replaceSheet, parseTestCaseHeaders } from '../api/excelApi';
import {
  getDefectSheetByProject, parseHeaders, saveDefectSheet, deleteDefectSheet, getDefectRows,
} from '../api/defectApi';
import axios from 'axios';
import { getAllUsers } from '../api/userApi';
import { useCurrentUser } from '../context/UserContext';
import type { ProjectMember, ProjectRole } from '../types/project';
import type { RowWithMeta, RowStatus } from '../types/testDesign';
import type { DefectRowResponse } from '../types/defect';
import type { User } from '../api/userApi';

const ROLE_LABELS: Record<ProjectRole, string> = {
  OWNER: 'Owner',
  TESTER: 'Tester',
  VIEWER: 'Viewer',
};

const ROLE_COLORS: Record<ProjectRole, string> = {
  OWNER: 'bg-indigo-100 text-indigo-700',
  TESTER: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<RowStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
  NOT_APPLICABLE: 'N/A',
  NOT_DELIVERED: 'Not Delivered',
};

// Colors for chart segments (matches STATUS_COLORS palette)
const STATUS_CHART_COLORS: Record<RowStatus, string> = {
  NOT_STARTED: '#9ca3af',
  IN_PROGRESS: '#eab308',
  PASSED: '#22c55e',
  FAILED: '#ef4444',
  BLOCKED: '#f97316',
  NOT_APPLICABLE: '#d1d5db',
  NOT_DELIVERED: '#374151',
};

const ALL_STATUSES: RowStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_DELIVERED'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Custom tooltip for pie chart
const PieTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) => {
  if (active && payload && payload.length) {
    const { name, value } = payload[0];
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm">
        <p className="font-medium text-gray-800">{name}</p>
        <p className="text-gray-500">{value} test case{value !== 1 ? 's' : ''}</p>
      </div>
    );
  }
  return null;
};

// Custom tooltip for bar chart
const BarTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; fill: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm min-w-36">
        <p className="font-semibold text-gray-800 mb-1.5 truncate max-w-40">{label}</p>
        {payload.map((p) => p.value > 0 && (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
              <span className="text-gray-600 text-xs">{STATUS_LABELS[p.name as RowStatus] ?? p.name}</span>
            </div>
            <span className="text-gray-800 font-medium text-xs">{p.value}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between text-xs font-semibold text-gray-700">
          <span>Total</span><span>{total}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>('TESTER');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Defect extract state
  const defectFileInputRef = useRef<HTMLInputElement>(null);
  const defectReplaceFileInputRef = useRef<HTMLInputElement>(null);
  const [defectUploadError, setDefectUploadError] = useState<string | null>(null);
  const [showColumnMappingModal, setShowColumnMappingModal] = useState(false);
  const [pendingDefectFile, setPendingDefectFile] = useState<File | null>(null);
  const [parsedColumns, setParsedColumns] = useState<string[]>([]);
  const [selectedIdCol, setSelectedIdCol] = useState('');
  const [selectedSummaryCol, setSelectedSummaryCol] = useState('');
  const [selectedStatusCol, setSelectedStatusCol] = useState('');
  const [selectedDetectedDateCol, setSelectedDetectedDateCol] = useState('');
  const [selectedResolvedDateCol, setSelectedResolvedDateCol] = useState('');
  const [selectedSeverityCol, setSelectedSeverityCol] = useState('');

  // Test case column mapping modal state
  const [showTCMappingModal, setShowTCMappingModal] = useState(false);
  const [pendingTCFile, setPendingTCFile] = useState<File | null>(null);
  const [tcIsReplace, setTcIsReplace] = useState(false);
  const [tcParsedColumns, setTcParsedColumns] = useState<string[]>([]);
  const [selectedExecDateCol, setSelectedExecDateCol] = useState('');
  const [selectedChannelCol, setSelectedChannelCol] = useState('');
  const [selectedLinkedDefectCol, setSelectedLinkedDefectCol] = useState('');
  const [selectedTCStatusCol, setSelectedTCStatusCol] = useState('');
  const [selectedAssignedToCol, setSelectedAssignedToCol] = useState('');
  const [tcMappingError, setTcMappingError] = useState<string | null>(null);
  const [, setIsParsing] = useState(false);
  const [columnMappingError, setColumnMappingError] = useState<string | null>(null);
  const [isParsingHeaders, setIsParsingHeaders] = useState(false);

  const { data: project, isLoading: loadingProject, isError: errorProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    enabled: !!id,
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['projectMembers', id],
    queryFn: () => getProjectMembers(id),
    enabled: !!id,
  });

  const { data: sheet, isLoading: loadingSheet } = useQuery({
    queryKey: ['projectSheet', id],
    queryFn: () => getSheetByProject(id),
    enabled: !!id,
    retry: false,
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => getAllUsers(),
  });

  const { data: defectSheet, isLoading: loadingDefectSheet } = useQuery({
    queryKey: ['defectSheet', id],
    queryFn: async () => {
      try {
        return await getDefectSheetByProject(id);
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!id,
    retry: false,
  });

  const { data: defectPageForChart } = useQuery({
    queryKey: ['defectRowsForChart', id],
    queryFn: () => getDefectRows(defectSheet!.sheetId, 0, 5000),
    enabled: !!defectSheet?.sheetId && !!defectSheet.statusColumnName,
  });

  const myMembership = members.find((m: ProjectMember) => m.userId === currentUser?.id);
  const myRole: ProjectRole | null = myMembership?.role ?? null;
  const isOwner = myRole === 'OWNER';
  const isTesterOrOwner = myRole === 'OWNER' || myRole === 'TESTER';

  const memberUserIds = new Set(members.map((m: ProjectMember) => m.userId));
  const nonMembers = allUsers.filter((u: User) => !memberUserIds.has(u.id));

  // --- Chart data derivation ---

  // Execution status pie chart data
  const statusChartData = useMemo(() => {
    if (!sheet) return [];
    const counts: Record<RowStatus, number> = {
      NOT_STARTED: 0, IN_PROGRESS: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, NOT_APPLICABLE: 0, NOT_DELIVERED: 0,
    };
    sheet.rows.forEach((row: RowWithMeta) => {
      const s = row.rowStatus ?? 'NOT_STARTED';
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return ALL_STATUSES
      .filter(s => counts[s] > 0)
      .map(s => ({ name: STATUS_LABELS[s], value: counts[s], fill: STATUS_CHART_COLORS[s], key: s }));
  }, [sheet]);

  // Assignment stacked bar chart data
  const assignmentChartData = useMemo(() => {
    if (!sheet) return [];
    const map: Record<string, Record<RowStatus, number>> = {};
    sheet.rows.forEach((row: RowWithMeta) => {
      const assignee = row.assignedToUsername ?? 'Unassigned';
      const status = row.rowStatus ?? 'NOT_STARTED';
      if (!map[assignee]) {
        map[assignee] = { NOT_STARTED: 0, IN_PROGRESS: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, NOT_APPLICABLE: 0, NOT_DELIVERED: 0 };
      }
      map[assignee][status] = (map[assignee][status] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([assignee, counts]) => ({ assignee, ...counts }))
      .sort((a, b) => {
        const totalA = ALL_STATUSES.reduce((s, k) => s + (a[k] ?? 0), 0);
        const totalB = ALL_STATUSES.reduce((s, k) => s + (b[k] ?? 0), 0);
        return totalB - totalA;
      });
  }, [sheet]);

  // Summary stats
  const stats = useMemo(() => {
    if (!sheet) return null;
    const total = sheet.rows.length;
    const passed = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'PASSED').length;
    const failed = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'FAILED').length;
    const blocked = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'BLOCKED').length;
    const inProgress = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'IN_PROGRESS').length;
    const notStarted = sheet.rows.filter((r: RowWithMeta) => !r.rowStatus || r.rowStatus === 'NOT_STARTED').length;
    const notApplicable = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'NOT_APPLICABLE').length;
    const notDelivered = sheet.rows.filter((r: RowWithMeta) => r.rowStatus === 'NOT_DELIVERED').length;
    const assigned = sheet.rows.filter((r: RowWithMeta) => r.assignedToId !== null).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, blocked, inProgress, notStarted, notApplicable, notDelivered, assigned, passRate };
  }, [sheet]);

  // Defect status chart data
  const defectStatusChartData = useMemo(() => {
    if (!defectPageForChart || !defectSheet?.statusColumnName) return [];
    const col = defectSheet.statusColumnName;
    const counts: Record<string, number> = {};
    defectPageForChart.rows.forEach((row: DefectRowResponse) => {
      const val = (row.data[col] ?? 'Unknown').trim() || 'Unknown';
      counts[val] = (counts[val] ?? 0) + 1;
    });
    const palette = ['#3b82f6', '#22c55e', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, fill: palette[i % palette.length] }));
  }, [defectPageForChart, defectSheet?.statusColumnName]);

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: () => {
      if (!currentUser) throw new Error('No user selected');
      return addProjectMember(id, currentUser.id, { userId: Number(newMemberUserId), role: newMemberRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setShowAddMemberModal(false);
      setNewMemberUserId(''); setNewMemberRole('TESTER'); setAddMemberError(null);
    },
    onError: (err: Error) => setAddMemberError(err.message || 'Failed to add member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => {
      if (!currentUser) throw new Error('No user selected');
      return removeProjectMember(id, userId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: Error) => alert(err.message || 'Failed to remove member'),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, execDateCol, channelCol, linkedDefectCol, statusCol, assignedToCol }: { file: File; execDateCol?: string; channelCol?: string; linkedDefectCol?: string; statusCol?: string; assignedToCol?: string }) => {
      if (!currentUser) throw new Error('No user selected');
      return uploadExcel(file, currentUser.id, id, execDateCol, channelCol, linkedDefectCol, statusCol, assignedToCol);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setUploadError(null);
      setShowTCMappingModal(false);
      setPendingTCFile(null);
      setSelectedExecDateCol(''); setSelectedChannelCol('');
      setSelectedLinkedDefectCol(''); setSelectedTCStatusCol(''); setSelectedAssignedToCol('');
    },
    onError: (err: Error) => setUploadError(err.message || 'Upload failed'),
  });

  const replaceMutation = useMutation({
    mutationFn: ({ file, execDateCol, channelCol, linkedDefectCol, statusCol, assignedToCol }: { file: File; execDateCol?: string; channelCol?: string; linkedDefectCol?: string; statusCol?: string; assignedToCol?: string }) => {
      if (!currentUser) throw new Error('No user selected');
      return replaceSheet(file, currentUser.id, id, execDateCol, channelCol, linkedDefectCol, statusCol, assignedToCol);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setReplaceError(null);
      setShowTCMappingModal(false);
      setPendingTCFile(null);
      setSelectedExecDateCol(''); setSelectedChannelCol('');
      setSelectedLinkedDefectCol(''); setSelectedTCStatusCol(''); setSelectedAssignedToCol('');
    },
    onError: (err: Error) => setReplaceError(err.message || 'Replace failed'),
  });

  const saveDefectMutation = useMutation({
    mutationFn: ({ file, idCol, summaryCol, statusCol, detectedDateCol, resolvedDateCol, severityCol }: { file: File; idCol: string; summaryCol: string; statusCol?: string; detectedDateCol?: string; resolvedDateCol?: string; severityCol?: string }) => {
      if (!currentUser) throw new Error('No user selected');
      return saveDefectSheet(file, id, currentUser.id, idCol, summaryCol, statusCol || undefined, detectedDateCol || undefined, resolvedDateCol || undefined, severityCol || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defectSheet', id] });
      queryClient.invalidateQueries({ queryKey: ['defectDropdown', id] });
      queryClient.invalidateQueries({ queryKey: ['defectRowsForChart', id] });
      setShowColumnMappingModal(false);
      setPendingDefectFile(null);
      setParsedColumns([]);
      setSelectedIdCol('');
      setSelectedSummaryCol('');
      setSelectedStatusCol('');
      setColumnMappingError(null);
      setDefectUploadError(null);
    },
    onError: (err: Error) => setColumnMappingError(err.message || 'Failed to save defect sheet'),
  });

  const deleteDefectMutation = useMutation({
    mutationFn: (sheetId: number) => {
      if (!currentUser) throw new Error('No user selected');
      return deleteDefectSheet(sheetId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defectSheet', id] });
      queryClient.invalidateQueries({ queryKey: ['defectDropdown', id] });
    },
    onError: (err: Error) => alert(err.message || 'Failed to delete defect sheet'),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadError('Only .xlsx files are supported');
      return;
    }
    setIsParsing(true);
    try {
      const cols = await parseTestCaseHeaders(file);
      setTcParsedColumns(cols);
      setPendingTCFile(file);
      setTcIsReplace(false);
      setSelectedExecDateCol('');
      setSelectedChannelCol('');
      setTcMappingError(null);
      setShowTCMappingModal(true);
    } catch {
      uploadMutation.mutate({ file });
    } finally {
      setIsParsing(false);
    }
  };

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setReplaceError('Only .xlsx files are supported');
      return;
    }
    setIsParsing(true);
    try {
      const cols = await parseTestCaseHeaders(file);
      setTcParsedColumns(cols);
      setPendingTCFile(file);
      setTcIsReplace(true);
      setSelectedExecDateCol('');
      setSelectedChannelCol('');
      setTcMappingError(null);
      setShowTCMappingModal(true);
    } catch {
      replaceMutation.mutate({ file });
    } finally {
      setIsParsing(false);
    }
  };

  const closeTCMappingModal = () => {
    setShowTCMappingModal(false);
    setPendingTCFile(null);
    setSelectedExecDateCol('');
    setSelectedChannelCol('');
    setSelectedLinkedDefectCol('');
    setSelectedTCStatusCol('');
    setSelectedAssignedToCol('');
    setTcMappingError(null);
  };

  const handleConfirmTCMapping = () => {
    if (!pendingTCFile) return;
    const common = {
      file: pendingTCFile,
      execDateCol: selectedExecDateCol || undefined,
      channelCol: selectedChannelCol || undefined,
      linkedDefectCol: selectedLinkedDefectCol || undefined,
      statusCol: selectedTCStatusCol || undefined,
      assignedToCol: selectedAssignedToCol || undefined,
    };
    if (tcIsReplace) {
      replaceMutation.mutate(common);
    } else {
      uploadMutation.mutate(common);
    }
  };

  const handleDefectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setDefectUploadError('Only .xlsx files are supported');
      return;
    }
    setDefectUploadError(null);
    setIsParsingHeaders(true);
    try {
      const response = await parseHeaders(file);
      setParsedColumns(response.columns);
      setPendingDefectFile(file);
      setSelectedIdCol(response.columns[0] ?? '');
      setSelectedSummaryCol(response.columns[1] ?? response.columns[0] ?? '');
      setSelectedStatusCol('');
      setColumnMappingError(null);
      setShowColumnMappingModal(true);
    } catch (err: unknown) {
      setDefectUploadError(err instanceof Error ? err.message : 'Failed to read file headers');
    } finally {
      setIsParsingHeaders(false);
    }
  };

  const handleConfirmColumnMapping = () => {
    if (!pendingDefectFile) return;
    if (!selectedIdCol || !selectedSummaryCol) {
      setColumnMappingError('Please select both columns');
      return;
    }
    saveDefectMutation.mutate({ file: pendingDefectFile, idCol: selectedIdCol, summaryCol: selectedSummaryCol, statusCol: selectedStatusCol || undefined, detectedDateCol: selectedDetectedDateCol || undefined, resolvedDateCol: selectedResolvedDateCol || undefined, severityCol: selectedSeverityCol || undefined });
  };

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  if (errorProject || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-3">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">Failed to load project</p>
        <Link to="/projects" className="text-sm text-indigo-600 underline">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/projects" className="hover:text-indigo-600 transition-colors">Projects</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-800 font-medium">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="bg-indigo-100 rounded-xl p-3 shrink-0">
            <FolderKanban className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-800">{project.name}</h1>
            {project.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
            <p className="text-xs text-gray-400 mt-2">Created {formatDate(project.createdAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            {currentUser ? (
              myRole ? (
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="text-sm font-medium text-gray-800">{currentUser.username}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[myRole]}`}>
                    {ROLE_LABELS[myRole]}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="text-sm font-medium text-gray-800">{currentUser.username}</p>
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Not a member
                  </span>
                </div>
              )
            ) : (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                No user selected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {/* Members panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" /> Members
              </h2>
              {isOwner && (
                <button onClick={() => { setShowAddMemberModal(true); setAddMemberError(null); setNewMemberUserId(''); }}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>
            {loadingMembers ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No members yet</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member: ProjectMember) => (
                  <li key={member.userId} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{member.username}</p>
                      <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                      {isOwner && member.role !== 'OWNER' && (
                        <button onClick={() => removeMemberMutation.mutate(member.userId)}
                          disabled={removeMemberMutation.isPending}
                          className="text-gray-300 hover:text-red-500 transition-colors" title="Remove member">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Test Design summary */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-500" /> Test Design
              </h2>
              {sheet && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span><strong>{sheet.rows.length}</strong> rows</span>
                  <span><strong>{sheet.columns.length}</strong> columns</span>
                  <span className="text-gray-300">·</span>
                  <span className="truncate max-w-32">{sheet.fileName}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {isOwner ? 'You can assign rows and change status.' : isTesterOrOwner ? 'You can change row status.' : 'Read-only view.'}
            </p>

            {loadingSheet ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : !sheet ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <FileSpreadsheet className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No test design uploaded yet</p>
                <p className="text-xs mt-1 mb-4">Upload an Excel file to populate the test design for this project.</p>
                {isOwner && (
                  <>
                    <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                      className="flex items-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                      <Upload className="w-4 h-4" />
                      {uploadMutation.isPending ? 'Uploading...' : 'Upload Excel File'}
                    </button>
                    {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
                  </>
                )}
              </div>
            ) : (
              /* Quick stats row when sheet is present */
              <div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-800">{stats?.total ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total Cases</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-700">{stats?.passed ?? 0}</p>
                    <p className="text-xs text-green-600 mt-0.5">Passed</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-red-600">{stats?.failed ?? 0}</p>
                    <p className="text-xs text-red-500 mt-0.5">Failed</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-orange-600">{stats?.blocked ?? 0}</p>
                    <p className="text-xs text-orange-500 mt-0.5">Blocked</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{stats?.inProgress ?? 0}</p>
                    <p className="text-xs text-blue-500 mt-0.5">In Progress</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-500">{stats?.notStarted ?? 0}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Not Started</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-purple-600">{stats?.notApplicable ?? 0}</p>
                    <p className="text-xs text-purple-500 mt-0.5">N/A</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-slate-600">{stats?.notDelivered ?? 0}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Not Delivered</p>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-indigo-600">{stats?.assigned ?? 0}</p>
                    <p className="text-xs text-indigo-500 mt-0.5">Assigned</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-teal-600">{stats ? stats.inProgress + stats.notStarted : 0}</p>
                    <p className="text-xs text-teal-500 mt-0.5">Available</p>
                  </div>
                </div>
                {/* Pass-rate health score */}
                {stats && stats.total > 0 && (
                  <div className="mt-3 bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Pass Rate</p>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-40 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${stats.passRate >= 80 ? 'bg-green-500' : stats.passRate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`}
                            style={{ width: `${stats.passRate}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold ${stats.passRate >= 80 ? 'text-green-700' : stats.passRate >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {stats.passRate}%
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {stats.passed} passed / {stats.total} total
                      {stats.blocked > 0 && ` · ${stats.blocked} blocked`}
                    </div>
                  </div>
                )}
                {isOwner && (
                  <div className="mt-3 flex items-center gap-2">
                    <input ref={replaceFileInputRef} type="file" accept=".xlsx" onChange={handleReplace} className="hidden" />
                    <button
                      onClick={() => { setReplaceError(null); replaceFileInputRef.current?.click(); }}
                      disabled={replaceMutation.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {replaceMutation.isPending ? 'Replacing...' : 'Replace Test Design'}
                    </button>
                    <span className="text-xs text-gray-400">Drops current sheet and imports new file. Status & Assigned To columns are auto-mapped.</span>
                    {replaceError && <span className="text-xs text-red-600">{replaceError}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Defect Extract card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Bug className="w-4 h-4 text-rose-500" /> Defect Extract
          </h2>
          {defectSheet && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span><strong>{defectSheet.totalRows}</strong> defects</span>
              <span className="text-gray-300">·</span>
              <span className="truncate max-w-32">{defectSheet.fileName}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-3">Upload a QC defect extract to link defects to test cases.</p>

        {loadingDefectSheet ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : !defectSheet ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Bug className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No defect extract uploaded</p>
            <p className="text-xs mt-1 mb-4">Upload a QC defect extract to enable defect linking on test cases.</p>
            {isOwner && (
              <>
                <input ref={defectFileInputRef} type="file" accept=".xlsx" onChange={handleDefectFileSelect} className="hidden" />
                <button
                  onClick={() => { setDefectUploadError(null); defectFileInputRef.current?.click(); }}
                  disabled={isParsingHeaders}
                  className="flex items-center gap-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {isParsingHeaders ? 'Reading file...' : 'Upload Defect Extract'}
                </button>
                {defectUploadError && <p className="text-xs text-red-600 mt-2">{defectUploadError}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-rose-50 rounded-lg px-4 py-3 text-center">
                <p className="text-xl font-bold text-rose-700">{defectSheet.totalRows}</p>
                <p className="text-xs text-rose-500 mt-0.5">Total Defects</p>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p><span className="text-gray-400">ID column:</span> <span className="font-medium text-gray-700">{defectSheet.idColumnName}</span></p>
                <p><span className="text-gray-400">Summary column:</span> <span className="font-medium text-gray-700">{defectSheet.summaryColumnName}</span></p>
                {defectSheet.uploadedByUsername && (
                  <p><span className="text-gray-400">Uploaded by:</span> <span className="font-medium text-gray-700">{defectSheet.uploadedByUsername}</span></p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <>
                  <input ref={defectReplaceFileInputRef} type="file" accept=".xlsx" onChange={handleDefectFileSelect} className="hidden" />
                  <button
                    onClick={() => { setDefectUploadError(null); defectReplaceFileInputRef.current?.click(); }}
                    disabled={isParsingHeaders}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isParsingHeaders ? 'Reading...' : 'Replace'}
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete the defect extract? This will unlink all defects from test cases.')) deleteDefectMutation.mutate(defectSheet.sheetId); }}
                    disabled={deleteDefectMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {deleteDefectMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
              <button
                onClick={() => navigate(`/projects/${id}/defects`)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Defects
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View All Test Cases button — only shown when a sheet exists */}
      {sheet && (
        <div className="flex justify-end gap-3 mb-6">
          <button
            onClick={() => navigate(`/projects/${id}/report`)}
            className="flex items-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-sm transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Generate Report
          </button>
          <button
            onClick={() => navigate(`/projects/${id}/test-cases`)}
            className="flex items-center gap-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-sm transition-colors"
          >
            <TableProperties className="w-4 h-4" />
            View All Test Cases
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dashboard charts */}
      {sheet && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Execution Status Pie Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
              <PieChartIcon className="w-4 h-4 text-indigo-500" /> Execution Status
            </h2>
            {statusChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-gray-400">
                <PieChartIcon className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No data to display</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Assignment Stacked Bar Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-indigo-500" /> Assignment Overview
            </h2>
            {assignmentChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-gray-400">
                <BarChart2 className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No data to display</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={assignmentChartData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
                  barSize={assignmentChartData.length > 6 ? 14 : 24}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="assignee"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 9) + '…' : v}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  {ALL_STATUSES.map((status) => (
                    <Bar
                      key={status}
                      dataKey={status}
                      stackId="a"
                      fill={STATUS_CHART_COLORS[status]}
                      name={status}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {ALL_STATUSES.map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: STATUS_CHART_COLORS[s] }} />
                  <span className="text-xs text-gray-500">{STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Defect Status Chart — only when statusColumnName is configured */}
          {defectSheet && defectSheet.statusColumnName && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
                <Bug className="w-4 h-4 text-rose-500" /> Defect Status Distribution
              </h2>
              <p className="text-xs text-gray-400 mb-4">Grouped by "{defectSheet.statusColumnName}" column · {defectSheet.totalRows} total defects</p>
              {defectStatusChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <Bug className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">Loading defect data…</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={defectStatusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {defectStatusChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const { name, value } = payload[0];
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm">
                                <p className="font-medium text-gray-800">{name}</p>
                                <p className="text-gray-500">{value} defect{(value as number) !== 1 ? 's' : ''}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {defectStatusChartData.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                          <span className="text-sm text-gray-700 font-medium truncate max-w-40">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-gray-800">{entry.value}</span>
                          <span className="text-xs text-gray-400">
                            {Math.round((entry.value / (defectSheet.totalRows || 1)) * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Test Case Column Mapping Modal */}
      {showTCMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <TableProperties className="w-4 h-4 text-indigo-500" /> Map Test Case Columns
              </h3>
              <button onClick={closeTCMappingModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Select which columns from your test case file to use for reporting. These are optional but enable richer charts.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Execution Date Column <span className="text-gray-400 font-normal">(optional — for daily trend chart)</span></label>
                <select
                  value={selectedExecDateCol}
                  onChange={e => setSelectedExecDateCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">None</option>
                  {tcParsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel Column <span className="text-gray-400 font-normal">(optional — for channel-wise execution chart)</span></label>
                <select
                  value={selectedChannelCol}
                  onChange={e => setSelectedChannelCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">None</option>
                  {tcParsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Column <span className="text-gray-400 font-normal">(optional — maps test case status on import)</span></label>
                <select
                  value={selectedTCStatusCol}
                  onChange={e => setSelectedTCStatusCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">None</option>
                  {tcParsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To Column <span className="text-gray-400 font-normal">(optional — maps assignee on import)</span></label>
                <select
                  value={selectedAssignedToCol}
                  onChange={e => setSelectedAssignedToCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">None</option>
                  {tcParsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linked Defect Column <span className="text-gray-400 font-normal">(optional — links defects to test cases on import)</span></label>
                <select
                  value={selectedLinkedDefectCol}
                  onChange={e => setSelectedLinkedDefectCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">None</option>
                  {tcParsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              {tcMappingError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{tcMappingError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeTCMappingModal}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTCMapping}
                disabled={uploadMutation.isPending || replaceMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
              >
                {(uploadMutation.isPending || replaceMutation.isPending) ? 'Uploading...' : tcIsReplace ? 'Replace Sheet' : 'Upload Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Mapping Modal */}
      {showColumnMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Bug className="w-4 h-4 text-rose-500" /> Map Defect Columns
              </h3>
              <button onClick={() => { setShowColumnMappingModal(false); setPendingDefectFile(null); setSelectedStatusCol(''); setSelectedDetectedDateCol(''); setSelectedResolvedDateCol(''); setSelectedSeverityCol(''); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Select which columns from your QC extract represent the defect ID and summary.
              All other columns will be stored automatically.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Defect ID Column *</label>
                <select
                  value={selectedIdCol}
                  onChange={e => setSelectedIdCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Summary / Description Column *</label>
                <select
                  value={selectedSummaryCol}
                  onChange={e => setSelectedSummaryCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Column <span className="text-gray-400 font-normal">(optional — enables defect status chart)</span></label>
                <select
                  value={selectedStatusCol}
                  onChange={e => setSelectedStatusCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="">None</option>
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detected Date Column <span className="text-gray-400 font-normal">(optional — enables detected vs resolved chart)</span></label>
                <select
                  value={selectedDetectedDateCol}
                  onChange={e => setSelectedDetectedDateCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="">None</option>
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolved Date Column <span className="text-gray-400 font-normal">(optional — enables detected vs resolved chart)</span></label>
                <select
                  value={selectedResolvedDateCol}
                  onChange={e => setSelectedResolvedDateCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="">None</option>
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity Column <span className="text-gray-400 font-normal">(optional — enables defect severity chart)</span></label>
                <select
                  value={selectedSeverityCol}
                  onChange={e => setSelectedSeverityCol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="">None</option>
                  {parsedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              {columnMappingError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{columnMappingError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowColumnMappingModal(false); setPendingDefectFile(null); setSelectedStatusCol(''); setSelectedDetectedDateCol(''); setSelectedResolvedDateCol(''); setSelectedSeverityCol(''); }}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmColumnMapping}
                disabled={saveDefectMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50"
              >
                {saveDefectMutation.isPending ? 'Uploading...' : 'Upload Defects'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800">Add Member</h3>
              <button onClick={() => setShowAddMemberModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User to add *</label>
                {nonMembers.length === 0 ? (
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3">All existing users are already members.</p>
                ) : (
                  <select value={newMemberUserId} onChange={e => setNewMemberUserId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select a user...</option>
                    {nonMembers.map((u: User) => (
                      <option key={u.id} value={u.id}>#{u.id} — {u.username} ({u.role})</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Role *</label>
                <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value as ProjectRole)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="OWNER">Owner</option>
                  <option value="TESTER">Tester</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              {addMemberError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{addMemberError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddMemberModal(false)} className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => { if (!newMemberUserId) { setAddMemberError('Please select a user'); return; } addMemberMutation.mutate(); }}
                disabled={addMemberMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
