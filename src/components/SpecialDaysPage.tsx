import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Heart, Search, X } from "lucide-react";
import GroupSelector from "@/components/GroupSelector";
import { motion, AnimatePresence } from "framer-motion";
import SettingsButton from "@/components/SettingsButton";
import { SpecialDay, getDayCount, CATEGORY_OPTIONS, fmtDate } from "./special-days/SpecialDayTypes";
import SpecialDayHeroCard from "./special-days/SpecialDayHeroCard";
import SpecialDayListCard from "./special-days/SpecialDayListCard";
import SpecialDayFormModal from "./special-days/SpecialDayFormModal";

const FILTER_CHIPS = [
  { value: "all", label: "All", icon: "🌐" },
  ...CATEGORY_OPTIONS,
];

const SpecialDaysPage = ({ onOpenSettings }: { onOpenSettings?: () => void }) => {
  const { user, activeGroup } = useAuth();
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDay, setEditingDay] = useState<SpecialDay | null>(null);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const loadDays = async () => {
    if (!user) return;
    let q = supabase.from("special_days").select("*").eq("user_id", user.id);
    if (activeGroup) q = q.eq("group_id", activeGroup.id);
    else q = q.is("group_id", null);
    const { data } = await q.order("event_date", { ascending: true });
    if (data) setDays(data as unknown as SpecialDay[]);
    setLoading(false);
  };

  useEffect(() => { loadDays(); }, [user, activeGroup?.id]);

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filteredDays = useMemo(() => {
    let result = days;
    if (filter !== "all") {
      result = result.filter((d) => d.category === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }
    return result;
  }, [days, filter, searchQuery]);

  // Auto hero: nearest upcoming event, or featured, or first
  const heroDay = useMemo(() => {
    if (filteredDays.length === 0) return null;
    const featured = filteredDays.find((d) => d.is_featured);
    if (featured) return featured;
    // Find nearest upcoming
    const upcoming = filteredDays
      .filter((d) => d.count_direction === "until")
      .sort((a, b) => getDayCount(a, now) - getDayCount(b, now));
    return upcoming[0] || filteredDays[0];
  }, [filteredDays, now]);

  const otherDays = useMemo(
    () => filteredDays.filter((d) => d.id !== heroDay?.id),
    [filteredDays, heroDay]
  );

  const openAdd = () => {
    setEditingDay(null);
    setShowForm(true);
  };

  const openEdit = (day: SpecialDay) => {
    setEditingDay(day);
    setShowForm(true);
  };

  return (
    <div className="px-4 pt-6 pb-8 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Special Days</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 tracking-wide">
            Moments that matter
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSearch ? <X size={14} /> : <Search size={14} />}
          </button>
          <button
            onClick={openAdd}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors border border-primary/15"
          >
            <Plus size={16} />
          </button>
          {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-3"
          >
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search special days…"
              className="w-full px-4 py-2.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <GroupSelector />

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide -mx-1 px-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setFilter(chip.value)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              filter === chip.value
                ? "bg-card shadow-sm border border-border/50 text-foreground"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60 border border-transparent"
            }`}
          >
            <span className="text-sm">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredDays.length === 0 ? (
        /* Premium empty state */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-rose-100 to-amber-50 flex items-center justify-center mb-5 shadow-sm">
            <Heart size={32} className="text-rose-300" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">No moments yet</p>
          <p className="text-xs text-muted-foreground mb-6 max-w-[220px] mx-auto leading-relaxed">
            Start tracking the dates and milestones that mean the most to you
          </p>
          <button
            onClick={openAdd}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-2xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            Add your first moment
          </button>
        </motion.div>
      ) : (
        <>
          {/* Hero card */}
          {heroDay && (
            <SpecialDayHeroCard day={heroDay} now={now} onEdit={openEdit} />
          )}

          {/* All special days list */}
          {otherDays.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-3">
                All Special Days
              </h3>
              <div className="space-y-2">
                {otherDays.map((day) => (
                  <SpecialDayListCard key={day.id} day={day} now={now} onEdit={openEdit} />
                ))}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <button
            onClick={openAdd}
            className="mt-6 w-full py-3.5 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-card/80 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus size={15} /> New Special Moment
          </button>
        </>
      )}

      {/* Form modal */}
      <SpecialDayFormModal
        open={showForm}
        editingDay={editingDay}
        userId={user?.id || ""}
        groupId={activeGroup?.id || null}
        onClose={() => setShowForm(false)}
        onSaved={loadDays}
      />
    </div>
  );
};

export default SpecialDaysPage;
