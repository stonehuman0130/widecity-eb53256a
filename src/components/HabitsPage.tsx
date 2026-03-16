import { Plus, Flame } from "lucide-react";

const habits = [
  { name: "Meditation", streak: 3, emoji: "🧘" },
  { name: "Read 10 Pages", streak: 7, emoji: "📚" },
  { name: "Gratitude Journal", streak: 4, emoji: "🙏" },
  { name: "Stretch", streak: 6, emoji: "🤸" },
];

const HabitsPage = () => {
  const completed = 0;
  const total = 5;

  return (
    <div className="px-5">
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Morning Habits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build a better routine, one day at a time</p>
        </div>
        <button className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card">
          <Plus size={22} />
        </button>
      </header>

      {/* Progress Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Today's Progress</p>
            <p className="text-3xl font-bold tracking-display mt-1">{completed}/{total}</p>
          </div>
          <span className="text-4xl">🌱</span>
        </div>
        <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">{Math.round((completed / total) * 100)}% Complete</p>
      </div>

      {/* Daily Goal */}
      <div className="bg-primary/5 rounded-xl p-3 border border-primary/20 mb-6">
        <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-primary rounded-full w-1/2" />
        </div>
        <p className="text-sm font-medium text-center text-primary">50% of daily goal</p>
      </div>

      {/* Habits Grid */}
      <h2 className="text-lg font-semibold tracking-display mb-3">Your Habits</h2>
      <div className="grid grid-cols-2 gap-3">
        {habits.map((habit) => (
          <div key={habit.name} className="bg-card rounded-xl p-5 border border-border shadow-card flex flex-col items-center gap-2">
            <span className="text-3xl">{habit.emoji}</span>
            <p className="text-sm font-semibold text-center">{habit.name}</p>
            <div className="flex items-center gap-1 text-accent">
              <Flame size={14} />
              <span className="text-xs font-bold">{habit.streak} days</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HabitsPage;
