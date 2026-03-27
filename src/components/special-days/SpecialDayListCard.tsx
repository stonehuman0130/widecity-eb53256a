import { motion } from "framer-motion";
import { SpecialDay, getDayCount, CATEGORY_OPTIONS } from "./SpecialDayTypes";

interface Props {
  day: SpecialDay;
  now: Date;
  onEdit: (day: SpecialDay) => void;
}

const SpecialDayListCard = ({ day, now, onEdit }: Props) => {
  const count = getDayCount(day, now);
  const eventDate = new Date(day.event_date + "T00:00:00");
  const hasPhoto = !!day.photo_url;
  const cat = CATEGORY_OPTIONS.find((c) => c.value === day.category);

  const dateStr = eventDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const countLabel = day.count_direction === "since"
    ? `${count.toLocaleString()} days ago`
    : `${count.toLocaleString()} days to go`;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onEdit(day)}
      className="w-full flex items-center gap-3.5 bg-card/70 backdrop-blur-sm rounded-2xl p-3.5 border border-border/40 shadow-sm hover:shadow-md hover:bg-card/90 transition-all text-left group active:scale-[0.98]"
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-secondary/50 border border-border/30">
        {hasPhoto ? (
          <img src={day.photo_url!} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            {day.icon}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{day.title}</p>
          {cat && cat.value !== "custom" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/80 text-muted-foreground font-medium flex-shrink-0">
              {cat.label}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
        <p className="text-xs font-bold text-primary mt-0.5">{countLabel}</p>
      </div>
    </motion.button>
  );
};

export default SpecialDayListCard;
