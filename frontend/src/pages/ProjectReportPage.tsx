import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { getProjectReportSummary, saveReportHighlights } from '../api/reportApi';
import type { ProjectReportSummary } from '../api/reportApi';
import {
  ArrowLeft, Settings, X, CheckSquare, Square,
  TrendingUp, Bug, BarChart2, Activity, AlertTriangle, RefreshCw, Download,
} from 'lucide-react';

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Passed: '#22c55e', passed: '#22c55e', PASSED: '#22c55e',
  Failed: '#ef4444', failed: '#ef4444', FAILED: '#ef4444',
  Blocked: '#f97316', blocked: '#f97316', BLOCKED: '#f97316',
  'In Progress': '#eab308', in_progress: '#eab308', IN_PROGRESS: '#eab308',
  'Not Started': '#9ca3af', not_started: '#9ca3af', NOT_STARTED: '#9ca3af',
  'N/A': '#d1d5db', not_applicable: '#d1d5db', NOT_APPLICABLE: '#d1d5db',
  'Not Delivered': '#374151', not_delivered: '#374151', NOT_DELIVERED: '#374151',
};

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const DEFECT_STATUS_COLORS: Record<string, string> = {
  Open: '#ef4444', open: '#ef4444', OPEN: '#ef4444',
  Closed: '#3b82f6', closed: '#3b82f6', CLOSED: '#3b82f6',
  Resolved: '#22c55e', resolved: '#22c55e', RESOLVED: '#22c55e',
  Fixed: '#22c55e', fixed: '#22c55e', FIXED: '#22c55e',
  'In Progress': '#eab308', 'in progress': '#eab308',
  Reopened: '#f97316', reopened: '#f97316', REOPENED: '#f97316',
};

const DEFECT_SEVERITY_COLORS: Record<string, string> = {
  Critical: '#7f1d1d', critical: '#7f1d1d', CRITICAL: '#7f1d1d',
  High: '#b91c1c', high: '#b91c1c', HIGH: '#b91c1c',
  Major: '#dc2626', major: '#dc2626', MAJOR: '#dc2626',
  Medium: '#f97316', medium: '#f97316', MEDIUM: '#f97316',
  Minor: '#fde68a', minor: '#fde68a', MINOR: '#fde68a',
  Low: '#fef9c3', low: '#fef9c3', LOW: '#fef9c3',
};

/** Renders percentage labels just outside each pie slice, staying within the SVG bounds */
const RADIAN = Math.PI / 180;
const renderPieOutsideLabel = ({
  cx, cy, midAngle, outerRadius, percent,
}: { cx: number; cy: number; midAngle: number; outerRadius: number; percent: number }) => {
  if (percent < 0.03) return null; // skip slivers < 3%
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#374151" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight={500}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

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

/** Height of the Recharts area inside each widget (px) */
const CHART_H = 220;
/** Height of a widget header bar (px) */
const HEADER_H = 38;

/** Virtual column that shows the blocked-test-case count per defect */
const IMPACTED_COL = 'Impacted Scenarios';

// ─── component ───────────────────────────────────────────────────────────────

export default function ProjectReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const id = Number(projectId);

  const [trendDays, setTrendDays] = useState(14);
  const [isExporting, setIsExporting] = useState(false);
  const [enabledSections, setEnabledSections] = useState<Record<SectionId, boolean>>({
    highlights: true, summary: true, executionPie: true, dailyTrend: true,
    defectByStatus: true, defectBySeverity: true, channelExecution: true,
    detectedVsResolved: true, defectTable: true,
  });
  const [selectedDefectColumns, setSelectedDefectColumns] = useState<string[]>([]);
  const [selectedDefectIds, setSelectedDefectIds] = useState<Set<string> | null>(null);
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [defectColWidths, setDefectColWidths] = useState<Record<string, number>>({});
  const defectResizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  // contenteditable is the DOM source of truth — no React state needed
  const highlightsRef = useRef<string>('');
  const highlightsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightsEditorRef = useRef<HTMLDivElement>(null);
  const highlightsSeeded = useRef(false);

  // Column resize for defect table
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!defectResizeRef.current) return;
      const { col, startX, startWidth } = defectResizeRef.current;
      const newWidth = Math.max(60, startWidth + (e.clientX - startX));
      setDefectColWidths(prev => ({ ...prev, [col]: newWidth }));
    };
    const onMouseUp = () => { defectResizeRef.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const saveHighlights = (val: string) => {
    highlightsRef.current = val;
    // Debounce: save to backend 1 s after the user stops typing
    if (highlightsSaveTimer.current) clearTimeout(highlightsSaveTimer.current);
    highlightsSaveTimer.current = setTimeout(() => {
      saveReportHighlights(id, val).catch(() => {/* silent */});
    }, 1000);
  };

  const applyFormat = (cmd: string) => {
    highlightsEditorRef.current?.focus();
    document.execCommand(cmd, false);
    if (highlightsEditorRef.current) {
      saveHighlights(highlightsEditorRef.current.innerHTML);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery<ProjectReportSummary>({
    queryKey: ['projectReport', id, trendDays],
    queryFn: () => getProjectReportSummary(id, trendDays),
    enabled: !!id,
  });

  // Seed highlights from backend when report data first loads.
  // Uses a ref flag so we never overwrite content the user has already typed,
  // and we never call setState (which would trigger a re-render that could
  // interfere with the just-set innerHTML).
  useEffect(() => {
    if (data && !highlightsSeeded.current) {
      highlightsSeeded.current = true;
      const val = data.highlights ?? '';
      highlightsRef.current = val;
      if (highlightsEditorRef.current) {
        highlightsEditorRef.current.innerHTML = val;
      }
    }
  }, [data]);

  useEffect(() => {
    if (data && selectedDefectIds === null) {
      setSelectedDefectIds(new Set(
        data.defects
          .filter(d => d.status?.toLowerCase() === 'open')
          .map(d => d.defectId)
      ));
    }
  }, [data]);

  const defectColsToShow = useMemo(() => {
    if (!data) return [];
    // If user has explicitly chosen columns, respect that order exactly
    if (selectedDefectColumns.length > 0) return selectedDefectColumns;
    // Default: first 6 data columns, then Impacted Scenarios at the end
    return [...data.defectColumns.slice(0, 6), IMPACTED_COL];
  }, [data, selectedDefectColumns]);

  const defectsToShow = useMemo(() => {
    if (!data) return [];
    let rows = selectedDefectIds
      ? data.defects.filter(d => selectedDefectIds.has(d.defectId))
      : data.defects;
    if (sortConfig) {
      rows = [...rows].sort((a, b) => {
        if (sortConfig.col === IMPACTED_COL) {
          const diff = a.impactedScenarios - b.impactedScenarios;
          return sortConfig.dir === 'asc' ? diff : -diff;
        }
        const av = a.allData[sortConfig.col] ?? '';
        const bv = b.allData[sortConfig.col] ?? '';
        return sortConfig.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return rows;
  }, [data, selectedDefectIds, sortConfig]);

  const toggleSection = (s: SectionId) =>
    setEnabledSections(prev => ({ ...prev, [s]: !prev[s] }));

  const toggleDefectCol = (col: string) =>
    setSelectedDefectColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);

  const exportToPdf = async () => {
    const paper = document.getElementById('report-paper');
    if (!paper) return;
    setIsExporting(true);

    // Make all chart SVGs overflow-visible so outside-slice pie labels are captured
    const svgEls = Array.from(paper.querySelectorAll<SVGSVGElement>('svg'));
    const prevSvgOverflows = svgEls.map(svg => svg.style.overflow);
    svgEls.forEach(svg => { svg.style.overflow = 'visible'; });

    // Also un-clip every container div/section so pie labels aren't cut by parent overflow:hidden
    const allEls = Array.from(paper.querySelectorAll<HTMLElement>('*'));
    const clippedEls: HTMLElement[] = [];
    const prevClippedOverflows: string[] = [];
    allEls.forEach(el => {
      const computed = window.getComputedStyle(el).overflow;
      if (computed === 'hidden' || computed === 'clip') {
        clippedEls.push(el);
        prevClippedOverflows.push(el.style.overflow);
        el.style.overflow = 'visible';
      }
    });

    try {
      // Wait one frame for DOM reflow
      await new Promise(r => requestAnimationFrame(r));

      const SCALE = 2;
      const paperRect = paper.getBoundingClientRect();

      // Collect each section's top/bottom in canvas pixels (relative to paper top)
      // Sections are direct children of the .space-y-4 body div
      const bodyDiv = paper.querySelector<HTMLElement>('.space-y-4');
      const sectionRanges: { top: number; bottom: number }[] = [];
      if (bodyDiv) {
        Array.from(bodyDiv.children as HTMLCollectionOf<HTMLElement>).forEach(el => {
          const r = el.getBoundingClientRect();
          sectionRanges.push({
            top:    (r.top    - paperRect.top) * SCALE,
            bottom: (r.bottom - paperRect.top) * SCALE,
          });
        });
      }

      // Also add every defect table row as a break-avoidance unit so page
      // breaks never slice through the middle of a row
      paper.querySelectorAll<HTMLElement>('table tbody tr').forEach(tr => {
        const r = tr.getBoundingClientRect();
        sectionRanges.push({
          top:    (r.top    - paperRect.top) * SCALE,
          bottom: (r.bottom - paperRect.top) * SCALE,
        });
      });
      // Sort all ranges by top so the find() scan is stable
      sectionRanges.sort((a, b) => a.top - b.top);

      const canvas = await html2canvas(paper, {
        scale: SCALE,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW   = pdf.internal.pageSize.getWidth();
      const pageH   = pdf.internal.pageSize.getHeight();
      const pxPerPt = canvas.width / pageW;
      const pageHpx = pageH * pxPerPt;
      const imgH    = canvas.height;

      // Build page slices, pushing page breaks to just before any section that
      // would otherwise be cut in half
      const pages: { start: number; end: number }[] = [];
      let pos = 0;

      while (pos < imgH) {
        const idealEnd = Math.min(pos + pageHpx, imgH);

        let pageEnd = idealEnd;

        if (idealEnd < imgH) {
          // Find the first range (section OR table row) whose top is inside
          // this page but whose bottom would overflow — move the cut to just
          // before that element starts.
          const wouldBeCut = sectionRanges.find(
            s => s.top > pos && s.top < idealEnd && s.bottom > idealEnd
          );
          if (wouldBeCut && wouldBeCut.top - pos > pageHpx * 0.05) {
            // Only move the cut if there is at least 5% of a page above the
            // element — avoids infinite loops for elements taller than a page
            pageEnd = wouldBeCut.top;
          }
        }

        pages.push({ start: pos, end: pageEnd });
        pos = pageEnd;
      }

      // Render each page slice into the PDF
      pages.forEach(({ start, end }, idx) => {
        if (idx > 0) pdf.addPage();
        const sliceH = end - start;
        const slice = document.createElement('canvas');
        slice.width  = canvas.width;
        slice.height = Math.ceil(sliceH);
        const ctx = slice.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, start, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, sliceH / pxPerPt);
      });

      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`${data?.projectName ?? 'report'}-${dateStr}.pdf`);
    } finally {
      svgEls.forEach((svg, i) => { svg.style.overflow = prevSvgOverflows[i]; });
      clippedEls.forEach((el, i) => { el.style.overflow = prevClippedOverflows[i]; });
      setIsExporting(false);
    }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-300 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Generating report…</div>
    </div>
  );

  if (isError || !data) return (
    <div className="min-h-screen bg-slate-300 flex items-center justify-center">
      <div className="text-red-500 text-sm">Failed to load report data.</div>
    </div>
  );

  const {
    executionSummary: exec, executionByStatus, dailyTrend,
    defectByStatus, defectBySeverity, channelExecution, detectedVsResolved, defects,
  } = data;

  // How many charts are enabled in each paired row
  const execRowCount  = [enabledSections.executionPie,  enabledSections.dailyTrend       ].filter(Boolean).length;
  const defectRowCount = [enabledSections.defectByStatus, enabledSections.defectBySeverity].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-300 print:bg-white">

      {/* ── Toolbar ── */}
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
          <label className="text-gray-500 text-xs">Days:</label>
          <select value={trendDays} onChange={e => setTrendDays(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none">
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
          </select>
          <button onClick={() => { highlightsSeeded.current = false; setSelectedDefectIds(null); refetch(); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setShowConfig(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <Settings className="w-4 h-4" /> Configure
          </button>
          <button onClick={exportToPdf} disabled={isExporting}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed">
            <Download className="w-4 h-4" />
            {isExporting ? 'Generating PDF…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ── A4 Paper ── */}
      <div id="report-paper" className="w-[794px] mx-auto my-8 bg-white shadow-2xl print:shadow-none print:my-0 print:w-full">

        {/* Paper header */}
        <div className="px-10 pt-8 pb-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">{data.projectName} — Daily Status Report</h1>
          <p className="text-xs text-gray-500 mt-1">Generated: {data.generatedAt}</p>
        </div>

        {/* Paper body */}
        <div className="px-10 py-6 space-y-4 pb-10">

          {/* Highlights & Risks */}
          {enabledSections.highlights && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
              <div className="flex items-center justify-between border-b border-amber-200 px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{SECTION_LABELS.highlights}</span>
                </div>
                {/* Formatting toolbar */}
                <div className="flex items-center gap-1 print:hidden">
                  <button onMouseDown={e => { e.preventDefault(); applyFormat('bold'); }}
                    className="px-2 py-0.5 text-xs font-bold text-gray-600 hover:bg-amber-200 rounded transition-colors" title="Bold">B</button>
                  <button onMouseDown={e => { e.preventDefault(); applyFormat('italic'); }}
                    className="px-2 py-0.5 text-xs italic text-gray-600 hover:bg-amber-200 rounded transition-colors" title="Italic">I</button>
                  <button onMouseDown={e => { e.preventDefault(); applyFormat('underline'); }}
                    className="px-2 py-0.5 text-xs underline text-gray-600 hover:bg-amber-200 rounded transition-colors" title="Underline">U</button>
                  <div className="w-px h-3 bg-amber-300 mx-0.5" />
                  <button onMouseDown={e => { e.preventDefault(); applyFormat('insertUnorderedList'); }}
                    className="px-2 py-0.5 text-xs text-gray-600 hover:bg-amber-200 rounded transition-colors" title="Bullet list">• —</button>
                </div>
              </div>
              <div
                ref={highlightsEditorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  if (highlightsEditorRef.current) {
                    saveHighlights(highlightsEditorRef.current.innerHTML);
                  }
                }}
                data-placeholder="Type highlights, blockers, and risks here… (auto-saved)"
                className="w-full px-4 py-3 text-sm text-gray-700 bg-transparent focus:outline-none min-h-[80px] empty:before:content-[attr(data-placeholder)] empty:before:text-amber-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              />
            </div>
          )}

          {/* Execution Summary */}
          {enabledSections.summary && (
            <div className="border border-gray-200 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
              <WHeader icon={<Activity className="w-4 h-4 text-indigo-500" />} title={SECTION_LABELS.summary} />
              <div className="grid grid-cols-4 gap-3 p-4">
                <StatCard label="Total Tests"    value={exec.total}         color="text-gray-800" />
                <StatCard label="Passed"          value={exec.passed}        color="text-green-600" />
                <StatCard label="Failed"          value={exec.failed}        color="text-red-600" />
                <StatCard label="Blocked"         value={exec.blocked}       color="text-orange-500" />
                <StatCard label="Not Started"     value={exec.notStarted}    color="text-gray-400" />
                <StatCard label="In Progress"     value={exec.inProgress}    color="text-yellow-500" />
                <StatCard label="N/A"             value={exec.notApplicable} color="text-gray-300" />
                <StatCard label="Not Delivered"   value={exec.notDelivered}  color="text-gray-700" />
                <StatCard label="Total Defects"   value={exec.totalDefects}  color="text-gray-700" />
                <StatCard label="Open Defects"    value={exec.openDefects}   color="text-rose-600" />
              </div>
            </div>
          )}

          {/* Execution Pie + Daily Trend */}
          {execRowCount > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${execRowCount}, 1fr)`, gap: 12, pageBreakInside: 'avoid' }}>
              {enabledSections.executionPie && (
                <div className="border border-gray-200 rounded-lg">
                  <WHeader icon={<Activity className="w-4 h-4 text-green-500" />} title={SECTION_LABELS.executionPie} />
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 28, right: 28, bottom: 0, left: 28 }}>
                        <Pie data={executionByStatus} dataKey="count" nameKey="status"
                          cx="50%" cy="50%" outerRadius={65}
                          label={renderPieOutsideLabel} labelLine={false}>
                          {executionByStatus.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.status] ?? PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {enabledSections.dailyTrend && (
                <div className="border border-gray-200 rounded-lg">
                  <WHeader icon={<TrendingUp className="w-4 h-4 text-blue-500" />} title={SECTION_LABELS.dailyTrend} />
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyTrend} margin={{ top: 5, right: 15, left: -15, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend iconSize={10} verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
                        <Line type="monotone" dataKey="passed"       stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} name="Passed" />
                        <Line type="monotone" dataKey="failed"       stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} name="Failed" />
                        <Line type="monotone" dataKey="blocked"      stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} name="Blocked" />
                        <Line type="monotone" dataKey="notApplicable" stroke="#d1d5db" strokeWidth={2} dot={{ r: 2 }} name="N/A" />
                        <Line type="monotone" dataKey="notDelivered" stroke="#374151" strokeWidth={2} dot={{ r: 2 }} name="Not Delivered" />
                        <Line type="monotone" dataKey="executed"     stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 2" name="Executed" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Defect by Status + Defect by Severity */}
          {defectRowCount > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${defectRowCount}, 1fr)`, gap: 12, pageBreakInside: 'avoid' }}>
              {enabledSections.defectByStatus && (
                <div className="border border-gray-200 rounded-lg">
                  <WHeader icon={<Bug className="w-4 h-4 text-rose-500" />} title={SECTION_LABELS.defectByStatus} />
                  {defectByStatus.length === 0
                    ? <EmptyChart msg="No status column mapped. Select it when uploading defects." />
                    : (
                      <div style={{ height: CHART_H }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 28, right: 28, bottom: 0, left: 28 }}>
                            <Pie data={defectByStatus} dataKey="count" nameKey="status"
                              cx="50%" cy="50%" outerRadius={65}
                              label={renderPieOutsideLabel} labelLine={false}>
                              {defectByStatus.map((entry, i) => <Cell key={i} fill={DEFECT_STATUS_COLORS[entry.status] ?? PALETTE[i % PALETTE.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                </div>
              )}
              {enabledSections.defectBySeverity && (
                <div className="border border-gray-200 rounded-lg">
                  <WHeader icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title={SECTION_LABELS.defectBySeverity} />
                  {defectBySeverity.length === 0
                    ? <EmptyChart msg="No severity column mapped. Select it when uploading defects." />
                    : (
                      <div style={{ height: CHART_H }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={defectBySeverity} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="status" tick={{ fontSize: 10 }} width={70} />
                            <Tooltip />
                            <Bar dataKey="count" name="Defects" radius={[0, 4, 4, 0]}>
                              {defectBySeverity.map((entry, i) => <Cell key={i} fill={DEFECT_SEVERITY_COLORS[entry.status] ?? PALETTE[i % PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Channel-wise Execution */}
          {enabledSections.channelExecution && (
            <div className="border border-gray-200 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
              <WHeader icon={<BarChart2 className="w-4 h-4 text-purple-500" />} title={SECTION_LABELS.channelExecution} />
              {channelExecution.length === 0
                ? <EmptyChart msg="No channel column mapped. Select it when uploading test cases." />
                : (
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelExecution} margin={{ top: 5, right: 10, left: -15, bottom: 35 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="channel" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend iconSize={10} verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
                        <Bar dataKey="passed"        stackId="a" fill="#22c55e" name="Passed" />
                        <Bar dataKey="failed"        stackId="a" fill="#ef4444" name="Failed" />
                        <Bar dataKey="blocked"       stackId="a" fill="#f97316" name="Blocked" />
                        <Bar dataKey="inProgress"    stackId="a" fill="#eab308" name="In Progress" />
                        <Bar dataKey="notStarted"    stackId="a" fill="#9ca3af" name="Not Started" />
                        <Bar dataKey="notApplicable" stackId="a" fill="#d1d5db" name="N/A" />
                        <Bar dataKey="notDelivered"  stackId="a" fill="#374151" name="Not Delivered" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
            </div>
          )}

          {/* Detected vs Resolved */}
          {enabledSections.detectedVsResolved && (
            <div className="border border-gray-200 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
              <WHeader icon={<TrendingUp className="w-4 h-4 text-teal-500" />} title={SECTION_LABELS.detectedVsResolved} />
              {detectedVsResolved.length === 0
                ? <EmptyChart msg="No date columns mapped. Select Detected/Resolved Date when uploading defects." />
                : (
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={detectedVsResolved} margin={{ top: 5, right: 15, left: -15, bottom: 35 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend iconSize={10} verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
                        <Line type="monotone" dataKey="detected" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} name="Count of Detected Date" />
                        <Line type="monotone" dataKey="resolved" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} name="Count of Resolved Date" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
            </div>
          )}

          {/* Defect Table */}
          {enabledSections.defectTable && (
            <div className="border border-gray-200 rounded-lg" style={{ pageBreakInside: 'avoid' }}>
              <WHeader icon={<Bug className="w-4 h-4 text-gray-500" />} title={SECTION_LABELS.defectTable} />
              {defectsToShow.length === 0
                ? <div className="flex items-center justify-center h-16 text-xs text-gray-400">No defects found.</div>
                : (
                  <div className="overflow-auto print:overflow-visible">
                    <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {defectColsToShow.map(col => (
                            <th key={col}
                              onClick={() => setSortConfig(prev =>
                                prev?.col === col
                                  ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                                  : { col, dir: 'asc' }
                              )}
                              style={{ width: defectColWidths[col], minWidth: defectColWidths[col] ?? 80, position: 'relative' }}
                              className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100">
                              <span className="flex items-start gap-1 break-words" style={{ wordBreak: 'break-word' }}>
                                <span className="flex-1 leading-snug">{col}</span>
                                {sortConfig?.col === col
                                  ? <span className="shrink-0 mt-0.5">{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>
                                  : <span className="text-gray-300 shrink-0 mt-0.5">⇅</span>}
                              </span>
                              {/* resize handle */}
                              <span
                                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400 transition-colors z-20"
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const th = (e.target as HTMLElement).closest('th') as HTMLTableCellElement;
                                  defectResizeRef.current = {
                                    col,
                                    startX: e.clientX,
                                    startWidth: defectColWidths[col] ?? th.getBoundingClientRect().width,
                                  };
                                }}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {defectsToShow.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {defectColsToShow.map(col => (
                              <td key={col}
                                style={{ width: defectColWidths[col], maxWidth: defectColWidths[col] ?? undefined, wordBreak: 'break-word', overflowWrap: 'break-word' }}
                                className="border border-gray-100 px-2 py-1 text-gray-700">
                                {col === IMPACTED_COL
                                  ? String(row.impactedScenarios)
                                  : (row.allData[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* ── Configuration Sidebar ── */}
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
                  {/* Virtual column toggle — behaves like any other column */}
                  <button onClick={() => toggleDefectCol(IMPACTED_COL)}
                    className="w-full flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 mb-2">
                    {(selectedDefectColumns.length === 0 || selectedDefectColumns.includes(IMPACTED_COL))
                      ? <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      : <Square className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="truncate font-medium">{IMPACTED_COL}</span>
                    <span className="text-xs text-gray-400 ml-auto shrink-0">computed</span>
                  </button>
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

              {/* Defect Rows selection */}
              {data.defects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Defect Rows to Include</p>
                  <p className="text-xs text-gray-400 mb-2">
                    {selectedDefectIds?.size ?? 0} / {data.defects.length} selected
                  </p>
                  <div className="flex gap-1 mb-3 flex-wrap">
                    <button
                      onClick={() => setSelectedDefectIds(new Set(data.defects.map(d => d.defectId)))}
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedDefectIds(new Set(
                        data.defects.filter(d => d.status?.toLowerCase() === 'open').map(d => d.defectId)
                      ))}
                      className="px-2 py-1 text-xs border border-indigo-300 text-indigo-600 rounded hover:bg-indigo-50">
                      Open Only
                    </button>
                    <button
                      onClick={() => setSelectedDefectIds(new Set())}
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {data.defects.map(d => (
                      <label key={d.defectId} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedDefectIds?.has(d.defectId) ?? false}
                          onChange={() => setSelectedDefectIds(prev => {
                            const next = new Set(prev);
                            if (next.has(d.defectId)) next.delete(d.defectId);
                            else next.add(d.defectId);
                            return next;
                          })}
                          className="shrink-0"
                        />
                        <span className="font-medium text-gray-700 truncate">{d.defectId}</span>
                        {d.status && (
                          <span className="text-gray-400 shrink-0">— {d.status}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      `}</style>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function WHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white select-none"
      style={{ height: HEADER_H }}>
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
    <div className="flex items-center justify-center text-xs text-gray-400 p-4 text-center"
      style={{ height: CHART_H }}>
      {msg}
    </div>
  );
}
