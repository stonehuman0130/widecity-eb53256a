import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Mic, Clock, MoreVertical, Check } from "lucide-react";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";

type Filter = "mine" | "partner" | "household";

interface Task {
  id: string;
  title: string;
  time: string;
  tag: "Work" | "Personal" | "Household";
  assignee: "me" | "partner";
  done: boolean;
}

interface Habit {
  id: string;
  label: string;
  done: boolean;
}

const initialHabits: Habit[] = [
  { id: "1", label: "Drink Olive Oil", done: false },
  { id: "2", label: "Take Vitamins", done: true },
  { id: "3", label: "Stretch", done: false },
];

const initialTasks: Task[] = [
  { id: "1", title: "Review design mockups", time: "10:30 AM", tag: "Work", assignee: "me", done: false },
  { id: "2", title: "Call mom about weekend", time: "2:00 PM", tag: "Personal", assignee: "me", done: false },
  { id: "3", title: "Walk Cookie at 4 PM", time: "4:00 PM", tag: "Household", assignee: "partner", done: false },
  { id: "4", title: "Pick up dry cleaning", time: "5:30 PM", tag: "Personal", assignee: "me", done: false },
];

const HomePage = () => {
  const [filter, setFilter] = useState<Filter>("mine");
  const [habits, setHabits] = useState(initialHabits);
  const [tasks, setTasks] = useState(initialTasks);
  const [input, setInput] = useState("");

  const toggleHabit = (id: string) => {
    setHabits((h) => h.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const toggleTask = (id: string) => {
    setTasks((t) => t.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const addTask = () => {
    if (!input.trim()) return;
    setTasks((t) => [
      ...t,
      { id: Date.now().toString(), title: input, time: "", tag: "Personal", assignee: "me", done: false },
    ]);
    setInput("");
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "mine", label: "Mine" },
    { id: "partner", label: "Evelyn's" },
    { id: "household", label: "Household" },
  ];

  const filteredTasks = tasks.filter((t) => {
    if (filter === "mine") return t.assignee === "me";
    if (filter === "partner") return t.assignee === "partner";
    return t.tag === "Household";
  });

  const scheduledTasks = filteredTasks.filter((t) => t.time && !t.done);
  const justDoIt = filteredTasks.filter((t) => !t.time && !t.done);

  return (
    <div className="px-5">
      {/* Header */}
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Good morning 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Let's make today count, Harrison</p>
        </div>
        <button className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card mt-1">
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
          onKeyDown={(e) => e.key === "Enter" && addTask()}
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
          {habits.map((habit) => (
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
      {scheduledTasks.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
            <span className="text-sm text-muted-foreground">({scheduledTasks.length})</span>
          </div>
          <div className="space-y-3">
            {scheduledTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={toggleTask} />
            ))}
          </div>
        </section>
      )}

      {/* Just Do It */}
      {justDoIt.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-foreground" />
            <h2 className="text-lg font-semibold tracking-display">Just Do it Today</h2>
            <span className="text-sm text-muted-foreground">({justDoIt.length})</span>
          </div>
          <div className="space-y-3">
            {justDoIt.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={toggleTask} />
            ))}
          </div>
        </section>
      )}
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
