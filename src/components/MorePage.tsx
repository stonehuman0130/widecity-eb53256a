import { useState } from "react";
import { LayoutGrid, Settings, Dumbbell, Heart, Clock, Sparkles } from "lucide-react";
import { EnabledPages } from "@/components/BottomNav";

interface MorePageProps {
  onOpenSettings: () => void;
  enabledPages: EnabledPages;
  onTogglePage: (page: keyof EnabledPages) => void;
}

const MorePage = ({ onOpenSettings, enabledPages, onTogglePage }: MorePageProps) => {
  const [showCustomize, setShowCustomize] = useState(false);

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">More</h1>
        <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-secondary">
          <Settings size={20} className="text-muted-foreground" />
        </button>
      </div>

      <div className="px-5 space-y-2">
        <button
          onClick={() => setShowCustomize(true)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:bg-secondary/50 transition-colors"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid size={20} className="text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Customize Pages</p>
            <p className="text-xs text-muted-foreground">Add or remove pages from navigation</p>
          </div>
        </button>
      </div>

      {/* Customize Pages popup — reuses existing drawer UI */}
      {showCustomize && (
        <CustomizePagesDrawer
          open={showCustomize}
          onOpenChange={setShowCustomize}
          enabledPages={enabledPages}
          onTogglePage={onTogglePage}
        />
      )}
    </div>
  );
};

/* ── extracted drawer (same UI that was in BottomNav) ── */
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";

const OPTIONAL_PAGES: { id: keyof EnabledPages; label: string; icon: typeof Dumbbell; desc: string }[] = [
  { id: "workout", label: "Workout", icon: Dumbbell, desc: "Track workouts and exercise plans" },
  { id: "habits", label: "Habits", icon: Heart, desc: "Daily habit tracking and streaks" },
  { id: "sobriety", label: "Sobriety Day Count", icon: Clock, desc: "Track sobriety milestones" },
  { id: "specialdays", label: "Special Days", icon: Sparkles, desc: "Track anniversaries, birthdays & milestones" },
];

function CustomizePagesDrawer({
  open,
  onOpenChange,
  enabledPages,
  onTogglePage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enabledPages: EnabledPages;
  onTogglePage: (page: keyof EnabledPages) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
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
                  enabled ? "bg-primary/10 border-primary/30" : "bg-card border-border"
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
  );
}

export default MorePage;
