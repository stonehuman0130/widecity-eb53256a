import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CalendarPage = () => {
  const [currentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(currentDate.getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const events = [
    { day: 16, title: "Date night", time: "7:00 PM", user: "both" as const },
    { day: 18, title: "Dentist appointment", time: "10:00 AM", user: "me" as const },
    { day: 20, title: "Dinner with parents", time: "6:30 PM", user: "partner" as const },
    { day: 22, title: "Grocery run", time: "11:00 AM", user: "both" as const },
  ];

  const dayEvents = events.filter((e) => e.day === selectedDay);

  return (
    <div className="px-5">
      <header className="pt-12 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[1.75rem] font-bold tracking-display">Calendar</h1>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
              <ChevronLeft size={16} />
            </button>
            <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1 font-medium">{monthName} {year}</p>
      </header>

      {/* Calendar Grid */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-card mb-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground text-center uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === currentDate.getDate();
            const isSelected = day === selectedDay;
            const hasEvent = events.some((e) => e.day === day);
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`relative w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "bg-primary/10 text-primary font-bold"
                    : "hover:bg-secondary"
                }`}
              >
                {day}
                {hasEvent && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events for selected day */}
      <h2 className="text-lg font-semibold tracking-display mb-3">
        {monthName} {selectedDay}
      </h2>
      {dayEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No events scheduled</p>
      ) : (
        <div className="space-y-3">
          {dayEvents.map((event, i) => (
            <div key={i} className="bg-card rounded-xl p-4 border border-border shadow-card flex items-center gap-3">
              <div className={`w-1 h-10 rounded-full ${event.user === "me" ? "bg-user-a" : event.user === "partner" ? "bg-user-b" : "bg-gradient-to-b from-user-a to-user-b"}`} />
              <div className="flex-1">
                <p className="text-[15px] font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{event.time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
