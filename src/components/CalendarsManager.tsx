import { useState, useEffect, useCallback } from "react";
import { X, Plus, Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

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
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (open) fetchCalendars();
  }, [open, fetchCalendars]);

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
    if (cal.provider !== "local") return; // Only local calendars are editable
    setEditingId(cal.id);
    setEditName(cal.name);
    setEditColor(cal.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await supabase
      .from("calendars")
      .update({ name: editName.trim(), color: editColor, updated_at: new Date().toISOString() } as any)
      .eq("id", editingId);
    setEditingId(null);
    fetchCalendars();
    toast.success("Calendar updated");
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

  // Group calendars by provider
  const providerGroups: ProviderGroup[] = (() => {
    const grouped = new Map<string, CalendarEntry[]>();
    calendars.forEach((c) => {
      const arr = grouped.get(c.provider) || [];
      arr.push(c);
      grouped.set(c.provider, arr);
    });

    // Ensure "local" is always shown first, then known providers, then unknown
    const order = ["local", "google", "apple", "outlook"];
    const result: ProviderGroup[] = [];
    order.forEach((p) => {
      const cals = grouped.get(p);
      if (cals && cals.length > 0) {
        const meta = PROVIDER_META[p] || { label: p, icon: "📅" };
        result.push({ provider: p, label: meta.label, icon: meta.icon, calendars: cals });
        grouped.delete(p);
      }
    });
    // Any remaining providers
    grouped.forEach((cals, p) => {
      if (cals.length > 0) {
        result.push({ provider: p, label: p, icon: "📅", calendars: cals });
      }
    });
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
          <button
            onClick={() => { setShowNewForm(true); setNewName(""); setNewColor(CALENDAR_COLORS[0].value); }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
          >
            <Plus size={20} className="text-primary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scroll-smooth-touch px-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 mt-3">
              {providerGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.provider);
                return (
                  <div key={group.provider}>
                    {/* Provider header */}
                    <button
                      onClick={() => toggleGroup(group.provider)}
                      className="flex items-center justify-between w-full py-2 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{group.icon}</span>
                        <span className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </span>
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
                                  style={{ backgroundColor: cal.color }}
                                >
                                  {cal.isVisible && (
                                    <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                                  )}
                                </button>

                                {/* Calendar info */}
                                <div className="flex-1 min-w-0">
                                  {editingId === cal.id ? (
                                    <input
                                      autoFocus
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      onBlur={saveEdit}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                                      className="text-[14px] font-medium text-foreground bg-transparent outline-none border-b border-primary w-full"
                                    />
                                  ) : (
                                    <p className="text-[14px] font-medium text-foreground truncate">
                                      {cal.name}
                                    </p>
                                  )}
                                  {cal.providerAccountId && (
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {cal.providerAccountId}
                                    </p>
                                  )}
                                  {cal.groupId && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Shared with group
                                    </p>
                                  )}
                                </div>

                                {/* Info / edit button */}
                                {cal.provider === "local" && (
                                  <button
                                    onClick={() => startEdit(cal)}
                                    className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Info size={16} />
                                  </button>
                                )}
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

              {/* Sync hint */}
              <div className="mt-4 px-1">
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  Google Calendar, Apple iCloud, and Outlook sync coming soon.
                  <br />Connected calendars will appear here automatically.
                </p>
              </div>
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
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Edit Color</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const cal = calendars.find((c) => c.id === editingId);
                      if (cal && !cal.isDefault) {
                        deleteCalendar(editingId);
                        setEditingId(null);
                      }
                    }}
                    className="text-[12px] text-destructive font-medium"
                  >
                    Delete
                  </button>
                  <button onClick={saveEdit} className="text-[12px] text-primary font-semibold">
                    Done
                  </button>
                </div>
              </div>
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
