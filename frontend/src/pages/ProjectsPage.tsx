import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Users, ChevronRight, Trash2, AlertCircle, X, Upload, FileSpreadsheet } from 'lucide-react';
import { getAllProjects, createProject, deleteProject } from '../api/projectApi';
import { uploadExcel } from '../api/excelApi';
import { useCurrentUser } from '../context/UserContext';
import type { Project } from '../types/project';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: getAllProjects,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('No user selected');
      const project = await createProject(currentUser.id, { name, description });
      if (excelFile) {
        await uploadExcel(excelFile, currentUser.id, project.id);
      }
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      setName(''); setDescription(''); setExcelFile(null); setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message || 'Failed to create project'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!currentUser) throw new Error('No user selected');
      return deleteProject(deleteTarget!.id, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => alert(err.message || 'Failed to delete project — make sure you are the project OWNER'),
  });

  const handleCreate = () => {
    if (!name.trim()) { setFormError('Project name is required'); return; }
    if (!currentUser) { setFormError('Please select your user in the top-right before creating a project'); return; }
    setFormError(null);
    createMutation.mutate();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.toLowerCase().endsWith('.xlsx')) {
        setFormError('Only .xlsx files are supported');
        return;
      }
      setExcelFile(f);
      setFormError(null);
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-800">Projects</h1>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {!currentUser && (
        <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
          <span>Select your user in the top-right to enable project actions (create, delete).</span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-36" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
          <AlertCircle className="w-10 h-10" />
          <p className="font-medium">Failed to load projects</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 py-20 text-gray-400">
          <FolderKanban className="w-12 h-12 mb-3 opacity-50" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">Create a project to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="bg-indigo-100 rounded-lg p-2 shrink-0">
                  <FolderKanban className="w-5 h-5 text-indigo-600" />
                </div>
                <button onClick={() => setDeleteTarget(project)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete project">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-gray-800 text-base mb-1 truncate" title={project.name}>{project.name}</h3>
              {project.description && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.description}</p>}
              <div className="mt-auto flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  <span>{project.memberCount} member{project.memberCount !== 1 ? 's' : ''}</span>
                  <span className="mx-1">·</span>
                  <span>{formatDate(project.createdAt)}</span>
                </div>
                <button onClick={() => navigate(`/projects/${project.id}`)}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                  Open <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800">New Project</h3>
              <button onClick={() => { setShowCreateModal(false); setFormError(null); setExcelFile(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Payment Gateway QA"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Optional description..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {/* Excel Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Design File <span className="text-gray-400 font-normal">(optional, .xlsx)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {excelFile ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm text-green-800 flex-1 truncate">{excelFile.name}</span>
                    <button onClick={() => { setExcelFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg px-3 py-3 text-sm text-gray-500 hover:text-indigo-600 transition-colors">
                    <Upload className="w-4 h-4" />
                    Click to upload Excel file
                  </button>
                )}
                <p className="text-xs text-gray-400 mt-1">Rows from the Excel will become the project's test design.</p>
              </div>

              {/* Current user display */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">Creating as</p>
                {currentUser ? (
                  <p className="text-sm font-medium text-gray-800">{currentUser.username}
                    <span className="ml-2 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{currentUser.role}</span>
                  </p>
                ) : (
                  <p className="text-sm text-amber-600">No user selected — use the top-right to pick your user first.</p>
                )}
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{formError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setFormError(null); setExcelFile(null); }} className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {createMutation.isPending ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete <strong>{deleteTarget.name}</strong> and remove all members.
            </p>
            <div className="mb-4 bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Deleting as</p>
              {currentUser ? (
                <p className="text-sm font-medium text-gray-800">{currentUser.username}
                  <span className="ml-2 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{currentUser.role}</span>
                </p>
              ) : (
                <p className="text-sm text-amber-600">No user selected — you must be the OWNER to delete.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending || !currentUser}
                className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
