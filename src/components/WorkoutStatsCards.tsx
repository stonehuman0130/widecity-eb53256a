import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Workout } from "@/context/AppContext";

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

const GOAL_OPTIONS = [2, 3, 4, 5, 6, 7];

/* ── Flower petal widget ── */
const FlowerGoalWidget = ({
  completed,
  goal,
  onTap,
}: {
  completed: number;
  goal: number;
  onTap: () => void;
}) => {
  const petals = Array.from({ length: goal }, (_, i) => i < completed);
  const allDone = completed >= goal;
  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const petalR = 11;
  const orbitR = 18;

  return (
    <button
      onClick={onTap}
      className="flex-shrink-0 relative group transition-transform active:scale-95"
      aria-label="Edit weekly workout goal"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* petals */}
        {petals.map((filled, i) => {
          const angle = (2 * Math.PI * i) / goal - Math.PI / 2;
          const px = cx + orbitR * Math.cos(angle);
          const py = cy + orbitR * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={px}
              cy={py}
              r={petalR}
              className={
                filled
                  ? "fill-primary opacity-90"
                  : "fill-muted stroke-border"
              }
              strokeWidth={filled ? 0 : 1.2}
              style={{
                transition: "fill 0.3s ease, opacity 0.3s ease",
              }}
            />
          );
        })}
        {/* center */}
        <circle
          cx={cx}
          cy={cy}
          r={8}
          className={allDone ? "fill-primary" : "fill-accent"}
          style={{ transition: "fill 0.3s ease" }}
        />
        {/* center text */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-primary-foreground font-bold"
          style={{ fontSize: "9px" }}
        >
          {allDone ? "✓" : `${completed}`}
        </text>
      </svg>
      {/* label */}
      <span className="block text-[9px] text-center text-muted-foreground font-medium -mt-0.5 leading-tight">
        {completed}/{goal} goal
      </span>
    </button>
  );
};

/* ── Main component ── */
interface Props {
  workouts: Workout[];
  isViewingPartner?: boolean;
  partnerName?: string;
  label?: string;
}

const STORAGE_KEY = "workout_weekly_goal";

const WorkoutStatsCards = ({ workouts, isViewingPartner, partnerName, label }: Props) => {
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickingCustom, setPickingCustom] = useState<"from" | "to" | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 4;
  });

  const today = fmtDate(new Date());

  // Workouts completed this week (Sun–Sat)
  const weeklyCompleted = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startStr = fmtDate(startOfWeek);
    return workouts.filter(
      (w) => w.done && (w.completedDate || "") >= startStr && (w.completedDate || "") <= today
    ).length;
  }, [workouts, today]);

  // Filtered done count for Done card
  const filteredDone = useMemo(() => {
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

  const completedCount = filteredDone.length;

  const selectRange = (r: TimeRange) => {
    if (r === "custom") {
      setPickingCustom("from");
    } else {
      setRange(r);
      setMenuOpen(false);
    }
  };

  const saveGoal = (g: number) => {
    setWeeklyGoal(g);
    localStorage.setItem(STORAGE_KEY, String(g));
    setGoalOpen(false);
  };

  const ownerLabel = label || (isViewingPartner ? partnerName || "Partner" : undefined);

  return (
    <div className="mb-5">
      {/* Row: flower widget + done card */}
      <div className="flex items-center gap-3">
        {/* Weekly goal flower */}
        <Popover open={goalOpen} onOpenChange={setGoalOpen}>
          <PopoverTrigger asChild>
            <div>
              <FlowerGoalWidget
                completed={Math.min(weeklyCompleted, weeklyGoal)}
                goal={weeklyGoal}
                onTap={() => setGoalOpen(true)}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-4 z-[60]" align="start">
            <p className="text-sm font-semibold text-foreground mb-3">Weekly workout goal</p>
            <div className="grid grid-cols-3 gap-2">
              {GOAL_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => saveGoal(g)}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    weeklyGoal === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {g}x
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">workouts per week</p>
          </PopoverContent>
        </Popover>

        {/* Done card */}
        <div className="bg-card rounded-xl p-3 border border-border shadow-card flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase leading-tight">
              {ownerLabel ? "Done" : `Done`}
            </span>
            {/* Time range filter */}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-0.5 text-[10px] text-primary font-semibold px-1.5 py-0.5 rounded hover:bg-primary/5 transition-colors">
                  {range === "custom" && customFrom && customTo
                    ? `${customFrom.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customTo.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : RANGE_LABELS[range]}
                  <ChevronDown size={10} />
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
          </div>
          <p className="text-2xl font-bold tracking-display mt-1">{completedCount}</p>
          <span className="text-[11px] text-muted-foreground">📈 workouts</span>
        </div>
      </div>
    </div>
  );
};

export default WorkoutStatsCards;
