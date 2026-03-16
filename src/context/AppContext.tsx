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
  day: number;
  month: number;
  year: number;
  user: "me" | "partner" | "both";
}

interface AppContextType {
  habits: Habit[];
  toggleHabit: (id: string) => void;
  addHabit: (label: string, category: "morning" | "other") => void;
  events: ScheduledEvent[];
  addEvent: (event: Omit<ScheduledEvent, "id">) => void;
  removeEvent: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialHabits: Habit[] = [
  { id: "1", label: "Drink Olive Oil", done: false, category: "morning" },
  { id: "2", label: "Take Vitamins", done: false, category: "morning" },
  { id: "3", label: "Stretch", done: false, category: "morning" },
  { id: "4", label: "Meditation", done: false, category: "other" },
  { id: "5", label: "Read 10 Pages", done: false, category: "other" },
  { id: "6", label: "Gratitude Journal", done: false, category: "other" },
];

const today = new Date();
const initialEvents: ScheduledEvent[] = [
  { id: "e1", title: "Date night", time: "7:00 PM", day: 16, month: today.getMonth(), year: today.getFullYear(), user: "both" },
  { id: "e2", title: "Dentist appointment", time: "10:00 AM", day: 18, month: today.getMonth(), year: today.getFullYear(), user: "me" },
  { id: "e3", title: "Dinner with parents", time: "6:30 PM", day: 20, month: today.getMonth(), year: today.getFullYear(), user: "partner" },
  { id: "e4", title: "Grocery run", time: "11:00 AM", day: 22, month: today.getMonth(), year: today.getFullYear(), user: "both" },
];

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [events, setEvents] = useState<ScheduledEvent[]>(initialEvents);

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

  return (
    <AppContext.Provider value={{ habits, toggleHabit, addHabit, events, addEvent, removeEvent }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
