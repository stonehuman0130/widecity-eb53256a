import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext, Workout } from "@/context/AppContext";
import { Droplets, Dumbbell, Trophy, Check, Flame } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Compact water intake widget for Home page — supports circle gauge or bar slider */
export const HomeWaterWidget = ({ selectedDate }: { selectedDate: Date }) => {
  const { waterIntake, waterGoal, setWaterIntake, setWaterGoal } = useAppContext();
  const { user } = useAuth();
  const [gaugeStyle, setGaugeStyle] = useState<"circle" | "bar">(() => {
    try { return (localStorage.getItem("homeWaterStyle") as "circle" | "bar") || "circle"; } catch { return "circle"; }
  });
  const [dateIntake, setDateIntake] = useState(0);
  const [dateGoal, setDateGoal] = useState(3);

  const isToday = fmtDate(selectedDate) === fmtDate(new Date());

  // Load water data for the selected date
  useEffect(() => {
    if (isToday) {
      setDateIntake(waterIntake);
      setDateGoal(waterGoal);
      return;
    }
    if (!user) return;
    const loadDateWater = async () => {
      const { data } = await supabase
        .from("water_tracking")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", fmtDate(selectedDate))
        .maybeSingle();
      if (data) {
        setDateIntake(Number(data.intake));
        setDateGoal(Number(data.goal));
      } else {
        setDateIntake(0);
        setDateGoal(waterGoal);
      }
    };
    loadDateWater();
  }, [selectedDate, user, isToday, waterIntake, waterGoal]);

  const intake = isToday ? waterIntake : dateIntake;
  const goal = isToday ? waterGoal : dateGoal;
  const percent = goal > 0 ? Math.min((intake / goal) * 100, 100) : 0;

  const handleSetIntake = (val: number) => {
    if (!isToday) return; // read-only for past dates
    setWaterIntake(val);
  };

  const toggleStyle = () => {
    const next = gaugeStyle === "circle" ? "bar" : "circle";
    setGaugeStyle(next);
    try { localStorage.setItem("homeWaterStyle", next); } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-display flex items-center gap-2">
          <Droplets size={18} className="text-primary" /> Water Intake
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStyle}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            {gaugeStyle === "circle" ? "Bar" : "Circle"}
          </button>
          {isToday && (
            <div className="flex gap-0.5">
              {[2, 2.5, 3, 3.5, 4].map((g) => (
                <button
                  key={g}
                  onClick={() => setWaterGoal(g)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all ${
                    goal === g ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {g}L
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 shadow-card border border-border">
        {gaugeStyle === "circle" ? (
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="24" fill="none"
                  stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - percent / 100)}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold">{intake.toFixed(1)}L</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{intake.toFixed(1)}L / {goal}L</p>
              <p className="text-xs text-muted-foreground">
                {percent >= 100 ? "🎉 Goal reached!" : `${Math.round(percent)}%`}
              </p>
            </div>
            {isToday && (
              <div className="flex gap-1">
                {[0.25, 0.5].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleSetIntake(Math.round((intake + amt) * 10) / 10)}
                    className="px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 active:scale-95 transition-all"
                  >
                    +{amt * 1000}ml
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg font-bold tracking-display">{intake.toFixed(1)}L</span>
              <span className="text-xs text-muted-foreground">/ {goal}L</span>
            </div>
            {isToday ? (
              <Slider
                value={[intake]}
                min={0}
                max={goal}
                step={0.1}
                onValueChange={([val]) => handleSetIntake(val)}
                className="my-3"
              />
            ) : (
              <div className="h-2 bg-secondary rounded-full overflow-hidden my-3">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>0L</span>
              <span className="font-semibold text-primary">
                {percent >= 100 ? "🎉 Goal reached!" : `${Math.round(percent)}%`}
              </span>
              <span>{goal}L</span>
            </div>
            {isToday && (
              <div className="flex gap-2 mt-2">
                {[0.25, 0.5].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleSetIntake(Math.min(intake + amt, goal))}
                    className="flex-1 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold active:scale-[0.97] transition-transform"
                  >
                    +{amt * 1000}ml
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/** Compact today's workout widget for Home page */
export const HomeWorkoutWidget = ({ selectedDate }: { selectedDate: Date }) => {
  const { filteredWorkouts, toggleWorkout } = useAppContext();
  const dateStr = fmtDate(selectedDate);
  const dateWorkouts = filteredWorkouts.filter((w) => w.scheduledDate === dateStr);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">
        <Dumbbell size={18} className="text-primary" /> Today's Workout
      </h2>
      {dateWorkouts.length === 0 ? (
        <div className="bg-card rounded-xl p-4 shadow-card border border-border">
          <p className="text-xs text-muted-foreground">No workouts scheduled for this day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dateWorkouts.map((w) => (
            <div key={w.id} className={`bg-card rounded-xl p-3 shadow-card border transition-colors ${w.done ? "border-habit-green/50" : "border-border"}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleWorkout(w.id)}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    w.done ? "bg-habit-green border-habit-green" : "border-muted"
                  }`}
                >
                  {w.done && <Check size={12} className="text-primary-foreground" />}
                </button>
                <span className="text-base">{w.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${w.done ? "line-through opacity-40" : ""}`}>{w.title}</p>
                  <p className="text-[10px] text-muted-foreground">{w.duration} · {w.cal} cal</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Compact sobriety tracker widget for Home page */
interface SobrietyCategory {
  id: string;
  label: string;
  icon: string;
  start_date: string;
  money_per_day: number;
  group_id: string | null;
}

export const HomeSobrietyWidget = ({ selectedDate, selectedTrackerIds }: { selectedDate: Date; selectedTrackerIds: string[] }) => {
  const { user, activeGroup } = useAuth();
  const [categories, setCategories] = useState<SobrietyCategory[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let q = supabase.from("sobriety_categories").select("*").eq("user_id", user.id);
      if (activeGroup) q = q.eq("group_id", activeGroup.id);
      else q = q.is("group_id", null);
      const { data } = await q;
      if (data) setCategories(data as SobrietyCategory[]);
    };
    load();
  }, [user, activeGroup?.id]);

  // Filter to only selected trackers (if any selected; if none selected, show nothing)
  const visibleCategories = selectedTrackerIds.length > 0
    ? categories.filter((c) => selectedTrackerIds.includes(c.id))
    : [];

  if (visibleCategories.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-primary" /> Sobriety Tracker
        </h2>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border">
          <p className="text-xs text-muted-foreground">No trackers selected — use the customize button to choose which trackers to show</p>
        </div>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);
  const isFutureOrToday = sel >= today;

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">
        <Trophy size={18} className="text-primary" /> Sobriety Tracker
      </h2>
      <div className="bg-card rounded-xl p-4 shadow-card border border-border space-y-2">
        {visibleCategories.map((cat) => {
          const startDate = new Date(cat.start_date);
          startDate.setHours(0, 0, 0, 0);

          // For future dates, cap at today's streak
          const refDate = isFutureOrToday ? today : sel;
          const days = Math.max(0, Math.floor((refDate.getTime() - startDate.getTime()) / 86400000));

          return (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="text-base">{cat.icon}</span>
              <span className="flex-1 text-sm font-medium">{cat.label}</span>
              <span className="text-sm font-bold text-primary">{days}d</span>
              {cat.money_per_day > 0 && (
                <span className="text-[10px] text-muted-foreground">${(days * cat.money_per_day).toFixed(0)} saved</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Other Habits widget for Home page — date-aware */
export const HomeOtherHabitsWidget = ({ selectedDate }: { selectedDate: Date }) => {
  const { filteredHabits, toggleHabit, getHabitStreak } = useAppContext();
  const dateStr = fmtDate(selectedDate);
  const isToday = dateStr === fmtDate(new Date());

  const otherHabits = filteredHabits.filter((h) => h.category === "other");

  if (otherHabits.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">
          🌙 Other Habits
        </h2>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border">
          <p className="text-xs text-muted-foreground">No other habits yet</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">
        🌙 Other Habits
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {otherHabits.map((habit) => {
          const doneForDate = habit.completionDates.includes(dateStr);
          const streak = getHabitStreak(habit.id);
          return (
            <button
              key={habit.id}
              onClick={() => isToday && toggleHabit(habit.id)}
              disabled={!isToday}
              className={`bg-card rounded-xl p-3 border text-left transition-all active:scale-[0.98] ${
                doneForDate ? "border-habit-green/50 bg-habit-green/5" : "border-border"
              } ${!isToday ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  doneForDate ? "bg-habit-green border-habit-green" : "border-muted"
                }`}>
                  {doneForDate && <Check size={10} className="text-primary-foreground" />}
                </div>
                <span className={`text-xs font-semibold truncate ${doneForDate ? "line-through opacity-50" : ""}`}>
                  {habit.label}
                </span>
              </div>
              {streak > 0 && (
                <div className="flex items-center gap-1 ml-6">
                  <Flame size={10} className="text-destructive" />
                  <span className="text-[9px] text-muted-foreground">{streak}d streak</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
