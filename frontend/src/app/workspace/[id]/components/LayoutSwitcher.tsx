'use client';

export type LayoutMode = 'pipeline' | 'sidebar' | 'tabs';

interface LayoutSwitcherProps {
  current: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

const LAYOUTS: { key: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
  },
  {
    key: 'sidebar',
    label: 'Sidebar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    key: 'tabs',
    label: 'Tabs',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
];

export default function LayoutSwitcher({ current, onChange }: LayoutSwitcherProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
      {LAYOUTS.map((layout) => (
        <button
          key={layout.key}
          onClick={() => onChange(layout.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            current === layout.key
              ? 'bg-white text-[#1A1A1A] shadow-sm'
              : 'text-[#6B7280] hover:text-[#1A1A1A]'
          }`}
          title={layout.label}
        >
          {layout.icon}
          <span className="hidden sm:inline">{layout.label}</span>
        </button>
      ))}
    </div>
  );
}
