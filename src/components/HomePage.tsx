import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Mic, Clock, Check, Loader2 } from "lucide-react";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";
import TaskActionMenu from "@/components/TaskActionMenu";
import AddItemModal from "@/components/AddItemModal";
import { useAppContext, Task } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Filter = "mine" | "partner" | "household";

const HomePage = () => {
  const [filter, setFilter] = useState<Filter>("mine");
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { habits, toggleHabit, events, tasks, toggleTask, addTask, addEvent } = useAppContext();

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

  const handleAiSchedule = async () => {
    if (!input.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-schedule", {
        body: { text: input },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.type === "add_habit") {
        addHabit(data.label, data.category);
        toast.success(`Habit added: ${data.label}`, {
          description: `Added to ${data.category} habits`,
        });
      } else {
        const date = data.date ? new Date(data.date + "T00:00:00") : new Date();
        const day = date.getDate();
        const month = date.getMonth();
        const year = date.getFullYear();

        addEvent({
          title: data.title,
          time: data.time || "All day",
          description: data.description || "",
          day,
          month,
          year,
          user: "me",
        });

        addTask({
          title: data.title,
          time: data.time || "",
          tag: "Personal",
          assignee: "me",
          scheduledDay: day,
          scheduledMonth: month,
          scheduledYear: year,
        });

        toast.success(`Scheduled: ${data.title}`, {
          description: `${data.date} ${data.time || "All day"}`,
        });
      }
      setInput("");
    } catch (e: any) {
      console.error(e);
      toast.error("AI couldn't parse that", { description: e.message });
    } finally {
      setAiLoading(false);
    }
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

  const todayEvents = events.filter(
    (e) => e.day === today.getDate() && e.month === today.getMonth() && e.year === today.getFullYear()
  );

  const scheduledTasks = filteredTasks.filter((t) => t.time);
  const justDoIt = filteredTasks.filter((t) => !t.time);

  const todayFormatted = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="px-5">
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
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              handleAiSchedule();
            } else if (e.key === "Enter") {
              handleQuickAdd();
            }
          }}
          placeholder="Type 'dentist at 2pm Tuesday' then ✨ or Enter..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={handleAiSchedule}
          disabled={aiLoading || !input.trim()}
          className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-primary-foreground disabled:opacity-50"
        >
          {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </button>
        <button
          onClick={handleQuickAdd}
          disabled={!input.trim()}
          className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50"
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

const TaskCard = ({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) => {
  const handleToggle = () => {
    if (!task.done) {
      toast.success("🎉 Task complete!", { description: "Great job, keep it up!" });
    }
    onToggle(task.id);
  };

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${task.done ? "border-habit-green/50" : "border-border"}`}
    >
      {task.time && (
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{task.time}</span>
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

export default HomePage;
