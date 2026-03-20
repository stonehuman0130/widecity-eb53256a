import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext, Workout } from "@/context/AppContext";
import { Droplets, Dumbbell, Trophy, Check, ChevronRight } from "lucide-react";
import WaterGaugeCircle from "@/components/WaterGaugeCircle";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Compact water intake widget for Home page */
export const HomeWaterWidget = () => {
  const { waterIntake, waterGoal, setWaterIntake } = useAppContext();
  const { profile } = useAuth();
  const percent = waterGoal > 0 ? Math.min((waterIntake / waterGoal) * 100, 100) : 0;

  const quickAdd = (amount: number) => {
    setWaterIntake(Math.round((waterIntake + amount) * 10) / 10);
  };

  return (
    <div className="bg-card rounded-xl p-4 shadow-card border border-border">
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--secondary))" strokeWidth="5" />
            <circle
              cx="32" cy="32" r="28" fill="none"
              stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 28}
              strokeDashoffset={2 * Math.PI * 28 * (1 - percent / 100)}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Droplets size={12} className="text-primary" />
            <span className="text-xs font-bold">{waterIntake.toFixed(1)}L</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Water Intake</p>
          <p className="text-xs text-muted-foreground">{waterIntake.toFixed(1)}L / {waterGoal}L</p>
        </div>
        <div className="flex gap-1.5">
          {[0.25, 0.5].map((amt) => (
            <button
              key={amt}
              onClick={() => quickAdd(amt)}
              className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 active:scale-95 transition-all"
            >
              +{amt}L
            </button>
          ))}
        </div>
      </div>
      {percent >= 100 && (
        <p className="text-xs text-primary font-semibold mt-2 text-center">🎉 Goal reached!</p>
      )}
    </div>
  );
};

/** Compact today's workout widget for Home page */
export const HomeWorkoutWidget = () => {
  const { filteredWorkouts, toggleWorkout } = useAppContext();
  const today = todayStr();
  const todayWorkouts = filteredWorkouts.filter((w) => w.scheduledDate === today);

  if (todayWorkouts.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4 shadow-card border border-border">
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Today's Workout</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">No workouts scheduled for today</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {todayWorkouts.map((w) => (
        <div key={w.id} className={`bg-card rounded-xl p-4 shadow-card border transition-colors ${w.done ? "border-habit-green/50" : "border-border"}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleWorkout(w.id)}
              className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                w.done ? "bg-habit-green border-habit-green" : "border-muted"
              }`}
            >
              {w.done && <Check size={14} className="text-primary-foreground" />}
            </button>
            <span className="text-lg">{w.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${w.done ? "line-through opacity-40" : ""}`}>{w.title}</p>
              <p className="text-xs text-muted-foreground">{w.duration} · {w.cal} cal</p>
            </div>
          </div>
        </div>
      ))}
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

export const HomeSobrietyWidget = () => {
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

  if (categories.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4 shadow-card border border-border">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Sobriety Tracker</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">No trackers set up yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-4 shadow-card border border-border">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Sobriety Tracker</span>
      </div>
      <div className="space-y-2">
        {categories.slice(0, 3).map((cat) => {
          const days = Math.max(0, Math.floor((Date.now() - new Date(cat.start_date).getTime()) / 86400000));
          return (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="text-base">{cat.icon}</span>
              <span className="flex-1 text-sm font-medium">{cat.label}</span>
              <span className="text-sm font-bold text-primary">{days}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
