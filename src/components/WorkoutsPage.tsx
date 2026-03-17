import { useState, useEffect } from "react";
import { Sparkles, Clock, Flame, Check, MoreVertical, Trash2, ChevronDown, ChevronUp, Loader2, X, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, AlertTriangle, Target, ExternalLink } from "lucide-react";
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

interface ExerciseDetail {
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  musclesWorked: string[];
  videoSearchQuery: string;
  imageUrl?: string | null;
}

const WorkoutsPage = () => {
  const { workouts, toggleWorkout, removeWorkout, setWorkouts, getWorkoutsForDate } = useAppContext();
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlans, setAiPlans] = useState<AIPlan[] | null>(null);
  const [viewingDate, setViewingDate] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const completedCount = workouts.filter((w) => w.done).length;
  const totalCal = workouts.reduce((sum, w) => sum + w.cal, 0);
  const todayCal = workouts.filter((w) => w.done).reduce((sum, w) => sum + w.cal, 0);

  const handleAiPlan = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-workout", {
        body: { prompt: aiPrompt },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAiPlans(data.plans);
    } catch (e: any) {
      console.error(e);
      toast.error("AI workout error", { description: e.message });
    } finally {
      setAiLoading(false);
    }
  };

  const selectPlan = (plan: AIPlan) => {
    const newWorkout: Workout = {
      id: Date.now().toString(),
      title: plan.title,
      duration: plan.duration,
      cal: plan.cal,
      tag: plan.tag,
      emoji: plan.emoji,
      done: false,
      exercises: plan.exercises,
    };
    setWorkouts([...workouts, newWorkout]);
    setAiPlans(null);
    setAiPrompt("");
    toast.success(`Added: ${plan.title}`);
  };

  const shiftDate = (days: number) => {
    if (!viewingDate) return;
    const d = new Date(viewingDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setViewingDate(d.toISOString().split("T")[0]);
  };

  const pastWorkouts = viewingDate ? getWorkoutsForDate(viewingDate) : [];

  return (
    <div className="px-5">
      <header className="pt-12 pb-4">
        <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stay active and healthy together</p>
      </header>

      {/* AI Workout Planner */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-purple-500" />
          <span className="text-sm font-semibold">AI Workout Planner</span>
        </div>
        <div className="flex gap-2">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAiPlan()}
            placeholder="e.g. Plan me a chest workout today..."
            className="flex-1 bg-card rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground border border-border"
          />
          <button
            onClick={handleAiPlan}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {aiLoading ? "Thinking..." : "Generate"}
          </button>
        </div>
      </div>

      {/* AI Plan Selection */}
      <AnimatePresence>
        {aiPlans && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Choose a plan</h3>
              <button onClick={() => setAiPlans(null)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {aiPlans.map((plan, i) => (
                <button
                  key={i}
                  onClick={() => selectPlan(plan)}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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

      {/* Past Date Viewer */}
      {!viewingDate ? (
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            setViewingDate(d.toISOString().split("T")[0]);
          }}
          className="flex items-center gap-2 text-sm text-primary font-medium mb-4"
        >
          <CalendarDays size={16} />
          View past workouts
        </button>
      ) : (
        <div className="bg-card rounded-xl p-4 border border-border shadow-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftDate(-1)} className="p-1 rounded-lg bg-secondary"><ChevronLeft size={16} /></button>
            <p className="text-sm font-semibold">
              {new Date(viewingDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <button onClick={() => shiftDate(1)} className="p-1 rounded-lg bg-secondary"><ChevronRight size={16} /></button>
          </div>
          {pastWorkouts.length > 0 ? (
            <div className="space-y-2">
              {pastWorkouts.map((w) => (
                <div key={w.id} className="flex items-center gap-3 text-sm">
                  <span className="text-lg">{w.emoji}</span>
                  <span className="flex-1 font-medium">{w.title}</span>
                  <span className="text-xs text-muted-foreground">{w.duration} · {w.cal}cal</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">No workouts on this date</p>
          )}
          <button onClick={() => setViewingDate(null)} className="mt-3 text-xs text-muted-foreground font-medium w-full text-center">Close</button>
        </div>
      )}

      {/* Today's Plan */}
      <h2 className="text-lg font-semibold tracking-display mb-3">Today's Plan</h2>
      <div className="space-y-3">
        {workouts.length > 0 ? (
          workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} onToggle={toggleWorkout} onRemove={removeWorkout} onExerciseTap={setSelectedExercise} />
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">No workouts planned</p>
            <p className="text-xs text-muted-foreground mt-1">Use the AI Planner above to generate a workout</p>
          </div>
        )}
      </div>

      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        open={!!selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />
    </div>
  );
};



const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
  onExerciseTap,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExerciseTap: (name: string) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-card rounded-xl border shadow-card transition-all ${workout.done ? "border-habit-green/50" : "border-border"}`}>
      <div className="p-4 flex items-center gap-4">
        <span className="text-3xl">{workout.emoji}</span>
        <div className="flex-1">
          <p className={`text-[15px] font-semibold ${workout.done ? "line-through opacity-50" : ""}`}>{workout.title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={12} /> {workout.duration}</span>
            <span className="flex items-center gap-1"><Flame size={12} /> {workout.cal} cal</span>
          </div>
          <span className="inline-block mt-1.5 text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">
            {workout.tag}
          </span>
        </div>

        <div className="flex items-center gap-2">
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

  const youtubeUrl = detail?.videoSearchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(detail.videoSearchQuery)}`
    : null;

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

                {/* Video Link */}
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/80 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Watch Demo on YouTube
                  </a>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutsPage;
