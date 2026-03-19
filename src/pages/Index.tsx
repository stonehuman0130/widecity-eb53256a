import { useState, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import SettingsPage from "@/components/SettingsPage";
import LauncherPage from "@/components/LauncherPage";
import AuthPage from "@/components/AuthPage";
import { AppProvider } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

type Tab = "launcher" | "home" | "workout" | "habits" | "calendar" | "settings";

const Index = () => {
  const { user, loading, groups, setActiveGroup } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("launcher");

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

  const handleEnterGroup = (groupId: string | null) => {
    if (groupId) {
      const group = groups.find((g) => g.id === groupId);
      if (group) setActiveGroup(group);
    } else {
      setActiveGroup(null);
    }
    setActiveTab("home");
  };

  const handleBackToLauncher = () => {
    setActiveTab("launcher");
  };

  const handleTabChange = (tab: "home" | "workout" | "habits" | "calendar" | "settings") => {
    setActiveTab(tab);
  };

  // Swipe right on inner pages → back to launcher
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (activeTab !== "launcher" && info.offset.x > 100 && info.velocity.x > 200) {
      handleBackToLauncher();
    }
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} />,
    home: <HomePage onBackToLauncher={handleBackToLauncher} />,
    workout: <WorkoutsPage />,
    habits: <HabitsPage />,
    calendar: <CalendarPage />,
    settings: <SettingsPage />,
  };

  const isInnerPage = activeTab !== "launcher";

  return (
    <AppProvider>
      <div className="flex flex-col w-full max-w-md mx-auto bg-background min-h-svh relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: activeTab === "launcher" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: activeTab === "launcher" ? 20 : -20 }}
            transition={{ duration: 0.15 }}
            className={`flex-1 overflow-y-auto ${isInnerPage ? "pb-24" : ""}`}
            drag={isInnerPage ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ touchAction: isInnerPage ? "pan-y" : "auto" }}
          >
            {pages[activeTab]}
          </motion.div>
        </AnimatePresence>
        {isInnerPage && (
          <BottomNav activeTab={activeTab === "launcher" ? "home" : activeTab} onTabChange={handleTabChange} />
        )}
      </div>
    </AppProvider>
  );
};

export default Index;
