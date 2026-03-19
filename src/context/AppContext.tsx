import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface Habit {
  id: string;
  label: string;
  done: boolean;
  category: "morning" | "other";
  completionDates: string[];
  hiddenFromPartner?: boolean;
  groupId?: string | null;
}

export interface ScheduledEvent {
  id: string;
  title: string;
  time: string;
  description?: string;
  day: number;
  month: number;
  year: number;
  user: "me" | "partner" | "both";
  hiddenFromPartner?: boolean;
  groupId?: string | null;
}

export interface Task {
  id: string;
  title: string;
  time: string;
  tag: "Work" | "Personal" | "Household";
  assignee: "me" | "partner" | "both";
  done: boolean;
  scheduledDay?: number;
  scheduledMonth?: number;
  scheduledYear?: number;
  hiddenFromPartner?: boolean;
  groupId?: string | null;
}

export interface Workout {
  id: string;
  title: string;
  duration: string;
  cal: number;
  tag: string;
  emoji: string;
  done: boolean;
  scheduledDate?: string;
  completedDate?: string;
  exercises?: { name: string; sets: number; reps: string }[];
  hiddenFromPartner?: boolean;
  groupId?: string | null;
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
  ownerUserId?: string;
}

interface AppContextType {
  habits: Habit[];
  filteredHabits: Habit[];
  toggleHabit: (id: string) => void;
  addHabit: (label: string, category: "morning" | "other") => void;
  removeHabit: (id: string) => void;
  addSharedHabit: (label: string, category: "morning" | "other") => Promise<void>;
  events: ScheduledEvent[];
  filteredEvents: ScheduledEvent[];
  addEvent: (event: Omit<ScheduledEvent, "id">) => void;
  removeEvent: (id: string) => void;
  tasks: Task[];
  filteredTasks: Task[];
  toggleTask: (id: string) => void;
  addTask: (task: Omit<Task, "id" | "done">) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, "scheduledDay" | "scheduledMonth" | "scheduledYear" | "time">>) => void;
  waterIntake: number;
  waterGoal: number;
  setWaterIntake: (amount: number) => void;
  setWaterGoal: (goal: number) => void;
  resetWater: () => void;
  workouts: Workout[];
  filteredWorkouts: Workout[];
  toggleWorkout: (id: string) => void;
  removeWorkout: (id: string) => void;
  removeWorkoutsByFilter: (filter: "all" | "week" | "month" | "date", date?: string) => Promise<number>;
  updateWorkout: (id: string, updates: Partial<Workout>) => void;
  setWorkouts: (workouts: Workout[]) => void;
  addWorkouts: (workouts: Workout[]) => void;
  rescheduleWorkout: (id: string, newDate: string) => void;
  getHabitStreak: (id: string) => number;
  getHabitsForDate: (date: string) => Habit[];
  getWorkoutsForDate: (date: string) => Workout[];
  googleCalendarEvents: GoogleCalendarEvent[];
  hideGcalEvent: (eventId: string) => Promise<void>;
  toggleEventVisibility: (eventId: string) => Promise<void>;
  // Partner data
  partnerHabits: Habit[];
  partnerEvents: ScheduledEvent[];
  partnerTasks: Task[];
  partnerWorkouts: Workout[];
  getPartnerWorkoutsForDate: (date: string) => Workout[];
  getPartnerHabitsForDate: (date: string) => Habit[];
  getPartnerHabitStreak: (id: string) => number;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const fmtDateCtx = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayStr = () => fmtDateCtx(new Date());

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { user, partner, activeGroup } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [waterIntake, setWaterIntakeState] = useState(0);
  const [waterGoal, setWaterGoalState] = useState(3);
  const [workouts, setWorkoutsState] = useState<Workout[]>([]);
  const [partnerHabits, setPartnerHabits] = useState<Habit[]>([]);
  const [partnerEvents, setPartnerEvents] = useState<ScheduledEvent[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<Task[]>([]);
  const [partnerWorkouts, setPartnerWorkouts] = useState<Workout[]>([]);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all data from database on mount
  useEffect(() => {
    if (!user) {
      setHabits([]);
      setEvents([]);
      setTasks([]);
      setWorkoutsState([]);
      setPartnerHabits([]);
      setPartnerEvents([]);
      setPartnerTasks([]);
      setPartnerWorkouts([]);
      setWaterIntakeState(0);
      setWaterGoalState(3);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        // Load own habits with completions
        const { data: habitsData } = await supabase
          .from("habits")
          .select("*")
          .eq("user_id", user.id);

        const { data: completionsData } = await supabase
          .from("habit_completions")
          .select("*")
          .eq("user_id", user.id);

        if (habitsData) {
          const completionMap = new Map<string, string[]>();
          (completionsData || []).forEach((c: any) => {
            const dates = completionMap.get(c.habit_id) || [];
            dates.push(c.completed_date);
            completionMap.set(c.habit_id, dates);
          });

          const todayDate = todayStr();
          setHabits(habitsData.map((h: any) => {
            const completionDates = completionMap.get(h.id) || [];
            return {
              id: h.id,
              label: h.label,
              category: h.category as "morning" | "other",
              done: completionDates.includes(todayDate),
              completionDates,
              hiddenFromPartner: h.hidden_from_partner || false,
              groupId: h.group_id || null,
            };
          }));
        }

        // Load tasks
        const { data: tasksData } = await supabase
          .from("tasks")
          .select("*")
          .eq("user_id", user.id);

        if (tasksData) {
          setTasks(tasksData.map((t: any) => ({
            id: t.id,
            title: t.title,
            time: t.time || "",
            tag: t.tag as "Work" | "Personal" | "Household",
            assignee: t.assignee as "me" | "partner" | "both",
            done: t.done,
            scheduledDay: t.scheduled_day,
            scheduledMonth: t.scheduled_month,
            scheduledYear: t.scheduled_year,
            hiddenFromPartner: t.hidden_from_partner || false,
            groupId: t.group_id || null,
          })));
        }

        // Load events
        const { data: eventsData } = await supabase
          .from("events")
          .select("*")
          .eq("user_id", user.id);

        if (eventsData) {
          setEvents(eventsData.map((e: any) => ({
            id: e.id,
            title: e.title,
            time: e.time || "",
            description: e.description,
            day: e.day,
            month: e.month,
            year: e.year,
            user: e.assignee as "me" | "partner" | "both",
            hiddenFromPartner: e.hidden_from_partner || false,
            groupId: e.group_id || null,
          })));
        }

        // Load workouts
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("*")
          .eq("user_id", user.id);

        if (workoutsData) {
          setWorkoutsState(workoutsData.map((w: any) => ({
            id: w.id,
            title: w.title,
            duration: w.duration,
            cal: w.cal,
            tag: w.tag,
            emoji: w.emoji,
            done: w.done,
            scheduledDate: w.scheduled_date,
            completedDate: w.completed_date,
            exercises: w.exercises || [],
            hiddenFromPartner: w.hidden_from_partner || false,
            groupId: w.group_id || null,
          })));
        }

        // Load water tracking for today
        const { data: waterData } = await supabase
          .from("water_tracking")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", todayStr())
          .maybeSingle();

        if (waterData) {
          setWaterIntakeState(Number(waterData.intake));
          setWaterGoalState(Number(waterData.goal));
        } else {
          setWaterIntakeState(0);
          setWaterGoalState(3);
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Load Google Calendar events — supports both single group and "All" mode
  useEffect(() => {
    if (!user) {
      setGoogleCalendarEvents([]);
      return;
    }

    const loadGcalEvents = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) return;

        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

        let url: string;
        if (activeGroup) {
          // Fetch group-shared events (from all members who connected their calendar for this group)
          url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&groupId=${encodeURIComponent(activeGroup.id)}&groupShared=true`;
        } else {
          // "All" mode
          url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&allGroups=true`;
        }

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setGoogleCalendarEvents(data.events || []);
        } else {
          console.error("Failed to fetch Google Calendar events:", res.status);
          setGoogleCalendarEvents([]);
        }
      } catch (err) {
        console.error("Error loading Google Calendar events:", err);
        setGoogleCalendarEvents([]);
      }
    };
    loadGcalEvents();
  }, [user, activeGroup]);

  // Load partner data separately
  useEffect(() => {
    if (!user || !partner) {
      setPartnerHabits([]);
      setPartnerEvents([]);
      setPartnerTasks([]);
      setPartnerWorkouts([]);
      return;
    }

    const loadPartnerData = async () => {
      try {
        // Partner habits
        const { data: pHabits } = await supabase
          .from("habits")
          .select("*")
          .eq("user_id", partner.id);

        const { data: pCompletions } = await supabase
          .from("habit_completions")
          .select("*")
          .eq("user_id", partner.id);

        if (pHabits) {
          const completionMap = new Map<string, string[]>();
          (pCompletions || []).forEach((c: any) => {
            const dates = completionMap.get(c.habit_id) || [];
            dates.push(c.completed_date);
            completionMap.set(c.habit_id, dates);
          });

          const todayDate = todayStr();
          setPartnerHabits(pHabits.map((h: any) => {
            const completionDates = completionMap.get(h.id) || [];
            return {
              id: h.id,
              label: h.label,
              category: h.category as "morning" | "other",
              done: completionDates.includes(todayDate),
              completionDates,
            };
          }));
        }

        // Partner tasks
        const { data: pTasks } = await supabase
          .from("tasks")
          .select("*")
          .eq("user_id", partner.id);

        if (pTasks) {
          setPartnerTasks(pTasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            time: t.time || "",
            tag: t.tag as "Work" | "Personal" | "Household",
            assignee: t.assignee as "me" | "partner" | "both",
            done: t.done,
            scheduledDay: t.scheduled_day,
            scheduledMonth: t.scheduled_month,
            scheduledYear: t.scheduled_year,
          })));
        }

        // Partner events
        const { data: pEvents } = await supabase
          .from("events")
          .select("*")
          .eq("user_id", partner.id);

        if (pEvents) {
          setPartnerEvents(pEvents.map((e: any) => ({
            id: e.id,
            title: e.title,
            time: e.time || "",
            description: e.description,
            day: e.day,
            month: e.month,
            year: e.year,
            user: e.assignee as "me" | "partner" | "both",
          })));
        }

        // Partner workouts
        const { data: pWorkouts } = await supabase
          .from("workouts")
          .select("*")
          .eq("user_id", partner.id);

        if (pWorkouts) {
          setPartnerWorkouts(pWorkouts.map((w: any) => ({
            id: w.id,
            title: w.title,
            duration: w.duration,
            cal: w.cal,
            tag: w.tag,
            emoji: w.emoji,
            done: w.done,
            scheduledDate: w.scheduled_date,
            completedDate: w.completed_date,
            exercises: w.exercises || [],
          })));
        }
      } catch (err) {
        console.error("Error loading partner data:", err);
      }
    };

    loadPartnerData();
  }, [user, partner]);

  const toggleHabit = async (id: string) => {
    const dateKey = todayStr();
    const habit = habits.find((h) => h.id === id);
    if (!habit || !user) return;

    const wasDone = habit.completionDates.includes(dateKey);

    setHabits((h) =>
      h.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          done: !item.done,
          completionDates: wasDone
            ? item.completionDates.filter((d) => d !== dateKey)
            : [...item.completionDates, dateKey],
        };
      })
    );

    if (wasDone) {
      await supabase
        .from("habit_completions")
        .delete()
        .eq("habit_id", id)
        .eq("completed_date", dateKey);
    } else {
      await supabase
        .from("habit_completions")
        .insert({ habit_id: id, user_id: user.id, completed_date: dateKey });
    }
  };

  const addHabit = async (label: string, category: "morning" | "other") => {
    if (!user) return;
    const { data, error } = await supabase
      .from("habits")
      .insert({ user_id: user.id, label, category })
      .select()
      .single();

    if (data && !error) {
      setHabits((h) => [...h, { id: data.id, label, done: false, category, completionDates: [] }]);
    }
  };

  const removeHabit = async (id: string) => {
    setHabits((h) => h.filter((item) => item.id !== id));
    await supabase.from("habit_completions").delete().eq("habit_id", id);
    await supabase.from("habits").delete().eq("id", id);
  };

  const addSharedHabit = async (label: string, category: "morning" | "other") => {
    if (!user) return;
    const { data, error } = await supabase.rpc("create_shared_habit", {
      _label: label,
      _category: category,
    });

    if (error) {
      console.error("Error creating shared habit:", error);
      return;
    }

    const result = data as any;
    if (result?.error) {
      console.error("Shared habit error:", result.error);
      return;
    }

    // Add to own habits
    if (result?.my_habit_id) {
      setHabits((h) => [...h, { id: result.my_habit_id, label, done: false, category, completionDates: [] }]);
    }
    // Add to partner habits view
    if (result?.partner_habit_id) {
      setPartnerHabits((h) => [...h, { id: result.partner_habit_id, label, done: false, category, completionDates: [] }]);
    }
  };

  const addEvent = async (event: Omit<ScheduledEvent, "id">) => {
    if (!user) return;

    const normalizedTitle = event.title.trim().toLowerCase();
    const normalizedTime = (event.time || "All day").trim().toLowerCase();
    const duplicateInMemory = events.some((existing) =>
      existing.title.trim().toLowerCase() === normalizedTitle &&
      (existing.time || "All day").trim().toLowerCase() === normalizedTime &&
      existing.day === event.day &&
      existing.month === event.month &&
      existing.year === event.year &&
      existing.user === event.user
    );

    if (duplicateInMemory) return;

    const { data: existingRows } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", event.title)
      .eq("time", event.time || "All day")
      .eq("day", event.day)
      .eq("month", event.month)
      .eq("year", event.year)
      .eq("assignee", event.user)
      .limit(1);

    if (existingRows && existingRows.length > 0) return;

    const { data, error } = await supabase
      .from("events")
      .insert({
        user_id: user.id,
        title: event.title,
        time: event.time || "All day",
        description: event.description,
        day: event.day,
        month: event.month,
        year: event.year,
        assignee: event.user,
      })
      .select()
      .single();

    if (data && !error) {
      setEvents((e) => [...e, { ...event, time: event.time || "All day", id: data.id }]);
    }
  };

  const removeEvent = async (id: string) => {
    setEvents((e) => e.filter((item) => item.id !== id));
    await supabase.from("events").delete().eq("id", id);
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    setTasks((t) => t.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
    await supabase.from("tasks").update({ done: !task.done }).eq("id", id);
  };

  const addTask = async (task: Omit<Task, "id" | "done">) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: task.title,
        time: task.time,
        tag: task.tag,
        assignee: task.assignee,
        done: false,
        scheduled_day: task.scheduledDay,
        scheduled_month: task.scheduledMonth,
        scheduled_year: task.scheduledYear,
      })
      .select()
      .single();

    if (data && !error) {
      setTasks((t) => [...t, { ...task, id: data.id, done: false }]);
    }
  };

  const removeTask = async (id: string) => {
    setTasks((t) => t.filter((item) => item.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  };

  const updateTask = async (id: string, updates: Partial<Pick<Task, "scheduledDay" | "scheduledMonth" | "scheduledYear" | "time">>) => {
    setTasks((t) => t.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    const dbUpdates: any = {};
    if (updates.scheduledDay !== undefined) dbUpdates.scheduled_day = updates.scheduledDay;
    if (updates.scheduledMonth !== undefined) dbUpdates.scheduled_month = updates.scheduledMonth;
    if (updates.scheduledYear !== undefined) dbUpdates.scheduled_year = updates.scheduledYear;
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    await supabase.from("tasks").update(dbUpdates).eq("id", id);
  };

  const upsertWater = async (intake: number, goal: number) => {
    if (!user) return;
    await supabase
      .from("water_tracking")
      .upsert({
        user_id: user.id,
        date: todayStr(),
        intake,
        goal,
      }, { onConflict: "user_id,date" });
  };

  const setWaterIntake = (amount: number) => {
    const clamped = Math.max(0, Math.min(amount, waterGoal));
    setWaterIntakeState(clamped);
    upsertWater(clamped, waterGoal);
  };

  const resetWater = () => {
    setWaterIntakeState(0);
    upsertWater(0, waterGoal);
  };

  const setWaterGoal = (goal: number) => {
    setWaterGoalState(goal);
    upsertWater(waterIntake, goal);
  };

  const toggleWorkout = async (id: string) => {
    const dateKey = todayStr();
    const workout = workouts.find((w) => w.id === id);
    if (!workout) return;

    const newDone = !workout.done;
    setWorkoutsState((w) =>
      w.map((item) =>
        item.id === id
          ? { ...item, done: newDone, completedDate: newDone ? dateKey : undefined }
          : item
      )
    );
    await supabase.from("workouts").update({
      done: newDone,
      completed_date: newDone ? dateKey : null,
    }).eq("id", id);
  };

  const removeWorkout = async (id: string) => {
    setWorkoutsState((w) => w.filter((item) => item.id !== id));
    await supabase.from("workouts").delete().eq("id", id);
  };

  const removeWorkoutsByFilter = async (filter: "all" | "week" | "month" | "date", date?: string): Promise<number> => {
    if (!user) return 0;
    const today = todayStr();
    // Base: only incomplete workouts scheduled today or in the future (never past completed ones)
    const eligible = workouts.filter((w) => !w.done && w.scheduledDate && w.scheduledDate >= today);
    let toRemove: Workout[] = [];

    if (filter === "all") {
      toRemove = eligible;
    } else if (filter === "date" && date) {
      toRemove = eligible.filter((w) => w.scheduledDate === date);
    } else if (filter === "week") {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const endStr = fmtDateCtx(end);
      toRemove = eligible.filter((w) => w.scheduledDate! <= endStr);
    } else if (filter === "month") {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const endStr = fmtDateCtx(end);
      toRemove = eligible.filter((w) => w.scheduledDate! <= endStr);
    }

    if (toRemove.length === 0) return 0;
    const ids = toRemove.map((w) => w.id);
    setWorkoutsState((w) => w.filter((item) => !ids.includes(item.id)));
    for (const id of ids) {
      await supabase.from("workouts").delete().eq("id", id);
    }
    return ids.length;
  };

  const updateWorkout = async (id: string, updates: Partial<Workout>) => {
    setWorkoutsState((w) =>
      w.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.exercises !== undefined) dbUpdates.exercises = updates.exercises;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.cal !== undefined) dbUpdates.cal = updates.cal;
    if (updates.tag !== undefined) dbUpdates.tag = updates.tag;
    if (updates.emoji !== undefined) dbUpdates.emoji = updates.emoji;
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("workouts").update(dbUpdates).eq("id", id);
    }
  };

  const setWorkouts = (newWorkouts: Workout[]) => {
    setWorkoutsState(newWorkouts);
  };

  const addWorkouts = async (newWorkouts: Workout[]) => {
    if (!user || newWorkouts.length === 0) return;

    const now = Date.now();
    const optimisticWorkouts: Workout[] = newWorkouts.map((w, index) => ({
      ...w,
      id: w.id || `temp-workout-${now}-${index}`,
      groupId: w.groupId ?? activeGroup?.id ?? null,
      hiddenFromPartner: w.hiddenFromPartner ?? false,
    }));
    const tempIds = new Set(optimisticWorkouts.map((w) => w.id));

    setWorkoutsState((prev) => [...prev, ...optimisticWorkouts]);

    const rows = optimisticWorkouts.map((w) => ({
      user_id: user.id,
      title: w.title,
      duration: w.duration,
      cal: w.cal,
      tag: w.tag,
      emoji: w.emoji,
      done: w.done,
      scheduled_date: w.scheduledDate || null,
      completed_date: w.completedDate || null,
      exercises: w.exercises || [],
      hidden_from_partner: w.hiddenFromPartner ?? false,
      group_id: w.groupId ?? null,
    }));

    const { data, error } = await supabase
      .from("workouts")
      .insert(rows)
      .select();

    if (error || !data) {
      console.error("Error saving workouts:", error);
      setWorkoutsState((prev) => prev.filter((item) => !tempIds.has(item.id)));
      return;
    }

    const mapped: Workout[] = data.map((w: any) => ({
      id: w.id,
      title: w.title,
      duration: w.duration,
      cal: w.cal,
      tag: w.tag,
      emoji: w.emoji,
      done: w.done,
      scheduledDate: w.scheduled_date,
      completedDate: w.completed_date,
      exercises: w.exercises || [],
      hiddenFromPartner: w.hidden_from_partner || false,
      groupId: w.group_id || null,
    }));

    setWorkoutsState((prev) => [
      ...prev.filter((item) => !tempIds.has(item.id)),
      ...mapped,
    ]);
  };

  const rescheduleWorkout = async (id: string, newDate: string) => {
    setWorkoutsState((w) =>
      w.map((item) =>
        item.id === id ? { ...item, scheduledDate: newDate } : item
      )
    );
    await supabase.from("workouts").update({ scheduled_date: newDate }).eq("id", id);
  };

  const getHabitStreak = useCallback((id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (!habit) return 0;
    const sorted = [...habit.completionDates].sort().reverse();
    if (sorted.length === 0) return 0;

    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (sorted.includes(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [habits]);

  const getPartnerHabitStreak = useCallback((id: string) => {
    const habit = partnerHabits.find((h) => h.id === id);
    if (!habit) return 0;
    const sorted = [...habit.completionDates].sort().reverse();
    if (sorted.length === 0) return 0;

    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (sorted.includes(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [partnerHabits]);

  const getHabitsForDate = useCallback((date: string) => {
    return habits.map((h) => ({
      ...h,
      done: h.completionDates.includes(date),
    }));
  }, [habits]);

  const getPartnerHabitsForDate = useCallback((date: string) => {
    return partnerHabits.map((h) => ({
      ...h,
      done: h.completionDates.includes(date),
    }));
  }, [partnerHabits]);

  const getWorkoutsForDate = useCallback((date: string) => {
    return workouts.filter((w) => w.scheduledDate === date || w.completedDate === date);
  }, [workouts]);

  const getPartnerWorkoutsForDate = useCallback((date: string) => {
    return partnerWorkouts.filter((w) => w.scheduledDate === date || w.completedDate === date);
  }, [partnerWorkouts]);

  // Group-filtered data
  const filterByGroup = useCallback(<T extends { groupId?: string | null }>(items: T[]): T[] => {
    if (!activeGroup) return items; // "All" mode
    return items.filter((item) => item.groupId === activeGroup.id);
  }, [activeGroup]);

  const filteredHabits = useMemo(() => filterByGroup(habits), [habits, filterByGroup]);
  const filteredEvents = useMemo(() => filterByGroup(events), [events, filterByGroup]);
  const filteredTasks = useMemo(() => filterByGroup(tasks), [tasks, filterByGroup]);
  const filteredWorkouts = useMemo(() => {
    if (!activeGroup) return workouts;
    // Keep legacy ungrouped workouts visible while new inserts are correctly group-scoped
    return workouts.filter((workout) => workout.groupId === activeGroup.id || workout.groupId == null);
  }, [workouts, activeGroup]);

  return (
    <AppContext.Provider value={{
      habits, filteredHabits, toggleHabit, addHabit, removeHabit, addSharedHabit,
      events, filteredEvents, addEvent, removeEvent,
      tasks, filteredTasks, toggleTask, addTask, removeTask, updateTask,
      waterIntake, waterGoal, setWaterIntake, setWaterGoal, resetWater,
      workouts, filteredWorkouts, toggleWorkout, removeWorkout, removeWorkoutsByFilter, updateWorkout, setWorkouts, addWorkouts, rescheduleWorkout,
      getHabitStreak, getHabitsForDate, getWorkoutsForDate,
      googleCalendarEvents,
      partnerHabits, partnerEvents, partnerTasks, partnerWorkouts,
      getPartnerWorkoutsForDate, getPartnerHabitsForDate, getPartnerHabitStreak,
      loading,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
