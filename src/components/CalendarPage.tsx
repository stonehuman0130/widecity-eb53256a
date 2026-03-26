import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Search,
  Calendar as CalendarIcon, Settings,
} from "lucide-react";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import UserBadge from "@/components/UserBadge";
import GroupSelector from "@/components/GroupSelector";
import { useGroupContext } from "@/hooks/useGroupContext";
import { formatTime } from "@/lib/formatTime";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import CalendarItemDetailModal from "@/components/CalendarItemDetailModal";
import CalendarCreateEditModal from "@/components/CalendarCreateEditModal";
import CalendarsManager from "@/components/CalendarsManager";

// ── Constants ──────────────────────────────────────────────

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
  }
  const parsed = new Date(time);
  if (!isNaN(parsed.getTime())) return parsed.getHours() * 60 + parsed.getMinutes();
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

function dateInRange(d: number, m: number, y: number, startD: number, startM: number, startY: number, endD: number, endM: number, endY: number) {
  const dt = new Date(y, m, d).getTime();
  const st = new Date(startY, startM, startD).getTime();
  const et = new Date(endY, endM, endD).getTime();
  return dt >= st && dt <= et;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
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
  isDueDateTask?: boolean;
}

const TODO_COLOR = "hsl(280 70% 55%)";
const TODO_COLOR_CLASSES = { bg: "bg-violet-500", text: "text-violet-500", bgLight: "bg-violet-500/15", border: "border-violet-500/30" };

// ── Main Component ──────────────────────────────────────────

const CalendarPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
  const {
    events, filteredEvents, removeEvent, rescheduleEvent,
    tasks, filteredTasks, toggleTask, removeTask,
    googleCalendarEvents, hideGcalEvent, toggleGcalCompletion, toggleEventVisibility, designateGcalEvent,
    toggleEventCompletion,
  } = useAppContext();
  const { activeGroup, groups } = useAuth();
  const { showGoogleCalendar } = useGroupContext();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [showSearch, setShowSearch] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<CalItem | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; type: "event" | "task"; raw: ScheduledEvent | Task; isDueDateTask?: boolean; done?: boolean } | null>(null);
  const [showCalendarsManager, setShowCalendarsManager] = useState(false);
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

    const dateKey = dateToKey(d, m, y);
    filteredTasks
      .filter((t) => {
        if (!t.dueDate) return false;
        if (t.dueDate !== dateKey) return false;
        if (t.scheduledDay === d && t.scheduledMonth === m && t.scheduledYear === y) return false;
        return true;
      })
      .forEach((t) => {
        items.push({
          id: `todo-${t.id}`,
          title: t.title,
          time: "All day",
          allDay: true,
          hour: null,
          endHour: null,
          assignee: t.assignee,
          done: t.done,
          tag: t.tag,
          groupId: t.groupId,
          type: "task",
          raw: t,
          startDateTime: new Date(y, m, d, 0, 0, 0, 0),
          endDateTime: new Date(y, m, d, 23, 59, 59, 999),
          isDueDateTask: true,
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
          d, m, y,
          gcalStart.getDate(), gcalStart.getMonth(), gcalStart.getFullYear(),
          rangeEnd.getDate(), rangeEnd.getMonth(), rangeEnd.getFullYear(),
        );

        if (!includeInDate) return;

        const isMultiDay =
          gcalStart.getDate() !== rangeEnd.getDate() ||
          gcalStart.getMonth() !== rangeEnd.getMonth() ||
          gcalStart.getFullYear() !== rangeEnd.getFullYear();

        const isStartDay =
          d === gcalStart.getDate() && m === gcalStart.getMonth() && y === gcalStart.getFullYear();
        const isEndDay =
          d === rangeEnd.getDate() && m === rangeEnd.getMonth() && y === rangeEnd.getFullYear();

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
      if (a.isDueDateTask && !b.isDueDateTask) return -1;
      if (!a.isDueDateTask && b.isDueDateTask) return 1;
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
        items.forEach((it) => {
          if (it.isDueDateTask) {
            groupIds.add("__todo");
          } else {
            groupIds.add(it.groupId || "__default");
          }
        });
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

  const openAddForm = () => setShowCreateModal(true);

  const handleEditFromDetail = (item: CalItem) => {
    setSelectedItem(null);
    if (item.type === "gcal") return;
    setEditingItem({
      id: item.id,
      type: item.type,
      raw: item.raw as ScheduledEvent | Task,
      isDueDateTask: item.isDueDateTask,
      done: item.done,
    });
  };

  // Scroll time grid to 8am
  useEffect(() => {
    if ((viewMode === "day" || viewMode === "3day") && timeGridRef.current) {
      timeGridRef.current.scrollTop = 8 * 60;
    }
  }, [viewMode]);

  // ── Day/3-Day swipe handlers ──────────────────────────

  const handleDaySwipe = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 50) {
      setSelectedDate((prev) => addDays(prev, info.offset.x > 0 ? -1 : 1));
    }
  }, []);

  const handleThreeDaySwipe = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 50) {
      setSelectedDate((prev) => addDays(prev, info.offset.x > 0 ? -3 : 3));
    }
  }, []);

  // Sync currentDate when selectedDate changes (for day/3day views)
  useEffect(() => {
    if (viewMode === "day" || viewMode === "3day") {
      setCurrentDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate, viewMode]);

  // ── Month swipe for month view ────────────────────────

  const handleMonthSwipe = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.y) > 60) {
      if (info.offset.y > 0) {
        prevMonth();
      } else {
        nextMonth();
      }
    }
  }, [year, month]);

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
      if (t.title.toLowerCase().includes(q) && (t.scheduledDay || t.dueDate)) {
        const dateLabel = t.dueDate
          ? (() => { const [yy, mm, dd] = t.dueDate.split("-").map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); })()
          : new Date(t.scheduledYear!, t.scheduledMonth!, t.scheduledDay!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        results.push({
          item: {
            id: `tk-${t.id}`, title: t.title, time: t.time,
            allDay: !t.time, hour: timeToHour(t.time), endHour: null,
            assignee: t.assignee, done: t.done, tag: t.tag,
            groupId: t.groupId, type: "task", raw: t,
            isDueDateTask: !!t.dueDate,
          },
          dateLabel,
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
    return [d, addDays(d, 1), addDays(d, 2)];
  }, [selDay, selMonth, selYear]);

  // ── Date strip for Day/3-Day views ────────────────────

  const dateStripDates = useMemo(() => {
    // Show a 7-day strip centered around selected date
    const dates: Date[] = [];
    const center = new Date(selYear, selMonth, selDay);
    for (let i = -3; i <= 3; i++) {
      dates.push(addDays(center, i));
    }
    return dates;
  }, [selDay, selMonth, selYear]);

  // ── List view: generate dates for continuous scroll ───

  const listViewDates = useMemo(() => {
    // Show 60 days: 15 before today's month start, rest after
    const dates: Date[] = [];
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - 15);
    for (let i = 0; i < 75; i++) {
      dates.push(addDays(start, i));
    }
    return dates;
  }, [year, month]);

  // List view month header tracking
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [listVisibleMonth, setListVisibleMonth] = useState(`${monthName} ${year}`);
  const listDayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleListScroll = useCallback(() => {
    if (!listScrollRef.current) return;
    const container = listScrollRef.current;
    const containerTop = container.getBoundingClientRect().top;

    // Find the first visible day element
    let found = false;
    for (const [key, el] of listDayRefs.current.entries()) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= containerTop - 10) {
        const { month: m, year: y } = keyToDate(key);
        const label = new Date(y, m, 1).toLocaleString("default", { month: "long" }) + " " + y;
        setListVisibleMonth(label);
        found = true;
        break;
      }
    }

    // Load more dates if near the bottom
    if (!found) {
      // Just keep current label
    }
  }, []);

  // Scroll list to today on mount
  useEffect(() => {
    if (viewMode === "list" && listScrollRef.current) {
      const todayKey = dateToKey(today.getDate(), today.getMonth(), today.getFullYear());
      const el = listDayRefs.current.get(todayKey);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ block: "start" });
        }, 100);
      }
    }
  }, [viewMode]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="px-4 pb-24">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="pt-10 pb-2">
        <div className="flex items-center justify-between">
          {viewMode === "list" ? (
            <button onClick={goToday} className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors">
              <h1 className="text-xl font-bold text-foreground">{listVisibleMonth}</h1>
            </button>
          ) : viewMode === "day" || viewMode === "3day" ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors">
                  <h1 className="text-xl font-bold text-foreground">
                    {selectedDate.toLocaleString("default", { month: "long" })}
                  </h1>
                  <span className="text-xl font-light text-muted-foreground">{selYear}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  defaultMonth={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors">
                  <h1 className="text-xl font-bold text-foreground">{monthName}</h1>
                  <span className="text-xl font-light text-muted-foreground">{year}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  defaultMonth={currentDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
          <div className="flex items-center gap-0.5">
            <button onClick={goToday} className="h-7 px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 rounded-full transition-colors">
              Today
            </button>
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

            {onOpenSettings && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button onClick={onOpenSettings} className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Settings size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Group Selector ──────────────────────────────── */}
      <div className="mb-2">
        <GroupSelector />
      </div>

      {/* ── Create/Edit Modal ──────────────────────────── */}
      <CalendarCreateEditModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        defaultDate={selectedDate}
      />
      <CalendarCreateEditModal
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        editItem={editingItem}
      />

      {/* ── MONTH VIEW (swipeable vertically) ──────────── */}
      {viewMode === "month" && (
        <motion.div
          onPanEnd={handleMonthSwipe}
          style={{ touchAction: "pan-x" }}
        >
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <AnimatePresence mode="popLayout">
            <motion.div
              key={`${year}-${month}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-7"
            >
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
                          const dotColor = gid === "__todo" ? TODO_COLOR : GROUP_COLORS[(gid === "__default" ? 0 : getGroupColorIndex(gid, groups)) % GROUP_COLORS.length];
                          return (
                            <span key={idx} className="w-[4px] h-[4px] rounded-full"
                              style={{ backgroundColor: dotColor }} />
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {/* Selected day event list */}
          <div className="mt-3 border-t border-border pt-3">
            <h2 className="text-[13px] font-semibold text-foreground mb-2">
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            {selectedDayItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No events</p>
            ) : (
              <EventList items={selectedDayItems} groups={groups} getColorClasses={getColorClasses} onItemTap={setSelectedItem} />
            )}
          </div>
        </motion.div>
      )}

      {/* ── LIST VIEW (continuous scroll) ───────────────── */}
      {viewMode === "list" && (
        <div
          ref={listScrollRef}
          onScroll={handleListScroll}
          className="overflow-y-auto scroll-smooth-touch"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          <div className="space-y-1">
            {listViewDates.map((dateObj) => {
              const d = dateObj.getDate();
              const m = dateObj.getMonth();
              const y = dateObj.getFullYear();
              const key = dateToKey(d, m, y);
              const items = getItemsForDate(d, m, y);
              const isTodayDay = isSameDay(dateObj, today);
              const isFirstOfMonth = d === 1;

              return (
                <div
                  key={key}
                  ref={(el) => {
                    if (el) listDayRefs.current.set(key, el);
                  }}
                >
                  {isFirstOfMonth && (
                    <div className="pt-4 pb-2">
                      <h3 className="text-base font-bold text-foreground">
                        {dateObj.toLocaleString("default", { month: "long" })} {y}
                      </h3>
                    </div>
                  )}
                  <div className={cn(
                    "flex gap-3 py-2 border-b border-border/50",
                    isTodayDay && "bg-primary/5 rounded-lg px-2 -mx-2"
                  )}>
                    <div className="w-12 flex-shrink-0 text-center pt-0.5">
                      <div className={cn(
                        "text-[11px] font-medium",
                        isTodayDay ? "text-primary" : "text-muted-foreground"
                      )}>
                        {DAYS_FULL[dateObj.getDay()]}
                      </div>
                      <div className={cn(
                        "text-lg font-bold leading-tight",
                        isTodayDay ? "text-primary" : "text-foreground"
                      )}>
                        {d}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">No events</p>
                      ) : (
                        <EventList items={items} groups={groups} getColorClasses={getColorClasses} onItemTap={setSelectedItem} compact />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DAY VIEW (with date strip + swipe) ──────────── */}
      {viewMode === "day" && (
        <div>
          {/* Date strip */}
          <DateStrip
            dates={dateStripDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d)}
          />
          {/* Swipeable time grid */}
          <motion.div
            key={getLocalDateKey(selectedDate)}
            onPanEnd={handleDaySwipe}
            style={{ touchAction: "pan-y" }}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TimeGridView
              dates={[selectedDate]}
              getItemsForDate={getItemsForDate}
              groups={groups}
              timeGridRef={timeGridRef}
              onItemTap={setSelectedItem}
              hideColumnHeaders
            />
          </motion.div>
        </div>
      )}

      {/* ── 3-DAY VIEW (with date strip + swipe 3 days) ── */}
      {viewMode === "3day" && (
        <div>
          {/* Date strip for 3-day */}
          <DateStrip
            dates={dateStripDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d)}
            rangeLength={3}
          />
          {/* Swipeable time grid */}
          <motion.div
            key={getLocalDateKey(selectedDate)}
            onPanEnd={handleThreeDaySwipe}
            style={{ touchAction: "pan-y" }}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TimeGridView
              dates={threeDayDates}
              getItemsForDate={getItemsForDate}
              groups={groups}
              timeGridRef={timeGridRef}
              onItemTap={setSelectedItem}
            />
          </motion.div>
        </div>
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
                    <span className={`w-[3px] h-8 rounded-full flex-shrink-0 ${r.item.isDueDateTask ? TODO_COLOR_CLASSES.bg : colorClasses.bg}`} />
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
      {/* ── Item Detail Modal ───────────────────────────── */}
      <CalendarItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} onEdit={handleEditFromDetail} />
    </div>
  );
};

// ── Date Strip Component (Apple Calendar style) ───────────

function keyToDate(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return { day: d, month: m - 1, year: y };
}

const DateStrip = ({
  dates,
  selectedDate,
  onSelectDate,
  rangeLength,
}: {
  dates: Date[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  rangeLength?: number;
}) => {
  const today = new Date();

  return (
    <div className="flex items-stretch border-b border-border mb-0 overflow-x-auto">
      {dates.map((d, i) => {
        const isToday = isSameDay(d, today);
        const isSelected = isSameDay(d, selectedDate);
        const isInRange = rangeLength
          ? d >= selectedDate && d < addDays(selectedDate, rangeLength)
          : isSelected;

        return (
          <button
            key={i}
            onClick={() => onSelectDate(d)}
            className={cn(
              "flex-1 flex flex-col items-center py-2 transition-colors min-w-0",
              isInRange && "bg-primary/10",
              !isInRange && "hover:bg-secondary/50",
            )}
          >
            <span className={cn(
              "text-[10px] font-medium uppercase",
              isToday ? "text-primary" : "text-muted-foreground"
            )}>
              {DAYS_FULL[d.getDay()]}
            </span>
            <span className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full text-[14px] font-semibold mt-0.5 transition-all",
              isSelected ? "bg-primary text-primary-foreground"
                : isToday ? "bg-destructive text-destructive-foreground"
                : isInRange ? "text-primary font-bold"
                : "text-foreground"
            )}>
              {d.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── Event List Component ──────────────────────────────────

const EventList = ({
  items, groups, getColorClasses, onItemTap, compact,
}: {
  items: CalItem[];
  groups: Group[];
  getColorClasses: (gid: string | null | undefined) => typeof GROUP_COLOR_CLASSES[0];
  onItemTap?: (item: CalItem) => void;
  compact?: boolean;
}) => {
  const { activeGroup } = useAuth();
  const todoItems = items.filter((i) => i.isDueDateTask);
  const allDayItems = items.filter((i) => i.allDay && !i.isDueDateTask);
  const timedItems = items.filter((i) => !i.allDay);

  return (
    <div className={compact ? "space-y-0.5" : "divide-y divide-border"}>
      {todoItems.length > 0 && (
        <div className="py-0.5">
          {todoItems.map((item) => {
            const group = !activeGroup && item.groupId ? groups.find((g) => g.id === item.groupId) : null;
            return (
              <button key={item.id} onClick={() => onItemTap?.(item)}
                className="w-full flex items-center gap-2.5 py-1.5 px-1 text-left hover:bg-secondary/50 rounded-lg transition-colors active:bg-secondary">
                <span className={`w-[3px] h-5 rounded-full ${TODO_COLOR_CLASSES.bg} flex-shrink-0`} />
                <span className="text-[11px] text-violet-500 w-12 flex-shrink-0 font-medium">to-do</span>
                <span className={`text-[13px] font-medium flex-1 truncate ${item.done ? "line-through opacity-40" : "text-foreground"}`}>
                  {item.title}
                </span>
                {group && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{group.emoji} {group.name}</span>
                )}
                <UserBadge user={item.assignee} />
              </button>
            );
          })}
        </div>
      )}

      {allDayItems.length > 0 && (
        <div className="py-0.5">
          {allDayItems.map((item) => {
            const colors = getColorClasses(item.groupId);
            const group = !activeGroup && item.groupId ? groups.find((g) => g.id === item.groupId) : null;
            return (
              <button key={item.id} onClick={() => onItemTap?.(item)}
                className="w-full flex items-center gap-2.5 py-1.5 px-1 text-left hover:bg-secondary/50 rounded-lg transition-colors active:bg-secondary">
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
              </button>
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
          <button key={item.id} onClick={() => onItemTap?.(item)}
            className="w-full flex items-center gap-2.5 py-2 px-1 text-left hover:bg-secondary/50 rounded-lg transition-colors active:bg-secondary">
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
          </button>
        );
      })}
    </div>
  );
};

// ── Time Grid View (Day / 3-Day) ──────────────────────────

const TimeGridView = ({
  dates, getItemsForDate, groups, timeGridRef, onItemTap, hideColumnHeaders,
}: {
  dates: Date[];
  getItemsForDate: (d: number, m: number, y: number) => CalItem[];
  groups: Group[];
  timeGridRef: React.RefObject<HTMLDivElement | null>;
  onItemTap?: (item: CalItem) => void;
  hideColumnHeaders?: boolean;
}) => {
  const columns = dates.map((d) => ({
    date: d,
    label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
    items: getItemsForDate(d.getDate(), d.getMonth(), d.getFullYear()),
    isToday: isSameDay(d, new Date()),
  }));

  const hourHeight = 60;

  const layoutEvents = (items: CalItem[]) => {
    const timed = items.filter((it) => !it.allDay && it.hour != null);
    const sorted = [...timed].sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
    const positioned: { item: CalItem; col: number; totalCols: number }[] = [];

    sorted.forEach((item) => {
      const startH = item.hour!;
      const endH = item.endHour ?? startH + 1;
      const overlapping = positioned.filter((p) => {
        const pStart = p.item.hour!;
        const pEnd = p.item.endHour ?? pStart + 1;
        return startH < pEnd && endH > pStart;
      });
      const usedCols = new Set(overlapping.map((o) => o.col));
      let col = 0;
      while (usedCols.has(col)) col++;
      positioned.push({ item, col, totalCols: 1 });
      const group = [...overlapping, { item, col, totalCols: 1 }];
      const maxCol = Math.max(...group.map((g) => g.col)) + 1;
      group.forEach((g) => { g.totalCols = maxCol; });
      overlapping.forEach((o) => { o.totalCols = maxCol; });
    });

    return positioned;
  };

  return (
    <div>
      {/* Column headers (only for multi-column / 3-day) */}
      {!hideColumnHeaders && (
        <div className="flex border-b border-border mb-0">
          <div className="w-12 flex-shrink-0" />
          {columns.map((col, i) => (
            <div key={i} className={`flex-1 text-center py-2 text-[12px] font-semibold ${col.isToday ? "text-primary" : "text-foreground"}`}>
              {col.label}
            </div>
          ))}
        </div>
      )}

      {/* To-do tasks row */}
      {columns.some((c) => c.items.some((it) => it.isDueDateTask)) && (
        <div className="flex border-b border-border">
          <div className="w-12 flex-shrink-0 text-[10px] text-violet-500 flex items-center justify-end pr-2 font-medium">to-do</div>
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 p-0.5 min-h-[28px] border-l border-border">
              {col.items.filter((it) => it.isDueDateTask).map((it) => (
                <button key={it.id} onClick={() => onItemTap?.(it)}
                  className={`w-full text-left text-[10px] font-medium rounded px-1 py-0.5 truncate mb-0.5 hover:opacity-80 active:opacity-60 transition-opacity ${it.done ? "line-through opacity-40" : ""}`}
                  style={{ backgroundColor: TODO_COLOR + "22", color: TODO_COLOR }}>
                  {it.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* All-day row */}
      {columns.some((c) => c.items.some((it) => it.allDay && !it.isDueDateTask)) && (
        <div className="flex border-b border-border">
          <div className="w-12 flex-shrink-0 text-[10px] text-muted-foreground flex items-center justify-end pr-2">all-day</div>
          {columns.map((col, ci) => (
            <div key={ci} className="flex-1 p-0.5 min-h-[28px] border-l border-border">
              {col.items.filter((it) => it.allDay && !it.isDueDateTask).map((it) => {
                const colorIdx = getGroupColorIndex(it.groupId, groups);
                return (
                  <button key={it.id} onClick={() => onItemTap?.(it)}
                    className="w-full text-left text-[10px] font-medium rounded px-1 py-0.5 truncate mb-0.5 hover:opacity-80 active:opacity-60 transition-opacity"
                    style={{ backgroundColor: GROUP_COLORS[colorIdx] + "22", color: GROUP_COLORS[colorIdx] }}>
                    {it.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Time grid with 15-min increments */}
      <div ref={timeGridRef} className="overflow-y-auto relative" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div className="flex" style={{ height: 24 * hourHeight }}>
          {/* Time labels */}
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
                {/* Hour lines (solid) + 15-min lines (dotted) */}
                {HOURS.map((h) => (
                  <div key={h}>
                    <div className="absolute w-full border-t border-border" style={{ top: h * hourHeight }} />
                    <div className="absolute w-full border-t border-dotted border-border/30" style={{ top: h * hourHeight + hourHeight * 0.25 }} />
                    <div className="absolute w-full border-t border-dotted border-border/30" style={{ top: h * hourHeight + hourHeight * 0.5 }} />
                    <div className="absolute w-full border-t border-dotted border-border/30" style={{ top: h * hourHeight + hourHeight * 0.75 }} />
                  </div>
                ))}

                {/* Current time indicator */}
                {col.isToday && (() => {
                  const now = new Date();
                  const nowPos = (now.getHours() + now.getMinutes() / 60) * hourHeight;
                  return (
                    <div className="absolute w-full z-10" style={{ top: nowPos }}>
                      <div className="w-2.5 h-2.5 rounded-full bg-destructive absolute -left-[5px] -top-[4px]" />
                      <div className="h-[2px] w-full bg-destructive" />
                    </div>
                  );
                })()}

                {/* Event blocks */}
                {positioned.map(({ item, col: colIdx, totalCols }) => {
                  const colorIdx = getGroupColorIndex(item.groupId, groups);
                  const color = item.type === "task" ? TODO_COLOR : GROUP_COLORS[colorIdx];
                  const top = item.hour! * hourHeight;
                  const endH = item.endHour ?? item.hour! + 1;
                  const duration = Math.max(endH - item.hour!, 0.25);
                  const height = Math.max(duration * hourHeight, 24);
                  const width = `calc(${100 / totalCols}% - 2px)`;
                  const left = `calc(${(colIdx / totalCols) * 100}% + 1px)`;

                  return (
                    <button key={item.id} onClick={() => onItemTap?.(item)}
                      className="absolute rounded-md overflow-hidden cursor-pointer text-left hover:brightness-110 active:brightness-90 transition-all shadow-sm"
                      style={{
                        top, height, width, left,
                        backgroundColor: color,
                      }}>
                      <div className="px-1.5 py-1 h-full flex flex-col justify-start">
                        <p className="text-[11px] font-semibold leading-tight truncate text-white drop-shadow-sm">{item.title}</p>
                        {height > 30 && (
                          <p className="text-[9px] mt-0.5 truncate text-white/80">
                            {item.type === "gcal" ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : formatTime(item.time)}
                            {item.endTime ? ` – ${formatTime(item.endTime)}` : ""}
                          </p>
                        )}
                      </div>
                    </button>
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
