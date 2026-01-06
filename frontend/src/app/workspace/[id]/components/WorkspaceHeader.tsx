'use client';

import { useRouter } from 'next/navigation';
import LayoutSwitcher, { type LayoutMode } from './LayoutSwitcher';

interface WorkspaceHeaderProps {
  projectName: string;
  projectId: string;
  beneficiaryName: string;
  onBeneficiaryChange: (name: string) => void;
  onBeneficiarySave: () => void;
  isSaving?: boolean;
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
}

export default function WorkspaceHeader({
  projectName,
  projectId,
  beneficiaryName,
  onBeneficiaryChange,
  onBeneficiarySave,
  isSaving = false,
  layoutMode,
  onLayoutChange,
}: WorkspaceHeaderProps) {
  const router = useRouter();

  return (
    <header className="bg-white border-b border-[#E5E7EB] h-16">
      <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 text-[#6B7280] hover:text-[#1A1A1A] hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Projects"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-[#1A1A1A]">{projectName}</h1>
            <p className="text-xs text-[#6B7280]">L-1 Evidence Builder</p>
          </div>
        </div>

        {/* Center: Beneficiary Name */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-[#6B7280]">Beneficiary:</label>
          <div className="relative">
            <input
              type="text"
              value={beneficiaryName}
              onChange={(e) => onBeneficiaryChange(e.target.value)}
              onBlur={onBeneficiarySave}
              onKeyDown={(e) => e.key === 'Enter' && onBeneficiarySave()}
              placeholder="Enter name"
              className="w-48 px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A1A] bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {isSaving && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Layout Switcher + Project ID */}
        <div className="flex items-center gap-4">
          <LayoutSwitcher current={layoutMode} onChange={onLayoutChange} />
          <span className="text-xs text-[#6B7280] font-mono bg-gray-50 px-2 py-1 rounded">
            {projectId.slice(0, 8)}
          </span>
        </div>
      </div>
    </header>
  );
}
