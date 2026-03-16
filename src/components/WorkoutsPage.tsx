import { useState } from "react";
import { Sparkles, Clock, Flame, Check, MoreVertical, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAppContext, Workout } from "@/context/AppContext";

const WorkoutsPage = () => {
  const { workouts, toggleWorkout, removeWorkout } = useAppContext();

  const completedCount = workouts.filter((w) => w.done).length;
  const totalCal = workouts.reduce((sum, w) => sum + w.cal, 0);
  const todayCal = workouts.filter((w) => w.done).reduce((sum, w) => sum + w.cal, 0);

  return (
    <div className="px-5">
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay active and healthy together</p>
        </div>
        <button className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-semibold text-primary-foreground flex items-center gap-1.5">
          <Sparkles size={14} /> AI Plan
        </button>
      </header>

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

      {/* Today's Plan */}
      <h2 className="text-lg font-semibold tracking-display mb-3">Today's Plan</h2>
      <div className="space-y-3">
        {workouts.length > 0 ? (
          workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} onToggle={toggleWorkout} onRemove={removeWorkout} />
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">No workouts planned</p>
            <p className="text-xs text-muted-foreground mt-1">Tap "AI Plan" to generate a workout</p>
          </div>
        )}
      </div>
    </div>
  );
};

const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-card rounded-xl border shadow-card transition-all ${workout.done ? "border-habit-green/50 opacity-75" : "border-border"}`}>
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
          {/* Check button */}
          <button
            onClick={() => onToggle(workout.id)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              workout.done
                ? "bg-habit-green text-primary-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <Check size={18} />
          </button>

          {/* Three dots menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-muted-foreground p-1"
            >
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

      {/* Expandable exercises */}
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
            <div className="px-4 pb-4 space-y-2">
              {workout.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm font-medium">{ex.name}</span>
                  <span className="text-xs text-muted-foreground">{ex.sets} × {ex.reps}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkoutsPage;
