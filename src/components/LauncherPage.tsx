import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Mic, ChevronRight, Plus, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSpeechToText } from "@/hooks/useSpeechToText";

interface LauncherPageProps {
  onEnterGroup: (groupId: string | null) => void;
  onCreateGroup?: () => void;
  onOpenSettings?: () => void;
}

const LauncherPage = ({ onEnterGroup, onCreateGroup, onOpenSettings }: LauncherPageProps) => {
  const { profile, groups } = useAuth();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const { listening, start: startListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => setInput((prev) => (prev ? prev + " " + transcript : transcript)),
  });

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  const handleSubmit = () => {
    if (!input.trim()) return;
    // Navigate to home with the AI input pre-filled
    onEnterGroup(null);
  };

  return (
    <div className="px-5 flex flex-col min-h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="pt-14 pb-2">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[2rem] font-bold tracking-display leading-tight"
        >
          {greeting},{" "}
          <span className="bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
            {profile?.display_name || "there"}
          </span>
        </motion.h1>
      </header>

      {/* AI Input Section */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6"
      >
        <p className="text-sm text-muted-foreground mb-3">
          What would you like to schedule today?
        </p>
        <div
          className={`relative bg-card rounded-2xl border shadow-card transition-all ${
            focused ? "border-primary shadow-lg ring-2 ring-primary/10" : "border-border"
          }`}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={`Try: "Dinner with Evelyn at 7pm tomorrow"\nor "Plan my workouts for the week"`}
            rows={3}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground resize-none p-4 pb-12"
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {speechSupported && (
                <button
                  onClick={startListening}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    listening
                      ? "bg-destructive/20 text-destructive animate-pulse"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Mic size={14} />
                </button>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all hover:shadow-md active:scale-[0.97]"
            >
              <Sparkles size={14} />
              Schedule
            </button>
          </div>
        </div>
      </motion.div>

      {/* Group Calendars List */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-8 flex-1"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            My Calendars
          </p>
          {onCreateGroup && (
            <button
              onClick={onCreateGroup}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={12} />
              New
            </button>
          )}
        </div>

        <div className="space-y-2">
          {groups.map((group, index) => {
            const otherMembers = group.members.filter((m) => m.user_id !== profile?.id);
            const memberNames = otherMembers.map((m) => m.display_name || "Member").join(", ");

            return (
              <motion.button
                key={group.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + index * 0.05 }}
                onClick={() => onEnterGroup(group.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all active:scale-[0.98] text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
                  {group.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">{group.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {memberNames || "Just you"} · {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.button>
            );
          })}

          {groups.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">No calendars yet</p>
              {onCreateGroup && (
                <button
                  onClick={onCreateGroup}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Create your first calendar
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LauncherPage;
