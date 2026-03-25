import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Sparkles, Loader2, ArrowLeft, CheckCircle2, XCircle, Check } from "lucide-react";
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
    actions?: AppAction[];
    actionResults?: ActionResult[];
  };
}

interface AppAction {
  action_type: string;
  [key: string]: any;
}

interface ActionResult {
  action_type: string;
  success: boolean;
  id?: string;
  error?: string;
}

const ACTION_LABELS: Record<string, string> = {
  create_workout: "Created workout",
  delete_workout: "Deleted workout",
  create_event: "Created event",
  delete_event: "Deleted event",
  create_habit: "Created habit",
  delete_habit: "Deleted habit",
  create_section: "Created section",
  delete_section: "Deleted section",
  rename_section: "Renamed section",
  create_sobriety: "Created sobriety tracker",
  delete_sobriety: "Deleted sobriety tracker",
  create_special_day: "Created special day",
  delete_special_day: "Deleted special day",
  send_message: "Sent message",
  create_task: "Created task",
  delete_task: "Deleted task",
  log_meal: "Added meal",
  delete_meal: "Deleted meal",
  create_shopping_list: "Created shopping list",
};

const AiAssistantPage = ({ onBack }: { onBack?: () => void }) => {
  const { user, profile, groups, activeGroup } = useAuth();
  const appContext = useAppContext();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialLoadDone = useRef(false);

  // Shopping list ingredient review state
  interface ShopItem { ingredients: string[]; mealTitle: string; mealDate: string }
  const [shopPrompt, setShopPrompt] = useState<ShopItem | null>(null);
  const [shopQueue, setShopQueue] = useState<ShopItem[]>([]);
  const [shopChecked, setShopChecked] = useState<Record<number, boolean>>({});
  const [shopSaving, setShopSaving] = useState(false);

  const groupId = activeGroup?.id || groups[0]?.id || null;

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const getWeekMonday = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(mon.getDate() + diff);
    return fmtDate(mon);
  };

  const getWeekSunday = (mondayStr: string) => {
    const d = new Date(mondayStr + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return fmtDate(d);
  };

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
      return [];
    });
  };

  const enqueueShopPrompt = (item: ShopItem) => {
    if (shopPrompt) {
      setShopQueue(prev => [...prev, item]);
    } else {
      setShopChecked(Object.fromEntries(item.ingredients.map((_, i) => [i, true])));
      setShopPrompt(item);
    }
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

    const weekStart = getWeekMonday(shopPrompt.mealDate);
    const weekEnd = getWeekSunday(weekStart);
    const monDate = new Date(weekStart + "T00:00:00");
    const sunDate = new Date(weekEnd + "T00:00:00");
    const weekLabel = `Week of ${monDate.getMonth() + 1}/${monDate.getDate()} (Mon) – ${sunDate.getMonth() + 1}/${sunDate.getDate()} (Sun)`;

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

    const { data: existingItems } = await supabase.from("shopping_list_items").select("*").eq("list_id", listId);
    const existingNames = new Set((existingItems || []).map((it: any) => (it.name as string).toLowerCase().trim()));
    const newItems = selectedItems.filter(name => !existingNames.has(name.toLowerCase().trim()));
    if (newItems.length > 0) {
      const rows = newItems.map(name => ({ list_id: listId, user_id: user.id, name }));
      await supabase.from("shopping_list_items").insert(rows);
    }

    toast.success(existingLists && existingLists.length > 0 ? "Items added to weekly shopping list!" : "Weekly shopping list created!");
    dismissShopPrompt();
    setShopSaving(false);
  };

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
      const actions = data.actions || [];
      const actionResults = data.actionResults || [];

      // If actions were executed, refresh app data
      if (actionResults.length > 0) {
        const hasSuccess = actionResults.some((r: ActionResult) => r.success);
        if (hasSuccess) {
          // Trigger a data refresh by reloading app context
          appContext.refreshData?.();
        }
      }

      const aiMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: aiReply,
        created_at: new Date().toISOString(),
        metadata: { phase: data.phase, suggestions, actions, actionResults },
      };

      setMessages((prev) => [...prev, aiMsg]);

      await supabase.from("messages").insert({
        group_id: groupId,
        user_id: user.id,
        content: aiReply,
        is_ai_coach: true,
        metadata: { role: "assistant", phase: data.phase, suggestions, actions: actions.length > 0 ? actions : undefined },
      } as any);

      scrollToBottom();
    } catch (e: any) {
      console.error("AI error:", e);
      toast.error("Failed to get AI response");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = () => sendMessageDirect(input);

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
            <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">AI Assistant</h1>
            <p className="text-[10px] text-muted-foreground">
              {activeGroup ? `${activeGroup.name} · ` : ""}Can do everything you can
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
              I can do anything in the app — create workouts, schedule events, manage habits, send messages, and more. Just ask!
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
              {[
                "Create a 4-day workout plan",
                "Schedule dinner tomorrow at 7pm",
                "Add a morning habits section",
                "Set up a sobriety tracker",
                "Send a message to the group",
                "Delete all my workouts",
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
          const actionResults = msg.metadata?.actionResults || [];
          const hasActions = actionResults.length > 0;

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

                  {/* Action Results */}
                  {hasActions && (
                    <div className="mt-1.5 ml-1 space-y-1">
                      {actionResults.map((result: ActionResult, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-1.5 text-[11px] font-medium ${
                            result.success ? "text-emerald-600" : "text-destructive"
                          }`}
                        >
                          {result.success ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <XCircle size={12} />
                          )}
                          <span>
                            {ACTION_LABELS[result.action_type] || result.action_type}
                            {!result.success && result.error ? ` — ${result.error}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isUser ? "text-right mr-1" : "ml-1"}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
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
