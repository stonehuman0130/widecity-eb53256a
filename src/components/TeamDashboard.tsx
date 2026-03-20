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
import {
  DashboardMember,
  buildColumnIndexMap,
  resolveAssignedUserIds,
  resolveColumnIndexes,
} from "@/lib/teamDashboardMapping";

interface UnifiedItem {
  id: string;
  type: "task" | "event" | "gcal";
  title: string;
  time: string;
  sortMinutes: number;
  assignee: "me" | "partner" | "both";
  assignedUserIds: string[];
  sourceUserId: string | null;
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

function parseTimeToMinutes(time?: string): number {
  if (!time || time === "" || time === "All day") return -1;
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  const match12 = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const isPM = match12[3].toUpperCase() === "PM";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }
  return -1;
}

const TeamDashboard = ({
  myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents,
  toggleTask, onCongrats,
}: TeamDashboardProps) => {
  const { user, profile, partner, activeGroup } = useAuth();

  // ── Stable userId-based column members ──
  const columnMembers = useMemo<DashboardMember[]>(() => {
    if (!user) return [];
    if (activeGroup) {
      return activeGroup.members.map((m) => ({
        userId: m.user_id,
        name: m.display_name || "Member",
        isSelf: m.user_id === user.id,
      }));
    }
    const base: DashboardMember[] = [{
      userId: user.id, name: profile?.display_name || "Me", isSelf: true,
    }];
    if (partner?.id) {
      base.push({ userId: partner.id, name: partner.display_name || "Partner", isSelf: false });
    }
    return base;
  }, [activeGroup, partner, profile, user]);

  const selfUserId = user?.id ?? "";
  const primaryOtherUserId = useMemo(
    () => columnMembers.find((m) => !m.isSelf)?.userId ?? null,
    [columnMembers],
  );
  const columnIndexByUserId = useMemo(() => buildColumnIndexMap(columnMembers), [columnMembers]);

  // ── Build unified items with userId-based assignment ──
  const allItems = useMemo(() => {
    if (!selfUserId || columnMembers.length === 0) return [] as UnifiedItem[];
    const items: UnifiedItem[] = [];

    myTasks.forEach((t) => items.push({
      id: t.id, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time), assignee: t.assignee,
      assignedUserIds: resolveAssignedUserIds({ assignee: t.assignee, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: t.done, isOwn: true, tag: t.tag, original: t,
    }));

    myEvents.forEach((e) => items.push({
      id: e.id, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: false, isOwn: true, original: e,
    }));

    partnerTasks.forEach((t) => items.push({
      id: `p-${t.id}`, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time), assignee: t.assignee,
      assignedUserIds: resolveAssignedUserIds({ assignee: t.assignee, sourceUserId: primaryOtherUserId, selfUserId, members: columnMembers }),
      sourceUserId: primaryOtherUserId, done: t.done, isOwn: false, tag: t.tag, original: t,
    }));

    partnerEvents.forEach((e) => items.push({
      id: `p-${e.id}`, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: primaryOtherUserId, selfUserId, members: columnMembers }),
      sourceUserId: primaryOtherUserId, done: false, isOwn: false, original: e,
    }));

    gcalEvents.forEach((ge) => {
      const timeStr = ge.allDay ? "" : ge.start ? new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      const src = ge.ownerUserId || selfUserId;
      const assignee = ge.assignee || "me";
      items.push({
        id: `gcal-${ge.id}`, type: "gcal", title: ge.title, time: timeStr,
        sortMinutes: ge.allDay || !ge.start ? -1 : new Date(ge.start).getHours() * 60 + new Date(ge.start).getMinutes(),
        assignee, assignedUserIds: resolveAssignedUserIds({ assignee, sourceUserId: src, selfUserId, members: columnMembers }),
        sourceUserId: src, done: false, isOwn: src === selfUserId, original: ge,
      });
    });

    return items;
  }, [columnMembers, gcalEvents, myEvents, myTasks, partnerEvents, partnerTasks, primaryOtherUserId, selfUserId]);

  const timedItems = useMemo(
    () => allItems.filter((i) => i.sortMinutes >= 0).sort((a, b) => a.sortMinutes - b.sortMinutes || a.title.localeCompare(b.title)),
    [allItems],
  );
  const untimedItems = useMemo(() => allItems.filter((i) => i.sortMinutes < 0), [allItems]);

  const colCount = columnMembers.length;

  // ── Render helpers ──
  const renderCard = (item: UnifiedItem, compact = false) => {
    const isShared = item.assignedUserIds.length > 1 || item.assignee === "both";
    return (
      <motion.div
        key={item.id}
        layout
        className={`rounded-xl p-3 shadow-card border transition-all ${
          item.done ? "border-habit-green/50 bg-card" : "border-border bg-card"
        } ${isShared ? "border-primary/30 bg-primary/5" : ""}`}
      >
        {item.sortMinutes >= 0 && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{formatTime(item.time)}</span>
            {item.type === "gcal" && (
              <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">Google</span>
            )}
          </div>
        )}
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
          <span className={`flex-1 text-[13px] font-medium tracking-body leading-tight ${item.done ? "line-through opacity-40" : ""} ${compact ? "truncate" : ""}`}>
            {item.title}
          </span>
          {isShared && (
            <div className="flex -space-x-1.5">
              {columnMembers.filter((m) => item.assignedUserIds.includes(m.userId)).map((m) => (
                <div key={m.userId} className={`w-4 h-4 rounded-full ${m.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[8px] font-bold text-primary-foreground ring-1 ring-card`}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          {item.type === "gcal" && item.sortMinutes < 0 && (
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

  /** Render a single item row inside the resizable board. Shared items span full width; individual items sit in their column. */
  const renderItemRow = (item: UnifiedItem) => {
    const columnIndexes = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
    if (columnIndexes.length === 0) return null;

    const isShared = columnIndexes.length > 1;

    if (isShared) {
      // Shared card spans full width inside the board
      return (
        <div key={item.id} className="px-2 py-1">
          {renderCard(item)}
        </div>
      );
    }

    // Individual item: render in correct column
    const targetCol = columnIndexes[0];
    return (
      <div key={item.id} className="flex">
        {Array.from({ length: colCount }).map((_, ci) => (
          <div
            key={ci}
            className="flex-1 px-2 py-1"
            style={{ minWidth: 0 }}
          >
            {ci === targetCol ? renderCard(item, true) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-display">Team Dashboard</h2>
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-h-[200px] rounded-xl border border-border bg-secondary/30">
        {columnMembers.map((member, index) => (
          <div key={member.userId} className="contents">
            {index > 0 && <ResizableHandle withHandle />}
            <ResizablePanel defaultSize={Math.floor(100 / colCount)} minSize={25}>
              <div className="p-3 h-full" data-column-header-user-id={member.userId}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <div className={`w-6 h-6 rounded-full ${member.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-foreground">{member.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                    {allItems.filter((item) => {
                      const cols = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
                      return cols.includes(index);
                    }).length}
                  </span>
                </div>
              </div>
            </ResizablePanel>
          </div>
        ))}
      </ResizablePanelGroup>

      {/* All items rendered inside the board area below the headers */}
      <div className="rounded-b-xl border border-t-0 border-border bg-secondary/30 -mt-[1px] overflow-hidden">
        {timedItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-secondary/50 border-b border-border">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Scheduled</span>
            </div>
            {timedItems.map((item) => renderItemRow(item))}
          </div>
        )}

        {untimedItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-secondary/50 border-b border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">To Do</span>
            </div>
            {untimedItems.map((item) => renderItemRow(item))}
          </div>
        )}

        {allItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 opacity-60">Nothing scheduled for today</p>
        )}
      </div>
    </section>
  );
};

export default TeamDashboard;
