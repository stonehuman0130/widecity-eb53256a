import { useState, useRef, useCallback, useEffect } from "react";
import { Home, CalendarDays, MessageCircle, MoreHorizontal, Dumbbell, Heart, Clock, Sparkles, Apple } from "lucide-react";

export type Tab = "home" | "workout" | "habits" | "sobriety" | "specialdays" | "nutrition" | "calendar" | "chat" | "ai" | "settings" | "more";

export const ALL_PAGE_META: Record<string, { label: string; icon: typeof Home; desc: string }> = {
  calendar: { label: "Calendar", icon: CalendarDays, desc: "View and manage your schedule" },
  chat: { label: "Chat", icon: MessageCircle, desc: "Group messaging and media" },
  workout: { label: "Workout", icon: Dumbbell, desc: "Track workouts and exercise plans" },
  habits: { label: "Habits", icon: Heart, desc: "Daily habit tracking and streaks" },
  nutrition: { label: "Nutrition", icon: Apple, desc: "Track protein, meals & AI suggestions" },
  sobriety: { label: "Sobriety", icon: Clock, desc: "Track sobriety milestones" },
  specialdays: { label: "Special Days", icon: Sparkles, desc: "Track anniversaries & milestones" },
};

export const CUSTOMIZABLE_PAGE_IDS = Object.keys(ALL_PAGE_META) as Tab[];

// Calendar is fixed in nav and can't be removed
export const FIXED_NAV_PAGES: Tab[] = ["calendar"];
export const MAX_NAV_SLOTS = 3;

const NAV_PAGES_KEY = "navBarPages";
const LONG_PRESS_MS = 500;

export function loadNavPages(): Tab[] {
  try {
    const raw = localStorage.getItem(NAV_PAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Tab[];
      // Ensure fixed pages are always included
      const result = [...parsed.filter(t => ALL_PAGE_META[t])];
      for (const fp of FIXED_NAV_PAGES) {
        if (!result.includes(fp)) result.unshift(fp);
      }
      return result.slice(0, MAX_NAV_SLOTS);
    }
  } catch {}
  return [...FIXED_NAV_PAGES];
}

export function saveNavPages(pages: Tab[]) {
  localStorage.setItem(NAV_PAGES_KEY, JSON.stringify(pages));
}

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  navPages: Tab[];
}

const BottomNav = ({ activeTab, onTabChange, navPages }: BottomNavProps) => {
  const aiActive = activeTab === "ai";
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!editMode) return;
    const handler = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setEditMode(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [editMode]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((idx: number) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setEditMode(true);
      setDragIdx(idx);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback((tab: Tab) => {
    const wasLongPress = didLongPress.current;
    clearLongPress();

    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      // Reorder handled by parent via event - for now just visual
    }

    setDragIdx(null);
    setDragOverIdx(null);

    if (!wasLongPress && !editMode) {
      onTabChange(tab);
    }
  }, [editMode, dragIdx, dragOverIdx, clearLongPress, onTabChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!editMode || dragIdx === null) return;
    const x = e.clientX;
    for (let i = 0; i < tabRefs.current.length; i++) {
      const el = tabRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right) {
        setDragOverIdx(i);
        return;
      }
    }
  }, [editMode, dragIdx]);

  const handlePointerLeave = useCallback(() => { clearLongPress(); }, [clearLongPress]);
  const handlePointerCancel = useCallback(() => {
    clearLongPress();
    setDragIdx(null);
    setDragOverIdx(null);
  }, [clearLongPress]);

  // Compute visual order
  const visualTabs = (() => {
    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...navPages];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      return next;
    }
    return navPages;
  })();

  const leftTabs = visualTabs.slice(0, Math.ceil(visualTabs.length / 2));
  const rightTabs = visualTabs.slice(Math.ceil(visualTabs.length / 2));
  const isActive = (id: Tab) => activeTab === id;

  const renderTab = (tabId: Tab, i: number) => {
    const meta = ALL_PAGE_META[tabId];
    if (!meta) return null;
    const Icon = meta.icon;
    const active = isActive(tabId);
    const isDragging = editMode && dragIdx !== null && navPages[dragIdx] === tabId;

    return (
      <button
        key={tabId}
        ref={(el) => { tabRefs.current[i] = el; }}
        onPointerDown={(e) => { e.preventDefault(); handlePointerDown(i); }}
        onPointerUp={() => handlePointerUp(tabId)}
        className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors select-none touch-none ${
          active ? "text-nav-active" : "text-nav-inactive"
        } ${editMode ? "animate-nav-wiggle" : ""} ${isDragging ? "opacity-60 scale-110" : ""}`}
        style={editMode ? { animationDelay: `${i * 0.05}s` } : undefined}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
        <span className="text-[9px] font-medium">{meta.label}</span>
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
    >
      {editMode && (
        <div className="flex justify-center pt-1.5 -mb-0.5">
          <button
            onClick={() => setEditMode(false)}
            className="text-[10px] font-semibold text-primary px-3 py-0.5 rounded-full bg-primary/10"
          >
            Done
          </button>
        </div>
      )}
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] relative">
        {/* Fixed: Home */}
        <button
          onClick={() => { if (!editMode) onTabChange("home"); }}
          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
            isActive("home") ? "text-nav-active" : "text-nav-inactive"
          }`}
        >
          <Home size={20} strokeWidth={isActive("home") ? 2.5 : 1.8} />
          <span className="text-[9px] font-medium">Home</span>
        </button>

        {/* Left middle tabs */}
        {leftTabs.map((tabId, i) => renderTab(tabId, i))}

        {/* Center: AI Button */}
        <button
          onClick={() => { if (!editMode) onTabChange("ai"); }}
          className={`flex flex-col items-center gap-0.5 -mt-4 transition-all ${editMode ? "pointer-events-none opacity-50" : ""}`}
        >
          <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
            aiActive
              ? "bg-gradient-to-br from-violet-500 to-indigo-600 scale-105"
              : "bg-gradient-to-br from-violet-500/90 to-indigo-600/90 hover:scale-105"
          }`}>
            <Sparkles size={24} className="text-white" />
          </div>
          <span className={`text-[9px] font-semibold mt-0.5 ${aiActive ? "text-violet-500" : "text-muted-foreground"}`}>AI</span>
        </button>

        {/* Right middle tabs */}
        {rightTabs.map((tabId, rawI) => {
          const i = rawI + Math.ceil(visualTabs.length / 2);
          return renderTab(tabId, i);
        })}

        {/* Fixed: More */}
        <button
          onClick={() => { if (!editMode) onTabChange("more"); }}
          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
            isActive("more") ? "text-nav-active" : "text-nav-inactive"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={isActive("more") ? 2.5 : 1.8} />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
