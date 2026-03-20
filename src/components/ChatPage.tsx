import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";
import { toast } from "sonner";

interface Message {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

const ChatPage = ({
  group,
  onBack,
}: {
  group: Group;
  onBack: () => void;
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map<string, { name: string; avatar: string | null }>();
  group.members.forEach((m) => {
    memberMap.set(m.user_id, { name: m.display_name || "Member", avatar: m.avatar_url });
  });

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", group.id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data && !error) setMessages(data as Message[]);
      setLoading(false);
      scrollToBottom();
    };

    loadMessages();

    const channel = supabase
      .channel(`chat-${group.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${group.id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `group_id=eq.${group.id}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group.id, user, scrollToBottom]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("messages").insert({
      group_id: group.id,
      user_id: user.id,
      content,
    });

    if (error) {
      toast.error("Failed to send message");
      setNewMessage(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const formatDateSeparator = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const messagesWithDates: (Message | { type: "date"; label: string })[] = [];
  let lastDate = "";
  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      messagesWithDates.push({ type: "date", label: formatDateSeparator(msg.created_at) });
      lastDate = msgDate;
    }
    messagesWithDates.push(msg);
  });

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1"
            aria-label="Back to chats"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-xl">{group.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">{group.name}</h1>
            <p className="text-[10px] text-muted-foreground">
              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading messages...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageCircle size={40} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        )}

        {messagesWithDates.map((item, idx) => {
          if ("type" in item && item.type === "date") {
            return (
              <div key={`date-${idx}`} className="flex items-center justify-center py-3">
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-3 py-1 rounded-full uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
            );
          }

          const msg = item as Message;
          const isMe = msg.user_id === user?.id;
          const member = memberMap.get(msg.user_id);
          const senderName = member?.name || "Unknown";

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] font-semibold text-muted-foreground ml-1 mb-0.5 block">
                    {senderName}
                  </span>
                )}
                <div
                  className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-foreground rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isMe ? "text-right mr-1" : "ml-1"}`}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
