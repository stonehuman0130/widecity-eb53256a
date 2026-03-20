import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Plus, Heart, Star, Trash2, Pencil, X, ChevronRight, Gift, Cake, Sparkles, Crown, Calendar as CalIcon } from "lucide-react";
import GroupSelector from "@/components/GroupSelector";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import SettingsButton from "@/components/SettingsButton";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";

interface SpecialDay {
  id: string;
  title: string;
  icon: string;
  event_date: string;
  count_direction: "since" | "until";
  repeats_yearly: boolean;
  is_featured: boolean;
  group_id: string | null;
  user_id: string;
}

const ICON_OPTIONS = ["❤️", "💍", "🎂", "🎉", "🏆", "⭐", "🌹", "💐", "🥂", "👶", "🎓", "✈️", "🏠", "💪", "🙏", "🎊"];

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function daysBetween(a: Date, b: Date) {
  const msPerDay = 86400000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function getUpcomingMilestones(startDate: Date, now: Date) {
  const daysSince = daysBetween(startDate, now);
  const milestones: { label: string; daysLeft: number }[] = [];
  
  // Year milestones
  for (let y = 1; y <= 100; y++) {
    const milestone = new Date(startDate);
    milestone.setFullYear(milestone.getFullYear() + y);
    const left = daysBetween(now, milestone);
    if (left > 0 && left <= 730) {
      milestones.push({ label: `${y} ${y === 1 ? "year" : "years"}`, daysLeft: left });
    }
  }

  // Round day milestones
  [100, 200, 365, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].forEach((d) => {
    const left = d - daysSince;
    if (left > 0 && left <= 365) {
      milestones.push({ label: `${d} days`, daysLeft: left });
    }
  });

  return milestones.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 4);
}

function getNextOccurrence(dateStr: string, now: Date) {
  const d = new Date(dateStr + "T00:00:00");
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear >= now) return daysBetween(now, thisYear);
  const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return daysBetween(now, nextYear);
}

const SpecialDaysPage = ({ onOpenSettings }: { onOpenSettings?: () => void }) => {
  const { user, activeGroup } = useAuth();
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDay, setEditingDay] = useState<SpecialDay | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formIcon, setFormIcon] = useState("❤️");
  const [formDate, setFormDate] = useState(fmtDate(new Date()));
  const [formDirection, setFormDirection] = useState<"since" | "until">("since");
  const [formRepeats, setFormRepeats] = useState(false);
  useModalScrollLock(showForm);

  const loadDays = async () => {
    if (!user) return;
    let q = supabase.from("special_days").select("*").eq("user_id", user.id);
    if (activeGroup) q = q.eq("group_id", activeGroup.id);
    else q = q.is("group_id", null);
    const { data } = await q.order("is_featured", { ascending: false }).order("event_date", { ascending: true });
    if (data) setDays(data as SpecialDay[]);
    setLoading(false);
  };

  useEffect(() => { loadDays(); }, [user, activeGroup?.id]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const featured = useMemo(() => days.find((d) => d.is_featured) || days[0], [days]);
  const otherDays = useMemo(() => days.filter((d) => d.id !== featured?.id), [days, featured]);

  const openAdd = () => {
    setEditingDay(null);
    setFormTitle("");
    setFormIcon("❤️");
    setFormDate(fmtDate(new Date()));
    setFormDirection("since");
    setFormRepeats(false);
    setShowForm(true);
  };

  const openEdit = (day: SpecialDay) => {
    setEditingDay(day);
    setFormTitle(day.title);
    setFormIcon(day.icon);
    setFormDate(day.event_date);
    setFormDirection(day.count_direction);
    setFormRepeats(day.repeats_yearly);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !formTitle.trim()) return;
    const payload = {
      title: formTitle.trim(),
      icon: formIcon,
      event_date: formDate,
      count_direction: formDirection,
      repeats_yearly: formRepeats,
      user_id: user.id,
      group_id: activeGroup?.id || null,
    };

    if (editingDay) {
      await supabase.from("special_days").update(payload).eq("id", editingDay.id);
      toast.success("Special day updated");
    } else {
      await supabase.from("special_days").insert(payload);
      toast.success("Special day added");
    }
    setShowForm(false);
    loadDays();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("special_days").delete().eq("id", id);
    toast.success("Special day removed");
    loadDays();
  };

  const handleSetFeatured = async (id: string) => {
    if (!user) return;
    // Unfeature all first
    await supabase.from("special_days").update({ is_featured: false }).eq("user_id", user.id);
    await supabase.from("special_days").update({ is_featured: true }).eq("id", id);
    loadDays();
  };

  const getDayCount = (day: SpecialDay) => {
    const eventDate = new Date(day.event_date + "T00:00:00");
    if (day.count_direction === "since") {
      return Math.max(0, daysBetween(eventDate, now));
    } else {
      if (day.repeats_yearly) {
        return getNextOccurrence(day.event_date, now);
      }
      return Math.max(0, daysBetween(now, eventDate));
    }
  };

  const getDayLabel = (day: SpecialDay) => {
    const count = getDayCount(day);
    if (day.count_direction === "since") return `${count} days`;
    return `${count} days left`;
  };

  return (
    <div className="px-4 pt-6 pb-8 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-display">Special Days</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Moments that matter</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openAdd}
            className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus size={16} />
          </button>
          {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
        </div>
      </div>

      <GroupSelector />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : days.length === 0 ? (
        <div className="text-center py-16">
          <Heart size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground mb-4">No special days yet</p>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Add your first special day
          </button>
        </div>
      ) : (
        <>
          {/* Featured Card */}
          {featured && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 rounded-2xl p-6 border border-primary/20 mb-6 overflow-hidden"
            >
              <div className="absolute top-3 right-3 opacity-10 text-6xl pointer-events-none select-none">
                {featured.icon}
              </div>
              <div className="relative z-10">
                <span className="text-3xl mb-2 block">{featured.icon}</span>
                <h2 className="text-lg font-bold mb-1">{featured.title}</h2>
                <p className="text-4xl font-extrabold text-primary tracking-tight mb-1">
                  {getDayCount(featured).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  {featured.count_direction === "since" ? "days together" : "days to go"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(featured.event_date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>

                {/* Upcoming milestones */}
                {featured.count_direction === "since" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {getUpcomingMilestones(new Date(featured.event_date + "T00:00:00"), now).map((m) => (
                      <div
                        key={m.label}
                        className="px-2.5 py-1.5 rounded-lg bg-background/80 border border-border text-[10px]"
                      >
                        <span className="font-bold text-primary">{m.label}</span>
                        <span className="text-muted-foreground ml-1">in {m.daysLeft}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => openEdit(featured)}
                className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil size={12} />
              </button>
            </motion.div>
          )}

          {/* Other Days List */}
          {otherDays.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                All Special Days
              </h3>
              {otherDays.map((day) => (
                <motion.div
                  key={day.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border group"
                >
                  <span className="text-xl flex-shrink-0">{day.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{day.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(day.event_date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {day.repeats_yearly && " · yearly"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{getDayCount(day).toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {day.count_direction === "since" ? "days" : "days left"}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleSetFeatured(day.id)}
                      className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                      title="Set as featured"
                    >
                      <Star size={11} />
                    </button>
                    <button
                      onClick={() => openEdit(day)}
                      className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(day.id)}
                      className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Add button at bottom */}
          <button
            onClick={openAdd}
            className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Add Special Day
          </button>
        </>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center pb-[env(safe-area-inset-bottom)] overscroll-none"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[min(82svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
            >
              <div className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-b border-border flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-lg font-bold">
                  {editingDay ? "Edit Special Day" : "Add Special Day"}
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                className="px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 space-y-4 flex-1 min-h-0 overflow-y-scroll overscroll-y-contain"
                style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain" }}
              >
                {/* Icon Picker */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setFormIcon(icon)}
                        className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                          formIcon === icon
                            ? "bg-primary/10 border-2 border-primary scale-110"
                            : "bg-secondary border border-transparent"
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Title</label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g., Our First Day"
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Direction */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Count type</label>
                  <div className="flex gap-2">
                    {(["since", "until"] as const).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setFormDirection(dir)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          formDirection === dir
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {dir === "since" ? "Days since" : "Days until"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repeats */}
                <button
                  onClick={() => setFormRepeats(!formRepeats)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                    formRepeats ? "bg-primary/10 border-primary/30" : "bg-secondary border-border"
                  }`}
                >
                  <span className="text-sm font-medium">Repeats yearly</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    formRepeats ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}>
                    {formRepeats && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                        <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={!formTitle.trim()}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingDay ? "Save Changes" : "Add Special Day"}
                </button>

                {editingDay && (
                  <button
                    onClick={() => {
                      handleDelete(editingDay.id);
                      setShowForm(false);
                    }}
                    className="w-full py-2.5 text-destructive text-sm font-semibold hover:bg-destructive/10 rounded-xl transition-colors"
                  >
                    Delete Special Day
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SpecialDaysPage;
