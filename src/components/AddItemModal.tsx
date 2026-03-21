import { useState } from "react";
import { X, CalendarDays, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { getHabitSections } from "@/lib/habitSections";

type ModalStep = "choose" | "calendar" | "habit";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
}

const AddItemModal = ({ open, onClose }: AddItemModalProps) => {
  const { addEvent, addHabit, addTask } = useAppContext();
  const [step, setStep] = useState<ModalStep>("choose");

  // Calendar form state
  const [calTitle, setCalTitle] = useState("");
  const [calStartDate, setCalStartDate] = useState("");
  const [calStartTime, setCalStartTime] = useState("");
  const [calEndDate, setCalEndDate] = useState("");
  const [calEndTime, setCalEndTime] = useState("");
  const [calAllDay, setCalAllDay] = useState(false);
  const [calDesc, setCalDesc] = useState("");
  const [calUser, setCalUser] = useState<"me" | "partner" | "both">("me");
  const [calTag, setCalTag] = useState<"Work" | "Personal" | "Household">("Personal");

  // Habit form state
  const [habitLabel, setHabitLabel] = useState("");

  const reset = () => {
    setStep("choose");
    setCalTitle("");
    setCalStartDate("");
    setCalStartTime("");
    setCalEndDate("");
    setCalEndTime("");
    setCalAllDay(false);
    setCalDesc("");
    setCalUser("me");
    setCalTag("Personal");
    setHabitLabel("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddCalendar = () => {
    if (!calTitle.trim()) return;
    const now = new Date();
    let day = now.getDate();
    let month = now.getMonth();
    let year = now.getFullYear();

    if (calStartDate) {
      const [y, m, d] = calStartDate.split("-").map(Number);
      day = d;
      month = m - 1;
      year = y;
    }

    let endDay = day, endMonth = month, endYear = year;
    if (calEndDate) {
      const [y, m, d] = calEndDate.split("-").map(Number);
      endDay = d;
      endMonth = m - 1;
      endYear = y;
    }

    addEvent({
      title: calTitle.trim(),
      time: calAllDay ? "All day" : (calStartTime || "All day"),
      description: calDesc,
      day,
      month,
      year,
      endDay,
      endMonth,
      endYear,
      endTime: calAllDay ? "" : (calEndTime || calStartTime || ""),
      allDay: calAllDay,
      user: calUser,
    });

    toast.success(`Scheduled: ${calTitle.trim()}`);
    handleClose();
  };

  const handleAddHabit = (category: "morning" | "other") => {
    if (!habitLabel.trim()) return;
    addHabit(habitLabel.trim(), category);
    handleClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-border flex flex-col"
          style={{ maxHeight: "calc(100vh - 2rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fixed header */}
          <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
            <h2 className="text-lg font-bold tracking-display">
              {step === "choose" ? "Add New" : step === "calendar" ? "Schedule Event" : step === "morning-habit" ? "Morning Habit" : "New Habit"}
            </h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px)+60px)]">
            {step === "choose" && (
              <div className="space-y-3">
                <button
                  onClick={() => setStep("calendar")}
                  className="w-full flex items-center gap-4 p-4 bg-secondary rounded-xl transition-all active:scale-[0.98]"
                >
                  <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <CalendarDays size={22} />
                  </span>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold">Calendar Schedule</p>
                    <p className="text-xs text-muted-foreground">Add an event with date, time & details</p>
                  </div>
                </button>
                <button
                  onClick={() => setStep("morning-habit")}
                  className="w-full flex items-center gap-4 p-4 bg-secondary rounded-xl transition-all active:scale-[0.98]"
                >
                  <span className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                    <Sun size={22} />
                  </span>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold">Morning Habit</p>
                    <p className="text-xs text-muted-foreground">Add to your morning routine</p>
                  </div>
                </button>
                <button
                  onClick={() => setStep("other-habit")}
                  className="w-full flex items-center gap-4 p-4 bg-secondary rounded-xl transition-all active:scale-[0.98]"
                >
                  <span className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <Sparkles size={22} />
                  </span>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold">Other Habit</p>
                    <p className="text-xs text-muted-foreground">Evening, anytime, or recurring habit</p>
                  </div>
                </button>
              </div>
            )}

            {step === "calendar" && (
              <div className="space-y-3">
                <input
                  value={calTitle}
                  onChange={(e) => setCalTitle(e.target.value)}
                  placeholder="Event title..."
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                <label className="flex items-center gap-2 text-sm px-1">
                  <input type="checkbox" checked={calAllDay} onChange={(e) => setCalAllDay(e.target.checked)} className="rounded" />
                  <span className="text-muted-foreground">All-day</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Start</label>
                    <input type="date" value={calStartDate} onChange={(e) => {
                      setCalStartDate(e.target.value);
                      if (!calEndDate || e.target.value > calEndDate) setCalEndDate(e.target.value);
                    }} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                  </div>
                  {!calAllDay && (
                    <div className="w-28">
                      <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Time</label>
                      <input type="time" value={calStartTime} onChange={(e) => {
                        setCalStartTime(e.target.value);
                        if (e.target.value && !calEndTime) {
                          const [h, m] = e.target.value.split(":").map(Number);
                          setCalEndTime(`${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
                        }
                      }} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">End</label>
                    <input type="date" value={calEndDate} onChange={(e) => setCalEndDate(e.target.value)} min={calStartDate}
                      className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                  </div>
                  {!calAllDay && (
                    <div className="w-28">
                      <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Time</label>
                      <input type="time" value={calEndTime} onChange={(e) => setCalEndTime(e.target.value)}
                        className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                    </div>
                  )}
                </div>
                <textarea
                  value={calDesc}
                  onChange={(e) => setCalDesc(e.target.value)}
                  placeholder="Description (optional)..."
                  rows={2}
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground resize-none"
                />

                {/* Category / Tag selector */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Category</p>
                  <div className="flex gap-2">
                    {(["Work", "Personal", "Household"] as const).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setCalTag(tag)}
                        className={`flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-all ${
                          calTag === tag
                            ? tag === "Work"
                              ? "border-blue-500 bg-blue-500/10 text-blue-500"
                              : tag === "Household"
                              ? "border-orange-500 bg-orange-500/10 text-orange-500"
                              : "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assignee selector */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Assign to</p>
                  <div className="flex gap-2">
                    {(["me", "partner", "both"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setCalUser(u)}
                        className={`flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-all ${
                          calUser === u
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {u === "me" ? "Mine" : u === "partner" ? "Partner" : "Both"}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleAddCalendar}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >
                  Add to Calendar
                </button>
              </div>
            )}

            {(step === "morning-habit" || step === "other-habit") && (
              <div className="space-y-3">
                <input
                  value={habitLabel}
                  onChange={(e) => setHabitLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddHabit(step === "morning-habit" ? "morning" : "other")}
                  placeholder={step === "morning-habit" ? "e.g. Cold shower, Journaling..." : "e.g. Read 10 pages, No sugar..."}
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                <button
                  onClick={() => handleAddHabit(step === "morning-habit" ? "morning" : "other")}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >
                  Add Habit
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddItemModal;
