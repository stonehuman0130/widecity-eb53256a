import { createContext, useContext, useState, ReactNode } from "react";

export interface Habit {
  id: string;
  label: string;
  done: boolean;
  category: "morning" | "other";
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
  assignee: "me" | "partner";
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
  exercises?: { name: string; sets: number; reps: string; }[];
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
  addWater: (amount: number) => void;
  setWaterGoal: (goal: number) => void;
  resetWater: () => void;
  workouts: Workout[];
  toggleWorkout: (id: string) => void;
  removeWorkout: (id: string) => void;
  setWorkouts: (workouts: Workout[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const today = new Date();

const initialHabits: Habit[] = [
  { id: "1", label: "Drink Olive Oil", done: false, category: "morning" },
  { id: "2", label: "Take Vitamins", done: false, category: "morning" },
  { id: "3", label: "Stretch", done: false, category: "morning" },
  { id: "4", label: "Meditation", done: false, category: "other" },
  { id: "5", label: "Read 10 Pages", done: false, category: "other" },
  { id: "6", label: "Gratitude Journal", done: false, category: "other" },
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

const initialWorkouts: Workout[] = [
  { id: "w1", title: "Morning Run", duration: "30 min", cal: 250, tag: "Cardio", emoji: "🏃", done: false },
  { id: "w2", title: "Strength Training", duration: "45 min", cal: 320, tag: "Strength", emoji: "💪", done: false },
  { id: "w3", title: "Yoga Session", duration: "20 min", cal: 100, tag: "Flexibility", emoji: "🧘", done: false },
  { id: "w4", title: "Evening Walk", duration: "25 min", cal: 80, tag: "Cardio", emoji: "🚶", done: false },
];

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [events, setEvents] = useState<ScheduledEvent[]>(initialEvents);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [waterIntake, setWaterIntake] = useState(0);
  const [waterGoal, setWaterGoalState] = useState(3);
  const [workouts, setWorkoutsState] = useState<Workout[]>(initialWorkouts);

  const toggleHabit = (id: string) => {
    setHabits((h) => h.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const addHabit = (label: string, category: "morning" | "other") => {
    setHabits((h) => [...h, { id: Date.now().toString(), label, done: false, category }]);
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

  const addWater = (amount: number) => {
    setWaterIntake((w) => Math.min(w + amount, waterGoal));
  };

  const resetWater = () => setWaterIntake(0);
  const setWaterGoal = (goal: number) => setWaterGoalState(goal);

  const toggleWorkout = (id: string) => {
    setWorkoutsState((w) => w.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const removeWorkout = (id: string) => {
    setWorkoutsState((w) => w.filter((item) => item.id !== id));
  };

  const setWorkouts = (newWorkouts: Workout[]) => {
    setWorkoutsState(newWorkouts);
  };

  return (
    <AppContext.Provider value={{
      habits, toggleHabit, addHabit,
      events, addEvent, removeEvent,
      tasks, toggleTask, addTask, removeTask, updateTask,
      waterIntake, waterGoal, addWater, setWaterGoal, resetWater,
      workouts, toggleWorkout, removeWorkout, setWorkouts,
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
