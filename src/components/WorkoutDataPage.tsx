import { useState, useMemo } from "react";
import { ArrowLeft, ChevronDown, Footprints, Timer, Flame, Heart, Mountain, Gauge, Dumbbell, TrendingUp, Trophy, Target } from "lucide-react";
import { Workout, isCardioWorkout } from "@/context/AppContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type TimeRange = "all" | "today" | "week" | "month" | "30days" | "custom";

const RANGE_LABELS: Record<TimeRange, string> = {
  all: "All Time",
  today: "Today",
  week: "This Week",
  month: "This Month",
  "30days": "Last 30 Days",
  custom: "Custom",
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const KM_TO_MI = 0.621371;

interface Props {
  workouts: Workout[];
  isViewingPartner: boolean;
  partnerName?: string;
  onBack: () => void;
}

const WorkoutDataPage = ({ workouts, isViewingPartner, partnerName, onBack }: Props) => {
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickingCustom, setPickingCustom] = useState<"from" | "to" | null>(null);

  const today = fmtDate(new Date());

  const filtered = useMemo(() => {
    const done = workouts.filter((w) => w.done);
    if (range === "all") return done;

    const now = new Date();
    let startDate: string;
    let endDate: string = today;

    if (range === "today") {
      startDate = today;
    } else if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      startDate = fmtDate(d);
    } else if (range === "month") {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (range === "30days") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = fmtDate(d);
    } else if (range === "custom" && customFrom && customTo) {
      startDate = fmtDate(customFrom);
      endDate = fmtDate(customTo);
    } else {
      return done;
    }

    return done.filter((w) => {
      const d = w.completedDate || w.scheduledDate || "";
      return d >= startDate && d <= endDate;
    });
  }, [workouts, range, today, customFrom, customTo]);

  // Categorize
  const runningWorkouts = filtered.filter((w) => w.title.toLowerCase().includes("running") || w.title.toLowerCase().includes("run"));
  const walkingWorkouts = filtered.filter((w) => w.title.toLowerCase().includes("walking") || w.title.toLowerCase().includes("walk"));
  const strengthWorkouts = filtered.filter((w) => {
    const t = w.title.toLowerCase();
    return !isCardioWorkout(w.title) && (
      w.tag?.toLowerCase() === "strength" ||
      (w.exercises && w.exercises.length > 0) ||
      t.includes("strength") || t.includes("weight") || t.includes("lifting") ||
      t.includes("chest") || t.includes("back") || t.includes("leg") || t.includes("arm") ||
      t.includes("shoulder") || t.includes("push") || t.includes("pull") ||
      (!isCardioWorkout(w.title) && !t.includes("yoga") && !t.includes("stretch") && !t.includes("sports") && !t.includes("boxing"))
    );
  });

  // Steps: walking workouts as proxy for steps
  const stepsWorkouts = walkingWorkouts;

  // Days in range for averages
  const daysInRange = useMemo(() => {
    if (range === "today") return 1;
    if (range === "week") return 7;
    if (range === "month") {
      const now = new Date();
      return now.getDate();
    }
    if (range === "30days") return 30;
    if (range === "custom" && customFrom && customTo) {
      return Math.max(1, Math.round((customTo.getTime() - customFrom.getTime()) / 86400000) + 1);
    }
    // all time - count unique days
    const dates = new Set(filtered.map((w) => w.completedDate || w.scheduledDate).filter(Boolean));
    return Math.max(1, dates.size);
  }, [range, filtered, customFrom, customTo]);

  const selectRange = (r: TimeRange) => {
    if (r === "custom") {
      setPickingCustom("from");
    } else {
      setRange(r);
      setMenuOpen(false);
    }
  };

  return (
    <div className="px-5 pb-24">
      {/* Header */}
      <header className="pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Back to Workouts"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-[1.75rem] font-bold tracking-display">Workout Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isViewingPartner ? `${partnerName || "Partner"}'s insights` : "Your activity insights"}
          </p>
        </div>
        {/* Time range filter */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-primary font-semibold px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors">
              {range === "custom" && customFrom && customTo
                ? `${customFrom.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customTo.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : RANGE_LABELS[range]}
              <ChevronDown size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[60]" align="end">
            {pickingCustom ? (
              <div className="p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {pickingCustom === "from" ? "Start date" : "End date"}
                </p>
                <Calendar
                  mode="single"
                  selected={pickingCustom === "from" ? customFrom : customTo}
                  onSelect={(date) => {
                    if (!date) return;
                    if (pickingCustom === "from") {
                      setCustomFrom(date);
                      setPickingCustom("to");
                    } else {
                      setCustomTo(date);
                      setRange("custom");
                      setPickingCustom(null);
                      setMenuOpen(false);
                    }
                  }}
                  className="pointer-events-auto"
                />
              </div>
            ) : (
              <div className="py-1">
                {(["all", "today", "week", "month", "30days", "custom"] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => selectRange(r)}
                    className={`flex w-full items-center px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${
                      range === r ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </header>

      <div className="space-y-4">
        {/* STEPS CARD */}
        <StepsCard workouts={stepsWorkouts} daysInRange={daysInRange} rangeLabel={RANGE_LABELS[range]} />

        {/* RUNNING CARD */}
        <RunningCard workouts={runningWorkouts} rangeLabel={RANGE_LABELS[range]} />

        {/* STRENGTH CARD */}
        <StrengthCard workouts={strengthWorkouts} rangeLabel={RANGE_LABELS[range]} />
      </div>
    </div>
  );
};

// ─── STEPS CARD ──────────────────────────────────────────────
const StepsCard = ({ workouts, daysInRange, rangeLabel }: { workouts: Workout[]; daysInRange: number; rangeLabel: string }) => {
  const totalSessions = workouts.length;
  const totalDistKm = workouts.reduce((s, w) => {
    if (!w.distance) return s;
    return s + (w.distanceUnit === "mi" ? w.distance / KM_TO_MI : w.distance);
  }, 0);
  const totalCal = workouts.reduce((s, w) => s + w.cal, 0);
  const activeDays = new Set(workouts.map((w) => w.completedDate || w.scheduledDate).filter(Boolean)).size;
  const avgPerDay = daysInRange > 0 ? (totalSessions / daysInRange) : 0;

  // Estimate steps from walking distance (approx 1312 steps per km)
  const estimatedSteps = Math.round(totalDistKm * 1312);
  const avgDailySteps = daysInRange > 0 ? Math.round(estimatedSteps / daysInRange) : 0;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
          <Footprints size={18} className="text-green-600" />
        </div>
        <div>
          <h2 className="text-base font-bold">Steps & Walking</h2>
          <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50">
        <MetricCell icon={<Footprints size={13} />} value={estimatedSteps.toLocaleString()} label="Est. Steps" />
        <MetricCell icon={<Target size={13} />} value={avgDailySteps.toLocaleString()} label="Avg / Day" />
        <MetricCell icon={<TrendingUp size={13} />} value={String(activeDays)} label="Active Days" />
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border/50">
        <MetricCell icon={<Timer size={13} />} value={String(totalSessions)} label="Sessions" />
        <MetricCell icon={<Flame size={13} />} value={totalCal.toLocaleString()} label="Calories" />
        <MetricCell icon={<Gauge size={13} />} value={totalDistKm < 10 ? totalDistKm.toFixed(1) : String(Math.round(totalDistKm))} label="km Total" />
      </div>
    </div>
  );
};

// ─── RUNNING CARD ────────────────────────────────────────────
const RunningCard = ({ workouts, rangeLabel }: { workouts: Workout[]; rangeLabel: string }) => {
  const totalRuns = workouts.length;
  const totalDistKm = workouts.reduce((s, w) => {
    if (!w.distance) return s;
    return s + (w.distanceUnit === "mi" ? w.distance / KM_TO_MI : w.distance);
  }, 0);
  const totalCal = workouts.reduce((s, w) => s + w.cal, 0);

  // Duration parsing (formats: "30 min", "1h 30m", "45")
  const parseDuration = (d: string): number => {
    if (!d) return 0;
    const hMatch = d.match(/(\d+)\s*h/i);
    const mMatch = d.match(/(\d+)\s*m/i);
    if (hMatch || mMatch) {
      return (parseInt(hMatch?.[1] || "0") * 60) + parseInt(mMatch?.[1] || "0");
    }
    const num = parseInt(d);
    return isNaN(num) ? 0 : num;
  };

  const totalMinutes = workouts.reduce((s, w) => s + parseDuration(w.duration), 0);
  const totalHours = totalMinutes / 60;

  // Pace: collect valid paces
  const paces = workouts.map((w) => w.paceAvg).filter(Boolean) as string[];
  const parsePaceToSec = (p: string): number => {
    const parts = p.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };
  const avgPaceSec = paces.length > 0 ? paces.reduce((s, p) => s + parsePaceToSec(p), 0) / paces.length : 0;
  const bestPaceSec = paces.length > 0 ? Math.min(...paces.map(parsePaceToSec).filter(s => s > 0)) : 0;
  const formatPace = (sec: number) => sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "—";

  // Heart rate
  const hrs = workouts.map((w) => w.heartRateAvg).filter((h): h is number => h != null && h > 0);
  const avgHR = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;

  // Longest run
  const longestKm = workouts.reduce((max, w) => {
    if (!w.distance) return max;
    const km = w.distanceUnit === "mi" ? w.distance / KM_TO_MI : w.distance;
    return km > max ? km : max;
  }, 0);

  // Elevation
  const totalElevation = workouts.reduce((s, w) => s + (w.elevationGain || 0), 0);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <span className="text-lg">🏃</span>
        </div>
        <div>
          <h2 className="text-base font-bold">Running</h2>
          <p className="text-[11px] text-muted-foreground">{rangeLabel} · {totalRuns} run{totalRuns !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50">
        <MetricCell icon={<Gauge size={13} />} value={totalDistKm < 10 ? totalDistKm.toFixed(1) : String(Math.round(totalDistKm))} label="km Total" />
        <MetricCell icon={<Timer size={13} />} value={totalHours < 1 ? `${Math.round(totalMinutes)}m` : `${totalHours.toFixed(1)}h`} label="Duration" />
        <MetricCell icon={<Flame size={13} />} value={totalCal.toLocaleString()} label="Calories" />
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border/50">
        <MetricCell icon={<TrendingUp size={13} />} value={formatPace(avgPaceSec)} label="Avg Pace /km" />
        <MetricCell icon={<Trophy size={13} />} value={formatPace(bestPaceSec)} label="Best Pace" />
        <MetricCell icon={<Heart size={13} />} value={avgHR != null ? String(avgHR) : "—"} label="Avg HR" />
      </div>
      {(longestKm > 0 || totalElevation > 0) && (
        <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border/50">
          <MetricCell icon={<Target size={13} />} value={longestKm < 10 ? longestKm.toFixed(1) : String(Math.round(longestKm))} label="Longest (km)" />
          <MetricCell icon={<Mountain size={13} />} value={totalElevation > 0 ? `${Math.round(totalElevation)}m` : "—"} label="Elevation" />
          <MetricCell icon={<Footprints size={13} />} value="" label="" empty />
        </div>
      )}
    </div>
  );
};

// ─── STRENGTH CARD ───────────────────────────────────────────
const StrengthCard = ({ workouts, rangeLabel }: { workouts: Workout[]; rangeLabel: string }) => {
  const totalWorkouts = workouts.length;
  const totalCal = workouts.reduce((s, w) => s + w.cal, 0);

  // Parse exercises
  const allExercises = workouts.flatMap((w) => w.exercises || []);
  const totalSets = allExercises.reduce((s, e) => s + (e.sets || 0), 0);
  const totalReps = allExercises.reduce((s, e) => {
    const reps = parseInt(String(e.reps)) || 0;
    return s + (reps * (e.sets || 1));
  }, 0);

  // Duration
  const parseDuration = (d: string): number => {
    if (!d) return 0;
    const hMatch = d.match(/(\d+)\s*h/i);
    const mMatch = d.match(/(\d+)\s*m/i);
    if (hMatch || mMatch) {
      return (parseInt(hMatch?.[1] || "0") * 60) + parseInt(mMatch?.[1] || "0");
    }
    const num = parseInt(d);
    return isNaN(num) ? 0 : num;
  };
  const totalMinutes = workouts.reduce((s, w) => s + parseDuration(w.duration), 0);
  const totalHours = totalMinutes / 60;

  // Unique exercise names
  const exerciseNames = [...new Set(allExercises.map((e) => e.name))];
  const topExercises = exerciseNames.slice(0, 3);

  // Active days
  const activeDays = new Set(workouts.map((w) => w.completedDate || w.scheduledDate).filter(Boolean)).size;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Dumbbell size={18} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-base font-bold">Strength Training</h2>
          <p className="text-[11px] text-muted-foreground">{rangeLabel} · {totalWorkouts} session{totalWorkouts !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50">
        <MetricCell icon={<Dumbbell size={13} />} value={String(totalWorkouts)} label="Workouts" />
        <MetricCell icon={<TrendingUp size={13} />} value={String(totalSets)} label="Total Sets" />
        <MetricCell icon={<Target size={13} />} value={totalReps.toLocaleString()} label="Total Reps" />
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border/50">
        <MetricCell icon={<Timer size={13} />} value={totalHours < 1 ? `${Math.round(totalMinutes)}m` : `${totalHours.toFixed(1)}h`} label="Duration" />
        <MetricCell icon={<Flame size={13} />} value={totalCal.toLocaleString()} label="Calories" />
        <MetricCell icon={<Trophy size={13} />} value={String(activeDays)} label="Active Days" />
      </div>
      {topExercises.length > 0 && (
        <div className="px-4 py-3 border-t border-border/50">
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">Top Exercises</p>
          <div className="flex flex-wrap gap-1.5">
            {topExercises.map((name) => (
              <span key={name} className="text-[11px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                {name}
              </span>
            ))}
            {exerciseNames.length > 3 && (
              <span className="text-[11px] text-muted-foreground px-1">+{exerciseNames.length - 3} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SHARED METRIC CELL ─────────────────────────────────────
const MetricCell = ({ icon, value, label, empty }: { icon: React.ReactNode; value: string; label: string; empty?: boolean }) => {
  if (empty) return <div className="bg-card p-3" />;
  return (
    <div className="bg-card p-3 flex flex-col items-center text-center">
      <div className="text-muted-foreground mb-0.5">{icon}</div>
      <p className="text-base font-bold tracking-display">{value}</p>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
};

export default WorkoutDataPage;
