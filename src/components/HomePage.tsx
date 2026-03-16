import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Mic, Clock, MoreVertical, Check } from "lucide-react";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";
import AddItemModal from "@/components/AddItemModal";
import { useAppContext, Task } from "@/context/AppContext";

type Filter = "mine" | "partner" | "household";

const HomePage = () => {
  const [filter, setFilter] = useState<Filter>("mine");
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const { habits, toggleHabit, events, tasks, toggleTask, addTask } = useAppContext();

  const morningHabits = habits.filter((h) => h.category === "morning");

  const handleQuickAdd = () => {
    if (!input.trim()) return;
    const today = new Date();
    addTask({
      title: input,
      time: "",
      tag: "Personal",
      assignee: "me",
      scheduledDay: today.getDate(),
      scheduledMonth: today.getMonth(),
      scheduledYear: today.getFullYear(),
    });
    setInput("");
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "mine", label: "Mine" },
    { id: "partner", label: "Evelyn's" },
    { id: "household", label: "Household" },
  ];

  const today = new Date();
  const todayTasks = tasks.filter(
    (t) =>
      t.scheduledDay === today.getDate() &&
      t.scheduledMonth === today.getMonth() &&
      t.scheduledYear === today.getFullYear()
  );

  const filteredTasks = todayTasks.filter((t) => {
    if (filter === "mine") return t.assignee === "me";
    if (filter === "partner") return t.assignee === "partner";
    return t.tag === "Household";
  });

  // Today's events from shared context
  const todayEvents = events.filter(
    (e) => e.day === today.getDate() && e.month === today.getMonth() && e.year === today.getFullYear()
  );

  // Scheduled = tasks with time + calendar events
  const scheduledTasks = filteredTasks.filter((t) => t.time && !t.done);
  // Just Do It Today = tasks without a specific time, not done
  const justDoIt = filteredTasks.filter((t) => !t.time && !t.done);

  const todayFormatted = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="px-5">
      {/* Header */}
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Good morning 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Let's make today count, Harrison</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card mt-1"
        >
          <Plus size={22} />
        </button>
      </header>

      {/* Filter Tabs */}
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

      {/* Quick Add */}
      <div className="flex items-center gap-2 bg-card rounded-xl p-2 pl-4 mb-6 shadow-card border border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
          placeholder="Brain dump a task..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-primary-foreground">
          <Sparkles size={16} />
        </button>
        <button className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Mic size={16} />
        </button>
      </div>

      {/* Morning Habits */}
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

      {/* Scheduled Tasks */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
          <span className="text-sm text-muted-foreground">· {todayFormatted}</span>
        </div>
        {scheduledTasks.length > 0 || todayEvents.length > 0 ? (
          <div className="space-y-3">
            {scheduledTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={toggleTask} />
            ))}
            {todayEvents.map((event) => (
              <div key={event.id} className="bg-card rounded-xl p-4 shadow-card border border-border flex items-center gap-3">
                <div className={`w-1.5 h-10 rounded-full ${event.user === "me" ? "bg-user-a" : event.user === "partner" ? "bg-user-b" : "bg-gradient-to-b from-user-a to-user-b"}`} />
                <div className="flex-1">
                  <p className="text-[15px] font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{event.time}</p>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">Calendar</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No scheduled tasks for today</p>
        )}
      </section>

      {/* Just Do It Today */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Just Do it Today</h2>
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

const TaskCard = ({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) => (
  <motion.div
    layout
    className="bg-card rounded-xl p-4 shadow-card border border-border active:scale-[0.99] transition-transform"
  >
    {task.time && (
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={13} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{task.time}</span>
      </div>
    )}
    <div className="flex items-center gap-3">
      <button
        onClick={() => onToggle(task.id)}
        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done ? "bg-foreground border-foreground" : "border-muted"
        }`}
      >
        {task.done && <Check size={14} className="text-background" />}
      </button>
      <span className={`flex-1 text-[15px] font-medium tracking-body ${task.done ? "line-through opacity-40" : ""}`}>
        {task.title}
      </span>
      <UserBadge user={task.assignee} />
      <button className="text-muted-foreground p-1">
        <MoreVertical size={16} />
      </button>
    </div>
    <div className="mt-2 ml-9">
      <TaskTag tag={task.tag} />
    </div>
  </motion.div>
);

export default HomePage;
