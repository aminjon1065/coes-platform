import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/store/ui.store';
import { searchApi } from '@/lib/api';

export function TopBar({ title }: { title?: string }) {
  const toggle = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  // Prefetch hint — actual search happens on submit
  void searchApi;

  return (
    <header className="h-14 flex items-center gap-4 border-b border-gray-200 bg-white px-4 shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={toggle}
        className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {title && (
        <h1 className="text-base font-semibold text-gray-800 hidden sm:block">{title}</h1>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-sm ml-auto sm:ml-0">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Search documents, tasks…"
            className="input pl-8 py-1.5 text-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </form>
    </header>
  );
}
