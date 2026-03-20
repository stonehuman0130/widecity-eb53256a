import { useState, useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import BottomNav, { type Tab, type EnabledPages } from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import ChatPage from "@/components/ChatPage";
import SettingsPage from "@/components/SettingsPage";
import LauncherPage from "@/components/LauncherPage";
import AuthPage from "@/components/AuthPage";
import { AppProvider } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

type FullTab = "launcher" | Tab;

const DEFAULT_ENABLED: EnabledPages = { workout: false, habits: false, sobriety: false };

function getStorageKey(groupId: string | null) {
  return `enabledPages_${groupId || "personal"}`;
}

function loadEnabledPages(groupId: string | null): EnabledPages {
  try {
    const raw = localStorage.getItem(getStorageKey(groupId));
    if (raw) return { ...DEFAULT_ENABLED, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_ENABLED };
}

function saveEnabledPages(groupId: string | null, pages: EnabledPages) {
  localStorage.setItem(getStorageKey(groupId), JSON.stringify(pages));
}

const Index = () => {
  const { user, loading, groups, activeGroup, setActiveGroup } = useAuth();
  const [activeTab, setActiveTab] = useState<FullTab>("launcher");
  const [enabledPages, setEnabledPages] = useState<EnabledPages>(DEFAULT_ENABLED);

  // Load enabled pages when active group changes
  useEffect(() => {
    setEnabledPages(loadEnabledPages(activeGroup?.id ?? null));
  }, [activeGroup?.id]);

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

  const handleOpenSettings = () => {
    setActiveTab("settings");
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
  };

  const handleTogglePage = (page: keyof EnabledPages) => {
    const updated = { ...enabledPages, [page]: !enabledPages[page] };
    setEnabledPages(updated);
    saveEnabledPages(activeGroup?.id ?? null, updated);
  };

  // Swipe right on inner pages → back to launcher
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (activeTab !== "launcher" && info.offset.x > 100 && info.velocity.x > 200) {
      handleBackToLauncher();
    }
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onBackToLauncher={handleBackToLauncher} onOpenSettings={handleOpenSettings} />,
    workout: <WorkoutsPage onOpenSettings={handleOpenSettings} />,
    habits: <HabitsPage onOpenSettings={handleOpenSettings} />,
    calendar: <CalendarPage onOpenSettings={handleOpenSettings} />,
    chat: <ChatPage onOpenSettings={handleOpenSettings} />,
    settings: <SettingsPage />,
  };

  const isInnerPage = activeTab !== "launcher";
  const showBottomNav = isInnerPage && activeTab !== "settings";

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
        {showBottomNav && (
          <BottomNav
            activeTab={activeTab as Tab}
            onTabChange={handleTabChange}
            enabledPages={enabledPages}
            onTogglePage={handleTogglePage}
          />
        )}
      </div>
    </AppProvider>
  );
};

export default Index;
