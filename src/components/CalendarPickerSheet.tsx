import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface CalendarEntry {
  id: string;
  name: string;
  color: string;
  provider: string;
  providerAccountId: string | null;
  isDefault: boolean;
}

interface ProviderGroup {
  key: string;
  label: string;
  icon: string;
  accountLabel?: string;
  calendars: CalendarEntry[];
}

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  local: { label: "My Calendars", icon: "📅" },
  google: { label: "Google", icon: "🔵" },
  apple: { label: "iCloud", icon: "☁️" },
  outlook: { label: "Outlook", icon: "📧" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCalendarId: string | null;
  onSelect: (calendarId: string, calendarColor: string, calendarName: string) => void;
}

const CalendarPickerSheet = ({ open, onClose, selectedCalendarId, onSelect }: Props) => {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const fetchCalendars = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calendars")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setCalendars(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          provider: c.provider,
          providerAccountId: c.provider_account_id,
          isDefault: c.is_default,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) fetchCalendars();
  }, [open, fetchCalendars]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    calendars.forEach((c) => {
      const key = c.providerAccountId ? `${c.provider}::${c.providerAccountId}` : c.provider;
      const arr = grouped.get(key) || [];
      arr.push(c);
      grouped.set(key, arr);
    });

    const order = ["local", "google", "apple", "outlook"];
    const sortedKeys = [...grouped.keys()].sort((a, b) => {
      const pA = a.split("::")[0];
      const pB = b.split("::")[0];
      return (order.indexOf(pA) === -1 ? 99 : order.indexOf(pA)) - (order.indexOf(pB) === -1 ? 99 : order.indexOf(pB));
    });

    return sortedKeys.map((key) => {
      const cals = grouped.get(key)!;
      const provider = key.split("::")[0];
      const accountId = key.includes("::") ? key.split("::")[1] : null;
      const meta = PROVIDER_META[provider] || { label: provider, icon: "📅" };
      return {
        key,
        label: meta.label,
        icon: meta.icon,
        accountLabel: accountId || undefined,
        calendars: cals,
      };
    });
  }, [calendars]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="absolute inset-0 z-[70] bg-background flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <button onClick={onClose} className="text-sm font-medium text-primary">
          Back
        </button>
        <h2 className="text-[15px] font-semibold text-foreground">Calendar</h2>
        <div className="w-12" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scroll-smooth-touch">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calendars.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">No calendars available</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Create a calendar from the Calendars manager</p>
          </div>
        ) : (
          <div className="py-2">
            {providerGroups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.key);
              return (
                <div key={group.key}>
                  {/* Provider header */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="flex items-center justify-between w-full px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">{group.icon}</span>
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </span>
                        {group.accountLabel && (
                          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">
                            {group.accountLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isCollapsed ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronUp size={14} className="text-muted-foreground" />
                    )}
                  </button>

                  {/* Calendar list */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {group.calendars.map((cal) => {
                          const isSelected = selectedCalendarId === cal.id;
                          return (
                            <button
                              key={cal.id}
                              onClick={() => {
                                onSelect(cal.id, cal.color, cal.name);
                                onClose();
                              }}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                                isSelected ? "bg-primary/5" : "hover:bg-secondary/50"
                              )}
                            >
                              {/* Color dot */}
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cal.color }}
                              />

                              {/* Name */}
                              <span className={cn(
                                "flex-1 text-[15px] text-left truncate",
                                isSelected ? "font-semibold text-foreground" : "text-foreground"
                              )}>
                                {cal.name}
                              </span>

                              {/* Checkmark */}
                              {isSelected && (
                                <Check size={18} className="text-primary flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CalendarPickerSheet;
