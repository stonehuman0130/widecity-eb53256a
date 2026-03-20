import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Check, Users, GripVertical, EyeOff, MoreVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import UserBadge from "@/components/UserBadge";
import GroupBadge from "@/components/GroupBadge";
import TaskTag from "@/components/TaskTag";
import TaskActionMenu from "@/components/TaskActionMenu";
import ItemActionMenu from "@/components/ItemActionMenu";
import { toast } from "sonner";
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
  assignee: "me" | "partner" | "both";
  done: boolean;
  isOwn: boolean; // created by current user
  tag?: string;
  groupId?: string | null;
  hiddenFromPartner?: boolean;
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

const TeamDashboard = ({
  myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents,
  toggleTask, removeEvent, removeTask, toggleEventVisibility, rescheduleEvent,
  hideGcalEvent, designateGcalEvent, onCongrats,
}: TeamDashboardProps) => {
  const { user, profile, activeGroup } = useAuth();

  // Build member list from group
  const members = useMemo(() => {
    if (!activeGroup || !user) return [{ id: "me", name: profile?.display_name || "Me" }];
    return activeGroup.members.map((m) => ({
      id: m.user_id === user.id ? "me" : "partner",
      userId: m.user_id,
      name: m.display_name || "Member",
    }));
  }, [activeGroup, user, profile]);

  // Build unified item list
  const allItems = useMemo(() => {
    const items: UnifiedItem[] = [];

    myTasks.forEach((t) => items.push({
      id: t.id, type: "task", title: t.title, time: t.time,
      assignee: t.assignee, done: t.done, isOwn: true,
      tag: t.tag, groupId: t.groupId, hiddenFromPartner: t.hiddenFromPartner,
      original: t,
    }));

    myEvents.forEach((e) => items.push({
      id: e.id, type: "event", title: e.title, time: e.time,
      assignee: e.user, done: false, isOwn: true,
      groupId: e.groupId, hiddenFromPartner: e.hiddenFromPartner,
      original: e,
    }));

    // Partner items — assignee is already viewer-perspective-swapped
    partnerTasks.forEach((t) => items.push({
      id: `p-${t.id}`, type: "task", title: t.title, time: t.time,
      assignee: t.assignee, done: t.done, isOwn: false,
      tag: t.tag, groupId: t.groupId, hiddenFromPartner: t.hiddenFromPartner,
      original: t,
    }));

    partnerEvents.forEach((e) => items.push({
      id: `p-${e.id}`, type: "event", title: e.title, time: e.time,
      assignee: e.user, done: false, isOwn: false,
      groupId: e.groupId, hiddenFromPartner: e.hiddenFromPartner,
      original: e,
    }));

    gcalEvents.forEach((ge) => items.push({
      id: `gcal-${ge.id}`, type: "gcal", title: ge.title,
      time: ge.allDay ? "" : (ge.start ? new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""),
      assignee: ge.assignee || "me", done: false, isOwn: true,
      original: ge,
    }));

    return items;
  }, [myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents]);

  // Categorize: items for "me" column, "partner" column, or shared (spanning)
  const myColumnItems = allItems.filter((i) => i.assignee === "me");
  const partnerColumnItems = allItems.filter((i) => i.assignee === "partner");
  const sharedItems = allItems.filter((i) => i.assignee === "both");

  const hasSpecificTime = (time?: string) => Boolean(time) && time !== "" && time !== "All day";

  const renderItem = (item: UnifiedItem, compact = false) => {
    const isShared = item.assignee === "both";
    return (
      <motion.div
        key={item.id}
        layout
        className={`rounded-xl p-3 shadow-card border transition-all ${
          item.done ? "border-habit-green/50 bg-card" : "border-border bg-card"
        } ${isShared ? "border-primary/30 bg-primary/5" : ""}`}
      >
        {hasSpecificTime(item.time) && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{formatTime(item.time)}</span>
            {item.type === "gcal" && (
              <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">Google</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {item.type !== "gcal" && (
            <button
              onClick={() => {
                if (!item.isOwn) return;
                if (item.type === "task") {
                  if (!item.done) onCongrats();
                  toggleTask((item.original as Task).id);
                }
              }}
              disabled={!item.isOwn || item.type !== "task"}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                item.done ? "bg-habit-green border-habit-green" : "border-muted"
              } ${!item.isOwn ? "opacity-60" : ""}`}
            >
              {item.done && <Check size={10} className="text-primary-foreground" />}
            </button>
          )}
          {item.type === "gcal" && (
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-[10px]">📅</span>
          )}
          <span className={`flex-1 text-[13px] font-medium tracking-body leading-tight ${item.done ? "line-through opacity-40" : ""} ${compact ? "truncate" : ""}`}>
            {item.title}
          </span>
          {isShared && (
            <div className="flex -space-x-1.5">
              <div className="w-4 h-4 rounded-full bg-user-a flex items-center justify-center text-[8px] font-bold text-primary-foreground ring-1 ring-card">
                {profile?.display_name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="w-4 h-4 rounded-full bg-user-b flex items-center justify-center text-[8px] font-bold text-primary-foreground ring-1 ring-card">
                {members.find((m) => m.id === "partner")?.name?.charAt(0)?.toUpperCase() || "P"}
              </div>
            </div>
          )}
        </div>
        {item.tag && (
          <div className="mt-1.5 ml-7">
            <TaskTag tag={item.tag} />
          </div>
        )}
      </motion.div>
    );
  };

  const renderColumn = (items: UnifiedItem[], memberName: string) => {
    const scheduled = items.filter((i) => hasSpecificTime(i.time));
    const justDoIt = items.filter((i) => !hasSpecificTime(i.time));

    return (
      <div className="space-y-3">
        {scheduled.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Scheduled</span>
            </div>
            <div className="space-y-2">
              {scheduled.map((item) => renderItem(item, true))}
            </div>
          </div>
        )}
        {justDoIt.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">To Do</span>
            </div>
            <div className="space-y-2">
              {justDoIt.map((item) => renderItem(item))}
            </div>
          </div>
        )}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 opacity-60">Nothing here</p>
        )}
      </div>
    );
  };

  const meName = profile?.display_name || "Me";
  const partnerMember = members.find((m) => m.id === "partner");
  const partnerNameLabel = partnerMember?.name || "Partner";

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-display">Team Dashboard</h2>
      </div>

      {/* Shared items spanning full width */}
      {sharedItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-primary">Shared Responsibilities</span>
          </div>
          <div className="space-y-2">
            {sharedItems.map((item) => renderItem(item))}
          </div>
        </div>
      )}

      {/* Per-member columns with resizable panels */}
      <ResizablePanelGroup direction="horizontal" className="min-h-[200px] rounded-xl border border-border bg-secondary/30">
        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="p-3 h-full">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
              <div className="w-6 h-6 rounded-full bg-user-a flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {meName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-foreground">{meName}</span>
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                {myColumnItems.length}
              </span>
            </div>
            {renderColumn(myColumnItems, meName)}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="p-3 h-full">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
              <div className="w-6 h-6 rounded-full bg-user-b flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {partnerNameLabel.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-foreground">{partnerNameLabel}</span>
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                {partnerColumnItems.length}
              </span>
            </div>
            {renderColumn(partnerColumnItems, partnerNameLabel)}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
};

export default TeamDashboard;
