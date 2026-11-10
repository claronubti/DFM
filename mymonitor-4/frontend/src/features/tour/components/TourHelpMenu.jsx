import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Compass, Sparkles, Keyboard, RotateCcw } from 'lucide-react';

export default function TourHelpMenu({ onStartTour, onResetTour }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative font-['Segoe_UI']" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Help & Product Walkthrough"
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f2f1] text-[#605e5c] hover:text-[#242424] transition"
        data-tour="help-menu"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-[#ffffff] border border-[#edebe9] rounded-xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in duration-100 select-none">
          {/* Header */}
          <div className="px-4 py-2 border-b border-[#f3f2f1] bg-[#faf9f8]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0f6cbd]" />
              <span className="text-xs font-semibold text-[#242424]">
                Help & Walkthrough
              </span>
            </div>
            <p className="text-[11px] text-[#605e5c] mt-0.5">
              Comprehensive guided tour of the entire application.
            </p>
          </div>

          {/* Single Unified Product Tour Launcher */}
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onStartTour) onStartTour();
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-[#eff6fc] hover:bg-[#deecf9] transition flex items-center gap-2.5 group cursor-pointer border border-[#c7e0f4]"
            >
              <Compass className="w-4 h-4 text-[#0f6cbd] shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-[#0f6cbd] block">
                  Start Application Walkthrough
                </span>
                <span className="text-[10px] text-[#605e5c] block mt-0.5">
                  Complete guided tour (~3 min)
                </span>
              </div>
            </button>
          </div>

          {/* Quick Shortcuts Section */}
          <div className="p-2 border-t border-[#f3f2f1] space-y-1 bg-[#faf9f8]">
            <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a19f9d] flex items-center justify-between">
              <span>Keyboard Shortcuts</span>
              <Keyboard className="w-3 h-3 text-[#a19f9d]" />
            </div>
            <div className="px-2 py-1 text-[11px] text-[#605e5c] flex items-center justify-between">
              <span>Global Search</span>
              <kbd className="px-1.5 py-0.5 bg-white border border-[#d1d1d1] rounded text-[10px] font-mono shadow-2xs">Ctrl+/</kbd>
            </div>
            <div className="px-2 py-1 text-[11px] text-[#605e5c] flex items-center justify-between">
              <span>Next Tour Step</span>
              <kbd className="px-1.5 py-0.5 bg-white border border-[#d1d1d1] rounded text-[10px] font-mono shadow-2xs">→</kbd>
            </div>
            <div className="px-2 py-1 text-[11px] text-[#605e5c] flex items-center justify-between">
              <span>Previous Tour Step</span>
              <kbd className="px-1.5 py-0.5 bg-white border border-[#d1d1d1] rounded text-[10px] font-mono shadow-2xs">←</kbd>
            </div>
            <div className="px-2 py-1 text-[11px] text-[#605e5c] flex items-center justify-between">
              <span>Dismiss / Close</span>
              <kbd className="px-1.5 py-0.5 bg-white border border-[#d1d1d1] rounded text-[10px] font-mono shadow-2xs">Esc</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

