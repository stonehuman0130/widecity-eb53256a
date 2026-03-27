import { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Trash2, ChevronRight, Pin } from "lucide-react";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SpecialDay,
  EventType,
  DisplayMode,
  ICON_OPTIONS,
  EVENT_TYPE_OPTIONS,
  REMINDER_OPTIONS,
  fmtDate,
  getDayCount,
  getDisplayLabel,
} from "./SpecialDayTypes";

interface Props {
  open: boolean;
  editingDay: SpecialDay | null;
  userId: string;
  groupId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const SpecialDayFormModal = ({ open, editingDay, userId, groupId, onClose, onSaved }: Props) => {
  useModalScrollLock(open);

  const getInitialEventType = (): EventType => {
    if (editingDay?.event_type) return editingDay.event_type as EventType;
    if (editingDay?.category === "birthday") return "birthday";
    if (editingDay?.category === "anniversary") return "anniversary";
    return "custom";
  };

  const [step, setStep] = useState(editingDay ? 2 : 1);
  const [eventType, setEventType] = useState<EventType>(getInitialEventType());
  const [title, setTitle] = useState(editingDay?.title || "");
  const [icon, setIcon] = useState(editingDay?.icon || "❤️");
  const [date, setDate] = useState(editingDay?.event_date || fmtDate(new Date()));
  const [direction, setDirection] = useState<"since" | "until">(
    (editingDay?.count_direction as "since" | "until") || "since"
  );
  const [repeats, setRepeats] = useState(editingDay?.repeats_yearly || false);
  const [notes, setNotes] = useState(editingDay?.notes || "");
  const [reminder, setReminder] = useState<number | null>(editingDay?.reminder_minutes ?? null);
  const [photoUrl, setPhotoUrl] = useState(editingDay?.photo_url || "");
  const [uploading, setUploading] = useState(false);
  const [pinAsHero, setPinAsHero] = useState(editingDay?.is_featured || false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>((editingDay as any)?.display_mode || "auto");
  const fileRef = useRef<HTMLInputElement>(null);

  const selectEventType = (type: EventType) => {
    setEventType(type);
    const opt = EVENT_TYPE_OPTIONS.find((o) => o.value === type)!;
    setDirection(opt.defaultDirection);
    setRepeats(opt.defaultRepeats);
    setIcon(opt.icon);
    setStep(2);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("special-days").upload(path, file);
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("special-days").getPublicUrl(path);
    setPhotoUrl(urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    const payload = {
      title: title.trim(),
      icon,
      event_date: date,
      count_direction: direction,
      repeats_yearly: repeats,
      user_id: userId,
      group_id: groupId,
      photo_url: photoUrl || null,
      category: eventType === "first_met" || eventType === "wedding" ? "anniversary" : eventType,
      event_type: eventType,
      display_mode: displayMode,
      notes: notes.trim() || null,
      reminder_minutes: reminder,
      is_featured: pinAsHero,
    };

    if (pinAsHero) {
      // Unpin others
      await supabase
        .from("special_days")
        .update({ is_featured: false })
        .eq("user_id", userId)
        .neq("id", editingDay?.id || "");
    }

    if (editingDay) {
      await supabase.from("special_days").update(payload).eq("id", editingDay.id);
      toast.success("Updated");
    } else {
      await supabase.from("special_days").insert(payload);
      toast.success("Added");
    }
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (!editingDay) return;
    await supabase.from("special_days").delete().eq("id", editingDay.id);
    toast.success("Removed");
    onSaved();
    onClose();
  };

  // Live preview data
  const previewDay = useMemo((): SpecialDay => ({
    id: "preview",
    title: title || "Your Moment",
    icon,
    event_date: date,
    count_direction: direction,
    repeats_yearly: repeats,
    is_featured: false,
    group_id: null,
    user_id: userId,
    photo_url: photoUrl || null,
    category: eventType,
    notes: null,
    reminder_minutes: null,
    event_type: eventType,
    display_mode: displayMode,
  }), [title, icon, date, direction, repeats, eventType, photoUrl, displayMode, userId]);

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const previewLabel = getDisplayLabel(previewDay, now);
  const previewCount = getDayCount(previewDay, now);

  const typeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === eventType)?.label || "Custom";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center pb-[env(safe-area-inset-bottom)] overscroll-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border/50 shadow-2xl h-[min(92svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/30 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold tracking-tight">
                  {editingDay ? "Edit Moment" : step === 1 ? "Choose Type" : `New ${typeLabel}`}
                </h3>
                {step === 2 && !editingDay && (
                  <button onClick={() => setStep(1)} className="text-[11px] text-primary font-medium mt-0.5">
                    ← Change type
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div
              className="px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4 space-y-5 flex-1 min-h-0 overflow-y-scroll overscroll-y-contain"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain" }}
            >
              {step === 1 ? (
                /* Step 1: Event type selection */
                <div className="space-y-2">
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => selectEventType(opt.value)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-all text-left active:scale-[0.98]"
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground/70">
                          {opt.value === "birthday" && "Countdown to next birthday with age"}
                          {opt.value === "anniversary" && "Track days together & annual milestone"}
                          {opt.value === "first_met" && "Count the days since you first met"}
                          {opt.value === "wedding" && "Wedding date & anniversary tracking"}
                          {opt.value === "holiday" && "Recurring holiday countdown"}
                          {opt.value === "custom" && "Any date with custom display"}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground/40" />
                    </button>
                  ))}
                </div>
              ) : (
                /* Step 2: Form fields */
                <>
                  {/* Live preview card */}
                  <div className="rounded-2xl bg-secondary/20 border border-border/30 p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-secondary/40 border border-border/20 flex-shrink-0">
                        {photoUrl ? (
                          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">{icon}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground truncate">{title || "Your Moment"}</p>
                        <p className="text-[12px] font-bold text-primary">{previewCount === 0 ? "Today!" : previewLabel.primary}</p>
                        {previewLabel.secondary && (
                          <p className="text-[10px] text-muted-foreground">{previewLabel.secondary}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Photo */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Cover Photo
                    </label>
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="relative w-full h-32 rounded-2xl overflow-hidden bg-secondary/40 border border-dashed border-border/60 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                    >
                      {photoUrl ? (
                        <>
                          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Camera size={24} className="text-white/80" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-muted-foreground/50">
                          <Camera size={22} />
                          <span className="text-[10px] font-medium">
                            {uploading ? "Uploading…" : "Add a photo"}
                          </span>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Icon
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ICON_OPTIONS.map((ic) => (
                        <button
                          key={ic}
                          onClick={() => setIcon(ic)}
                          className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all ${
                            icon === ic
                              ? "bg-primary/10 border-2 border-primary scale-110"
                              : "bg-secondary/50 border border-transparent hover:bg-secondary"
                          }`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {eventType === "birthday" ? "Whose Birthday?" : "Title"}
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        eventType === "birthday" ? "e.g., Evelyn's Birthday"
                        : eventType === "anniversary" ? "e.g., Our Anniversary"
                        : "e.g., Special Moment"
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {eventType === "birthday" ? "Birth Date" : "Date"}
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Direction — only for custom */}
                  {eventType === "custom" && (
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Count Type
                      </label>
                      <div className="flex gap-2">
                        {(["since", "until"] as const).map((dir) => (
                          <button
                            key={dir}
                            onClick={() => setDirection(dir)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              direction === dir
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            {dir === "since" ? "Days since" : "Days until"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Repeats */}
                  <button
                    onClick={() => setRepeats(!repeats)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                      repeats ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
                    }`}
                  >
                    <span className="text-sm font-medium">Repeats yearly</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      repeats ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {repeats && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                          <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Pin as hero */}
                  <button
                    onClick={() => setPinAsHero(!pinAsHero)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                      pinAsHero ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
                    }`}
                  >
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Pin size={13} /> Pin as featured card
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      pinAsHero ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {pinAsHero && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                          <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Reminder */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Reminder
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_OPTIONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setReminder(reminder === r.value ? null : r.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            reminder === r.value
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-secondary/50 text-muted-foreground border border-transparent"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Notes / Gift Ideas
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add a memory note or gift idea…"
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-muted-foreground/40"
                    />
                  </div>

                  {/* Save */}
                  <button
                    onClick={handleSave}
                    disabled={!title.trim()}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {editingDay ? "Save Changes" : `Add ${typeLabel}`}
                  </button>

                  {editingDay && (
                    <button
                      onClick={handleDelete}
                      className="w-full py-2.5 text-destructive text-sm font-semibold hover:bg-destructive/5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SpecialDayFormModal;
