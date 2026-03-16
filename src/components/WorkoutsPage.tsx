import { Sparkles, Play, Clock, Flame } from "lucide-react";

const workouts = [
  { title: "Morning Run", duration: "30 min", cal: 250, tag: "Cardio", emoji: "🏃" },
  { title: "Strength Training", duration: "45 min", cal: 320, tag: "Strength", emoji: "💪" },
  { title: "Yoga Session", duration: "20 min", cal: 100, tag: "Flexibility", emoji: "🧘" },
  { title: "Evening Walk", duration: "25 min", cal: 80, tag: "Cardio", emoji: "🚶" },
];

const WorkoutsPage = () => {
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
          { label: "workouts", value: "3", sublabel: "Total", icon: "📈" },
          { label: "calories", value: "600", sublabel: "All Time", icon: "🔥" },
          { label: "calories", value: "0", sublabel: "Today", icon: "✅" },
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
        {workouts.map((w) => (
          <div key={w.title} className="bg-card rounded-xl p-4 border border-border shadow-card flex items-center gap-4">
            <span className="text-3xl">{w.emoji}</span>
            <div className="flex-1">
              <p className="text-[15px] font-semibold">{w.title}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock size={12} /> {w.duration}</span>
                <span className="flex items-center gap-1"><Flame size={12} /> {w.cal} cal</span>
              </div>
              <span className="inline-block mt-1.5 text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">
                {w.tag}
              </span>
            </div>
            <button className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <Play size={18} fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkoutsPage;
