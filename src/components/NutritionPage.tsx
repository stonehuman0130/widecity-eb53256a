import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Plus, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Check, X, Loader2, Settings, Calendar, Target, ShoppingCart, Bookmark, ArrowLeftRight, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useGroupContext } from "@/hooks/useGroupContext";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const shortLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

interface MealLog {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  ingredients: string[];
  prep_steps: string[];
  is_ai_generated: boolean;
  meal_date: string;
  user_id?: string;
}

interface MealSuggestion {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  ingredients: string[];
  prep_steps: string[];
  suggestion_date?: string;
  user_id?: string;
}

interface NutritionGoals {
  protein_goal: number;
  calorie_goal: number | null;
  show_calories: boolean;
}

type ViewFilter = string; // "mine" | "partner" | "member:uuid" | "together"
type DateRange = "today" | "1week" | "2weeks" | "3weeks" | "1month";

const DATE_RANGES: { key: DateRange; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 1 },
  { key: "1week", label: "1 Week", days: 7 },
  { key: "2weeks", label: "2 Weeks", days: 14 },
  { key: "3weeks", label: "3 Weeks", days: 21 },
  { key: "1month", label: "1 Month", days: 30 },
];

const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast", icon: "🌅" },
  { key: "lunch", label: "Lunch", icon: "☀️" },
  { key: "dinner", label: "Dinner", icon: "🌙" },
  { key: "snack", label: "Snacks", icon: "🍎" },
];

const NutritionPage = ({ onOpenSettings }: { onOpenSettings?: () => void }) => {
  const { user, activeGroup, partner, profile } = useAuth();
  const { hasOther, otherName, filters: groupFilters, twoTabFilters } = useGroupContext();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");

  // Data
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [partnerMeals, setPartnerMeals] = useState<MealLog[]>([]);
  const [partnerSuggestions, setPartnerSuggestions] = useState<MealSuggestion[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ protein_goal: 150, calorie_goal: null, show_calories: false });
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Modals
  const [detailMeal, setDetailMeal] = useState<(MealLog | MealSuggestion) & { _type?: "log" | "suggestion" } | null>(null);
  const [showAddMeal, setShowAddMeal] = useState<{ mealType: string; date: string } | null>(null);
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualFoodText, setManualFoodText] = useState("");
  const [aiEstimating, setAiEstimating] = useState(false);
  const [goalProtein, setGoalProtein] = useState("150");
  const [goalCalories, setGoalCalories] = useState("");
  const [goalShowCal, setGoalShowCal] = useState(false);

  useModalScrollLock(!!detailMeal || !!showAddMeal || showGoalSettings);

  const groupId = activeGroup?.id || null;
  const dateStr = fmtDate(selectedDate);
  const isToday = dateStr === fmtDate(new Date());

  // Compute dates in range
  const rangeDates = useMemo(() => {
    const rangeInfo = DATE_RANGES.find(r => r.key === dateRange) || DATE_RANGES[0];
    if (rangeInfo.key === "today") return [fmtDate(selectedDate)];
    const dates: string[] = [];
    for (let i = 0; i < rangeInfo.days; i++) {
      dates.push(fmtDate(addDays(selectedDate, i)));
    }
    return dates;
  }, [dateRange, selectedDate]);

  // Determine which user_id to query for the current view
  const viewUserId = useMemo(() => {
    if (viewFilter === "mine") return user?.id;
    if (viewFilter === "partner") {
      const otherMembers = activeGroup?.members.filter(m => m.user_id !== user?.id) || [];
      return otherMembers[0]?.user_id || partner?.id;
    }
    if (viewFilter.startsWith("member:")) return viewFilter.split(":")[1];
    return user?.id;
  }, [viewFilter, user, activeGroup, partner]);

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const startDate = rangeDates[0];
      const endDate = rangeDates[rangeDates.length - 1];

      const [mealsRes, goalsRes, suggestionsRes] = await Promise.all([
        supabase.from("meal_logs").select("*")
          .eq("user_id", user.id)
          .gte("meal_date", startDate)
          .lte("meal_date", endDate),
        (groupId
          ? supabase.from("nutrition_goals").select("*").eq("user_id", user.id).eq("group_id", groupId).maybeSingle()
          : supabase.from("nutrition_goals").select("*").eq("user_id", user.id).is("group_id", null).maybeSingle()
        ),
        supabase.from("ai_meal_suggestions").select("*")
          .eq("user_id", user.id)
          .gte("suggestion_date", startDate)
          .lte("suggestion_date", endDate),
      ]);

      if (mealsRes.data) setMeals(mealsRes.data as MealLog[]);
      if (goalsRes.data) {
        const g = goalsRes.data as any;
        setGoals({ protein_goal: g.protein_goal || 150, calorie_goal: g.calorie_goal, show_calories: g.show_calories || false });
        setGoalProtein(String(g.protein_goal || 150));
        setGoalCalories(g.calorie_goal ? String(g.calorie_goal) : "");
        setGoalShowCal(g.show_calories || false);
      }
      if (suggestionsRes.data) setSuggestions(suggestionsRes.data as MealSuggestion[]);

      // Load partner/other data for Together view
      if (hasOther) {
        const otherIds = activeGroup?.members
          .filter(m => m.user_id !== user.id)
          .map(m => m.user_id) || (partner ? [partner.id] : []);

        if (otherIds.length > 0) {
          const [pMeals, pSugg] = await Promise.all([
            supabase.from("meal_logs").select("*")
              .in("user_id", otherIds)
              .gte("meal_date", startDate)
              .lte("meal_date", endDate),
            supabase.from("ai_meal_suggestions").select("*")
              .in("user_id", otherIds)
              .gte("suggestion_date", startDate)
              .lte("suggestion_date", endDate),
          ]);
          if (pMeals.data) setPartnerMeals(pMeals.data as MealLog[]);
          if (pSugg.data) setPartnerSuggestions(pSugg.data as MealSuggestion[]);
        }
      }

      setLoading(false);
    };
    load();
  }, [user, rangeDates, groupId, hasOther, activeGroup, partner]);

  // Filtered meals for current view
  const displayMeals = useMemo(() => {
    if (viewFilter === "mine") return meals;
    if (viewFilter === "together") return meals; // Together shows both separately
    // Partner or specific member
    return partnerMeals.filter(m => m.user_id === viewUserId);
  }, [viewFilter, meals, partnerMeals, viewUserId]);

  const displaySuggestions = useMemo(() => {
    if (viewFilter === "mine") return suggestions;
    if (viewFilter === "together") return suggestions;
    return partnerSuggestions.filter(s => s.user_id === viewUserId);
  }, [viewFilter, suggestions, partnerSuggestions, viewUserId]);

  // Today's totals
  const todayMeals = useMemo(() => displayMeals.filter(m => m.meal_date === dateStr), [displayMeals, dateStr]);
  const totalProtein = useMemo(() => todayMeals.reduce((s, m) => s + m.protein, 0), [todayMeals]);
  const totalCalories = useMemo(() => todayMeals.reduce((s, m) => s + (m.calories || 0), 0), [todayMeals]);
  const proteinPercent = goals.protein_goal > 0 ? Math.min((totalProtein / goals.protein_goal) * 100, 100) : 0;

  // View tabs
  const viewTabs = useMemo(() => {
    const tabs: { id: string; label: string }[] = [{ id: "mine", label: "Mine" }];
    if (hasOther) {
      const otherMembers = activeGroup?.members.filter(m => m.user_id !== user?.id) || [];
      if (otherMembers.length === 1) {
        tabs.push({ id: "partner", label: `${otherMembers[0].display_name || otherName}'s` });
      } else {
        for (const member of otherMembers) {
          tabs.push({ id: `member:${member.user_id}`, label: member.display_name || "Member" });
        }
      }
      tabs.push({ id: "together", label: "Together" });
    }
    return tabs;
  }, [hasOther, activeGroup, user, otherName]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

  const generateSuggestions = async () => {
    if (!user) return;
    setAiLoading(true);
    try {
      const rangeInfo = DATE_RANGES.find(r => r.key === dateRange) || DATE_RANGES[0];
      const recentMeals = await supabase.from("meal_logs").select("title,protein,calories,meal_type,ai_tags")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);

      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: {
          action: "suggest_meals",
          protein_goal: goals.protein_goal,
          protein_consumed: totalProtein,
          meals_logged: todayMeals.map(m => ({ type: m.meal_type, title: m.title, protein: m.protein })),
          recent_history: recentMeals.data || [],
          date: dateStr,
          days: rangeInfo.days,
          date_range: rangeDates,
        },
      });
      if (error) throw error;

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.suggestions) {
        const toInsert = parsed.suggestions.map((s: any) => ({
          user_id: user.id,
          group_id: groupId,
          suggestion_date: s.date || dateStr,
          meal_type: s.meal_type || "lunch",
          title: s.title,
          ingredients: s.ingredients || [],
          prep_steps: s.prep_steps || [],
          protein: s.protein || 0,
          calories: s.calories || 0,
          tags: s.tags || [],
        }));

        // Clear old suggestions for these dates
        await supabase.from("ai_meal_suggestions").delete()
          .eq("user_id", user.id)
          .gte("suggestion_date", rangeDates[0])
          .lte("suggestion_date", rangeDates[rangeDates.length - 1]);

        const { data: inserted } = await supabase.from("ai_meal_suggestions").insert(toInsert).select();
        if (inserted) setSuggestions(inserted as MealSuggestion[]);
        toast.success("Meal plan updated!");
      }
    } catch (e: any) {
      console.error("AI nutrition error:", e);
      toast.error("Couldn't generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const logMealFromSuggestion = async (suggestion: MealSuggestion, targetDate?: string) => {
    if (!user) return;
    const mealDate = targetDate || dateStr;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: mealDate,
      meal_type: suggestion.meal_type,
      title: suggestion.title,
      ingredients: suggestion.ingredients,
      prep_steps: suggestion.prep_steps,
      protein: suggestion.protein,
      calories: suggestion.calories,
      is_ai_generated: true,
      ai_tags: [],
    }).select().single();

    if (!error && data) {
      setMeals(prev => [...prev, data as MealLog]);
      setDetailMeal(null);
      toast.success(`${suggestion.title} logged!`);
    }
  };

  const logManualMeal = async (mealType: string, targetDate?: string) => {
    if (!user || !manualTitle.trim()) return;
    const mealDate = targetDate || dateStr;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: mealDate,
      meal_type: mealType,
      title: manualTitle.trim(),
      protein: parseInt(manualProtein) || 0,
      calories: parseInt(manualCalories) || 0,
      is_ai_generated: false,
    }).select().single();

    if (!error && data) {
      setMeals(prev => [...prev, data as MealLog]);
      setShowAddMeal(null);
      setManualTitle("");
      setManualProtein("");
      setManualCalories("");
      setManualFoodText("");
      toast.success("Meal logged!");
    }
  };

  const deleteMeal = async (mealId: string) => {
    await supabase.from("meal_logs").delete().eq("id", mealId);
    setMeals(prev => prev.filter(m => m.id !== mealId));
    setDetailMeal(null);
    toast.success("Meal removed");
  };

  const replaceSuggestion = async (suggestionId: string) => {
    await supabase.from("ai_meal_suggestions").delete().eq("id", suggestionId);
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    setDetailMeal(null);
    toast.success("Meal removed from plan");
  };

  const saveGoals = async () => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      group_id: groupId,
      protein_goal: parseInt(goalProtein) || 150,
      calorie_goal: goalCalories ? parseInt(goalCalories) : null,
      show_calories: goalShowCal,
    };
    const { error } = await supabase.from("nutrition_goals").upsert(payload, { onConflict: "user_id,group_id" });
    if (!error) {
      setGoals({ protein_goal: payload.protein_goal, calorie_goal: payload.calorie_goal, show_calories: payload.show_calories });
      setShowGoalSettings(false);
      toast.success("Goals updated");
    }
  };

  const aiEstimateMacros = async () => {
    if (!manualFoodText.trim()) return;
    setAiEstimating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: { action: "estimate_macros", food_description: manualFoodText.trim() },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.title) setManualTitle(parsed.title);
      if (parsed.protein) setManualProtein(String(parsed.protein));
      if (parsed.calories) setManualCalories(String(parsed.calories));
      toast.success("Macros estimated by AI");
    } catch {
      toast.error("Couldn't estimate macros");
    } finally {
      setAiEstimating(false);
    }
  };

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isViewingOwn = viewFilter === "mine";
  const isTogether = viewFilter === "together";

  // Partner totals for Together view
  const partnerTodayMeals = useMemo(() => partnerMeals.filter(m => m.meal_date === dateStr), [partnerMeals, dateStr]);
  const partnerTotalProtein = useMemo(() => partnerTodayMeals.reduce((s, m) => s + m.protein, 0), [partnerTodayMeals]);

  // Get meals for a specific date
  const getMealsForDate = (date: string) => displayMeals.filter(m => m.meal_date === date);
  const getSuggestionsForDate = (date: string) => displaySuggestions.filter(s => (s as any).suggestion_date === date);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Apple size={24} className="text-primary" /> Nutrition
        </h1>
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-secondary">
            <Settings size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* View Filter Tabs (Mine / Partner / Together) */}
      {viewTabs.length > 1 && (
        <div className="flex gap-1.5 px-5 pb-2">
          {viewTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                viewFilter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Top scrollable quick actions: Goals + Date Ranges */}
      <div className="px-5 pb-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
          <button
            onClick={() => setShowGoalSettings(true)}
            className="flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5"
          >
            <Target size={13} /> Goals
          </button>
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => { setDateRange(r.key); if (r.key === "today") setSelectedDate(new Date()); }}
              className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors border ${
                dateRange === r.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-foreground border-border hover:border-primary/30"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date nav (single day mode) */}
      {dateRange === "today" && (
        <div className="flex items-center justify-between px-5 py-1">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft size={18} /></button>
          <button onClick={() => setSelectedDate(new Date())} className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            {isToday ? "Today" : dateLabel}
          </button>
          <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-secondary"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Protein progress card */}
      {!isTogether && (
        <div className="px-5 mb-2 mt-1">
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Protein</span>
              <span className="text-sm font-bold text-primary">{totalProtein}g / {goals.protein_goal}g</span>
            </div>
            <Progress value={proteinPercent} className="h-3" />
            {goals.show_calories && goals.calorie_goal && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">Calories</span>
                <span className="text-xs font-semibold">{totalCalories} / {goals.calorie_goal} kcal</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Together View */}
      {isTogether && (
        <div className="px-5 mb-3 mt-1">
          <div className="grid grid-cols-2 gap-2.5">
            {/* My summary */}
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{profile?.display_name || "Me"}</p>
              <p className="text-xl font-bold text-primary">{totalProtein}g</p>
              <Progress value={proteinPercent} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{todayMeals.length} meal{todayMeals.length !== 1 ? "s" : ""} logged</p>
            </div>
            {/* Partner summary */}
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{otherName}</p>
              <p className="text-xl font-bold text-primary">{partnerTotalProtein}g</p>
              <Progress value={goals.protein_goal > 0 ? Math.min((partnerTotalProtein / goals.protein_goal) * 100, 100) : 0} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{partnerTodayMeals.length} meal{partnerTodayMeals.length !== 1 ? "s" : ""} logged</p>
            </div>
          </div>
        </div>
      )}

      {/* AI insight */}
      {isViewingOwn && (
        <div className="px-5 mb-3">
          <div className="bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80">
                {todayMeals.length === 0
                  ? "Log your first meal to get personalized nutrition insights."
                  : goals.protein_goal - totalProtein <= 0
                    ? "🎉 You've hit your protein goal! Great job today."
                    : `${goals.protein_goal - totalProtein}g of protein remaining. Keep it up!`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content: single day or multi-day */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {dateRange === "today" ? (
          <SingleDayView
            dateStr={dateStr}
            meals={displayMeals.filter(m => m.meal_date === dateStr)}
            suggestions={displaySuggestions.filter(s => (s as any).suggestion_date === dateStr)}
            isViewingOwn={isViewingOwn}
            isTogether={isTogether}
            partnerMeals={partnerTodayMeals}
            partnerSuggestions={partnerSuggestions.filter(s => (s as any).suggestion_date === dateStr)}
            onDetailMeal={setDetailMeal}
            onAddMeal={(mt) => setShowAddMeal({ mealType: mt, date: dateStr })}
            aiLoading={aiLoading}
            onGenerate={generateSuggestions}
            suggestionsExist={displaySuggestions.filter(s => (s as any).suggestion_date === dateStr).length > 0}
            otherName={otherName}
            profile={profile}
          />
        ) : (
          <MultiDayView
            dates={rangeDates}
            meals={displayMeals}
            suggestions={displaySuggestions}
            isViewingOwn={isViewingOwn}
            isTogether={isTogether}
            partnerMeals={partnerMeals}
            onDetailMeal={setDetailMeal}
            onAddMeal={(mt, date) => setShowAddMeal({ mealType: mt, date })}
            aiLoading={aiLoading}
            onGenerate={generateSuggestions}
            otherName={otherName}
            profile={profile}
          />
        )}
      </div>

      {/* Floating Add Button */}
      {isViewingOwn && (
        <button
          onClick={() => setShowAddMeal({ mealType: "snack", date: dateStr })}
          className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          <Plus size={24} />
        </button>
      )}

      {/* ───── MODALS ───── */}

      {/* Meal Detail / Suggestion Detail Modal */}
      <AnimatePresence>
        {detailMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setDetailMeal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[82svh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold pr-2 truncate">{detailMeal.title}</h3>
                <button onClick={() => setDetailMeal(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div
                className="px-5 pb-safe overflow-y-auto flex-1 overscroll-contain"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
              >
                {/* Macros */}
                <div className="flex gap-3 mb-4">
                  <div className="bg-primary/10 rounded-xl px-4 py-2 text-center flex-1">
                    <p className="text-lg font-bold text-primary">{detailMeal.protein}g</p>
                    <p className="text-[10px] text-muted-foreground">Protein</p>
                  </div>
                  <div className="bg-secondary rounded-xl px-4 py-2 text-center flex-1">
                    <p className="text-lg font-bold">{detailMeal.calories}</p>
                    <p className="text-[10px] text-muted-foreground">Calories</p>
                  </div>
                </div>

                {detailMeal.ingredients && (detailMeal.ingredients as string[]).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold mb-2">Ingredients</h4>
                    <ul className="space-y-1">
                      {(detailMeal.ingredients as string[]).map((ing, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailMeal.prep_steps && (detailMeal.prep_steps as string[]).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold mb-2">Preparation</h4>
                    <ol className="space-y-1.5">
                      {(detailMeal.prep_steps as string[]).map((step, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-[10px] font-bold text-primary mt-0.5 flex-shrink-0 w-4">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 mt-4 pb-4">
                  {/* If it's a suggestion (planned meal) */}
                  {"suggestion_date" in detailMeal && !("meal_date" in detailMeal) && isViewingOwn && (
                    <>
                      <button
                        onClick={() => logMealFromSuggestion(detailMeal as MealSuggestion, (detailMeal as any).suggestion_date)}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        <Check size={16} /> Log This Meal
                      </button>
                      <button
                        onClick={() => replaceSuggestion(detailMeal.id)}
                        className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
                      >
                        <ArrowLeftRight size={16} /> Replace Meal
                      </button>
                    </>
                  )}
                  {/* If it's also a suggestion without suggestion_date (legacy) */}
                  {"id" in detailMeal && !("meal_date" in detailMeal) && !("suggestion_date" in detailMeal) && isViewingOwn && (
                    <button
                      onClick={() => logMealFromSuggestion(detailMeal as MealSuggestion)}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Log This Meal
                    </button>
                  )}
                  {/* If it's a logged meal */}
                  {"meal_date" in detailMeal && isViewingOwn && (
                    <button
                      onClick={() => deleteMeal((detailMeal as MealLog).id)}
                      className="w-full py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Meal Modal */}
      <AnimatePresence>
        {showAddMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => { setShowAddMeal(null); setManualTitle(""); setManualProtein(""); setManualCalories(""); setManualFoodText(""); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[82svh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div
                className="px-5 pb-safe overflow-y-auto flex-1 overscroll-contain"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
              >
                <div className="flex items-center justify-between mb-4 pt-2">
                  <h3 className="text-lg font-bold capitalize">Add {showAddMeal.mealType}</h3>
                  <button onClick={() => { setShowAddMeal(null); setManualFoodText(""); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>
                {showAddMeal.date !== dateStr && (
                  <p className="text-xs text-muted-foreground mb-3">
                    For: {new Date(showAddMeal.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                )}

                {/* Meal type selector */}
                <div className="flex gap-1.5 mb-4">
                  {MEAL_TYPES.map(mt => (
                    <button
                      key={mt.key}
                      onClick={() => setShowAddMeal(prev => prev ? { ...prev, mealType: mt.key } : null)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${
                        showAddMeal.mealType === mt.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {mt.icon} {mt.label}
                    </button>
                  ))}
                </div>

                {/* AI Estimate */}
                <div className="mb-4 bg-primary/5 rounded-xl p-3 border border-primary/10">
                  <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5"><Sparkles size={12} /> AI Estimate</p>
                  <div className="flex gap-2">
                    <input
                      value={manualFoodText}
                      onChange={e => setManualFoodText(e.target.value)}
                      placeholder="e.g. grilled chicken salad"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={aiEstimateMacros}
                      disabled={aiEstimating || !manualFoodText.trim()}
                      className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                    >
                      {aiEstimating ? <Loader2 size={14} className="animate-spin" /> : "Estimate"}
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pb-4">
                  <input
                    value={manualTitle}
                    onChange={e => setManualTitle(e.target.value)}
                    placeholder="Meal name"
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label>
                      <input type="number" value={manualProtein} onChange={e => setManualProtein(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label>
                      <input type="number" value={manualCalories} onChange={e => setManualCalories(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                  </div>
                  <button
                    onClick={() => logManualMeal(showAddMeal.mealType, showAddMeal.date)}
                    disabled={!manualTitle.trim()}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    Log Meal
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goal Settings Modal */}
      <AnimatePresence>
        {showGoalSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setShowGoalSettings(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[82svh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div
                className="px-5 pb-safe overflow-y-auto flex-1 overscroll-contain"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
              >
                <div className="flex items-center justify-between mb-4 pt-2">
                  <h3 className="text-lg font-bold">Nutrition Goals</h3>
                  <button onClick={() => setShowGoalSettings(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4 pb-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Daily Protein Goal (g)</label>
                    <input type="number" value={goalProtein} onChange={e => setGoalProtein(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Track Calories</span>
                    <button
                      onClick={() => setGoalShowCal(!goalShowCal)}
                      className={`w-12 h-7 rounded-full transition-colors relative ${goalShowCal ? "bg-primary" : "bg-secondary"}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-card shadow absolute top-1 transition-transform ${goalShowCal ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  {goalShowCal && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Daily Calorie Goal</label>
                      <input type="number" value={goalCalories} onChange={e => setGoalCalories(e.target.value)} placeholder="2000"
                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background" />
                    </div>
                  )}
                  <button onClick={saveGoals}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                    Save Goals
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ────────── Single Day View ────────── */
interface SingleDayViewProps {
  dateStr: string;
  meals: MealLog[];
  suggestions: MealSuggestion[];
  isViewingOwn: boolean;
  isTogether: boolean;
  partnerMeals: MealLog[];
  partnerSuggestions: MealSuggestion[];
  onDetailMeal: (m: any) => void;
  onAddMeal: (mt: string) => void;
  aiLoading: boolean;
  onGenerate: () => void;
  suggestionsExist: boolean;
  otherName: string;
  profile: any;
}

function SingleDayView({ dateStr, meals, suggestions, isViewingOwn, isTogether, partnerMeals, partnerSuggestions, onDetailMeal, onAddMeal, aiLoading, onGenerate, suggestionsExist, otherName, profile }: SingleDayViewProps) {
  const isToday = dateStr === fmtDate(new Date());

  return (
    <>
      {/* Logged Meals */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          {isTogether ? `${profile?.display_name || "My"} Logged Meals` : "Logged Meals"}
        </h2>
        <MealGrid
          meals={meals}
          onDetail={onDetailMeal}
          onAdd={isViewingOwn ? onAddMeal : undefined}
          type="logged"
        />
      </div>

      {/* Planned Meals (suggestions) */}
      {(suggestions.length > 0 || isViewingOwn) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {isTogether ? `${profile?.display_name || "My"} Planned` : "Planned Meals"}
            </h2>
            {isViewingOwn && (
              <button
                onClick={onGenerate}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {suggestionsExist ? "Regenerate" : "AI Plan"}
              </button>
            )}
          </div>
          {suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => onDetailMeal(s)}
                  className="w-full bg-card rounded-xl p-3 shadow-card border border-dashed border-primary/20 text-left hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Sparkles size={10} className="text-primary flex-shrink-0" />
                        <p className="text-sm font-medium truncate">{s.title}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground capitalize">{s.meal_type} · AI Planned</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs font-bold text-primary">{s.protein}g</p>
                      <p className="text-[10px] text-muted-foreground">{s.calories} kcal</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : isViewingOwn ? (
            <div className="bg-card rounded-xl p-4 border border-dashed border-border text-center">
              <p className="text-xs text-muted-foreground">Tap "AI Plan" to generate personalized meal ideas</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Together: Partner section */}
      {isTogether && (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              {otherName}'s Logged Meals
            </h2>
            <MealGrid meals={partnerMeals} onDetail={onDetailMeal} type="logged" />
          </div>
          {partnerSuggestions.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                {otherName}'s Planned
              </h2>
              <div className="space-y-2">
                {partnerSuggestions.map(s => (
                  <button key={s.id} onClick={() => onDetailMeal(s)}
                    className="w-full bg-card rounded-xl p-3 shadow-card border border-dashed border-border text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.title}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{s.meal_type}</p>
                      </div>
                      <p className="text-xs font-bold text-primary">{s.protein}g</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ────────── Multi Day View ────────── */
interface MultiDayViewProps {
  dates: string[];
  meals: MealLog[];
  suggestions: MealSuggestion[];
  isViewingOwn: boolean;
  isTogether: boolean;
  partnerMeals: MealLog[];
  onDetailMeal: (m: any) => void;
  onAddMeal: (mt: string, date: string) => void;
  aiLoading: boolean;
  onGenerate: () => void;
  otherName: string;
  profile: any;
}

function MultiDayView({ dates, meals, suggestions, isViewingOwn, isTogether, partnerMeals, onDetailMeal, onAddMeal, aiLoading, onGenerate, otherName, profile }: MultiDayViewProps) {
  const today = fmtDate(new Date());

  return (
    <>
      {/* Generate button for the range */}
      {isViewingOwn && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onGenerate}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {suggestions.length > 0 ? "Regenerate Plan" : "Generate AI Plan"}
          </button>
        </div>
      )}

      {dates.map(date => {
        const dayMeals = meals.filter(m => m.meal_date === date);
        const daySuggestions = suggestions.filter(s => (s as any).suggestion_date === date);
        const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const isDateToday = date === today;

        return (
          <div key={date} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <h3 className={`text-sm font-bold ${isDateToday ? "text-primary" : "text-foreground"}`}>
                {isDateToday ? "Today" : dayLabel}
              </h3>
              {dayMeals.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {dayMeals.reduce((s, m) => s + m.protein, 0)}g protein
                </span>
              )}
            </div>

            {/* Logged meals for this day */}
            {dayMeals.length > 0 && (
              <div className="mb-2">
                {dayMeals.map(m => (
                  <button key={m.id} onClick={() => onDetailMeal(m)}
                    className="w-full bg-card rounded-xl p-3 mb-1.5 shadow-card border border-border text-left hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs">{MEAL_TYPES.find(mt => mt.key === m.meal_type)?.icon || "🍽️"}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
                            {m.meal_type} <Check size={8} className="text-primary" /> Logged
                          </p>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-primary flex-shrink-0">{m.protein}g</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Planned meals (suggestions) for this day */}
            {daySuggestions.length > 0 && (
              <div className="mb-2">
                {daySuggestions.map(s => (
                  <button key={s.id} onClick={() => onDetailMeal(s)}
                    className="w-full bg-card rounded-xl p-3 mb-1.5 shadow-card border border-dashed border-primary/20 text-left hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Sparkles size={10} className="text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{s.meal_type} · Planned</p>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-primary flex-shrink-0">{s.protein}g</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Empty state + add for each meal type */}
            {dayMeals.length === 0 && daySuggestions.length === 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {MEAL_TYPES.map(mt => (
                  <button key={mt.key}
                    onClick={() => isViewingOwn && onAddMeal(mt.key, date)}
                    className="bg-card rounded-lg p-2 border border-border text-center hover:border-primary/30 transition-colors"
                  >
                    <span className="text-sm">{mt.icon}</span>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{mt.label}</p>
                    {isViewingOwn && <Plus size={10} className="text-primary mx-auto mt-0.5" />}
                  </button>
                ))}
              </div>
            )}

            {/* Add button when there are some meals but not all slots filled */}
            {(dayMeals.length > 0 || daySuggestions.length > 0) && isViewingOwn && (
              <button
                onClick={() => onAddMeal("snack", date)}
                className="flex items-center gap-1.5 text-xs text-primary font-semibold mt-1 hover:underline"
              >
                <Plus size={12} /> Add meal
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ────────── Meal Grid (2x2) ────────── */
function MealGrid({ meals, onDetail, onAdd, type }: {
  meals: MealLog[];
  onDetail: (m: MealLog) => void;
  onAdd?: (mealType: string) => void;
  type: "logged" | "planned";
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MEAL_TYPES.map(mt => {
        const typeMeals = meals.filter(m => m.meal_type === mt.key);
        const totalP = typeMeals.reduce((s, m) => s + m.protein, 0);
        return (
          <button
            key={mt.key}
            onClick={() => typeMeals.length > 0 ? onDetail(typeMeals[0]) : onAdd?.(mt.key)}
            className="bg-card rounded-xl p-3 shadow-card border border-border text-left hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">{mt.icon}</span>
              <span className="text-xs font-semibold">{mt.label}</span>
            </div>
            {typeMeals.length > 0 ? (
              <>
                <p className="text-[11px] font-medium truncate">{typeMeals.map(m => m.title).join(", ")}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-primary">{totalP}g</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Check size={9} /> Logged</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground">No meals yet</p>
                {onAdd && (
                  <div className="flex items-center gap-1 mt-1 text-primary">
                    <Plus size={10} /><span className="text-[10px] font-semibold">Add</span>
                  </div>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default NutritionPage;
