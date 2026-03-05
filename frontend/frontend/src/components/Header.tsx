import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useProject } from '../context/ProjectContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { projectService, type Project } from '../services/projectService';
import type { LLMProvider, ProjectType } from '../types';
import { toLLMProvider } from '../types';

// LLM Provider options
const LLM_PROVIDERS: { id: LLMProvider; name: string }[] = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openai', name: 'OpenAI' },
];

const LogoIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 3v6a1 1 0 001 1h6"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function SettingsMenu({ llmProvider, setLlmProvider }: {
  llmProvider: LLMProvider;
  setLlmProvider: (p: LLMProvider) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
        }`}
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
          <div className="px-3 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">LLM Provider</div>
          {LLM_PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => { setLlmProvider(p.id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                llmProvider === p.id
                  ? 'text-slate-900 bg-slate-50 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                llmProvider === p.id ? 'bg-blue-500' : 'bg-transparent'
              }`} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { llmProvider, setLlmProvider, workMode, setWorkMode } = useApp();
  const { projectId, setProjectId, projectType, projectNumber } = useProject();
  const { t } = useTranslation();

  // Project switcher state
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProjectType>('EB-1A');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Load project list when dropdown opens
  const openDropdown = useCallback(async () => {
    const opening = !isOpen;
    setIsOpen(prev => !prev);
    if (opening) {
      setSearchQuery('');
      setIsCreating(false);
      setIsLoadingList(true);
      try {
        const list = await projectService.list();
        setProjects(list);
      } catch {
        setProjects([]);
      } finally {
        setIsLoadingList(false);
      }
    }
  }, [isOpen]);

  // Select a project
  const handleSelectProject = useCallback((id: string) => {
    setProjectId(id);
    setIsOpen(false);
  }, [setProjectId]);

  // Create a new project
  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await projectService.create(name, newType);
      setProjectId(created.id || name);
      setIsOpen(false);
      setNewName('');
      setNewType('EB-1A');
      setIsCreating(false);
    } catch {
      // silent — user can retry
    }
  }, [newName, newType, setProjectId]);

  // Filter projects by search
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const badgeColor = projectType === 'NIW'
    ? 'bg-emerald-100 text-emerald-700'
    : projectType === 'L-1A'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-blue-100 text-blue-700';

  return (
    <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between relative">
      {/* Left: Project switcher + language switcher */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-slate-900 text-white rounded-lg">
          <LogoIcon />
        </div>

        {/* Project switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={openDropdown}
            className="flex items-center gap-2 px-2 py-1 -mx-2 rounded-md hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-900">{projectId}</span>
            <svg
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${badgeColor}`}>{projectType}</span>
            {projectNumber && (
              <span className="text-xs text-slate-400">{projectNumber}</span>
            )}
          </button>

          {/* Dropdown panel */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('header.searchProjects', 'Search projects...')}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                    autoFocus
                  />
                </div>
              </div>

              {/* Project list */}
              <div className="max-h-48 overflow-y-auto">
                {isLoadingList ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">Loading...</div>
                ) : filteredProjects.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">
                    {searchQuery ? t('header.noMatchingProjects', 'No matching projects') : t('header.noProjects', 'No projects')}
                  </div>
                ) : (
                  filteredProjects.map(p => {
                    const isCurrent = p.id === projectId || p.name === projectId;
                    const pBadge = p.projectType === 'NIW'
                      ? 'bg-emerald-100 text-emerald-700'
                      : p.projectType === 'L-1A'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700';
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSelectProject(p.id || p.name)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                          isCurrent ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrent ? 'bg-blue-500' : 'bg-transparent'}`} />
                        <span className={`text-xs truncate flex-1 ${isCurrent ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                          {p.name || p.id}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${pBadge}`}>
                          {p.projectType || 'EB-1A'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* New project */}
              <div className="border-t border-slate-100">
                {!isCreating ? (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('header.newProject', 'New project')}
                  </button>
                ) : (
                  <div className="p-3 space-y-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder={t('header.projectName', 'Project name')}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="radio"
                          name="newProjectType"
                          value="EB-1A"
                          checked={newType === 'EB-1A'}
                          onChange={() => setNewType('EB-1A')}
                          className="accent-blue-500"
                        />
                        EB-1A
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="radio"
                          name="newProjectType"
                          value="NIW"
                          checked={newType === 'NIW'}
                          onChange={() => setNewType('NIW')}
                          className="accent-blue-500"
                        />
                        NIW
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="radio"
                          name="newProjectType"
                          value="L-1A"
                          checked={newType === 'L-1A'}
                          onChange={() => setNewType('L-1A')}
                          className="accent-blue-500"
                        />
                        L-1A
                      </label>
                      <div className="flex-1" />
                      <button
                        onClick={() => setIsCreating(false)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                      >
                        {t('common.cancel', 'Cancel')}
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={!newName.trim()}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('common.create', 'Create')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ml-2">
          <LanguageSwitcher />
        </div>
      </div>

      {/* Center: Work mode toggle (absolute center) */}
      <button
        onClick={() => setWorkMode(workMode === 'verify' ? 'write' : 'verify')}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          workMode === 'verify'
            ? 'text-white bg-blue-600 hover:bg-blue-700'
            : 'text-white bg-emerald-600 hover:bg-emerald-700'
        }`}
      >
        {workMode === 'verify' ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Verify Mode</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Write Mode</span>
          </>
        )}
      </button>

      {/* Right: Settings gear */}
      <SettingsMenu
        llmProvider={llmProvider}
        setLlmProvider={setLlmProvider}
      />
    </header>
  );
}
