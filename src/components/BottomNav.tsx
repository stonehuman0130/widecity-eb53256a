import { useState, useRef, useCallback, useEffect } from "react";
import { Home, CalendarDays, MessageCircle, MoreHorizontal, Dumbbell, Heart, Clock, Sparkles } from "lucide-react";

export type Tab = "home" | "workout" | "habits" | "sobriety" | "specialdays" | "calendar" | "chat" | "settings" | "more";

export interface EnabledPages {
  workout: boolean;
  habits: boolean;
  sobriety: boolean;
  specialdays: boolean;
}

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  enabledPages: EnabledPages;
}

const TAB_META: Record<string, { label: string; icon: typeof Home }> = {
  home: { label: "Home", icon: Home },
  workout: { label: "Workout", icon: Dumbbell },
  habits: { label: "Habits", icon: Heart },
  sobriety: { label: "Sobriety", icon: Clock },
  specialdays: { label: "Special", icon: Sparkles },
  calendar: { label: "Calendar", icon: CalendarDays },
  chat: { label: "Chat", icon: MessageCircle },
};

const LONG_PRESS_MS = 500;
const NAV_ORDER_KEY = "navTabOrder";

function getDefaultMiddleTabs(enabledPages: EnabledPages): Tab[] {
  const tabs: Tab[] = [];
  if (enabledPages.workout) tabs.push("workout");
  if (enabledPages.habits) tabs.push("habits");
  if (enabledPages.sobriety) tabs.push("sobriety");
  if (enabledPages.specialdays) tabs.push("specialdays");
  tabs.push("calendar", "chat");
  return tabs;
}

function loadSavedOrder(): Tab[] | null {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveOrder(order: Tab[]) {
  localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
}

function reconcileOrder(saved: Tab[] | null, enabled: Tab[]): Tab[] {
  if (!saved) return enabled;
  // Keep saved order but only include currently-enabled tabs, then append any new ones
  const enabledSet = new Set(enabled);
  const result: Tab[] = [];
  for (const t of saved) {
    if (enabledSet.has(t)) {
      result.push(t);
      enabledSet.delete(t);
    }
  }
  // Append any newly-enabled tabs not in saved order
  for (const t of enabled) {
    if (enabledSet.has(t)) result.push(t);
  }
  return result;
}

const BottomNav = ({ activeTab, onTabChange, enabledPages }: BottomNavProps) => {
  const defaultMiddle = getDefaultMiddleTabs(enabledPages);
  const [middleTabs, setMiddleTabs] = useState<Tab[]>(() =>
    reconcileOrder(loadSavedOrder(), defaultMiddle)
  );
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Refs for long-press
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // Refs for touch-drag
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reconcile when enabledPages change
  useEffect(() => {
    const fresh = getDefaultMiddleTabs(enabledPages);
    setMiddleTabs((prev) => reconcileOrder(prev, fresh));
  }, [enabledPages.workout, enabledPages.habits, enabledPages.sobriety, enabledPages.specialdays]);

  // Click outside to exit edit mode
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
      // Vibrate if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback((tab: Tab) => {
    const wasLongPress = didLongPress.current;
    clearLongPress();

    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      // Perform reorder
      setMiddleTabs((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dragOverIdx, 0, moved);
        saveOrder(next);
        return next;
      });
    }

    setDragIdx(null);
    setDragOverIdx(null);

    if (!wasLongPress && !editMode) {
      onTabChange(tab);
    }
  }, [editMode, dragIdx, dragOverIdx, clearLongPress, onTabChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!editMode || dragIdx === null) return;
    // Find which middle tab the pointer is over
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

  const handlePointerLeave = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handlePointerCancel = useCallback(() => {
    clearLongPress();
    setDragIdx(null);
    setDragOverIdx(null);
  }, [clearLongPress]);

  // Compute visual order for rendering
  const visualTabs = (() => {
    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...middleTabs];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      return next;
    }
    return middleTabs;
  })();

  const isActive = (id: Tab) => activeTab === id;

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
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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

        {/* Middle: reorderable */}
        {visualTabs.map((tabId, i) => {
          const meta = TAB_META[tabId];
          if (!meta) return null;
          const Icon = meta.icon;
          const active = isActive(tabId);
          const isDragging = editMode && dragIdx !== null && middleTabs[dragIdx] === tabId;

          return (
            <button
              key={tabId}
              ref={(el) => { tabRefs.current[i] = el; }}
              onPointerDown={(e) => {
                e.preventDefault();
                handlePointerDown(i);
              }}
              onPointerUp={() => handlePointerUp(tabId)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors select-none touch-none ${
                active ? "text-nav-active" : "text-nav-inactive"
              } ${editMode ? "animate-nav-wiggle" : ""} ${
                isDragging ? "opacity-60 scale-110" : ""
              }`}
              style={editMode ? { animationDelay: `${i * 0.05}s` } : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium">{meta.label}</span>
            </button>
          );
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
