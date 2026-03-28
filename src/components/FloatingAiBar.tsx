import { useState } from "react";
import { Sparkles, Send } from "lucide-react";

interface FloatingAiBarProps {
  onSubmit: (text: string) => void;
}

const FloatingAiBar = ({ onSubmit }: FloatingAiBarProps) => {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSubmit(text);
    setInput("");
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[calc(var(--max-w,28rem)-2rem)] z-50">
      <div className="flex items-center gap-2 rounded-2xl bg-card/95 backdrop-blur-lg border border-border shadow-lg px-4 py-3">
        <Sparkles size={18} className="text-primary shrink-0" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Ask AI anything…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="text-primary disabled:text-muted-foreground transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default FloatingAiBar;
