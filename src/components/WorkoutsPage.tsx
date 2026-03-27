import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clock, Flame, Check, Trash2, ChevronDown, ChevronUp, Loader2, X, Dumbbell, AlertTriangle, Target, ArrowRight, RotateCcw, Calendar as CalIcon, Plus, Copy, Pencil, Settings } from "lucide-react";
import WorkoutStatsCards from "@/components/WorkoutStatsCards";
import WorkoutAiSuggest from "@/components/WorkoutAiSuggest";
import GroupBadge from "@/components/GroupBadge";
import { useAppContext, Workout } from "@/context/AppContext";
import ItemActionMenu from "@/components/ItemActionMenu";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import CongratsPopup from "@/components/CongratsPopup";
import GroupSelector from "@/components/GroupSelector";
import { useGroupContext } from "@/hooks/useGroupContext";
import ExerciseLogModal from "@/components/ExerciseLogModal";

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

// Detect delete/management intent from natural language
function detectManagementIntent(prompt: string): { type: "delete"; filter: "all" | "week" | "month" | "date" | "tomorrow"; } | null {
  const lower = prompt.toLowerCase().trim();
  const deletePatterns = /\b(delete|remove|clear|wipe|erase|get rid of|cancel)\b/;
  if (!deletePatterns.test(lower)) return null;

  if (/\b(all|every|everything)\b/.test(lower)) return { type: "delete", filter: "all" };
  if (/\b(month|monthly|30.day|4.week)\b/.test(lower)) return { type: "delete", filter: "month" };
  if (/\b(week|weekly|7.day|this week|next week)\b/.test(lower)) return { type: "delete", filter: "week" };
  if (/\btomorrow\b/.test(lower)) return { type: "delete", filter: "tomorrow" };
  // Default broad delete = all
  return { type: "delete", filter: "all" };
}

type ViewFilter = string; // "mine" | "partner" | "member:{userId}" | "together"

const WorkoutsPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
  const { workouts, filteredWorkouts, filteredPartnerWorkouts, toggleWorkout, removeWorkout, removeWorkoutsByFilter, updateWorkout, setWorkouts, addWorkouts, rescheduleWorkout, rescheduleWorkoutCascade, getPartnerWorkoutsForDate } = useAppContext();
  const { partner, profile } = useAuth();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");
  const [showCongrats, setShowCongrats] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDuration, setCustomDuration] = useState("30");
  const [customCal, setCustomCal] = useState("200");
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ filter: "all" | "week" | "month" | "date" | "tomorrow"; message: string } | null>(null);
  // Exercise editing
  const [editingWorkout, setEditingWorkout] = useState<{ workoutId: string; exerciseIndex: number } | null>(null);
  const [editExName, setEditExName] = useState("");
  const [editExSets, setEditExSets] = useState("");
  const [editExReps, setEditExReps] = useState("");
  // Exercise logging
  const [loggingWorkout, setLoggingWorkout] = useState<Workout | null>(null);

  const isViewingPartner = viewFilter !== "mine" && viewFilter !== "together";
  const isTogetherView = viewFilter === "together";
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

  const activeWorkouts = isViewingPartner ? filteredPartnerWorkouts : filteredWorkouts;

  const missedWorkouts = useMemo(() => {
    if (isViewingPartner) return [];
    return filteredWorkouts.filter((w) => w.scheduledDate && w.scheduledDate < today && !w.done);
  }, [filteredWorkouts, today, isViewingPartner]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    let filter = deleteConfirm.filter;
    let date: string | undefined;
    if (filter === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      date = fmtDate(d);
      filter = "date";
    }
    const count = await removeWorkoutsByFilter(filter as any, date);
    toast.success(`Deleted ${count} workout${count !== 1 ? "s" : ""}`);
    setDeleteConfirm(null);
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

  // Copy partner workouts for the selected date to own schedule
  const copyPartnerWorkouts = () => {
    const partnerDateWorkouts = getPartnerWorkoutsForDate(selectedDate);
    if (partnerDateWorkouts.length === 0) {
      toast.error("No workouts to copy for this date");
      return;
    }
    const newWorkouts: Workout[] = partnerDateWorkouts.map((w) => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: w.title,
      duration: w.duration,
      cal: w.cal,
      tag: w.tag,
      emoji: w.emoji,
      done: false,
      scheduledDate: w.scheduledDate || selectedDate,
      exercises: w.exercises ? [...w.exercises] : undefined,
    }));
    addWorkouts(newWorkouts);
    toast.success(`Copied ${newWorkouts.length} workout${newWorkouts.length > 1 ? "s" : ""} to your schedule`);
    setViewFilter("mine");
  };

  // Exercise editing handlers
  const startEditExercise = (workoutId: string, index: number, ex: { name: string; sets: number; reps: string }) => {
    setEditingWorkout({ workoutId, exerciseIndex: index });
    setEditExName(ex.name);
    setEditExSets(String(ex.sets));
    setEditExReps(ex.reps);
  };

  const saveExerciseEdit = () => {
    if (!editingWorkout) return;
    const workout = workouts.find((w) => w.id === editingWorkout.workoutId);
    if (!workout?.exercises) return;
    const updated = [...workout.exercises];
    updated[editingWorkout.exerciseIndex] = { name: editExName, sets: parseInt(editExSets) || 1, reps: editExReps };
    updateWorkout(editingWorkout.workoutId, { exercises: updated });
    setEditingWorkout(null);
    toast.success("Exercise updated");
  };

  const deleteExercise = (workoutId: string, index: number) => {
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout?.exercises) return;
    const updated = workout.exercises.filter((_, i) => i !== index);
    updateWorkout(workoutId, { exercises: updated });
    toast.success("Exercise removed");
  };

  const { twoTabFilters, workoutFilters, hasOther, otherName, otherMembers } = useGroupContext();
  const partnerName = otherName;

  // Track workout progress from exercise logs
  const [workoutProgress, setWorkoutProgress] = useState<Record<string, { progress: number; cal: number }>>({});

  const handleProgressUpdate = useCallback((workoutId: string, progress: number, cal: number) => {
    setWorkoutProgress(prev => ({
      ...prev,
      [workoutId]: { progress, cal },
    }));

    // Single source of truth: always write recalculated calories to workout
    updateWorkout(workoutId, { cal });

    // Auto-complete if 100% and not already done
    if (progress >= 100) {
      const w = workouts.find(w => w.id === workoutId);
      if (w && !w.done) {
        handleToggleWorkout(workoutId);
      }
    }
  }, [workouts, updateWorkout]);

  const handleCaloriesSaved = useCallback((workoutId: string, cal: number) => {
    updateWorkout(workoutId, { cal });
    setWorkoutProgress(prev => ({
      ...prev,
      [workoutId]: { ...prev[workoutId], cal },
    }));
  }, [updateWorkout]);

  return (
    <div className="px-5 pb-24">
      {showCongrats && (
        <CongratsPopup type="workout" show={true} onClose={() => setShowCongrats(false)} />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workouts</AlertDialogTitle>
            <AlertDialogDescription>{deleteConfirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exercise Edit Dialog */}
      <Dialog open={!!editingWorkout} onOpenChange={(open) => { if (!open) setEditingWorkout(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil size={16} /> Edit Exercise</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Exercise Name</label>
              <input value={editExName} onChange={(e) => setEditExName(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Sets</label>
                <input type="number" value={editExSets} onChange={(e) => setEditExSets(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Reps</label>
                <input value={editExReps} onChange={(e) => setEditExReps(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
              </div>
            </div>
            <button onClick={saveExerciseEdit} disabled={!editExName.trim()} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              Save Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay active and healthy together</p>
        </div>
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-1" aria-label="Settings">
            <Settings size={18} />
          </button>
        )}
      </header>

      <GroupSelector />

      {/* Mine / Member Toggle */}
      {hasOther && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5 overflow-x-auto scrollbar-hide">
          {workoutFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id)}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                viewFilter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}


      {/* Together View */}
      {isTogetherView ? (
        <TogetherView
          myWorkouts={filteredWorkouts}
          partnerWorkouts={filteredPartnerWorkouts}
          myName={profile?.display_name || "Me"}
          partnerName={partnerName || "Partner"}
          selectedDate={selectedDate}
          today={today}
          dateRange={dateRange}
          onSelectDate={setSelectedDate}
          getPartnerWorkoutsForDate={getPartnerWorkoutsForDate}
          onSelectExercise={setSelectedExercise}
          workoutProgress={workoutProgress}
        />
      ) : (
        <>
          {/* Stats */}
          <WorkoutStatsCards workouts={activeWorkouts} isViewingPartner={isViewingPartner} partnerName={partnerName} />

          {/* Missed Workouts Banner */}
          {missedWorkouts.length > 0 && selectedDate === today && !isViewingPartner && (
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
                      <button onClick={() => handleReschedule(w.id, today)} className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                        <RotateCcw size={10} /> Today
                      </button>
                      <button onClick={() => handleReschedule(w.id, getNextDay(today))} className="px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium flex items-center gap-1">
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
                  : filteredWorkouts.some((w) => w.scheduledDate === date || w.completedDate === date);

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

          {/* Quick Add Activities */}
          {!isViewingPartner && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Quick Add</h3>
                <button onClick={() => setShowManualAdd(!showManualAdd)} className="text-xs text-primary font-semibold flex items-center gap-1">
                  <Plus size={12} /> Custom
                </button>
              </div>

              {showManualAdd && (
                <div className="bg-card rounded-xl border border-border p-3 mb-3 space-y-2">
                  <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Activity name..." className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Duration (min)</label>
                      <input type="number" value={customDuration} onChange={(e) => setCustomDuration(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none mt-0.5" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Calories</label>
                      <input type="number" value={customCal} onChange={(e) => setCustomCal(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-1.5 text-sm outline-none mt-0.5" />
                    </div>
                  </div>
                  <button onClick={addCustomActivity} disabled={!customTitle.trim()} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
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

          {/* Workout Section */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalIcon size={14} className="text-muted-foreground" />
                {isViewingPartner
                  ? `${partnerName}'s Workouts`
                  : selectedDate === today
                    ? "Today's Workouts"
                    : selectedDate > today
                      ? "Upcoming Workout"
                      : `Workout for ${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                <span className="text-muted-foreground text-xs">({dateWorkouts.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                {!isViewingPartner && (
                  <WorkoutAiSuggest
                    selectedDate={selectedDate}
                    recentWorkouts={filteredWorkouts}
                    onAddWorkout={addWorkouts}
                  />
                )}
                {/* Copy partner's plan button */}
                {isViewingPartner && dateWorkouts.length > 0 && (
                  <button
                    onClick={copyPartnerWorkouts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    <Copy size={12} /> Copy to Mine
                  </button>
                )}
              </div>
            </div>

            {dateWorkouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {isViewingPartner
                  ? `${partnerName} has no workouts on this day`
                  : selectedDate === today
                    ? "No workouts today. Generate a plan or add one above."
                    : "No workouts scheduled for this day."}
              </p>
            ) : (
              <div className="space-y-3">
                {dateWorkouts.map((w) => (
                  <WorkoutCard
                    key={w.id}
                    workout={w}
                    onToggle={handleToggleWorkout}
                    onRemove={removeWorkout}
                    onReschedule={handleReschedule}
                    onRescheduleCascade={rescheduleWorkoutCascade}
                    allWorkouts={filteredWorkouts}
                    onSelectExercise={setSelectedExercise}
                    onEditExercise={startEditExercise}
                    onDeleteExercise={deleteExercise}
                    onLogWorkout={setLoggingWorkout}
                    onUpdateCalories={(id, cal) => updateWorkout(id, { cal })}
                    readOnly={isViewingPartner}
                    progress={workoutProgress[w.id]?.progress}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Exercise Detail Dialog */}
      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />

      {/* Exercise Log Modal */}
      {loggingWorkout && (
        <ExerciseLogModal
          open={!!loggingWorkout}
          onClose={() => setLoggingWorkout(null)}
          workoutId={loggingWorkout.id}
          workoutTitle={loggingWorkout.title}
          workoutEmoji={loggingWorkout.emoji}
          workoutDuration={loggingWorkout.duration}
          workoutTag={loggingWorkout.tag}
          exercises={loggingWorkout.exercises || []}
          scheduledDate={loggingWorkout.scheduledDate}
          readOnly={isViewingPartner || isTogetherView}
          onProgressUpdate={(progress, cal) => handleProgressUpdate(loggingWorkout.id, progress, cal)}
          onCaloriesSaved={(cal) => handleCaloriesSaved(loggingWorkout.id, cal)}
        />
      )}
    </div>
  );
};

// Together View component
const TogetherView = ({
  myWorkouts,
  partnerWorkouts,
  myName,
  partnerName,
  selectedDate,
  today,
  dateRange,
  onSelectDate,
  getPartnerWorkoutsForDate,
  onSelectExercise,
  workoutProgress,
}: {
  myWorkouts: Workout[];
  partnerWorkouts: Workout[];
  myName: string;
  partnerName: string;
  selectedDate: string;
  today: string;
  dateRange: string[];
  onSelectDate: (date: string) => void;
  getPartnerWorkoutsForDate: (date: string) => Workout[];
  onSelectExercise: (name: string) => void;
  workoutProgress: Record<string, { progress: number; cal: number }>;
}) => {
  const allWorkouts = useMemo(() => [...myWorkouts, ...partnerWorkouts], [myWorkouts, partnerWorkouts]);

  const myDateWorkouts = useMemo(
    () => myWorkouts.filter((w) => w.scheduledDate === selectedDate || w.completedDate === selectedDate),
    [myWorkouts, selectedDate]
  );
  const partnerDateWorkouts = useMemo(
    () => getPartnerWorkoutsForDate(selectedDate),
    [getPartnerWorkoutsForDate, selectedDate]
  );

  const hasWorkoutsOnDate = (date: string) =>
    myWorkouts.some((w) => w.scheduledDate === date || w.completedDate === date) ||
    getPartnerWorkoutsForDate(date).length > 0;

  const MiniWorkoutCard = ({ workout }: { workout: Workout }) => {
    const progress = workoutProgress[workout.id]?.progress || 0;
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border bg-card ${workout.done ? "border-habit-green/50" : "border-border"}`}>
        <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
          <svg className="absolute inset-0 w-7 h-7 -rotate-90" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="2" />
            {progress > 0 && !workout.done && (
              <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" className="text-habit-green" strokeWidth="2"
                strokeDasharray={`${(progress / 100) * 69.12} 69.12`} strokeLinecap="round" />
            )}
          </svg>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 ${
            workout.done ? "bg-habit-green border-habit-green" : "border-transparent"
          }`}>
            {workout.done && <Check size={12} className="text-primary-foreground" />}
          </div>
        </div>
        <span className="text-lg">{workout.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${workout.done ? "line-through text-muted-foreground" : ""}`}>{workout.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={10} /> {workout.duration}
            </span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Flame size={10} /> {workout.cal} cal
            </span>
            {workout.tag && (
              <span className="text-[10px] font-semibold text-tag-work-text bg-tag-work px-1.5 py-0.5 rounded">{workout.tag}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Combined stats for both users */}
      <div className="space-y-4 mb-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--user-a))]" /> {myName}
          </p>
          <WorkoutStatsCards workouts={myWorkouts} label={myName} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--user-b))]" /> {partnerName}
          </p>
          <WorkoutStatsCards workouts={partnerWorkouts} label={partnerName} />
        </div>
      </div>

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
            const hasW = hasWorkoutsOnDate(date);

            return (
              <button
                key={date}
                data-selected={isSelected}
                onClick={() => onSelectDate(date)}
                className={`flex flex-col items-center min-w-[48px] flex-shrink-0 py-2 px-1 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="text-[10px] font-medium">{dayName}</span>
                <span className={`text-base font-bold ${isT && !isSelected ? "text-primary" : ""}`}>{dayNum}</span>
                {hasW && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side-by-side workout lists */}
      <div className="space-y-5">
        {/* My workouts */}
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--user-a))]" />
            {myName}'s Workouts
            <span className="text-muted-foreground text-xs">({myDateWorkouts.length})</span>
          </h3>
          {myDateWorkouts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No workouts on this day</p>
          ) : (
            <div className="space-y-2">
              {myDateWorkouts.map((w) => <MiniWorkoutCard key={w.id} workout={w} />)}
            </div>
          )}
        </section>

        {/* Partner workouts */}
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--user-b))]" />
            {partnerName}'s Workouts
            <span className="text-muted-foreground text-xs">({partnerDateWorkouts.length})</span>
          </h3>
          {partnerDateWorkouts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No workouts on this day</p>
          ) : (
            <div className="space-y-2">
              {partnerDateWorkouts.map((w) => <MiniWorkoutCard key={w.id} workout={w} />)}
            </div>
          )}
        </section>
      </div>
    </>
  );
};

const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
  onReschedule,
  onRescheduleCascade,
  allWorkouts,
  onSelectExercise,
  onEditExercise,
  onDeleteExercise,
  onLogWorkout,
  onUpdateCalories,
  readOnly,
  progress,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onReschedule: (id: string, toDate: string) => void;
  onRescheduleCascade: (id: string, newDate: string, shiftFollowing: boolean) => Promise<void>;
  allWorkouts: Workout[];
  onSelectExercise: (name: string) => void;
  onEditExercise: (workoutId: string, index: number, ex: { name: string; sets: number; reps: string }) => void;
  onDeleteExercise: (workoutId: string, index: number) => void;
  onLogWorkout: (workout: Workout) => void;
  onUpdateCalories?: (id: string, cal: number) => void;
  readOnly?: boolean;
  progress?: number;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [cascadeConfirm, setCascadeConfirm] = useState<{ newDate: string; diffDays: number; followingCount: number } | null>(null);
  const [editingCal, setEditingCal] = useState(false);
  const [calInput, setCalInput] = useState(String(workout.cal));

  const fmtD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleMoveToDate = (date: Date) => {
    const newDate = fmtD(date);
    if (!workout.scheduledDate) {
      onReschedule(workout.id, newDate);
      return;
    }
    const oldMs = new Date(workout.scheduledDate + "T00:00:00").getTime();
    const newMs = new Date(newDate + "T00:00:00").getTime();
    const diffDays = Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return;

    // Check if there are following workouts that could be shifted
    const following = allWorkouts.filter(
      (w) => w.scheduledDate && w.scheduledDate > workout.scheduledDate! && !w.done && w.id !== workout.id
    );

    if (following.length > 0) {
      setCascadeConfirm({ newDate, diffDays, followingCount: following.length });
    } else {
      onReschedule(workout.id, newDate);
    }
  };

  const handleMoveToTomorrow = () => {
    const base = workout.scheduledDate || fmtD(new Date());
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 1);
    handleMoveToDate(d);
  };

  return (
    <>
      {/* Cascade Confirmation Dialog */}
      <AlertDialog open={!!cascadeConfirm} onOpenChange={(open) => { if (!open) setCascadeConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shift following workouts?</AlertDialogTitle>
            <AlertDialogDescription>
              You're moving this workout by {cascadeConfirm ? Math.abs(cascadeConfirm.diffDays) : 0} day{cascadeConfirm && Math.abs(cascadeConfirm.diffDays) !== 1 ? "s" : ""} {cascadeConfirm && cascadeConfirm.diffDays > 0 ? "forward" : "back"}.
              There {cascadeConfirm?.followingCount === 1 ? "is" : "are"} {cascadeConfirm?.followingCount} upcoming workout{cascadeConfirm?.followingCount !== 1 ? "s" : ""} after this one. Would you like to shift them too?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cascadeConfirm) {
                  onReschedule(workout.id, cascadeConfirm.newDate);
                  setCascadeConfirm(null);
                }
              }}
              className="bg-secondary text-foreground hover:bg-secondary/80"
            >
              Move only this one
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (cascadeConfirm) {
                  onRescheduleCascade(workout.id, cascadeConfirm.newDate, true);
                  setCascadeConfirm(null);
                  toast.success(`Shifted ${cascadeConfirm.followingCount + 1} workouts`);
                }
              }}
            >
              Shift all following
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <motion.div layout className={`bg-card rounded-xl border shadow-card overflow-hidden ${workout.done ? "border-habit-green/50" : "border-border"}`}>
        <div className="p-4">
          <div className="flex items-center gap-3">
            {!readOnly && (
              <button
                onClick={() => onToggle(workout.id)}
                className="relative w-8 h-8 flex items-center justify-center flex-shrink-0"
              >
                {/* Progress ring */}
                <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="2.5" />
                  {(progress || 0) > 0 && !workout.done && (
                    <circle
                      cx="16" cy="16" r="13"
                      fill="none"
                      stroke="currentColor"
                      className="text-habit-green"
                      strokeWidth="2.5"
                      strokeDasharray={`${((progress || 0) / 100) * 81.68} 81.68`}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
                  workout.done ? "bg-habit-green border-habit-green" : "border-transparent"
                }`}>
                  {workout.done && <Check size={14} className="text-primary-foreground" />}
                </div>
              </button>
            )}
            <span className="text-2xl">{workout.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-semibold truncate ${workout.done ? "line-through text-muted-foreground" : ""}`}>{workout.title}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={11} /> {workout.duration}
                </span>
                {!readOnly && onUpdateCalories ? (
                  editingCal ? (
                    <span className="flex items-center gap-0.5">
                      <Flame size={11} className="text-muted-foreground" />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={calInput}
                        onChange={(e) => setCalInput(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(calInput) || 0;
                          onUpdateCalories(workout.id, val);
                          setEditingCal(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = parseInt(calInput) || 0;
                            onUpdateCalories(workout.id, val);
                            setEditingCal(false);
                          }
                        }}
                        autoFocus
                        className="w-12 text-xs text-center bg-secondary rounded px-1 py-0.5 outline-none border border-primary text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">cal</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setCalInput(String(workout.cal)); setEditingCal(true); }}
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                      title="Tap to edit calories"
                    >
                      <Flame size={11} /> {workout.cal} cal
                      <Pencil size={8} className="opacity-40" />
                    </button>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Flame size={11} /> {workout.cal} cal
                  </span>
                )}
                {workout.tag && (
                  <span className="text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">{workout.tag}</span>
                )}
                <GroupBadge groupId={workout.groupId} />
              </div>
            </div>
            {!readOnly && (
              <ItemActionMenu
                onMoveToTomorrow={handleMoveToTomorrow}
                onMoveToDate={handleMoveToDate}
                onRemove={() => onRemove(workout.id)}
              />
            )}
          </div>
        </div>

      {/* Exercises */}
      {workout.exercises && workout.exercises.length > 0 && (
        <>
          <div className="flex items-center border-t border-border">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? "Hide" : "Show"} {workout.exercises.length} exercises
            </button>
            <button
              onClick={() => onLogWorkout(workout)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors border-l border-border"
            >
              <Dumbbell size={13} />
              Log Weights
            </button>
          </div>
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
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary group">
                      <button
                        onClick={() => onSelectExercise(ex.name)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
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
                      {!readOnly && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditExercise(workout.id, i, ex)}
                            className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Edit exercise"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onDeleteExercise(workout.id, i)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove exercise"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
    </>
  );
};

const ExerciseDetailDialog = ({ exerciseName, onClose }: { exerciseName: string | null; onClose: () => void }) => {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseName) { setDetail(null); return; }
    setLoading(true);
    supabase.functions.invoke("exercise-detail", { body: { exerciseName } })
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
