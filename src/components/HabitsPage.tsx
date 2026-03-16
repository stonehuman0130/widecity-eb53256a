import { useState } from "react";
import { Plus, Flame, Check, Droplets, Minus } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

const HabitsPage = () => {
  const { habits, toggleHabit, addHabit, waterIntake, waterGoal, addWater, setWaterGoal, resetWater } = useAppContext();
  const [newHabitLabel, setNewHabitLabel] = useState("");
  const [addingTo, setAddingTo] = useState<"morning" | "other" | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);

  const morningHabits = habits.filter((h) => h.category === "morning");
  const otherHabits = habits.filter((h) => h.category === "other");

  const totalCompleted = habits.filter((h) => h.done).length;
  const total = habits.length;
  const morningCompleted = morningHabits.filter((h) => h.done).length;

  const waterPercent = waterGoal > 0 ? Math.min((waterIntake / waterGoal) * 100, 100) : 0;

  const handleAdd = () => {
    if (!newHabitLabel.trim() || !addingTo) return;
    addHabit(newHabitLabel.trim(), addingTo);
    setNewHabitLabel("");
    setAddingTo(null);
  };

  return (
    <div className="px-5">
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

      {/* Water Consumption */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display flex items-center gap-2">
            <Droplets size={20} className="text-primary" /> Water Intake
          </h2>
          <button
            onClick={() => setEditingGoal(!editingGoal)}
            className="text-xs text-muted-foreground font-medium px-2 py-1 rounded-lg bg-secondary"
          >
            Goal: {waterGoal}L
          </button>
        </div>

        {editingGoal && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-muted-foreground">Set goal (L):</span>
            {[1.5, 2, 2.5, 3, 3.5, 4].map((g) => (
              <button
                key={g}
                onClick={() => { setWaterGoal(g); setEditingGoal(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  waterGoal === g ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {g}L
              </button>
            ))}
          </div>
        )}

        <div className="bg-card rounded-xl p-5 border border-border shadow-card">
          {/* Gauge */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-secondary" />
                <circle
                  cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                  strokeLinecap="round"
                  className="stroke-primary transition-all duration-500"
                  strokeDasharray={`${waterPercent * 2.64} ${264 - waterPercent * 2.64}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold">{waterIntake.toFixed(1)}L</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{waterIntake.toFixed(1)} / {waterGoal}L</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {waterPercent >= 100 ? "🎉 Goal reached!" : `${(waterGoal - waterIntake).toFixed(1)}L remaining`}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => addWater(0.25)}
                  className="flex-1 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold active:scale-[0.97] transition-transform"
                >
                  +250ml
                </button>
                <button
                  onClick={() => addWater(0.5)}
                  className="flex-1 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold active:scale-[0.97] transition-transform"
                >
                  +500ml
                </button>
                <button
                  onClick={resetWater}
                  className="py-2 px-3 bg-secondary text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97] transition-transform"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            <HabitRow key={habit.id} habit={habit} onToggle={toggleHabit} />
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
              onClick={() => toggleHabit(habit.id)}
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
                <span className="text-xs font-bold">0 days</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

const HabitRow = ({ habit, onToggle }: { habit: { id: string; label: string; done: boolean }; onToggle: (id: string) => void }) => (
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
    <span className={`text-sm font-medium ${habit.done ? "line-through opacity-50" : ""}`}>{habit.label}</span>
  </button>
);

export default HabitsPage;
