import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Plus, Sparkles, Clock, Check, Loader2, MoreVertical, Trash2, ChevronLeft, ChevronRight, Mic, MicOff, Volume2 } from "lucide-react";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";
import TaskActionMenu from "@/components/TaskActionMenu";
import AddItemModal from "@/components/AddItemModal";
import CongratsPopup from "@/components/CongratsPopup";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { speak, stopSpeaking } from "@/lib/speak";

type Filter = "mine" | "partner" | "household";

interface ClarificationState {
  question: string;
  suggestions: string[];
  context: string;
  conversationHistory: { role: string; content: string }[];
}

const HomePage = () => {
  const { profile, partner } = useAuth();
  const [filter, setFilter] = useState<Filter>("mine");
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [congratsType, setCongratsType] = useState<"task" | "habit" | null>(null);
  const {
    habits, toggleHabit, addHabit, removeHabit, events, tasks, toggleTask, addTask, addEvent, removeEvent, removeTask,
    partnerHabits, partnerEvents, partnerTasks, googleCalendarEvents,
  } = useAppContext();

  const voiceModeRef = useRef(voiceMode);
  const aiRequestInFlightRef = useRef(false);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  const { listening, start: startListening, stop: stopListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => {
      if (voiceModeRef.current) {
        setInput(transcript);
        handleAiSchedule(transcript);
      } else {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    },
  });

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const speakResponse = (text: string, thenListen?: boolean) => {
    setIsSpeaking(true);
    speak(text, () => {
      setIsSpeaking(false);
      if (thenListen && voiceModeRef.current && speechSupported) {
        setTimeout(() => startListening(), 300);
      }
    });
  };

  const handleQuickAdd = () => {
    if (!input.trim()) return;
    addTask({
      title: input,
      time: "",
      tag: "Personal",
      assignee: "me",
      scheduledDay: selectedDate.getDate(),
      scheduledMonth: selectedDate.getMonth(),
      scheduledYear: selectedDate.getFullYear(),
    });
    setInput("");
  };

  const toDateParts = (dateStr?: string) => {
    if (dateStr) {
      const [y, m, d] = dateStr.split("-").map(Number);
      return { day: d, month: m - 1, year: y };
    }
    return { day: selectedDate.getDate(), month: selectedDate.getMonth(), year: selectedDate.getFullYear() };
  };

  const normalizeValue = (value?: string) => (value || "").trim().toLowerCase();

  const getEventSignature = (payload: {
    title?: string;
    time?: string;
    day: number;
    month: number;
    year: number;
    assignee: "me" | "partner" | "both";
  }) => {
    return [
      normalizeValue(payload.title),
      normalizeValue(payload.time || "All day"),
      payload.day,
      payload.month,
      payload.year,
      payload.assignee,
    ].join("|");
  };

  const processAction = async (action: any, seenSignatures?: Set<string>) => {
    const actionType = action.action_type || action.type || (action.label ? "add_habit" : "create_event");

    if (actionType === "add_habit") {
      const label = action.label || action.title;
      const category = action.category || "other";
      if (!label) return { created: false };
      await addHabit(label, category);
      toast.success(`Habit added: ${label}`, { description: `Added to ${category} habits` });
      return { created: true };
    }

    if (!action.title) return { created: false };

    const { day, month, year } = toDateParts(action.date);
    const assignee = (action.assignee || "me") as "me" | "partner" | "both";
    const signature = getEventSignature({
      title: action.title,
      time: action.time,
      day,
      month,
      year,
      assignee,
    });

    const isDuplicateInBatch = seenSignatures?.has(signature);
    const isDuplicateInState = events.some((event) =>
      getEventSignature({
        title: event.title,
        time: event.time,
        day: event.day,
        month: event.month,
        year: event.year,
        assignee: event.user,
      }) === signature
    );

    if (isDuplicateInBatch || isDuplicateInState) {
      return { created: false, duplicate: true };
    }

    seenSignatures?.add(signature);

    await addEvent({
      title: action.title,
      time: action.time || "All day",
      description: action.description || "",
      day,
      month,
      year,
      user: assignee,
    });

    toast.success(`Scheduled: ${action.title}`, {
      description: `${action.date || "today"} ${action.time || "All day"}${assignee !== "me" ? ` · ${assignee === "partner" ? partner?.display_name || "Partner" : "Both"}` : ""}`,
    });

    return { created: true };
  };

  const handleAiSchedule = async (overrideText?: string, history?: { role: string; content: string }[]) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || aiRequestInFlightRef.current) return;

    aiRequestInFlightRef.current = true;
    setAiLoading(true);

    try {
      const body: any = { text: textToSend, timezone: userTimezone };
      if (history && history.length > 0) {
        body.conversationHistory = history;
      }

      // Pass current schedule and habits context for delete/query operations
      const sd = selectedDate;
      const todayEvents = events.filter((e) => e.day === sd.getDate() && e.month === sd.getMonth() && e.year === sd.getFullYear());
      const todayTasks = tasks.filter((t) => t.scheduledDay === sd.getDate() && t.scheduledMonth === sd.getMonth() && t.scheduledYear === sd.getFullYear());

      body.currentSchedule = [
        ...todayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, type: "event" })),
        ...todayTasks.map((t) => ({ id: t.id, title: t.title, time: t.time, type: "task" })),
      ];
      body.currentHabits = habits.map((h) => ({ id: h.id, label: h.label, category: h.category, done: h.done }));

      const { data: rawData, error } = await supabase.functions.invoke("ai-schedule", { body });
      if (error) throw error;

      const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      if (data.error) throw new Error(data.error);

      if (data.type === "clarification") {
        const newHistory = [...(history || [])];
        newHistory.push({ role: "user", content: textToSend });
        newHistory.push({ role: "assistant", content: data.question });

        setClarification({
          question: data.question,
          suggestions: data.suggestions || [],
          context: data.context || "",
          conversationHistory: newHistory,
        });

        if (voiceMode) {
          speakResponse(data.spokenResponse || data.question, true);
        }

        setInput("");
        return;
      }

      // Handle query responses
      if (data.type === "query_response") {
        toast.info(data.answer, { duration: 6000 });
        if (voiceMode && data.spokenResponse) {
          speakResponse(data.spokenResponse, true);
        }
        setInput("");
        setClarification(null);
        return;
      }

      // Handle delete actions
      if (data.type === "delete_item") {
        const { item_id, item_type, item_title } = data;
        if (item_type === "event") {
          removeEvent(item_id);
        } else if (item_type === "task") {
          removeTask(item_id);
        } else if (item_type === "habit") {
          removeHabit(item_id);
        }
        toast.success(`Deleted: ${item_title}`);
        if (voiceMode && data.spokenResponse) {
          speakResponse(data.spokenResponse, true);
        }
        setInput("");
        setClarification(null);
        return;
      }

      if (data.type === "multi" && Array.isArray(data.actions)) {
        const seenSignatures = new Set<string>();
        let createdCount = 0;

        for (const action of data.actions) {
          if (action.action_type === "delete_item") {
            if (action.item_type === "event") removeEvent(action.item_id);
            else if (action.item_type === "task") removeTask(action.item_id);
            else if (action.item_type === "habit") removeHabit(action.item_id);
            toast.success(`Deleted: ${action.item_title || "item"}`);
            createdCount++;
          } else {
            const result = await processAction(action, seenSignatures);
            if (result.created) createdCount += 1;
          }
        }

        if (createdCount > 1) {
          toast.success(`✨ ${createdCount} actions completed!`);
        } else if (createdCount === 0) {
          toast.info("No new item created", { description: "That request matches an existing scheduled item." });
        }
      } else {
        const result = await processAction(data, new Set<string>());
        if (!result.created && result.duplicate) {
          toast.info("Already scheduled", { description: "That event already exists." });
        }
      }

      if (voiceMode && data.spokenResponse) {
        speakResponse(data.spokenResponse, true);
      }

      setInput("");
      setClarification(null);
    } catch (e: any) {
      console.error("AI schedule error:", e);
      toast.error("AI couldn't parse that", { description: e.message });
      if (voiceMode) {
        speakResponse("Sorry, I couldn't understand that. Could you try again?", true);
      }
    } finally {
      setAiLoading(false);
      aiRequestInFlightRef.current = false;
    }
  };

  const handleClarificationReply = (reply: string) => {
    if (!clarification) return;
    const history = [...clarification.conversationHistory];
    setClarification(null);
    setInput("");
    handleAiSchedule(reply, history);
  };

  const toggleVoiceMode = () => {
    if (voiceMode) {
      setVoiceMode(false);
      stopListening();
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setVoiceMode(true);
      if (speechSupported) {
        startListening();
      }
    }
  };

  // Morning habits: show own when "mine", partner's when "partner"
  const myMorningHabits = habits.filter((h) => h.category === "morning");
  const partnerMorningHabits = partnerHabits.filter((h) => h.category === "morning");
  const displayMorningHabits = filter === "partner" ? partnerMorningHabits : myMorningHabits;

  const handleToggleHabit = useCallback((id: string) => {
    const habit = myMorningHabits.find((h) => h.id === id);
    if (habit && !habit.done) {
      setCongratsType("habit");
    }
    toggleHabit(id);
  }, [myMorningHabits, toggleHabit]);

  const partnerName = partner?.display_name || "Partner";
  const filters: { id: Filter; label: string }[] = [
    { id: "mine", label: "Mine" },
    { id: "partner", label: `${partnerName}'s` },
    { id: "household", label: "Household" },
  ];

  const sd = selectedDate;
  const selDay = sd.getDate();
  const selMonth = sd.getMonth();
  const selYear = sd.getFullYear();

  const isSelectedDate = (day?: number, month?: number, year?: number) => {
    if (day === undefined || month === undefined || year === undefined) return true;
    return day === selDay && month === selMonth && year === selYear;
  };

  // Partner filter: show PARTNER's data, not own data with assignee="partner"
  let filteredTasks: Task[];
  let visibleEvents: ScheduledEvent[];

  if (filter === "mine") {
    filteredTasks = tasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear));
    visibleEvents = events.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear);
  } else if (filter === "partner") {
    filteredTasks = partnerTasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear));
    visibleEvents = partnerEvents.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear);
  } else {
    // Household: own household items + partner household items
    const myHousehold = tasks.filter((t) => (t.tag === "Household" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear));
    const partnerHousehold = partnerTasks.filter((t) => (t.tag === "Household" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear));
    filteredTasks = [...myHousehold, ...partnerHousehold];

    const myHouseholdEvents = events.filter((e) => (e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear);
    const partnerHouseholdEvents = partnerEvents.filter((e) => (e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear);
    visibleEvents = [...myHouseholdEvents, ...partnerHouseholdEvents];
  }

  const hasSpecificTime = (time?: string) => Boolean(time) && time !== "" && time !== "All day";
  const isTaskScheduled = (t: Task) => hasSpecificTime(t.time);
  const scheduledTasks = filteredTasks.filter((t) => isTaskScheduled(t));
  const justDoIt = filteredTasks.filter((t) => !isTaskScheduled(t));

  // Split events: timed events go to Scheduled, all-day events go to Just Do It
  const timedEvents = visibleEvents.filter((e) => hasSpecificTime(e.time));
  const allDayEvents = visibleEvents.filter((e) => !hasSpecificTime(e.time));

  const dateFormatted = sd.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: userTimezone });
  const isToday = selDay === new Date().getDate() && selMonth === new Date().getMonth() && selYear === new Date().getFullYear();

  const shiftDate = (days: number) => {
    const d = new Date(sd);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  // Determine if we can toggle items (only own items)
  const isViewingPartner = filter === "partner";

  return (
    <div className="px-5">
      {congratsType && (
        <CongratsPopup type={congratsType} show={true} onClose={() => setCongratsType(null)} />
      )}

      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">{greeting} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Let's make today count, {profile?.display_name || "there"}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card mt-1"
        >
          <Plus size={22} />
        </button>
      </header>

      {/* Date Selector */}
      <div className="flex items-center justify-between bg-card rounded-xl p-2 mb-4 shadow-card border border-border">
        <button onClick={() => shiftDate(-1)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all">
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => setSelectedDate(new Date())}
          className={`flex-1 text-center py-1.5 rounded-lg text-sm font-semibold transition-colors ${isToday ? "text-primary" : "text-foreground hover:text-primary"}`}
        >
          {isToday ? `Today · ${dateFormatted}` : dateFormatted}
        </button>
        <button onClick={() => shiftDate(1)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-95 transition-all">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              filter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Voice Mode Overlay */}
      <AnimatePresence>
        {voiceMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6 mb-5 text-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                listening
                  ? "bg-destructive/20 animate-pulse"
                  : isSpeaking
                  ? "bg-primary/20 animate-pulse"
                  : "bg-secondary"
              }`}>
                {listening ? (
                  <Mic size={32} className="text-destructive" />
                ) : isSpeaking ? (
                  <Volume2 size={32} className="text-primary" />
                ) : (
                  <Mic size={32} className="text-muted-foreground" />
                )}
              </div>
              <p className="text-sm font-medium text-foreground">
                {listening
                  ? "Listening..."
                  : isSpeaking
                  ? "Speaking..."
                  : aiLoading
                  ? "Thinking..."
                  : "Tap to speak"}
              </p>
              {!listening && !isSpeaking && !aiLoading && (
                <button
                  onClick={startListening}
                  className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Tap to Speak
                </button>
              )}
              <button
                onClick={toggleVoiceMode}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Exit Voice Mode
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clarification Card */}
      <AnimatePresence>
        {clarification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 mb-5"
          >
            <div className="flex items-start gap-2 mb-3">
              <Sparkles size={16} className="text-purple-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium text-foreground">{clarification.question}</p>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {clarification.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleClarificationReply(s)}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    e.preventDefault();
                    handleClarificationReply(input);
                  }
                }}
                placeholder="Or type your answer..."
                className="flex-1 bg-card rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground border border-border min-w-0"
              />
              <button
                onClick={() => { setClarification(null); setInput(""); }}
                className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI-powered input bar */}
      {!voiceMode && !clarification && (
        <div className="flex items-center gap-2 bg-card rounded-xl p-2 pl-4 mb-6 shadow-card border border-border">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  handleQuickAdd();
                } else {
                  handleAiSchedule();
                }
              }
            }}
            placeholder="Try: 'call at 2pm tomorrow & add stretch to mornings'"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
          />
          {speechSupported && (
            <button
              onClick={toggleVoiceMode}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-500 hover:from-purple-500/30 hover:to-pink-500/30"
              title="Voice assistant"
            >
              <Mic size={16} />
            </button>
          )}
          <button
            onClick={() => handleAiSchedule()}
            disabled={aiLoading || !input.trim()}
            className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-primary-foreground disabled:opacity-50 flex-shrink-0"
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
          <button
            onClick={handleQuickAdd}
            disabled={!input.trim()}
            className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 flex-shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-lg font-semibold tracking-display mb-3">
          {filter === "partner" ? `${partnerName}'s Morning Habits` : "Morning Habits"}
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {displayMorningHabits.map((habit) => (
            <button
              key={habit.id}
              onClick={() => !isViewingPartner && handleToggleHabit(habit.id)}
              disabled={isViewingPartner}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border whitespace-nowrap text-sm font-medium transition-all active:scale-[0.97] ${
                habit.done
                  ? "border-habit-green bg-habit-green/10 text-habit-green"
                  : "border-border bg-card text-foreground"
              } ${isViewingPartner ? "opacity-80" : ""}`}
            >
              {habit.done ? (
                <span className="w-5 h-5 rounded-full bg-habit-green flex items-center justify-center">
                  <Check size={12} className="text-primary-foreground" />
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full border-2 border-muted" />
              )}
              {habit.label}
            </button>
          ))}
          {displayMorningHabits.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              {isViewingPartner ? `${partnerName} has no morning habits yet` : "No morning habits yet"}
            </p>
          )}
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
        </div>
        {scheduledTasks.length > 0 || timedEvents.length > 0 ? (
          <div className="space-y-3">
            {scheduledTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={isViewingPartner ? undefined : toggleTask} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />
            ))}
            {timedEvents.map((event) => (
              <EventCard key={event.id} event={event} onRemove={isViewingPartner ? undefined : removeEvent} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No scheduled items</p>
        )}
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-foreground" />
          <h2 className="text-lg font-semibold tracking-display">Just Do it</h2>
          <span className="text-sm text-muted-foreground">({justDoIt.length})</span>
        </div>
        {justDoIt.length > 0 || allDayEvents.length > 0 ? (
          <div className="space-y-3">
            {justDoIt.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={isViewingPartner ? undefined : toggleTask} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />
            ))}
            {allDayEvents.map((event) => (
              <EventCard key={event.id} event={event} onRemove={isViewingPartner ? undefined : removeEvent} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">All clear! Add tasks with the + button</p>
        )}
      </section>

      <AddItemModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
};

const TaskCard = ({ task, onToggle, onCongrats, readOnly }: { task: Task; onToggle?: (id: string) => void; onCongrats: () => void; readOnly?: boolean }) => {
  const handleToggle = () => {
    if (readOnly || !onToggle) return;
    if (!task.done) {
      onCongrats();
    }
    onToggle(task.id);
  };

  const hasDate = task.scheduledDay !== undefined && task.scheduledMonth !== undefined && task.scheduledYear !== undefined;
  const dateLabel = hasDate
    ? new Date(task.scheduledYear!, task.scheduledMonth!, task.scheduledDay!).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${task.done ? "border-habit-green/50" : "border-border"}`}
    >
      {(task.time || dateLabel) && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          {task.time ? <span className="text-xs font-medium text-muted-foreground">{formatTime(task.time)}</span> : null}
          {dateLabel ? <span className="text-xs text-muted-foreground">· {dateLabel}</span> : null}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={readOnly}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${readOnly ? "opacity-60" : ""}`}
        >
          {task.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${task.done ? "line-through opacity-40" : ""}`}>
          {task.title}
        </span>
        <UserBadge user={task.assignee} />
        {!readOnly && <TaskActionMenu taskId={task.id} />}
      </div>
      <div className="mt-2 ml-9">
        <TaskTag tag={task.tag} />
      </div>
    </motion.div>
  );
};

const EventCard = ({ event, onRemove, onCongrats, readOnly }: { event: ScheduledEvent; onRemove?: (id: string) => void; onCongrats: () => void; readOnly?: boolean }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [done, setDone] = useState(false);
  const dateLabel = new Date(event.year, event.month, event.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${done ? "border-habit-green/50" : "border-border"}`}
    >
      {(event.time && event.time !== "All day") && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{formatTime(event.time)}</span>
          <span className="text-xs text-muted-foreground">· {dateLabel}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (readOnly) return;
            if (!done) onCongrats();
            setDone(!done);
          }}
          disabled={readOnly}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${readOnly ? "opacity-60" : ""}`}
        >
          {done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${done ? "line-through opacity-40" : ""}`}>
          {event.title}
        </span>
        <UserBadge user={event.user} />
        {!readOnly && onRemove && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                <div className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-xl border border-border bg-card shadow-card">
                  <button
                    onClick={() => {
                      onRemove(event.id);
                      setMenuOpen(false);
                      toast.success("Event deleted");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {(!event.time || event.time === "All day") && (
        <div className="mt-2 ml-9">
          <span className="text-xs text-muted-foreground">{dateLabel} · All day</span>
        </div>
      )}
    </motion.div>
  );
};

export default HomePage;
