'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { projectApi, type Project } from '@/utils/api';

interface ProjectSidebarProps {
  currentProjectId: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function ProjectSidebar({
  currentProjectId,
  isCollapsed,
  onToggle,
}: ProjectSidebarProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await projectApi.listProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || isCreating) return;

    try {
      setIsCreating(true);
      const newProject = await projectApi.createProject(newProjectName.trim());
      setProjects(prev => [newProject, ...prev]);
      setNewProjectName('');
      setShowNewProject(false);
      router.push(`/workspace/${newProject.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      await projectApi.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (projectId === currentProjectId && projects.length > 1) {
        const remaining = projects.filter(p => p.id !== projectId);
        router.push(`/workspace/${remaining[0].id}`);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <>
      {/* Collapsed Toggle Button */}
      {isCollapsed && (
        <button
          onClick={onToggle}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-white border border-l-0 border-[#E5E7EB] rounded-r-lg p-2 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full bg-white border-r border-[#E5E7EB] z-40 transition-all duration-300 flex flex-col ${
          isCollapsed ? '-translate-x-full' : 'translate-x-0'
        }`}
        style={{ width: '280px' }}
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5E7EB] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="font-semibold text-[#1A1A1A]">L-1 Builder</span>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 text-[#6B7280] hover:text-[#1A1A1A] hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* New Project Button */}
        <div className="p-3 border-b border-[#E5E7EB] flex-shrink-0">
          {showNewProject ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                placeholder="Project name..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[#1A1A1A] placeholder:text-gray-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProject}
                  disabled={isCreating || !newProjectName.trim()}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }}
                  className="px-3 py-1.5 text-[#6B7280] text-sm hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewProject(true)}
              className="w-full px-3 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          )}
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-[#6B7280] text-sm">
              No projects yet
            </div>
          ) : (
            <div className="space-y-1 px-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/workspace/${project.id}`)}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    project.id === currentProjectId
                      ? 'bg-blue-50 text-blue-600'
                      : 'hover:bg-gray-50 text-[#1A1A1A]'
                  }`}
                >
                  {/* Project Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    project.id === currentProjectId ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <svg className={`w-4 h-4 ${project.id === currentProjectId ? 'text-blue-600' : 'text-[#6B7280]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>

                  {/* Project Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{project.name}</div>
                    <div className="text-xs text-[#6B7280] truncate">
                      {project.beneficiaryName || 'No beneficiary'}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#6B7280] hover:text-red-500 hover:bg-red-50 rounded transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Active Indicator */}
                  {project.id === currentProjectId && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0"></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E7EB] flex-shrink-0">
          <div className="text-xs text-[#6B7280] text-center">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </div>
        </div>
      </aside>

      {/* Overlay when open on mobile */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
