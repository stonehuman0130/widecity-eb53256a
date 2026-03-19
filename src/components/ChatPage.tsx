import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import GroupSelector from "@/components/GroupSelector";
import { toast } from "sonner";

interface Message {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}

const ChatPage = () => {
  const { user, activeGroup, groups, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build a map of member profiles from the active group
  const memberMap = new Map<string, { name: string; avatar: string | null }>();
  if (activeGroup) {
    activeGroup.members.forEach((m) => {
      memberMap.set(m.user_id, { name: m.display_name || "Member", avatar: m.avatar_url });
    });
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Load messages
  useEffect(() => {
    if (!activeGroup || !user) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", activeGroup.id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data && !error) {
        setMessages(data as Message[]);
      }
      setLoading(false);
      scrollToBottom();
    };

    loadMessages();

    // Subscribe to realtime
    const channel = supabase
      .channel(`chat-${activeGroup.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${activeGroup.id}`,
        },
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
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${activeGroup.id}`,
        },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeGroup, user, scrollToBottom]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeGroup || !user) return;

    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("messages").insert({
      group_id: activeGroup.id,
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

  // Group messages by date
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

  if (!activeGroup) {
    return (
      <div className="px-5">
        <header className="pt-12 pb-4">
          <h1 className="text-[1.75rem] font-bold tracking-display">Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">Select a group to start chatting</p>
        </header>
        <GroupSelector />
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <MessageCircle size={48} strokeWidth={1} className="mb-4 opacity-40" />
          <p className="text-sm">Select a group above to open its chat</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="px-5 pt-12 pb-3 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{activeGroup.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-display truncate">{activeGroup.name}</h1>
            <p className="text-xs text-muted-foreground">
              {activeGroup.members.length} member{activeGroup.members.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Group selector */}
      <div className="px-5 py-2 border-b border-border">
        <GroupSelector />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
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
      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm">
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
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-opacity"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
