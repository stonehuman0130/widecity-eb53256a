import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import SettingsPage from "@/components/SettingsPage";

type Tab = "home" | "workout" | "habits" | "calendar" | "settings";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");

  const pages: Record<Tab, React.ReactNode> = {
    home: <HomePage />,
    workout: <WorkoutsPage />,
    habits: <HabitsPage />,
    calendar: <CalendarPage />,
    settings: <SettingsPage />,
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto bg-background min-h-svh relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.15 }}
          className="flex-1 pb-24 overflow-y-auto"
        >
          {pages[activeTab]}
        </motion.div>
      </AnimatePresence>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
