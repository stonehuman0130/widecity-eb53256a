import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Check, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import TaskTag from "@/components/TaskTag";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface UnifiedItem {
  id: string;
  type: "task" | "event" | "gcal";
  title: string;
  time: string;
  sortMinutes: number; // -1 for untimed
  assignee: "me" | "partner" | "both";
  done: boolean;
  isOwn: boolean;
  tag?: string;
  original: Task | ScheduledEvent | GoogleCalendarEvent;
}

interface TeamDashboardProps {
  myTasks: Task[];
  myEvents: ScheduledEvent[];
  partnerTasks: Task[];
  partnerEvents: ScheduledEvent[];
  gcalEvents: GoogleCalendarEvent[];
  toggleTask: (id: string) => void;
  removeEvent: (id: string) => void;
  removeTask?: (id: string) => void;
  toggleEventVisibility?: (id: string) => void;
  rescheduleEvent?: (id: string, day: number, month: number, year: number) => void;
  hideGcalEvent?: (eventId: string) => void;
  designateGcalEvent?: (eventId: string, assignee: "me" | "partner" | "both") => void;
  onCongrats: () => void;
}

/** Parse time string like "14:30", "2:00 PM" into minutes since midnight */
function parseTimeToMinutes(time?: string): number {
  if (!time || time === "" || time === "All day") return -1;
  // Try HH:MM format
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return parseInt(match24[1]) * 60 + parseInt(match24[2]);
  // Try 12h format
  const match12 = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = parseInt(match12[2]);
    const isPM = match12[3].toUpperCase() === "PM";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }
  return -1;
}

const TeamDashboard = ({
  myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents,
  toggleTask, removeEvent, removeTask, toggleEventVisibility, rescheduleEvent,
  hideGcalEvent, designateGcalEvent, onCongrats,
}: TeamDashboardProps) => {
  const { user, profile, activeGroup } = useAuth();

  const members = useMemo(() => {
    if (!activeGroup || !user) return [{ id: "me", name: profile?.display_name || "Me" }];
    return activeGroup.members.map((m) => ({
      id: m.user_id === user.id ? "me" : "partner",
      userId: m.user_id,
      name: m.display_name || "Member",
    }));
  }, [activeGroup, user, profile]);

  const meName = profile?.display_name || "Me";
  const partnerMember = members.find((m) => m.id === "partner");
  const partnerNameLabel = partnerMember?.name || "Partner";
  const memberIds = members.map((m) => m.id);

  // Build unified items
  const allItems = useMemo(() => {
    const items: UnifiedItem[] = [];

    myTasks.forEach((t) => items.push({
      id: t.id, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time),
      assignee: t.assignee, done: t.done, isOwn: true,
      tag: t.tag, original: t,
    }));

    myEvents.forEach((e) => items.push({
      id: e.id, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time),
      assignee: e.user, done: false, isOwn: true, original: e,
    }));

    partnerTasks.forEach((t) => items.push({
      id: `p-${t.id}`, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time),
      assignee: t.assignee, done: t.done, isOwn: false,
      tag: t.tag, original: t,
    }));

    partnerEvents.forEach((e) => items.push({
      id: `p-${e.id}`, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time),
      assignee: e.user, done: false, isOwn: false, original: e,
    }));

    gcalEvents.forEach((ge) => {
      const timeStr = ge.allDay ? "" : (ge.start ? new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");
      items.push({
        id: `gcal-${ge.id}`, type: "gcal", title: ge.title,
        time: timeStr,
        sortMinutes: ge.allDay ? -1 : (ge.start ? new Date(ge.start).getHours() * 60 + new Date(ge.start).getMinutes() : -1),
        assignee: ge.assignee || "me", done: false, isOwn: true, original: ge,
      });
    });

    return items;
  }, [myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents]);

  // Deduplicate shared items (same title+time appearing from both sides)
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return allItems.filter((item) => {
      if (item.assignee === "both") {
        const key = `${item.title}|${item.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    });
  }, [allItems]);

  // Split into timed and untimed, sort timed chronologically
  const timedItems = useMemo(() =>
    deduped.filter((i) => i.sortMinutes >= 0).sort((a, b) => a.sortMinutes - b.sortMinutes),
    [deduped]
  );
  const untimedItems = useMemo(() =>
    deduped.filter((i) => i.sortMinutes < 0),
    [deduped]
  );

  const renderCard = (item: UnifiedItem, spanning: boolean) => {
    const isShared = item.assignee === "both";
    return (
      <motion.div
        key={item.id}
        layout
        className={`rounded-xl p-3 shadow-card border transition-all ${
          item.done ? "border-habit-green/50 bg-card" : "border-border bg-card"
        } ${isShared && spanning ? "border-primary/30 bg-primary/5" : ""}`}
      >
        <div className="flex items-center gap-2">
          {item.type === "gcal" ? (
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-[10px]">📅</span>
          ) : (
            <button
              onClick={() => {
                if (!item.isOwn || item.type !== "task") return;
                if (!item.done) onCongrats();
                toggleTask((item.original as Task).id);
              }}
              disabled={!item.isOwn || item.type !== "task"}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                item.done ? "bg-habit-green border-habit-green" : "border-muted"
              } ${!item.isOwn ? "opacity-60" : ""}`}
            >
              {item.done && <Check size={10} className="text-primary-foreground" />}
            </button>
          )}
          {item.sortMinutes >= 0 && (
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
              {formatTime(item.time)}
            </span>
          )}
          <span className={`flex-1 text-[13px] font-medium tracking-body leading-tight truncate ${item.done ? "line-through opacity-40" : ""}`}>
            {item.title}
          </span>
          {isShared && (
            <div className="flex -space-x-1.5 flex-shrink-0">
              <div className="w-4 h-4 rounded-full bg-user-a flex items-center justify-center text-[8px] font-bold text-primary-foreground ring-1 ring-card">
                {meName.charAt(0).toUpperCase()}
              </div>
              <div className="w-4 h-4 rounded-full bg-user-b flex items-center justify-center text-[8px] font-bold text-primary-foreground ring-1 ring-card">
                {partnerNameLabel.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          {item.type === "gcal" && (
            <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded flex-shrink-0">Google</span>
          )}
        </div>
        {item.tag && (
          <div className="mt-1.5 ml-7">
            <TaskTag tag={item.tag as "Work" | "Personal" | "Household"} />
          </div>
        )}
      </motion.div>
    );
  };

  /** Render a row inside the board. Individual items go in their column, shared items span. */
  const renderRow = (item: UnifiedItem, colCount: number) => {
    const isShared = item.assignee === "both";

    if (isShared) {
      // Shared card spanning full width inside the board
      return (
        <div key={item.id} className="px-2 py-1">
          {renderCard(item, true)}
        </div>
      );
    }

    // Individual item: place in correct column
    const colIndex = item.assignee === "me" ? 0 : 1;
    return (
      <div key={item.id} className="flex" style={{ minHeight: 0 }}>
        {Array.from({ length: colCount }).map((_, ci) => (
          <div
            key={ci}
            className={`flex-1 px-2 py-1 ${ci < colCount - 1 ? "border-r border-border" : ""}`}
            style={{ minWidth: 0 }}
          >
            {ci === colIndex ? renderCard(item, false) : null}
          </div>
        ))}
      </div>
    );
  };

  const colCount = members.length >= 2 ? 2 : 1; // Extend for more members later

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-display">Team Dashboard</h2>
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
        {/* Column headers */}
        <div className="flex border-b border-border">
          {members.slice(0, colCount).map((m, i) => (
            <div
              key={m.id}
              className={`flex-1 p-3 flex items-center gap-2 ${i < colCount - 1 ? "border-r border-border" : ""}`}
            >
              <div className={`w-6 h-6 rounded-full ${m.id === "me" ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-foreground">{m.name}</span>
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                {deduped.filter((item) => item.assignee === m.id || item.assignee === "both").length}
              </span>
            </div>
          ))}
        </div>

        {/* Scheduled section */}
        {timedItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-secondary/50 border-b border-border">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Scheduled</span>
            </div>
            {timedItems.map((item) => renderRow(item, colCount))}
          </div>
        )}

        {/* Untimed / To Do section */}
        {untimedItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-secondary/50 border-b border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">To Do</span>
            </div>
            {untimedItems.map((item) => renderRow(item, colCount))}
          </div>
        )}

        {deduped.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 opacity-60">Nothing scheduled for today</p>
        )}
      </div>
    </section>
  );
};

export default TeamDashboard;
