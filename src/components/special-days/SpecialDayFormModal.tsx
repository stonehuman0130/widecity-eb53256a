import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Trash2 } from "lucide-react";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SpecialDay,
  ICON_OPTIONS,
  CATEGORY_OPTIONS,
  REMINDER_OPTIONS,
  fmtDate,
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

  const [title, setTitle] = useState(editingDay?.title || "");
  const [icon, setIcon] = useState(editingDay?.icon || "❤️");
  const [date, setDate] = useState(editingDay?.event_date || fmtDate(new Date()));
  const [direction, setDirection] = useState<"since" | "until">(
    (editingDay?.count_direction as "since" | "until") || "since"
  );
  const [repeats, setRepeats] = useState(editingDay?.repeats_yearly || false);
  const [category, setCategory] = useState(editingDay?.category || "custom");
  const [notes, setNotes] = useState(editingDay?.notes || "");
  const [reminder, setReminder] = useState<number | null>(editingDay?.reminder_minutes ?? null);
  const [photoUrl, setPhotoUrl] = useState(editingDay?.photo_url || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      icon,
      event_date: date,
      count_direction: direction,
      repeats_yearly: repeats,
      user_id: userId,
      group_id: groupId,
      photo_url: photoUrl || null,
      category,
      notes: notes.trim() || null,
      reminder_minutes: reminder,
    };

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
            className="w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border/50 shadow-2xl h-[min(88svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/30">
              <h3 className="text-lg font-bold tracking-tight">
                {editingDay ? "Edit Moment" : "New Special Moment"}
              </h3>
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
              {/* Photo upload */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Cover Photo
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="relative w-full h-36 rounded-2xl overflow-hidden bg-secondary/40 border border-dashed border-border/60 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
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
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Evelyn's Birthday"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        category === cat.value
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary"
                      }`}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction */}
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
                {editingDay ? "Save Changes" : "Add Special Moment"}
              </button>

              {editingDay && (
                <button
                  onClick={handleDelete}
                  className="w-full py-2.5 text-destructive text-sm font-semibold hover:bg-destructive/5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SpecialDayFormModal;
