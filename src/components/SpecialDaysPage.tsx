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

  const heroDay = useMemo(() => {
    if (filteredDays.length === 0) return null;
    const featured = filteredDays.find((d) => d.is_featured);
    if (featured) return featured;
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
    <div className="px-4 pt-5 pb-8 max-w-md mx-auto">
      {/* Header — matching reference: title left, icons right */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground leading-tight">
            Special Days
          </h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-medium italic">
            Moments that matter
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            onClick={openAdd}
            className="w-8 h-8 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/30"
          >
            <Plus size={15} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-8 h-8 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/30"
          >
            {showSearch ? <X size={14} /> : <Search size={14} />}
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
              className="w-full px-4 py-2.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <GroupSelector />

      {/* Filter chips — luxury pill style matching reference */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide -mx-1 px-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setFilter(chip.value)}
            className={`flex items-center gap-1.5 px-4 py-[7px] rounded-full text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0 border ${
              filter === chip.value
                ? "bg-card shadow-md border-border/60 text-foreground"
                : "bg-card/40 backdrop-blur-sm text-muted-foreground border-border/20 hover:bg-card/70"
            }`}
          >
            <span className="text-[13px]">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredDays.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-5 shadow-sm">
            <Heart size={32} className="text-primary/40" />
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
          {heroDay && (
            <SpecialDayHeroCard day={heroDay} now={now} onEdit={openEdit} />
          )}

          {otherDays.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[12px] font-bold text-foreground/70 uppercase tracking-[0.1em] mb-3 px-0.5">
                All Special Days
              </h3>
              <div className="space-y-2.5">
                {otherDays.map((day, i) => (
                  <SpecialDayListCard key={day.id} day={day} now={now} onEdit={openEdit} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Bottom CTA — soft frosted pill */}
          <button
            onClick={openAdd}
            className="mt-5 w-full py-3.5 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:border-border/60 hover:bg-card/80 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.5} /> New Special Moment
          </button>
        </>
      )}

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
