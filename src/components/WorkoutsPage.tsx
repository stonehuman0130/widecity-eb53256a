import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, Clock, Flame, Check, MoreVertical, Trash2, ChevronDown, ChevronUp, Loader2, X, Dumbbell, AlertTriangle, Target, ExternalLink, ArrowRight, RotateCcw, Calendar as CalIcon, Copy, Plus } from "lucide-react";
import { useAppContext, Workout } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface AIPlan {
  title: string;
  emoji: string;
  duration: string;
  cal: number;
  tag: string;
  exercises: { name: string; sets: number; reps: string }[];
}

interface AIDayPlan {
  date: string;
  dayLabel: string;
  isRest: boolean;
  workout?: AIPlan;
}

interface ExerciseDetail {
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  musclesWorked: string[];
  videoSearchQuery: string;
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayStr = () => fmtDate(new Date());

const MANUAL_ACTIVITIES = [
  { emoji: "🏃", title: "Running", tag: "Cardio", defaultDuration: "30 min", defaultCal: 300 },
  { emoji: "🧘", title: "Yoga", tag: "Flexibility", defaultDuration: "45 min", defaultCal: 200 },
  { emoji: "🚴", title: "Cycling", tag: "Cardio", defaultDuration: "40 min", defaultCal: 350 },
  { emoji: "🏊", title: "Swimming", tag: "Full Body", defaultDuration: "30 min", defaultCal: 400 },
  { emoji: "🚶", title: "Walking", tag: "Cardio", defaultDuration: "30 min", defaultCal: 150 },
  { emoji: "🤸", title: "Stretching", tag: "Flexibility", defaultDuration: "15 min", defaultCal: 50 },
  { emoji: "🥊", title: "Boxing", tag: "Cardio", defaultDuration: "30 min", defaultCal: 350 },
  { emoji: "⚽", title: "Sports", tag: "Full Body", defaultDuration: "60 min", defaultCal: 500 },
];

const WorkoutsPage = () => {
  const { workouts, toggleWorkout, removeWorkout, setWorkouts, addWorkouts, rescheduleWorkout, getWorkoutsForDate } = useAppContext();
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlans, setAiPlans] = useState<AIPlan[] | null>(null);
  const [aiWeeklyPlan, setAiWeeklyPlan] = useState<AIDayPlan[] | null>(null);
  const [planType, setPlanType] = useState<"today" | "week" | "month">("today");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDuration, setCustomDuration] = useState("30");
  const [customCal, setCustomCal] = useState("200");

  const today = todayStr();

  // Generate date range: 7 days back + 14 days forward
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 7);
    for (let i = 0; i < 28; i++) {
      dates.push(fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, []);

  const dateWorkouts = useMemo(() => getWorkoutsForDate(selectedDate), [selectedDate, getWorkoutsForDate]);

  // Find missed workouts (scheduled before today, not done)
  const missedWorkouts = useMemo(() => {
    return workouts.filter((w) => w.scheduledDate && w.scheduledDate < today && !w.done);
  }, [workouts, today]);

  const isToday = selectedDate === today;
  const isPast = selectedDate < today;
  const isFuture = selectedDate > today;

  const handleAiPlan = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const body: any = { prompt: aiPrompt };
      if (planType !== "today") {
        body.planType = planType;
        body.startDate = today;
      }
      const { data, error } = await supabase.functions.invoke("ai-workout", { body });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (planType !== "today" && data.days) {
        setAiWeeklyPlan(data.days);
        setAiPlans(null);
      } else {
        setAiPlans(data.plans);
        setAiWeeklyPlan(null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("AI workout error", { description: e.message });
    } finally {
      setAiLoading(false);
    }
  };

  const selectPlan = (plan: AIPlan, scheduledDate?: string) => {
    const newWorkout: Workout = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: plan.title,
      duration: plan.duration,
      cal: plan.cal,
      tag: plan.tag,
      emoji: plan.emoji,
      done: false,
      scheduledDate: scheduledDate || today,
      exercises: plan.exercises,
    };
    addWorkouts([newWorkout]);
    toast.success(`Added: ${plan.title}`);
  };

  const acceptWeeklyPlan = () => {
    if (!aiWeeklyPlan) return;
    const newWorkouts: Workout[] = [];
    for (const day of aiWeeklyPlan) {
      if (!day.isRest && day.workout) {
        newWorkouts.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          title: day.workout.title,
          duration: day.workout.duration,
          cal: day.workout.cal,
          tag: day.workout.tag,
          emoji: day.workout.emoji,
          done: false,
          scheduledDate: day.date,
          exercises: day.workout.exercises,
        });
      }
    }
    addWorkouts(newWorkouts);
    setAiWeeklyPlan(null);
    setAiPrompt("");
    toast.success(`Added ${newWorkouts.length} workouts to your plan!`);
  };

  const handleReschedule = (id: string, toDate: string) => {
    rescheduleWorkout(id, toDate);
    const dateLabel = toDate === today ? "today" : new Date(toDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    toast.success(`Moved to ${dateLabel}`);
  };

  const getNextDay = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return fmtDate(d);
  };

  const addManualActivity = (activity: typeof MANUAL_ACTIVITIES[0]) => {
    const newWorkout: Workout = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: activity.title,
      duration: activity.defaultDuration,
      cal: activity.defaultCal,
      tag: activity.tag,
      emoji: activity.emoji,
      done: false,
      scheduledDate: selectedDate,
    };
    addWorkouts([newWorkout]);
    toast.success(`Added ${activity.title}`);
  };

  const addCustomActivity = () => {
    if (!customTitle.trim()) return;
    const newWorkout: Workout = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: customTitle,
      duration: `${customDuration} min`,
      cal: parseInt(customCal) || 0,
      tag: "Other",
      emoji: "🏋️",
      done: false,
      scheduledDate: selectedDate,
    };
    addWorkouts([newWorkout]);
    setCustomTitle("");
    setCustomDuration("30");
    setCustomCal("200");
    setShowManualAdd(false);
    toast.success(`Added ${customTitle}`);
  };

  const completedCount = workouts.filter((w) => w.done).length;
  const totalCal = workouts.filter((w) => w.done).reduce((sum, w) => sum + w.cal, 0);
  const todayCal = workouts.filter((w) => w.done && w.completedDate === today).reduce((sum, w) => sum + w.cal, 0);

  return (
    <div className="px-5 pb-24">
      <header className="pt-12 pb-4">
        <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stay active and healthy together</p>
      </header>

      {/* AI Workout Planner */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-purple-500" />
          <span className="text-sm font-semibold">AI Workout Planner</span>
        </div>

        {/* Plan Type Selector */}
        <div className="flex gap-1.5 mb-3">
          {(["today", "week", "month"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setPlanType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                planType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {type === "today" ? "Today" : type === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAiPlan()}
            placeholder={
              planType === "today"
                ? "e.g. Plan me a chest workout..."
                : planType === "week"
                ? "e.g. Build me a push/pull/legs week..."
                : "e.g. Give me a 4-week strength program..."
            }
            className="flex-1 bg-card rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground border border-border"
          />
          <button
            onClick={handleAiPlan}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {aiLoading ? "..." : "Go"}
          </button>
        </div>
      </div>

      {/* AI Single Day Plans */}
      <AnimatePresence>
        {aiPlans && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Choose a plan</h3>
              <button onClick={() => setAiPlans(null)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {aiPlans.map((plan, i) => (
                <button
                  key={i}
                  onClick={() => { selectPlan(plan); setAiPlans(null); setAiPrompt(""); }}
                  className="w-full bg-card rounded-xl border border-border p-4 text-left hover:border-primary/50 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{plan.emoji}</span>
                    <div className="flex-1">
                      <p className="text-[15px] font-semibold">{plan.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{plan.duration}</span>
                        <span>~{plan.cal} cal</span>
                        <span className="text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">{plan.tag}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-9 space-y-1">
                    {plan.exercises.slice(0, 3).map((ex, j) => (
                      <p key={j} className="text-xs text-muted-foreground">• {ex.name} — {ex.sets}×{ex.reps}</p>
                    ))}
                    {plan.exercises.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{plan.exercises.length - 3} more</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Weekly/Monthly Plan Preview */}
      <AnimatePresence>
        {aiWeeklyPlan && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">📅 {planType === "month" ? "Monthly" : "Weekly"} Plan</h3>
              <button onClick={() => setAiWeeklyPlan(null)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {aiWeeklyPlan.map((day, i) => (
                <div
                  key={i}
                  className={`bg-card rounded-xl border p-3 ${day.isRest ? "border-border opacity-60" : "border-border"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground">{day.dayLabel}</span>
                      <span className="text-xs text-muted-foreground ml-2">{new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    {day.isRest && <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">🛌 Rest</span>}
                  </div>
                  {!day.isRest && day.workout && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xl">{day.workout.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{day.workout.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{day.workout.duration}</span>
                          <span>~{day.workout.cal} cal</span>
                          <span className="text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">{day.workout.tag}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={acceptWeeklyPlan}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
              >
                ✅ Add All to Schedule
              </button>
              <button
                onClick={() => setAiWeeklyPlan(null)}
                className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "workouts", value: String(completedCount), sublabel: "Done", icon: "📈" },
          { label: "calories", value: String(totalCal), sublabel: "All Time", icon: "🔥" },
          { label: "calories", value: String(todayCal), sublabel: "Today", icon: "✅" },
        ].map((stat) => (
          <div key={stat.sublabel} className="bg-card rounded-xl p-3 border border-border shadow-card">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">{stat.sublabel}</span>
            <p className="text-xl font-bold tracking-display mt-0.5">{stat.value}</p>
            <span className="text-[11px] text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Missed Workouts Banner */}
      {missedWorkouts.length > 0 && isToday && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-5">
          <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
            <AlertTriangle size={14} />
            {missedWorkouts.length} Missed Workout{missedWorkouts.length > 1 ? "s" : ""}
          </h3>
          <div className="space-y-2">
            {missedWorkouts.map((w) => (
              <div key={w.id} className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border">
                <span className="text-xl">{w.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{w.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Was: {new Date(w.scheduledDate! + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleReschedule(w.id, today)}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                    title="Move to today"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => handleReschedule(w.id, getNextDay(today))}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium"
                    title="Move to tomorrow"
                  >
                    Tmrw
                  </button>
                  <button
                    onClick={() => removeWorkout(w.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"
                    title="Skip"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date Strip */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <CalIcon size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Schedule</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
          {dateRange.map((date) => {
            const d = new Date(date + "T00:00:00");
            const isSelected = date === selectedDate;
            const isT = date === today;
            const hasWorkouts = workouts.some((w) => w.scheduledDate === date || w.completedDate === date);
            const hasMissed = workouts.some((w) => w.scheduledDate === date && date < today && !w.done);
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex-shrink-0 w-12 py-2 rounded-xl flex flex-col items-center gap-0.5 transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isT
                    ? "bg-primary/10 text-primary"
                    : "bg-card border border-border text-foreground"
                }`}
              >
                <span className="text-[10px] font-medium uppercase">
                  {d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3)}
                </span>
                <span className="text-sm font-bold">{d.getDate()}</span>
                {hasWorkouts && (
                  <span className={`w-1.5 h-1.5 rounded-full ${hasMissed ? "bg-destructive" : isSelected ? "bg-primary-foreground" : "bg-habit-green"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Workouts */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display">
            {isToday ? "Today's Plan" : isPast ? "Past Workout" : "Upcoming"}
          </h2>
          <span className="text-xs text-muted-foreground font-medium">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>

        <div className="space-y-3">
          {dateWorkouts.length > 0 ? (
            dateWorkouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onToggle={toggleWorkout}
                onRemove={removeWorkout}
                onExerciseTap={setSelectedExercise}
                isPast={isPast}
                isFuture={isFuture}
                onReschedule={(id) => handleReschedule(id, today)}
              />
            ))
          ) : (
            <div className="text-center py-8 bg-card rounded-xl border border-border">
              <p className="text-muted-foreground text-sm">
                {isPast ? "No workouts recorded" : isFuture ? "Nothing planned yet" : "No workouts planned"}
              </p>
              {isToday && <p className="text-xs text-muted-foreground mt-1">Use the AI Planner above to generate a workout</p>}
            </div>
          )}
        </div>
      </div>

      {/* Manual Add Section */}
      <div className="mb-4">
        <button
          onClick={() => setShowManualAdd(!showManualAdd)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Plus size={16} />
          Add Activity Manually
        </button>

        <AnimatePresence>
          {showManualAdd && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 space-y-3">
                {/* Quick Add Presets */}
                <div className="grid grid-cols-4 gap-2">
                  {MANUAL_ACTIVITIES.map((activity) => (
                    <button
                      key={activity.title}
                      onClick={() => addManualActivity(activity)}
                      className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
                    >
                      <span className="text-xl">{activity.emoji}</span>
                      <span className="text-[11px] font-medium text-center leading-tight">{activity.title}</span>
                    </button>
                  ))}
                </div>

                {/* Custom Entry */}
                <div className="bg-card rounded-xl border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Custom Activity</p>
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Activity name..."
                    className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground border border-border"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">Duration (min)</label>
                      <input
                        type="number"
                        value={customDuration}
                        onChange={(e) => setCustomDuration(e.target.value)}
                        className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none border border-border"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground">Calories</label>
                      <input
                        type="number"
                        value={customCal}
                        onChange={(e) => setCustomCal(e.target.value)}
                        className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none border border-border"
                      />
                    </div>
                  </div>
                  <button
                    onClick={addCustomActivity}
                    disabled={!customTitle.trim()}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                  >
                    Add Activity
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        open={!!selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />
    </div>
  );
};

/* ─── Workout Card ─── */
const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
  onExerciseTap,
  isPast,
  isFuture,
  onReschedule,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExerciseTap: (name: string) => void;
  isPast?: boolean;
  isFuture?: boolean;
  onReschedule?: (id: string) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isMissed = isPast && !workout.done;

  return (
    <div className={`bg-card rounded-xl border shadow-card transition-all ${
      workout.done ? "border-habit-green/50" : isMissed ? "border-destructive/30" : "border-border"
    }`}>
      <div className="p-4 flex items-center gap-4">
        <span className="text-3xl">{workout.emoji}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-[15px] font-semibold ${workout.done ? "line-through opacity-50" : ""}`}>{workout.title}</p>
            {isMissed && <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">MISSED</span>}
            {workout.done && <span className="text-[10px] font-semibold text-habit-green bg-habit-green/10 px-1.5 py-0.5 rounded">DONE</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={12} /> {workout.duration}</span>
            <span className="flex items-center gap-1"><Flame size={12} /> {workout.cal} cal</span>
          </div>
          <span className="inline-block mt-1.5 text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">
            {workout.tag}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Show reschedule button for missed workouts */}
          {isMissed && onReschedule && (
            <button
              onClick={() => onReschedule(workout.id)}
              className="p-2 rounded-full bg-primary/10 text-primary"
              title="Move to today"
            >
              <RotateCcw size={14} />
            </button>
          )}

          {/* Toggle (only for today/past unfulfilled) */}
          {!isFuture && (
            <button
              onClick={() => {
                if (!workout.done) {
                  toast.success("🎉 Congrats!", { description: "You're becoming healthier every day!" });
                }
                onToggle(workout.id);
              }}
              className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors ${
                workout.done
                  ? "bg-habit-green border-habit-green text-primary-foreground"
                  : "border-muted bg-transparent text-muted-foreground"
              }`}
            >
              {workout.done && <Check size={18} />}
            </button>
          )}

          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-muted-foreground p-1">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[150px] overflow-hidden">
                  <button
                    onClick={() => { onRemove(workout.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-destructive/10 text-destructive transition-colors text-left"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {workout.exercises && workout.exercises.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground font-medium border-t border-border hover:bg-secondary/50 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide details" : `${workout.exercises.length} exercises`}
          </button>
          {expanded && (
            <div className="px-4 pb-4 space-y-1">
              {workout.exercises.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => onExerciseTap(ex.name)}
                  className="w-full flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
                >
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{ex.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{ex.sets} × {ex.reps}</span>
                    <Dumbbell size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ─── Exercise Detail Dialog ─── */
const ExerciseDetailDialog = ({
  exerciseName,
  open,
  onClose,
}: {
  exerciseName: string | null;
  open: boolean;
  onClose: () => void;
}) => {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async (name: string) => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("exercise-detail", {
        body: { exerciseName: name },
      });
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);
      setDetail(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load exercise details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && exerciseName) {
      fetchDetail(exerciseName);
    }
    if (!open) {
      setDetail(null);
      setError(null);
    }
  }, [open, exerciseName]);

  const youtubeSearchUrl = detail?.videoSearchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(detail.videoSearchQuery)}`
    : null;

  const handleWatchDemo = () => {
    if (youtubeSearchUrl) {
      // Use window.open as primary, copy to clipboard as fallback
      const opened = window.open(youtubeSearchUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        navigator.clipboard.writeText(youtubeSearchUrl).then(() => {
          toast.info("Link copied!", { description: "Paste it in your browser to watch the demo." });
        }).catch(() => {
          toast.error("Could not open link. Please search YouTube for: " + detail?.videoSearchQuery);
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Dumbbell size={18} className="text-primary" />
            {exerciseName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-80px)]">
          <div className="p-5 space-y-5">
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            )}

            {error && (
              <div className="text-center py-6">
                <p className="text-sm text-destructive mb-2">{error}</p>
                <button
                  onClick={() => exerciseName && fetchDetail(exerciseName)}
                  className="text-sm text-primary font-medium"
                >
                  Try again
                </button>
              </div>
            )}

            {detail && (
              <>
                {/* Watch Demo - opens externally with fallback */}
                {youtubeSearchUrl && (
                  <div className="space-y-2">
                    <button
                      onClick={handleWatchDemo}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-500/10 text-red-500 text-sm font-semibold hover:bg-red-500/20 transition-colors border border-red-500/20"
                    >
                      <ExternalLink size={14} />
                      🎬 Watch Demo on YouTube
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(youtubeSearchUrl);
                        toast.success("Link copied to clipboard!");
                      }}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs text-muted-foreground font-medium hover:bg-secondary transition-colors"
                    >
                      <Copy size={12} />
                      Copy link if blocked
                    </button>
                  </div>
                )}

                {/* Steps */}
                <section>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    📋 How to Perform
                  </h3>
                  <ol className="space-y-2">
                    {detail.steps.map((step, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                {/* Form Cues */}
                <section>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Target size={14} className="text-primary" />
                    Form Cues
                  </h3>
                  <div className="space-y-1.5">
                    {detail.formCues.map((cue, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-0.5">✓</span>
                        <span>{cue}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Common Mistakes */}
                <section>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-destructive" />
                    Common Mistakes
                  </h3>
                  <div className="space-y-1.5">
                    {detail.commonMistakes.map((mistake, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-destructive mt-0.5">✗</span>
                        <span>{mistake}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Muscles Worked */}
                <section>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    💪 Muscles Worked
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.musclesWorked.map((muscle, i) => (
                      <span
                        key={i}
                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                      >
                        {muscle}
                      </span>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutsPage;
