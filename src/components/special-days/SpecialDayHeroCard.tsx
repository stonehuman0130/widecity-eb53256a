import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { SpecialDay, getDayCount, getUpcomingMilestones } from "./SpecialDayTypes";

interface Props {
  day: SpecialDay;
  now: Date;
  onEdit: (day: SpecialDay) => void;
}

const PLACEHOLDER_GRADIENTS = [
  "from-rose-200/80 via-amber-100/60 to-orange-200/80",
  "from-violet-200/80 via-pink-100/60 to-rose-200/80",
  "from-sky-200/80 via-indigo-100/60 to-violet-200/80",
];

const SpecialDayHeroCard = ({ day, now, onEdit }: Props) => {
  const count = getDayCount(day, now);
  const eventDate = new Date(day.event_date + "T00:00:00");
  const hasPhoto = !!day.photo_url;
  const gradientIdx = day.title.length % PLACEHOLDER_GRADIENTS.length;

  const shortDate = eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const fullDate = eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const milestones = day.count_direction === "since"
    ? getUpcomingMilestones(eventDate, now)
    : [];

  return (
    <div className="mb-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative rounded-[1.25rem] overflow-hidden shadow-lg"
        style={{ aspectRatio: "4/3" }}
      >
        {/* Background */}
        {hasPhoto ? (
          <img
            src={day.photo_url!}
            alt={day.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${PLACEHOLDER_GRADIENTS[gradientIdx]}`}>
            <div className="absolute inset-0 flex items-center justify-center opacity-20 text-8xl select-none pointer-events-none">
              {day.icon}
            </div>
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-white text-lg font-semibold tracking-tight mb-0.5 drop-shadow-sm">
                {day.title}
              </h2>
              <p className="text-white text-5xl font-extrabold tracking-tight leading-none drop-shadow-md">
                {count.toLocaleString()}
              </p>
              <p className="text-white/80 text-sm font-medium mt-1">
                {day.count_direction === "since" ? "days together" : "days to go"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/90 text-sm font-medium drop-shadow-sm">
                {shortDate}
              </p>
            </div>
          </div>
        </div>

        {/* Edit button */}
        <button
          onClick={() => onEdit(day)}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/30 transition-all"
        >
          <Pencil size={13} />
        </button>
      </motion.div>

      {/* Full date below card */}
      <p className="text-center text-xs text-muted-foreground mt-2.5 tracking-wide">
        {fullDate}
      </p>

      {/* Milestone chips */}
      {milestones.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {milestones.map((m) => (
            <div
              key={m.label}
              className="px-2.5 py-1 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 text-[10px]"
            >
              <span className="font-bold text-primary">{m.label}</span>
              <span className="text-muted-foreground ml-1">in {m.daysLeft}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpecialDayHeroCard;
