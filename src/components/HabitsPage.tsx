import { useState, useEffect, useMemo } from "react";
import GroupBadge from "@/components/GroupBadge";
import { Plus, Flame, Check, Bell, Users, MoreVertical, Trash2, Settings } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WaterSlider from "@/components/WaterSlider";
import WaterGaugeCircle from "@/components/WaterGaugeCircle";
import HabitDateViewer from "@/components/HabitDateViewer";
import CongratsPopup from "@/components/CongratsPopup";
import GroupSelector from "@/components/GroupSelector";
import { useGroupContext } from "@/hooks/useGroupContext";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type ViewFilter = "mine" | "partner" | "together";

const HabitsPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
  const {
    habits, filteredHabits, filteredPartnerHabits,
    toggleHabit, addHabit, removeHabit, addSharedHabit,
    getHabitStreak, getPartnerHabitStreak,
    waterIntake, waterGoal, partnerWaterIntake, partnerWaterGoal,
  } = useAppContext();
  const { user, partner, profile } = useAuth();
  const [newHabitLabel, setNewHabitLabel] = useState("");
  const [addingTo, setAddingTo] = useState<"morning" | "other" | null>(null);
  const [assignTo, setAssignTo] = useState<"me" | "both">("me");
  const [showCongrats, setShowCongrats] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");

  const { hasOther, otherName } = useGroupContext();

  const isViewingPartner = viewFilter === "partner";
  const isViewingTogether = viewFilter === "together";

  // Choose which habits to show for individual views
  const displayHabits = isViewingPartner ? filteredPartnerHabits : filteredHabits;

  const morningHabits = displayHabits.filter((h) => h.category === "morning");
  const otherHabits = displayHabits.filter((h) => h.category === "other");
  const totalCompleted = displayHabits.filter((h) => h.done).length;
  const total = displayHabits.length;
  const morningCompleted = morningHabits.filter((h) => h.done).length;
  const streakFn = isViewingPartner ? getPartnerHabitStreak : getHabitStreak;

  // Together view data
  const myHabits = filteredHabits;
  const theirHabits = filteredPartnerHabits;
  const myMorning = myHabits.filter((h) => h.category === "morning");
  const myOther = myHabits.filter((h) => h.category === "other");
  const theirMorning = theirHabits.filter((h) => h.category === "morning");
  const theirOther = theirHabits.filter((h) => h.category === "other");

  const myName = profile?.display_name || "Me";
  const partnerName = otherName;

  // Build tab filters
  const tabFilters = useMemo(() => {
    const tabs: { id: ViewFilter; label: string }[] = [{ id: "mine", label: "Mine" }];
    if (hasOther) {
      tabs.push({ id: "partner", label: `${partnerName}'s` });
      tabs.push({ id: "together", label: "Together" });
    }
    return tabs;
  }, [hasOther, partnerName]);

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
        const ids = data.map((n) => n.id);
        await supabase.from("nudges").update({ seen: true }).in("id", ids);
      }
    };
    checkNudges();
  }, [user, partner]);

  const handleAdd = async () => {
    if (!newHabitLabel.trim() || !addingTo) return;
    if (assignTo === "both" && partner) {
      await addSharedHabit(newHabitLabel.trim(), addingTo);
      toast.success(`Shared habit "${newHabitLabel.trim()}" added for both!`);
    } else {
      addHabit(newHabitLabel.trim(), addingTo);
    }
    setNewHabitLabel("");
    setAddingTo(null);
    setAssignTo("me");
  };

  const handleToggle = (id: string) => {
    if (isViewingPartner) return;
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

  // ── TOGETHER VIEW ──
  if (isViewingTogether && hasOther) {
    const myTotal = myHabits.length;
    const myDone = myHabits.filter((h) => h.done).length;
    const theirTotal = theirHabits.length;
    const theirDone = theirHabits.filter((h) => h.done).length;

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
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-1" aria-label="Settings">
              <Settings size={18} />
            </button>
          )}
        </header>

        <GroupSelector />

        {/* View tabs */}
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
          {tabFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                viewFilter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Side-by-side progress */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-card rounded-xl p-4 border border-border shadow-card">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">{myName}</p>
            <p className="text-2xl font-bold tracking-display">{myDone}/{myTotal}</p>
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${myTotal > 0 ? (myDone / myTotal) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border shadow-card">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">{partnerName}</p>
            <p className="text-2xl font-bold tracking-display">{theirDone}/{theirTotal}</p>
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${theirTotal > 0 ? (theirDone / theirTotal) * 100 : 0}%` }} />
            </div>
          </div>
        </div>

        {/* Water gauges side by side */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">💧 Water Intake</h2>
          <div className="bg-card rounded-xl p-5 border border-border shadow-card flex justify-around">
            <WaterGaugeCircle intake={waterIntake} goal={waterGoal} label={myName} />
            <WaterGaugeCircle intake={partnerWaterIntake} goal={partnerWaterGoal} label={partnerName} />
          </div>
        </section>

        {/* Morning Habits side-by-side */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold tracking-display mb-3">☀️ Morning Habits</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{myName}</p>
              <div className="space-y-2">
                {myMorning.length === 0 && <p className="text-xs text-muted-foreground">No morning habits</p>}
                {myMorning.map((h) => (
                  <TogetherHabitCard key={h.id} habit={h} streak={getHabitStreak(h.id)} onToggle={handleToggle} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{partnerName}</p>
              <div className="space-y-2">
                {theirMorning.length === 0 && <p className="text-xs text-muted-foreground">No morning habits</p>}
                {theirMorning.map((h) => (
                  <TogetherHabitCard key={h.id} habit={h} streak={getPartnerHabitStreak(h.id)} readOnly />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Other Habits side-by-side */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold tracking-display mb-3">🌙 Other Habits</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{myName}</p>
              <div className="space-y-2">
                {myOther.length === 0 && <p className="text-xs text-muted-foreground">No other habits</p>}
                {myOther.map((h) => (
                  <TogetherHabitCard key={h.id} habit={h} streak={getHabitStreak(h.id)} onToggle={handleToggle} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{partnerName}</p>
              <div className="space-y-2">
                {theirOther.length === 0 && <p className="text-xs text-muted-foreground">No other habits</p>}
                {theirOther.map((h) => (
                  <TogetherHabitCard key={h.id} habit={h} streak={getPartnerHabitStreak(h.id)} readOnly />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── MINE / PARTNER INDIVIDUAL VIEW ──
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
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-1" aria-label="Settings">
            <Settings size={18} />
          </button>
        )}
      </header>

      <GroupSelector />

      {hasOther && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
          {tabFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                viewFilter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Progress Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {isViewingPartner ? `${partnerName}'s Progress` : "Today's Progress"}
            </p>
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
      {!isViewingPartner && <WaterSlider />}
      {isViewingPartner && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold tracking-display mb-3 flex items-center gap-2">💧 {partnerName}'s Water Intake</h2>
          <div className="bg-card rounded-xl p-5 border border-border shadow-card flex justify-center">
            <WaterGaugeCircle intake={partnerWaterIntake} goal={partnerWaterGoal} label={partnerName} />
          </div>
        </section>
      )}

      {/* Past Date Viewer - only for own view */}
      {!isViewingPartner && <HabitDateViewer />}

      {/* Morning Habits */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display">☀️ Morning Habits</h2>
          {!isViewingPartner && (
            <button
              onClick={() => setAddingTo(addingTo === "morning" ? null : "morning")}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {addingTo === "morning" && !isViewingPartner && (
          <AddHabitForm
            value={newHabitLabel}
            onChange={setNewHabitLabel}
            onSubmit={handleAdd}
            assignTo={assignTo}
            setAssignTo={setAssignTo}
            hasPartner={!!partner}
            placeholder="New morning habit..."
          />
        )}
        <div className="space-y-2">
          {morningHabits.map((habit) => (
            <MorningHabitRow
              key={habit.id}
              habit={habit}
              onToggle={handleToggle}
              onDelete={isViewingPartner ? undefined : (id) => { removeHabit(id); toast.success("Habit deleted"); }}
              streak={streakFn(habit.id)}
              partner={partner}
              isViewingPartner={isViewingPartner}
              onNudge={() => sendNudge(habit.label, habit.id)}
            />
          ))}
          {morningHabits.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              {isViewingPartner ? `${partnerName} has no morning habits` : "No morning habits yet"}
            </p>
          )}
        </div>
        {morningHabits.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {morningCompleted}/{morningHabits.length} completed
          </p>
        )}
      </section>

      {/* Other Habits */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-display">🌙 Other Habits</h2>
          {!isViewingPartner && (
            <button
              onClick={() => setAddingTo(addingTo === "other" ? null : "other")}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {addingTo === "other" && !isViewingPartner && (
          <AddHabitForm
            value={newHabitLabel}
            onChange={setNewHabitLabel}
            onSubmit={handleAdd}
            assignTo={assignTo}
            setAssignTo={setAssignTo}
            hasPartner={!!partner}
            placeholder="New habit..."
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          {otherHabits.map((habit) => (
            <OtherHabitCard
              key={habit.id}
              habit={habit}
              onToggle={handleToggle}
              onDelete={isViewingPartner ? undefined : (id) => { removeHabit(id); toast.success("Habit deleted"); }}
              streak={streakFn(habit.id)}
              isViewingPartner={isViewingPartner}
            />
          ))}
        </div>
        {otherHabits.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isViewingPartner ? `${partnerName} has no other habits` : "No other habits yet"}
          </p>
        )}
      </section>
    </div>
  );
};

// ── Shared Add Habit Form ──
const AddHabitForm = ({
  value, onChange, onSubmit, assignTo, setAssignTo, hasPartner, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  assignTo: "me" | "both";
  setAssignTo: (v: "me" | "both") => void;
  hasPartner: boolean;
  placeholder: string;
}) => (
  <div className="space-y-2 mb-3">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      placeholder={placeholder}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
      autoFocus
    />
    {hasPartner && (
      <div className="flex gap-2">
        <button
          onClick={() => setAssignTo("me")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
            assignTo === "me" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          Just Me
        </button>
        <button
          onClick={() => setAssignTo("both")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1 ${
            assignTo === "both" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <Users size={12} /> Both
        </button>
      </div>
    )}
    <button onClick={onSubmit} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
      {assignTo === "both" ? "Add for Both" : "Add"}
    </button>
  </div>
);

// ── Together View Compact Habit Card ──
const TogetherHabitCard = ({
  habit,
  streak,
  onToggle,
  readOnly,
}: {
  habit: { id: string; label: string; done: boolean; groupId?: string | null };
  streak: number;
  onToggle?: (id: string) => void;
  readOnly?: boolean;
}) => (
  <button
    onClick={() => !readOnly && onToggle?.(habit.id)}
    disabled={readOnly}
    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left ${
      habit.done
        ? "border-habit-green bg-habit-green/5"
        : "border-border bg-card"
    } ${readOnly ? "opacity-90" : "active:scale-[0.98]"}`}
  >
    {habit.done ? (
      <span className="w-5 h-5 rounded-full bg-habit-green flex items-center justify-center flex-shrink-0">
        <Check size={11} className="text-primary-foreground" />
      </span>
    ) : (
      <span className="w-5 h-5 rounded-full border-2 border-muted flex-shrink-0" />
    )}
    <span className={`flex-1 text-xs font-medium truncate ${habit.done ? "line-through opacity-50" : ""}`}>
      {habit.label}
    </span>
    <div className="flex items-center gap-0.5 text-accent flex-shrink-0">
      <Flame size={10} />
      <span className="text-[10px] font-bold">{streak}d</span>
    </div>
  </button>
);

// ── Morning Habit Row (individual view) ──
interface MorningHabitRowProps {
  habit: { id: string; label: string; done: boolean; groupId?: string | null };
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  streak: number;
  isViewingPartner: boolean;
  onNudge?: () => void;
  nudgeLabel?: string;
}

const MorningHabitRow = ({ habit, onToggle, onDelete, streak, isViewingPartner, onNudge, nudgeLabel }: MorningHabitRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(habit.id)}
          disabled={isViewingPartner}
          className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
            habit.done
              ? "border-habit-green bg-habit-green/5"
              : "border-border bg-card"
          } ${isViewingPartner ? "opacity-80" : ""}`}
        >
          {habit.done ? (
            <span className="w-6 h-6 rounded-full bg-habit-green flex items-center justify-center flex-shrink-0">
              <Check size={14} className="text-primary-foreground" />
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full border-2 border-muted flex-shrink-0" />
          )}
          <span className={`flex-1 text-left text-sm font-medium ${habit.done ? "line-through opacity-50" : ""}`}>{habit.label}</span>
          <GroupBadge groupId={habit.groupId} />
          <div className="flex items-center gap-1 text-accent">
            <Flame size={12} />
            <span className="text-xs font-bold">{streak}d</span>
          </div>
        </button>
        {onDelete && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                <div className="absolute right-0 top-8 z-50 min-w-[120px] overflow-hidden rounded-xl border border-border bg-card shadow-card">
                  <button
                    onClick={() => { onDelete(habit.id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {onNudge && !habit.done && (
        <div className="flex items-center justify-end ml-10 mt-1 mb-1">
          <button
            onClick={onNudge}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
          >
            <Bell size={10} />
            {nudgeLabel || "Nudge"}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Other Habit Card (individual view) ──
interface OtherHabitCardProps {
  habit: { id: string; label: string; done: boolean; groupId?: string | null };
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  streak: number;
  isViewingPartner: boolean;
}

const OtherHabitCard = ({ habit, onToggle, onDelete, streak, isViewingPartner }: OtherHabitCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => onToggle(habit.id)}
        disabled={isViewingPartner}
        className={`w-full bg-card rounded-xl p-5 border shadow-card flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${
          habit.done ? "border-habit-green" : "border-border"
        } ${isViewingPartner ? "opacity-80" : ""}`}
      >
        {habit.done ? (
          <span className="w-8 h-8 rounded-full bg-habit-green flex items-center justify-center">
            <Check size={16} className="text-primary-foreground" />
          </span>
        ) : (
          <span className="w-8 h-8 rounded-full border-2 border-muted" />
        )}
        <p className="text-sm font-semibold text-center">{habit.label}</p>
        <GroupBadge groupId={habit.groupId} />
        <div className="flex items-center gap-1 text-accent">
          <Flame size={14} />
          <span className="text-xs font-bold">{streak} days</span>
        </div>
      </button>
      {onDelete && (
        <div className="absolute top-2 right-2">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
              <div className="absolute right-0 top-6 z-50 min-w-[120px] overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(habit.id); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HabitsPage;
