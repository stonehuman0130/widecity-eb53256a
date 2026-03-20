import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Check, Search,
  MoreVertical, EyeOff, Clock, Calendar as CalendarIcon,
  List, Columns3,
} from "lucide-react";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import UserBadge from "@/components/UserBadge";
import GroupSelector from "@/components/GroupSelector";
import ItemActionMenu from "@/components/ItemActionMenu";
import { useGroupContext } from "@/hooks/useGroupContext";
import { formatTime } from "@/lib/formatTime";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Group colors palette - assigned by index
const GROUP_COLORS = [
  "hsl(210 100% 50%)",  // blue
  "hsl(340 80% 55%)",   // pink
  "hsl(150 60% 42%)",   // green
  "hsl(35 100% 52%)",   // orange
  "hsl(270 60% 55%)",   // purple
  "hsl(190 80% 42%)",   // teal
  "hsl(0 75% 55%)",     // red
  "hsl(50 90% 48%)",    // yellow
];

const GROUP_COLOR_CLASSES = [
  { bg: "bg-blue-500", text: "text-blue-500", bgLight: "bg-blue-500/15", border: "border-blue-500/30" },
  { bg: "bg-pink-500", text: "text-pink-500", bgLight: "bg-pink-500/15", border: "border-pink-500/30" },
  { bg: "bg-emerald-600", text: "text-emerald-600", bgLight: "bg-emerald-600/15", border: "border-emerald-600/30" },
  { bg: "bg-orange-500", text: "text-orange-500", bgLight: "bg-orange-500/15", border: "border-orange-500/30" },
  { bg: "bg-purple-500", text: "text-purple-500", bgLight: "bg-purple-500/15", border: "border-purple-500/30" },
  { bg: "bg-teal-500", text: "text-teal-500", bgLight: "bg-teal-500/15", border: "border-teal-500/30" },
  { bg: "bg-red-500", text: "text-red-500", bgLight: "bg-red-500/15", border: "border-red-500/30" },
  { bg: "bg-yellow-500", text: "text-yellow-500", bgLight: "bg-yellow-500/15", border: "border-yellow-500/30" },
];

type ViewMode = "month" | "list" | "day" | "3day";

// ── Helper: parse time string to hour decimal ──────────────

function timeToHour(time: string): number | null {
  if (!time || time === "All day") return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return parseInt(match[1]) + parseInt(match[2]) / 60;
  // Try parsing ISO datetime
  const d = new Date(time);
  if (!isNaN(d.getTime())) return d.getHours() + d.getMinutes() / 60;
  return null;
}

function getGroupColorIndex(groupId: string | null | undefined, groups: Group[]): number {
  if (!groupId) return 0;
  const idx = groups.findIndex((g) => g.id === groupId);
  return idx >= 0 ? idx % GROUP_COLOR_CLASSES.length : 0;
}

// ── Unified calendar item type ──────────────────────────────

interface CalItem {
  id: string;
  title: string;
  time: string;
  allDay: boolean;
  hour: number | null;
  assignee: "me" | "partner" | "both";
  done?: boolean;
  tag?: string;
  hidden?: boolean;
  groupId?: string | null;
  type: "event" | "task" | "gcal";
  raw: ScheduledEvent | Task | GoogleCalendarEvent;
}

// ── Main Component ──────────────────────────────────────────

const CalendarPage = () => {
  const {
    events, filteredEvents, addEvent, addTask, removeEvent, rescheduleEvent,
    tasks, filteredTasks, toggleTask, removeTask, updateTask,
    googleCalendarEvents, hideGcalEvent, toggleEventVisibility, designateGcalEvent,
  } = useAppContext();
  const { activeGroup, groups } = useAuth();
  const { showGoogleCalendar } = useGroupContext();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newUser, setNewUser] = useState<"me" | "partner" | "both">("me");
  const [newTag, setNewTag] = useState<"Work" | "Personal" | "Household">("Personal");
  const timeGridRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const selDay = selectedDate.getDate();
  const selMonth = selectedDate.getMonth();
  const selYear = selectedDate.getFullYear();

  // ── Build unified items for a given date ──────────────

  const getItemsForDate = useCallback((d: number, m: number, y: number): CalItem[] => {
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const items: CalItem[] = [];

    filteredEvents
      .filter((e) => e.day === d && e.month === m && e.year === y)
      .forEach((e) => {
        items.push({
          id: `ev-${e.id}`, title: e.title, time: e.time,
          allDay: !e.time || e.time === "All day",
          hour: timeToHour(e.time), assignee: e.user,
          hidden: e.hiddenFromPartner, groupId: e.groupId,
          type: "event", raw: e,
        });
      });

    filteredTasks
      .filter((t) => t.scheduledDay === d && t.scheduledMonth === m && t.scheduledYear === y)
      .forEach((t) => {
        items.push({
          id: `tk-${t.id}`, title: t.title, time: t.time,
          allDay: !t.time, hour: timeToHour(t.time),
          assignee: t.assignee, done: t.done, tag: t.tag,
          groupId: t.groupId, type: "task", raw: t,
        });
      });

    if (showGoogleCalendar) {
      googleCalendarEvents
        .filter((ge) => {
          const startDate = ge.start?.split("T")[0] || ge.start;
          return startDate === dateStr;
        })
        .forEach((ge) => {
          const startTime = ge.allDay ? "" : ge.start;
          const h = ge.allDay ? null : (ge.start ? new Date(ge.start).getHours() + new Date(ge.start).getMinutes() / 60 : null);
          items.push({
            id: `gcal-${ge.id}`, title: ge.title, time: startTime || "All day",
            allDay: ge.allDay, hour: h,
            assignee: ge.assignee || "me", groupId: null,
            type: "gcal", raw: ge,
          });
        });
    }

    // Sort: all-day first, then by time
    items.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.hour ?? 0) - (b.hour ?? 0);
    });

    return items;
  }, [filteredEvents, filteredTasks, googleCalendarEvents, showGoogleCalendar]);

  const selectedDayItems = useMemo(
    () => getItemsForDate(selDay, selMonth, selYear),
    [selDay, selMonth, selYear, getItemsForDate]
  );

  // ── Month grid: dots per day ──────────────────────────

  const monthDots = useMemo(() => {
    const dots = new Map<number, Set<string>>();
    for (let d = 1; d <= daysInMonth; d++) {
      const items = getItemsForDate(d, month, year);
      if (items.length > 0) {
        const groupIds = new Set<string>();
        items.forEach((it) => groupIds.add(it.groupId || "__default"));
        dots.set(d, groupIds);
      }
    }
    return dots;
  }, [daysInMonth, month, year, getItemsForDate]);

  // ── Navigation ────────────────────────────────────────

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToday = () => {
    const t = new Date();
    setCurrentDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const selectDay = (d: number) => {
    setSelectedDate(new Date(year, month, d));
  };

  // ── Swipe support ─────────────────────────────────────

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) prevMonth();
      else nextMonth();
    }
  };

  // ── Add event handler ─────────────────────────────────

  const handleAddEvent = () => {
    if (!newTitle.trim()) return;
    addEvent({
      title: newTitle.trim(),
      time: newTime || "All day",
      day: selDay,
      month: selMonth,
      year: selYear,
      user: newUser,
    });
    addTask({
      title: newTitle.trim(),
      time: newTime || "",
      tag: newTag,
      assignee: newUser === "partner" ? "partner" : newUser === "both" ? "both" : "me",
      scheduledDay: selDay,
      scheduledMonth: selMonth,
      scheduledYear: selYear,
    });
    setNewTitle("");
    setNewTime("");
    setNewUser("me");
    setNewTag("Personal");
    setShowAddForm(false);
  };

  // Scroll time grid to 8am
  useEffect(() => {
    if ((viewMode === "day" || viewMode === "3day") && timeGridRef.current) {
      timeGridRef.current.scrollTop = 8 * 60; // 8am * 60px/hr
    }
  }, [viewMode]);

  // ── Search results ────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { item: CalItem; dateLabel: string }[] = [];

    // Search all events (not just filtered)
    events.forEach((e) => {
      if (e.title.toLowerCase().includes(q)) {
        results.push({
          item: {
            id: `ev-${e.id}`, title: e.title, time: e.time,
            allDay: !e.time || e.time === "All day",
            hour: timeToHour(e.time), assignee: e.user,
            groupId: e.groupId, type: "event", raw: e,
          },
          dateLabel: `${new Date(e.year, e.month, e.day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        });
      }
    });

    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q) && t.scheduledDay) {
        results.push({
          item: {
            id: `tk-${t.id}`, title: t.title, time: t.time,
            allDay: !t.time, hour: timeToHour(t.time),
            assignee: t.assignee, done: t.done, tag: t.tag,
            groupId: t.groupId, type: "task", raw: t,
          },
          dateLabel: `${new Date(t.scheduledYear!, t.scheduledMonth!, t.scheduledDay!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        });
      }
    });

    googleCalendarEvents.forEach((ge) => {
      if (ge.title.toLowerCase().includes(q)) {
        results.push({
          item: {
            id: `gcal-${ge.id}`, title: ge.title, time: ge.start || "",
            allDay: ge.allDay, hour: null, assignee: ge.assignee || "me",
            groupId: null, type: "gcal", raw: ge,
          },
          dateLabel: ge.start ? new Date(ge.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        });
      }
    });

    return results.slice(0, 20);
  }, [searchQuery, events, tasks, googleCalendarEvents]);

  // ── Group color helper ────────────────────────────────

  const getColorClasses = (groupId: string | null | undefined) => {
    return GROUP_COLOR_CLASSES[getGroupColorIndex(groupId, groups)];
  };

  const getGroupName = (groupId: string | null | undefined) => {
    if (!groupId) return null;
    return groups.find((g) => g.id === groupId);
  };

  // ── 3-day dates ───────────────────────────────────────

  const threeDayDates = useMemo(() => {
    const d = new Date(selYear, selMonth, selDay);
    return [
      new Date(d),
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2),
    ];
  }, [selDay, selMonth, selYear]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="px-4 pb-24">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="pt-10 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">{monthName}</h1>
            <span className="text-xl font-light text-muted-foreground">{year}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSearch(true)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground">
              <Search size={18} />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-full">
              Today
            </button>
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronLeft size={18} />
            </button>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── View Mode Toggle ────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <GroupSelector />
        <div className="flex bg-secondary rounded-lg p-0.5 flex-shrink-0">
          {([
            { mode: "month" as ViewMode, icon: <CalendarIcon size={14} />, label: "Month" },
            { mode: "list" as ViewMode, icon: <List size={14} />, label: "List" },
            { mode: "day" as ViewMode, icon: <Clock size={14} />, label: "Day" },
            { mode: "3day" as ViewMode, icon: <Columns3 size={14} />, label: "3D" },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                viewMode === mode
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MONTH VIEW ──────────────────────────────────── */}
      {viewMode === "month" && (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e-${i}`} className="h-11" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isTodayDay = isCurrentMonth && day === today.getDate();
              const isSelected = day === selDay && month === selMonth && year === selYear;
              const dots = monthDots.get(day);

              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  className="h-11 flex flex-col items-center justify-center relative"
                >
                  <span
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isTodayDay
                        ? "bg-destructive text-destructive-foreground font-semibold"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {day}
                  </span>
                  {/* Event dots */}
                  {dots && !isSelected && (
                    <div className="flex gap-[2px] absolute bottom-0">
                      {Array.from(dots).slice(0, 3).map((gid, idx) => {
                        const colorIdx = gid === "__default" ? 0 : getGroupColorIndex(gid, groups);
                        return (
                          <span
                            key={idx}
                            className="w-[4px] h-[4px] rounded-full"
                            style={{ backgroundColor: GROUP_COLORS[colorIdx % GROUP_COLORS.length] }}
                          />
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Selected day event list ──────────────────── */}
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-semibold text-foreground">
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
              >
                {showAddForm ? <X size={14} /> : <Plus size={14} />}
              </button>
            </div>

            {showAddForm && <AddEventForm {...{ newTitle, setNewTitle, newTime, setNewTime, newTag, setNewTag, newUser, setNewUser, handleAddEvent }} />}

            {selectedDayItems.length === 0 && !showAddForm ? (
              <p className="text-xs text-muted-foreground text-center py-6">No events</p>
            ) : (
              <EventList items={selectedDayItems} groups={groups} getColorClasses={getColorClasses} />
            )}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ───────────────────────────────────── */}
      {viewMode === "list" && (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="space-y-4">
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const items = getItemsForDate(day, month, year);
              if (items.length === 0) return null;
              const isTodayDay = isCurrentMonth && day === today.getDate();
              const dateObj = new Date(year, month, day);

              return (
                <div key={day}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[13px] font-semibold ${isTodayDay ? "text-primary" : "text-foreground"}`}>
                      {dateObj.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                    </span>
                    {isTodayDay && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">TODAY</span>}
                  </div>
                  <EventList items={items} groups={groups} getColorClasses={getColorClasses} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DAY VIEW (Time Grid) ────────────────────────── */}
      {viewMode === "day" && (
        <TimeGridView
          dates={[selectedDate]}
          getItemsForDate={getItemsForDate}
          groups={groups}
          timeGridRef={timeGridRef}
        />
      )}

      {/* ── 3-DAY VIEW ──────────────────────────────────── */}
      {viewMode === "3day" && (
        <TimeGridView
          dates={threeDayDates}
          getItemsForDate={getItemsForDate}
          groups={groups}
          timeGridRef={timeGridRef}
        />
      )}

      {/* ── Search Modal ────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
          <div className="px-4 pt-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 flex items-center bg-secondary rounded-xl px-3 py-2 gap-2">
                <Search size={16} className="text-muted-foreground flex-shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-muted-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-sm font-medium text-primary">
                Cancel
              </button>
            </div>

            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {searchResults.map((r) => {
                const group = getGroupName(r.item.groupId);
                const colorClasses = getColorClasses(r.item.groupId);
                return (
                  <button
                    key={r.item.id}
                    onClick={() => {
                      // Navigate to the date
                      const raw = r.item.raw;
                      if (r.item.type === "event") {
                        const ev = raw as ScheduledEvent;
                        setCurrentDate(new Date(ev.year, ev.month, 1));
                        setSelectedDate(new Date(ev.year, ev.month, ev.day));
                      } else if (r.item.type === "task") {
                        const tk = raw as Task;
                        if (tk.scheduledYear != null) {
                          setCurrentDate(new Date(tk.scheduledYear, tk.scheduledMonth!, 1));
                          setSelectedDate(new Date(tk.scheduledYear, tk.scheduledMonth!, tk.scheduledDay!));
                        }
                      }
                      setViewMode("month");
                      setShowSearch(false);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left"
                  >
                    <span className={`w-[3px] h-8 rounded-full ${colorClasses.bg} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.dateLabel}
                        {r.item.time && r.item.time !== "All day" && ` · ${formatTime(r.item.time)}`}
                        {group && ` · ${group.emoji} ${group.name}`}
                      </p>
                    </div>
                  </button>
                );
              })}
              {searchQuery && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Event List Component ──────────────────────────────────

const EventList = ({
  items,
  groups,
  getColorClasses,
}: {
  items: CalItem[];
  groups: Group[];
  getColorClasses: (gid: string | null | undefined) => typeof GROUP_COLOR_CLASSES[0];
}) => {
  const { activeGroup } = useAuth();
  const allDayItems = items.filter((i) => i.allDay);
  const timedItems = items.filter((i) => !i.allDay);

  return (
    <div className="divide-y divide-border">
      {/* All-day section */}
      {allDayItems.length > 0 && (
        <div className="py-1">
          {allDayItems.map((item) => {
            const colors = getColorClasses(item.groupId);
            const group = !activeGroup && item.groupId ? groups.find((g) => g.id === item.groupId) : null;
            return (
              <div key={item.id} className="flex items-center gap-2.5 py-1.5 px-1">
                <span className={`w-[3px] h-5 rounded-full ${colors.bg} flex-shrink-0`} />
                <span className="text-[11px] text-muted-foreground w-12 flex-shrink-0">all-day</span>
                <span className={`text-[13px] font-medium flex-1 truncate ${item.done ? "line-through opacity-40" : "text-foreground"}`}>
                  {item.title}
                </span>
                {group && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                    {group.emoji} {group.name}
                  </span>
                )}
                <UserBadge user={item.assignee} />
              </div>
            );
          })}
        </div>
      )}

      {/* Timed items */}
      {timedItems.map((item) => {
        const colors = getColorClasses(item.groupId);
        const group = !activeGroup && item.groupId ? groups.find((g) => g.id === item.groupId) : null;
        const displayTime = item.type === "gcal" && item.time
          ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : formatTime(item.time);

        return (
          <div key={item.id} className="flex items-center gap-2.5 py-2 px-1">
            <span className={`w-[3px] h-5 rounded-full ${colors.bg} flex-shrink-0`} />
            <span className="text-[11px] text-muted-foreground w-12 flex-shrink-0 tabular-nums">
              {displayTime}
            </span>
            <span className={`text-[13px] font-medium flex-1 truncate ${item.done ? "line-through opacity-40" : "text-foreground"}`}>
              {item.title}
            </span>
            {group && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                {group.emoji} {group.name}
              </span>
            )}
            <UserBadge user={item.assignee} />
          </div>
        );
      })}
    </div>
  );
};

// ── Time Grid View (Day / 3-Day) ──────────────────────────

const TimeGridView = ({
  dates,
  getItemsForDate,
  groups,
  timeGridRef,
}: {
  dates: Date[];
  getItemsForDate: (d: number, m: number, y: number) => CalItem[];
  groups: Group[];
  timeGridRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const columns = dates.map((d) => ({
    date: d,
    label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
    items: getItemsForDate(d.getDate(), d.getMonth(), d.getFullYear()),
    isToday:
      d.getDate() === new Date().getDate() &&
      d.getMonth() === new Date().getMonth() &&
      d.getFullYear() === new Date().getFullYear(),
  }));

  const hourHeight = 60; // px per hour

  return (
    <div>
      {/* Column headers */}
      <div className="flex border-b border-border mb-0">
        <div className="w-12 flex-shrink-0" />
        {columns.map((col, i) => (
          <div
            key={i}
            className={`flex-1 text-center py-2 text-[12px] font-semibold ${col.isToday ? "text-primary" : "text-foreground"}`}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* All-day row */}
      {columns.some((c) => c.items.some((it) => it.allDay)) && (
        <div className="flex border-b border-border">
          <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground flex items-center justify-end pr-2">
            all-day
          </div>
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 p-0.5 min-h-[28px] border-l border-border">
              {col.items.filter((it) => it.allDay).map((it) => {
                const colorIdx = getGroupColorIndex(it.groupId, groups);
                return (
                  <div
                    key={it.id}
                    className="text-[10px] font-medium rounded px-1 py-0.5 truncate mb-0.5"
                    style={{
                      backgroundColor: GROUP_COLORS[colorIdx] + "22",
                      color: GROUP_COLORS[colorIdx],
                    }}
                  >
                    {it.title}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div
        ref={timeGridRef}
        className="overflow-y-auto relative"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        <div className="flex" style={{ height: 24 * hourHeight }}>
          {/* Time labels */}
          <div className="w-12 flex-shrink-0 relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-[10px] text-muted-foreground"
                style={{ top: h * hourHeight - 6 }}
              >
                {h === 0 ? "" : `${h > 12 ? h - 12 : h}${h >= 12 ? "PM" : "AM"}`}
              </div>
            ))}
          </div>

          {/* Columns */}
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 relative border-l border-border">
              {/* Hour lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-border/50"
                  style={{ top: h * hourHeight }}
                />
              ))}

              {/* Now indicator */}
              {col.isToday && (() => {
                const now = new Date();
                const nowPos = (now.getHours() + now.getMinutes() / 60) * hourHeight;
                return (
                  <div className="absolute w-full z-10" style={{ top: nowPos }}>
                    <div className="w-2 h-2 rounded-full bg-destructive absolute -left-1 -top-1" />
                    <div className="h-[1px] w-full bg-destructive" />
                  </div>
                );
              })()}

              {/* Event blocks */}
              {col.items.filter((it) => !it.allDay && it.hour != null).map((it) => {
                const colorIdx = getGroupColorIndex(it.groupId, groups);
                const top = it.hour! * hourHeight;
                const height = Math.max(hourHeight * 0.75, 30); // default ~45min block

                return (
                  <div
                    key={it.id}
                    className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 overflow-hidden cursor-pointer"
                    style={{
                      top,
                      height,
                      backgroundColor: GROUP_COLORS[colorIdx] + "22",
                      borderLeft: `3px solid ${GROUP_COLORS[colorIdx]}`,
                    }}
                  >
                    <p className="text-[10px] font-semibold truncate" style={{ color: GROUP_COLORS[colorIdx] }}>
                      {it.title}
                    </p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {it.type === "gcal" ? new Date(it.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : formatTime(it.time)}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Add Event Form ────────────────────────────────────────

const AddEventForm = ({
  newTitle, setNewTitle, newTime, setNewTime, newTag, setNewTag, newUser, setNewUser, handleAddEvent,
}: {
  newTitle: string; setNewTitle: (v: string) => void;
  newTime: string; setNewTime: (v: string) => void;
  newTag: "Work" | "Personal" | "Household"; setNewTag: (v: "Work" | "Personal" | "Household") => void;
  newUser: "me" | "partner" | "both"; setNewUser: (v: "me" | "partner" | "both") => void;
  handleAddEvent: () => void;
}) => (
  <div className="mb-3 space-y-2 bg-secondary/50 rounded-xl p-3">
    <input
      value={newTitle}
      onChange={(e) => setNewTitle(e.target.value)}
      placeholder="Event title..."
      className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground border border-border"
      autoFocus
    />
    <input
      type="time"
      value={newTime}
      onChange={(e) => setNewTime(e.target.value)}
      className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none text-foreground border border-border"
    />
    <div className="flex gap-1.5">
      {(["Work", "Personal", "Household"] as const).map((tag) => (
        <button
          key={tag}
          onClick={() => setNewTag(tag)}
          className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
            newTag === tag ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
    <div className="flex gap-1.5">
      {(["me", "partner", "both"] as const).map((u) => (
        <button
          key={u}
          onClick={() => setNewUser(u)}
          className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
            newUser === u ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          {u === "me" ? "Mine" : u === "partner" ? "Partner" : "Both"}
        </button>
      ))}
    </div>
    <button
      onClick={handleAddEvent}
      className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
    >
      Add Event
    </button>
  </div>
);

export default CalendarPage;
