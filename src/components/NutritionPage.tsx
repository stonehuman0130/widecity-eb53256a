import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Plus, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Check, X, Loader2, Settings, Calendar, Target, Camera, ArrowLeftRight, MoreVertical, Trash2, Pencil, Clock, Zap, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Group, useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useGroupContext } from "@/hooks/useGroupContext";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import GroupSelector from "@/components/GroupSelector";

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
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  prep_steps: string[];
  is_ai_generated: boolean;
  meal_date: string;
  group_id?: string | null;
  user_id?: string;
  consumed?: boolean;
}

interface MealSuggestion {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  prep_steps: string[];
  suggestion_date?: string;
  group_id?: string | null;
  user_id?: string;
}

type TrackerKey = "protein" | "calories" | "carbs" | "fat" | "fiber";

const ALL_TRACKERS: { key: TrackerKey; label: string; unit: string; defaultGoal: number; color: string }[] = [
  { key: "protein", label: "Protein", unit: "g", defaultGoal: 150, color: "hsl(var(--primary))" },
  { key: "calories", label: "Calories", unit: "kcal", defaultGoal: 2000, color: "hsl(25 95% 53%)" },
  { key: "carbs", label: "Carbs", unit: "g", defaultGoal: 220, color: "hsl(45 93% 47%)" },
  { key: "fat", label: "Fat", unit: "g", defaultGoal: 70, color: "hsl(280 67% 55%)" },
  { key: "fiber", label: "Fiber", unit: "g", defaultGoal: 30, color: "hsl(142 71% 45%)" },
];

interface NutritionGoals {
  protein_goal: number;
  calorie_goal: number | null;
  carbs_goal: number | null;
  fat_goal: number | null;
  fiber_goal: number | null;
  show_calories: boolean;
  enabled_trackers: TrackerKey[];
  tracker_order: TrackerKey[];
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
  const { user, activeGroup, partner, profile, groups } = useAuth();
  const { hasOther, otherName, filters: groupFilters, twoTabFilters } = useGroupContext();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("mine");

  // Data
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [partnerMeals, setPartnerMeals] = useState<MealLog[]>([]);
  const [partnerSuggestions, setPartnerSuggestions] = useState<MealSuggestion[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ protein_goal: 150, calorie_goal: null, carbs_goal: null, fat_goal: null, fiber_goal: null, show_calories: false, enabled_trackers: ["protein", "calories"], tracker_order: ["protein", "calories", "carbs", "fat", "fiber"] });
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
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualFiber, setManualFiber] = useState("");
  const [manualFoodText, setManualFoodText] = useState("");
  const [aiEstimating, setAiEstimating] = useState(false);
  const [goalProtein, setGoalProtein] = useState("150");
  const [mealMenuOpen, setMealMenuOpen] = useState<string | null>(null);
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [editFiber, setEditFiber] = useState("");
  const [editMealType, setEditMealType] = useState("lunch");
  const [goalCalories, setGoalCalories] = useState("");
  const [goalCarbs, setGoalCarbs] = useState("");
  const [goalFat, setGoalFat] = useState("");
  const [goalFiber, setGoalFiber] = useState("");
  const [goalShowCal, setGoalShowCal] = useState(false);
  const [goalEnabledTrackers, setGoalEnabledTrackers] = useState<TrackerKey[]>(["protein", "calories"]);
  const [cameraAnalyzing, setCameraAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add meal: group sharing selection
  const [addMealGroupIds, setAddMealGroupIds] = useState<string[]>([]);
  const [addMealPrivate, setAddMealPrivate] = useState(false);
  const [aiConfirmSelection, setAiConfirmSelection] = useState<{ suggestion: any; index: number } | null>(null);

  // Quick Suggestions / Frequent Items
  const [mealIdeasTab, setMealIdeasTab] = useState<"suggestions" | "frequent">("suggestions");
  const [frequentMeals, setFrequentMeals] = useState<{ title: string; protein: number; calories: number; carbs: number; fat: number; fiber: number; meal_type: string; count: number }[]>([]);

  // Shopping list prompt after AI suggest add (queue for multiple meals)
  const [shopPrompt, setShopPrompt] = useState<{ ingredients: string[]; mealTitle: string; mealDate: string } | null>(null);
  const [shopQueue, setShopQueue] = useState<{ ingredients: string[]; mealTitle: string; mealDate: string }[]>([]);
  const [shopChecked, setShopChecked] = useState<Record<number, boolean>>({});
  const [shopSaving, setShopSaving] = useState(false);

  // Process shop queue: when shopPrompt is dismissed and queue has items, show next
  const dismissShopPrompt = () => {
    setShopPrompt(null);
    setShopQueue(prev => {
      if (prev.length > 0) {
        const [next, ...rest] = prev;
        setTimeout(() => {
          setShopChecked(Object.fromEntries(next.ingredients.map((_, i) => [i, true])));
          setShopPrompt(next);
        }, 200);
        return rest;
      }
      return prev;
    });
  };

  const enqueueShopPrompt = (item: { ingredients: string[]; mealTitle: string; mealDate: string }) => {
    if (shopPrompt) {
      // Already showing one, queue this
      setShopQueue(prev => [...prev, item]);
    } else {
      setShopChecked(Object.fromEntries(item.ingredients.map((_, i) => [i, true])));
      setShopPrompt(item);
    }
  };

  useModalScrollLock(!!detailMeal || !!showAddMeal || showGoalSettings || showAiResults || !!aiConfirmSelection || !!editingMeal || !!shopPrompt);

  const groupId = activeGroup?.id || null;
  const dateStr = fmtDate(selectedDate);
  const isToday = dateStr === fmtDate(new Date());

  const hasValidSharingSelection = addMealPrivate || addMealGroupIds.length > 0 || groups.length === 0;

  const resetSharingSelection = useCallback(() => {
    setAddMealPrivate(false);
    setAddMealGroupIds([]);
  }, []);

  const applyDefaultSharingSelection = useCallback(() => {
    if (groupId) {
      setAddMealPrivate(false);
      setAddMealGroupIds([groupId]);
      return;
    }
    if (groups.length === 0) {
      setAddMealPrivate(true);
      setAddMealGroupIds([]);
      return;
    }
    setAddMealPrivate(false);
    setAddMealGroupIds([]);
  }, [groupId, groups.length]);

  const getSharingTargets = useCallback((): { valid: boolean; targets: (string | null)[] } => {
    if (addMealPrivate || groups.length === 0) {
      return { valid: true, targets: [null] };
    }

    const uniqueGroupIds = Array.from(new Set(addMealGroupIds.filter(Boolean)));
    if (uniqueGroupIds.length === 0) {
      return { valid: false, targets: [] };
    }

    return { valid: true, targets: uniqueGroupIds };
  }, [addMealPrivate, addMealGroupIds, groups.length]);

  const openAddMealModal = useCallback((mealType: string, date: string) => {
    applyDefaultSharingSelection();
    setShowAddMeal({ mealType, date });
  }, [applyDefaultSharingSelection]);

  const openAiSuggestionConfirm = useCallback((suggestion: any, index: number) => {
    applyDefaultSharingSelection();
    setAiConfirmSelection({ suggestion, index });
  }, [applyDefaultSharingSelection]);

  const createMealsForSharing = useCallback(async (mealPayload: {
    meal_date: string;
    meal_type: string;
    title: string;
    ingredients?: string[];
    prep_steps?: string[];
    protein: number;
    calories: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    is_ai_generated: boolean;
    ai_tags?: string[];
    consumed: boolean;
  }): Promise<MealLog[]> => {
    if (!user) return [];

    const sharing = getSharingTargets();
    if (!sharing.valid) {
      toast.error("Select at least one group or choose Just me.");
      return [];
    }

    const results = await Promise.all(
      sharing.targets.map((targetGroupId) =>
        supabase
          .from("meal_logs")
          .insert({
            user_id: user.id,
            group_id: targetGroupId,
            meal_date: mealPayload.meal_date,
            meal_type: mealPayload.meal_type,
            title: mealPayload.title,
            ingredients: mealPayload.ingredients || [],
            prep_steps: mealPayload.prep_steps || [],
            protein: mealPayload.protein,
            calories: mealPayload.calories,
            carbs: mealPayload.carbs || 0,
            fat: mealPayload.fat || 0,
            fiber: mealPayload.fiber || 0,
            is_ai_generated: mealPayload.is_ai_generated,
            ai_tags: mealPayload.ai_tags || [],
            consumed: mealPayload.consumed,
          })
          .select()
          .single()
      )
    );

    const insertedMeals = results.flatMap((result) => {
      if (result.error || !result.data) return [];
      return [result.data as MealLog];
    });

    if (insertedMeals.length === 0) {
      toast.error("Couldn't save meal with the selected sharing options.");
    }

    return insertedMeals;
  }, [getSharingTargets, user]);

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

      let ownMealsQuery = supabase.from("meal_logs").select("*")
        .eq("user_id", user.id)
        .gte("meal_date", startDate)
        .lte("meal_date", endDate);

      let ownSuggestionsQuery = supabase.from("ai_meal_suggestions").select("*")
        .eq("user_id", user.id)
        .gte("suggestion_date", startDate)
        .lte("suggestion_date", endDate);

      if (groupId) {
        ownMealsQuery = ownMealsQuery.eq("group_id", groupId);
        ownSuggestionsQuery = ownSuggestionsQuery.eq("group_id", groupId);
      }

      const [mealsRes, goalsRes, suggestionsRes] = await Promise.all([
        ownMealsQuery,
        (groupId
          ? supabase.from("nutrition_goals").select("*").eq("user_id", user.id).eq("group_id", groupId).maybeSingle()
          : supabase.from("nutrition_goals").select("*").eq("user_id", user.id).is("group_id", null).maybeSingle()
        ),
        ownSuggestionsQuery,
      ]);

      if (mealsRes.data) setMeals(mealsRes.data as MealLog[]);
      if (goalsRes.data) {
        const g = goalsRes.data as any;
        const enabledTrackers = Array.isArray(g.enabled_trackers) ? g.enabled_trackers : ["protein", "calories"];
        const trackerOrder = Array.isArray(g.tracker_order) ? g.tracker_order : ["protein", "calories", "carbs", "fat", "fiber"];
        setGoals({
          protein_goal: g.protein_goal || 150,
          calorie_goal: g.calorie_goal,
          carbs_goal: g.carbs_goal,
          fat_goal: g.fat_goal,
          fiber_goal: g.fiber_goal,
          show_calories: g.show_calories || false,
          enabled_trackers: enabledTrackers,
          tracker_order: trackerOrder,
        });
        setGoalProtein(String(g.protein_goal || 150));
        setGoalCalories(g.calorie_goal ? String(g.calorie_goal) : "");
        setGoalCarbs(g.carbs_goal ? String(g.carbs_goal) : "");
        setGoalFat(g.fat_goal ? String(g.fat_goal) : "");
        setGoalFiber(g.fiber_goal ? String(g.fiber_goal) : "");
        setGoalShowCal(g.show_calories || false);
        setGoalEnabledTrackers(enabledTrackers);
      }
      if (suggestionsRes.data) setSuggestions(suggestionsRes.data as MealSuggestion[]);

      if (hasOther) {
        const otherIds = activeGroup?.members
          .filter(m => m.user_id !== user.id)
          .map(m => m.user_id) || (partner ? [partner.id] : []);

        if (otherIds.length > 0) {
          let partnerMealsQuery = supabase.from("meal_logs").select("*")
            .in("user_id", otherIds)
            .gte("meal_date", startDate)
            .lte("meal_date", endDate);

          let partnerSuggestionsQuery = supabase.from("ai_meal_suggestions").select("*")
            .in("user_id", otherIds)
            .gte("suggestion_date", startDate)
            .lte("suggestion_date", endDate);

          if (groupId) {
            partnerMealsQuery = partnerMealsQuery.eq("group_id", groupId);
            partnerSuggestionsQuery = partnerSuggestionsQuery.eq("group_id", groupId);
          }

          const [pMeals, pSugg] = await Promise.all([
            partnerMealsQuery,
            partnerSuggestionsQuery,
          ]);
          if (pMeals.data) setPartnerMeals(pMeals.data as MealLog[]);
          if (pSugg.data) setPartnerSuggestions(pSugg.data as MealSuggestion[]);
        }
      }

      setLoading(false);
    };
    load();
  }, [user, rangeDates, groupId, hasOther, activeGroup, partner]);

  const scopedMeals = useMemo(
    () => (activeGroup ? meals.filter((m) => m.group_id === activeGroup.id) : meals),
    [meals, activeGroup]
  );

  const scopedPartnerMeals = useMemo(
    () => (activeGroup ? partnerMeals.filter((m) => m.group_id === activeGroup.id) : partnerMeals),
    [partnerMeals, activeGroup]
  );

  const scopedSuggestions = useMemo(
    () => (activeGroup ? suggestions.filter((s) => s.group_id === activeGroup.id) : suggestions),
    [suggestions, activeGroup]
  );

  const scopedPartnerSuggestions = useMemo(
    () => (activeGroup ? partnerSuggestions.filter((s) => s.group_id === activeGroup.id) : partnerSuggestions),
    [partnerSuggestions, activeGroup]
  );

  const displayMeals = useMemo(() => {
    if (viewFilter === "mine") return scopedMeals;
    if (viewFilter === "together") return scopedMeals;
    return scopedPartnerMeals.filter((m) => m.user_id === viewUserId);
  }, [viewFilter, scopedMeals, scopedPartnerMeals, viewUserId]);

  const displaySuggestions = useMemo(() => {
    if (viewFilter === "mine") return scopedSuggestions;
    if (viewFilter === "together") return scopedSuggestions;
    return scopedPartnerSuggestions.filter((s) => s.user_id === viewUserId);
  }, [viewFilter, scopedSuggestions, scopedPartnerSuggestions, viewUserId]);

  // Totals: only count CONSUMED meals
  const todayMeals = useMemo(() => displayMeals.filter(m => m.meal_date === dateStr), [displayMeals, dateStr]);
  const consumedMeals = useMemo(() => todayMeals.filter(m => m.consumed), [todayMeals]);
  const totalProtein = useMemo(() => consumedMeals.reduce((s, m) => s + m.protein, 0), [consumedMeals]);
  const totalCalories = useMemo(() => consumedMeals.reduce((s, m) => s + (m.calories || 0), 0), [consumedMeals]);
  const totalCarbs = useMemo(() => consumedMeals.reduce((s, m) => s + (m.carbs || 0), 0), [consumedMeals]);
  const totalFat = useMemo(() => consumedMeals.reduce((s, m) => s + (m.fat || 0), 0), [consumedMeals]);
  const totalFiber = useMemo(() => consumedMeals.reduce((s, m) => s + (m.fiber || 0), 0), [consumedMeals]);

  const trackerTotals: Record<TrackerKey, number> = { protein: totalProtein, calories: totalCalories, carbs: totalCarbs, fat: totalFat, fiber: totalFiber };
  const trackerGoals: Record<TrackerKey, number | null> = {
    protein: goals.protein_goal,
    calories: goals.calorie_goal,
    carbs: goals.carbs_goal,
    fat: goals.fat_goal,
    fiber: goals.fiber_goal,
  };

  const enabledTrackers = goals.enabled_trackers || ["protein", "calories"];
  const orderedTrackers = (goals.tracker_order || ALL_TRACKERS.map(t => t.key)).filter((k: TrackerKey) => enabledTrackers.includes(k));

  const proteinPercent = goals.protein_goal > 0 ? Math.min((totalProtein / goals.protein_goal) * 100, 100) : 0;
  const caloriePercent = goals.show_calories && goals.calorie_goal ? Math.min((totalCalories / goals.calorie_goal) * 100, 100) : 0;

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

  const addAiMealAsPlanned = async () => {
    if (!aiConfirmSelection) return;

    const { suggestion, index } = aiConfirmSelection;
    const insertedMeals = await createMealsForSharing({
      meal_date: dateStr,
      meal_type: suggestion.meal_type || "lunch",
      title: suggestion.title,
      ingredients: suggestion.ingredients || [],
      prep_steps: suggestion.prep_steps || [],
      protein: suggestion.protein || 0,
      calories: suggestion.calories || 0,
      carbs: suggestion.carbs || 0,
      fat: suggestion.fat || 0,
      fiber: suggestion.fiber || 0,
      is_ai_generated: true,
      ai_tags: suggestion.tags || [],
      consumed: false,
    });

    if (insertedMeals.length === 0) return;

    setMeals((prev) => [...prev, ...insertedMeals]);
    setAiResults((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setShowAiResults(false);
      return next;
    });
    setAiConfirmSelection(null);
    resetSharingSelection();
    toast.success(`${suggestion.title} added to planned meals!`);

    const ingredients = Array.isArray(suggestion.ingredients) ? suggestion.ingredients : [];
    if (ingredients.length > 0) {
      enqueueShopPrompt({ ingredients, mealTitle: suggestion.title, mealDate: dateStr });
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

  // Log manual meal as planned (consumed=false) — now respects shared-with group selection
  const logManualMeal = async (mealType: string, targetDate?: string) => {
    if (!user || !manualTitle.trim()) return;
    const mealDate = targetDate || dateStr;

    const insertedMeals = await createMealsForSharing({
      meal_date: mealDate,
      meal_type: mealType,
      title: manualTitle.trim(),
      protein: parseInt(manualProtein) || 0,
      calories: parseInt(manualCalories) || 0,
      carbs: parseInt(manualCarbs) || 0,
      fat: parseInt(manualFat) || 0,
      fiber: parseInt(manualFiber) || 0,
      is_ai_generated: false,
      consumed: false,
    });

    if (insertedMeals.length > 0) {
      setMeals((prev) => [...prev, ...insertedMeals]);
      setShowAddMeal(null);
      setManualTitle("");
      setManualProtein("");
      setManualCalories("");
      setManualCarbs("");
      setManualFat("");
      setManualFiber("");
      setManualFoodText("");
      resetSharingSelection();
      toast.success("Meal added to plan!");
    }
  };

  // Load frequent meals
  useEffect(() => {
    if (!user) return;
    const loadFrequent = async () => {
      const { data } = await supabase
        .from("meal_logs")
        .select("title, protein, calories, carbs, fat, fiber, meal_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!data) return;
      const counts: Record<string, { title: string; protein: number; calories: number; carbs: number; fat: number; fiber: number; meal_type: string; count: number }> = {};
      for (const m of data) {
        const key = m.title.toLowerCase().trim();
        if (counts[key]) {
          counts[key].count++;
        } else {
          counts[key] = { title: m.title, protein: m.protein, calories: m.calories || 0, carbs: (m as any).carbs || 0, fat: (m as any).fat || 0, fiber: (m as any).fiber || 0, meal_type: m.meal_type, count: 1 };
        }
      }
      const sorted = Object.values(counts).filter(c => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);
      setFrequentMeals(sorted);
    };
    loadFrequent();
  }, [user, meals.length]);

  // Quick add from suggestion/frequent
  const quickAddMeal = async (item: { title: string; protein: number; calories: number; carbs?: number; fat?: number; fiber?: number; meal_type: string }) => {
    if (!user) return;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: dateStr,
      meal_type: item.meal_type || "snack",
      title: item.title,
      protein: item.protein || 0,
      calories: item.calories || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      fiber: item.fiber || 0,
      is_ai_generated: false,
      consumed: false,
    }).select().single();
    if (!error && data) {
      setMeals(prev => [...prev, data as MealLog]);
      toast.success(`${item.title} added!`);
    }
  };

  const deleteMeal = async (mealId: string) => {
    await supabase.from("meal_logs").delete().eq("id", mealId);
    setMeals(prev => prev.filter(m => m.id !== mealId));
    setDetailMeal(null);
    setEditingMeal(null);
    toast.success("Meal removed");
  };

  const openEditMeal = (meal: MealLog) => {
    setEditingMeal(meal);
    setEditTitle(meal.title);
    setEditProtein(String(meal.protein));
    setEditCalories(String(meal.calories || 0));
    setEditCarbs(String(meal.carbs || 0));
    setEditFat(String(meal.fat || 0));
    setEditFiber(String(meal.fiber || 0));
    setEditMealType(meal.meal_type);
    setDetailMeal(null);
    setMealMenuOpen(null);
  };

  const saveEditMeal = async () => {
    if (!editingMeal || !editTitle.trim()) return;
    const updates = {
      title: editTitle.trim(),
      protein: parseInt(editProtein) || 0,
      calories: parseInt(editCalories) || 0,
      carbs: parseInt(editCarbs) || 0,
      fat: parseInt(editFat) || 0,
      fiber: parseInt(editFiber) || 0,
      meal_type: editMealType,
    };
    const { error } = await supabase.from("meal_logs").update(updates).eq("id", editingMeal.id);
    if (!error) {
      setMeals(prev => prev.map(m => m.id === editingMeal.id ? { ...m, ...updates } : m));
      setEditingMeal(null);
      toast.success("Meal updated");
    }
  };

  // Helper: get Monday of the week for a given date string (YYYY-MM-DD)
  const getWeekMonday = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    const mon = new Date(d);
    mon.setDate(mon.getDate() + diff);
    return fmtDate(mon);
  };

  const getWeekSunday = (mondayStr: string) => {
    const d = new Date(mondayStr + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return fmtDate(d);
  };

  const saveToShoppingList = async () => {
    if (!user || !shopPrompt) return;
    setShopSaving(true);
    const selectedItems = shopPrompt.ingredients.filter((_, i) => shopChecked[i]);
    if (selectedItems.length === 0) {
      toast.info("No items selected");
      dismissShopPrompt();
      setShopSaving(false);
      return;
    }

    // Find or create the weekly Mon-Sun shopping list card
    const weekStart = getWeekMonday(shopPrompt.mealDate);
    const weekEnd = getWeekSunday(weekStart);
    const monDate = new Date(weekStart + "T00:00:00");
    const sunDate = new Date(weekEnd + "T00:00:00");
    const weekLabel = `Week of ${monDate.getMonth() + 1}/${monDate.getDate()} (Mon) – ${sunDate.getMonth() + 1}/${sunDate.getDate()} (Sun)`;

    // Check if a weekly list already exists for this week
    let listQuery = supabase.from("shopping_lists").select("*")
      .eq("user_id", user.id)
      .eq("is_meal_plan", true)
      .eq("date_range_start", weekStart)
      .eq("date_range_end", weekEnd);
    if (groupId) listQuery = listQuery.eq("group_id", groupId);

    const { data: existingLists } = await listQuery;
    let listId: string;

    if (existingLists && existingLists.length > 0) {
      listId = existingLists[0].id;
    } else {
      const insertData: any = {
        user_id: user.id,
        group_id: groupId,
        label: weekLabel,
        date_range_start: weekStart,
        date_range_end: weekEnd,
        is_meal_plan: true,
      };
      const { data: listData, error: listErr } = await supabase.from("shopping_lists").insert(insertData).select().single();
      if (listErr || !listData) {
        toast.error("Failed to create shopping list");
        setShopSaving(false);
        return;
      }
      listId = (listData as any).id;
    }

    // Fetch existing items in this weekly list to avoid duplicates
    const { data: existingItems } = await supabase.from("shopping_list_items").select("*").eq("list_id", listId);
    const existingNames = new Set((existingItems || []).map((it: any) => (it.name as string).toLowerCase().trim()));

    // Only add items not already in the list
    const newItems = selectedItems.filter(name => !existingNames.has(name.toLowerCase().trim()));
    if (newItems.length > 0) {
      const rows = newItems.map(name => ({ list_id: listId, user_id: user.id, name }));
      await supabase.from("shopping_list_items").insert(rows);
    }

    toast.success(existingLists && existingLists.length > 0 ? "Items added to weekly shopping list!" : "Weekly shopping list created!");
    dismissShopPrompt();
    setShopSaving(false);
  };

  const saveGoals = async () => {
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      group_id: groupId,
      protein_goal: parseInt(goalProtein) || 150,
      calorie_goal: goalCalories ? parseInt(goalCalories) : null,
      carbs_goal: goalCarbs ? parseInt(goalCarbs) : null,
      fat_goal: goalFat ? parseInt(goalFat) : null,
      fiber_goal: goalFiber ? parseInt(goalFiber) : null,
      show_calories: goalEnabledTrackers.includes("calories"),
      enabled_trackers: goalEnabledTrackers,
      tracker_order: goals.tracker_order,
    };
    const { error } = await supabase.from("nutrition_goals").upsert(payload, { onConflict: "user_id,group_id" });
    if (!error) {
      setGoals({
        protein_goal: payload.protein_goal,
        calorie_goal: payload.calorie_goal,
        carbs_goal: payload.carbs_goal,
        fat_goal: payload.fat_goal,
        fiber_goal: payload.fiber_goal,
        show_calories: payload.show_calories,
        enabled_trackers: goalEnabledTrackers,
        tracker_order: goals.tracker_order,
      });
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
      if (parsed.carbs) setManualCarbs(String(parsed.carbs));
      if (parsed.fat) setManualFat(String(parsed.fat));
      if (parsed.fiber) setManualFiber(String(parsed.fiber));
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
      if (parsed.carbs) setManualCarbs(String(parsed.carbs));
      if (parsed.fat) setManualFat(String(parsed.fat));
      if (parsed.fiber) setManualFiber(String(parsed.fiber));
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

  const partnerTodayMeals = useMemo(() => scopedPartnerMeals.filter(m => m.meal_date === dateStr), [scopedPartnerMeals, dateStr]);
  const partnerConsumed = useMemo(() => partnerTodayMeals.filter(m => m.consumed), [partnerTodayMeals]);
  const partnerTotalProtein = useMemo(() => partnerConsumed.reduce((s, m) => s + m.protein, 0), [partnerConsumed]);

  return (
    <div className="flex flex-col min-h-full px-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Apple size={24} className="text-primary" /> Nutrition
        </h1>
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-secondary">
            <Settings size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Group Selector */}
      <GroupSelector />

      {/* Mine / Other User / Together Toggle */}
      {viewTabs.length > 1 && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5 overflow-x-auto scrollbar-hide">
          {viewTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewFilter(tab.id)}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                viewFilter === tab.id
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Quick actions: Goals + Date Ranges */}
      <div className="pb-2">
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
        <div className="flex items-center justify-between py-1">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft size={18} /></button>
          <button onClick={() => setSelectedDate(new Date())} className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            {isToday ? "Today" : dateLabel}
          </button>
          <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-secondary"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Tracker progress */}
      {!isTogether && (
        <div className="mb-2 mt-1">
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            {orderedTrackers.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily Trackers</span>
                  <button
                    onClick={() => setShowGoalSettings(true)}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                    title="Customize Trackers"
                  >
                    <Settings size={14} className="text-muted-foreground" />
                  </button>
                </div>
                {orderedTrackers.map((key: TrackerKey) => {
                  const info = ALL_TRACKERS.find(t => t.key === key)!;
                  const total = trackerTotals[key] || 0;
                  const goal = trackerGoals[key];
                  if (!goal && goal !== 0) return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{info.label}</span>
                      <span className="text-sm font-bold" style={{ color: info.color }}>{total}{info.unit}</span>
                    </div>
                  );
                  const pct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{info.label}</span>
                        <span className="text-sm font-bold" style={{ color: info.color }}>{total}{info.unit} / {goal}{info.unit}</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: info.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 gap-2">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <Target size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No trackers selected</p>
                <p className="text-xs text-muted-foreground text-center">Choose which nutrition metrics to track</p>
                <button
                  onClick={() => setShowGoalSettings(true)}
                  className="mt-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  <Settings size={12} /> Customize Trackers
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Together View */}
      {isTogether && (
        <div className="mb-3 mt-1">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{profile?.display_name || "Me"}</p>
              <p className="text-xl font-bold text-primary">{totalProtein}g protein</p>
              <Progress value={proteinPercent} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{consumedMeals.length} consumed</p>
            </div>
            <div className="bg-card rounded-2xl p-3.5 shadow-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{otherName}</p>
              <p className="text-xl font-bold text-primary">{partnerTotalProtein}g protein</p>
              <Progress value={goals.protein_goal > 0 ? Math.min((partnerTotalProtein / goals.protein_goal) * 100, 100) : 0} className="h-2 mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1.5">{partnerConsumed.length} consumed</p>
            </div>
          </div>
        </div>
      )}

      {/* AI insight */}
      {isViewingOwn && (
        <div className="mb-3">
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
      <div className="flex-1 overflow-y-auto pb-24">
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
                      onClick={() => openAddMealModal("snack", dateStr)}
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
                              <p className="text-xs font-bold text-primary">{meal.protein}g prot</p>
                              <p className="text-[10px] text-muted-foreground">{meal.calories} kcal{meal.carbs ? ` · ${meal.carbs}g C` : ""}{meal.fat ? ` · ${meal.fat}g F` : ""}</p>
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
                                    onClick={() => openEditMeal(meal)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Pencil size={14} /> Edit
                                  </button>
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

            {/* ───── Quick Suggestions / Frequent Items ───── */}
            {isViewingOwn && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meal Ideas</h2>
                </div>
                <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-3">
                  <button
                    onClick={() => setMealIdeasTab("suggestions")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                      mealIdeasTab === "suggestions"
                        ? "bg-card text-foreground shadow-card"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Zap size={12} /> Quick Suggestions
                  </button>
                  <button
                    onClick={() => setMealIdeasTab("frequent")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                      mealIdeasTab === "frequent"
                        ? "bg-card text-foreground shadow-card"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Clock size={12} /> Frequent Items
                  </button>
                </div>

                {mealIdeasTab === "suggestions" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { title: "Greek Yogurt Bowl", protein: 20, calories: 250, carbs: 30, fat: 8, fiber: 3, meal_type: "breakfast" },
                      { title: "Chicken Rice Bowl", protein: 35, calories: 450, carbs: 45, fat: 12, fiber: 4, meal_type: "lunch" },
                      { title: "Turkey Lettuce Wraps", protein: 28, calories: 280, carbs: 12, fat: 14, fiber: 3, meal_type: "lunch" },
                      { title: "Protein Smoothie", protein: 30, calories: 320, carbs: 35, fat: 6, fiber: 5, meal_type: "snack" },
                      { title: "Salmon & Veggies", protein: 32, calories: 380, carbs: 15, fat: 18, fiber: 6, meal_type: "dinner" },
                      { title: "Egg White Omelette", protein: 24, calories: 200, carbs: 4, fat: 8, fiber: 1, meal_type: "breakfast" },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => quickAddMeal(item)}
                        className="bg-card rounded-xl p-3 border border-border hover:border-primary/30 transition-colors text-left"
                      >
                        <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold text-primary">{item.protein}g P</span>
                          <span className="text-[10px] text-muted-foreground">{item.calories} kcal</span>
                          {item.carbs > 0 && <span className="text-[10px] text-muted-foreground">{item.carbs}g C</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Plus size={10} className="text-primary" />
                          <span className="text-[9px] text-primary font-medium">Quick add</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {frequentMeals.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {frequentMeals.map((item, i) => (
                          <button
                            key={i}
                            onClick={() => quickAddMeal(item)}
                            className="bg-card rounded-xl p-3 border border-border hover:border-primary/30 transition-colors text-left"
                          >
                            <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] font-bold text-primary">{item.protein}g P</span>
                              <span className="text-[10px] text-muted-foreground">{item.calories} kcal</span>
                              {item.carbs > 0 && <span className="text-[10px] text-muted-foreground">{item.carbs}g C</span>}
                            </div>
                            <div className="flex items-center gap-1 mt-1.5">
                              <span className="text-[9px] text-muted-foreground">Added {item.count}×</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-card rounded-xl p-4 border border-dashed border-border text-center">
                        <p className="text-xs text-muted-foreground">Add meals a few times and they'll appear here for quick re-adding.</p>
                      </div>
                    )}
                  </div>
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
            partnerMeals={scopedPartnerMeals}
            onDetailMeal={setDetailMeal}
            onAddMeal={openAddMealModal}
            aiLoading={aiLoading}
            onGenerate={generateSuggestions}
            onToggleConsumed={toggleConsumed}
            otherName={otherName}
            profile={profile}
          />
        )}
      </div>

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
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mb-3">
                      <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold text-primary">{s.protein || 0}g</p>
                        <p className="text-[8px] text-muted-foreground">Protein</p>
                      </div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{s.calories || 0}</p>
                        <p className="text-[8px] text-muted-foreground">Cal</p>
                      </div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{s.carbs || 0}g</p>
                        <p className="text-[8px] text-muted-foreground">Carbs</p>
                      </div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{s.fat || 0}g</p>
                        <p className="text-[8px] text-muted-foreground">Fat</p>
                      </div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                        <p className="text-xs font-bold">{s.fiber || 0}g</p>
                        <p className="text-[8px] text-muted-foreground">Fiber</p>
                      </div>
                    </div>
                    {s.ingredients && s.ingredients.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">
                        {(s.ingredients as string[]).join(", ")}
                      </p>
                    )}
                    <button
                      onClick={() => openAiSuggestionConfirm(s, idx)}
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

      {/* ───── AI Sharing Confirmation Modal ───── */}
      <AnimatePresence>
        {aiConfirmSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => setAiConfirmSelection(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} className="text-primary" /> Confirm AI Meal</h3>
                <button onClick={() => setAiConfirmSelection(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 pb-6 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
                <div className="bg-background rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold mb-2">{aiConfirmSelection.suggestion.title}</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-bold text-primary">{aiConfirmSelection.suggestion.protein || 0}g</p>
                      <p className="text-[8px] text-muted-foreground">Protein</p>
                    </div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-bold">{aiConfirmSelection.suggestion.calories || 0}</p>
                      <p className="text-[8px] text-muted-foreground">Cal</p>
                    </div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-bold">{aiConfirmSelection.suggestion.carbs || 0}g</p>
                      <p className="text-[8px] text-muted-foreground">Carbs</p>
                    </div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-bold">{aiConfirmSelection.suggestion.fat || 0}g</p>
                      <p className="text-[8px] text-muted-foreground">Fat</p>
                    </div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-bold">{aiConfirmSelection.suggestion.fiber || 0}g</p>
                      <p className="text-[8px] text-muted-foreground">Fiber</p>
                    </div>
                  </div>
                </div>

                <SharedWithSelector
                  groups={groups}
                  isPrivate={addMealPrivate}
                  selectedGroupIds={addMealGroupIds}
                  onPrivateChange={setAddMealPrivate}
                  onGroupIdsChange={setAddMealGroupIds}
                  showValidationError={!hasValidSharingSelection}
                />

                <button
                  onClick={addAiMealAsPlanned}
                  disabled={!hasValidSharingSelection}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  Add to Plan
                </button>
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
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0"
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
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-primary/10 rounded-xl px-3 py-2 text-center">
                    <p className="text-lg font-bold text-primary">{detailMeal.protein}g</p>
                    <p className="text-[10px] text-muted-foreground">Protein</p>
                  </div>
                  <div className="bg-secondary rounded-xl px-3 py-2 text-center">
                    <p className="text-lg font-bold">{detailMeal.calories}</p>
                    <p className="text-[10px] text-muted-foreground">Calories</p>
                  </div>
                  {(detailMeal.carbs > 0 || detailMeal.fat > 0 || detailMeal.fiber > 0) && (
                    <>
                      <div className="bg-secondary rounded-xl px-3 py-2 text-center">
                        <p className="text-base font-bold">{detailMeal.carbs || 0}g</p>
                        <p className="text-[10px] text-muted-foreground">Carbs</p>
                      </div>
                      <div className="bg-secondary rounded-xl px-3 py-2 text-center">
                        <p className="text-base font-bold">{detailMeal.fat || 0}g</p>
                        <p className="text-[10px] text-muted-foreground">Fat</p>
                      </div>
                      {detailMeal.fiber > 0 && (
                        <div className="bg-secondary rounded-xl px-3 py-2 text-center col-span-2">
                          <p className="text-base font-bold">{detailMeal.fiber}g</p>
                          <p className="text-[10px] text-muted-foreground">Fiber</p>
                        </div>
                      )}
                    </>
                  )}
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
                        onClick={() => openEditMeal(detailMeal as MealLog)}
                        className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
                      >
                        <Pencil size={16} /> Edit Meal
                      </button>
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

                <SharedWithSelector
                  groups={groups}
                  isPrivate={addMealPrivate}
                  selectedGroupIds={addMealGroupIds}
                  onPrivateChange={setAddMealPrivate}
                  onGroupIdsChange={setAddMealGroupIds}
                  showValidationError={!hasValidSharingSelection}
                />

                <div className="space-y-3 pb-4">
                  <input
                    value={manualTitle}
                    onChange={e => setManualTitle(e.target.value)}
                    placeholder="Meal name"
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label>
                      <input type="number" value={manualProtein} onChange={e => setManualProtein(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label>
                      <input type="number" value={manualCalories} onChange={e => setManualCalories(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Carbs (g)</label>
                      <input type="number" value={manualCarbs} onChange={e => setManualCarbs(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fat (g)</label>
                      <input type="number" value={manualFat} onChange={e => setManualFat(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fiber (g)</label>
                      <input type="number" value={manualFiber} onChange={e => setManualFiber(e.target.value)} placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                    </div>
                  </div>
                  <button
                    onClick={() => logManualMeal(showAddMeal.mealType, showAddMeal.date)}
                    disabled={!manualTitle.trim() || !hasValidSharingSelection}
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

      {/* ───── Edit Meal Modal ───── */}
      <AnimatePresence>
        {editingMeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center"
            style={{ touchAction: "none" }}
            onClick={() => setEditingMeal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2"><Pencil size={18} className="text-primary" /> Edit Meal</h3>
                <button onClick={() => setEditingMeal(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 pb-6 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
                {/* Meal type selector */}
                <div className="flex gap-1.5">
                  {MEAL_TYPES.map(mt => (
                    <button
                      key={mt.key}
                      onClick={() => setEditMealType(mt.key)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${
                        editMealType === mt.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {mt.icon} {mt.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Meal Name</label>
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label>
                    <input type="number" value={editProtein} onChange={e => setEditProtein(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label>
                    <input type="number" value={editCalories} onChange={e => setEditCalories(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Carbs (g)</label>
                    <input type="number" value={editCarbs} onChange={e => setEditCarbs(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fat (g)</label>
                    <input type="number" value={editFat} onChange={e => setEditFat(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fiber (g)</label>
                    <input type="number" value={editFiber} onChange={e => setEditFiber(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
                  </div>
                </div>
                <button
                  onClick={saveEditMeal}
                  disabled={!editTitle.trim()}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  Save Changes
                </button>
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
                  <p className="text-xs text-muted-foreground">Toggle trackers on/off and set daily goals.</p>
                  {ALL_TRACKERS.map(tracker => {
                    const isEnabled = goalEnabledTrackers.includes(tracker.key);
                    const goalValue = tracker.key === "protein" ? goalProtein : tracker.key === "calories" ? goalCalories : tracker.key === "carbs" ? goalCarbs : tracker.key === "fat" ? goalFat : goalFiber;
                    const setGoalValue = tracker.key === "protein" ? setGoalProtein : tracker.key === "calories" ? setGoalCalories : tracker.key === "carbs" ? setGoalCarbs : tracker.key === "fat" ? setGoalFat : setGoalFiber;
                    return (
                      <div key={tracker.key} className="bg-background rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tracker.color }} />
                            <span className="text-sm font-semibold">{tracker.label}</span>
                          </div>
                          <button
                            onClick={() => {
                              setGoalEnabledTrackers(prev =>
                                prev.includes(tracker.key)
                                  ? prev.filter(k => k !== tracker.key)
                                  : [...prev, tracker.key]
                              );
                            }}
                            className={`w-12 h-7 rounded-full transition-colors relative ${isEnabled ? "bg-primary" : "bg-secondary"}`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-card shadow absolute top-1 transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {isEnabled && (
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Daily Goal ({tracker.unit})</label>
                            <input
                              type="number"
                              value={goalValue}
                              onChange={e => setGoalValue(e.target.value)}
                              placeholder={String(tracker.defaultGoal)}
                              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
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

      {/* Shopping list prompt after AI Suggest add */}
      <AnimatePresence>
        {shopPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40 flex items-end justify-center"
            onClick={() => dismissShopPrompt()}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-t-2xl max-h-[75dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 px-5 pt-5 pb-3">
                <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
                <h3 className="text-base font-bold text-foreground">🛒 Add to Shopping List?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Uncheck items you already have at home. The rest will be added to your Shopping List.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
                {shopPrompt.ingredients.map((ing, i) => (
                  <label key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0 cursor-pointer">
                    <button
                      onClick={() => setShopChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        shopChecked[i]
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {shopChecked[i] && <Check size={12} className="text-primary-foreground" />}
                    </button>
                    <span className={`text-sm ${shopChecked[i] ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {ing}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex-shrink-0 px-5 pb-6 pt-3 flex gap-2">
                <button
                  onClick={() => dismissShopPrompt()}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold"
                >
                  Skip
                </button>
                <button
                  onClick={saveToShoppingList}
                  disabled={shopSaving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {shopSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Add to Shopping List
                </button>
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

interface SharedWithSelectorProps {
  groups: Group[];
  isPrivate: boolean;
  selectedGroupIds: string[];
  onPrivateChange: (value: boolean) => void;
  onGroupIdsChange: (groupIds: string[]) => void;
  showValidationError?: boolean;
}

function SharedWithSelector({
  groups,
  isPrivate,
  selectedGroupIds,
  onPrivateChange,
  onGroupIdsChange,
  showValidationError = false,
}: SharedWithSelectorProps) {
  const toggleGroup = (groupId: string) => {
    onPrivateChange(false);
    onGroupIdsChange(
      selectedGroupIds.includes(groupId)
        ? selectedGroupIds.filter((id) => id !== groupId)
        : [...selectedGroupIds, groupId]
    );
  };

  return (
    <div className="mb-4">
      <label className="text-[10px] font-semibold text-muted-foreground mb-2 block flex items-center gap-1">
        <Users size={10} /> Shared With
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            onPrivateChange(true);
            onGroupIdsChange([]);
          }}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
            isPrivate
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
          }`}
        >
          🔒 Just me
        </button>

        {groups.map((g) => {
          const isSelected = !isPrivate && selectedGroupIds.includes(g.id);
          return (
            <button
              key={g.id}
              onClick={() => toggleGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              {g.emoji} {g.name}
            </button>
          );
        })}
      </div>

      {showValidationError && (
        <p className="text-[10px] text-destructive mt-1.5">Select at least one group or choose Just me.</p>
      )}
    </div>
  );
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
