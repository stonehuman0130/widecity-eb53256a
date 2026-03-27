import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format, differenceInDays, subDays, parseISO, startOfDay, addDays } from "date-fns";
import { Plus, Trophy, Flame, Calendar, DollarSign, ChevronDown, ChevronUp, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGroupContext } from "@/hooks/useGroupContext";
import GroupSelector from "@/components/GroupSelector";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface SobrietyCategory {
  id: string;
  label: string;
  icon: string;
  start_date: string;
  money_per_day: number;
  group_id: string | null;
  user_id: string;
}

interface SobrietyCheckin {
  id: string;
  category_id: string;
  check_date: string;
  stayed_on_track: boolean;
  note: string | null;
  user_id: string;
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

type ViewFilter = string;

interface SobrietyPageProps {
  onOpenSettings?: () => void;
}

const SobrietyPage = ({ onOpenSettings }: SobrietyPageProps = {}) => {
  const { user, activeGroup, profile } = useAuth();
  const [categories, setCategories] = useState<SobrietyCategory[]>([]);
  const [checkins, setCheckins] = useState<SobrietyCheckin[]>([]);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [checkinCategory, setCheckinCategory] = useState<SobrietyCategory | null>(null);
  const [checkinDate, setCheckinDate] = useState<string>("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customIcon, setCustomIcon] = useState("🚫");
  const [moneyPerDay, setMoneyPerDay] = useState("");
  const [presetMoneyPerDay, setPresetMoneyPerDay] = useState<Record<string, string>>({});
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");

  const { hasOther, otherName, workoutFilters } = useGroupContext();
  const partnerName = otherName;

  const groupId = activeGroup?.id ?? null;
  const today = format(new Date(), "yyyy-MM-dd");

  const isViewingPartner = viewFilter !== "mine" && viewFilter !== "together";
  const isTogetherView = viewFilter === "together";

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch own categories
    const catQuery = supabase
      .from("sobriety_categories")
      .select("*")
      .eq("user_id", user.id);
    if (groupId) catQuery.eq("group_id", groupId);
    else catQuery.is("group_id", null);

    const { data: cats } = await catQuery;
    let allCats = (cats || []) as SobrietyCategory[];

    // Fetch partner/group member categories if in a group
    if (groupId && hasOther) {
      const { data: partnerCats } = await supabase
        .from("sobriety_categories")
        .select("*")
        .eq("group_id", groupId)
        .neq("user_id", user.id);
      if (partnerCats) {
        allCats = [...allCats, ...(partnerCats as SobrietyCategory[])];
      }
    }

    setCategories(allCats);

    if (allCats.length > 0) {
      const { data: checks } = await supabase
        .from("sobriety_checkins")
        .select("*")
        .in("category_id", allCats.map(c => c.id));
      setCheckins((checks || []) as SobrietyCheckin[]);
    } else {
      setCheckins([]);
    }

    setLoading(false);
  }, [user, groupId, hasOther]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter categories by view
  const filteredCategories = useMemo(() => {
    if (!user) return [];
    if (isTogetherView) return categories;
    if (isViewingPartner) return categories.filter(c => c.user_id !== user.id);
    return categories.filter(c => c.user_id === user.id);
  }, [categories, user, isViewingPartner, isTogetherView]);

  // CHECK-IN BASED streak logic
  const getStreakInfo = useCallback((cat: SobrietyCategory) => {
    const catCheckins = checkins
      .filter(c => c.category_id === cat.id && c.stayed_on_track)
      .map(c => c.check_date)
      .sort((a, b) => b.localeCompare(a));

    const checkinSet = new Set(catCheckins);
    const allCatCheckins = checkins.filter(c => c.category_id === cat.id);
    const failedSet = new Set(allCatCheckins.filter(c => !c.stayed_on_track).map(c => c.check_date));

    // Current streak: count consecutive checked-in days going backwards from today
    let currentStreak = 0;
    let d = startOfDay(new Date());
    while (true) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (failedSet.has(dateStr)) break;
      if (checkinSet.has(dateStr)) {
        currentStreak++;
      } else {
        // No check-in for this day = streak stops (check-in based)
        break;
      }
      d = subDays(d, 1);
    }

    // Longest streak: scan all dates from start to today
    const startDate = parseISO(cat.start_date);
    const totalDays = Math.max(differenceInDays(new Date(), startDate) + 1, 0);
    let longestStreak = 0;
    let tempStreak = 0;
    for (let i = 0; i < totalDays; i++) {
      const dd = addDays(startDate, i);
      const dateStr = format(dd, "yyyy-MM-dd");
      if (checkinSet.has(dateStr)) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Total checked-in sober days
    const totalSober = catCheckins.length;

    // Money saved based on checked-in days only
    const moneySaved = totalSober * (cat.money_per_day || 0);

    // Checkin map for heatmap
    const checkinMap = new Map<string, boolean>();
    allCatCheckins.forEach(c => checkinMap.set(c.check_date, c.stayed_on_track));

    return { currentStreak, longestStreak, totalSober, moneySaved, checkinMap, totalDays };
  }, [checkins]);

  // Missed days: days since start with no check-in, excluding today
  const getMissedDays = useCallback((cat: SobrietyCategory): string[] => {
    const startDate = parseISO(cat.start_date);
    const catCheckinDates = new Set(
      checkins.filter(c => c.category_id === cat.id).map(c => c.check_date)
    );
    const missed: string[] = [];
    let d = startOfDay(new Date());
    // Check last 30 days for missed
    for (let i = 0; i < 30; i++) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (d >= startDate && !catCheckinDates.has(dateStr) && dateStr !== today) {
        missed.push(dateStr);
      }
      d = subDays(d, 1);
    }
    return missed;
  }, [checkins, today]);

  const handleAddCategory = async (label: string, icon: string, money?: number) => {
    if (!user) return;
    const { error } = await supabase.from("sobriety_categories").insert({
      user_id: user.id,
      label,
      icon,
      group_id: groupId,
      start_date: today,
      money_per_day: money ?? (parseFloat(moneyPerDay) || 0),
    } as any);

    if (error) { toast.error("Failed to add category"); return; }
    toast.success(`Now tracking: ${label}`);
    setShowAddDrawer(false);
    setCustomLabel("");
    setCustomIcon("🚫");
    setMoneyPerDay("");
    setPresetMoneyPerDay({});
    fetchData();
  };

  const handleCheckin = async (onTrack: boolean) => {
    if (!user || !checkinCategory) return;
    const dateToUse = checkinDate || today;

    const { error } = await supabase.from("sobriety_checkins").upsert({
      user_id: user.id,
      category_id: checkinCategory.id,
      check_date: dateToUse,
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
      const label = dateToUse === today ? "Great job! Keep it up! 💪" : `Checked in for ${format(parseISO(dateToUse), "MMM d")} ✅`;
      toast.success(label);
    } else {
      toast("It's okay. Every day is a fresh start. 💙");
    }

    setShowCheckinDialog(false);
    setCheckinCategory(null);
    setCheckinDate("");
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

  const handleUpdateMoneyPerDay = async (catId: string, value: number) => {
    const { error } = await supabase.from("sobriety_categories").update({ money_per_day: value } as any).eq("id", catId);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Money saved updated");
    fetchData();
  };

  const handleAddPriorDays = async (cat: SobrietyCategory, days: number) => {
    if (!user) return;
    const startDate = parseISO(cat.start_date);
    const rows: any[] = [];
    for (let i = 1; i <= days; i++) {
      const d = subDays(startDate, i);
      const dateStr = format(d, "yyyy-MM-dd");
      rows.push({
        user_id: user.id,
        category_id: cat.id,
        check_date: dateStr,
        stayed_on_track: true,
      });
    }
    const newStart = format(subDays(startDate, days), "yyyy-MM-dd");
    const [{ error: checkErr }, { error: catErr }] = await Promise.all([
      supabase.from("sobriety_checkins").upsert(rows, { onConflict: "category_id,check_date" }),
      supabase.from("sobriety_categories").update({ start_date: newStart } as any).eq("id", cat.id),
    ]);
    if (checkErr || catErr) { toast.error("Failed to add prior days"); return; }
    toast.success(`Added ${days} prior sober days`);
    fetchData();
  };

  const isCheckedIn = useCallback((catId: string, date: string) => {
    return checkins.some(c => c.category_id === catId && c.check_date === date);
  }, [checkins]);

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

  const openCheckinFor = (cat: SobrietyCategory, date: string) => {
    setCheckinCategory(cat);
    setCheckinDate(date);
    setShowCheckinDialog(true);
  };

  const readOnly = isViewingPartner;

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-foreground mb-6">Sobriety</h1>
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
        {!readOnly && (
          <button
            onClick={() => setShowAddDrawer(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      <GroupSelector />

      {/* View Tabs */}
      {hasOther && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5 overflow-x-auto scrollbar-hide">
          {workoutFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id)}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                viewFilter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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
      {filteredCategories.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {readOnly ? `${partnerName} hasn't started tracking yet` : "Start Your Journey"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-[260px] mx-auto">
            {readOnly
              ? "They'll see their progress here once they begin."
              : "Track what you're abstaining from and celebrate every day of progress."}
          </p>
          {!readOnly && (
            <Button onClick={() => setShowAddDrawer(true)} className="rounded-full px-6">
              <Plus size={16} className="mr-1" /> Add Category
            </Button>
          )}
        </motion.div>
      )}

      {/* Together View: grouped by user */}
      {isTogetherView && filteredCategories.length > 0 ? (
        <TogetherSobrietyView
          categories={filteredCategories}
          checkins={checkins}
          getStreakInfo={getStreakInfo}
          getHeatmapData={getHeatmapData}
          getMissedDays={getMissedDays}
          isCheckedIn={isCheckedIn}
          today={today}
          currentUserId={user?.id || ""}
          myName={profile?.display_name || "Me"}
          partnerName={partnerName || "Partner"}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          openCheckinFor={openCheckinFor}
          handleResetStreak={handleResetStreak}
          handleDeleteCategory={handleDeleteCategory}
          onUpdateMoneyPerDay={handleUpdateMoneyPerDay}
          onAddPriorDays={handleAddPriorDays}
        />
      ) : (
        /* Normal card list */
        <div className="space-y-3">
          {filteredCategories.map((cat, idx) => (
            <SobrietyCategoryCard
              key={cat.id}
              cat={cat}
              idx={idx}
              getStreakInfo={getStreakInfo}
              getHeatmapData={getHeatmapData}
              getMissedDays={getMissedDays}
              isCheckedIn={isCheckedIn}
              today={today}
              expandedCard={expandedCard}
              setExpandedCard={setExpandedCard}
              openCheckinFor={openCheckinFor}
              handleResetStreak={handleResetStreak}
              handleDeleteCategory={handleDeleteCategory}
              readOnly={readOnly}
              onUpdateMoneyPerDay={handleUpdateMoneyPerDay}
              onAddPriorDays={handleAddPriorDays}
            />
          ))}
        </div>
      )}

      {/* Add Category Drawer - compact for mobile */}
      <Drawer open={showAddDrawer} onOpenChange={setShowAddDrawer}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">What are you abstaining from?</DrawerTitle>
            <DrawerDescription className="text-xs">Choose a category or create your own.</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60dvh] px-4 pb-6">
            <div className="space-y-2">
              {PRESET_CATEGORIES.map(preset => {
                const alreadyAdded = categories.some(c => c.label === preset.label && c.user_id === user?.id);
                return (
                  <div
                    key={preset.label}
                    className={`rounded-xl border transition-all ${
                      alreadyAdded
                        ? "bg-secondary/50 border-border opacity-50"
                        : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <span className="text-xl">{preset.icon}</span>
                      <span className="text-sm font-medium text-foreground flex-1">{preset.label}</span>
                      {alreadyAdded && <span className="text-[10px] text-muted-foreground">Added</span>}
                    </div>
                    {!alreadyAdded && (
                      <div className="px-3 pb-3 flex items-center gap-2">
                        <Input
                          placeholder="$/day saved (optional)"
                          value={presetMoneyPerDay[preset.label] || ""}
                          onChange={e => setPresetMoneyPerDay(p => ({ ...p, [preset.label]: e.target.value }))}
                          type="number"
                          min="0"
                          step="0.01"
                          className="text-xs h-8 flex-1"
                        />
                        <Button
                          onClick={() => handleAddCategory(preset.label, preset.icon, parseFloat(presetMoneyPerDay[preset.label] || "0") || 0)}
                          size="sm"
                          className="h-8 rounded-lg text-xs px-4"
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Custom */}
              <div className="border border-border rounded-xl p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">Custom</p>
                <Input
                  placeholder="e.g., Sugar, Caffeine..."
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  className="text-sm h-9"
                />
                <Input
                  placeholder="Money saved per day (optional)"
                  value={moneyPerDay}
                  onChange={e => setMoneyPerDay(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="text-sm h-9"
                />
                <Button
                  onClick={() => {
                    if (!customLabel.trim()) return;
                    handleAddCategory(customLabel.trim(), customIcon);
                  }}
                  disabled={!customLabel.trim()}
                  size="sm"
                  className="w-full rounded-xl"
                >
                  Add
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Check-in Dialog - supports retroactive */}
      <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              {checkinCategory?.icon} Daily Check-In
            </DialogTitle>
            <DialogDescription className="text-center">
              {checkinDate && checkinDate !== today
                ? `Check in for ${format(parseISO(checkinDate), "MMM d, yyyy")}`
                : `Did you stay on track with ${checkinCategory?.label} today?`}
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

// Category Card Component
function SobrietyCategoryCard({
  cat, idx, getStreakInfo, getHeatmapData, getMissedDays, isCheckedIn,
  today, expandedCard, setExpandedCard, openCheckinFor,
  handleResetStreak, handleDeleteCategory, readOnly, ownerLabel,
  onUpdateMoneyPerDay, onAddPriorDays,
}: {
  cat: SobrietyCategory;
  idx: number;
  getStreakInfo: (cat: SobrietyCategory) => any;
  getHeatmapData: (cat: SobrietyCategory) => any;
  getMissedDays: (cat: SobrietyCategory) => string[];
  isCheckedIn: (catId: string, date: string) => boolean;
  today: string;
  expandedCard: string | null;
  setExpandedCard: (id: string | null) => void;
  openCheckinFor: (cat: SobrietyCategory, date: string) => void;
  handleResetStreak: (cat: SobrietyCategory) => void;
  handleDeleteCategory: (id: string) => void;
  readOnly?: boolean;
  ownerLabel?: string;
  onUpdateMoneyPerDay?: (catId: string, value: number) => void;
  onAddPriorDays?: (cat: SobrietyCategory, days: number) => void;
}) {
  const [editingMoney, setEditingMoney] = useState(false);
  const [moneyValue, setMoneyValue] = useState(String(cat.money_per_day || ""));
  const [showPriorDays, setShowPriorDays] = useState(false);
  const [priorDaysCount, setPriorDaysCount] = useState("3");

  const info = getStreakInfo(cat);
  const isExpanded = expandedCard === cat.id;
  const checkedToday = isCheckedIn(cat.id, today);
  const nextMilestone = getNextMilestone(info.currentStreak);
  const milestones = getReachedMilestones(info.currentStreak);
  const latestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
  const missedDays = getMissedDays(cat);

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
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{cat.label}-free</p>
                {ownerLabel && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">{ownerLabel}</span>
                )}
              </div>
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

      {/* Check-in buttons */}
      {!readOnly && !checkedToday && (
        <div className="px-4 pb-3">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              openCheckinFor(cat, today);
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

      {/* Missed days retroactive check-in */}
      {!readOnly && missedDays.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCard(isExpanded ? null : cat.id);
            }}
            className="text-[11px] text-primary font-medium hover:underline"
          >
            {missedDays.length} missed day{missedDays.length > 1 ? "s" : ""} — tap to check in
          </button>
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
                  <p className="text-[10px] text-muted-foreground">Checked-In Days</p>
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

                {/* Edit Money Per Day */}
                {!readOnly && (
                  <div className="col-span-2">
                    {editingMoney ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="$/day"
                          value={moneyValue}
                          onChange={e => setMoneyValue(e.target.value)}
                          className="text-sm h-8 flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            onUpdateMoneyPerDay?.(cat.id, parseFloat(moneyValue) || 0);
                            setEditingMoney(false);
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => { setEditingMoney(false); setMoneyValue(String(cat.money_per_day || "")); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingMoney(true)}
                        className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        <DollarSign size={12} />
                        {cat.money_per_day > 0 ? `Edit money saved ($${cat.money_per_day}/day)` : "Add money saved per day"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Add Prior Sober Days */}
              {!readOnly && (
                <div>
                  {showPriorDays ? (
                    <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">Add prior sober days</p>
                      <p className="text-[10px] text-muted-foreground">Were you sober before creating this card? Add those days here.</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={priorDaysCount}
                          onChange={e => setPriorDaysCount(e.target.value)}
                          placeholder="Days"
                          className="text-sm h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">days before start</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs rounded-lg"
                          onClick={() => {
                            const count = parseInt(priorDaysCount) || 0;
                            if (count > 0) {
                              onAddPriorDays?.(cat, count);
                              setShowPriorDays(false);
                            }
                          }}
                        >
                          Add {priorDaysCount || 0} days
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowPriorDays(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPriorDays(true)}
                      className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
                    >
                      <Calendar size={12} />
                      Add prior sober days
                    </button>
                  )}
                </div>
              )}

              {/* Retroactive check-in for missed days */}
              {!readOnly && missedDays.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Missed Days</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missedDays.slice(0, 14).map(d => (
                      <button
                        key={d}
                        onClick={() => openCheckinFor(cat, d)}
                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary transition-colors border border-border"
                      >
                        {format(parseISO(d), "MMM d")}
                      </button>
                    ))}
                    {missedDays.length > 14 && (
                      <span className="text-[10px] text-muted-foreground self-center">+{missedDays.length - 14} more</span>
                    )}
                  </div>
                </div>
              )}

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
                {!readOnly && (
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
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Together View
function TogetherSobrietyView({
  categories, checkins, getStreakInfo, getHeatmapData, getMissedDays, isCheckedIn,
  today, currentUserId, myName, partnerName, expandedCard, setExpandedCard,
  openCheckinFor, handleResetStreak, handleDeleteCategory, onUpdateMoneyPerDay, onAddPriorDays,
}: {
  categories: SobrietyCategory[];
  checkins: SobrietyCheckin[];
  getStreakInfo: (cat: SobrietyCategory) => any;
  getHeatmapData: (cat: SobrietyCategory) => any;
  getMissedDays: (cat: SobrietyCategory) => string[];
  isCheckedIn: (catId: string, date: string) => boolean;
  today: string;
  currentUserId: string;
  myName: string;
  partnerName: string;
  expandedCard: string | null;
  setExpandedCard: (id: string | null) => void;
  openCheckinFor: (cat: SobrietyCategory, date: string) => void;
  handleResetStreak: (cat: SobrietyCategory) => void;
  handleDeleteCategory: (id: string) => void;
  onUpdateMoneyPerDay?: (catId: string, value: number) => void;
  onAddPriorDays?: (cat: SobrietyCategory, days: number) => void;
}) {
  const myCategories = categories.filter(c => c.user_id === currentUserId);
  const partnerCategories = categories.filter(c => c.user_id !== currentUserId);

  return (
    <div className="space-y-5">
      {/* My categories */}
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--user-a))]" />
          {myName}
          <span className="text-muted-foreground text-xs">({myCategories.length})</span>
        </h3>
        {myCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sobriety trackers</p>
        ) : (
          <div className="space-y-3">
            {myCategories.map((cat, idx) => (
              <SobrietyCategoryCard
                key={cat.id}
                cat={cat}
                idx={idx}
                getStreakInfo={getStreakInfo}
                getHeatmapData={getHeatmapData}
                getMissedDays={getMissedDays}
                isCheckedIn={isCheckedIn}
                today={today}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
                openCheckinFor={openCheckinFor}
                handleResetStreak={handleResetStreak}
                handleDeleteCategory={handleDeleteCategory}
                readOnly={false}
              />
            ))}
          </div>
        )}
      </section>

      {/* Partner categories */}
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--user-b))]" />
          {partnerName}
          <span className="text-muted-foreground text-xs">({partnerCategories.length})</span>
        </h3>
        {partnerCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sobriety trackers</p>
        ) : (
          <div className="space-y-3">
            {partnerCategories.map((cat, idx) => (
              <SobrietyCategoryCard
                key={cat.id}
                cat={cat}
                idx={idx}
                getStreakInfo={getStreakInfo}
                getHeatmapData={getHeatmapData}
                getMissedDays={getMissedDays}
                isCheckedIn={isCheckedIn}
                today={today}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
                openCheckinFor={openCheckinFor}
                handleResetStreak={handleResetStreak}
                handleDeleteCategory={handleDeleteCategory}
                readOnly={true}
                ownerLabel={partnerName}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// GitHub-style heatmap grid component
function HeatmapGrid({ data }: { data: { date: string; status: "green" | "red" | "gray" }[] }) {
  const weeks: typeof data[] = [];
  let week: typeof data = [];
  
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
