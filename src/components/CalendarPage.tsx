import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Check, MoreVertical, Trash2, Clock } from "lucide-react";
import { useAppContext, Task } from "@/context/AppContext";
import UserBadge from "@/components/UserBadge";
import TaskTag from "@/components/TaskTag";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CalendarPage = () => {
  const { events, addEvent, removeEvent, tasks, toggleTask, removeTask } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newUser, setNewUser] = useState<"me" | "partner" | "both">("me");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  const monthEvents = events.filter((e) => e.month === month && e.year === year);
  const dayEvents = monthEvents.filter((e) => e.day === selectedDay);

  // Tasks scheduled for the selected day
  const dayTasks = tasks.filter(
    (t) => t.scheduledDay === selectedDay && t.scheduledMonth === month && t.scheduledYear === year
  );

  // Check if a day has any items (events or tasks)
  const dayHasItems = (day: number) => {
    return monthEvents.some((e) => e.day === day) ||
      tasks.some((t) => t.scheduledDay === day && t.scheduledMonth === month && t.scheduledYear === year);
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
    setNewTitle("");
    setNewTime("");
    setNewUser("me");
    setShowAddForm(false);
  };

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
            const isToday = isCurrentMonth && day === today.getDate();
            const isSelected = day === selectedDay;
            const hasItem = dayHasItems(day);
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`relative w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
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

      {/* Events & Tasks for selected day */}
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
          <button
            onClick={handleAddEvent}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
          >
            Add Event
          </button>
        </div>
      )}

      {dayEvents.length === 0 && dayTasks.length === 0 && !showAddForm ? (
        <p className="text-sm text-muted-foreground text-center py-8">No items scheduled</p>
      ) : (
        <div className="space-y-3">
          {/* Calendar events */}
          {dayEvents.map((event) => (
            <CalendarEventCard key={`ev-${event.id}`} event={event} onRemove={removeEvent} />
          ))}
          {/* Tasks */}
          {dayTasks.map((task) => (
            <CalendarTaskCard key={`tk-${task.id}`} task={task} onToggle={toggleTask} onRemove={removeTask} />
          ))}
        </div>
      )}
    </div>
  );
};

const CalendarEventCard = ({ event, onRemove }: { event: any; onRemove: (id: string) => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="bg-card rounded-xl p-4 border border-border shadow-card flex items-center gap-3">
      <div className={`w-1 h-10 rounded-full ${event.user === "me" ? "bg-user-a" : event.user === "partner" ? "bg-user-b" : "bg-gradient-to-b from-user-a to-user-b"}`} />
      <div className="flex-1">
        <p className="text-[15px] font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{event.time}</p>
      </div>
      <div className="relative">
        <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
            <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-xl border border-border bg-card shadow-card">
              <button
                onClick={() => { onRemove(event.id); setMenuOpen(false); toast.success("Event deleted"); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CalendarTaskCard = ({ task, onToggle, onRemove }: { task: Task; onToggle: (id: string) => void; onRemove: (id: string) => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`bg-card rounded-xl p-4 shadow-card border transition-all ${task.done ? "border-habit-green/50" : "border-border"}`}>
      {task.time && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{task.time}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggle(task.id)}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.done ? "bg-habit-green border-habit-green" : "border-muted"
          }`}
        >
          {task.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium ${task.done ? "line-through opacity-40" : ""}`}>
          {task.title}
        </span>
        <UserBadge user={task.assignee} />
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
              <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-xl border border-border bg-card shadow-card">
                <button
                  onClick={() => { onRemove(task.id); setMenuOpen(false); toast.success("Task deleted"); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 ml-9">
        <TaskTag tag={task.tag} />
      </div>
    </div>
  );
};

export default CalendarPage;
