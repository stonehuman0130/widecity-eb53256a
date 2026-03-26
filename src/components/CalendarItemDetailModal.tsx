import { useState } from "react";
import { X, Trash2, Pencil, Check } from "lucide-react";
import { useAppContext, ScheduledEvent, Task, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CalItemInfo {
  id: string;
  title: string;
  time: string;
  endTime?: string;
  allDay: boolean;
  type: "event" | "task" | "gcal";
  raw: ScheduledEvent | Task | GoogleCalendarEvent;
  isDueDateTask?: boolean;
  groupId?: string | null;
  done?: boolean;
}

interface Props {
  item: CalItemInfo | null;
  onClose: () => void;
  onEdit?: (item: CalItemInfo) => void;
}

const CalendarItemDetailModal = ({ item, onClose }: Props) => {
  const { removeEvent, updateEvent, removeTask, updateTask, toggleTask, toggleEventCompletion, toggleGcalCompletion, hideGcalEvent } = useAppContext();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit state for events
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editAllDay, setEditAllDay] = useState(false);
  const [editDesc, setEditDesc] = useState("");

  // Edit state for tasks
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotice, setEditNotice] = useState(0);
  const [editTag, setEditTag] = useState<"Work" | "Personal" | "Household">("Personal");

  if (!item) return null;

  const realId = item.id.replace(/^(ev-|tk-|todo-|gcal-)/, "");

  const startEdit = () => {
    setConfirmDelete(false);
    if (item.type === "event") {
      const ev = item.raw as ScheduledEvent;
      setEditTitle(ev.title);
      const sd = `${ev.year}-${String(ev.month + 1).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}`;
      setEditStartDate(sd);
      const endD = ev.endDay ?? ev.day;
      const endM = ev.endMonth ?? ev.month;
      const endY = ev.endYear ?? ev.year;
      setEditEndDate(`${endY}-${String(endM + 1).padStart(2, "0")}-${String(endD).padStart(2, "0")}`);
      const isAllDay = ev.allDay ?? (!ev.time || ev.time === "All day");
      setEditAllDay(isAllDay);
      // Parse time for input
      setEditStartTime(parseTimeForInput(ev.time));
      setEditEndTime(parseTimeForInput(ev.endTime || ""));
      setEditDesc(ev.description || "");
    } else if (item.type === "task") {
      const tk = item.raw as Task;
      setEditTaskTitle(tk.title);
      setEditDueDate(tk.dueDate || "");
      setEditNotice(tk.priorNoticeDays ?? 0);
      setEditTag(tk.tag || "Personal");
    }
    setEditing(true);
  };

  const handleSaveEvent = () => {
    if (!editTitle.trim()) return;
    const [sy, sm, sd] = editStartDate.split("-").map(Number);
    const [ey, em, ed] = editEndDate.split("-").map(Number);
    updateEvent(realId, {
      title: editTitle.trim(),
      day: sd, month: sm - 1, year: sy,
      endDay: ed, endMonth: em - 1, endYear: ey,
      time: editAllDay ? "All day" : (editStartTime || "All day"),
      endTime: editAllDay ? "" : (editEndTime || editStartTime || ""),
      allDay: editAllDay,
      description: editDesc,
    });
    toast.success("Event updated");
    setEditing(false);
    onClose();
  };

  const handleSaveTask = () => {
    if (!editTaskTitle.trim()) return;
    updateTask(realId, {
      title: editTaskTitle.trim(),
      tag: editTag,
      dueDate: editDueDate || null,
      priorNoticeDays: editNotice,
    });
    toast.success("Task updated");
    setEditing(false);
    onClose();
  };

  const handleDelete = () => {
    if (item.type === "event") {
      removeEvent(realId);
      toast.success("Event deleted");
    } else if (item.type === "task") {
      removeTask(realId);
      toast.success("Task deleted");
    } else if (item.type === "gcal") {
      hideGcalEvent(realId);
      toast.success("Google Calendar event hidden");
    }
    onClose();
  };

  const handleToggleDone = () => {
    if (item.type === "event") {
      toggleEventCompletion(realId);
    } else if (item.type === "task") {
      toggleTask(realId);
    } else if (item.type === "gcal") {
      toggleGcalCompletion(realId);
    }
    onClose();
  };

  // Display helpers
  const displayTime = () => {
    if (item.allDay) return "All day";
    if (item.type === "gcal" && item.time) {
      const start = new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const end = item.endTime ? new Date(item.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      return end ? `${start} – ${end}` : start;
    }
    const start = formatTime(item.time);
    const end = item.endTime ? formatTime(item.endTime) : "";
    return end && end !== start ? `${start} – ${end}` : start;
  };

  const displayDate = () => {
    if (item.type === "event") {
      const ev = item.raw as ScheduledEvent;
      return new Date(ev.year, ev.month, ev.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    if (item.type === "task") {
      const tk = item.raw as Task;
      if (tk.dueDate) {
        const [y, m, d] = tk.dueDate.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      }
      if (tk.scheduledDay != null) {
        return new Date(tk.scheduledYear!, tk.scheduledMonth!, tk.scheduledDay!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      }
    }
    if (item.type === "gcal") {
      const ge = item.raw as GoogleCalendarEvent;
      if (ge.start) return new Date(ge.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    return "";
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-4 z-50 bg-card border border-border rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {!editing && (
                <>
                  <p className={cn("text-lg font-bold text-foreground", item.done && "line-through opacity-50")}>{item.title}</p>
                  <p className="text-sm text-muted-foreground">{displayDate()}</p>
                  <p className="text-sm text-muted-foreground">{displayTime()}</p>
                  {item.type === "event" && (item.raw as ScheduledEvent).description && (
                    <p className="text-sm text-muted-foreground mt-1">{(item.raw as ScheduledEvent).description}</p>
                  )}
                  {item.type === "task" && item.isDueDateTask && (
                    <span className="inline-block mt-1 text-[11px] font-medium text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded-full">To-do</span>
                  )}
                </>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Edit form for events */}
          {editing && item.type === "event" && (
            <div className="space-y-3">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none" placeholder="Event title" autoFocus />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editAllDay} onChange={(e) => setEditAllDay(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">All-day</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground">Start</label>
                  <input type="date" value={editStartDate} onChange={(e) => { setEditStartDate(e.target.value); if (e.target.value > editEndDate) setEditEndDate(e.target.value); }}
                    className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
                </div>
                {!editAllDay && (
                  <div className="w-28">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">Time</label>
                    <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground">End</label>
                  <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} min={editStartDate}
                    className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
                </div>
                {!editAllDay && (
                  <div className="w-28">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">Time</label>
                    <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
                  </div>
                )}
              </div>
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Notes..."
                rows={2} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm font-medium bg-secondary rounded-lg">Cancel</button>
                <button onClick={handleSaveEvent} className="flex-1 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg">Save</button>
              </div>
            </div>
          )}

          {/* Edit form for tasks */}
          {editing && item.type === "task" && (
            <div className="space-y-3">
              <input value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none" placeholder="Task title" autoFocus />
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground">Due date</label>
                <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground" />
                {editDueDate && (
                  <button onClick={() => setEditDueDate("")} className="text-xs text-destructive mt-1">Remove due date</button>
                )}
              </div>
              {editDueDate && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Give notice</p>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTICE_OPTIONS.map((n) => (
                      <button key={n} onClick={() => setEditNotice(n)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                          editNotice === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}>
                        {n === -1 ? "Starting today" : n === 0 ? "Due day" : n === 1 ? "1 day before" : `${n} days before`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Category</p>
                <div className="flex gap-1.5">
                  {(["Work", "Personal", "Household"] as const).map((tag) => (
                    <button key={tag} onClick={() => setEditTag(tag)}
                      className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                        editTag === tag
                          ? tag === "Work" ? "border-blue-500 bg-blue-500/10 text-blue-500"
                            : tag === "Household" ? "border-orange-500 bg-orange-500/10 text-orange-500"
                            : "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 text-sm font-medium bg-secondary rounded-lg">Cancel</button>
                <button onClick={handleSaveTask} className="flex-1 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg">Save</button>
              </div>
            </div>
          )}

          {/* Action buttons (when not editing) */}
          {!editing && (
            <div className="space-y-2 pt-1">
              <button onClick={handleToggleDone}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary transition-colors text-left">
                <Check size={16} className="text-muted-foreground" />
                {item.done ? "Mark as not done" : "Mark as done"}
              </button>

              {item.type !== "gcal" && (
                <button onClick={startEdit}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary transition-colors text-left">
                  <Pencil size={16} className="text-muted-foreground" />
                  Edit
                </button>
              )}

              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-destructive/10 text-destructive transition-colors text-left">
                  <Trash2 size={16} />
                  {item.type === "gcal" ? "Hide" : "Delete"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 text-sm font-medium bg-secondary rounded-xl">Cancel</button>
                  <button onClick={handleDelete} className="flex-1 py-2.5 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl">
                    {item.type === "gcal" ? "Hide" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

function parseTimeForInput(time: string): string {
  if (!time || time === "All day") return "";
  const match12 = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const p = match12[3].toUpperCase();
    if (p === "AM" && h === 12) h = 0;
    if (p === "PM" && h < 12) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const match24 = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return `${String(parseInt(match24[1])).padStart(2, "0")}:${match24[2]}`;
  return "";
}

export default CalendarItemDetailModal;
