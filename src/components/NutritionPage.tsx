import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Plus, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Check, X, Loader2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
}

interface MealSuggestion {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  ingredients: string[];
  prep_steps: string[];
}

interface NutritionGoals {
  protein_goal: number;
  calorie_goal: number | null;
  show_calories: boolean;
}

const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast", icon: "🌅", time: "Morning" },
  { key: "lunch", label: "Lunch", icon: "☀️", time: "Midday" },
  { key: "dinner", label: "Dinner", icon: "🌙", time: "Evening" },
  { key: "snack", label: "Snacks", icon: "🍎", time: "Anytime" },
];

const NutritionPage = ({ onOpenSettings }: { onOpenSettings?: () => void }) => {
  const { user, activeGroup } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ protein_goal: 150, calorie_goal: null, show_calories: false });
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [detailMeal, setDetailMeal] = useState<MealLog | MealSuggestion | null>(null);
  const [showAddMeal, setShowAddMeal] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [goalProtein, setGoalProtein] = useState("150");
  const [goalCalories, setGoalCalories] = useState("");
  const [goalShowCal, setGoalShowCal] = useState(false);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [manualFoodText, setManualFoodText] = useState("");

  const dateStr = fmtDate(selectedDate);
  const groupId = activeGroup?.id || null;

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [mealsRes, goalsRes, suggestionsRes] = await Promise.all([
        supabase.from("meal_logs").select("*").eq("user_id", user.id).eq("meal_date", dateStr)
          .then(r => ({ data: r.data })),
        supabase.from("nutrition_goals").select("*").eq("user_id", user.id)
          .then(r => {
            if (groupId) return supabase.from("nutrition_goals").select("*").eq("user_id", user.id).eq("group_id", groupId).maybeSingle();
            return supabase.from("nutrition_goals").select("*").eq("user_id", user.id).is("group_id", null).maybeSingle();
          }),
        supabase.from("ai_meal_suggestions").select("*").eq("user_id", user.id).eq("suggestion_date", dateStr)
          .then(r => ({ data: r.data })),
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
      setLoading(false);
    };
    load();
  }, [user, dateStr, groupId]);

  const totalProtein = useMemo(() => meals.reduce((s, m) => s + m.protein, 0), [meals]);
  const totalCalories = useMemo(() => meals.reduce((s, m) => s + m.calories, 0), [meals]);
  const proteinPercent = goals.protein_goal > 0 ? Math.min((totalProtein / goals.protein_goal) * 100, 100) : 0;

  // AI insight
  const aiInsight = useMemo(() => {
    if (meals.length === 0) return "Log your first meal to get personalized nutrition insights.";
    const remaining = goals.protein_goal - totalProtein;
    if (remaining <= 0) return "🎉 You've hit your protein goal! Great job today.";
    if (remaining <= 30) return `Almost there! Just ${remaining}g of protein left. A quick snack should do it.`;
    const mealsLogged = new Set(meals.map(m => m.meal_type));
    if (!mealsLogged.has("breakfast")) return "Don't skip breakfast — it's the easiest way to front-load protein.";
    if (!mealsLogged.has("lunch") && !mealsLogged.has("dinner")) return `${remaining}g of protein left. Try a high-protein lunch or dinner.`;
    return `${remaining}g of protein remaining. Keep it up!`;
  }, [meals, goals, totalProtein]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

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
          meals_logged: meals.map(m => ({ type: m.meal_type, title: m.title, protein: m.protein })),
          recent_history: recentMeals.data || [],
          date: dateStr,
        },
      });
      if (error) throw error;

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.suggestions) {
        // Save suggestions to DB
        const toInsert = parsed.suggestions.map((s: any) => ({
          user_id: user.id,
          group_id: groupId,
          suggestion_date: dateStr,
          meal_type: s.meal_type || "lunch",
          title: s.title,
          ingredients: s.ingredients || [],
          prep_steps: s.prep_steps || [],
          protein: s.protein || 0,
          calories: s.calories || 0,
          tags: s.tags || [],
        }));

        // Clear old suggestions for this date
        await supabase.from("ai_meal_suggestions").delete().eq("user_id", user.id).eq("suggestion_date", dateStr);
        const { data: inserted } = await supabase.from("ai_meal_suggestions").insert(toInsert).select();
        if (inserted) setSuggestions(inserted as MealSuggestion[]);
        toast.success("Meal suggestions updated!");
      }
    } catch (e: any) {
      console.error("AI nutrition error:", e);
      toast.error("Couldn't generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const logMealFromSuggestion = async (suggestion: MealSuggestion) => {
    if (!user) return;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: dateStr,
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

  const logManualMeal = async (mealType: string) => {
    if (!user || !manualTitle.trim()) return;
    const { data, error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      group_id: groupId,
      meal_date: dateStr,
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
      toast.success(`${manualTitle} logged!`);
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

  const isToday = dateStr === fmtDate(new Date());
  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Apple size={24} className="text-primary" /> Nutrition
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGoalSettings(true)} className="p-2 rounded-full hover:bg-secondary">
            <Settings size={18} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center justify-between px-5 py-2">
        <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft size={18} /></button>
        <button onClick={() => setSelectedDate(new Date())} className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
          {isToday ? "Today" : dateLabel}
        </button>
        <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-secondary"><ChevronRight size={18} /></button>
      </div>

      {/* Protein progress */}
      <div className="px-5 mb-2">
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

      {/* AI insight */}
      <div className="px-5 mb-4">
        <div className="bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-foreground/80">{aiInsight}</p>
          </div>
        </div>
      </div>

      {/* Today's Meals */}
      <div className="px-5 mb-4">
        <h2 className="text-base font-semibold mb-3">{isToday ? "Today's Meals" : `Meals — ${dateLabel}`}</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {MEAL_TYPES.map((mt) => {
            const logged = meals.filter(m => m.meal_type === mt.key);
            const totalP = logged.reduce((s, m) => s + m.protein, 0);
            return (
              <button
                key={mt.key}
                onClick={() => logged.length > 0 ? setDetailMeal(logged[0]) : setShowAddMeal(mt.key)}
                className="bg-card rounded-xl p-3.5 shadow-card border border-border text-left hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{mt.icon}</span>
                  <span className="text-sm font-semibold">{mt.label}</span>
                </div>
                {logged.length > 0 ? (
                  <>
                    <p className="text-xs font-medium truncate">{logged.map(m => m.title).join(", ")}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-bold text-primary">{totalP}g protein</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Check size={10} /> Logged</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">{mt.time}</p>
                    <div className="flex items-center gap-1 mt-1.5 text-primary">
                      <Plus size={12} />
                      <span className="text-[10px] font-semibold">Add Meal</span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="px-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-primary" /> AI Suggestions
          </h2>
          <button
            onClick={generateSuggestions}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {suggestions.length > 0 ? "Regenerate" : "Generate"}
          </button>
        </div>
        {suggestions.length > 0 ? (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => setDetailMeal(s)}
                className="w-full bg-card rounded-xl p-3 shadow-card border border-border text-left hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{s.meal_type}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-bold text-primary">{s.protein}g</p>
                    <p className="text-[10px] text-muted-foreground">{s.calories} kcal</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-xs text-muted-foreground">Tap Generate to get personalized high-protein meal ideas</p>
          </div>
        )}
      </div>

      {/* Meal Detail Modal */}
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
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[80svh] overflow-y-auto"
            >
              <div className="px-5 pt-5 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">{detailMeal.title}</h3>
                  <button onClick={() => setDetailMeal(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>
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

                <div className="flex gap-2 mt-4">
                  {"id" in detailMeal && !("meal_date" in detailMeal) && (
                    <button
                      onClick={() => logMealFromSuggestion(detailMeal as MealSuggestion)}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Log This Meal
                    </button>
                  )}
                  {"meal_date" in detailMeal && (
                    <button
                      onClick={() => deleteMeal((detailMeal as MealLog).id)}
                      className="flex-1 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
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
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg"
            >
              <div className="px-5 pt-5 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold capitalize">Add {showAddMeal}</h3>
                  <button onClick={() => { setShowAddMeal(null); setManualFoodText(""); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>

                {/* AI Estimate Section */}
                <div className="mb-4 bg-primary/5 rounded-xl p-3 border border-primary/10">
                  <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5"><Sparkles size={12} /> AI Estimate</p>
                  <div className="flex gap-2">
                    <input
                      value={manualFoodText}
                      onChange={e => setManualFoodText(e.target.value)}
                      placeholder="e.g. grilled chicken salad with rice"
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

                <div className="space-y-3">
                  <input
                    value={manualTitle}
                    onChange={e => setManualTitle(e.target.value)}
                    placeholder="Meal name"
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label>
                      <input
                        type="number"
                        value={manualProtein}
                        onChange={e => setManualProtein(e.target.value)}
                        placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label>
                      <input
                        type="number"
                        value={manualCalories}
                        onChange={e => setManualCalories(e.target.value)}
                        placeholder="0"
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => logManualMeal(showAddMeal)}
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
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg"
            >
              <div className="px-5 pt-5 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Nutrition Goals</h3>
                  <button onClick={() => setShowGoalSettings(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Daily Protein Goal (g)</label>
                    <input
                      type="number"
                      value={goalProtein}
                      onChange={e => setGoalProtein(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background"
                    />
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
                      <input
                        type="number"
                        value={goalCalories}
                        onChange={e => setGoalCalories(e.target.value)}
                        placeholder="2000"
                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background"
                      />
                    </div>
                  )}
                  <button
                    onClick={saveGoals}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
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

export default NutritionPage;
