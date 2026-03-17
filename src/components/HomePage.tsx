import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Plus, Sparkles, Clock, Check, Loader2, MoreVertical, Trash2, ChevronLeft, ChevronRight, Mic } from "lucide-react";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";
import TaskActionMenu from "@/components/TaskActionMenu";
import AddItemModal from "@/components/AddItemModal";
import { useAppContext, Task, ScheduledEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";

type Filter = "mine" | "partner" | "household";

const HomePage = () => {
  const { profile, partner } = useAuth();
  const [filter, setFilter] = useState<Filter>("mine");
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { habits, toggleHabit, addHabit, events, tasks, toggleTask, addTask, addEvent, removeEvent } = useAppContext();

  const { listening, start: startListening, stop: stopListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => {
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    },
  });

  const morningHabits = habits.filter((h) => h.category === "morning");

  const handleQuickAdd = () => {
    if (!input.trim()) return;
    addTask({
      title: input,
      time: "",
      tag: "Personal",
      assignee: "me",
      scheduledDay: selectedDate.getDate(),
      scheduledMonth: selectedDate.getMonth(),
      scheduledYear: selectedDate.getFullYear(),
    });
    setInput("");
  };

  const toDateParts = (dateStr?: string) => {
    if (dateStr) {
      const [y, m, d] = dateStr.split("-").map(Number);
      return { day: d, month: m - 1, year: y };
    }
    return { day: selectedDate.getDate(), month: selectedDate.getMonth(), year: selectedDate.getFullYear() };
  };

  const processAction = (action: any) => {
    const actionType = action.action_type || action.type || (action.label ? "add_habit" : "create_event");

    if (actionType === "add_habit") {
      const inferredCategory = /morning|mornings|am routine/i.test(input) ? "morning" : "other";
      const label = action.label || action.title;
      const category = action.category || inferredCategory;
      if (!label) return;

      addHabit(label, category);
      toast.success(`Habit added: ${label}`, {
        description: `Added to ${category} habits`,
      });
      return;
    }

    const { day, month, year } = toDateParts(action.date);
    const assignee = action.assignee || "me";
    const tag = action.tag || "Personal";

    addEvent({
      title: action.title,
      time: action.time || "All day",
      description: action.description || "",
      day,
      month,
      year,
      user: assignee,
    });

    addTask({
      title: action.title,
      time: action.time || "",
      tag: tag as "Work" | "Personal" | "Household",
      assignee,
      scheduledDay: day,
      scheduledMonth: month,
      scheduledYear: year,
    });

    toast.success(`Scheduled: ${action.title}`, {
      description: `${action.date || "today"} ${action.time || "All day"}${assignee !== "me" ? ` · ${assignee === "partner" ? "Evelyn" : "Both"}` : ""}`,
    });
  };

  const handleAiSchedule = async () => {
    if (!input.trim()) return;
    setAiLoading(true);
    try {
      const { data: rawData, error } = await supabase.functions.invoke("ai-schedule", {
        body: { text: input },
      });
      if (error) throw error;

      const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      if (data.error) throw new Error(data.error);

      if (data.type === "multi" && Array.isArray(data.actions)) {
        data.actions.forEach((action: any) => processAction(action));
        toast.success(`✨ ${data.actions.length} actions completed!`);
      } else {
        processAction(data);
      }
      setInput("");
    } catch (e: any) {
      console.error("AI schedule error:", e);
      toast.error("AI couldn't parse that", { description: e.message });
    } finally {
      setAiLoading(false);
    }
  };

  const partnerName = partner?.display_name || "Partner";
  const filters: { id: Filter; label: string }[] = [
    { id: "mine", label: "Mine" },
    { id: "partner", label: `${partnerName}'s` },
    { id: "household", label: "Household" },
  ];

  const matchesFilter = (assignee: "me" | "partner" | "both", tag?: string) => {
    if (filter === "mine") return assignee === "me" || assignee === "both";
    if (filter === "partner") return assignee === "partner" || assignee === "both";
    return tag === "Household" || assignee === "both";
  };

  // Date-based filtering
  const sd = selectedDate;
  const selDay = sd.getDate();
  const selMonth = sd.getMonth();
  const selYear = sd.getFullYear();

  const isSelectedDate = (day?: number, month?: number, year?: number) => {
    if (day === undefined || month === undefined || year === undefined) return true;
    return day === selDay && month === selMonth && year === selYear;
  };

  const filteredTasks = tasks.filter((t) => matchesFilter(t.assignee, t.tag) && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear));
  const visibleEvents = events.filter((e) => matchesFilter(e.user) && e.day === selDay && e.month === selMonth && e.year === selYear);

  const isTaskScheduled = (t: Task) => Boolean(t.time);
  const scheduledTasks = filteredTasks.filter((t) => isTaskScheduled(t));
  const justDoIt = filteredTasks.filter((t) => !isTaskScheduled(t));

  const dateFormatted = sd.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const isToday = selDay === new Date().getDate() && selMonth === new Date().getMonth() && selYear === new Date().getFullYear();

  const shiftDate = (days: number) => {
    const d = new Date(sd);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-5">
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">{greeting} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Let's make today count, {profile?.display_name || "there"}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card mt-1"
        >
          <Plus size={22} />
        </button>
      </header>

      {/* Date Selector */}
      <div className="flex items-center justify-between bg-card rounded-xl p-2 mb-4 shadow-card border border-border">
        <button onClick={() => shiftDate(-1)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all">
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => setSelectedDate(new Date())}
          className={`flex-1 text-center py-1.5 rounded-lg text-sm font-semibold transition-colors ${isToday ? "text-primary" : "text-foreground hover:text-primary"}`}
        >
          {isToday ? `Today · ${dateFormatted}` : dateFormatted}
        </button>
        <button onClick={() => shiftDate(1)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              filter === f.id
                ? "bg-card text-foreground shadow-card"
                : "text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* AI-powered input bar */}
      <div className="flex items-center gap-2 bg-card rounded-xl p-2 pl-4 mb-6 shadow-card border border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) {
                handleQuickAdd();
              } else {
                handleAiSchedule();
              }
            }
          }}
          placeholder="Try: 'call at 2pm tomorrow & add stretch to mornings'"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
        />
        {speechSupported && (
          <button
            onClick={listening ? stopListening : startListening}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
              listening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mic size={16} />
          </button>
        )}
        <button
          onClick={handleAiSchedule}
          disabled={aiLoading || !input.trim()}
          className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-primary-foreground disabled:opacity-50 flex-shrink-0"
        >
          {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </button>
        <button
          onClick={handleQuickAdd}
          disabled={!input.trim()}
          className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 flex-shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>

      <section className="mb-6">
        <h2 className="text-lg font-semibold tracking-display mb-3">Morning Habits</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {morningHabits.map((habit) => (
            <button
              key={habit.id}
              onClick={() => toggleHabit(habit.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border whitespace-nowrap text-sm font-medium transition-all active:scale-[0.97] ${
                habit.done
                  ? "border-habit-green bg-habit-green/10 text-habit-green"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {habit.done ? (
                <span className="w-5 h-5 rounded-full bg-habit-green flex items-center justify-center">
                  <Check size={12} className="text-primary-foreground" />
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full border-2 border-muted" />
              )}
              {habit.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
        </div>
        {scheduledTasks.length > 0 || visibleEvents.length > 0 ? (
          <div className="space-y-3">
            {scheduledTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={toggleTask} />
            ))}
            {visibleEvents.map((event) => (
              <EventCard key={event.id} event={event} onRemove={removeEvent} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No scheduled items</p>
        )}
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Just Do it</h2>
          <span className="text-sm text-muted-foreground">({justDoIt.length})</span>
        </div>
        {justDoIt.length > 0 ? (
          <div className="space-y-3">
            {justDoIt.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={toggleTask} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">All clear! Add tasks with the + button</p>
        )}
      </section>

      <AddItemModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
};

const TaskCard = ({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) => {
  const handleToggle = () => {
    if (!task.done) {
      toast.success("🎉 Task complete!", { description: "Great job, keep it up!" });
    }
    onToggle(task.id);
  };

  const hasDate = task.scheduledDay !== undefined && task.scheduledMonth !== undefined && task.scheduledYear !== undefined;
  const dateLabel = hasDate
    ? new Date(task.scheduledYear!, task.scheduledMonth!, task.scheduledDay!).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${task.done ? "border-habit-green/50" : "border-border"}`}
    >
      {(task.time || dateLabel) && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          {task.time ? <span className="text-xs font-medium text-muted-foreground">{formatTime(task.time)}</span> : null}
          {dateLabel ? <span className="text-xs text-muted-foreground">· {dateLabel}</span> : null}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.done ? "bg-habit-green border-habit-green" : "border-muted"
          }`}
        >
          {task.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${task.done ? "line-through opacity-40" : ""}`}>
          {task.title}
        </span>
        <UserBadge user={task.assignee} />
        <TaskActionMenu taskId={task.id} />
      </div>
      <div className="mt-2 ml-9">
        <TaskTag tag={task.tag} />
      </div>
    </motion.div>
  );
};

const EventCard = ({ event, onRemove }: { event: ScheduledEvent; onRemove: (id: string) => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [done, setDone] = useState(false);
  const dateLabel = new Date(event.year, event.month, event.day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${done ? "border-habit-green/50" : "border-border"}`}
    >
      {(event.time && event.time !== "All day") && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{formatTime(event.time)}</span>
          <span className="text-xs text-muted-foreground">· {dateLabel}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (!done) toast.success("🎉 Done!", { description: "Great job!" });
            setDone(!done);
          }}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            done ? "bg-habit-green border-habit-green" : "border-muted"
          }`}
        >
          {done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${done ? "line-through opacity-40" : ""}`}>
          {event.title}
        </span>
        <UserBadge user={event.user} />
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
              <div className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <button
                  onClick={() => {
                    onRemove(event.id);
                    setMenuOpen(false);
                    toast.success("Event deleted");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {(!event.time || event.time === "All day") && (
        <div className="mt-2 ml-9">
          <span className="text-xs text-muted-foreground">{dateLabel} · All day</span>
        </div>
      )}
    </motion.div>
  );
};

export default HomePage;
