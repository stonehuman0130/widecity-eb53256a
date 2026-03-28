import { useState } from "react";
import { Settings, MoreVertical, Navigation, X, PanelLeft, MoreHorizontal } from "lucide-react";
import { ALL_PAGE_META, CUSTOMIZABLE_PAGE_IDS, FIXED_NAV_PAGES, MAX_NAV_SLOTS, type Tab } from "@/components/BottomNav";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import type { NavStyle } from "@/hooks/useNavStyle";

interface MorePageProps {
  navPages: Tab[];
  onNavigate: (tab: Tab) => void;
  onAddToNav: (pageId: Tab) => void;
  onRemoveFromNav: (pageId: Tab) => void;
  onReplaceInNav: (oldPageId: Tab, newPageId: Tab) => void;
  onOpenSettings: () => void;
  navStyle?: NavStyle;
  onNavStyleChange?: (style: NavStyle) => void;
}

const MorePage = ({ navPages, onNavigate, onAddToNav, onRemoveFromNav, onReplaceInNav, onOpenSettings }: MorePageProps) => {
  const [replaceTarget, setReplaceTarget] = useState<Tab | null>(null);

  const isInNav = (id: Tab) => navPages.includes(id);
  const isFixed = (id: Tab) => FIXED_NAV_PAGES.includes(id);
  const navIsFull = navPages.length >= MAX_NAV_SLOTS;

  const handleAddToNav = (pageId: Tab) => {
    if (navIsFull) {
      setReplaceTarget(pageId);
    } else {
      onAddToNav(pageId);
    }
  };

  const handleReplace = (oldPageId: Tab) => {
    if (replaceTarget) {
      onReplaceInNav(oldPageId, replaceTarget);
      setReplaceTarget(null);
    }
  };

  // Removable nav pages for the replace drawer
  const removableNavPages = navPages.filter(p => !isFixed(p));

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">More</h1>
      </div>

      <div className="px-4 space-y-1 flex-1">
        {CUSTOMIZABLE_PAGE_IDS.filter(id => !FIXED_NAV_PAGES.includes(id)).map((pageId) => {
          const meta = ALL_PAGE_META[pageId];
          if (!meta) return null;
          const Icon = meta.icon;
          const inNav = isInNav(pageId);
          const fixed = isFixed(pageId);

          return (
            <div key={pageId} className="flex items-center gap-3 rounded-xl hover:bg-secondary/50 transition-colors">
              <button
                onClick={() => onNavigate(pageId)}
                className="flex items-center gap-3 flex-1 p-3"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  inNav ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                }`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                    {inNav && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        In Nav
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground mr-1">
                    <MoreVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {!inNav && (
                    <DropdownMenuItem onClick={() => handleAddToNav(pageId)}>
                      <Navigation size={14} className="mr-2" />
                      Add to Navigation Bar
                    </DropdownMenuItem>
                  )}
                  {inNav && !fixed && (
                    <DropdownMenuItem onClick={() => onRemoveFromNav(pageId)}>
                      <X size={14} className="mr-2" />
                      Remove from Navigation Bar
                    </DropdownMenuItem>
                  )}
                  {inNav && fixed && (
                    <DropdownMenuItem disabled className="text-muted-foreground">
                      <Navigation size={14} className="mr-2" />
                      Fixed in Navigation
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        {/* Divider */}
        <div className="pt-2 pb-1">
          <div className="h-px bg-border" />
        </div>

        {/* Settings row */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Settings size={20} />
          </div>
          <div className="flex-1 text-left">
            <span className="text-sm font-semibold text-foreground">Settings</span>
            <p className="text-xs text-muted-foreground">Account, appearance & preferences</p>
          </div>
        </button>
      </div>

      {/* Replace drawer */}
      <Drawer open={!!replaceTarget} onOpenChange={(v) => { if (!v) setReplaceTarget(null); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Replace a Navigation Page</DrawerTitle>
            <DrawerDescription>
              Your navigation bar is full. Choose a page to replace
              {replaceTarget && ALL_PAGE_META[replaceTarget] ? ` with ${ALL_PAGE_META[replaceTarget].label}` : ""}.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-2">
            {removableNavPages.map((pageId) => {
              const meta = ALL_PAGE_META[pageId];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={pageId}
                  onClick={() => handleReplace(pageId)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-destructive/10 hover:border-destructive/30 transition-all"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary text-muted-foreground">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">Replace this page</p>
                  </div>
                </button>
              );
            })}
            {removableNavPages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No removable pages. Calendar is fixed in your navigation.
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default MorePage;
