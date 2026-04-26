import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  Bug, AlertCircle, Download, Plus, Trash2, CheckCircle,
  X, ChevronDown, Filter, Maximize2, Clock, FlaskConical,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getDefectSheetByProject, getDefectRows,
  updateDefectRow, addDefectRow, deleteDefectRow,
} from '../api/defectApi';
import { getDefectDropdown } from '../api/defectApi';
import { getProject, getProjectMembers } from '../api/projectApi';
import { getSheetByProject } from '../api/excelApi';
import { useCurrentUser } from '../context/UserContext';
import type { ProjectMember, ProjectRole } from '../types/project';
import type { DefectRowResponse } from '../types/defect';
import type { DropdownItem } from '../types/defect';

type SortDir = 'asc' | 'desc' | null;

const PAGE_SIZE_OPTIONS = [25, 50, 100];

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProjectDefectsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // CRUD state
  const [pendingCells, setPendingCells] = useState<Record<number, Record<string, string>>>({});
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<DefectRowResponse | null>(null);

  // Detail panel
  const [expandedRow, setExpandedRow] = useState<DefectRowResponse | null>(null);

  // Column resize state
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

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

  const { data: sheetSummary, isLoading: loadingSummary, isError: errorSummary } = useQuery({
    queryKey: ['defectSheet', id],
    queryFn: () => getDefectSheetByProject(id),
    enabled: !!id,
    retry: false,
  });

  const { data: defectPage, isLoading: loadingRows } = useQuery({
    queryKey: ['defectRows', sheetSummary?.sheetId],
    queryFn: () => getDefectRows(sheetSummary!.sheetId, 0, 5000),
    enabled: !!sheetSummary?.sheetId,
  });

  const { data: defectDropdown = [] } = useQuery<DropdownItem[]>({
    queryKey: ['defectDropdown', id],
    queryFn: () => getDefectDropdown(id),
    enabled: !!id,
  });

  // Fetch test design rows to compute real linked-test counts
  const { data: testSheet } = useQuery({
    queryKey: ['projectSheet', id],
    queryFn: () => getSheetByProject(id),
    enabled: !!id,
    retry: false,
  });

  const myMembership = members.find((m: ProjectMember) => m.userId === currentUser?.id);
  const myRole: ProjectRole | null = myMembership?.role ?? null;
  const isTesterOrOwner = myRole === 'OWNER' || myRole === 'TESTER';

  // Build a map: defectRowId -> number of test rows that reference it
  const linkedTestCounts = useMemo<Record<number, number>>(() => {
    if (!testSheet?.rows) return {};
    const counts: Record<number, number> = {};
    for (const row of testSheet.rows) {
      for (const defectRowId of row.linkedDefectIds ?? []) {
        counts[defectRowId] = (counts[defectRowId] ?? 0) + 1;
      }
    }
    return counts;
  }, [testSheet]);

  const isLoading = loadingSummary || loadingRows;

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter(v => v.trim() !== '').length + (search.trim() ? 1 : 0),
    [columnFilters, search]
  );

  const clearAllFilters = () => {
    setSearch('');
    setColumnFilters({});
    setPage(0);
  };

  const filteredRows = useMemo(() => {
    if (!defectPage) return [];
    const q = search.toLowerCase();
    let rows = q
      ? defectPage.rows.filter((row: DefectRowResponse) =>
          Object.values(row.data).some((v) => v.toLowerCase().includes(q)) ||
          row.defectId.toLowerCase().includes(q) ||
          (row.summary?.toLowerCase().includes(q) ?? false)
        )
      : [...defectPage.rows];

    // Apply per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val.trim()) continue;
      const lv = val.toLowerCase();
      rows = rows.filter((row: DefectRowResponse) =>
        (row.data[col] ?? '').toLowerCase().includes(lv)
      );
    }

    if (sortCol && sortDir) {
      rows.sort((a: DefectRowResponse, b: DefectRowResponse) => {
        const av = a.data[sortCol] ?? '';
        const bv = b.data[sortCol] ?? '';
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [defectPage, search, columnFilters, sortCol, sortDir]);

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

  // Save row changes
  const saveRowChanges = async (row: DefectRowResponse) => {
    if (!currentUser || !sheetSummary) return;
    const cellEdits = pendingCells[row.rowId];
    if (!cellEdits || Object.keys(cellEdits).length === 0) return;

    const mergedRowData = { ...row.data, ...cellEdits };
    setSavingRows(prev => new Set(prev).add(row.rowId));
    try {
      await updateDefectRow(sheetSummary.sheetId, row.rowId, currentUser.id, {
        rowData: mergedRowData,
        defectId: cellEdits[sheetSummary.idColumnName] ?? row.defectId,
        summary: cellEdits[sheetSummary.summaryColumnName] ?? row.summary ?? '',
      });
      queryClient.invalidateQueries({ queryKey: ['defectRows', sheetSummary.sheetId] });
      queryClient.invalidateQueries({ queryKey: ['defectDropdown', id] });
      setPendingCells(prev => { const n = { ...prev }; delete n[row.rowId]; return n; });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingRows(prev => { const n = new Set(prev); n.delete(row.rowId); return n; });
    }
  };

  // Add row mutation
  const addRowMutation = useMutation({
    mutationFn: () => {
      if (!currentUser || !sheetSummary) throw new Error('No sheet');
      return addDefectRow(sheetSummary.sheetId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defectRows', sheetSummary?.sheetId] });
      setTimeout(() => setPage(Math.max(0, Math.ceil((filteredRows.length + 1) / pageSize) - 1)), 100);
    },
    onError: (err: Error) => alert(err.message || 'Failed to add row'),
  });

  // Delete row mutation
  const deleteRowMutation = useMutation({
    mutationFn: (rowId: number) => {
      if (!currentUser || !sheetSummary) throw new Error('No sheet');
      return deleteDefectRow(sheetSummary.sheetId, rowId, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defectRows', sheetSummary?.sheetId] });
      queryClient.invalidateQueries({ queryKey: ['defectDropdown', id] });
      setDeleteConfirmRow(null);
    },
    onError: (err: Error) => alert(err.message || 'Failed to delete row'),
  });

  const exportToExcel = () => {
    if (!defectPage) return;
    const headers = defectPage.columns;
    const wsData = [
      headers,
      ...filteredRows.map((row: DefectRowResponse) =>
        headers.map((col: string) => row.data[col] ?? '')
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Defects');
    XLSX.writeFile(wb, `${project?.name ?? 'project'}_defects.xlsx`);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    if (sortDir === 'asc') return <ArrowUp className="w-3 h-3 text-rose-500" />;
    return <ArrowDown className="w-3 h-3 text-rose-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  if (errorSummary || !sheetSummary) {
    return (
      <div className="max-w-screen-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
          <Link to="/projects" className="hover:text-indigo-600 transition-colors">Projects</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to={`/projects/${id}`} className="hover:text-indigo-600 transition-colors">{project?.name ?? `Project #${id}`}</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-800 font-medium">Defects</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-gray-400">
          <AlertCircle className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-base font-medium text-gray-600 mb-1">No defect extract uploaded</p>
          <p className="text-sm mb-6">Upload a QC defect extract from the project dashboard.</p>
          <button
            onClick={() => navigate(`/projects/${id}`)}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-4 py-2 rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
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
        <span className="text-gray-800 font-medium">Defects</span>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-rose-100 rounded-xl p-2.5">
            <Bug className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Defect Extract</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {sheetSummary.totalRows} defects · {sheetSummary.fileName}
              {sheetSummary.createdAt && ` · Uploaded ${formatDate(sheetSummary.createdAt)}`}
              {sheetSummary.uploadedByUsername && ` by ${sheetSummary.uploadedByUsername}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/projects/${id}`)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border border-gray-300 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search defects..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="text-xs">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Active filter badge */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Filter className="w-3 h-3" />
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              <X className="w-3 h-3" />
            </button>
          )}

          <span className="text-xs text-gray-400">{filteredRows.length} defects</span>

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
                className="flex items-center gap-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
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
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                {(defectPage?.columns ?? []).map((col: string) => (
                  <th
                    key={col}
                    style={{ width: colWidths[col], minWidth: colWidths[col] ?? 80 }}
                    className="relative px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center gap-1 pr-2">{col}<SortIcon col={col} /></div>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rose-400 transition-colors z-20"
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
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-rose-50 min-w-24">
                  Linked Tests
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap w-16">
                  Detail
                </th>
              </tr>
              {/* Column filter row */}
              <tr className="bg-white border-b border-gray-100">
                <th className="sticky left-0 z-10 bg-white px-2 py-1" />
                {(defectPage?.columns ?? []).map((col: string) => (
                  <th key={col} style={{ width: colWidths[col], minWidth: colWidths[col] ?? 80 }} className="px-2 py-1">
                    <input
                      type="text"
                      placeholder={`Filter…`}
                      value={columnFilters[col] ?? ''}
                      onChange={(e) => {
                        setColumnFilters(prev => ({ ...prev, [col]: e.target.value }));
                        setPage(0);
                      }}
                      className="w-full min-w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400"
                    />
                  </th>
                ))}
                <th className="px-2 py-1" />
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={(defectPage?.columns.length ?? 0) + 3} className="text-center py-12 text-gray-400">
                    No defects match your search
                  </td>
                </tr>
              ) : (
                pageRows.map((row: DefectRowResponse, i: number) => {
                  const isSaving = savingRows.has(row.rowId);
                  const rowCellEdits = pendingCells[row.rowId] ?? {};
                  const hasPendingChanges = Object.keys(rowCellEdits).length > 0;

                  return (
                    <tr
                      key={row.rowId}
                      className={`border-b border-gray-100 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-rose-50/30`}
                    >
                      {/* Row number + delete + audit tooltip */}
                      <td className="sticky left-0 z-10 px-2 py-2.5 bg-inherit border-r border-gray-100">
                        <div className="flex items-center gap-1">
                          <div className="relative group">
                            <span className="text-gray-400 font-mono text-xs w-6 text-right shrink-0 cursor-default">
                              {startIdx + i}
                            </span>
                            {row.updatedAt && (
                              <div className="absolute left-7 top-0 z-50 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
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
                      {(defectPage?.columns ?? []).map((col: string) => {
                        const currentVal = rowCellEdits[col] !== undefined ? rowCellEdits[col] : (row.data[col] ?? '');
                        return (
                          <td key={col} style={{ width: colWidths[col], maxWidth: colWidths[col] ?? undefined }} className="px-2 py-1.5 text-gray-700 overflow-hidden">
                            {isTesterOrOwner ? (
                              <div className="flex items-center gap-1">
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
                                  className="w-full min-w-0 border-0 border-b border-transparent hover:border-gray-300 focus:border-rose-400 focus:outline-none bg-transparent text-sm py-0.5 transition-colors"
                                />
                                {hasPendingChanges && col === defectPage?.columns[defectPage.columns.length - 1] && (
                                  <button
                                    onClick={() => saveRowChanges(row)}
                                    disabled={isSaving}
                                    className="shrink-0 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded disabled:opacity-50"
                                    title="Save changes"
                                  >
                                    {isSaving
                                      ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                                      : <CheckCircle className="w-3 h-3" />}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm truncate block" title={row.data[col]}>{row.data[col] ?? ''}</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Save button in last non-data column if tester/owner */}
                      {isTesterOrOwner && hasPendingChanges && (
                        <td className="px-2 py-1.5 bg-rose-50 min-w-24 text-center" />
                      )}

                      {/* Linked Tests */}
                      <td className="px-3 py-2 bg-inherit min-w-24">
                        {(() => {
                          const count = linkedTestCounts[row.rowId] ?? 0;
                          return count > 0 ? (
                            <Link
                              to={`/projects/${id}/test-cases?defectRowId=${row.rowId}`}
                              className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-0.5 rounded-full transition-colors"
                              title={`${count} test case${count !== 1 ? 's' : ''} linked to this defect`}
                            >
                              <FlaskConical className="w-3 h-3" /> {count} test{count !== 1 ? 's' : ''}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          );
                        })()}
                      </td>

                      {/* Row expand button */}
                      <td className="px-3 py-2 bg-inherit">
                        <button
                          onClick={() => setExpandedRow(row)}
                          className="text-gray-400 hover:text-rose-600 transition-colors"
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
              Showing <strong>{startIdx}–{endIdx}</strong> of <strong>{filteredRows.length}</strong> defects
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
                    className={`w-8 h-8 text-xs rounded font-medium transition-colors ${item === clampedPage ? 'bg-rose-600 text-white' : 'hover:bg-gray-200 text-gray-600'}`}
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

      {/* Delete confirmation modal */}
      {deleteConfirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2 shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-800">Delete Defect?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Are you sure you want to delete defect <strong>{deleteConfirmRow.defectId}</strong>?
                  This will also unlink it from any test cases. This action cannot be undone.
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
                <div className="bg-rose-100 rounded-lg p-1.5">
                  <Bug className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{expandedRow.defectId}</p>
                  {expandedRow.summary && <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{expandedRow.summary}</p>}
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
