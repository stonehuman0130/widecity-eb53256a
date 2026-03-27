import { useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Workout } from "@/context/AppContext";
import { toast } from "sonner";

interface AISuggestion {
  title: string;
  emoji: string;
  duration: string;
  cal: number;
  tag: string;
  exercises: { name: string; sets: number; reps: string }[];
}

interface Props {
  selectedDate: string;
  recentWorkouts: Workout[];
  onAddWorkout: (workouts: Workout[]) => void;
}

const WorkoutAiSuggest = ({ selectedDate, recentWorkouts, onAddWorkout }: Props) => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[] | null>(null);

  const generate = async () => {
    setLoading(true);
    setSuggestions(null);

    const recentTitles = recentWorkouts
      .filter((w) => w.done)
      .slice(-10)
      .map((w) => w.title);

    const prompt = recentTitles.length > 0
      ? `Suggest 4 different workout options for today. The user recently did: ${recentTitles.join(", ")}. Vary the muscle groups to avoid overtraining. Each workout should have 3-5 exercises.`
      : `Suggest 4 different workout options for today. Include a mix of upper body, lower body, cardio, and full body. Each workout should have 3-5 exercises.`;

    try {
      const { data, error } = await supabase.functions.invoke("ai-workout", {
        body: { prompt, planType: "suggest", startDate: selectedDate },
      });

      if (error) throw error;

      // The ai-workout function may return different structures
      let parsed: AISuggestion[] = [];
      if (data?.workouts) {
        parsed = data.workouts;
      } else if (Array.isArray(data)) {
        parsed = data;
      } else if (data?.plan && Array.isArray(data.plan)) {
        parsed = data.plan.filter((d: any) => d.workout).map((d: any) => d.workout);
      }

      if (parsed.length === 0) {
        toast.error("Could not generate suggestions. Try again.");
      } else {
        setSuggestions(parsed.slice(0, 4));
      }
    } catch (e) {
      console.error("AI suggest error:", e);
      toast.error("Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  };

  const selectSuggestion = (s: AISuggestion) => {
    const newWorkout: Workout = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: s.title,
      duration: s.duration,
      cal: s.cal,
      tag: s.tag,
      emoji: s.emoji,
      done: false,
      scheduledDate: selectedDate,
      exercises: s.exercises,
    };
    onAddWorkout([newWorkout]);
    toast.success(`Added ${s.title}`);
    setSuggestions(null);
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        title="AI workout suggestions"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        AI
      </button>

      {suggestions && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setSuggestions(null)}
            aria-label="Close suggestions"
          />
          <div className="absolute right-0 top-8 z-50 w-72 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="p-3 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground">AI Suggestions</p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary transition-colors border-b border-border last:border-0"
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.duration} · {s.cal} cal · {s.exercises?.length || 0} exercises</p>
                  </div>
                  <Plus size={14} className="text-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkoutAiSuggest;
