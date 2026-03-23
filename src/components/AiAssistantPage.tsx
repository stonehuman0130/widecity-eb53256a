import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Sparkles, Check, X, ChevronDown, ChevronUp, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import ReactMarkdown from "react-markdown";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: {
    phase?: string;
    suggestions?: string[];
    draftPlan?: DraftPlan | null;
    actions?: AppAction[];
  };
}

interface DraftPlan {
  type: "workout" | "event" | "habit" | "meal" | "multi" | "message" | "sobriety" | "special_day" | "section";
  items: DraftItem[];
}

interface DraftItem {
  title: string;
  date?: string;
  time?: string;
  description?: string;
  tag?: string;
  assignee?: string;
  category?: string;
  emoji?: string;
  duration?: string;
  cal?: number;
  exercises?: { name: string; sets: number; reps: string }[];
  groupId?: string;
  content?: string;
  icon?: string;
  startDate?: string;
  moneyPerDay?: number;
  sectionKey?: string;
  sectionLabel?: string;
  shared?: boolean;
}

interface AppAction {
  action_type: string;
  [key: string]: any;
}

const AiAssistantPage = ({ onBack }: { onBack?: () => void }) => {
  const { user, profile, groups, activeGroup } = useAuth();
  const appContext = useAppContext();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialLoadDone = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const { listening, start: startListening, stop: stopListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => {
      setInput(transcript);
      setVoiceActive(false);
      sendMessageDirect(transcript);
    },
    onEnd: () => {},
  });

  useEffect(() => {
    if (!user || initialLoadDone.current) return;
    initialLoadDone.current = true;
    const load = async () => {
      setLoading(true);
      const groupId = activeGroup?.id || groups[0]?.id;
      if (!groupId) { setLoading(false); return; }

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", groupId)
        .eq("is_ai_coach", true)
        .order("created_at", { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            role: (m.metadata as any)?.role === "assistant" ? "assistant" : "user",
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata as any,
          }))
        );
      }
      setLoading(false);
      scrollToBottom();
    };
    load();
  }, [user, groups, activeGroup]);

  const sendMessageDirect = async (text: string) => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    setInput("");

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    const groupId = activeGroup?.id || groups[0]?.id;
    if (!groupId) {
      toast.error("No group context available");
      setSending(false);
      return;
    }

    await supabase.from("messages").insert({
      group_id: groupId,
      user_id: user.id,
      content: text,
      is_ai_coach: true,
      metadata: { role: "user" },
    } as any);

    const history = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          message: text,
          groupId,
          conversationHistory: history,
          phase: "idle",
          context: {},
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          appContext: {
            userName: profile?.display_name,
            groups: groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, memberCount: g.members.length })),
            activeGroupId: activeGroup?.id,
            activeGroupName: activeGroup?.name,
          },
        },
      });

      if (error) throw error;

      const aiReply = data.reply || "I'm here to help! What would you like to do?";
      const suggestions = data.suggestions || [];
      const draftPlan = data.draftPlan || null;

      const aiMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: aiReply,
        created_at: new Date().toISOString(),
        metadata: { phase: data.phase, suggestions, draftPlan },
      };

      setMessages((prev) => [...prev, aiMsg]);

      await supabase.from("messages").insert({
        group_id: groupId,
        user_id: user.id,
        content: aiReply,
        is_ai_coach: true,
        metadata: { role: "assistant", phase: data.phase, suggestions, draftPlan },
      } as any);

      if (draftPlan) setExpandedPlan(aiMsg.id);
      scrollToBottom();
    } catch (e: any) {
      console.error("AI error:", e);
      toast.error("Failed to get AI response");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = () => sendMessageDirect(input);

  const handleConfirmPlan = async (draftPlan: DraftPlan) => {
    if (!user) return;
    setSending(true);
    const groupId = activeGroup?.id || groups[0]?.id;

    try {
      for (const item of draftPlan.items) {
        if (draftPlan.type === "message" && item.content && item.groupId) {
          await supabase.from("messages").insert({
            group_id: item.groupId,
            user_id: user.id,
            content: item.content,
            is_ai_coach: false,
          });
        } else if (draftPlan.type === "workout" || item.exercises) {
          await supabase.from("workouts").insert({
            user_id: user.id,
            group_id: groupId,
            title: item.title,
            emoji: item.emoji || "💪",
            duration: item.duration || "30 min",
            cal: item.cal || 0,
            tag: item.tag || "Full Body",
            exercises: item.exercises || [],
            scheduled_date: item.date || new Date().toISOString().slice(0, 10),
          });
        } else if (draftPlan.type === "habit") {
          await supabase.from("habits").insert({
            user_id: user.id,
            group_id: groupId,
            label: item.title,
            category: item.category || "other",
          });
        } else if (draftPlan.type === "sobriety") {
          await supabase.from("sobriety_categories").insert({
            user_id: user.id,
            group_id: groupId,
            label: item.title,
            icon: item.icon || "🚫",
            start_date: item.startDate || new Date().toISOString().slice(0, 10),
            money_per_day: item.moneyPerDay || 0,
          });
        } else {
          const d = item.date ? new Date(item.date + "T00:00:00") : new Date();
          await supabase.from("events").insert({
            user_id: user.id,
            group_id: groupId,
            title: item.title,
            time: item.time || "",
            day: d.getDate(),
            month: d.getMonth() + 1,
            year: d.getFullYear(),
            assignee: item.assignee || "me",
            description: item.description || null,
          });
        }
      }

      const confirmMsg = `✅ Done! I've saved ${draftPlan.items.length} item${draftPlan.items.length !== 1 ? "s" : ""}.`;
      const aiMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: confirmMsg,
        created_at: new Date().toISOString(),
        metadata: { phase: "idle", suggestions: ["What else can I help with?", "Show my schedule", "Plan a workout"] },
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (groupId) {
        await supabase.from("messages").insert({
          group_id: groupId,
          user_id: user.id,
          content: confirmMsg,
          is_ai_coach: true,
          metadata: { role: "assistant", phase: "idle" },
        } as any);
      }

      setExpandedPlan(null);
      toast.success("Saved!");
      scrollToBottom();
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Failed to save");
    } finally {
      setSending(false);
    }
  };

  const handleRejectPlan = () => {
    const msg = "No problem! What would you like to change?";
    const aiMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: msg,
      created_at: new Date().toISOString(),
      metadata: { suggestions: ["Start over", "Change details", "Cancel"] },
    };
    setMessages((prev) => [...prev, aiMsg]);
    setExpandedPlan(null);
    scrollToBottom();
  };

  const handleVoiceToggle = () => {
    if (voiceActive || listening) {
      stopListening();
      setVoiceActive(false);
    } else {
      setVoiceActive(true);
      startListening();
    }
  };

  const handleInputFocus = () => {
    if (voiceActive || listening) {
      stopListening();
      setVoiceActive(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const lastAiMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions = lastAiMsg?.metadata?.suggestions || [];

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      <header className="px-4 pt-12 pb-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">AI Assistant</h1>
            <p className="text-[10px] text-muted-foreground">
              {activeGroup ? `${activeGroup.name} · ` : ""}Your universal helper
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mb-5">
              <Sparkles size={36} className="text-violet-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Hey{profile?.display_name ? `, ${profile.display_name}` : ""}! 👋</h2>
            <p className="text-sm text-muted-foreground max-w-[300px] mb-8 leading-relaxed">
              I can help you with anything in the app — schedule events, plan workouts, manage habits, send messages, and more.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
              {[
                "Plan a workout for this week",
                "Schedule dinner tomorrow at 7pm",
                "Add a morning habit",
                "Set up a sobriety tracker",
                "Summarize what I did today",
                "Send a message to my group",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessageDirect(s)}
                  className="px-3 py-2 rounded-xl bg-secondary text-xs font-medium hover:bg-secondary/80 active:scale-95 transition-all border border-border/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const hasPlan = msg.metadata?.draftPlan;
          const isExpanded = expandedPlan === msg.id;

          return (
            <div key={msg.id}>
              <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
                <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                      <Sparkles size={10} className="text-violet-500" />
                      <span className="text-[10px] font-semibold text-violet-500">AI</span>
                    </div>
                  )}
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-foreground rounded-bl-md"
                    }`}
                  >
                    {isUser ? (
                      msg.content
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isUser ? "text-right mr-1" : "ml-1"}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>

              {hasPlan && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ml-1 mr-4 mt-2 mb-3"
                >
                  <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => setExpandedPlan(isExpanded ? null : msg.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-secondary/30 transition-colors"
                    >
                      <span className="text-xs font-bold">
                        📋 Draft · {(msg.metadata!.draftPlan!.items || []).length} item{(msg.metadata!.draftPlan!.items || []).length !== 1 ? "s" : ""}
                      </span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3 space-y-2 border-t border-border/50 pt-2">
                            {(msg.metadata!.draftPlan!.items || []).map((item: DraftItem, idx: number) => (
                              <div key={idx} className="bg-secondary/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{item.emoji || "📌"}</span>
                                  <span className="text-xs font-bold flex-1">{item.title}</span>
                                </div>
                                {item.date && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">
                                    {item.date}{item.time ? ` · ${item.time}` : ""}
                                    {item.duration ? ` · ${item.duration}` : ""}
                                  </p>
                                )}
                                {item.exercises && item.exercises.length > 0 && (
                                  <div className="mt-1.5 ml-6 space-y-0.5">
                                    {item.exercises.map((ex, i) => (
                                      <p key={i} className="text-[10px] text-muted-foreground">
                                        • {ex.name} — {ex.sets}×{ex.reps}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}

                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => handleConfirmPlan(msg.metadata!.draftPlan!)}
                                disabled={sending}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                <Check size={14} /> Confirm & Save
                              </button>
                              <button
                                onClick={handleRejectPlan}
                                disabled={sending}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                <X size={14} /> Change
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start mb-1">
            <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {(voiceActive || listening) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-center py-6"
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  listening ? "bg-destructive/20 animate-pulse" : "bg-primary/20"
                }`}>
                  <Mic size={32} className={listening ? "text-destructive" : "text-primary"} />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {listening ? "Listening..." : "Starting..."}
                </p>
                <button
                  onClick={() => { stopListening(); setVoiceActive(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {suggestions.length > 0 && !sending && !voiceActive && !listening && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessageDirect(s)}
              className="px-3 py-1.5 rounded-full bg-secondary text-[11px] font-medium whitespace-nowrap hover:bg-secondary/80 active:scale-95 transition-all border border-border/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          {speechSupported && (
            <button
              onClick={handleVoiceToggle}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                listening || voiceActive
                  ? "bg-destructive/20 text-destructive animate-pulse"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {listening || voiceActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask me anything..."
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 transition-opacity active:scale-95 flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPage;
