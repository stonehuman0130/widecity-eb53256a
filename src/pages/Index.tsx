import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MorePage from "@/components/MorePage";
import BottomNav, { type Tab, type EnabledPages } from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import ChatListPage from "@/components/ChatListPage";
import ChatPage from "@/components/ChatPage";
import AiCoachChat from "@/components/AiCoachChat";
import SobrietyPage from "@/components/SobrietyPage";
import SpecialDaysPage from "@/components/SpecialDaysPage";
import SettingsPage from "@/components/SettingsPage";
import LauncherPage from "@/components/LauncherPage";
import AuthPage from "@/components/AuthPage";
import { AppProvider } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

type FullTab = "launcher" | Tab;

const DEFAULT_ENABLED: EnabledPages = { workout: false, habits: false, sobriety: false, specialdays: false };

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
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [chatMode, setChatMode] = useState<"list" | "chat" | "coach">("list");
  const [coachInitialMessage, setCoachInitialMessage] = useState<string | undefined>();
  const [pendingScheduleMessage, setPendingScheduleMessage] = useState<string | null>(null);

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
    if (tab === "chat") {
      setChatGroup(null);
      setChatMode("list");
    }
    setActiveTab(tab);
  };

  const handleTogglePage = (page: keyof EnabledPages) => {
    const updated = { ...enabledPages, [page]: !enabledPages[page] };
    setEnabledPages(updated);
    saveEnabledPages(activeGroup?.id ?? null, updated);
  };

  const handleOpenChat = (group: Group) => {
    setChatGroup(group);
    setChatMode("chat");
  };

  const handleOpenCoach = (group: Group) => {
    setChatGroup(group);
    setChatMode("coach");
    setCoachInitialMessage(undefined);
  };

  const handleBackToList = () => {
    setChatGroup(null);
    setChatMode("list");
    setCoachInitialMessage(undefined);
  };

  const handleScheduleFromLauncher = (message: string) => {
    if (groups.length === 1) {
      // Single group — go directly to AI Coach
      const group = groups[0];
      setActiveGroup(group);
      setChatGroup(group);
      setChatMode("coach");
      setCoachInitialMessage(message);
      setActiveTab("chat");
    } else if (groups.length > 1) {
      // Multiple groups — store pending message, show group picker
      setPendingScheduleMessage(message);
    } else {
      // No groups — fall back to home
      setActiveGroup(null);
      setActiveTab("home");
    }
  };

  const handlePickGroupForSchedule = (group: Group) => {
    setActiveGroup(group);
    setChatGroup(group);
    setChatMode("coach");
    setCoachInitialMessage(pendingScheduleMessage || undefined);
    setPendingScheduleMessage(null);
    setActiveTab("chat");
  };

  const renderChatView = () => {
    if (chatGroup && chatMode === "coach") {
      return <AiCoachChat group={chatGroup} onBack={handleBackToList} />;
    }
    if (chatGroup && chatMode === "chat") {
      return <ChatPage group={chatGroup} onBack={handleBackToList} />;
    }
    return <ChatListPage onOpenChat={handleOpenChat} onOpenCoach={handleOpenCoach} onOpenSettings={handleOpenSettings} />;
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onBackToLauncher={handleBackToLauncher} onOpenSettings={handleOpenSettings} />,
    workout: <WorkoutsPage onOpenSettings={handleOpenSettings} />,
    habits: <HabitsPage onOpenSettings={handleOpenSettings} />,
    sobriety: <SobrietyPage onOpenSettings={handleOpenSettings} />,
    specialdays: <SpecialDaysPage onOpenSettings={handleOpenSettings} />,
    calendar: <CalendarPage onOpenSettings={handleOpenSettings} />,
    chat: renderChatView(),
    settings: <SettingsPage />,
    more: <MorePage onOpenSettings={handleOpenSettings} enabledPages={enabledPages} onTogglePage={handleTogglePage} />,
  };

  const isInnerPage = activeTab !== "launcher";
  const showBottomNav = isInnerPage;

  return (
    <AppProvider>
      <div className="flex flex-col w-full max-w-md mx-auto bg-background h-svh relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab === "chat" ? `chat-${chatGroup?.id || "list"}` : activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`flex-1 overflow-y-auto scroll-smooth-touch ${isInnerPage ? "pb-24" : ""}`}
          >
            {pages[activeTab]}
          </motion.div>
        </AnimatePresence>
        {showBottomNav && (
          <BottomNav
            activeTab={activeTab as Tab}
            onTabChange={handleTabChange}
            enabledPages={enabledPages}
          />
        )}
      </div>
    </AppProvider>
  );
};

export default Index;
