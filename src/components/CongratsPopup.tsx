import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = {
  task: [
    { emoji: "🎉", title: "Task Complete!", sub: "Great job staying on top of things!" },
    { emoji: "✅", title: "Nailed it!", sub: "You're crushing your day!" },
    { emoji: "💪", title: "Nice work!", sub: "One less thing to worry about!" },
  ],
  habit: [
    { emoji: "🌟", title: "Habit Done!", sub: "You're building a better you!" },
    { emoji: "🔥", title: "Keep it up!", sub: "Consistency is key to success!" },
    { emoji: "💚", title: "Healthy choice!", sub: "You're getting healthier every day!" },
  ],
  workout: [
    { emoji: "🏆", title: "Workout Complete!", sub: "You're getting stronger!" },
    { emoji: "💪", title: "Beast mode!", sub: "Your body thanks you!" },
    { emoji: "🔥", title: "Crushed it!", sub: "You're getting healthier every session!" },
  ],
};

interface CongratsPopupProps {
  type: "task" | "habit" | "workout";
  show: boolean;
  onClose: () => void;
}

const CongratsPopup = ({ type, show, onClose }: CongratsPopupProps) => {
  const [msg] = useState(() => {
    const pool = MESSAGES[type];
    return pool[Math.floor(Math.random() * pool.length)];
  });

  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2200);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl text-center pointer-events-auto max-w-[280px]">
            <span className="text-5xl block mb-2">{msg.emoji}</span>
            <h3 className="text-lg font-bold text-foreground">{msg.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{msg.sub}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CongratsPopup;
