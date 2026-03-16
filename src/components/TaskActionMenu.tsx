import { useState } from "react";
import { MoreVertical, Trash2, CalendarDays, X } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

interface TaskActionMenuProps {
  taskId: string;
}

const TaskActionMenu = ({ taskId }: TaskActionMenuProps) => {
  const { removeTask, updateTask } = useAppContext();
  const [open, setOpen] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");

  const handleDelete = () => {
    removeTask(taskId);
    setOpen(false);
  };

  const handleMove = () => {
    if (!moveDate) return;
    const parsed = new Date(moveDate);
    updateTask(taskId, {
      scheduledDay: parsed.getDate(),
      scheduledMonth: parsed.getMonth(),
      scheduledYear: parsed.getFullYear(),
      time: moveTime || "",
    });
    setOpen(false);
    setShowMove(false);
    setMoveDate("");
    setMoveTime("");
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-muted-foreground p-1"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowMove(false); }} />
          <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[180px] overflow-hidden">
            {!showMove ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMove(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors text-left"
                >
                  <CalendarDays size={16} className="text-muted-foreground" />
                  Move to another day
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-destructive/10 text-destructive transition-colors text-left"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            ) : (
              <div className="p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground">Move to</span>
                  <button onClick={() => setShowMove(false)} className="text-muted-foreground">
                    <X size={14} />
                  </button>
                </div>
                <input
                  type="date"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none text-foreground"
                />
                <input
                  value={moveTime}
                  onChange={(e) => setMoveTime(e.target.value)}
                  placeholder="Time (e.g. 3:00 PM)"
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleMove}
                  disabled={!moveDate}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  Move
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TaskActionMenu;
