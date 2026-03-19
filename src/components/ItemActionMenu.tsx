import { useState } from "react";
import { MoreVertical, Trash2, EyeOff, Eye, CalendarDays, ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface ItemActionMenuProps {
  /** Hide from others toggle */
  hidden?: boolean;
  onToggleVisibility?: () => void;
  /** Reschedule actions */
  onMoveToTomorrow?: () => void;
  onMoveToDate?: (date: Date) => void;
  /** Delete */
  onRemove?: () => void;
}

const ItemActionMenu = ({ hidden, onToggleVisibility, onMoveToTomorrow, onMoveToDate, onRemove }: ItemActionMenuProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
        <MoreVertical size={16} />
      </button>
      {menuOpen && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => { setMenuOpen(false); setShowDatePicker(false); }} aria-label="Close menu" />
          <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-xl border border-border bg-card shadow-card overflow-hidden">
            {onToggleVisibility && (
              <button
                onClick={() => { onToggleVisibility(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary"
              >
                {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                {hidden ? "Show to others" : "Hide from others"}
              </button>
            )}
            {onMoveToTomorrow && (
              <button
                onClick={() => { onMoveToTomorrow(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary"
              >
                <ArrowRight size={14} /> Move to tomorrow
              </button>
            )}
            {onMoveToDate && (
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary"
                  >
                    <CalendarDays size={14} /> Move to another date
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="end" side="left">
                  <Calendar
                    mode="single"
                    onSelect={(date) => {
                      if (date) {
                        onMoveToDate(date);
                        setShowDatePicker(false);
                        setMenuOpen(false);
                      }
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}
            <button
              onClick={() => { onRemove(); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ItemActionMenu;
