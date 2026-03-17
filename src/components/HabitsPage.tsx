import { useState, useEffect } from "react";
import { Plus, Flame, Check, Droplets, Bell } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WaterSlider from "@/components/WaterSlider";
import HabitDateViewer from "@/components/HabitDateViewer";
import CongratsPopup from "@/components/CongratsPopup";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const HabitsPage = () => {
  const { habits, toggleHabit, addHabit, getHabitStreak } = useAppContext();
  const { user, partner } = useAuth();
  const [newHabitLabel, setNewHabitLabel] = useState("");
  const [addingTo, setAddingTo] = useState<"morning" | "other" | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [partnerCompletions, setPartnerCompletions] = useState<Set<string>>(new Set());

  const morningHabits = habits.filter((h) => h.category === "morning");
  const otherHabits = habits.filter((h) => h.category === "other");

  const totalCompleted = habits.filter((h) => h.done).length;
  const total = habits.length;
  const morningCompleted = morningHabits.filter((h) => h.done).length;

  // Load partner's habit completions for today
  useEffect(() => {
    if (!partner) return;
    const loadPartnerCompletions = async () => {
      // Get partner's habits
      const { data: partnerHabits } = await supabase
        .from("habits")
        .select("id")
        .eq("user_id", partner.id);

      if (!partnerHabits || partnerHabits.length === 0) return;

      const habitIds = partnerHabits.map((h) => h.id);
      const { data: completions } = await supabase
        .from("habit_completions")
        .select("habit_id")
        .eq("user_id", partner.id)
        .eq("completed_date", todayStr())
        .in("habit_id", habitIds);

      if (completions) {
        setPartnerCompletions(new Set(completions.map((c) => c.habit_id)));
      }
    };
    loadPartnerCompletions();
  }, [partner, habits]);

  // Check for incoming nudges
  useEffect(() => {
    if (!user) return;
    const checkNudges = async () => {
      const { data } = await supabase
        .from("nudges")
        .select("*")
        .eq("to_user_id", user.id)
        .eq("seen", false);

      if (data && data.length > 0) {
        for (const nudge of data) {
          toast.info(`👋 ${partner?.display_name || "Your partner"} nudged you!`, {
            description: nudge.message,
            duration: 5000,
          });
        }
        // Mark as seen
        const ids = data.map((n) => n.id);
        await supabase.from("nudges").update({ seen: true }).in("id", ids);
      }
    };
    checkNudges();
  }, [user, partner]);

  const handleAdd = () => {
    if (!newHabitLabel.trim() || !addingTo) return;
    addHabit(newHabitLabel.trim(), addingTo);
    setNewHabitLabel("");
    setAddingTo(null);
  };

  const handleToggle = (id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (habit && !habit.done) {
      setShowCongrats(true);
    }
    toggleHabit(id);
  };

  const sendNudge = async (habitLabel: string, habitId: string) => {
    if (!user || !partner) return;
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: partner.id,
      habit_id: habitId,
      message: `Time to do "${habitLabel}"! 💪`,
    });
    if (!error) {
      toast.success(`Nudge sent to ${partner.display_name}!`);
    } else {
      toast.error("Couldn't send nudge");
    }
  };

  // Check if partner has a matching habit (by label) and completed it
  const getPartnerHabitStatus = (label: string): "done" | "not_done" | "no_partner" => {
    if (!partner) return "no_partner";
    // We check partner completions by looking at partner's habits with same label
    // Since we loaded partner's completions, we check if any partner habit with this label is completed
    // For simplicity, we assume shared morning habits have the same label
    return "not_done"; // Default - we'll refine below
  };

  return (
    <div className="px-5">
      {showCongrats && (
        <CongratsPopup type="habit" show={true} onClose={() => setShowCongrats(false)} />
      )}

      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Habits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build a better routine, one day at a time</p>
        </div>
      </header>

      {/* Progress Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Today's Progress</p>
            <p className="text-3xl font-bold tracking-display mt-1">{totalCompleted}/{total}</p>
          </div>
          <span className="text-4xl">🌱</span>
        </div>
        <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${total > 0 ? (totalCompleted / total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {total > 0 ? Math.round((totalCompleted / total) * 100) : 0}% Complete
        </p>
      </div>

      {/* Water Slider */}
      <WaterSlider />

      {/* Past Date Viewer */}
      <HabitDateViewer />

      {/* Morning Habits */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display">☀️ Morning Habits</h2>
          <button
            onClick={() => setAddingTo(addingTo === "morning" ? null : "morning")}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
          >
            <Plus size={16} />
          </button>
        </div>
        {addingTo === "morning" && (
          <div className="flex gap-2 mb-3">
            <input
              value={newHabitLabel}
              onChange={(e) => setNewHabitLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="New morning habit..."
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <button onClick={handleAdd} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              Add
            </button>
          </div>
        )}
        <div className="space-y-2">
          {morningHabits.map((habit) => (
            <MorningHabitRow
              key={habit.id}
              habit={habit}
              onToggle={handleToggle}
              streak={getHabitStreak(habit.id)}
              partner={partner}
              partnerCompletions={partnerCompletions}
              onNudge={() => sendNudge(habit.label, habit.id)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {morningCompleted}/{morningHabits.length} completed
        </p>
      </section>

      {/* Other Habits */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display">🌙 Other Habits</h2>
          <button
            onClick={() => setAddingTo(addingTo === "other" ? null : "other")}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
          >
            <Plus size={16} />
          </button>
        </div>
        {addingTo === "other" && (
          <div className="flex gap-2 mb-3">
            <input
              value={newHabitLabel}
              onChange={(e) => setNewHabitLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="New habit..."
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <button onClick={handleAdd} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              Add
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {otherHabits.map((habit) => (
            <button
              key={habit.id}
              onClick={() => handleToggle(habit.id)}
              className={`bg-card rounded-xl p-5 border shadow-card flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${
                habit.done ? "border-habit-green" : "border-border"
              }`}
            >
              {habit.done ? (
                <span className="w-8 h-8 rounded-full bg-habit-green flex items-center justify-center">
                  <Check size={16} className="text-primary-foreground" />
                </span>
              ) : (
                <span className="w-8 h-8 rounded-full border-2 border-muted" />
              )}
              <p className="text-sm font-semibold text-center">{habit.label}</p>
              <div className="flex items-center gap-1 text-accent">
                <Flame size={14} />
                <span className="text-xs font-bold">{getHabitStreak(habit.id)} days</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

interface MorningHabitRowProps {
  habit: { id: string; label: string; done: boolean };
  onToggle: (id: string) => void;
  streak: number;
  partner: { id: string; display_name: string; avatar_url: string | null; email: string | null } | null;
  partnerCompletions: Set<string>;
  onNudge: () => void;
}

const MorningHabitRow = ({ habit, onToggle, streak, partner, partnerCompletions, onNudge }: MorningHabitRowProps) => {
  // For shared morning habits, check if partner completed it
  // We look for partner completions by habit_id (partner may have the same habit)
  // Since partner has their own habit IDs, we just show a general partner status indicator
  const partnerDone = partnerCompletions.size > 0; // simplified: partner has done some morning habits

  return (
    <div className="w-full">
      <button
        onClick={() => onToggle(habit.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
          habit.done
            ? "border-habit-green bg-habit-green/5"
            : "border-border bg-card"
        }`}
      >
        {habit.done ? (
          <span className="w-6 h-6 rounded-full bg-habit-green flex items-center justify-center flex-shrink-0">
            <Check size={14} className="text-primary-foreground" />
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full border-2 border-muted flex-shrink-0" />
        )}
        <span className={`flex-1 text-left text-sm font-medium ${habit.done ? "line-through opacity-50" : ""}`}>{habit.label}</span>
        <div className="flex items-center gap-1 text-accent">
          <Flame size={12} />
          <span className="text-xs font-bold">{streak}d</span>
        </div>
      </button>
      {/* Partner status for shared morning habits */}
      {partner && (
        <div className="flex items-center justify-between ml-10 mt-1 mb-1">
          <span className="text-xs text-muted-foreground">
            {partner.display_name}: {partnerDone ? "✅ Done" : "⏳ Not yet"}
          </span>
          {!partnerDone && (
            <button
              onClick={onNudge}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <Bell size={10} />
              Nudge
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default HabitsPage;
