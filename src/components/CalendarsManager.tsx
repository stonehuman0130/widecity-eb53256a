import { useState, useEffect, useCallback } from "react";
import { X, Plus, Check, ChevronDown, ChevronUp, Info, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──

interface CalendarEntry {
  id: string;
  name: string;
  color: string;
  provider: string;
  providerAccountId: string | null;
  providerCalendarId: string | null;
  isVisible: boolean;
  isDefault: boolean;
  groupId: string | null;
  sortOrder: number;
}

interface ProviderGroup {
  provider: string;
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

const CALENDAR_COLORS = [
  { name: "Blue", value: "hsl(210 100% 50%)" },
  { name: "Red", value: "hsl(0 75% 55%)" },
  { name: "Green", value: "hsl(150 60% 42%)" },
  { name: "Purple", value: "hsl(270 60% 55%)" },
  { name: "Orange", value: "hsl(35 100% 52%)" },
  { name: "Teal", value: "hsl(190 80% 42%)" },
  { name: "Pink", value: "hsl(340 80% 55%)" },
  { name: "Yellow", value: "hsl(50 90% 48%)" },
  { name: "Indigo", value: "hsl(240 60% 55%)" },
  { name: "Emerald", value: "hsl(160 70% 40%)" },
  { name: "Rose", value: "hsl(350 80% 60%)" },
  { name: "Amber", value: "hsl(45 95% 50%)" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const CalendarsManager = ({ open, onClose }: Props) => {
  const { user, groups } = useAuth();
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // New calendar form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CALENDAR_COLORS[0].value);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const fetchCalendars = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calendars")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setCalendars(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          provider: c.provider,
          providerAccountId: c.provider_account_id,
          providerCalendarId: c.provider_calendar_id,
          isVisible: c.is_visible,
          isDefault: c.is_default,
          groupId: c.group_id,
          sortOrder: c.sort_order,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  // Sync Google calendars from connected accounts
  const syncGoogleCalendars = useCallback(async () => {
    if (!user || !groups || groups.length === 0) return;
    setSyncing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSyncing(false);
        return;
      }

      // Check which groups have Google Calendar connected
      const { data: tokens } = await supabase
        .from("google_calendar_tokens")
        .select("group_id")
        .eq("user_id", user.id);

      if (!tokens || tokens.length === 0) {
        setSyncing(false);
        return;
      }

      // Fetch calendars for each connected group
      for (const tokenRow of tokens) {
        if (!tokenRow.group_id) continue;
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-list?groupId=${encodeURIComponent(tokenRow.group_id)}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
            }
          );
          if (!res.ok) {
            console.warn("Failed to fetch Google calendars for group", tokenRow.group_id);
          }
        } catch (err) {
          console.error("Error syncing Google calendars:", err);
        }
      }

      // Refresh the calendar list
      await fetchCalendars();
    } catch (err) {
      console.error("Error in syncGoogleCalendars:", err);
    }

    setSyncing(false);
  }, [user, groups, fetchCalendars]);

  useEffect(() => {
    if (open) {
      fetchCalendars().then(() => {
        syncGoogleCalendars();
      });
    }
  }, [open, fetchCalendars, syncGoogleCalendars]);

  // Ensure at least a default calendar exists
  useEffect(() => {
    if (!loading && calendars.length === 0 && user) {
      createDefaultCalendar();
    }
  }, [loading, calendars.length, user]);

  const createDefaultCalendar = async () => {
    if (!user) return;
    const { error } = await supabase.from("calendars").insert({
      user_id: user.id,
      name: "Personal",
      color: CALENDAR_COLORS[0].value,
      provider: "local",
      is_visible: true,
      is_default: true,
      sort_order: 0,
    } as any);
    if (!error) fetchCalendars();
  };

  const toggleVisibility = async (id: string, visible: boolean) => {
    setCalendars((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isVisible: visible } : c))
    );
    await supabase
      .from("calendars")
      .update({ is_visible: visible } as any)
      .eq("id", id);
  };

  const handleCreateCalendar = async () => {
    if (!newName.trim() || !user) return;
    const { error } = await supabase.from("calendars").insert({
      user_id: user.id,
      name: newName.trim(),
      color: newColor,
      provider: "local",
      is_visible: true,
      is_default: false,
      sort_order: calendars.length,
    } as any);

    if (error) {
      toast.error("Failed to create calendar");
    } else {
      toast.success(`Calendar "${newName.trim()}" created`);
      setNewName("");
      setNewColor(CALENDAR_COLORS[0].value);
      setShowNewForm(false);
      fetchCalendars();
    }
  };

  const startEdit = (cal: CalendarEntry) => {
    setEditingId(cal.id);
    setEditName(cal.name);
    setEditColor(cal.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    // Optimistically update local state
    setCalendars((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, name: editName.trim(), color: editColor } : c))
    );
    const savedId = editingId;
    setEditingId(null);

    const { error } = await supabase
      .from("calendars")
      .update({ name: editName.trim(), color: editColor, updated_at: new Date().toISOString() } as any)
      .eq("id", savedId);

    if (error) {
      toast.error("Failed to save changes");
      fetchCalendars(); // revert
    } else {
      toast.success("Calendar updated");
    }
  };

  const deleteCalendar = async (id: string) => {
    const cal = calendars.find((c) => c.id === id);
    if (cal?.isDefault) {
      toast.error("Cannot delete default calendar");
      return;
    }
    await supabase.from("calendars").delete().eq("id", id);
    fetchCalendars();
    toast.success("Calendar removed");
  };

  const toggleGroup = (provider: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  // Group calendars by provider + account
  const providerGroups: ProviderGroup[] = (() => {
    const grouped = new Map<string, CalendarEntry[]>();
    calendars.forEach((c) => {
      // For synced providers, group by provider+account
      const key = c.providerAccountId ? `${c.provider}::${c.providerAccountId}` : c.provider;
      const arr = grouped.get(key) || [];
      arr.push(c);
      grouped.set(key, arr);
    });

    const order = ["local", "google", "apple", "outlook"];
    const result: ProviderGroup[] = [];

    // Sort by provider order
    const sortedKeys = [...grouped.keys()].sort((a, b) => {
      const pA = a.split("::")[0];
      const pB = b.split("::")[0];
      const iA = order.indexOf(pA);
      const iB = order.indexOf(pB);
      return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
    });

    for (const key of sortedKeys) {
      const cals = grouped.get(key)!;
      const provider = key.split("::")[0];
      const accountId = key.includes("::") ? key.split("::")[1] : null;
      const meta = PROVIDER_META[provider] || { label: provider, icon: "📅" };

      result.push({
        provider: key,
        label: accountId ? `${meta.label}` : meta.label,
        icon: meta.icon,
        accountLabel: accountId || undefined,
        calendars: cals,
      });
    }

    return result;
  })();

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="absolute inset-0 z-[60] bg-background flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <X size={20} className="text-muted-foreground" />
          </button>
          <h2 className="text-[16px] font-semibold text-foreground">Calendars</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={syncGoogleCalendars}
              disabled={syncing}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            >
              <RefreshCw size={18} className={cn("text-muted-foreground", syncing && "animate-spin")} />
            </button>
            <button
              onClick={() => { setShowNewForm(true); setNewName(""); setNewColor(CALENDAR_COLORS[0].value); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            >
              <Plus size={20} className="text-primary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scroll-smooth-touch px-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 mt-3">
              {syncing && (
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
                  <RefreshCw size={14} className="text-muted-foreground animate-spin" />
                  <span className="text-[12px] text-muted-foreground">Syncing connected calendars…</span>
                </div>
              )}

              {providerGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.provider);
                return (
                  <div key={group.provider}>
                    {/* Provider header */}
                    <button
                      onClick={() => toggleGroup(group.provider)}
                      className="flex items-center justify-between w-full py-2 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{group.icon}</span>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.label}
                          </span>
                          {group.accountLabel && (
                            <span className="text-[11px] text-muted-foreground/70 truncate max-w-[200px]">
                              {group.accountLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronUp size={16} className="text-muted-foreground" />
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
                          <div className="bg-card rounded-xl border border-border divide-y divide-border">
                            {group.calendars.map((cal) => (
                              <div key={cal.id} className="flex items-center gap-3 px-4 py-3">
                                {/* Color dot + check */}
                                <button
                                  onClick={() => toggleVisibility(cal.id, !cal.isVisible)}
                                  className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                                  style={{ backgroundColor: cal.isVisible ? cal.color : "transparent", border: cal.isVisible ? "none" : `2px solid ${cal.color}` }}
                                >
                                  {cal.isVisible && (
                                    <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                                  )}
                                </button>

                                {/* Calendar info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-medium text-foreground truncate">
                                      {editingId === cal.id ? editName : cal.name}
                                    </p>
                                  {cal.groupId && cal.provider === "local" && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Shared with group
                                    </p>
                                  )}
                                </div>

                                {/* Info / edit button */}
                                <button
                                  onClick={() => startEdit(cal)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Info size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {/* Empty state */}
              {providerGroups.length === 0 && !loading && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-sm">No calendars yet</p>
                  <button
                    onClick={() => setShowNewForm(true)}
                    className="mt-3 text-primary text-sm font-medium"
                  >
                    Create your first calendar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* New Calendar Sheet */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="absolute inset-0 z-[70] bg-background flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <button onClick={() => setShowNewForm(false)} className="text-sm font-medium text-primary">
                  Cancel
                </button>
                <h2 className="text-[16px] font-semibold text-foreground">New Calendar</h2>
                <button
                  onClick={handleCreateCalendar}
                  disabled={!newName.trim()}
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    newName.trim() ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Save
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                {/* Name */}
                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Calendar Name
                  </label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Work, Family, Fitness"
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                    Color
                  </label>
                  <div className="grid grid-cols-6 gap-3">
                    {CALENDAR_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setNewColor(c.value)}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all mx-auto",
                          newColor === c.value && "ring-2 ring-offset-2 ring-offset-background"
                        )}
                        style={{
                          backgroundColor: c.value,
                          ...(newColor === c.value ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.value}` } : {}),
                        }}
                      >
                        {newColor === c.value && (
                          <Check size={18} className="text-white drop-shadow-sm" strokeWidth={3} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: newColor }}
                    >
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                    <span className="text-[14px] font-medium text-foreground">
                      {newName.trim() || "Calendar Name"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit color picker overlay */}
        <AnimatePresence>
          {editingId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl p-4 z-[65] shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Edit Calendar</span>
                <div className="flex gap-2">
                  {(() => {
                    const cal = calendars.find((c) => c.id === editingId);
                    return cal && !cal.isDefault ? (
                      <button
                        onClick={() => {
                          deleteCalendar(editingId);
                          setEditingId(null);
                        }}
                        className="text-[12px] text-destructive font-medium"
                      >
                        Delete
                      </button>
                    ) : null;
                  })()}
                  <button onClick={saveEdit} className="text-[12px] text-primary font-semibold">
                    Done
                  </button>
                </div>
              </div>

              {/* Editable name */}
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-[14px] text-foreground outline-none mb-3"
              />

              <div className="grid grid-cols-6 gap-3">
                {CALENDAR_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setEditColor(c.value)}
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto transition-all"
                    style={{
                      backgroundColor: c.value,
                      ...(editColor === c.value ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.value}` } : {}),
                    }}
                  >
                    {editColor === c.value && (
                      <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default CalendarsManager;
