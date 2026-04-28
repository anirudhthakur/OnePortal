import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight as ChevronRightIcon, CheckCircle, AlertCircle,
  FileSpreadsheet, Upload, TableProperties, Trash2, Plus, Download, Bug,
  X, Filter, Maximize2, Clock, Square, CheckSquare,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getSheetByProject, uploadExcel, updateRow, addRow, deleteRow } from '../api/excelApi';
import { getDefectDropdown } from '../api/defectApi';
import { getProject, getProjectMembers } from '../api/projectApi';
import { useCurrentUser } from '../context/UserContext';
import type { ProjectMember, ProjectRole } from '../types/project';
import type { RowWithMeta, RowStatus } from '../types/testDesign';
import type { DropdownItem } from '../types/defect';

const STATUS_LABELS: Record<RowStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
  NOT_APPLICABLE: 'N/A',
  NOT_DELIVERED: 'Not Delivered',
};

const FUNCTIONAL_COLUMN_NAMES = new Set([
  'status',
  'assigned to', 'assigned_to', 'assignedto',
  'linked defects', 'linked defect',
  'defects', 'defect', 'defect id', 'defect ids',
]);

const STATUS_COLORS: Record<RowStatus, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PASSED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-orange-100 text-orange-700',
  NOT_APPLICABLE: 'bg-gray-100 text-gray-400',
  NOT_DELIVERED: 'bg-gray-800 text-white',
};

const ALL_STATUSES: RowStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_DELIVERED'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type SortDir = 'asc' | 'desc' | null;

function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const delta = 2;
  const rangeStart = Math.max(1, current - delta);
  const rangeEnd = Math.min(total - 2, current + delta);
  const result: (number | '...')[] = [0];
  if (rangeStart > 1) result.push('...');
  for (let i = rangeStart; i <= rangeEnd; i++) result.push(i);
  if (rangeEnd < total - 2) result.push('...');
  result.push(total - 1);
  return result;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProjectTestCasesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Per-column filters
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<RowStatus | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  // Linked-defect filter — initialised from URL param ?defectRowId=
  const [linkedDefectFilter, setLinkedDefectFilter] = useState<number | null>(
    () => {
      const v = searchParams.get('defectRowId');
      return v ? Number(v) : null;
    }
  );

  // Inline editing state
  const [pendingAssign, setPendingAssign] = useState<Record<number, string>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<number, RowStatus>>({});
  const [pendingCells, setPendingCells] = useState<Record<number, Record<string, string>>>({});
  const [pendingDefects, setPendingDefects] = useState<Record<number, number[]>>({});
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());

  // Delete confirmation state
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<RowWithMeta | null>(null);

  // Bulk selection
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<RowStatus | ''>('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Row expand panel
  const [expandedRow, setExpandedRow] = useState<RowWithMeta | null>(null);

  // Linked defects dropdown state
  const [openDefectRowId, setOpenDefectRowId] = useState<number | null>(null);
  const [defectSearch, setDefectSearch] = useState('');
  const defectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openDefectRowId === null) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (defectDropdownRef.current && !defectDropdownRef.current.contains(e.target as Node)) {
        setOpenDefectRowId(null);
        setDefectSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openDefectRowId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Column resize state
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // Column reorder state
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dragColRef = useRef<string | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { col, startX, startWidth } = resizeRef.current;
      const newWidth = Math.max(60, startWidth + (e.clientX - startX));
      setColWidths(prev => ({ ...prev, [col]: newWidth }));
    };
    const onMouseUp = () => { resizeRef.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    enabled: !!id,
  });

  const { data: members = [] } = useQuery({
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

  const { data: defectDropdown = [] } = useQuery<DropdownItem[]>({
    queryKey: ['defectDropdown', id],
    queryFn: () => getDefectDropdown(id),
    enabled: !!id,
  });

  const myMembership = members.find((m: ProjectMember) => m.userId === currentUser?.id);
  const myRole: ProjectRole | null = myMembership?.role ?? null;
  const isOwner = myRole === 'OWNER';
  const isTesterOrOwner = myRole === 'OWNER' || myRole === 'TESTER';

  const displayColumns: string[] = useMemo(
    () => (sheet?.columns ?? []).filter(
      (col: string) => !FUNCTIONAL_COLUMN_NAMES.has(col.trim().toLowerCase())
    ),
    [sheet?.columns]
  );

  // Seed column order when a new sheet is loaded
  useEffect(() => {
    if (displayColumns.length) {
      setColumnOrder(prev => {
        const known = new Set(prev);
        const extra = displayColumns.filter(c => !known.has(c));
        const pruned = prev.filter(c => displayColumns.includes(c));
        return [...pruned, ...extra];
      });
    }
  }, [sheet?.sheetId]);

  // Columns in user-defined drag order (falls back to server order on first load)
  const orderedDisplayColumns = useMemo(() => {
    if (!displayColumns.length) return [];
    if (!columnOrder.length) return displayColumns;
    return [
      ...columnOrder.filter(c => displayColumns.includes(c)),
      ...displayColumns.filter(c => !columnOrder.includes(c)),
    ];
  }, [columnOrder, displayColumns]);

  const uniqueColValues: Record<string, string[]> = useMemo(() => {
    if (!sheet) return {};
    const map: Record<string, Set<string>> = {};
    for (const row of sheet.rows) {
      for (const col of displayColumns) {
        const val = (row.data[col] ?? '').trim();
        if (val) {
          if (!map[col]) map[col] = new Set();
          map[col].add(val);
        }
      }
    }
    const result: Record<string, string[]> = {};
    for (const col of displayColumns) {
      result[col] = map[col] ? Array.from(map[col]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
    }
    return result;
  }, [sheet, displayColumns]);

  const activeFilterCount = useMemo(
    () =>
      Object.values(columnFilters).filter(v => v.trim() !== '').length +
      (search.trim() ? 1 : 0) +
      (statusFilter ? 1 : 0) +
      (assigneeFilter ? 1 : 0) +
      (linkedDefectFilter !== null ? 1 : 0),
    [columnFilters, search, statusFilter, assigneeFilter, linkedDefectFilter]
  );

  const clearAllFilters = () => {
    setSearch('');
    setColumnFilters({});
    setStatusFilter('');
    setAssigneeFilter('');
    setLinkedDefectFilter(null);
    setSearchParams({});
    setPage(0);
  };

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    const q = search.toLowerCase();
    let rows = q
      ? sheet.rows.filter((row: RowWithMeta) =>
          Object.values(row.data).some((v) => v.toLowerCase().includes(q)) ||
          (row.assignedToUsername?.toLowerCase().includes(q) ?? false)
        )
      : [...sheet.rows];

    // Status filter
    if (statusFilter) {
      rows = rows.filter((row: RowWithMeta) => (row.rowStatus ?? 'NOT_STARTED') === statusFilter);
    }

    // Assignee filter
    if (assigneeFilter) {
      rows = rows.filter((row: RowWithMeta) =>
        assigneeFilter === '__unassigned__'
          ? !row.assignedToId
          : String(row.assignedToId) === assigneeFilter
      );
    }

    // Linked-defect filter — show only rows that reference the selected defect row ID
    if (linkedDefectFilter !== null) {
      rows = rows.filter((row: RowWithMeta) =>
        (row.linkedDefectIds ?? []).includes(linkedDefectFilter)
      );
    }

    // Per data-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val.trim()) continue;
      rows = rows.filter((row: RowWithMeta) => (row.data[col] ?? '') === val);
    }

    if (sortCol && sortDir) {
      rows.sort((a: RowWithMeta, b: RowWithMeta) => {
        const av = a.data[sortCol] ?? '';
        const bv = b.data[sortCol] ?? '';
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [sheet, search, columnFilters, statusFilter, assigneeFilter, linkedDefectFilter, sortCol, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const clampedPage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = filteredRows.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize);
  const startIdx = clampedPage * pageSize + 1;
  const endIdx = Math.min((clampedPage + 1) * pageSize, filteredRows.length);

  const handleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir(null); }
    setPage(0);
  };

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      if (!currentUser) throw new Error('No user selected');
      return uploadExcel(file, currentUser.id, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setUploadError(null);
    },
    onError: (err: Error) => setUploadError(err.message || 'Upload failed'),
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadError('Only .xlsx files are supported');
      return;
    }
    uploadMutation.mutate(file);
  };

  // Add row mutation
  const addRowMutation = useMutation({
    mutationFn: () => {
      if (!currentUser || !sheet) throw new Error('No sheet');
      return addRow(sheet.sheetId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setTimeout(() => setPage(Math.max(0, Math.ceil((filteredRows.length + 1) / pageSize) - 1)), 100);
    },
    onError: (err: Error) => alert(err.message || 'Failed to add row'),
  });

  // Delete row mutation
  const deleteRowMutation = useMutation({
    mutationFn: (rowId: number) => {
      if (!currentUser || !sheet) throw new Error('No sheet');
      return deleteRow(sheet.sheetId, rowId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setDeleteConfirmRow(null);
    },
    onError: (err: Error) => alert(err.message || 'Failed to delete row'),
  });

  // Save row changes
  const saveRowChanges = async (row: RowWithMeta) => {
    if (!currentUser || !sheet) return;

    const newAssigneeId = pendingAssign[row.rowId] !== undefined
      ? (pendingAssign[row.rowId] === '' ? undefined : Number(pendingAssign[row.rowId]))
      : undefined;
    const newStatus = pendingStatus[row.rowId];
    const cellEdits = pendingCells[row.rowId];
    const newLinkedDefects = pendingDefects[row.rowId];

    if (newAssigneeId === undefined && !newStatus && !cellEdits && newLinkedDefects === undefined) return;

    let mergedRowData: Record<string, string> | undefined;
    if (cellEdits) {
      mergedRowData = { ...row.data, ...cellEdits };
    }

    setSavingRows(prev => new Set(prev).add(row.rowId));
    try {
      await updateRow(sheet.sheetId, row.rowId, currentUser.id, {
        assignedToId: newAssigneeId,
        rowStatus: newStatus ?? undefined,
        rowData: mergedRowData,
        linkedDefectIds: newLinkedDefects !== undefined ? [...new Set(newLinkedDefects)] : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setPendingAssign(prev => { const n = { ...prev }; delete n[row.rowId]; return n; });
      setPendingStatus(prev => { const n = { ...prev }; delete n[row.rowId]; return n; });
      setPendingCells(prev => { const n = { ...prev }; delete n[row.rowId]; return n; });
      setPendingDefects(prev => { const n = { ...prev }; delete n[row.rowId]; return n; });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingRows(prev => { const n = new Set(prev); n.delete(row.rowId); return n; });
    }
  };

  // Bulk status update
  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedRowIds.size === 0 || !currentUser || !sheet) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        [...selectedRowIds].map(rowId =>
          updateRow(sheet.sheetId, rowId, currentUser.id, { rowStatus: bulkStatus })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['projectSheet', id] });
      setSelectedRowIds(new Set());
      setBulkStatus('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!sheet) return;
    const headers = [...displayColumns, 'Assigned To', 'Status', 'Linked Defects'];
    const wsData = [
      headers,
      ...filteredRows.map((row: RowWithMeta) => {
        const linkedLabels = (row.linkedDefectIds && row.linkedDefectIds.length > 0)
          ? row.linkedDefectIds.map(defectRowId => {
              const item = defectDropdown.find((d: DropdownItem) => d.rowId === defectRowId);
              return item ? item.defectId : String(defectRowId);
            }).join('; ')
          : '';
        return [
          ...displayColumns.map((col: string) => row.data[col] ?? ''),
          row.assignedToUsername ?? 'Unassigned',
          STATUS_LABELS[row.rowStatus ?? 'NOT_STARTED'],
          linkedLabels,
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, `${project?.name ?? 'project'}_test_cases.xlsx`);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    if (sortDir === 'asc') return <ArrowUp className="w-3 h-3 text-indigo-500" />;
    return <ArrowDown className="w-3 h-3 text-indigo-500" />;
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selectedRowIds.has(r.rowId));
  const somePageSelected = pageRows.some(r => selectedRowIds.has(r.rowId));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedRowIds(prev => {
        const n = new Set(prev);
        pageRows.forEach(r => n.delete(r.rowId));
        return n;
      });
    } else {
      setSelectedRowIds(prev => {
        const n = new Set(prev);
        pageRows.forEach(r => n.add(r.rowId));
        return n;
      });
    }
  };

  if (loadingSheet) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/projects" className="hover:text-indigo-600 transition-colors">Projects</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/projects/${id}`} className="hover:text-indigo-600 transition-colors truncate max-w-xs">
          {project?.name ?? `Project #${id}`}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-800 font-medium">Test Cases</span>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 rounded-xl p-2.5">
            <TableProperties className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Test Cases</h1>
            {sheet && (
              <p className="text-xs text-gray-500 mt-0.5">
                {sheet.rows.length} rows · {displayColumns.length} columns · {sheet.fileName}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(`/projects/${id}`)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border border-gray-300 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* No sheet state */}
      {!sheet && (
        <div className="bg-white rounded-xl border border-gray-200 p-12">
          <div className="flex flex-col items-center justify-center text-gray-400">
            <FileSpreadsheet className="w-12 h-12 mb-4 opacity-40" />
            <p className="text-base font-medium text-gray-600 mb-1">No test design uploaded yet</p>
            <p className="text-sm mb-6">Upload an Excel file to populate the test cases for this project.</p>
            {isOwner && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="flex items-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload Excel File'}
                </button>
                {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
              </>
            )}
            {!isOwner && (
              <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
                Ask the project owner to upload a test design file.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {sheet && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rows..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <span className="text-xs">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Active filter badge */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Filter className="w-3 h-3" />
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Linked-defect filter chip */}
            {linkedDefectFilter !== null && (() => {
              const defect = defectDropdown.find((d: DropdownItem) => d.rowId === linkedDefectFilter);
              return (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg">
                  <Bug className="w-3 h-3" />
                  Defect: {defect?.defectId ?? `#${linkedDefectFilter}`}
                  <button
                    onClick={() => {
                      setLinkedDefectFilter(null);
                      setSearchParams({});
                      setPage(0);
                    }}
                    className="ml-0.5 hover:text-rose-900 transition-colors"
                    title="Clear defect filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })()}

            {/* Bulk status update — shown when rows are selected */}
            {selectedRowIds.size > 0 && isTesterOrOwner && (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-indigo-700">{selectedRowIds.size} selected</span>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as RowStatus | '')}
                  className="border border-indigo-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Set status…</option>
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button
                  onClick={applyBulkStatus}
                  disabled={!bulkStatus || bulkSaving}
                  className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded disabled:opacity-50 transition-colors"
                >
                  {bulkSaving ? 'Saving…' : 'Apply'}
                </button>
                <button
                  onClick={() => { setSelectedRowIds(new Set()); setBulkStatus(''); }}
                  className="text-indigo-400 hover:text-indigo-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <span className="text-xs text-gray-400">{filteredRows.length} rows</span>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-green-700 border border-gray-300 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              {isTesterOrOwner && (
                <button
                  onClick={() => addRowMutation.mutate()}
                  disabled={addRowMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {addRowMutation.isPending ? 'Adding...' : 'Add Row'}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-fixed">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {/* Bulk select column */}
                  {isTesterOrOwner && (
                    <th className="sticky left-0 z-10 bg-gray-50 px-2 py-3 w-8">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-indigo-600">
                        {allPageSelected
                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                          : somePageSelected
                            ? <CheckSquare className="w-4 h-4 text-indigo-400 opacity-60" />
                            : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                  )}
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  {orderedDisplayColumns.map((col: string) => (
                    <th
                      key={col}
                      draggable
                      onDragStart={() => { dragColRef.current = col; }}
                      onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={() => {
                        setDragOverCol(null);
                        if (!dragColRef.current || dragColRef.current === col) return;
                        const cols = [...orderedDisplayColumns];
                        const from = cols.indexOf(dragColRef.current!);
                        const to = cols.indexOf(col);
                        if (from === -1 || to === -1) return;
                        cols.splice(from, 1);
                        cols.splice(to, 0, dragColRef.current!);
                        setColumnOrder(cols);
                        dragColRef.current = null;
                      }}
                      style={{ width: colWidths[col], minWidth: colWidths[col] ?? 80 }}
                      className={`relative px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-grab hover:bg-gray-100 transition-colors select-none ${dragOverCol === col ? 'bg-indigo-100 border-l-2 border-indigo-400' : ''}`}
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-1 pr-2">{col}<SortIcon col={col} /></div>
                      <div
                        draggable={false}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400 transition-colors z-20"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const th = e.currentTarget.closest('th') as HTMLElement;
                          resizeRef.current = {
                            col,
                            startX: e.clientX,
                            startWidth: colWidths[col] ?? th.getBoundingClientRect().width,
                          };
                        }}
                      />
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-indigo-50 sticky right-24 z-10 min-w-36">
                    Assigned To
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-indigo-50 sticky right-0 z-10 min-w-36">
                    Status
                  </th>
                  {defectDropdown.length > 0 && (
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-rose-50 min-w-56">
                      <div className="flex items-center gap-1"><Bug className="w-3 h-3 text-rose-400" /> Linked Defects</div>
                    </th>
                  )}
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap w-12">
                    Detail
                  </th>
                </tr>

                {/* Column filter row */}
                <tr className="bg-white border-b border-gray-100">
                  {isTesterOrOwner && <th className="sticky left-0 z-10 bg-white px-2 py-1" />}
                  <th className="sticky left-0 z-10 bg-white px-2 py-1" />
                  {orderedDisplayColumns.map((col: string) => (
                    <th key={col} style={{ width: colWidths[col], minWidth: colWidths[col] ?? 80 }} className="px-2 py-1">
                      <select
                        value={columnFilters[col] ?? ''}
                        onChange={(e) => {
                          setColumnFilters(prev => ({ ...prev, [col]: e.target.value }));
                          setPage(0);
                        }}
                        className="w-full min-w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                      >
                        <option value="">All</option>
                        {(uniqueColValues[col] ?? []).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                  {/* Assigned To filter */}
                  <th className="px-2 py-1 bg-indigo-50/50 sticky right-24 z-10 min-w-36">
                    <select
                      value={assigneeFilter}
                      onChange={(e) => { setAssigneeFilter(e.target.value); setPage(0); }}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">All</option>
                      <option value="__unassigned__">Unassigned</option>
                      {members
                        .filter((m: ProjectMember) => m.role === 'TESTER' || m.role === 'OWNER')
                        .map((m: ProjectMember) => (
                          <option key={m.userId} value={m.userId}>{m.username}</option>
                        ))}
                    </select>
                  </th>
                  {/* Status filter */}
                  <th className="px-2 py-1 bg-indigo-50/50 sticky right-0 z-10 min-w-36">
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value as RowStatus | ''); setPage(0); }}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">All statuses</option>
                      {ALL_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </th>
                  {defectDropdown.length > 0 && (
                    <th className="px-2 py-1 bg-rose-50/50">
                      <select
                        value={linkedDefectFilter ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLinkedDefectFilter(v ? Number(v) : null);
                          if (!v) setSearchParams({});
                          setPage(0);
                        }}
                        className="w-full min-w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 bg-white"
                      >
                        <option value="">All</option>
                        {defectDropdown.map((d: DropdownItem) => (
                          <option key={d.rowId} value={d.rowId}>{d.defectId}</option>
                        ))}
                      </select>
                    </th>
                  )}
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={orderedDisplayColumns.length + 5 + (defectDropdown.length > 0 ? 1 : 0) + (isTesterOrOwner ? 1 : 0)} className="text-center py-12 text-gray-400">
                      No rows match your search
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row: RowWithMeta, i: number) => {
                    const isSaving = savingRows.has(row.rowId);
                    const effectiveAssignId = pendingAssign[row.rowId] !== undefined
                      ? pendingAssign[row.rowId]
                      : (row.assignedToId?.toString() ?? '');
                    const effectiveStatus: RowStatus = pendingStatus[row.rowId] ?? row.rowStatus ?? 'NOT_STARTED';
                    const rowCellEdits = pendingCells[row.rowId] ?? {};
                    const hasPendingChanges =
                      pendingAssign[row.rowId] !== undefined ||
                      pendingStatus[row.rowId] !== undefined ||
                      Object.keys(rowCellEdits).length > 0 ||
                      pendingDefects[row.rowId] !== undefined;
                    const isSelected = selectedRowIds.has(row.rowId);

                    return (
                      <tr
                        key={row.rowId}
                        className={`border-b border-gray-100 transition-colors ${isSelected ? 'bg-indigo-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-indigo-50/30`}
                      >
                        {/* Checkbox */}
                        {isTesterOrOwner && (
                          <td className="sticky left-0 z-10 px-2 py-2.5 bg-inherit">
                            <button
                              onClick={() => setSelectedRowIds(prev => {
                                const n = new Set(prev);
                                n.has(row.rowId) ? n.delete(row.rowId) : n.add(row.rowId);
                                return n;
                              })}
                              className="text-gray-400 hover:text-indigo-600"
                            >
                              {isSelected
                                ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </td>
                        )}

                        {/* Row number + delete + audit tooltip */}
                        <td className="sticky left-0 z-10 px-2 py-2.5 bg-inherit border-r border-gray-100">
                          <div className="flex items-center gap-1">
                            <div className="relative group">
                              <span className="text-gray-400 font-mono text-xs w-6 text-right shrink-0 cursor-default">
                                {startIdx + i}
                              </span>
                              {row.updatedAt && (
                                <div className="absolute left-7 top-0 z-50 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <Clock className="w-3 h-3 opacity-70" />
                                    <span className="font-medium">Last modified</span>
                                  </div>
                                  <div>{formatDateTime(row.updatedAt)}</div>
                                  {row.updatedByUsername && <div className="text-gray-300">by {row.updatedByUsername}</div>}
                                </div>
                              )}
                            </div>
                            {isTesterOrOwner && (
                              <button
                                onClick={() => setDeleteConfirmRow(row)}
                                className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                                title="Delete row"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Data cells */}
                        {orderedDisplayColumns.map((col: string) => {
                          const currentVal = rowCellEdits[col] !== undefined ? rowCellEdits[col] : (row.data[col] ?? '');
                          return (
                            <td key={col} style={{ width: colWidths[col], maxWidth: colWidths[col] ?? undefined }} className="px-2 py-1.5 text-gray-700 overflow-hidden">
                              {isTesterOrOwner ? (
                                <input
                                  type="text"
                                  value={currentVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPendingCells(prev => ({
                                      ...prev,
                                      [row.rowId]: { ...(prev[row.rowId] ?? {}), [col]: val },
                                    }));
                                  }}
                                  disabled={isSaving}
                                  className="w-full min-w-0 border-0 border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none bg-transparent text-sm py-0.5 transition-colors"
                                />
                              ) : (
                                <span className="text-sm truncate block" title={row.data[col]}>{row.data[col] ?? ''}</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Assigned To */}
                        <td className="px-3 py-2 sticky right-24 z-10 bg-inherit min-w-36">
                          {isOwner ? (
                            <select
                              value={effectiveAssignId}
                              onChange={e => setPendingAssign(prev => ({ ...prev, [row.rowId]: e.target.value }))}
                              className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              disabled={isSaving}
                            >
                              <option value="">Unassigned</option>
                              {/* Phantom option for deactivated assignees no longer in the project */}
                              {row.assignedToId &&
                                !members.some((m: ProjectMember) => m.userId === row.assignedToId) &&
                                row.assignedToUsername && (
                                  <option value={row.assignedToId.toString()} disabled>
                                    {row.assignedToUsername}
                                  </option>
                              )}
                              {members
                                .filter((m: ProjectMember) => m.role === 'TESTER' || m.role === 'OWNER')
                                .map((m: ProjectMember) => (
                                  <option key={m.userId} value={m.userId}>{m.username}</option>
                                ))}
                            </select>
                          ) : (
                            <span className={`text-xs ${row.assignedToUsername ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                              {row.assignedToUsername ?? 'Unassigned'}
                            </span>
                          )}
                        </td>

                        {/* Status + save button */}
                        <td className="px-3 py-2 sticky right-0 z-10 bg-inherit min-w-36">
                          <div className="flex items-center gap-1.5">
                            {isTesterOrOwner ? (
                              <select
                                value={effectiveStatus}
                                onChange={e => setPendingStatus(prev => ({ ...prev, [row.rowId]: e.target.value as RowStatus }))}
                                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                disabled={isSaving}
                              >
                                {ALL_STATUSES.map(s => (
                                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[effectiveStatus]}`}>
                                {STATUS_LABELS[effectiveStatus]}
                              </span>
                            )}
                            {hasPendingChanges && (
                              <button
                                onClick={() => saveRowChanges(row)}
                                disabled={isSaving}
                                className="shrink-0 p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50"
                                title="Save changes"
                              >
                                {isSaving
                                  ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                                  : <CheckCircle className="w-3 h-3" />
                                }
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Linked Defects */}
                        {defectDropdown.length > 0 && (() => {
                          const currentLinked: number[] = pendingDefects[row.rowId] !== undefined
                            ? pendingDefects[row.rowId]
                            : (row.linkedDefectIds ?? []);

                          const toggleDefect = (defectRowId: number) => {
                            const current = pendingDefects[row.rowId] !== undefined
                              ? pendingDefects[row.rowId]
                              : (row.linkedDefectIds ?? []);
                            const updated = current.includes(defectRowId)
                              ? current.filter(did => did !== defectRowId)
                              : [...current, defectRowId];
                            setPendingDefects(prev => ({ ...prev, [row.rowId]: updated }));
                          };

                          const isOpen = openDefectRowId === row.rowId;
                          const filteredDefects = defectDropdown.filter((item: DropdownItem) =>
                            defectSearch === '' ||
                            item.defectId.toLowerCase().includes(defectSearch.toLowerCase()) ||
                            (item.summary ?? '').toLowerCase().includes(defectSearch.toLowerCase())
                          );

                          return (
                            <td className="px-3 py-2 bg-inherit min-w-56 max-w-xs">
                              {isTesterOrOwner ? (
                                <div className="relative" ref={isOpen ? defectDropdownRef : null}>
                                  <div
                                    className="flex flex-wrap gap-1 min-h-7 cursor-pointer rounded px-1 hover:bg-rose-50 transition-colors"
                                    onClick={() => {
                                      if (isOpen) { setOpenDefectRowId(null); setDefectSearch(''); }
                                      else { setOpenDefectRowId(row.rowId); setDefectSearch(''); }
                                    }}
                                    title="Click to link/unlink defects"
                                  >
                                    {currentLinked.length === 0 ? (
                                      <span className="text-xs text-gray-400 italic">No defects linked</span>
                                    ) : (
                                      currentLinked.slice(0, 3).map(defectRowId => {
                                        const item = defectDropdown.find((d: DropdownItem) => d.rowId === defectRowId);
                                        return item ? (
                                          <span key={defectRowId} className="inline-flex items-center gap-0.5 text-xs font-medium bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                                            {item.defectId}
                                          </span>
                                        ) : null;
                                      })
                                    )}
                                    {currentLinked.length > 3 && (
                                      <span className="text-xs text-gray-400">+{currentLinked.length - 3}</span>
                                    )}
                                  </div>
                                  {isOpen && (
                                    <div className="absolute left-0 top-full mt-1 z-30 w-80 bg-white border border-gray-200 rounded-lg shadow-xl">
                                      <div className="p-2 border-b border-gray-100">
                                        <input
                                          type="text"
                                          value={defectSearch}
                                          onChange={e => setDefectSearch(e.target.value)}
                                          placeholder="Search defects..."
                                          autoFocus
                                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                          onClick={e => e.stopPropagation()}
                                        />
                                      </div>
                                      <div className="max-h-56 overflow-y-auto p-1.5">
                                        {filteredDefects.length === 0 ? (
                                          <p className="text-xs text-gray-400 text-center py-3">No defects found</p>
                                        ) : (
                                          filteredDefects.map((item: DropdownItem) => {
                                            const checked = currentLinked.includes(item.rowId);
                                            return (
                                              <label key={item.rowId} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  onChange={() => toggleDefect(item.rowId)}
                                                  disabled={isSaving}
                                                  className="mt-0.5 shrink-0 accent-rose-600"
                                                />
                                                <span className="text-xs text-gray-700 leading-snug">
                                                  <span className="font-semibold text-rose-600">{item.defectId}</span>
                                                  {item.summary && (
                                                    <span className="text-gray-500"> — {item.summary.length > 55 ? item.summary.slice(0, 55) + '…' : item.summary}</span>
                                                  )}
                                                </span>
                                              </label>
                                            );
                                          })
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                                        <span className="text-xs text-gray-500">{currentLinked.length} linked</span>
                                        <button
                                          onClick={e => { e.stopPropagation(); setOpenDefectRowId(null); setDefectSearch(''); }}
                                          className="text-xs text-gray-500 hover:text-gray-700"
                                        >
                                          Close
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {currentLinked.length === 0 ? (
                                    <span className="text-xs text-gray-400">—</span>
                                  ) : (
                                    currentLinked.map(defectRowId => {
                                      const item = defectDropdown.find((d: DropdownItem) => d.rowId === defectRowId);
                                      return item ? (
                                        <span key={defectRowId} className="text-xs font-medium bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                                          {item.defectId}
                                        </span>
                                      ) : null;
                                    })
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })()}

                        {/* Row expand */}
                        <td className="px-3 py-2 bg-inherit">
                          <button
                            onClick={() => setExpandedRow(row)}
                            className="text-gray-400 hover:text-indigo-600 transition-colors"
                            title="View details"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredRows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">
                Showing <strong>{startIdx}–{endIdx}</strong> of <strong>{filteredRows.length}</strong> rows
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={clampedPage === 0}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {getPaginationRange(clampedPage, totalPages).map((item, idx) =>
                  item === '...' ? (
                    <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`w-8 h-8 text-xs rounded font-medium transition-colors ${item === clampedPage ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-600'}`}
                    >
                      {item + 1}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={clampedPage >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation overlay */}
      {deleteConfirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2 shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-800">Delete Test Case?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Are you sure you want to delete test case <strong>#{deleteConfirmRow.rowIndex}</strong>?
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmRow(null)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteRowMutation.mutate(deleteConfirmRow.rowId)}
                disabled={deleteRowMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {deleteRowMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row detail slide-in panel */}
      {expandedRow && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setExpandedRow(null)} />
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-100 rounded-lg p-1.5">
                  <TableProperties className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Test Case #{expandedRow.rowIndex}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[expandedRow.rowStatus ?? 'NOT_STARTED']}`}>
                      {STATUS_LABELS[expandedRow.rowStatus ?? 'NOT_STARTED']}
                    </span>
                    {expandedRow.assignedToUsername && (
                      <span className="text-xs text-gray-500">→ {expandedRow.assignedToUsername}</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setExpandedRow(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                {Object.entries(expandedRow.data).map(([col, val]) => (
                  <div key={col} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{col}</p>
                    <p className="text-sm text-gray-800 break-words whitespace-pre-wrap">{val || '—'}</p>
                  </div>
                ))}
                {(expandedRow.linkedDefectIds?.length ?? 0) > 0 && (
                  <div className="bg-rose-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Linked Defects</p>
                    <div className="flex flex-wrap gap-1.5">
                      {expandedRow.linkedDefectIds?.map(defectRowId => {
                        const item = defectDropdown.find((d: DropdownItem) => d.rowId === defectRowId);
                        return item ? (
                          <span key={defectRowId} className="text-xs font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded">
                            {item.defectId}{item.summary && ` — ${item.summary.slice(0, 40)}${item.summary.length > 40 ? '…' : ''}`}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {expandedRow.updatedAt && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last modified {formatDateTime(expandedRow.updatedAt)}
                  {expandedRow.updatedByUsername && ` by ${expandedRow.updatedByUsername}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
