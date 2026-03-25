import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Plus, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Check, X, Loader2, Settings, Calendar, Target, Camera, ArrowLeftRight, MoreVertical, Trash2 } from "lucide-react";
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
  consumed?: boolean;
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

type ViewFilter = string;
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

  // AI suggestion results (not yet added)
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [showAiResults, setShowAiResults] = useState(false);

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
  const [mealMenuOpen, setMealMenuOpen] = useState<string | null>(null);
  const [goalCalories, setGoalCalories] = useState("");
  const [goalShowCal, setGoalShowCal] = useState(false);
  const [cameraAnalyzing, setCameraAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useModalScrollLock(!!detailMeal || !!showAddMeal || showGoalSettings || showAiResults);

  const groupId = activeGroup?.id || null;
  const dateStr = fmtDate(selectedDate);
  const isToday = dateStr === fmtDate(new Date());

  const rangeDates = useMemo(() => {
    const rangeInfo = DATE_RANGES.find(r => r.key === dateRange) || DATE_RANGES[0];
    if (rangeInfo.key === "today") return [fmtDate(selectedDate)];
    const dates: string[] = [];
    for (let i = 0; i < rangeInfo.days; i++) {
      dates.push(fmtDate(addDays(selectedDate, i)));
    }
    return dates;
  }, [dateRange, selectedDate]);

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

  const displayMeals = useMemo(() => {
    if (viewFilter === "mine") return meals;
    if (viewFilter === "together") return meals;
    return partnerMeals.filter(m => m.user_id === viewUserId);
  }, [viewFilter, meals, partnerMeals, viewUserId]);

  const displaySuggestions = useMemo(() => {
    if (viewFilter === "mine") return suggestions;
    if (viewFilter === "together") return suggestions;
    return partnerSuggestions.filter(s => s.user_id === viewUserId);
  }, [viewFilter, suggestions, partnerSuggestions, viewUserId]);

  // Totals: only count CONSUMED meals
  const todayMeals = useMemo(() => displayMeals.filter(m => m.meal_date === dateStr), [displayMeals, dateStr]);
  const consumedMeals = useMemo(() => todayMeals.filter(m => m.consumed), [todayMeals]);
  const totalProtein = useMemo(() => consumedMeals.reduce((s, m) => s + m.protein, 0), [consumedMeals]);
  const totalCalories = useMemo(() => consumedMeals.reduce((s, m) => s + (m.calories || 0), 0), [consumedMeals]);
  const proteinPercent = goals.protein_goal > 0 ? Math.min((totalProtein / goals.protein_goal) * 100, 100) : 0;

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

  // Generate AI suggestions → show as selectable results (don't auto-add)
  const generateSuggestions = async () => {
    if (!user) return;
    setAiLoading(true);
    try {
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
          days: 1,
          date_range: rangeDates,
        },
      });
      if (error) throw error;

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.suggestions && parsed.suggestions.length > 0) {
        setAiResults(parsed.suggestions);
        setShowAiResults(true);
      } else {
        toast("No suggestions generated. Try again!");
      }
    } catch (e: any) {
      console.error("AI nutrition error:", e);
      toast.error("Couldn't generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  // Add a selected AI suggestion as a planned meal
  const addAiMealAsPlanned = async (suggestion: any) => {
    if (!user) return;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: dateStr,
      meal_type: suggestion.meal_type || "lunch",
      title: suggestion.title,
      ingredients: suggestion.ingredients || [],
      prep_steps: suggestion.prep_steps || [],
      protein: suggestion.protein || 0,
      calories: suggestion.calories || 0,
      is_ai_generated: true,
      ai_tags: suggestion.tags || [],
      consumed: false,
    }).select().single();

    if (!error && data) {
      setMeals(prev => [...prev, data as MealLog]);
      toast.success(`${suggestion.title} added to planned meals!`);
    }
  };

  // Mark meal as consumed / unconsume
  const toggleConsumed = async (mealId: string, consumed: boolean) => {
    const { error } = await supabase.from("meal_logs").update({ consumed }).eq("id", mealId);
    if (!error) {
      setMeals(prev => prev.map(m => m.id === mealId ? { ...m, consumed } : m));
      toast.success(consumed ? "Marked as consumed ✓" : "Unmarked");
    }
  };

  // Log manual meal as planned (consumed=false)
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
      consumed: false,
    }).select().single();

    if (!error && data) {
      setMeals(prev => [...prev, data as MealLog]);
      setShowAddMeal(null);
      setManualTitle("");
      setManualProtein("");
      setManualCalories("");
      setManualFoodText("");
      toast.success("Meal added to plan!");
    }
  };

  const deleteMeal = async (mealId: string) => {
    await supabase.from("meal_logs").delete().eq("id", mealId);
    setMeals(prev => prev.filter(m => m.id !== mealId));
    setDetailMeal(null);
    toast.success("Meal removed");
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

  // Camera: capture/upload photo and analyze
  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: { action: "analyze_image", image_base64: base64 },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.title) setManualTitle(parsed.title);
      if (parsed.protein) setManualProtein(String(parsed.protein));
      if (parsed.calories) setManualCalories(String(parsed.calories));
      toast.success("Food analyzed from photo!");
    } catch (err) {
      console.error("Camera analysis error:", err);
      toast.error("Couldn't analyze the photo");
    } finally {
      setCameraAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isViewingOwn = viewFilter === "mine";
  const isTogether = viewFilter === "together";

  const partnerTodayMeals = useMemo(() => partnerMeals.filter(m => m.meal_date === dateStr), [partnerMeals, dateStr]);
  const partnerConsumed = useMemo(() => partnerTodayMeals.filter(m => m.consumed), [partnerTodayMeals]);
  const partnerTotalProtein = useMemo(() => partnerConsumed.reduce((s, m) => s + m.protein, 0), [partnerConsumed]);

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

      {/* View Filter Tabs */}
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

      {/* Quick actions: Goals + Date Ranges */}
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

      {/* Date nav (single day) */}
      {dateRange === "today" && (
        <div className="flex items-center justify-between px-5 py-1">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft size={18} /></button>
          <button onClick={() => setSelectedDate(new Date())} className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            {isToday ? "Today" : dateLabel}
          </button>
          <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-secondary"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Protein progress */}
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
            <p className="text-[10px] text-muted-foreground mt-2">
              {consumedMeals.length} consumed · {todayMeals.filter(m => !m.consumed).length} planned
            </p>
          </div>
        </div>
      )}

      {/* Together View */}
      {isTogether && (
        <div className="px-5 mb-3 mt-1">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{profile?.display_name || "Me"}</p>
              <p className="text-xl font-bold text-primary">{totalProtein}g</p>
              <Progress value={proteinPercent} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{consumedMeals.length} consumed</p>
            </div>
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{otherName}</p>
              <p className="text-xl font-bold text-primary">{partnerTotalProtein}g</p>
              <Progress value={goals.protein_goal > 0 ? Math.min((partnerTotalProtein / goals.protein_goal) * 100, 100) : 0} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{partnerConsumed.length} consumed</p>
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
                {consumedMeals.length === 0
                  ? "Plan your meals and mark them as consumed to track nutrition."
                  : goals.protein_goal - totalProtein <= 0
                    ? "🎉 You've hit your protein goal! Great job today."
                    : `${goals.protein_goal - totalProtein}g of protein remaining. Keep it up!`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {dateRange === "today" ? (
          <>
            {/* Planned Meals - main section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {isTogether ? `${profile?.display_name || "My"} Planned Meals` : "Planned Meals"}
                </h2>
                {isViewingOwn && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowAddMeal({ mealType: "snack", date: dateStr })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      <Plus size={12} /> Add
                    </button>
                    <button
                      onClick={generateSuggestions}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      AI Suggest
                    </button>
                  </div>
                )}
              </div>

              {todayMeals.length > 0 ? (
                <div className="space-y-2">
                  {todayMeals.map(meal => (
                    <div key={meal.id} className={`relative bg-card rounded-xl p-3 shadow-card border transition-colors ${
                      meal.consumed ? "border-primary/30 bg-primary/5" : "border-border"
                    }`}>
                      <div className="flex items-center gap-3">
                        {/* Check button */}
                        {isViewingOwn && (
                          <button
                            onClick={() => toggleConsumed(meal.id, !meal.consumed)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                              meal.consumed
                                ? "bg-primary text-primary-foreground"
                                : "border-2 border-muted-foreground/30 hover:border-primary"
                            }`}
                          >
                            {meal.consumed && <Check size={16} />}
                          </button>
                        )}
                        <button
                          onClick={() => setDetailMeal(meal)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${meal.consumed ? "line-through text-muted-foreground" : ""}`}>
                                {meal.title}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
                                {MEAL_TYPES.find(mt => mt.key === meal.meal_type)?.icon} {meal.meal_type}
                                {meal.is_ai_generated && <><Sparkles size={8} className="text-primary" /> AI</>}
                                {meal.consumed && <><Check size={8} className="text-primary" /> Consumed</>}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <p className="text-xs font-bold text-primary">{meal.protein}g</p>
                              <p className="text-[10px] text-muted-foreground">{meal.calories} kcal</p>
                            </div>
                          </div>
                        </button>
                        {/* Three-dot menu */}
                        {isViewingOwn && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={() => setMealMenuOpen(mealMenuOpen === meal.id ? null : meal.id)}
                              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                            >
                              <MoreVertical size={14} className="text-muted-foreground" />
                            </button>
                            {mealMenuOpen === meal.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setMealMenuOpen(null)} />
                                <div className="absolute right-0 top-8 z-50 bg-card rounded-xl border border-border shadow-lg py-1 min-w-[140px]">
                                  <button
                                    onClick={() => { deleteMeal(meal.id); setMealMenuOpen(null); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-card rounded-xl p-4 border border-dashed border-border text-center">
                  <p className="text-xs text-muted-foreground">No meals planned yet. Use AI Suggest or tap + to add.</p>
                </div>
              )}
            </div>

            {/* Together: Partner section */}
            {isTogether && (
              <div className="mb-4">
                <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  {otherName}'s Planned Meals
                </h2>
                {partnerTodayMeals.length > 0 ? (
                  <div className="space-y-2">
                    {partnerTodayMeals.map(meal => (
                      <div key={meal.id} className={`bg-card rounded-xl p-3 shadow-card border ${meal.consumed ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${meal.consumed ? "line-through text-muted-foreground" : ""}`}>{meal.title}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {meal.meal_type} {meal.consumed && "· ✓ Consumed"}
                            </p>
                          </div>
                          <p className="text-xs font-bold text-primary ml-2">{meal.protein}g</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No meals planned</p>
                )}
              </div>
            )}
          </>
        ) : (
          <WeeklyCalendarView
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
            onToggleConsumed={toggleConsumed}
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

      {/* Hidden file input for camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraCapture}
      />

      {/* ───── AI Results Selection Modal ───── */}
      <AnimatePresence>
        {showAiResults && aiResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => setShowAiResults(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles size={18} className="text-primary" /> AI Meal Suggestions
                </h3>
                <button onClick={() => setShowAiResults(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <p className="px-5 text-xs text-muted-foreground mb-3">Select the meals you want to add to your plan:</p>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                {aiResults.map((s, idx) => (
                  <div key={idx} className="bg-background rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{s.title}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{s.meal_type}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-primary">{s.protein}g</p>
                        <p className="text-[10px] text-muted-foreground">{s.calories} kcal</p>
                      </div>
                    </div>
                    {s.ingredients && s.ingredients.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">
                        {(s.ingredients as string[]).join(", ")}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        addAiMealAsPlanned(s);
                        setAiResults(prev => prev.filter((_, i) => i !== idx));
                        if (aiResults.length <= 1) setShowAiResults(false);
                      }}
                      className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Add to Plan
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Meal Detail Modal ───── */}
      <AnimatePresence>
        {detailMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => setDetailMeal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
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
              <div className="px-5 pb-safe flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
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

                <div className="flex flex-col gap-2 mt-4 pb-4">
                  {"meal_date" in detailMeal && isViewingOwn && (
                    <>
                      <button
                        onClick={() => { toggleConsumed((detailMeal as MealLog).id, !(detailMeal as MealLog).consumed); setDetailMeal(null); }}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                          (detailMeal as MealLog).consumed
                            ? "bg-secondary text-foreground hover:bg-secondary/80"
                            : "bg-primary text-primary-foreground hover:opacity-90"
                        }`}
                      >
                        <Check size={16} /> {(detailMeal as MealLog).consumed ? "Unmark Consumed" : "Mark as Consumed"}
                      </button>
                      <button
                        onClick={() => deleteMeal((detailMeal as MealLog).id)}
                        className="w-full py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Add Meal Modal ───── */}
      <AnimatePresence>
        {showAddMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => { setShowAddMeal(null); setManualTitle(""); setManualProtein(""); setManualCalories(""); setManualFoodText(""); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold">Add Meal</h3>
                <button onClick={() => { setShowAddMeal(null); setManualFoodText(""); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>

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

                {/* Camera + AI Estimate row */}
                <div className="flex gap-2 mb-4">
                  {/* Camera button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={cameraAnalyzing}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary border border-border hover:border-primary/30 transition-colors disabled:opacity-50"
                  >
                    {cameraAnalyzing ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <Camera size={18} className="text-primary" />
                    )}
                    <div className="text-left">
                      <p className="text-xs font-semibold">{cameraAnalyzing ? "Analyzing..." : "Photo"}</p>
                      <p className="text-[9px] text-muted-foreground">Snap food or label</p>
                    </div>
                  </button>

                  {/* AI Estimate */}
                  <div className="flex-1 bg-primary/5 rounded-xl p-3 border border-primary/10">
                    <p className="text-[10px] font-semibold text-primary mb-1.5 flex items-center gap-1"><Sparkles size={10} /> AI Estimate</p>
                    <div className="flex gap-1.5">
                      <input
                        value={manualFoodText}
                        onChange={e => setManualFoodText(e.target.value)}
                        placeholder="e.g. chicken salad"
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={aiEstimateMacros}
                        disabled={aiEstimating || !manualFoodText.trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50"
                      >
                        {aiEstimating ? <Loader2 size={12} className="animate-spin" /> : "Go"}
                      </button>
                    </div>
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
                    Add to Plan
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Goal Settings Modal ───── */}
      <AnimatePresence>
        {showGoalSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => setShowGoalSettings(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold">Nutrition Goals</h3>
                <button onClick={() => setShowGoalSettings(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
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

/* ────────── Weekly Calendar View ────────── */
interface WeeklyCalendarViewProps {
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
  onToggleConsumed: (id: string, consumed: boolean) => void;
  otherName: string;
  profile: any;
}

function WeeklyCalendarView({ dates, meals, suggestions, isViewingOwn, isTogether, partnerMeals, onDetailMeal, onAddMeal, aiLoading, onGenerate, onToggleConsumed, otherName, profile }: WeeklyCalendarViewProps) {
  const today = fmtDate(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      result.push(dates.slice(i, i + 7));
    }
    return result;
  }, [dates]);

  const getMealsForDate = (date: string) => meals.filter(m => m.meal_date === date);
  const dayMeals = selectedDay ? getMealsForDate(selectedDay) : [];

  return (
    <>
      {isViewingOwn && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onGenerate}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI Suggest
          </button>
        </div>
      )}

      {weeks.map((week, wi) => {
        const weekStart = new Date(week[0] + "T12:00:00");
        const weekEnd = new Date(week[week.length - 1] + "T12:00:00");
        const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

        return (
          <div key={wi} className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-foreground">
                Week {wi + 1} <span className="text-muted-foreground font-normal text-xs ml-1">{weekLabel}</span>
              </h3>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {week.map(date => {
                const d = new Date(date + "T12:00:00");
                const dayName = d.toLocaleDateString("en-US", { weekday: "narrow" });
                const dayNum = d.getDate();
                const isDateToday = date === today;
                const dMeals = getMealsForDate(date);
                const consumedCount = dMeals.filter(m => m.consumed).length;
                const totalProtein = dMeals.filter(m => m.consumed).reduce((s, m) => s + m.protein, 0);

                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDay(date)}
                    className={`flex flex-col items-center rounded-xl p-1.5 border transition-colors min-h-[72px] ${
                      selectedDay === date
                        ? "border-primary bg-primary/10"
                        : isDateToday
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card hover:border-primary/20"
                    }`}
                  >
                    <span className={`text-[9px] font-semibold ${isDateToday ? "text-primary" : "text-muted-foreground"}`}>{dayName}</span>
                    <span className={`text-sm font-bold leading-tight ${isDateToday ? "text-primary" : "text-foreground"}`}>{dayNum}</span>
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                      {dMeals.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      {consumedCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />}
                    </div>
                    {totalProtein > 0 && (
                      <span className="text-[8px] font-bold text-primary mt-0.5">{totalProtein}g</span>
                    )}
                    {dMeals.length === 0 && <span className="text-[8px] text-muted-foreground mt-0.5">–</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Day Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
            onClick={() => setSelectedDay(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[85svh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0 border-b border-border">
                <h3 className="text-lg font-bold">
                  {selectedDay === today
                    ? "Today"
                    : new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 pb-safe overflow-y-auto flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
                {MEAL_TYPES.map(mt => {
                  const slotMeals = dayMeals.filter(m => m.meal_type === mt.key);

                  return (
                    <div key={mt.key} className="py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{mt.icon}</span>
                        <h4 className="text-sm font-semibold">{mt.label}</h4>
                      </div>

                      {slotMeals.map(m => (
                        <div key={m.id} className={`w-full bg-background rounded-xl p-3 mb-1.5 border transition-colors ${m.consumed ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                          <div className="flex items-center gap-2">
                            {isViewingOwn && (
                              <button
                                onClick={() => onToggleConsumed(m.id, !m.consumed)}
                                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                  m.consumed ? "bg-primary text-primary-foreground" : "border-2 border-muted-foreground/30 hover:border-primary"
                                }`}
                              >
                                {m.consumed && <Check size={12} />}
                              </button>
                            )}
                            <button onClick={() => onDetailMeal(m)} className="flex-1 text-left min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={`text-sm font-medium truncate ${m.consumed ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                                <div className="text-right flex-shrink-0 ml-2">
                                  <p className="text-xs font-bold text-primary">{m.protein}g</p>
                                  <p className="text-[10px] text-muted-foreground">{m.calories} kcal</p>
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>
                      ))}

                      {slotMeals.length === 0 && isViewingOwn && (
                        <button
                          onClick={() => { onAddMeal(mt.key, selectedDay); setSelectedDay(null); }}
                          className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline py-1"
                        >
                          <Plus size={12} /> Add {mt.label.toLowerCase()}
                        </button>
                      )}
                    </div>
                  );
                })}

                {dayMeals.filter(m => m.consumed).length > 0 && (
                  <div className="py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Consumed Total</span>
                    <span className="text-sm font-bold text-primary">
                      {dayMeals.filter(m => m.consumed).reduce((s, m) => s + m.protein, 0)}g protein
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default NutritionPage;
