import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { SpecialDay, getDayCount, getUpcomingMilestones } from "./SpecialDayTypes";

interface Props {
  day: SpecialDay;
  now: Date;
  onEdit: (day: SpecialDay) => void;
}

const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, hsl(30 30% 88%), hsl(35 25% 82%), hsl(25 20% 78%))",
  "linear-gradient(135deg, hsl(340 20% 88%), hsl(330 18% 82%), hsl(320 15% 78%))",
  "linear-gradient(135deg, hsl(210 20% 88%), hsl(220 18% 82%), hsl(230 15% 78%))",
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
    <div className="mb-1">
      {/* Outer frosted container — matching reference glassmorphism wrapper */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="rounded-[1.5rem] bg-card/50 backdrop-blur-md border border-border/30 shadow-lg p-2.5 relative"
      >
        {/* Inner photo card */}
        <div
          className="relative rounded-[1.1rem] overflow-hidden"
          style={{ aspectRatio: "5 / 4" }}
        >
          {/* Background */}
          {hasPhoto ? (
            <img
              src={day.photo_url!}
              alt={day.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: PLACEHOLDER_GRADIENTS[gradientIdx] }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15 text-[96px] select-none pointer-events-none">
                {day.icon}
              </div>
            </div>
          )}

          {/* Dark gradient for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/25 to-transparent" />

          {/* Text overlay — left aligned, matching reference */}
          <div className="absolute inset-0 flex flex-col justify-end p-5 pb-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-white/95 text-[17px] font-semibold tracking-tight drop-shadow-sm">
                  {day.title}
                </h2>
                <p className="text-white text-[52px] font-extrabold tracking-tighter leading-[1] mt-0.5 drop-shadow-md"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {count.toLocaleString()}
                </p>
                <p className="text-white/75 text-[13px] font-medium mt-0.5">
                  {day.count_direction === "since" ? "days together" : "days to go"}
                </p>
              </div>
              <div className="text-right pb-1">
                <p className="text-white/85 text-[13px] font-medium drop-shadow-sm">
                  {shortDate}
                </p>
              </div>
            </div>
          </div>

          {/* Edit affordance */}
          <button
            onClick={() => onEdit(day)}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/15 backdrop-blur-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/25 transition-all"
          >
            <Pencil size={12} />
          </button>
        </div>
      </motion.div>

      {/* Full date below — reference style */}
      <p className="text-center text-[11px] text-muted-foreground/70 mt-2 tracking-wide font-medium">
        {fullDate}
      </p>

      {/* Milestone chips */}
      {milestones.length > 0 && (
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {milestones.map((m) => (
            <div
              key={m.label}
              className="px-2.5 py-1 rounded-full bg-card/70 backdrop-blur-sm border border-border/40 text-[10px]"
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
