import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Check, MoreVertical, Trash2, Clock, EyeOff, Eye } from "lucide-react";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import UserBadge from "@/components/UserBadge";
import TaskTag from "@/components/TaskTag";
import GroupSelector from "@/components/GroupSelector";
import ItemActionMenu from "@/components/ItemActionMenu";
import { useGroupContext } from "@/hooks/useGroupContext";
import { formatTime } from "@/lib/formatTime";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CalendarPage = () => {
  const { events, filteredEvents, addEvent, addTask, removeEvent, rescheduleEvent, tasks, filteredTasks, toggleTask, removeTask, updateTask, googleCalendarEvents, hideGcalEvent, toggleEventVisibility, designateGcalEvent } = useAppContext();
  const { activeGroup } = useAuth();
  const { showGoogleCalendar } = useGroupContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newUser, setNewUser] = useState<"me" | "partner" | "both">("me");
  const [newTag, setNewTag] = useState<"Work" | "Personal" | "Household">("Personal");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  const monthEvents = filteredEvents.filter((e) => e.month === month && e.year === year);
  const dayEvents = monthEvents.filter((e) => e.day === selectedDay);

  const dayTasks = filteredTasks.filter(
    (t) => t.scheduledDay === selectedDay && t.scheduledMonth === month && t.scheduledYear === year
  );

  // Google Calendar events for the selected day (only in "All" mode)
  const selDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
  const gcalDayEvents = showGoogleCalendar ? googleCalendarEvents.filter((ge) => {
    const startDate = ge.start?.split("T")[0] || ge.start;
    return startDate === selDateStr;
  }) : [];

  // Split into Scheduled (has time) vs Just Do It (no time)
  const scheduledTasks = dayTasks.filter((t) => Boolean(t.time));
  const justDoItTasks = dayTasks.filter((t) => !t.time);

  const dayHasItems = (day: number) => {
    const dayDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthEvents.some((e) => e.day === day) ||
      filteredTasks.some((t) => t.scheduledDay === day && t.scheduledMonth === month && t.scheduledYear === year) ||
      (showGoogleCalendar && googleCalendarEvents.some((ge) => (ge.start?.split("T")[0] || ge.start) === dayDateStr));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(1);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(1);
  };

  const handleAddEvent = () => {
    if (!newTitle.trim()) return;
    addEvent({
      title: newTitle.trim(),
      time: newTime || "All day",
      day: selectedDay,
      month,
      year,
      user: newUser,
    });
    addTask({
      title: newTitle.trim(),
      time: newTime || "",
      tag: newTag,
      assignee: newUser === "partner" ? "partner" : newUser === "both" ? "both" : "me",
      scheduledDay: selectedDay,
      scheduledMonth: month,
      scheduledYear: year,
    });
    setNewTitle("");
    setNewTime("");
    setNewUser("me");
    setNewTag("Personal");
    setShowAddForm(false);
  };

  const allEmpty = dayEvents.length === 0 && dayTasks.length === 0 && gcalDayEvents.length === 0;

  return (
    <div className="px-5">
      <header className="pt-12 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[1.75rem] font-bold tracking-display">Calendar</h1>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
              <ChevronLeft size={16} />
            </button>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1 font-medium">{monthName} {year}</p>
      </header>

      {/* Group Selector */}
      <GroupSelector />

      {/* Calendar Grid */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-card mb-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground text-center uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isTodayDay = isCurrentMonth && day === today.getDate();
            const isSelected = day === selectedDay;
            const hasItem = dayHasItems(day);
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`relative w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isTodayDay
                    ? "bg-primary/10 text-primary font-bold"
                    : "hover:bg-secondary"
                }`}
              >
                {day}
                {hasItem && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-display">
          {monthName} {selectedDay}
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
        >
          {showAddForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </div>

      {/* Add Event Form */}
      {showAddForm && (
        <div className="bg-card rounded-xl p-4 border border-border shadow-card mb-4 space-y-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Event title..."
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground"
          />
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Category</p>
            <div className="flex gap-2">
              {(["Work", "Personal", "Household"] as const).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setNewTag(tag)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    newTag === tag
                      ? tag === "Work"
                        ? "border-blue-500 bg-blue-500/10 text-blue-500"
                        : tag === "Household"
                        ? "border-orange-500 bg-orange-500/10 text-orange-500"
                        : "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Assign to</p>
            <div className="flex gap-2">
              {(["me", "partner", "both"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setNewUser(u)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                    newUser === u
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {u === "me" ? "Mine" : u === "partner" ? "Partner" : "Both"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleAddEvent}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
          >
            Add Event
          </button>
        </div>
      )}

      {allEmpty && !showAddForm ? (
        <p className="text-sm text-muted-foreground text-center py-8">No items scheduled</p>
      ) : (
        <div className="space-y-5 pb-4">
          {/* Scheduled section (events + tasks with time) */}
          {(dayEvents.length > 0 || scheduledTasks.length > 0 || gcalDayEvents.filter(g => !g.allDay).length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scheduled</h3>
              </div>
              <div className="space-y-3">
                {dayEvents.map((event) => {
                  const tomorrow = new Date(event.year, event.month, event.day);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return (
                    <CalendarItemCard
                      key={`ev-${event.id}`}
                      title={event.title}
                      time={event.time}
                      user={event.user}
                      hidden={event.hiddenFromPartner}
                      onRemove={() => { removeEvent(event.id); toast.success("Event deleted"); }}
                      onToggleVisibility={() => { toggleEventVisibility(event.id); toast.success(event.hiddenFromPartner ? "Now visible to others" : "Hidden from others"); }}
                      onMoveToTomorrow={() => { rescheduleEvent(event.id, tomorrow.getDate(), tomorrow.getMonth(), tomorrow.getFullYear()); toast.success("Moved to tomorrow"); }}
                      onMoveToDate={(d) => { rescheduleEvent(event.id, d.getDate(), d.getMonth(), d.getFullYear()); toast.success("Event rescheduled"); }}
                    />
                  );
                })}
                {scheduledTasks.map((task) => {
                  const tDay = task.scheduledDay ?? new Date().getDate();
                  const tMonth = task.scheduledMonth ?? new Date().getMonth();
                  const tYear = task.scheduledYear ?? new Date().getFullYear();
                  const tmrw = new Date(tYear, tMonth, tDay);
                  tmrw.setDate(tmrw.getDate() + 1);
                  return (
                    <CalendarItemCard
                      key={`tk-${task.id}`}
                      title={task.title}
                      time={task.time}
                      user={task.assignee}
                      done={task.done}
                      tag={task.tag}
                      onToggle={() => {
                        if (!task.done) toast.success("🎉 Task complete!");
                        toggleTask(task.id);
                      }}
                      onRemove={() => { removeTask(task.id); toast.success("Task deleted"); }}
                      onMoveToTomorrow={() => { updateTask(task.id, { scheduledDay: tmrw.getDate(), scheduledMonth: tmrw.getMonth(), scheduledYear: tmrw.getFullYear() }); toast.success("Moved to tomorrow"); }}
                      onMoveToDate={(d) => { updateTask(task.id, { scheduledDay: d.getDate(), scheduledMonth: d.getMonth(), scheduledYear: d.getFullYear() }); toast.success("Task rescheduled"); }}
                    />
                  );
                })}
                {gcalDayEvents.filter(g => !g.allDay).map((ge) => (
                  <GCalCard key={`gcal-${ge.id}`} event={ge} onHide={() => { hideGcalEvent(ge.id); toast.success("Hidden from others"); }} onDesignate={(assignee) => { designateGcalEvent(ge.id, assignee); toast.success(`Assigned as ${assignee === "me" ? "Mine" : assignee === "partner" ? "Partner's" : "Together"}`); }} />
                ))}
              </div>
            </div>
          )}

          {/* Google Calendar all-day events */}
          {gcalDayEvents.filter(g => g.allDay).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google Calendar</span>
              </div>
              <div className="space-y-3">
                {gcalDayEvents.filter(g => g.allDay).map((ge) => (
                  <GCalCard key={`gcal-${ge.id}`} event={ge} onHide={() => { hideGcalEvent(ge.id); toast.success("Hidden from others"); }} onDesignate={(assignee) => { designateGcalEvent(ge.id, assignee); toast.success(`Assigned as ${assignee === "me" ? "Mine" : assignee === "partner" ? "Partner's" : "Together"}`); }} />
                ))}
              </div>
            </div>
          )}

          {/* Just Do It section (tasks without time) */}
          {justDoItTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Just Do It</h3>
              </div>
              <div className="space-y-3">
                {justDoItTasks.map((task) => {
                  const tDay = task.scheduledDay ?? selectedDay;
                  const tMonth = task.scheduledMonth ?? month;
                  const tYear = task.scheduledYear ?? year;
                  const tmrw = new Date(tYear, tMonth, tDay);
                  tmrw.setDate(tmrw.getDate() + 1);
                  return (
                    <CalendarItemCard
                      key={`tk-${task.id}`}
                      title={task.title}
                      user={task.assignee}
                      done={task.done}
                      tag={task.tag}
                      onToggle={() => {
                        if (!task.done) toast.success("🎉 Task complete!");
                        toggleTask(task.id);
                      }}
                      onRemove={() => { removeTask(task.id); toast.success("Task deleted"); }}
                      onMoveToTomorrow={() => { updateTask(task.id, { scheduledDay: tmrw.getDate(), scheduledMonth: tmrw.getMonth(), scheduledYear: tmrw.getFullYear() }); toast.success("Moved to tomorrow"); }}
                      onMoveToDate={(d) => { updateTask(task.id, { scheduledDay: d.getDate(), scheduledMonth: d.getMonth(), scheduledYear: d.getFullYear() }); toast.success("Task rescheduled"); }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Unified card for both events and tasks on the calendar page */
const CalendarItemCard = ({
  title, time, user, done, tag, hidden, onToggle, onRemove, onToggleVisibility, onMoveToTomorrow, onMoveToDate,
}: {
  title: string;
  time?: string;
  user: "me" | "partner" | "both";
  done?: boolean;
  tag?: string;
  hidden?: boolean;
  onToggle?: () => void;
  onRemove: () => void;
  onToggleVisibility?: () => void;
  onMoveToTomorrow?: () => void;
  onMoveToDate?: (date: Date) => void;
}) => {
  return (
    <div className={`bg-card rounded-xl p-4 shadow-card border transition-all ${done ? "border-habit-green/50" : hidden ? "border-muted/50 opacity-70" : "border-border"}`}>
      {time && time !== "All day" && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{formatTime(time)}</span>
          {hidden && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            done ? "bg-habit-green border-habit-green" : "border-muted"
          }`}
        >
          {done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium ${done ? "line-through opacity-40" : ""}`}>
          {title}
        </span>
        <UserBadge user={user} />
        <ItemActionMenu
          hidden={hidden}
          onToggleVisibility={onToggleVisibility}
          onMoveToTomorrow={onMoveToTomorrow}
          onMoveToDate={onMoveToDate}
          onRemove={onRemove}
        />
      </div>
      {tag && (
        <div className="mt-2 ml-9">
          <TaskTag tag={tag as "Work" | "Personal" | "Household"} />
        </div>
      )}
      {(!time || time === "All day") && (
        <div className="mt-1 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">All day</span>
          {hidden && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
        </div>
      )}
    </div>
  );
};

const GCalCard = ({ event, onHide }: { event: GoogleCalendarEvent; onHide?: () => void }) => {
  const timeStr = event.allDay
    ? "All day"
    : event.start
    ? new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="bg-card rounded-xl p-4 shadow-card border border-primary/20">
      {timeStr && timeStr !== "All day" && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{timeStr}</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs">📅</span>
        <span className="flex-1 text-[15px] font-medium">{event.title}</span>
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium">
            Open
          </a>
        )}
        {onHide && (
          <ItemActionMenu
            onToggleVisibility={onHide}
          />
        )}
      </div>
      {timeStr === "All day" && (
        <div className="mt-1 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">All day</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
