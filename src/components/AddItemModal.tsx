import { useState } from "react";
import { X, CalendarDays, Sun, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/context/AppContext";

type ModalStep = "choose" | "calendar" | "morning-habit" | "other-habit";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
}

const AddItemModal = ({ open, onClose }: AddItemModalProps) => {
  const { addEvent, addHabit, addTask } = useAppContext();
  const [step, setStep] = useState<ModalStep>("choose");

  // Calendar form state
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calUser, setCalUser] = useState<"me" | "partner" | "both">("me");

  // Habit form state
  const [habitLabel, setHabitLabel] = useState("");

  const reset = () => {
    setStep("choose");
    setCalTitle("");
    setCalDate("");
    setCalTime("");
    setCalDesc("");
    setCalUser("me");
    setHabitLabel("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddCalendar = () => {
    if (!calTitle.trim()) return;
    const today = new Date();
    let day = today.getDate();
    let month = today.getMonth();
    let year = today.getFullYear();

    if (calDate) {
      const parsed = new Date(calDate);
      day = parsed.getDate();
      month = parsed.getMonth();
      year = parsed.getFullYear();
    }

    // Add as event
    addEvent({
      title: calTitle.trim(),
      time: calTime || "All day",
      description: calDesc,
      day,
      month,
      year,
      user: calUser,
    });

    // Also add as a task if it's today
    if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      addTask({
        title: calTitle.trim(),
        time: calTime || "",
        tag: "Personal",
        assignee: calUser === "partner" ? "partner" : "me",
        scheduledDay: day,
        scheduledMonth: month,
        scheduledYear: year,
      });
    }

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
        className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center overflow-y-auto"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-2xl p-5 pb-12 border-t border-border max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold tracking-display">
              {step === "choose" ? "Add New" : step === "calendar" ? "Schedule Event" : step === "morning-habit" ? "Morning Habit" : "New Habit"}
            </h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

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
              <input
                type="date"
                value={calDate}
                onChange={(e) => setCalDate(e.target.value)}
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground"
              />
              <input
                value={calTime}
                onChange={(e) => setCalTime(e.target.value)}
                placeholder="Time (e.g. 3:00 PM) — leave empty for untimed"
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <textarea
                value={calDesc}
                onChange={(e) => setCalDesc(e.target.value)}
                placeholder="Description (optional)..."
                rows={2}
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground resize-none"
              />
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddItemModal;
