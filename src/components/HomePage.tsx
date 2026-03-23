import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Plus, Sparkles, Clock, Check, Loader2, MoreVertical, Trash2, ChevronLeft, ChevronRight, Mic, MicOff, Volume2, Users, ArrowLeft, EyeOff, Eye, Settings, LayoutGrid } from "lucide-react";
import GroupBadge from "@/components/GroupBadge";
import ItemActionMenu from "@/components/ItemActionMenu";
import GroupSelector from "@/components/GroupSelector";
import TaskTag from "@/components/TaskTag";
import UserBadge from "@/components/UserBadge";
import TaskActionMenu from "@/components/TaskActionMenu";
import TeamDashboard from "@/components/TeamDashboard";
import AddItemModal from "@/components/AddItemModal";
import CongratsPopup from "@/components/CongratsPopup";
import HomeSectionCustomizer, { loadSectionPrefs, saveSectionPrefs, buildAllSections } from "@/components/HomeSectionCustomizer";
import { HomeWaterWidget, HomeWorkoutWidget, HomeSobrietyWidget, HomeHabitSectionWidget, HomeSpecialDaysWidget } from "@/components/HomeWidgets";
import type { HabitSectionMeta } from "@/lib/habitSections";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { speak, stopSpeaking } from "@/lib/speak";
import { useGroupContext } from "@/hooks/useGroupContext";

type Filter = string; // "mine" | "partner" | "household" | "member:{userId}"

interface ClarificationState {
  question: string;
  suggestions: string[];
  context: string;
  conversationHistory: { role: string; content: string }[];
}

const HomePage = ({ onBackToLauncher, onOpenSettings }: { onBackToLauncher?: () => void; onOpenSettings?: () => void }) => {
  const { profile, partner, groups, activeGroup, setActiveGroup } = useAuth();
  const [filter, setFilter] = useState<Filter>("mine");
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [congratsType, setCongratsType] = useState<"task" | "habit" | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [sectionVisible, setSectionVisible] = useState<Set<string>>(new Set());
  const [selectedSobrietyIds, setSelectedSobrietyIds] = useState<string[]>([]);
  const [selectedSpecialDayIds, setSelectedSpecialDayIds] = useState<string[]>([]);
  const {
    habits, filteredHabits, toggleHabit, addHabit, removeHabit, events, filteredEvents, tasks, filteredTasks, toggleTask, toggleEventCompletion, addTask, addEvent, removeEvent, removeTask, updateTask, rescheduleEvent,
    partnerHabits, partnerEvents, partnerTasks, filteredPartnerHabits, filteredPartnerEvents, filteredPartnerTasks, googleCalendarEvents, hideGcalEvent, toggleGcalCompletion, toggleEventVisibility, designateGcalEvent,
  } = useAppContext();

  const voiceModeRef = useRef(voiceMode);
  const aiRequestInFlightRef = useRef(false);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Load section preferences
  useEffect(() => {
    const prefs = loadSectionPrefs(activeGroup?.id ?? null);
    setSectionOrder(prefs.order);
    setSectionVisible(prefs.visible);
    setSelectedSobrietyIds(prefs.selectedSobrietyIds);
    setSelectedSpecialDayIds(prefs.selectedSpecialDayIds);
  }, [activeGroup?.id]);

  const handleSaveSections = (
    order: string[],
    visible: Set<string>,
    sobrietyIds: string[],
    specialDayIds: string[]
  ) => {
    setSectionOrder(order);
    setSectionVisible(visible);
    setSelectedSobrietyIds(sobrietyIds);
    setSelectedSpecialDayIds(specialDayIds);
    saveSectionPrefs(activeGroup?.id ?? null, order, visible, sobrietyIds, specialDayIds);
  };

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

  // Habit sections from context
  const { habitSections } = useAppContext();

  // Morning habits: show own when "mine", partner's when "partner" — use first habit section
  const myMorningHabits = filteredHabits.filter((h) => h.category === "morning");
  const partnerMorningHabits = filteredPartnerHabits.filter((h) => h.category === "morning");
  const displayMorningHabits = filter === "partner" ? partnerMorningHabits : myMorningHabits;

  const handleToggleHabit = useCallback((id: string) => {
    const habit = myMorningHabits.find((h) => h.id === id);
    if (habit && !habit.done) {
      setCongratsType("habit");
    }
    toggleHabit(id);
  }, [myMorningHabits, toggleHabit]);

  const { filters: groupFilters, otherName, hasOther, showGoogleCalendar } = useGroupContext();
  const partnerName = otherName;

  // Helper: check if current filter is a specific member filter
  const isSpecificMemberFilter = filter.startsWith("member:");
  const selectedMemberUserId = isSpecificMemberFilter ? filter.replace("member:", "") : null;
  // Find the display name for the selected member
  const selectedMemberName = useMemo(() => {
    if (!selectedMemberUserId) return partnerName;
    const f = groupFilters.find((gf) => gf.id === filter);
    return f?.label || partnerName;
  }, [selectedMemberUserId, groupFilters, filter, partnerName]);

  const sd = selectedDate;
  const selDay = sd.getDate();
  const selMonth = sd.getMonth();
  const selYear = sd.getFullYear();
  const selDateStr = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
  const isTodayDate = (() => { const d = new Date(); return selDay === d.getDate() && selMonth === d.getMonth() && selYear === d.getFullYear(); })();

  const isSelectedDate = (day?: number, month?: number, year?: number) => {
    if (day === undefined || month === undefined || year === undefined) return true;
    return day === selDay && month === selMonth && year === selYear;
  };

  // INDIVIDUAL VIEW: show items assigned to me (or specific member) PLUS jointly assigned items
  let dayTasks: Task[];
  let visibleEvents: ScheduledEvent[];

  if (filter === "mine") {
    const myResponsible = filteredTasks.filter((t) =>
      (t.assignee === "me" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
    );
    const partnerAssignedToMe = filteredPartnerTasks.filter((t) =>
      (t.assignee === "partner" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
    );
    const seenKeys = new Set(myResponsible.map((t) => `${t.title}|${t.time}|${t.scheduledDay}`));
    const uniquePartner = partnerAssignedToMe.filter((t) => !seenKeys.has(`${t.title}|${t.time}|${t.scheduledDay}`));
    dayTasks = [...myResponsible, ...uniquePartner];

    const myEvents = filteredEvents.filter((e) =>
      (e.user === "me" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
    );
    const partnerEventsForMe = filteredPartnerEvents.filter((e) =>
      (e.user === "partner" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
    );
    const seenEventKeys = new Set(myEvents.map((e) => `${e.title}|${e.time}|${e.day}`));
    const uniquePartnerEvents = partnerEventsForMe.filter((e) => !seenEventKeys.has(`${e.title}|${e.time}|${e.day}`));
    visibleEvents = [...myEvents, ...uniquePartnerEvents];
  } else if (filter === "partner" || isSpecificMemberFilter) {
    // For "partner" (2-member) or "member:{userId}" (3+ member): show that member's data
    const memberTasks = selectedMemberUserId
      ? filteredPartnerTasks.filter((t) => t.ownerUserId === selectedMemberUserId)
      : filteredPartnerTasks;
    const memberEvents = selectedMemberUserId
      ? filteredPartnerEvents.filter((e) => e.ownerUserId === selectedMemberUserId)
      : filteredPartnerEvents;

    const partnerOwn = memberTasks.filter((t) =>
      (t.assignee === "me" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
    );
    const myAssignedToPartner = filteredTasks.filter((t) =>
      (t.assignee === "partner" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
    );
    const seenKeys = new Set(partnerOwn.map((t) => `${t.title}|${t.time}|${t.scheduledDay}`));
    const uniqueMy = myAssignedToPartner.filter((t) => !seenKeys.has(`${t.title}|${t.time}|${t.scheduledDay}`));
    dayTasks = [...partnerOwn, ...uniqueMy];

    const partnerOwnEvents = memberEvents.filter((e) =>
      (e.user === "me" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
    );
    const myEventsForPartner = filteredEvents.filter((e) =>
      (e.user === "partner" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
    );
    const seenEventKeys = new Set(partnerOwnEvents.map((e) => `${e.title}|${e.time}|${e.day}`));
    const uniqueMyEvents = myEventsForPartner.filter((e) => !seenEventKeys.has(`${e.title}|${e.time}|${e.day}`));
    visibleEvents = [...partnerOwnEvents, ...uniqueMyEvents];
  } else {
    // "household" / shared: collect ALL items for TeamDashboard (handled separately in render)
    dayTasks = [];
    visibleEvents = [];
  }

  // For Together view: pass all items to TeamDashboard
  const householdMyTasks = useMemo(() =>
    filteredTasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)),
    [filteredTasks, selDay, selMonth, selYear]
  );
  const householdMyEvents = useMemo(() =>
    filteredEvents.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear),
    [filteredEvents, selDay, selMonth, selYear]
  );
  const householdPartnerTasks = useMemo(() =>
    filteredPartnerTasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)),
    [filteredPartnerTasks, selDay, selMonth, selYear]
  );
  const householdPartnerEvents = useMemo(() =>
    filteredPartnerEvents.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear),
    [filteredPartnerEvents, selDay, selMonth, selYear]
  );

  const hasSpecificTime = (time?: string) => Boolean(time) && time !== "" && time !== "All day";
  const isTaskScheduled = (t: Task) => hasSpecificTime(t.time);

  // Helper: parse any time representation to minutes for sorting
  const toSortMinutes = (time?: string, isoStart?: string): number => {
    if (!time && isoStart) {
      const d = new Date(isoStart);
      if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    }
    if (!time || time === "" || time === "All day") return -1;
    const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) return parseInt(match24[1]) * 60 + parseInt(match24[2]);
    const match12 = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12) {
      let h = parseInt(match12[1]);
      const m = parseInt(match12[2]);
      if (match12[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (match12[3].toUpperCase() === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }
    // Try ISO
    const d = new Date(time);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    return -1;
  };

  // Google Calendar events for the selected date — in individual views include shared items
  const gcalEventsForDay = showGoogleCalendar ? googleCalendarEvents.filter((ge) => {
    const startDate = ge.start?.split("T")[0] || ge.start;
    const selDateStr = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
    if (startDate !== selDateStr) return false;
    const assignee = ge.assignee || "me";
    if (filter === "mine") return assignee === "me" || assignee === "both";
    if (filter === "partner" || isSpecificMemberFilter) return assignee === "partner" || assignee === "both";
    return true; // household shows all
  }) : [];

  // ── Build unified item types for sorting ──
  type UnifiedHomeItem = 
    | { kind: "task"; data: Task; sortMinutes: number }
    | { kind: "event"; data: ScheduledEvent; sortMinutes: number }
    | { kind: "gcal"; data: GoogleCalendarEvent; sortMinutes: number };

  const scheduledTasks = dayTasks.filter((t) => isTaskScheduled(t));
  const justDoIt = dayTasks.filter((t) => !isTaskScheduled(t));
  const timedEvents = visibleEvents.filter((e) => hasSpecificTime(e.time));
  const allDayEvents = visibleEvents.filter((e) => !hasSpecificTime(e.time));
  const gcalTimed = gcalEventsForDay.filter((ge) => !ge.allDay);
  const gcalAllDay = gcalEventsForDay.filter((ge) => ge.allDay);

  // Merge all timed items into one sorted list
  const allTimedItems: UnifiedHomeItem[] = useMemo(() => {
    const items: UnifiedHomeItem[] = [
      ...scheduledTasks.map((t): UnifiedHomeItem => ({ kind: "task", data: t, sortMinutes: toSortMinutes(t.time) })),
      ...timedEvents.map((e): UnifiedHomeItem => ({ kind: "event", data: e, sortMinutes: toSortMinutes(e.time) })),
      ...gcalTimed.map((ge): UnifiedHomeItem => ({ kind: "gcal", data: ge, sortMinutes: toSortMinutes(undefined, ge.start) })),
    ];
    items.sort((a, b) => a.sortMinutes - b.sortMinutes);
    return items;
  }, [scheduledTasks, timedEvents, gcalTimed]);

  // Merge all untimed items
  const allUntimedItems: UnifiedHomeItem[] = useMemo(() => [
    ...justDoIt.map((t): UnifiedHomeItem => ({ kind: "task", data: t, sortMinutes: -1 })),
    ...allDayEvents.map((e): UnifiedHomeItem => ({ kind: "event", data: e, sortMinutes: -1 })),
    ...gcalAllDay.map((ge): UnifiedHomeItem => ({ kind: "gcal", data: ge, sortMinutes: -1 })),
  ], [justDoIt, allDayEvents, gcalAllDay]);

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
        <div className="flex items-center gap-2">
          {onBackToLauncher && (
            <button
              onClick={onBackToLauncher}
              className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors -ml-1"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-display">{greeting} 👋</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Let's make today count, {profile?.display_name || "there"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={() => setShowCustomizer(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Customize layout"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-card"
          >
            <Plus size={18} />
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
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

      {/* Group Selector */}
      <GroupSelector />

      {groupFilters.length > 1 && (
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
          {groupFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as Filter)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                filter === f.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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

      {filter === "household" ? (
        <TeamDashboard
          myTasks={householdMyTasks}
          myEvents={householdMyEvents}
          partnerTasks={householdPartnerTasks}
          partnerEvents={householdPartnerEvents}
          gcalEvents={gcalEventsForDay}
          toggleTask={toggleTask}
          toggleEventCompletion={toggleEventCompletion}
          toggleGcalCompletion={toggleGcalCompletion}
          removeEvent={removeEvent}
          removeTask={removeTask}
          toggleEventVisibility={toggleEventVisibility}
          rescheduleEvent={rescheduleEvent}
          hideGcalEvent={hideGcalEvent}
          designateGcalEvent={designateGcalEvent}
          onCongrats={() => setCongratsType("task")}
        />
      ) : (
        <>
          {sectionOrder.filter((id) => sectionVisible.has(id)).map((sectionId) => {
            // Handle dynamic habit sections (habit:xxx)
            if (sectionId.startsWith("habit:")) {
              const categoryKey = sectionId.replace("habit:", "");
              const sectionMeta = habitSections.find((s) => s.key === categoryKey);
              if (!sectionMeta) return null;
              return (
                <section key={sectionId} className="mb-6">
                  <HomeHabitSectionWidget
                    selectedDate={selectedDate}
                    categoryKey={categoryKey}
                    sectionLabel={filter === "partner" ? `${partnerName}'s ${sectionMeta.label}` : sectionMeta.label}
                    sectionIcon={sectionMeta.icon}
                  />
                </section>
              );
            }

            switch (sectionId) {
              case "scheduled":
                return (
                  <section key={sectionId} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock size={18} className="text-muted-foreground" />
                      <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
                    </div>
                    {allTimedItems.length > 0 ? (
                      <div className="space-y-3">
                        {allTimedItems.map((item) => {
                          if (item.kind === "task") return <TaskCard key={item.data.id} task={item.data} onToggle={isViewingPartner ? undefined : toggleTask} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />;
                          if (item.kind === "event") return <EventCard key={item.data.id} event={item.data} onToggle={isViewingPartner ? undefined : toggleEventCompletion} onRemove={isViewingPartner ? undefined : removeEvent} onToggleVisibility={isViewingPartner ? undefined : toggleEventVisibility} onReschedule={isViewingPartner ? undefined : rescheduleEvent} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />;
                          return <GCalEventCard key={`gcal-${item.data.id}`} event={item.data} onToggle={isViewingPartner ? undefined : toggleGcalCompletion} onHide={isViewingPartner ? undefined : hideGcalEvent} onDesignate={isViewingPartner ? undefined : designateGcalEvent} onCongrats={() => setCongratsType("task")} />;
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No scheduled items</p>
                    )}
                  </section>
                );

              case "justdoit":
                return (
                  <section key={sectionId} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-foreground" />
                      <h2 className="text-lg font-semibold tracking-display">Just Do it</h2>
                      <span className="text-sm text-muted-foreground">({allUntimedItems.length})</span>
                    </div>
                    {allUntimedItems.length > 0 ? (
                      <div className="space-y-3">
                        {allUntimedItems.map((item) => {
                          if (item.kind === "task") return <TaskCard key={item.data.id} task={item.data} onToggle={isViewingPartner ? undefined : toggleTask} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />;
                          if (item.kind === "event") return <EventCard key={item.data.id} event={item.data} onToggle={isViewingPartner ? undefined : toggleEventCompletion} onRemove={isViewingPartner ? undefined : removeEvent} onToggleVisibility={isViewingPartner ? undefined : toggleEventVisibility} onReschedule={isViewingPartner ? undefined : rescheduleEvent} onCongrats={() => setCongratsType("task")} readOnly={isViewingPartner} />;
                          return <GCalEventCard key={`gcal-${item.data.id}`} event={item.data} onToggle={isViewingPartner ? undefined : toggleGcalCompletion} onHide={isViewingPartner ? undefined : hideGcalEvent} onDesignate={isViewingPartner ? undefined : designateGcalEvent} onCongrats={() => setCongratsType("task")} />;
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">All clear! Add tasks with the + button</p>
                    )}
                  </section>
                );

              case "water":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeWaterWidget selectedDate={selectedDate} />
                  </section>
                );

              case "workout":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeWorkoutWidget selectedDate={selectedDate} />
                  </section>
                );

              case "sobriety":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeSobrietyWidget selectedDate={selectedDate} selectedTrackerIds={selectedSobrietyIds} />
                  </section>
                );

              case "special-days":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeSpecialDaysWidget selectedDate={selectedDate} selectedDayIds={selectedSpecialDayIds} />
                  </section>
                );

              default:
                return null;
            }
          })}
        </>
      )}

      <HomeSectionCustomizer
        open={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        order={sectionOrder}
        visible={sectionVisible}
        selectedSobrietyIds={selectedSobrietyIds}
        selectedSpecialDayIds={selectedSpecialDayIds}
        onSave={handleSaveSections}
      />
      <AddItemModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
};

const TaskCard = ({ task, onToggle, onCongrats, readOnly }: { task: Task; onToggle?: (id: string) => void; onCongrats: () => void; readOnly?: boolean }) => {
  const { activeGroup } = useAuth();
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
      <div className="mt-2 ml-9 flex items-center gap-2">
        <TaskTag tag={task.tag} />
        <GroupBadge groupId={task.groupId} />
      </div>
    </motion.div>
  );
};

const EventCard = ({ event, onToggle, onRemove, onToggleVisibility, onReschedule, onCongrats, readOnly }: {
  event: ScheduledEvent;
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onReschedule?: (id: string, day: number, month: number, year: number) => void;
  onCongrats: () => void;
  readOnly?: boolean;
}) => {
  const dateLabel = new Date(event.year, event.month, event.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tomorrow = new Date(event.year, event.month, event.day);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${event.done ? "border-habit-green/50" : event.hiddenFromPartner ? "border-muted/50 opacity-70" : "border-border"}`}
    >
      {(event.time && event.time !== "All day") && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{formatTime(event.time)}</span>
          <span className="text-xs text-muted-foreground">· {dateLabel}</span>
          {event.hiddenFromPartner && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
          <GroupBadge groupId={event.groupId} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (readOnly || !onToggle) return;
            if (!event.done) onCongrats();
            onToggle(event.id);
          }}
          disabled={readOnly || !onToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            event.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${(readOnly || !onToggle) ? "opacity-60" : ""}`}
        >
          {event.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${event.done ? "line-through opacity-40" : ""}`}>
          {event.title}
        </span>
        <UserBadge user={event.user} />
        {!readOnly && (onRemove || onToggleVisibility || onReschedule) && (
          <ItemActionMenu
            hidden={event.hiddenFromPartner}
            onToggleVisibility={onToggleVisibility ? () => { onToggleVisibility(event.id); toast.success(event.hiddenFromPartner ? "Now visible to others" : "Hidden from others"); } : undefined}
            onMoveToTomorrow={onReschedule ? () => { onReschedule(event.id, tomorrow.getDate(), tomorrow.getMonth(), tomorrow.getFullYear()); toast.success("Moved to tomorrow"); } : undefined}
            onMoveToDate={onReschedule ? (d) => { onReschedule(event.id, d.getDate(), d.getMonth(), d.getFullYear()); toast.success("Event rescheduled"); } : undefined}
            onRemove={() => { if (onRemove) { onRemove(event.id); toast.success("Event deleted"); } }}
          />
        )}
      </div>
      {(!event.time || event.time === "All day") && (
        <div className="mt-2 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{dateLabel} · All day</span>
          {event.hiddenFromPartner && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
          <GroupBadge groupId={event.groupId} />
        </div>
      )}
    </motion.div>
  );
};

const GCalEventCard = ({ event, onToggle, onHide, onDesignate, onCongrats }: {
  event: GoogleCalendarEvent;
  onToggle?: (eventId: string) => void;
  onHide?: (eventId: string) => void;
  onDesignate?: (eventId: string, assignee: "me" | "partner" | "both") => void;
  onCongrats?: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const timeStr = event.allDay
    ? "All day"
    : event.start
    ? new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  const handleToggle = () => {
    if (!onToggle) return;
    if (!event.done && onCongrats) onCongrats();
    onToggle(event.id);
  };

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${event.done ? "border-habit-green/50" : "border-primary/20"}`}
    >
      {timeStr && timeStr !== "All day" && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{timeStr}</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={!onToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            event.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${!onToggle ? "opacity-60" : ""}`}
        >
          {event.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${event.done ? "line-through opacity-40" : ""}`}>{event.title}</span>
        <UserBadge user={event.assignee || "me"} />
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium">
            Open
          </a>
        )}
        {(onHide || onDesignate) && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-xl border border-border bg-card shadow-card overflow-hidden">
                  {onDesignate && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assign to</div>
                      {(["me", "partner", "both"] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { onDesignate(event.id, opt); setMenuOpen(false); toast.success(`Assigned as ${opt === "me" ? "Mine" : opt === "partner" ? "Partner's" : "Together"}`); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary ${event.assignee === opt ? "text-primary font-semibold" : "text-foreground"}`}
                        >
                          <UserBadge user={opt} />
                          {opt === "me" ? "Mine" : opt === "partner" ? "Partner's" : "Together"}
                          {event.assignee === opt && <Check size={14} className="ml-auto text-primary" />}
                        </button>
                      ))}
                    </>
                  )}
                  {onHide && (
                    <button
                      onClick={() => { onHide(event.id); setMenuOpen(false); toast.success("Hidden from others"); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
                    >
                      <EyeOff size={14} /> Hide from others
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {timeStr === "All day" && (
        <div className="mt-2 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">All day</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
    </motion.div>
  );
};

export default HomePage;
