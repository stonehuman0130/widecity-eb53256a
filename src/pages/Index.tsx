import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
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
import AppDrawer from "@/components/AppDrawer";
import DrawerMenuButton from "@/components/DrawerMenuButton";
import { AppProvider } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import { useNavStyle } from "@/hooks/useNavStyle";
import { Loader2 } from "lucide-react";

type FullTab = "launcher" | Tab;

const SWIPE_THRESHOLD = 80;

const Index = () => {
  const { user, loading, groups, activeGroup, setActiveGroup } = useAuth();
  const [activeTab, setActiveTab] = useState<FullTab>("launcher");
  const [navPages, setNavPages] = useState<Tab[]>(() => loadNavPages());
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [chatMode, setChatMode] = useState<"list" | "chat">("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { navStyle, setNavStyle } = useNavStyle();

  // Swipe-to-launcher state
  const [swiping, setSwiping] = useState(false);
  const swipeX = useMotionValue(0);

  // 3D cube rotation transforms for swipe — must be before any early returns
  const rotateY = useTransform(swipeX, [-300, 0], [-45, 0]);
  const scale = useTransform(swipeX, [-300, 0], [0.88, 1]);
  const opacity = useTransform(swipeX, [-300, 0], [0.6, 1]);

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

  const handleDrawerNavigate = (tab: Tab | "settings") => {
    if (tab === "settings") {
      setActiveTab("settings");
    } else {
      handleTabChange(tab as Tab);
    }
  };

  const handleAiSubmit = (text: string) => {
    // Navigate to AI page - the text could be pre-filled but for now just navigate
    setActiveTab("ai");
  };

  // Swipe handlers for Home → Launcher
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (activeTab === "home" && info.offset.x < -SWIPE_THRESHOLD && info.velocity.x < -100) {
      handleBackToLauncher();
    }
    swipeX.set(0);
    setSwiping(false);
  };

  const handleDrag = (_: any, info: PanInfo) => {
    // Only track leftward drags on home
    if (activeTab === "home" && info.offset.x < 0) {
      setSwiping(true);
    }
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onOpenSettings={handleOpenSettings} />,
    workout: <WorkoutsPage />,
    nutrition: <NutritionPage />,
    habits: <HabitsPage />,
    sobriety: <SobrietyPage />,
    specialdays: <SpecialDaysPage />,
    shopping: <ShoppingListPage />,
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
        navStyle={navStyle}
        onNavStyleChange={setNavStyle}
      />
    ),
  };

  const isInnerPage = activeTab !== "launcher";
  const showBottomNav = isInnerPage && navStyle === "bottom";
  const showDrawerButton = isInnerPage && navStyle === "drawer";

  // 3D cube rotation transforms for swipe
  const rotateY = useTransform(swipeX, [-300, 0], [-45, 0]);
  const scale = useTransform(swipeX, [-300, 0], [0.88, 1]);
  const opacity = useTransform(swipeX, [-300, 0], [0.6, 1]);

  // Determine transition variants based on whether we're going to/from launcher
  const isGoingToLauncher = activeTab === "launcher";

  return (
    <AppProvider>
      <div className="flex flex-col w-full max-w-md mx-auto bg-background h-svh relative overflow-hidden" style={{ perspective: "1200px" }}>
        <AnimatePresence mode="wait">
          {activeTab === "launcher" ? (
            <motion.div
              key="launcher"
              initial={{ opacity: 0, rotateY: -60, x: "-40%", scale: 0.85 }}
              animate={{ opacity: 1, rotateY: 0, x: "0%", scale: 1 }}
              exit={{ opacity: 0, rotateY: 60, x: "40%", scale: 0.85 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 overflow-y-auto scroll-smooth-touch"
              style={{ transformStyle: "preserve-3d", transformOrigin: "center center" }}
            >
              {pages.launcher}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab === "chat" ? `chat-${chatGroup?.id || "list"}` : activeTab}
              initial={{ opacity: 0, rotateY: 30, x: "20%", scale: 0.9 }}
              animate={{ opacity: 1, rotateY: 0, x: "0%", scale: 1 }}
              exit={{ opacity: 0, rotateY: -60, x: "-40%", scale: 0.85 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              drag={activeTab === "home" ? "x" : false}
              dragConstraints={{ left: -300, right: 0 }}
              dragElastic={0.15}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              style={{
                x: activeTab === "home" ? swipeX : undefined,
                rotateY: activeTab === "home" ? rotateY : undefined,
                transformStyle: "preserve-3d",
                transformOrigin: "right center",
              }}
              className={`flex-1 overflow-y-auto scroll-smooth-touch ${isInnerPage ? (showBottomNav ? "pb-24" : "pb-4") : ""}`}
            >
              {pages[activeTab]}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
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

        {/* Drawer Menu Button */}
        {showDrawerButton && (
          <DrawerMenuButton onClick={() => setDrawerOpen(true)} />
        )}

        {/* Side Drawer */}
        <AppDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          activeTab={activeTab}
          onNavigate={handleDrawerNavigate}
          navStyle={navStyle}
          onNavStyleChange={setNavStyle}
          onAiSubmit={handleAiSubmit}
        />
      </div>
    </AppProvider>
  );
};

export default Index;
