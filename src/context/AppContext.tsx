import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export interface Habit {
  id: string;
  label: string;
  done: boolean;
  category: "morning" | "other";
  completionDates: string[];
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
}

export interface Workout {
  id: string;
  title: string;
  duration: string;
  cal: number;
  tag: string;
  emoji: string;
  done: boolean;
  scheduledDate?: string; // "YYYY-MM-DD"
  completedDate?: string; // "YYYY-MM-DD"
  exercises?: { name: string; sets: number; reps: string }[];
}

interface AppContextType {
  habits: Habit[];
  toggleHabit: (id: string) => void;
  addHabit: (label: string, category: "morning" | "other") => void;
  events: ScheduledEvent[];
  addEvent: (event: Omit<ScheduledEvent, "id">) => void;
  removeEvent: (id: string) => void;
  tasks: Task[];
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
  toggleWorkout: (id: string) => void;
  removeWorkout: (id: string) => void;
  setWorkouts: (workouts: Workout[]) => void;
  addWorkouts: (workouts: Workout[]) => void;
  rescheduleWorkout: (id: string, newDate: string) => void;
  getHabitStreak: (id: string) => number;
  getHabitsForDate: (date: string) => Habit[];
  getWorkoutsForDate: (date: string) => Workout[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = new Date();

const initialHabits: Habit[] = [
  { id: "1", label: "Drink Olive Oil", done: false, category: "morning", completionDates: [] },
  { id: "2", label: "Take Vitamins", done: false, category: "morning", completionDates: [] },
  { id: "3", label: "Stretch", done: false, category: "morning", completionDates: [] },
  { id: "4", label: "Meditation", done: false, category: "other", completionDates: [] },
  { id: "5", label: "Read 10 Pages", done: false, category: "other", completionDates: [] },
  { id: "6", label: "Gratitude Journal", done: false, category: "other", completionDates: [] },
];

const initialEvents: ScheduledEvent[] = [
  { id: "e1", title: "Date night", time: "7:00 PM", day: today.getDate(), month: today.getMonth(), year: today.getFullYear(), user: "both" },
  { id: "e2", title: "Dentist appointment", time: "10:00 AM", day: 18, month: today.getMonth(), year: today.getFullYear(), user: "me" },
  { id: "e3", title: "Dinner with parents", time: "6:30 PM", day: 20, month: today.getMonth(), year: today.getFullYear(), user: "partner" },
  { id: "e4", title: "Grocery run", time: "11:00 AM", day: 22, month: today.getMonth(), year: today.getFullYear(), user: "both" },
];

const initialTasks: Task[] = [
  { id: "t1", title: "Review design mockups", time: "10:30 AM", tag: "Work", assignee: "me", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
  { id: "t2", title: "Call mom about weekend", time: "2:00 PM", tag: "Personal", assignee: "me", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
  { id: "t3", title: "Walk Cookie at 4 PM", time: "4:00 PM", tag: "Household", assignee: "partner", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
  { id: "t4", title: "Pay taxes", time: "", tag: "Personal", assignee: "me", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
  { id: "t5", title: "Buy birthday gift for Sarah", time: "", tag: "Personal", assignee: "me", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
  { id: "t6", title: "Organize pantry", time: "", tag: "Household", assignee: "partner", done: false, scheduledDay: today.getDate(), scheduledMonth: today.getMonth(), scheduledYear: today.getFullYear() },
];

const todayKey = todayStr();
const initialWorkouts: Workout[] = [
  { id: "w1", title: "Morning Run", duration: "30 min", cal: 250, tag: "Cardio", emoji: "🏃", done: false, scheduledDate: todayKey },
  { id: "w2", title: "Strength Training", duration: "45 min", cal: 320, tag: "Strength", emoji: "💪", done: false, scheduledDate: todayKey },
  { id: "w3", title: "Yoga Session", duration: "20 min", cal: 100, tag: "Flexibility", emoji: "🧘", done: false, scheduledDate: todayKey },
  { id: "w4", title: "Evening Walk", duration: "25 min", cal: 80, tag: "Cardio", emoji: "🚶", done: false, scheduledDate: todayKey },
];

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [events, setEvents] = useState<ScheduledEvent[]>(initialEvents);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [waterIntake, setWaterIntakeState] = useState(0);
  const [waterGoal, setWaterGoalState] = useState(3);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialWorkouts);

  const toggleHabit = (id: string) => {
    const dateKey = todayStr();
    setHabits((h) =>
      h.map((item) => {
        if (item.id !== id) return item;
        const wasDone = item.completionDates.includes(dateKey);
        return {
          ...item,
          done: !item.done,
          completionDates: wasDone
            ? item.completionDates.filter((d) => d !== dateKey)
            : [...item.completionDates, dateKey],
        };
      })
    );
  };

  const addHabit = (label: string, category: "morning" | "other") => {
    setHabits((h) => [...h, { id: Date.now().toString(), label, done: false, category, completionDates: [] }]);
  };

  const addEvent = (event: Omit<ScheduledEvent, "id">) => {
    setEvents((e) => [...e, { ...event, id: Date.now().toString() }]);
  };

  const removeEvent = (id: string) => {
    setEvents((e) => e.filter((item) => item.id !== id));
  };

  const toggleTask = (id: string) => {
    setTasks((t) => t.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const addTask = (task: Omit<Task, "id" | "done">) => {
    setTasks((t) => [...t, { ...task, id: Date.now().toString(), done: false }]);
  };

  const removeTask = (id: string) => {
    setTasks((t) => t.filter((item) => item.id !== id));
  };

  const updateTask = (id: string, updates: Partial<Pick<Task, "scheduledDay" | "scheduledMonth" | "scheduledYear" | "time">>) => {
    setTasks((t) => t.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const setWaterIntake = (amount: number) => {
    setWaterIntakeState(Math.max(0, Math.min(amount, waterGoal)));
  };

  const resetWater = () => setWaterIntakeState(0);
  const setWaterGoal = (goal: number) => setWaterGoalState(goal);

  const toggleWorkout = (id: string) => {
    const dateKey = todayStr();
    setWorkoutsState((w) =>
      w.map((item) =>
        item.id === id
          ? { ...item, done: !item.done, completedDate: !item.done ? dateKey : undefined }
          : item
      )
    );
  };

  const removeWorkout = (id: string) => {
    setWorkoutsState((w) => w.filter((item) => item.id !== id));
  };

  const setWorkouts = (newWorkouts: Workout[]) => {
    setWorkoutsState(newWorkouts);
  };

  const addWorkouts = (newWorkouts: Workout[]) => {
    setWorkoutsState((w) => [...w, ...newWorkouts]);
  };

  const rescheduleWorkout = (id: string, newDate: string) => {
    setWorkoutsState((w) =>
      w.map((item) =>
        item.id === id ? { ...item, scheduledDate: newDate } : item
      )
    );
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

  const getHabitsForDate = useCallback((date: string) => {
    return habits.map((h) => ({
      ...h,
      done: h.completionDates.includes(date),
    }));
  }, [habits]);

  const getWorkoutsForDate = useCallback((date: string) => {
    return workouts.filter((w) => w.scheduledDate === date || w.completedDate === date);
  }, [workouts]);

  return (
    <AppContext.Provider value={{
      habits, toggleHabit, addHabit,
      events, addEvent, removeEvent,
      tasks, toggleTask, addTask, removeTask, updateTask,
      waterIntake, waterGoal, setWaterIntake, setWaterGoal, resetWater,
      workouts, toggleWorkout, removeWorkout, setWorkouts, addWorkouts, rescheduleWorkout,
      getHabitStreak, getHabitsForDate, getWorkoutsForDate,
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
