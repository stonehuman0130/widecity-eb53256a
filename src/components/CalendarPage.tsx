import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Search,
  Calendar as CalendarIcon, MoreVertical, Settings,
} from "lucide-react";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import UserBadge from "@/components/UserBadge";
import GroupSelector from "@/components/GroupSelector";
import { useGroupContext } from "@/hooks/useGroupContext";
import { formatTime } from "@/lib/formatTime";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// ── Constants ──────────────────────────────────────────────

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const GROUP_COLORS = [
  "hsl(210 100% 50%)", "hsl(340 80% 55%)", "hsl(150 60% 42%)",
  "hsl(35 100% 52%)", "hsl(270 60% 55%)", "hsl(190 80% 42%)",
  "hsl(0 75% 55%)", "hsl(50 90% 48%)",
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
const VIEW_LABELS: Record<ViewMode, string> = { month: "Month", list: "List", day: "Day", "3day": "3 Day" };

// ── Helpers ────────────────────────────────────────────────

function parseTimeToMinutes(time: string): number | null {
  if (!time || time === "All day") return null;

  const twelveHourMatch = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hour = parseInt(twelveHourMatch[1], 10);
    const minute = parseInt(twelveHourMatch[2], 10);
    const period = twelveHourMatch[3].toUpperCase();

    if (period === "AM" && hour === 12) hour = 0;
    if (period === "PM" && hour < 12) hour += 12;

    return hour * 60 + minute;
  }

  const twentyFourHourMatch = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hour = parseInt(twentyFourHourMatch[1], 10);
    const minute = parseInt(twentyFourHourMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
  }

  const parsed = new Date(time);
  if (!isNaN(parsed.getTime())) {
    return parsed.getHours() * 60 + parsed.getMinutes();
  }

  return null;
}

function minutesToHour(minutes: number | null): number | null {
  return minutes == null ? null : minutes / 60;
}

function timeToHour(time: string): number | null {
  return minutesToHour(parseTimeToMinutes(time));
}

function parseGoogleDateValue(value?: string | null): Date | null {
  if (!value) return null;

  const dateOnly = value.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) || (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && !value.includes("T"))) {
    const [yy, mm, dd] = dateOnly.split("-").map(Number);
    return new Date(yy, mm - 1, dd, 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateWithMinutes(baseDate: Date, minutes: number) {
  const dt = new Date(baseDate);
  dt.setHours(0, 0, 0, 0);
  dt.setMinutes(Math.max(0, minutes));
  return dt;
}

function getGroupColorIndex(groupId: string | null | undefined, groups: Group[]): number {
  if (!groupId) return 0;
  const idx = groups.findIndex((g) => g.id === groupId);
  return idx >= 0 ? idx % GROUP_COLOR_CLASSES.length : 0;
}

function dateToKey(d: number, m: number, y: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function keyToDate(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return { day: d, month: m - 1, year: y };
}

/** Check if a date falls between start and end (inclusive) */
function dateInRange(d: number, m: number, y: number, startD: number, startM: number, startY: number, endD: number, endM: number, endY: number) {
  const dt = new Date(y, m, d).getTime();
  const st = new Date(startY, startM, startD).getTime();
  const et = new Date(endY, endM, endD).getTime();
  return dt >= st && dt <= et;
}

// ── Unified calendar item type ──────────────────────────────

interface CalItem {
  id: string;
  title: string;
  time: string;
  endTime?: string;
  allDay: boolean;
  hour: number | null;
  endHour: number | null;
  assignee: "me" | "partner" | "both";
  done?: boolean;
  tag?: string;
  hidden?: boolean;
  groupId?: string | null;
  type: "event" | "task" | "gcal";
  raw: ScheduledEvent | Task | GoogleCalendarEvent;
  isMultiDay?: boolean;
  isStart?: boolean;
  isEnd?: boolean;
  startDateTime?: Date | null;
  endDateTime?: Date | null;
}

// ── Main Component ──────────────────────────────────────────

const CalendarPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
  const {
    events, filteredEvents, addEvent, removeEvent, rescheduleEvent,
    tasks, filteredTasks, toggleTask, removeTask, updateTask,
    googleCalendarEvents, hideGcalEvent, toggleGcalCompletion, toggleEventVisibility, designateGcalEvent,
    toggleEventCompletion,
  } = useAppContext();
  const { activeGroup, groups } = useAuth();
  const { showGoogleCalendar } = useGroupContext();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [showSearch, setShowSearch] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const timeGridRef = useRef<HTMLDivElement>(null);

  // Add form state
  const [newTitle, setNewTitle] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newAllDay, setNewAllDay] = useState(false);
  const [newUser, setNewUser] = useState<"me" | "partner" | "both">("me");
  const [newDesc, setNewDesc] = useState("");

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
    const activeDate = new Date(y, m, d);
    const items: CalItem[] = [];

    filteredEvents.forEach((e) => {
      const startD = e.day;
      const startM = e.month;
      const startY = e.year;
      const endD = e.endDay ?? e.day;
      const endM = e.endMonth ?? e.month;
      const endY = e.endYear ?? e.year;
      const isAllDay = e.allDay ?? (!e.time || e.time === "All day");
      const isMultiDay = !(startD === endD && startM === endM && startY === endY);

      if (!dateInRange(d, m, y, startD, startM, startY, endD, endM, endY)) return;

      const isStartDay = d === startD && m === startM && y === startY;
      const isEndDay = d === endD && m === endM && y === endY;

      const startMinutes = parseTimeToMinutes(e.time) ?? 0;
      const parsedEndMinutes = parseTimeToMinutes(e.endTime || "");
      const fallbackEndMinutes = Math.min(startMinutes + 60, 24 * 60);
      const endMinutes = parsedEndMinutes ?? fallbackEndMinutes;

      let hour: number | null = null;
      let endHour: number | null = null;
      let startDateTime: Date | null = null;
      let endDateTime: Date | null = null;

      if (isAllDay) {
        startDateTime = new Date(y, m, d, 0, 0, 0, 0);
        endDateTime = new Date(y, m, d, 23, 59, 59, 999);
      } else if (isMultiDay) {
        if (isStartDay) {
          hour = minutesToHour(startMinutes);
          endHour = 24;
          startDateTime = dateWithMinutes(activeDate, startMinutes);
          endDateTime = dateWithMinutes(activeDate, 24 * 60);
        } else if (isEndDay) {
          hour = 0;
          endHour = minutesToHour(endMinutes) ?? 24;
          startDateTime = dateWithMinutes(activeDate, 0);
          endDateTime = dateWithMinutes(activeDate, endMinutes);
        } else {
          hour = 0;
          endHour = 24;
          startDateTime = dateWithMinutes(activeDate, 0);
          endDateTime = dateWithMinutes(activeDate, 24 * 60);
        }
      } else {
        hour = minutesToHour(startMinutes);
        endHour = minutesToHour(endMinutes);
        startDateTime = dateWithMinutes(activeDate, startMinutes);
        endDateTime = dateWithMinutes(activeDate, endMinutes);
      }

      items.push({
        id: `ev-${e.id}`,
        title: e.title,
        time: e.time,
        endTime: e.endTime,
        allDay: isAllDay,
        hour,
        endHour,
        assignee: e.user,
        done: e.done ?? false,
        hidden: e.hiddenFromPartner,
        groupId: e.groupId,
        type: "event",
        raw: e,
        isMultiDay,
        isStart: isStartDay,
        isEnd: isEndDay,
        startDateTime,
        endDateTime,
      });
    });

    filteredTasks
      .filter((t) => t.scheduledDay === d && t.scheduledMonth === m && t.scheduledYear === y)
      .forEach((t) => {
        const taskIsAllDay = !t.time || t.time === "All day";
        const taskStartMinutes = parseTimeToMinutes(t.time) ?? 0;
        const taskEndMinutes = Math.min(taskStartMinutes + 60, 24 * 60);

        items.push({
          id: `tk-${t.id}`,
          title: t.title,
          time: t.time || "All day",
          allDay: taskIsAllDay,
          hour: taskIsAllDay ? null : minutesToHour(taskStartMinutes),
          endHour: taskIsAllDay ? null : minutesToHour(taskEndMinutes),
          assignee: t.assignee,
          done: t.done,
          tag: t.tag,
          groupId: t.groupId,
          type: "task",
          raw: t,
          startDateTime: taskIsAllDay ? new Date(y, m, d, 0, 0, 0, 0) : dateWithMinutes(activeDate, taskStartMinutes),
          endDateTime: taskIsAllDay ? new Date(y, m, d, 23, 59, 59, 999) : dateWithMinutes(activeDate, taskEndMinutes),
        });
      });

    if (showGoogleCalendar) {
      googleCalendarEvents.forEach((ge) => {
        const gcalStart = parseGoogleDateValue(ge.start);
        const gcalEnd = parseGoogleDateValue(ge.end) ?? gcalStart;
        if (!gcalStart || !gcalEnd) return;

        let rangeEnd = new Date(gcalEnd);
        if (ge.allDay && getLocalDateKey(gcalStart) !== getLocalDateKey(gcalEnd)) {
          rangeEnd.setDate(rangeEnd.getDate() - 1);
        }

        const includeInDate = dateInRange(
          d,
          m,
          y,
          gcalStart.getDate(),
          gcalStart.getMonth(),
          gcalStart.getFullYear(),
          rangeEnd.getDate(),
          rangeEnd.getMonth(),
          rangeEnd.getFullYear(),
        );

        if (!includeInDate) return;

        const isMultiDay =
          gcalStart.getDate() !== rangeEnd.getDate() ||
          gcalStart.getMonth() !== rangeEnd.getMonth() ||
          gcalStart.getFullYear() !== rangeEnd.getFullYear();

        const isStartDay =
          d === gcalStart.getDate() &&
          m === gcalStart.getMonth() &&
          y === gcalStart.getFullYear();

        const isEndDay =
          d === rangeEnd.getDate() &&
          m === rangeEnd.getMonth() &&
          y === rangeEnd.getFullYear();

        const startMinutes = gcalStart.getHours() * 60 + gcalStart.getMinutes();
        const endMinutes = gcalEnd.getHours() * 60 + gcalEnd.getMinutes();

        let hour: number | null = null;
        let endHour: number | null = null;
        let startDateTime: Date | null = null;
        let endDateTime: Date | null = null;

        if (ge.allDay) {
          startDateTime = new Date(y, m, d, 0, 0, 0, 0);
          endDateTime = new Date(y, m, d, 23, 59, 59, 999);
        } else if (isMultiDay) {
          if (isStartDay) {
            hour = minutesToHour(startMinutes);
            endHour = 24;
            startDateTime = dateWithMinutes(activeDate, startMinutes);
            endDateTime = dateWithMinutes(activeDate, 24 * 60);
          } else if (isEndDay) {
            hour = 0;
            endHour = minutesToHour(endMinutes) ?? 24;
            startDateTime = dateWithMinutes(activeDate, 0);
            endDateTime = dateWithMinutes(activeDate, endMinutes);
          } else {
            hour = 0;
            endHour = 24;
            startDateTime = dateWithMinutes(activeDate, 0);
            endDateTime = dateWithMinutes(activeDate, 24 * 60);
          }
        } else {
          hour = minutesToHour(startMinutes);
          endHour = minutesToHour(endMinutes);
          startDateTime = dateWithMinutes(activeDate, startMinutes);
          endDateTime = dateWithMinutes(activeDate, endMinutes);
        }

        items.push({
          id: `gcal-${ge.id}`,
          title: ge.title,
          time: ge.start || "All day",
          allDay: ge.allDay,
          hour,
          endHour,
          assignee: ge.assignee || "me",
          groupId: null,
          type: "gcal",
          raw: ge,
          done: ge.done ?? false,
          isMultiDay,
          isStart: isStartDay,
          isEnd: isEndDay,
          startDateTime,
          endDateTime,
        });
      });
    }

    items.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;

      const aStart = a.startDateTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.startDateTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;

      return a.title.localeCompare(b.title);
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

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const t = new Date();
    setCurrentDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  };
  const selectDay = (d: number) => setSelectedDate(new Date(year, month, d));

  // ── Swipe ─────────────────────────────────────────────

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) { diff > 0 ? prevMonth() : nextMonth(); }
  };

  // ── Open add form with defaults ───────────────────────

  const openAddForm = () => {
    const sd = selectedDate;
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setNewStartDate(fmt(sd));
    setNewEndDate(fmt(sd));
    setNewStartTime("");
    setNewEndTime("");
    setNewAllDay(false);
    setNewTitle("");
    setNewUser("me");
    setNewDesc("");
    setShowAddForm(true);
  };

  // Auto-adjust end when start changes
  const handleStartDateChange = (v: string) => {
    setNewStartDate(v);
    if (!newEndDate || v > newEndDate) setNewEndDate(v);
  };
  const handleStartTimeChange = (v: string) => {
    setNewStartTime(v);
    if (v && !newEndTime) {
      // default 1 hour later
      const [h, m] = v.split(":").map(Number);
      const eh = Math.min(h + 1, 23);
      setNewEndTime(`${String(eh).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    } else if (v && newEndTime && newStartDate === newEndDate && v >= newEndTime) {
      const [h, m] = v.split(":").map(Number);
      const eh = Math.min(h + 1, 23);
      setNewEndTime(`${String(eh).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  };

  // ── Add event handler ─────────────────────────────────

  const handleAddEvent = () => {
    if (!newTitle.trim()) return;
    const startParts = newStartDate ? keyToDate(newStartDate) : { day: selDay, month: selMonth, year: selYear };
    const endParts = newEndDate ? keyToDate(newEndDate) : startParts;

    addEvent({
      title: newTitle.trim(),
      time: newAllDay ? "All day" : (newStartTime || "All day"),
      description: newDesc,
      day: startParts.day,
      month: startParts.month,
      year: startParts.year,
      endDay: endParts.day,
      endMonth: endParts.month,
      endYear: endParts.year,
      endTime: newAllDay ? "" : (newEndTime || newStartTime || ""),
      allDay: newAllDay,
      user: newUser,
    });

    toast.success(`Scheduled: ${newTitle.trim()}`);
    setShowAddForm(false);
  };

  // Scroll time grid to 8am
  useEffect(() => {
    if ((viewMode === "day" || viewMode === "3day") && timeGridRef.current) {
      timeGridRef.current.scrollTop = 8 * 60;
    }
  }, [viewMode]);

  // ── Search results ────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { item: CalItem; dateLabel: string }[] = [];

    events.forEach((e) => {
      if (e.title.toLowerCase().includes(q)) {
        const hasEnd = e.endDay && !(e.endDay === e.day && e.endMonth === e.month && e.endYear === e.year);
        const startLabel = new Date(e.year, e.month, e.day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const endLabel = hasEnd ? ` – ${new Date(e.endYear!, e.endMonth!, e.endDay!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
        results.push({
          item: {
            id: `ev-${e.id}`, title: e.title, time: e.time,
            endTime: e.endTime,
            allDay: e.allDay ?? false, hour: timeToHour(e.time), endHour: timeToHour(e.endTime || ""),
            assignee: e.user, groupId: e.groupId, type: "event", raw: e,
          },
          dateLabel: startLabel + endLabel,
        });
      }
    });

    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q) && t.scheduledDay) {
        results.push({
          item: {
            id: `tk-${t.id}`, title: t.title, time: t.time,
            allDay: !t.time, hour: timeToHour(t.time), endHour: null,
            assignee: t.assignee, done: t.done, tag: t.tag,
            groupId: t.groupId, type: "task", raw: t,
          },
          dateLabel: new Date(t.scheduledYear!, t.scheduledMonth!, t.scheduledDay!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
      }
    });

    googleCalendarEvents.forEach((ge) => {
      if (ge.title.toLowerCase().includes(q)) {
        results.push({
          item: {
            id: `gcal-${ge.id}`, title: ge.title, time: ge.start || "",
            allDay: ge.allDay, hour: null, endHour: null, assignee: ge.assignee || "me",
            groupId: null, type: "gcal", raw: ge,
          },
          dateLabel: ge.start ? new Date(ge.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        });
      }
    });

    return results.slice(0, 20);
  }, [searchQuery, events, tasks, googleCalendarEvents]);

  // ── Color helpers ─────────────────────────────────────

  const getColorClasses = (groupId: string | null | undefined) =>
    GROUP_COLOR_CLASSES[getGroupColorIndex(groupId, groups)];

  const getGroupName = (groupId: string | null | undefined) =>
    groupId ? groups.find((g) => g.id === groupId) : null;

  // ── 3-day dates ───────────────────────────────────────

  const threeDayDates = useMemo(() => {
    const d = new Date(selYear, selMonth, selDay);
    return [d, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2)];
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
          <div className="flex items-center gap-0.5">
            <button onClick={() => setShowSearch(true)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground">
              <Search size={16} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 px-2 flex items-center gap-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-full">
                  <CalendarIcon size={13} />
                  <span>{VIEW_LABELS[viewMode]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px]">
                {(["month", "list", "day", "3day"] as ViewMode[]).map((mode) => (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={viewMode === mode ? "bg-accent font-semibold" : ""}
                  >
                    {VIEW_LABELS[mode]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button onClick={openAddForm} className="w-7 h-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus size={14} />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />

            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronLeft size={18} />
            </button>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronRight size={18} />
            </button>
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Group Selector ──────────────────────────────── */}
      <div className="mb-2">
        <GroupSelector />
      </div>

      {/* ── ADD EVENT FORM (Slide-down) ─────────────────── */}
      {showAddForm && (
        <div className="mb-3 bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">New Event</h3>
            <button onClick={() => setShowAddForm(false)} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
              <X size={14} />
            </button>
          </div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Event title..."
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />

          {/* All-day toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newAllDay} onChange={(e) => setNewAllDay(e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">All-day</span>
          </label>

          {/* Start */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground">Start</label>
              <input type="date" value={newStartDate} onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
            </div>
            {!newAllDay && (
              <div className="w-28">
                <label className="text-[10px] uppercase font-semibold text-muted-foreground">Time</label>
                <input type="time" value={newStartTime} onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
              </div>
            )}
          </div>

          {/* End */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground">End</label>
              <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} min={newStartDate}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
            </div>
            {!newAllDay && (
              <div className="w-28">
                <label className="text-[10px] uppercase font-semibold text-muted-foreground">Time</label>
                <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
              </div>
            )}
          </div>

          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Notes (optional)..."
            rows={2}
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground resize-none"
          />

          {/* Assignee */}
          <div className="flex gap-1.5">
            {(["me", "partner", "both"] as const).map((u) => (
              <button key={u} onClick={() => setNewUser(u)}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  newUser === u ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}>
                {u === "me" ? "Mine" : u === "partner" ? "Partner" : "Both"}
              </button>
            ))}
          </div>

          <button onClick={handleAddEvent} className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold">
            Add Event
          </button>
        </div>
      )}

      {/* ── MONTH VIEW ──────────────────────────────────── */}
      {viewMode === "month" && (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

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
                <button key={day} onClick={() => selectDay(day)} className="h-11 flex flex-col items-center justify-center relative">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] transition-all ${
                    isSelected ? "bg-primary text-primary-foreground font-semibold"
                      : isTodayDay ? "bg-destructive text-destructive-foreground font-semibold"
                      : "text-foreground hover:bg-secondary"
                  }`}>
                    {day}
                  </span>
                  {dots && !isSelected && (
                    <div className="flex gap-[2px] absolute bottom-0">
                      {Array.from(dots).slice(0, 3).map((gid, idx) => {
                        const colorIdx = gid === "__default" ? 0 : getGroupColorIndex(gid, groups);
                        return (
                          <span key={idx} className="w-[4px] h-[4px] rounded-full"
                            style={{ backgroundColor: GROUP_COLORS[colorIdx % GROUP_COLORS.length] }} />
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day event list */}
          <div className="mt-3 border-t border-border pt-3">
            <h2 className="text-[13px] font-semibold text-foreground mb-2">
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            {selectedDayItems.length === 0 ? (
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

      {/* ── DAY VIEW ────────────────────────────────────── */}
      {viewMode === "day" && (
        <TimeGridView dates={[selectedDate]} getItemsForDate={getItemsForDate} groups={groups} timeGridRef={timeGridRef} />
      )}

      {/* ── 3-DAY VIEW ──────────────────────────────────── */}
      {viewMode === "3day" && (
        <TimeGridView dates={threeDayDates} getItemsForDate={getItemsForDate} groups={groups} timeGridRef={timeGridRef} />
      )}

      {/* ── Search Modal ────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
          <div className="px-4 pt-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 flex items-center bg-secondary rounded-xl px-3 py-2 gap-2">
                <Search size={16} className="text-muted-foreground flex-shrink-0" />
                <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-muted-foreground"><X size={14} /></button>
                )}
              </div>
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-sm font-medium text-primary">Cancel</button>
            </div>

            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {searchResults.map((r) => {
                const group = getGroupName(r.item.groupId);
                const colorClasses = getColorClasses(r.item.groupId);
                return (
                  <button key={r.item.id} onClick={() => {
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
                  }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left">
                    <span className={`w-[3px] h-8 rounded-full ${colorClasses.bg} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.dateLabel}
                        {r.item.time && r.item.time !== "All day" && ` · ${formatTime(r.item.time)}`}
                        {r.item.endTime && r.item.endTime !== r.item.time && ` – ${formatTime(r.item.endTime)}`}
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
  items, groups, getColorClasses,
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
                {item.isMultiDay && (
                  <span className="text-[10px] text-muted-foreground">multi-day</span>
                )}
                {group && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{group.emoji} {group.name}</span>
                )}
                <UserBadge user={item.assignee} />
              </div>
            );
          })}
        </div>
      )}

      {timedItems.map((item) => {
        const colors = getColorClasses(item.groupId);
        const group = !activeGroup && item.groupId ? groups.find((g) => g.id === item.groupId) : null;
        const displayTime = item.type === "gcal" && item.time
          ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : formatTime(item.time);
        const displayEndTime = item.endTime ? formatTime(item.endTime) : null;

        return (
          <div key={item.id} className="flex items-center gap-2.5 py-2 px-1">
            <span className={`w-[3px] h-5 rounded-full ${colors.bg} flex-shrink-0`} />
            <span className="text-[11px] text-muted-foreground w-16 flex-shrink-0 tabular-nums">
              {displayTime}{displayEndTime && displayEndTime !== displayTime ? `–${displayEndTime}` : ""}
            </span>
            <span className={`text-[13px] font-medium flex-1 truncate ${item.done ? "line-through opacity-40" : "text-foreground"}`}>
              {item.title}
            </span>
            {group && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{group.emoji} {group.name}</span>
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
  dates, getItemsForDate, groups, timeGridRef,
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
    isToday: d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear(),
  }));

  const hourHeight = 60;

  // Layout overlapping events side-by-side
  const layoutEvents = (items: CalItem[]) => {
    const timed = items.filter((it) => !it.allDay && it.hour != null);
    const sorted = [...timed].sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
    const positioned: { item: CalItem; col: number; totalCols: number }[] = [];

    sorted.forEach((item) => {
      const startH = item.hour!;
      const endH = item.endHour ?? startH + 1;

      // Find overlapping group
      const overlapping = positioned.filter((p) => {
        const pStart = p.item.hour!;
        const pEnd = p.item.endHour ?? pStart + 1;
        return startH < pEnd && endH > pStart;
      });

      const usedCols = new Set(overlapping.map((o) => o.col));
      let col = 0;
      while (usedCols.has(col)) col++;

      positioned.push({ item, col, totalCols: 1 });

      // Update totalCols for all overlapping items
      const group = [...overlapping, { item, col, totalCols: 1 }];
      const maxCol = Math.max(...group.map((g) => g.col)) + 1;
      group.forEach((g) => { g.totalCols = maxCol; });
      overlapping.forEach((o) => { o.totalCols = maxCol; });
    });

    return positioned;
  };

  return (
    <div>
      <div className="flex border-b border-border mb-0">
        <div className="w-12 flex-shrink-0" />
        {columns.map((col, i) => (
          <div key={i} className={`flex-1 text-center py-2 text-[12px] font-semibold ${col.isToday ? "text-primary" : "text-foreground"}`}>
            {col.label}
          </div>
        ))}
      </div>

      {/* All-day row */}
      {columns.some((c) => c.items.some((it) => it.allDay)) && (
        <div className="flex border-b border-border">
          <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground flex items-center justify-end pr-2">all-day</div>
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 p-0.5 min-h-[28px] border-l border-border">
              {col.items.filter((it) => it.allDay).map((it) => {
                const colorIdx = getGroupColorIndex(it.groupId, groups);
                return (
                  <div key={it.id} className="text-[10px] font-medium rounded px-1 py-0.5 truncate mb-0.5"
                    style={{ backgroundColor: GROUP_COLORS[colorIdx] + "22", color: GROUP_COLORS[colorIdx] }}>
                    {it.title}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div ref={timeGridRef} className="overflow-y-auto relative" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div className="flex" style={{ height: 24 * hourHeight }}>
          <div className="w-12 flex-shrink-0 relative">
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full text-right pr-2 text-[10px] text-muted-foreground" style={{ top: h * hourHeight - 6 }}>
                {h === 0 ? "" : `${h > 12 ? h - 12 : h}${h >= 12 ? "PM" : "AM"}`}
              </div>
            ))}
          </div>

          {columns.map((col, ci) => {
            const positioned = layoutEvents(col.items);

            return (
              <div key={ci} className="flex-1 relative border-l border-border">
                {HOURS.map((h) => (
                  <div key={h} className="absolute w-full border-t border-border/50" style={{ top: h * hourHeight }} />
                ))}

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

                {positioned.map(({ item, col: colIdx, totalCols }) => {
                  const colorIdx = getGroupColorIndex(item.groupId, groups);
                  const top = item.hour! * hourHeight;
                  const endH = item.endHour ?? item.hour! + 1;
                  const duration = Math.max(endH - item.hour!, 0.25);
                  const height = Math.max(duration * hourHeight, 20);
                  const width = `calc(${100 / totalCols}% - 2px)`;
                  const left = `calc(${(colIdx / totalCols) * 100}% + 1px)`;

                  return (
                    <div key={item.id} className="absolute rounded-md px-1.5 py-1 overflow-hidden cursor-pointer"
                      style={{
                        top, height, width, left,
                        backgroundColor: GROUP_COLORS[colorIdx] + "22",
                        borderLeft: `3px solid ${GROUP_COLORS[colorIdx]}`,
                      }}>
                      <p className="text-[10px] font-semibold truncate" style={{ color: GROUP_COLORS[colorIdx] }}>{item.title}</p>
                      <p className="text-[9px] text-muted-foreground truncate">
                        {item.type === "gcal" ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : formatTime(item.time)}
                        {item.endTime ? ` – ${formatTime(item.endTime)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
