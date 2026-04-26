import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, Download, Trash2, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, ChevronRight as Breadcrumb } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getSheetData, deleteSheet } from '../api/excelApi';

const PAGE_SIZE = 25;

type SortDir = 'asc' | 'desc' | null;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SheetDetailPage() {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sheetData', sheetId],
    queryFn: () => getSheetData(Number(sheetId)),
    enabled: !!sheetId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSheet(Number(sheetId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets'] });
      navigate('/test-designs');
    },
  });

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    let rows = q
      ? data.rows.filter((row) =>
          Object.values(row).some((v) => v.toLowerCase().includes(q))
        )
      : [...data.rows];

    if (sortCol && sortDir) {
      rows.sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, sortCol, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const startIdx = page * PAGE_SIZE + 1;
  const endIdx = Math.min((page + 1) * PAGE_SIZE, filteredRows.length);

  const handleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir(null); }
    setPage(0);
  };

  const handleSearch = (v: string) => { setSearch(v); setPage(0); };

  const exportToExcel = () => {
    if (!data) return;
    const wsData = [data.columns, ...filteredRows.map((r) => data.columns.map((c) => r[c] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data.sheetName);
    XLSX.writeFile(wb, `${data.fileName.replace('.xlsx', '')}_export.xlsx`);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    if (sortDir === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-500" />;
    return <ArrowDown className="w-3.5 h-3.5 text-blue-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-3">
        <AlertCircle className="w-10 h-10" />
        <p className="font-medium">Failed to load sheet data</p>
        <button onClick={() => navigate('/test-designs')} className="text-sm text-blue-600 underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/test-designs" className="hover:text-blue-600 transition-colors">Test Designs</Link>
        <Breadcrumb className="w-3.5 h-3.5" />
        <span className="text-gray-800 font-medium truncate max-w-xs">{data.fileName}</span>
      </div>

      {/* Metadata bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Sheet</p>
          <p className="font-semibold text-gray-800">{data.sheetName}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Rows</p>
          <p className="font-semibold text-gray-800">{data.rows.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Columns</p>
          <p className="font-semibold text-gray-800">{data.columns.length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search across all columns..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" /> Export to Excel
        </button>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="flex items-center gap-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete Sheet
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-100 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                {data.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-gray-200 transition-colors select-none"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col}
                      <SortIcon col={col} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={data.columns.length + 1} className="text-center py-16 text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No rows match your search
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                    }`}
                  >
                    <td className="sticky left-0 z-10 px-4 py-2.5 text-gray-400 font-mono text-xs bg-inherit border-r border-gray-100">
                      {startIdx + i}
                    </td>
                    {data.columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 text-gray-700 whitespace-nowrap max-w-xs truncate" title={row[col]}>
                        {row[col] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i : i === 0 ? 0 : i === 6 ? totalPages - 1 : page - 2 + i;
                const bounded = Math.max(0, Math.min(totalPages - 1, pg));
                return (
                  <button
                    key={i}
                    onClick={() => setPage(bounded)}
                    className={`w-8 h-8 text-xs rounded font-medium transition-colors ${
                      bounded === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {bounded + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete Sheet?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete <strong>{data.fileName}</strong> and all {data.rows.length} rows.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
