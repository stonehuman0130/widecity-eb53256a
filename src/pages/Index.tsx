import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import SettingsPage from "@/components/SettingsPage";
import AuthPage from "@/components/AuthPage";
import { AppProvider } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

type Tab = "home" | "workout" | "habits" | "calendar" | "settings";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const pages: Record<Tab, React.ReactNode> = {
    home: <HomePage />,
    workout: <WorkoutsPage />,
    habits: <HabitsPage />,
    calendar: <CalendarPage />,
    settings: <SettingsPage />,
  };

  return (
    <AppProvider>
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
    </AppProvider>
  );
};

export default Index;
