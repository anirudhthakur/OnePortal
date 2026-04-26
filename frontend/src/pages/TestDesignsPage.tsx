import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, Eye, Trash2, CheckCircle, AlertCircle, CloudUpload, Inbox } from 'lucide-react';
import { uploadExcel, getAllSheets, deleteSheet } from '../api/excelApi';
import type { SheetSummary } from '../types/testDesign';
import SkeletonCard from '../components/SkeletonCard';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TestDesignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SheetSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sheets'],
    queryFn: () => getAllSheets(0, 50),
  });

  const uploadMutation = useMutation({
    mutationFn: () => uploadExcel(selectedFile!),
    onSuccess: (res) => {
      setSuccessMsg(`Successfully imported ${res.totalRows} rows with ${res.columns.length} columns`);
      setErrorMsg(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['sheets'] });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Upload failed');
      setSuccessMsg(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSheet(id),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['sheets'] });
    },
  });

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMsg('Only .xlsx files are supported');
      return;
    }
    setSelectedFile(file);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const sheets = data?.content ?? [];

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <FileSpreadsheet className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-800">Test Designs</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Upload panel */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-blue-500" />
              Upload Excel File
            </h2>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2 text-green-600 font-medium text-sm">
                  <CheckCircle className="w-4 h-4" />
                  {selectedFile.name}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 font-medium">Drag & drop your .xlsx file here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {/* Feedback banners */}
            {successMsg && (
              <div className="mt-4 flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            <button
              className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              disabled={!selectedFile || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              {uploadMutation.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload & Import
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sheets grid */}
        <div className="xl:col-span-2">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Previously Uploaded Sheets</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : sheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 py-16 text-gray-400">
              <Inbox className="w-12 h-12 mb-3" />
              <p className="font-medium">No test designs uploaded yet</p>
              <p className="text-sm mt-1">Upload an Excel file to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sheets.map((sheet) => (
                <div
                  key={sheet.sheetId}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-green-100 rounded-lg p-2 shrink-0">
                      <FileSpreadsheet className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate" title={sheet.fileName}>
                        {sheet.fileName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Sheet: <span className="font-medium text-gray-700">{sheet.sheetName}</span></p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                          {sheet.totalRows} rows
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(sheet.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => navigate(`/test-designs/${sheet.sheetId}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" /> View
                    </button>
                    <button
                      onClick={() => setDeleteTarget(sheet)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete Sheet?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.fileName}</strong>?
              This will remove all {deleteTarget.totalRows} rows permanently.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.sheetId)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
