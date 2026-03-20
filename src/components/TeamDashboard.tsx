import { useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Clock, Check, Users, GripVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import TaskTag from "@/components/TaskTag";
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

  // ── Resizable column state ──
  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.min(80, Math.max(20, (x / rect.width) * 100));
      setSplitPercent(pct);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;

    const onTouchMove = (ev: TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.touches[0].clientX - rect.left;
      const pct = Math.min(80, Math.max(20, (x / rect.width) * 100));
      setSplitPercent(pct);
    };

    const onTouchEnd = () => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onTouchEnd);
  }, []);

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

  // ── Build unified items ──
  const allItems = useMemo(() => {
    if (!selfUserId || columnMembers.length === 0) return [] as UnifiedItem[];
    const items: UnifiedItem[] = [];
    const seenIds = new Set<string>();

    const addItem = (item: UnifiedItem) => {
      // Deduplicate: partner items that are shared might duplicate with own items
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        items.push(item);
      }
    };

    myTasks.forEach((t) => addItem({
      id: t.id, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time), assignee: t.assignee,
      assignedUserIds: resolveAssignedUserIds({ assignee: t.assignee, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: t.done, isOwn: true, tag: t.tag, original: t,
    }));

    myEvents.forEach((e) => addItem({
      id: e.id, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: false, isOwn: true, original: e,
    }));

    partnerTasks.forEach((t) => addItem({
      id: `p-${t.id}`, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time), assignee: t.assignee,
      assignedUserIds: resolveAssignedUserIds({ assignee: t.assignee, sourceUserId: primaryOtherUserId, selfUserId, members: columnMembers }),
      sourceUserId: primaryOtherUserId, done: t.done, isOwn: false, tag: t.tag, original: t,
    }));

    partnerEvents.forEach((e) => addItem({
      id: `p-${e.id}`, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: primaryOtherUserId, selfUserId, members: columnMembers }),
      sourceUserId: primaryOtherUserId, done: false, isOwn: false, original: e,
    }));

    gcalEvents.forEach((ge) => {
      const timeStr = ge.allDay ? "" : ge.start ? new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      const src = ge.ownerUserId || selfUserId;
      const assignee = ge.assignee || "me";
      addItem({
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

  // ── Separate shared vs individual items ──
  const categorizeItems = useCallback((items: UnifiedItem[]) => {
    const individual: UnifiedItem[][] = Array.from({ length: colCount }, () => []);
    const shared: UnifiedItem[] = [];

    items.forEach((item) => {
      const cols = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
      if (cols.length > 1) {
        shared.push(item);
      } else if (cols.length === 1) {
        individual[cols[0]]?.push(item);
      }
    });

    return { individual, shared };
  }, [columnIndexByUserId, colCount]);

  const timedCategorized = useMemo(() => categorizeItems(timedItems), [categorizeItems, timedItems]);
  const untimedCategorized = useMemo(() => categorizeItems(untimedItems), [categorizeItems, untimedItems]);

  // Grid template with divider gap
  const gridTemplate = colCount === 2
    ? `${splitPercent}% 0px ${100 - splitPercent}%`
    : columnMembers.map(() => "1fr").join(" ");

  // ── Render helpers ──
  const renderCard = (item: UnifiedItem) => {
    const isShared = item.assignedUserIds.length > 1 || item.assignee === "both";
    return (
      <motion.div
        key={item.id}
        layout
        className={`rounded-lg p-2 shadow-sm border transition-all ${
          item.done ? "border-habit-green/50 bg-card" : "border-border bg-card"
        } ${isShared ? "border-primary/30 bg-primary/5" : ""}`}
      >
        {item.sortMinutes >= 0 && (
          <div className="flex items-center gap-1 mb-1">
            <Clock size={10} className="text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">{formatTime(item.time)}</span>
            {item.type === "gcal" && (
              <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">Google</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {item.type === "gcal" ? (
            <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-[9px]">📅</span>
          ) : (
            <button
              onClick={() => {
                if (!item.isOwn || item.type !== "task") return;
                if (!item.done) onCongrats();
                toggleTask((item.original as Task).id);
              }}
              disabled={!item.isOwn || item.type !== "task"}
              className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                item.done ? "bg-habit-green border-habit-green" : "border-muted"
              } ${!item.isOwn ? "opacity-60" : ""}`}
            >
              {item.done && <Check size={8} className="text-primary-foreground" />}
            </button>
          )}
          <span className={`flex-1 text-[12px] font-medium leading-tight truncate ${item.done ? "line-through opacity-40" : ""}`}>
            {item.title}
          </span>
          {isShared && (
            <div className="flex -space-x-1">
              {columnMembers.filter((m) => item.assignedUserIds.includes(m.userId)).map((m) => (
                <div key={m.userId} className={`w-3.5 h-3.5 rounded-full ${m.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[7px] font-bold text-primary-foreground ring-1 ring-card`}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          {item.type === "gcal" && item.sortMinutes < 0 && (
            <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded flex-shrink-0">Google</span>
          )}
        </div>
        {item.tag && (
          <div className="mt-1 ml-6">
            <TaskTag tag={item.tag as "Work" | "Personal" | "Household"} />
          </div>
        )}
      </motion.div>
    );
  };

  const renderSection = (
    label: string,
    icon: React.ReactNode,
    categorized: { individual: UnifiedItem[][]; shared: UnifiedItem[] },
  ) => {
    const hasAny = categorized.shared.length > 0 || categorized.individual.some((b) => b.length > 0);
    if (!hasAny) return null;

    return (
      <div>
        {/* Section label row */}
        <div
          className="grid"
          style={{ gridTemplateColumns: colCount === 2 ? `${splitPercent}% 5px ${100 - splitPercent}%` : gridTemplate }}
        >
          <div className="flex items-center gap-1 px-2 py-1 bg-secondary/50 col-span-1">
            {icon}
            <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
          </div>
          {colCount === 2 && <div />}
          {Array.from({ length: colCount - 1 }).map((_, i) => (
            <div key={i} className="bg-secondary/50 py-1" />
          ))}
        </div>

        {/* Individual items row */}
        <div
          className="grid"
          style={{ gridTemplateColumns: colCount === 2 ? `${splitPercent}% 5px ${100 - splitPercent}%` : gridTemplate }}
        >
          {columnMembers.map((_, ci) => (
            <div key={ci} className="flex flex-col gap-1 px-1.5 py-1 min-w-0">
              {(categorized.individual[ci] || []).map((item) => (
                <div key={item.id}>{renderCard(item)}</div>
              ))}
            </div>
          )).reduce<React.ReactNode[]>((acc, el, i) => {
            if (i > 0 && colCount === 2) {
              acc.push(<div key={`div-${i}`} />);
            }
            acc.push(el);
            return acc;
          }, [])}
        </div>

        {/* Shared items - span full width */}
        {categorized.shared.map((item) => (
          <div key={item.id} className="px-1.5 py-0.5">
            {renderCard(item)}
          </div>
        ))}
      </div>
    );
  };

  const totalPerCol = useMemo(() => {
    return columnMembers.map((_, index) => {
      return allItems.filter((item) => {
        const cols = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
        return cols.includes(index);
      }).length;
    });
  }, [allItems, columnIndexByUserId, columnMembers]);

  const hasAnyItems = timedItems.length > 0 || untimedItems.length > 0;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold tracking-display">Team Dashboard</h2>
      </div>

      <div
        ref={containerRef}
        className="rounded-xl border border-border bg-secondary/30 overflow-hidden relative"
      >
        {/* Header row */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: colCount === 2 ? `${splitPercent}% 5px ${100 - splitPercent}%` : gridTemplate }}
        >
          {columnMembers.map((member, index) => (
            <div key={member.userId} className="contents">
              {index > 0 && colCount === 2 && (
                <div className="relative flex items-center justify-center">
                  {/* Divider handle */}
                  <div
                    className="absolute inset-y-0 w-5 -ml-2.5 cursor-col-resize z-20 flex items-center justify-center"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                  >
                    <div className="w-[3px] h-full bg-border" />
                    <div className="absolute w-4 h-6 rounded bg-border flex items-center justify-center">
                      <GripVertical size={10} className="text-muted-foreground" />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border min-w-0">
                <div className={`w-5 h-5 rounded-full ${member.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[9px] font-bold text-primary-foreground flex-shrink-0`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-foreground truncate">{member.name}</span>
                <span className="text-[9px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-full ml-auto flex-shrink-0">
                  {totalPerCol[index] || 0}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Divider line that runs through content */}
        {colCount === 2 && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-border z-10 pointer-events-none"
            style={{ left: `${splitPercent}%` }}
          />
        )}

        {/* Scheduled section */}
        {renderSection(
          "Scheduled",
          <Clock size={10} className="text-muted-foreground" />,
          timedCategorized,
        )}

        {/* To Do section */}
        {renderSection(
          "To Do",
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" />,
          untimedCategorized,
        )}

        {/* Empty state */}
        {!hasAnyItems && (
          <p className="text-[10px] text-muted-foreground text-center py-4 opacity-50">No items</p>
        )}
      </div>
    </section>
  );
};

export default TeamDashboard;
