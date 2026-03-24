import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format, differenceInDays, subDays, parseISO, startOfDay } from "date-fns";
import { Plus, Trophy, Flame, Calendar, DollarSign, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SettingsButton from "@/components/SettingsButton";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface SobrietyCategory {
  id: string;
  label: string;
  icon: string;
  start_date: string;
  money_per_day: number;
  group_id: string | null;
}

interface SobrietyCheckin {
  id: string;
  category_id: string;
  check_date: string;
  stayed_on_track: boolean;
  note: string | null;
}

const PRESET_CATEGORIES = [
  { label: "Alcohol", icon: "🍺" },
  { label: "Smoking", icon: "🚬" },
  { label: "Weed", icon: "🌿" },
  { label: "Social Media", icon: "📱" },
];

const MOTIVATIONAL_QUOTES = [
  "Every day is a new beginning. Take a deep breath and start again.",
  "You are stronger than you think. Keep going.",
  "Progress, not perfection, is what matters.",
  "One day at a time. You've got this.",
  "The secret of getting ahead is getting started.",
  "Believe you can and you're halfway there.",
  "Your future self will thank you for today.",
  "Small steps every day lead to big changes.",
  "You don't have to be perfect to be amazing.",
  "Courage doesn't always roar. Sometimes it's the quiet voice saying 'I'll try again tomorrow.'",
  "You are not your past. You are your potential.",
  "Tough times never last, but tough people do.",
  "Every moment is a fresh start.",
  "Be proud of how far you've come.",
  "Recovery is not a race. Take it one step at a time.",
];

const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 100, 180, 365, 500, 730, 1000];

function getDailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

function getNextMilestone(streak: number): number | null {
  return MILESTONES.find(m => m > streak) ?? null;
}

function getReachedMilestones(streak: number): number[] {
  return MILESTONES.filter(m => m <= streak);
}

interface SobrietyPageProps {
  onOpenSettings?: () => void;
}

const SobrietyPage = ({ onOpenSettings }: SobrietyPageProps = {}) => {
  const { user, activeGroup } = useAuth();
  const [categories, setCategories] = useState<SobrietyCategory[]>([]);
  const [checkins, setCheckins] = useState<SobrietyCheckin[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SobrietyCategory | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [checkinCategory, setCheckinCategory] = useState<SobrietyCategory | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [moneyPerDay, setMoneyPerDay] = useState("");
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const groupId = activeGroup?.id ?? null;
  const today = format(new Date(), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const catQuery = supabase
      .from("sobriety_categories")
      .select("*")
      .eq("user_id", user.id);
    if (groupId) catQuery.eq("group_id", groupId);
    else catQuery.is("group_id", null);

    const { data: cats } = await catQuery;
    const catList = (cats || []) as SobrietyCategory[];
    setCategories(catList);

    if (catList.length > 0) {
      const { data: checks } = await supabase
        .from("sobriety_checkins")
        .select("*")
        .eq("user_id", user.id)
        .in("category_id", catList.map(c => c.id));
      setCheckins((checks || []) as SobrietyCheckin[]);
    } else {
      setCheckins([]);
    }

    setLoading(false);
  }, [user, groupId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getStreakInfo = useCallback((cat: SobrietyCategory) => {
    const catCheckins = checkins
      .filter(c => c.category_id === cat.id)
      .sort((a, b) => b.check_date.localeCompare(a.check_date));

    const checkinMap = new Map(catCheckins.map(c => [c.check_date, c.stayed_on_track]));
    const startDate = parseISO(cat.start_date);

    // Current streak
    let currentStreak = 0;
    let d = startOfDay(new Date());
    while (true) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (d < startDate) break;
      const val = checkinMap.get(dateStr);
      if (val === false) break;
      // Count if checked in true OR if no data but date is on or after start
      if (val === true || (val === undefined && d >= startDate)) {
        currentStreak++;
      }
      d = subDays(d, 1);
    }

    // Longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const totalDays = differenceInDays(new Date(), startDate) + 1;
    for (let i = 0; i < totalDays; i++) {
      const dd = subDays(new Date(), totalDays - 1 - i);
      const dateStr = format(dd, "yyyy-MM-dd");
      const val = checkinMap.get(dateStr);
      if (val === false) {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      } else {
        tempStreak++;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Total sober days
    const totalSober = totalDays - catCheckins.filter(c => !c.stayed_on_track).length;

    // Money saved
    const moneySaved = totalSober * (cat.money_per_day || 0);

    return { currentStreak, longestStreak, totalSober, moneySaved, checkinMap, totalDays };
  }, [checkins]);

  const handleAddCategory = async (label: string, icon: string) => {
    if (!user) return;
    const { error } = await supabase.from("sobriety_categories").insert({
      user_id: user.id,
      label,
      icon,
      group_id: groupId,
      start_date: today,
      money_per_day: parseFloat(moneyPerDay) || 0,
    } as any);

    if (error) { toast.error("Failed to add category"); return; }
    toast.success(`Now tracking: ${label}`);
    setShowAddDrawer(false);
    setCustomLabel("");
    setMoneyPerDay("");
    fetchData();
  };

  const handleCheckin = async (onTrack: boolean) => {
    if (!user || !checkinCategory) return;

    const { error } = await supabase.from("sobriety_checkins").upsert({
      user_id: user.id,
      category_id: checkinCategory.id,
      check_date: today,
      stayed_on_track: onTrack,
    } as any, { onConflict: "category_id,check_date" });

    if (error) { toast.error("Failed to check in"); return; }

    if (onTrack) {
      const info = getStreakInfo(checkinCategory);
      const newStreak = info.currentStreak + 1;
      const milestone = MILESTONES.find(m => m === newStreak);
      if (milestone) {
        setCelebratingMilestone(milestone);
        setTimeout(() => setCelebratingMilestone(null), 3000);
      }
      toast.success("Great job! Keep it up! 💪");
    } else {
      toast("It's okay. Every day is a fresh start. 💙");
    }

    setShowCheckinDialog(false);
    setCheckinCategory(null);
    fetchData();
  };

  const handleDeleteCategory = async (catId: string) => {
    const { error } = await supabase.from("sobriety_categories").delete().eq("id", catId);
    if (error) { toast.error("Failed to remove"); return; }
    toast.success("Category removed");
    fetchData();
  };

  const handleResetStreak = async (cat: SobrietyCategory) => {
    await supabase.from("sobriety_categories").update({ start_date: today } as any).eq("id", cat.id);
    toast("Streak reset. Today is day one. You've got this! 🌱");
    fetchData();
  };

  const todayCheckedIn = useCallback((catId: string) => {
    return checkins.some(c => c.category_id === catId && c.check_date === today);
  }, [checkins, today]);

  // Heatmap data for last 91 days (13 weeks)
  const getHeatmapData = useCallback((cat: SobrietyCategory) => {
    const info = getStreakInfo(cat);
    const days: { date: string; status: "green" | "red" | "gray" }[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, "yyyy-MM-dd");
      const val = info.checkinMap.get(dateStr);
      if (val === true) days.push({ date: dateStr, status: "green" });
      else if (val === false) days.push({ date: dateStr, status: "red" });
      else days.push({ date: dateStr, status: "gray" });
    }
    return days;
  }, [getStreakInfo]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">Sobriety</h1>
          <SettingsButton onClick={onOpenSettings} />
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Sobriety</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddDrawer(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus size={18} />
          </button>
          <SettingsButton onClick={onOpenSettings} />
        </div>
      </div>

      {/* Motivational Quote */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-4 mb-4"
      >
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-accent mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground italic leading-relaxed">{getDailyQuote()}</p>
        </div>
      </motion.div>

      {/* Empty State */}
      {categories.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Start Your Journey</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-[260px] mx-auto">
            Track what you're abstaining from and celebrate every day of progress.
          </p>
          <Button onClick={() => setShowAddDrawer(true)} className="rounded-full px-6">
            <Plus size={16} className="mr-1" /> Add Category
          </Button>
        </motion.div>
      )}

      {/* Category Cards */}
      <div className="space-y-3">
        {categories.map((cat, idx) => {
          const info = getStreakInfo(cat);
          const isExpanded = expandedCard === cat.id;
          const checkedToday = todayCheckedIn(cat.id);
          const nextMilestone = getNextMilestone(info.currentStreak);
          const milestones = getReachedMilestones(info.currentStreak);
          const latestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              {/* Hero */}
              <button
                onClick={() => setExpandedCard(isExpanded ? null : cat.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <p className="text-xs text-muted-foreground">{cat.label}-free</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold text-foreground tabular-nums">{info.currentStreak}</span>
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {latestMilestone && (
                      <span className="bg-accent/15 text-accent text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        🏆 {latestMilestone}d
                      </span>
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </div>
                </div>

                {/* Progress to next milestone */}
                {nextMilestone && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Next: {nextMilestone} days</span>
                      <span>{nextMilestone - info.currentStreak} to go</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((info.currentStreak / nextMilestone) * 100, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                      />
                    </div>
                  </div>
                )}
              </button>

              {/* Check-in button */}
              {!checkedToday && (
                <div className="px-4 pb-3">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCheckinCategory(cat);
                      setShowCheckinDialog(true);
                    }}
                    variant="outline"
                    className="w-full rounded-xl text-sm h-9 border-primary/30 text-primary hover:bg-primary/5"
                  >
                    Check in today
                  </Button>
                </div>
              )}
              {checkedToday && (
                <div className="px-4 pb-3">
                  <div className="text-center text-xs text-muted-foreground py-1.5 bg-secondary/50 rounded-xl">
                    ✅ Checked in today
                  </div>
                </div>
              )}

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary/50 rounded-xl p-3 text-center">
                          <Flame size={16} className="mx-auto text-destructive mb-1" />
                          <p className="text-lg font-bold text-foreground tabular-nums">{info.longestStreak}</p>
                          <p className="text-[10px] text-muted-foreground">Longest Streak</p>
                        </div>
                        <div className="bg-secondary/50 rounded-xl p-3 text-center">
                          <Calendar size={16} className="mx-auto text-primary mb-1" />
                          <p className="text-lg font-bold text-foreground tabular-nums">{info.totalSober}</p>
                          <p className="text-[10px] text-muted-foreground">Total Sober Days</p>
                        </div>
                        {cat.money_per_day > 0 && (
                          <div className="bg-secondary/50 rounded-xl p-3 text-center col-span-2">
                            <DollarSign size={16} className="mx-auto text-accent mb-1" />
                            <p className="text-lg font-bold text-foreground tabular-nums">
                              ${info.moneySaved.toFixed(0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Money Saved</p>
                          </div>
                        )}
                      </div>

                      {/* Heatmap */}
                      <div>
                        <p className="text-xs font-medium text-foreground mb-2">Last 13 Weeks</p>
                        <HeatmapGrid data={getHeatmapData(cat)} />
                      </div>

                      {/* Milestones */}
                      {milestones.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-foreground mb-2">Milestones</p>
                          <div className="flex flex-wrap gap-1.5">
                            {milestones.map(m => (
                              <span key={m} className="bg-accent/15 text-accent text-[10px] font-semibold px-2 py-1 rounded-full">
                                🏆 {m} days
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Start date + actions */}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-[10px] text-muted-foreground">
                          Started {format(parseISO(cat.start_date), "MMM d, yyyy")}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResetStreak(cat)}
                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="text-[10px] text-destructive hover:text-destructive/80 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Add Category Drawer */}
      <Drawer open={showAddDrawer} onOpenChange={setShowAddDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>What are you abstaining from?</DrawerTitle>
            <DrawerDescription>Choose a category or create your own.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-3">
            {PRESET_CATEGORIES.map(preset => {
              const alreadyAdded = categories.some(c => c.label === preset.label);
              return (
                <button
                  key={preset.label}
                  disabled={alreadyAdded}
                  onClick={() => handleAddCategory(preset.label, preset.icon)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    alreadyAdded
                      ? "bg-secondary/50 border-border opacity-50 cursor-not-allowed"
                      : "bg-card border-border hover:border-primary/30 active:scale-[0.98]"
                  }`}
                >
                  <span className="text-2xl">{preset.icon}</span>
                  <span className="text-sm font-medium text-foreground">{preset.label}</span>
                  {alreadyAdded && <span className="text-[10px] text-muted-foreground ml-auto">Added</span>}
                </button>
              );
            })}

            {/* Custom */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">Custom</p>
              <Input
                placeholder="e.g., Sugar, Caffeine..."
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="Money saved per day (optional)"
                value={moneyPerDay}
                onChange={e => setMoneyPerDay(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className="text-sm"
              />
              <Button
                onClick={() => {
                  if (!customLabel.trim()) return;
                  handleAddCategory(customLabel.trim(), "🚫");
                }}
                disabled={!customLabel.trim()}
                size="sm"
                className="w-full rounded-xl"
              >
                Add
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Check-in Dialog */}
      <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              {checkinCategory?.icon} Daily Check-In
            </DialogTitle>
            <DialogDescription className="text-center">
              Did you stay on track with {checkinCategory?.label} today?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={() => handleCheckin(true)}
              className="rounded-xl h-14 text-base bg-[hsl(var(--habit-green))] hover:bg-[hsl(var(--habit-green))]/90 text-white"
            >
              ✅ Yes!
            </Button>
            <Button
              onClick={() => handleCheckin(false)}
              variant="outline"
              className="rounded-xl h-14 text-base border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              Not today
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-1">
            No judgment — honesty is strength.
          </p>
        </DialogContent>
      </Dialog>

      {/* Milestone Celebration */}
      <AnimatePresence>
        {celebratingMilestone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setCelebratingMilestone(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-card border border-border rounded-3xl p-8 text-center shadow-lg max-w-[280px]"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-6xl mb-4"
              >
                🏆
              </motion.div>
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {celebratingMilestone} Days!
              </h2>
              <p className="text-sm text-muted-foreground">
                Incredible milestone! You're doing amazing.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// GitHub-style heatmap grid component
function HeatmapGrid({ data }: { data: { date: string; status: "green" | "red" | "gray" }[] }) {
  // Organize into 7-row columns (weeks), Sun=0 at top
  const weeks: typeof data[] = [];
  let week: typeof data = [];
  
  // Pad start to align with day of week
  const firstDate = data[0]?.date ? parseISO(data[0].date) : new Date();
  const startDay = firstDate.getDay();
  for (let i = 0; i < startDay; i++) {
    week.push({ date: "", status: "gray" });
  }
  
  for (const d of data) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  const colorMap = {
    green: "bg-[hsl(var(--habit-green))]",
    red: "bg-destructive/60",
    gray: "bg-secondary",
  };

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {w.map((d, di) => (
            <div
              key={di}
              className={`w-3 h-3 rounded-[2px] ${d.date ? colorMap[d.status] : "bg-transparent"}`}
              title={d.date ? `${d.date}: ${d.status === "green" ? "✅" : d.status === "red" ? "❌" : "—"}` : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default SobrietyPage;
