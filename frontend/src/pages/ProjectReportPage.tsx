import { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getProjectReportSummary } from '../api/reportApi';
import type { ProjectReportSummary } from '../api/reportApi';
import {
  ArrowLeft, Printer, Settings, X, CheckSquare, Square,
  TrendingUp, Bug, BarChart2, Activity, AlertTriangle,
  RefreshCw,
} from 'lucide-react';

// --- react-grid-layout: use default import for Vite CJS interop ---
import ReactGridLayout, { WidthProvider, Responsive } from 'react-grid-layout/legacy';
import type { Layout, Layouts } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// ---------- constants ----------

const STATUS_COLORS: Record<string, string> = {
  'Passed': '#22c55e', 'passed': '#22c55e', 'PASSED': '#22c55e',
  'Failed': '#ef4444', 'failed': '#ef4444', 'FAILED': '#ef4444',
  'Blocked': '#f97316', 'blocked': '#f97316', 'BLOCKED': '#f97316',
  'In Progress': '#3b82f6', 'in_progress': '#3b82f6', 'IN_PROGRESS': '#3b82f6',
  'Not Started': '#9ca3af', 'not_started': '#9ca3af', 'NOT_STARTED': '#9ca3af',
};

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const SECTION_IDS = [
  'highlights', 'summary', 'executionPie', 'dailyTrend',
  'defectByStatus', 'defectBySeverity', 'channelExecution',
  'detectedVsResolved', 'defectTable',
] as const;
type SectionId = typeof SECTION_IDS[number];

const SECTION_LABELS: Record<SectionId, string> = {
  highlights: 'Highlights & Risks',
  summary: 'Execution Summary',
  executionPie: 'Execution Status',
  dailyTrend: 'Daily Execution Trend',
  defectByStatus: 'Defect Status Distribution',
  defectBySeverity: 'Defect by Severity',
  channelExecution: 'Channel-wise Execution',
  detectedVsResolved: 'Detected vs Resolved',
  defectTable: 'Defect List',
};

const DEFAULT_LAYOUTS: Layout[] = [
  { i: 'highlights',        x: 0, y: 0,  w: 12, h: 4  },
  { i: 'summary',           x: 0, y: 4,  w: 12, h: 4  },
  { i: 'executionPie',      x: 0, y: 8,  w: 6,  h: 8  },
  { i: 'dailyTrend',        x: 6, y: 8,  w: 6,  h: 8  },
  { i: 'defectByStatus',    x: 0, y: 16, w: 4,  h: 8  },
  { i: 'defectBySeverity',  x: 4, y: 16, w: 4,  h: 8  },
  { i: 'channelExecution',  x: 8, y: 16, w: 4,  h: 8  },
  { i: 'detectedVsResolved',x: 0, y: 24, w: 12, h: 8  },
  { i: 'defectTable',       x: 0, y: 32, w: 12, h: 12 },
];

const STORAGE_KEY = (pid: number) => `report_layout_${pid}`;
const HIGHLIGHTS_KEY = (pid: number) => `report_highlights_${pid}`;

function loadLayouts(pid: number): Layout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(pid));
    if (raw) return JSON.parse(raw) as Layout[];
  } catch { /* ignore */ }
  return DEFAULT_LAYOUTS;
}

// ---------- component ----------

export default function ProjectReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const id = Number(projectId);

  const [trendDays, setTrendDays] = useState(14);
  const [enabledSections, setEnabledSections] = useState<Record<SectionId, boolean>>({
    highlights: true, summary: true, executionPie: true, dailyTrend: true,
    defectByStatus: true, defectBySeverity: true, channelExecution: true,
    detectedVsResolved: true, defectTable: true,
  });
  const [selectedDefectColumns, setSelectedDefectColumns] = useState<string[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>(() => loadLayouts(id));
  const [showConfig, setShowConfig] = useState(false);
  const [highlights, setHighlights] = useState<string>(() => {
    try { return localStorage.getItem(HIGHLIGHTS_KEY(id)) ?? ''; } catch { return ''; }
  });
  const highlightsRef = useRef(highlights);

  const saveHighlights = (val: string) => {
    highlightsRef.current = val;
    setHighlights(val);
    try { localStorage.setItem(HIGHLIGHTS_KEY(id), val); } catch { /* ignore */ }
  };

  const { data, isLoading, isError, refetch } = useQuery<ProjectReportSummary>({
    queryKey: ['projectReport', id, trendDays],
    queryFn: () => getProjectReportSummary(id, trendDays),
    enabled: !!id,
  });

  const defectColsToShow = useMemo(() => {
    if (!data) return [];
    if (selectedDefectColumns.length > 0) return selectedDefectColumns;
    return data.defectColumns.slice(0, 6);
  }, [data, selectedDefectColumns]);

  const handleLayoutChange = useCallback((_: Layout[], allLayouts: Layouts) => {
    const lg = allLayouts['lg'] ?? allLayouts[Object.keys(allLayouts)[0]];
    if (lg) {
      setLayouts(lg);
      try { localStorage.setItem(STORAGE_KEY(id), JSON.stringify(lg)); } catch { /* ignore */ }
    }
  }, [id]);

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS);
    try { localStorage.setItem(STORAGE_KEY(id), JSON.stringify(DEFAULT_LAYOUTS)); } catch { /* ignore */ }
  };

  const toggleSection = (s: SectionId) =>
    setEnabledSections(prev => ({ ...prev, [s]: !prev[s] }));

  const toggleDefectCol = (col: string) =>
    setSelectedDefectColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Generating report…</div>
    </div>
  );

  if (isError || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-red-500 text-sm">Failed to load report data.</div>
    </div>
  );

  const { executionSummary: exec, executionByStatus, dailyTrend,
    defectByStatus, defectBySeverity, channelExecution, detectedVsResolved, defects } = data;

  const activeLayouts = layouts.filter(l => enabledSections[l.i as SectionId]);

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-800">{data.projectName} — Daily Report</h1>
            <p className="text-xs text-gray-400">Generated: {data.generatedAt}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500 text-xs">Days:</label>
            <select value={trendDays} onChange={e => setTrendDays(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none">
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setShowConfig(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <Settings className="w-4 h-4" /> Configure
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900">
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{data.projectName} — Daily Status Report</h1>
        <p className="text-sm text-gray-500 mt-1">Generated: {data.generatedAt}</p>
        <hr className="mt-4 border-gray-300" />
      </div>

      {/* Drag-and-resize grid */}
      <div className="px-4 py-4 print:px-8">
        <p className="print:hidden text-xs text-gray-400 mb-2 text-right">Drag widget headers to reorder · Drag bottom-right corner to resize</p>
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: activeLayouts }}
          breakpoints={{ lg: 1200, md: 800, sm: 500, xs: 300 }}
          cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
          rowHeight={50}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          isDraggable
          isResizable
        >
          {/* Highlights & Risks */}
          {enabledSections.highlights && (
            <div key="highlights" className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title={SECTION_LABELS.highlights} />
              <textarea
                value={highlights}
                onChange={e => saveHighlights(e.target.value)}
                placeholder="Type highlights, blockers, and risks here… (auto-saved)"
                className="flex-1 p-4 text-sm text-gray-700 bg-transparent resize-none focus:outline-none placeholder:text-amber-400"
              />
            </div>
          )}

          {/* Execution Summary */}
          {enabledSections.summary && (
            <div key="summary" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<Activity className="w-4 h-4 text-indigo-500" />} title={SECTION_LABELS.summary} />
              <div className="p-4 grid grid-cols-4 gap-3 flex-1 content-start">
                <StatCard label="Total Tests" value={exec.total} color="text-gray-800" />
                <StatCard label="Passed" value={exec.passed} color="text-green-600" />
                <StatCard label="Failed" value={exec.failed} color="text-red-600" />
                <StatCard label="Blocked" value={exec.blocked} color="text-orange-500" />
                <StatCard label="Not Started" value={exec.notStarted} color="text-gray-400" />
                <StatCard label="In Progress" value={exec.inProgress} color="text-blue-500" />
                <StatCard label="Total Defects" value={exec.totalDefects} color="text-gray-700" />
                <StatCard label="Open Defects" value={exec.openDefects} color="text-rose-600" />
              </div>
            </div>
          )}

          {/* Execution Pie */}
          {enabledSections.executionPie && (
            <div key="executionPie" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<Activity className="w-4 h-4 text-green-500" />} title={SECTION_LABELS.executionPie} />
              <div className="flex-1 min-h-0 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={executionByStatus} dataKey="count" nameKey="status"
                      cx="50%" cy="50%" outerRadius="65%"
                      label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {executionByStatus.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.status] ?? PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Daily Trend */}
          {enabledSections.dailyTrend && (
            <div key="dailyTrend" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<TrendingUp className="w-4 h-4 text-blue-500" />} title={SECTION_LABELS.dailyTrend} />
              <div className="flex-1 min-h-0 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="passed" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Passed" />
                    <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Failed" />
                    <Line type="monotone" dataKey="blocked" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Blocked" />
                    <Line type="monotone" dataKey="executed" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="Executed" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Defect by Status */}
          {enabledSections.defectByStatus && (
            <div key="defectByStatus" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<Bug className="w-4 h-4 text-rose-500" />} title={SECTION_LABELS.defectByStatus} />
              {defectByStatus.length === 0 ? (
                <EmptyChart msg="No status column mapped. Select it when uploading defects." />
              ) : (
                <div className="flex-1 min-h-0 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={defectByStatus} dataKey="count" nameKey="status"
                        cx="50%" cy="50%" outerRadius="65%"
                        label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {defectByStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Defect by Severity */}
          {enabledSections.defectBySeverity && (
            <div key="defectBySeverity" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title={SECTION_LABELS.defectBySeverity} />
              {defectBySeverity.length === 0 ? (
                <EmptyChart msg="No severity column mapped. Select it when uploading defects." />
              ) : (
                <div className="flex-1 min-h-0 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={defectBySeverity} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" name="Defects" radius={[0, 4, 4, 0]}>
                        {defectBySeverity.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Channel Execution */}
          {enabledSections.channelExecution && (
            <div key="channelExecution" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<BarChart2 className="w-4 h-4 text-purple-500" />} title={SECTION_LABELS.channelExecution} />
              {channelExecution.length === 0 ? (
                <EmptyChart msg="No channel column mapped. Select it when uploading test cases." />
              ) : (
                <div className="flex-1 min-h-0 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelExecution} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="channel" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip /><Legend />
                      <Bar dataKey="passed" stackId="a" fill="#22c55e" name="Passed" />
                      <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                      <Bar dataKey="blocked" stackId="a" fill="#f97316" name="Blocked" />
                      <Bar dataKey="inProgress" stackId="a" fill="#3b82f6" name="In Progress" />
                      <Bar dataKey="notStarted" stackId="a" fill="#9ca3af" name="Not Started" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Detected vs Resolved — line chart matching reference */}
          {enabledSections.detectedVsResolved && (
            <div key="detectedVsResolved" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<TrendingUp className="w-4 h-4 text-teal-500" />} title={SECTION_LABELS.detectedVsResolved} />
              {detectedVsResolved.length === 0 ? (
                <EmptyChart msg="No date columns mapped. Select Detected/Resolved Date when uploading defects." />
              ) : (
                <div className="flex-1 min-h-0 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={detectedVsResolved} margin={{ top: 5, right: 20, left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="detected" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Count of Detected Date" />
                      <Line type="monotone" dataKey="resolved" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Count of Resolved Date" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Defect Table */}
          {enabledSections.defectTable && (
            <div key="defectTable" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <WidgetHeader icon={<Bug className="w-4 h-4 text-gray-500" />} title={SECTION_LABELS.defectTable} />
              {defects.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-xs text-gray-400">No defects found.</div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {defectColsToShow.map(col => (
                          <th key={col} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {defects.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          {defectColsToShow.map(col => (
                            <td key={col} className="border border-gray-100 px-3 py-1.5 text-gray-700">{row.allData[col] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ResponsiveGridLayout>
      </div>

      {/* Configuration sidebar */}
      {showConfig && (
        <div className="print:hidden fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowConfig(false)} />
          <div className="relative bg-white w-80 h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configure Report
              </h2>
              <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sections</p>
                <div className="space-y-2">
                  {SECTION_IDS.map(s => (
                    <button key={s} onClick={() => toggleSection(s)}
                      className="w-full flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
                      {enabledSections[s]
                        ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                        : <Square className="w-4 h-4 text-gray-400" />}
                      {SECTION_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {data.defectColumns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Defect Columns to Display</p>
                  <p className="text-xs text-gray-400 mb-3">None selected = first 6 columns</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {data.defectColumns.map(col => (
                      <button key={col} onClick={() => toggleDefectCol(col)}
                        className="w-full flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
                        {selectedDefectColumns.includes(col)
                          ? <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          : <Square className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className="truncate">{col}</span>
                      </button>
                    ))}
                  </div>
                  {selectedDefectColumns.length > 0 && (
                    <button onClick={() => setSelectedDefectColumns([])}
                      className="mt-2 text-xs text-indigo-600 hover:underline">
                      Reset to default (first 6)
                    </button>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Layout</p>
                <button onClick={resetLayout}
                  className="w-full py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Reset to default layout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .react-resizable-handle { display: none !important; }
          .react-grid-item { position: static !important; transform: none !important; width: 100% !important; page-break-inside: avoid; margin-bottom: 1.5rem; }
          .react-grid-layout { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function WidgetHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="drag-handle flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 cursor-grab active:cursor-grabbing select-none bg-white">
      {icon}
      <span className="text-sm font-semibold text-gray-700">{title}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-lg p-3 text-center">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

function EmptyChart({ msg }: { msg: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-4 text-center">
      {msg}
    </div>
  );
}
