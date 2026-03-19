import { useState, useEffect, useMemo, useRef } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { Sparkles, Clock, Flame, Check, MoreVertical, Trash2, ChevronDown, ChevronUp, Loader2, X, Dumbbell, AlertTriangle, Target, ArrowRight, RotateCcw, Calendar as CalIcon, Plus, Mic } from "lucide-react";
import { useAppContext, Workout } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import CongratsPopup from "@/components/CongratsPopup";
import GroupSelector from "@/components/GroupSelector";
import { useGroupContext } from "@/hooks/useGroupContext";

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
  videoSearchQuery?: string;
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

type ViewFilter = "mine" | "partner";

const WorkoutsPage = () => {
  const { workouts, filteredWorkouts, toggleWorkout, removeWorkout, setWorkouts, addWorkouts, rescheduleWorkout, getWorkoutsForDate, partnerWorkouts, getPartnerWorkoutsForDate } = useAppContext();
  const { partner } = useAuth();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const { listening: wListen, start: wStart, stop: wStop, isSupported: wSpeech } = useSpeechToText({
    onResult: (t) => setAiPrompt((p) => (p ? p + " " + t : t)),
  });
  const [aiPlans, setAiPlans] = useState<AIPlan[] | null>(null);
  const [aiWeeklyPlan, setAiWeeklyPlan] = useState<AIDayPlan[] | null>(null);
  // planType is now inferred by AI, not user-selected
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDuration, setCustomDuration] = useState("30");
  const [customCal, setCustomCal] = useState("200");

  const isViewingPartner = viewFilter === "partner";
  const today = todayStr();

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

  const dateWorkouts = useMemo(() => {
    if (isViewingPartner) return getPartnerWorkoutsForDate(selectedDate);
    return filteredWorkouts.filter((w) => w.scheduledDate === selectedDate || w.completedDate === selectedDate);
  }, [selectedDate, filteredWorkouts, getPartnerWorkoutsForDate, isViewingPartner]);

  const activeWorkouts = isViewingPartner ? partnerWorkouts : filteredWorkouts;

  const missedWorkouts = useMemo(() => {
    if (isViewingPartner) return [];
    return filteredWorkouts.filter((w) => w.scheduledDate && w.scheduledDate < today && !w.done);
  }, [filteredWorkouts, today, isViewingPartner]);

  const isToday = selectedDate === today;
  const isPast = selectedDate < today;
  const isFuture = selectedDate > today;

  const handleAiPlan = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const body: any = { prompt: aiPrompt, startDate: today };
      const { data, error } = await supabase.functions.invoke("ai-workout", { body });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.days) {
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

  const handleToggleWorkout = (id: string) => {
    if (isViewingPartner) return;
    const workout = workouts.find((w) => w.id === id);
    if (workout && !workout.done) {
      setShowCongrats(true);
    }
    toggleWorkout(id);
  };

  const completedCount = activeWorkouts.filter((w) => w.done).length;
  const totalCal = activeWorkouts.filter((w) => w.done).reduce((sum, w) => sum + w.cal, 0);
  const todayCal = activeWorkouts.filter((w) => w.done && w.completedDate === today).reduce((sum, w) => sum + w.cal, 0);
  const { twoTabFilters, hasOther, otherName } = useGroupContext();
  const partnerName = otherName;

  return (
    <div className="px-5 pb-24">
      {showCongrats && (
        <CongratsPopup type="workout" show={true} onClose={() => setShowCongrats(false)} />
      )}

      <header className="pt-12 pb-4">
        <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stay active and healthy together</p>
      </header>

      {/* Group Selector */}
      <GroupSelector />

      {/* Mine / Member Toggle */}
      {hasOther && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
          {twoTabFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id as ViewFilter)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                viewFilter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* AI Workout Planner - only for own view */}
      {!isViewingPartner && (
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-500" />
            <span className="text-sm font-semibold">AI Workout Planner</span>
          </div>

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
              className="flex-1 bg-card rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground border border-border min-w-0"
            />
            {wSpeech && (
              <button
                onClick={wListen ? wStop : wStart}
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  wListen
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mic size={16} />
              </button>
            )}
            <button
              onClick={handleAiPlan}
              disabled={aiLoading || !aiPrompt.trim()}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
            >
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {aiLoading ? "..." : "Go"}
            </button>
          </div>
        </div>
      )}

      {/* AI Single Day Plans */}
      <AnimatePresence>
        {aiPlans && !isViewingPartner && (
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
        {aiWeeklyPlan && !isViewingPartner && (
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
          { label: "workouts", value: String(completedCount), sublabel: isViewingPartner ? `${partnerName}` : "Done", icon: "📈" },
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
      {missedWorkouts.length > 0 && isToday && !isViewingPartner && (
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
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1"
                  >
                    <RotateCcw size={10} /> Today
                  </button>
                  <button
                    onClick={() => handleReschedule(w.id, getNextDay(today))}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium flex items-center gap-1"
                  >
                    <ArrowRight size={10} /> Tomorrow
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date selector strip */}
      <div className="mb-5 -mx-5">
        <div
          className="flex gap-2 px-5 pb-2 overflow-x-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
          ref={(el) => {
            if (el) {
              const selectedEl = el.querySelector('[data-selected="true"]');
              if (selectedEl) {
                selectedEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
              }
            }
          }}
        >
          {dateRange.map((date) => {
            const d = new Date(date + "T00:00:00");
            const dayNum = d.getDate();
            const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
            const isSelected = date === selectedDate;
            const isT = date === today;
            const hasWorkouts = isViewingPartner
              ? getPartnerWorkoutsForDate(date).length > 0
              : getWorkoutsForDate(date).length > 0;

            return (
              <button
                key={date}
                data-selected={isSelected}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center min-w-[48px] flex-shrink-0 py-2 px-1 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="text-[10px] font-medium">{dayName}</span>
                <span className={`text-base font-bold ${isT && !isSelected ? "text-primary" : ""}`}>{dayNum}</span>
                {hasWorkouts && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Add Activities - only for own view */}
      {!isViewingPartner && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Quick Add</h3>
            <button
              onClick={() => setShowManualAdd(!showManualAdd)}
              className="text-xs text-primary font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Custom
            </button>
          </div>

          {showManualAdd && (
            <div className="bg-card rounded-xl border border-border p-3 mb-3 space-y-2">
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Activity name..."
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Duration (min)</label>
                  <input
                    type="number"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none mt-0.5"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Calories</label>
                  <input
                    type="number"
                    value={customCal}
                    onChange={(e) => setCustomCal(e.target.value)}
                    className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none mt-0.5"
                  />
                </div>
              </div>
              <button
                onClick={addCustomActivity}
                disabled={!customTitle.trim()}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                Add Activity
              </button>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {MANUAL_ACTIVITIES.map((activity) => (
              <button
                key={activity.title}
                onClick={() => addManualActivity(activity)}
                className="flex flex-col items-center min-w-[72px] p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97]"
              >
                <span className="text-2xl mb-1">{activity.emoji}</span>
                <span className="text-[11px] font-medium text-center">{activity.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Date Workouts */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <CalIcon size={14} className="text-muted-foreground" />
          {isViewingPartner
            ? `${partnerName}'s Workouts`
            : isToday ? "Today's Workouts" : isFuture ? "Upcoming" : "Past Workouts"}
          <span className="text-muted-foreground text-xs">({dateWorkouts.length})</span>
        </h3>

        {dateWorkouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {isViewingPartner
              ? `${partnerName} has no workouts on this day`
              : isToday ? "No workouts today. Add one above!" : isFuture ? "Nothing scheduled yet." : "No workouts on this day."}
          </p>
        ) : (
          <div className="space-y-3">
            {dateWorkouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onToggle={handleToggleWorkout}
                onRemove={removeWorkout}
                onSelectExercise={setSelectedExercise}
                isToday={isToday}
                readOnly={isViewingPartner}
              />
            ))}
          </div>
        )}
      </section>

      {/* Exercise Detail Dialog */}
      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />
    </div>
  );
};

const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
  onSelectExercise,
  isToday,
  readOnly,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSelectExercise: (name: string) => void;
  isToday: boolean;
  readOnly?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div layout className={`bg-card rounded-xl border shadow-card overflow-hidden ${workout.done ? "border-habit-green/50" : "border-border"}`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{workout.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold truncate">{workout.title}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={11} /> {workout.duration}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Flame size={11} /> {workout.cal} cal
              </span>
              {workout.tag && (
                <span className="text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">{workout.tag}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isToday && !readOnly && (
              <button
                onClick={() => onToggle(workout.id)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                  workout.done ? "bg-habit-green border-habit-green" : "border-muted hover:border-primary"
                }`}
              >
                {workout.done && <Check size={14} className="text-primary-foreground" />}
              </button>
            )}
            {!readOnly && (
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-muted-foreground">
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <>
                    <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-8 z-50 min-w-[120px] rounded-xl border border-border bg-card shadow-card overflow-hidden">
                      <button
                        onClick={() => { onRemove(workout.id); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exercises */}
      {workout.exercises && workout.exercises.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2 border-t border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide" : "Show"} {workout.exercises.length} exercises
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2">
                  {workout.exercises.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => onSelectExercise(ex.name)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ex.name}</p>
                        <p className="text-xs text-muted-foreground">{ex.sets} sets × {ex.reps}</p>
                      </div>
                      <Target size={14} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
};

const ExerciseDetailDialog = ({ exerciseName, onClose }: { exerciseName: string | null; onClose: () => void }) => {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseName) { setDetail(null); return; }
    setLoading(true);
    supabase.functions.invoke("exercise-detail", { body: { exercise: exerciseName } })
      .then(({ data, error }) => {
        if (!error && data && !data.error) setDetail(data);
        else setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [exerciseName]);

  const searchQuery = detail?.videoSearchQuery || `how to do ${exerciseName} exercise form`;

  return (
    <Dialog open={!!exerciseName} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell size={18} />
            {exerciseName}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-2">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors"
              >
                <span className="text-2xl">▶️</span>
                <div>
                  <p className="text-sm font-semibold">Watch Demo on YouTube</p>
                  <p className="text-xs text-muted-foreground">Opens YouTube search for "{exerciseName}"</p>
                </div>
              </a>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">📋 How to Perform</h4>
                <ol className="space-y-1.5">
                  {detail.steps.map((step, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="font-semibold text-foreground flex-shrink-0">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">💪 Muscles Worked</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.musclesWorked.map((m, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{m}</span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">🎯 Form Cues</h4>
                <ul className="space-y-1">
                  {detail.formCues.map((cue, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Check size={14} className="text-habit-green flex-shrink-0 mt-0.5" />
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">⚠️ Common Mistakes</h4>
                <ul className="space-y-1">
                  {detail.commonMistakes.map((mistake, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <X size={14} className="text-destructive flex-shrink-0 mt-0.5" />
                      {mistake}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Could not load exercise details.</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutsPage;
