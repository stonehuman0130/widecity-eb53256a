import { Home, CalendarDays, MessageCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { Dumbbell, Heart, Clock, Sparkles } from "lucide-react";

export type Tab = "home" | "workout" | "habits" | "sobriety" | "specialdays" | "calendar" | "chat" | "settings";

export interface EnabledPages {
  workout: boolean;
  habits: boolean;
  sobriety: boolean;
  specialdays: boolean;
}

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  enabledPages: EnabledPages;
  onTogglePage: (page: keyof EnabledPages) => void;
}

const OPTIONAL_PAGES: { id: keyof EnabledPages; label: string; icon: typeof Dumbbell; desc: string }[] = [
  { id: "workout", label: "Workout", icon: Dumbbell, desc: "Track workouts and exercise plans" },
  { id: "habits", label: "Habits", icon: Heart, desc: "Daily habit tracking and streaks" },
  { id: "sobriety", label: "Sobriety Day Count", icon: Clock, desc: "Track sobriety milestones" },
  { id: "specialdays", label: "Special Days", icon: Sparkles, desc: "Track anniversaries, birthdays & milestones" },
];

const BottomNav = ({ activeTab, onTabChange, enabledPages, onTogglePage }: BottomNavProps) => {
  const [showMore, setShowMore] = useState(false);

  // Build dynamic tabs: always Home, Calendar, Chat + enabled optional pages, then More
  const coreTabs: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
  ];

  // Insert enabled optional pages before Calendar
  if (enabledPages.workout) coreTabs.push({ id: "workout", label: "Workout", icon: Dumbbell });
  if (enabledPages.habits) coreTabs.push({ id: "habits", label: "Habits", icon: Heart });
  if (enabledPages.sobriety) coreTabs.push({ id: "sobriety", label: "Sobriety", icon: Clock });

  coreTabs.push(
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "chat", label: "Chat", icon: MessageCircle },
  );

  return (
    <>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50">
        <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {coreTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
                  isActive ? "text-nav-active" : "text-nav-inactive"
                }`}
              >
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[9px] font-medium">{tab.label}</span>
              </button>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors text-nav-inactive"
          >
            <MoreHorizontal size={20} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Drawer open={showMore} onOpenChange={setShowMore}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Customize Pages</DrawerTitle>
            <DrawerDescription>Add or remove optional pages from your navigation.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-2">
            {OPTIONAL_PAGES.map((page) => {
              const enabled = enabledPages[page.id];
              return (
                <button
                  key={page.id}
                  onClick={() => onTogglePage(page.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    enabled
                      ? "bg-primary/10 border-primary/30"
                      : "bg-card border-border"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    enabled ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  }`}>
                    <page.icon size={20} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-semibold ${enabled ? "text-primary" : "text-foreground"}`}>
                      {page.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{page.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    enabled ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}>
                    {enabled && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                        <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default BottomNav;
