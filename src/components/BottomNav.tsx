import { Home, CalendarDays, MessageCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { Dumbbell, Heart, Clock, Sparkles } from "lucide-react";

export type Tab = "home" | "workout" | "habits" | "sobriety" | "specialdays" | "calendar" | "chat" | "settings" | "more";

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

const BottomNav = ({ activeTab, onTabChange, enabledPages }: BottomNavProps) => {
  const coreTabs: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
  ];

  if (enabledPages.workout) coreTabs.push({ id: "workout", label: "Workout", icon: Dumbbell });
  if (enabledPages.habits) coreTabs.push({ id: "habits", label: "Habits", icon: Heart });
  if (enabledPages.sobriety) coreTabs.push({ id: "sobriety", label: "Sobriety", icon: Clock });
  if (enabledPages.specialdays) coreTabs.push({ id: "specialdays", label: "Special", icon: Sparkles });

  coreTabs.push(
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "chat", label: "Chat", icon: MessageCircle },
  );

  return (
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
        <button
          onClick={() => onTabChange("more")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
            activeTab === "more" ? "text-nav-active" : "text-nav-inactive"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={activeTab === "more" ? 2.5 : 1.8} />
          <span className="text-[9px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
