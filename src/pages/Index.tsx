import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MorePage from "@/components/MorePage";
import BottomNav, { type Tab, loadNavPages, saveNavPages, FIXED_NAV_PAGES, MAX_NAV_SLOTS } from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import NutritionPage from "@/components/NutritionPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import ChatListPage from "@/components/ChatListPage";
import ChatPage from "@/components/ChatPage";
import AiAssistantPage from "@/components/AiAssistantPage";
import SobrietyPage from "@/components/SobrietyPage";
import SpecialDaysPage from "@/components/SpecialDaysPage";
import SettingsPage from "@/components/SettingsPage";
import ShoppingListPage from "@/components/ShoppingListPage";
import LauncherPage from "@/components/LauncherPage";
import AuthPage from "@/components/AuthPage";
import { AppProvider } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

type FullTab = "launcher" | Tab;

const Index = () => {
  const { user, loading, groups, activeGroup, setActiveGroup } = useAuth();
  const [activeTab, setActiveTab] = useState<FullTab>("launcher");
  const [navPages, setNavPages] = useState<Tab[]>(() => loadNavPages());
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [chatMode, setChatMode] = useState<"list" | "chat">("list");

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

  const handleAddToNav = (pageId: Tab) => {
    if (navPages.includes(pageId) || navPages.length >= MAX_NAV_SLOTS) return;
    const updated = [...navPages, pageId];
    setNavPages(updated);
    saveNavPages(updated);
  };

  const handleRemoveFromNav = (pageId: Tab) => {
    if (FIXED_NAV_PAGES.includes(pageId)) return;
    const updated = navPages.filter(p => p !== pageId);
    setNavPages(updated);
    saveNavPages(updated);
  };

  const handleReplaceInNav = (oldPageId: Tab, newPageId: Tab) => {
    if (FIXED_NAV_PAGES.includes(oldPageId)) return;
    const updated = navPages.map(p => p === oldPageId ? newPageId : p);
    setNavPages(updated);
    saveNavPages(updated);
  };

  const handleOpenChat = (group: Group) => {
    setChatGroup(group);
    setChatMode("chat");
  };

  const handleBackToList = () => {
    setChatGroup(null);
    setChatMode("list");
  };

  const renderChatView = () => {
    if (chatGroup && chatMode === "chat") {
      return <ChatPage group={chatGroup} onBack={handleBackToList} />;
    }
    return <ChatListPage onOpenChat={handleOpenChat} />;
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onBackToLauncher={handleBackToLauncher} />,
    workout: <WorkoutsPage />,
    nutrition: <NutritionPage />,
    habits: <HabitsPage />,
    sobriety: <SobrietyPage />,
    specialdays: <SpecialDaysPage />,
    calendar: <CalendarPage />,
    chat: renderChatView(),
    ai: <AiAssistantPage />,
    settings: <SettingsPage />,
    more: (
      <MorePage
        navPages={navPages}
        onNavigate={handleTabChange}
        onAddToNav={handleAddToNav}
        onRemoveFromNav={handleRemoveFromNav}
        onReplaceInNav={handleReplaceInNav}
        onOpenSettings={handleOpenSettings}
      />
    ),
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
            navPages={navPages}
            onReorder={(newPages) => {
              setNavPages(newPages);
              saveNavPages(newPages);
            }}
          />
        )}
      </div>
    </AppProvider>
  );
};

export default Index;
