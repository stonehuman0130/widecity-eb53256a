import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Workout } from "@/context/AppContext";

type TimeRange = "all" | "today" | "week" | "month" | "30days" | "custom";
type DistanceUnit = "km" | "mi";

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
  isViewingPartner?: boolean;
  partnerName?: string;
  label?: string; // e.g. "Harrison" for Together view
}

const WorkoutStatsCards = ({ workouts, isViewingPartner, partnerName, label }: Props) => {
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickingCustom, setPickingCustom] = useState<"from" | "to" | null>(null);
  const [distUnit, setDistUnit] = useState<DistanceUnit>("km");

  const today = fmtDate(new Date());

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
  const totalCal = filteredDone.reduce((sum, w) => sum + w.cal, 0);
  const todayCal = workouts.filter((w) => w.done && w.completedDate === today).reduce((sum, w) => sum + w.cal, 0);

  // Distance calculations
  const totalDistKm = filteredDone.reduce((sum, w) => {
    if (!w.distance) return sum;
    const d = w.distanceUnit === "mi" ? w.distance / KM_TO_MI : w.distance;
    return sum + d;
  }, 0);
  const todayDistKm = workouts
    .filter((w) => w.done && w.completedDate === today)
    .reduce((sum, w) => {
      if (!w.distance) return sum;
      const d = w.distanceUnit === "mi" ? w.distance / KM_TO_MI : w.distance;
      return sum + d;
    }, 0);

  const fmtDist = (km: number) => {
    const val = distUnit === "mi" ? km * KM_TO_MI : km;
    return val < 10 ? val.toFixed(1) : Math.round(val).toString();
  };

  const selectRange = (r: TimeRange) => {
    if (r === "custom") {
      setPickingCustom("from");
    } else {
      setRange(r);
      setMenuOpen(false);
    }
  };

  const ownerLabel = label || (isViewingPartner ? partnerName || "Partner" : undefined);

  const stats = [
    { label: "workouts", value: String(completedCount), sublabel: ownerLabel ? `Done` : `Done (${RANGE_LABELS[range]})`, icon: "📈", isDist: false },
    { label: "calories", value: String(totalCal), sublabel: RANGE_LABELS[range], icon: "🔥", isDist: false },
    { label: "calories", value: String(todayCal), sublabel: "Today", icon: "✅", isDist: false },
    { label: distUnit, value: fmtDist(totalDistKm), sublabel: RANGE_LABELS[range], icon: "📏", isDist: true },
    { label: distUnit, value: fmtDist(todayDistKm), sublabel: "Today", icon: "🏃", isDist: true },
  ];

  return (
    <div className="mb-5">
      {/* Time range selector + data icon */}
      <div className="flex items-center justify-end gap-1 mb-2">
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
      </div>

      {/* Horizontally scrollable stat cards */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {stats.map((stat, i) => (
          <div key={i} className="bg-card rounded-xl p-3 border border-border shadow-card min-w-[105px] flex-shrink-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase leading-tight block">{stat.sublabel}</span>
            <p className="text-lg font-bold tracking-display mt-0.5">{stat.value}</p>
            {stat.isDist ? (
              <button
                onClick={() => setDistUnit((u) => (u === "km" ? "mi" : "km"))}
                className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {stat.icon} {distUnit} ↔
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">{stat.icon} {stat.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkoutStatsCards;
