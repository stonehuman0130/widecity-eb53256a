import { useState } from "react";
import { User, Bell, Shield, Palette, HelpCircle, LogOut, ChevronRight, Link2, Copy, Check, Unlink, Loader2, Calendar, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const settingsItems = [
  { icon: Bell, label: "Notifications", desc: "Reminders & alerts" },
  { icon: Shield, label: "Privacy", desc: "Data & sharing" },
  { icon: Palette, label: "Appearance", desc: "Theme & display" },
  { icon: HelpCircle, label: "Help & Support", desc: "FAQ & contact" },
];

const SettingsPage = () => {
  const { profile, partner, signOut, connectPartner, disconnectPartner, refreshProfile } = useAuth();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [showAppleCalDialog, setShowAppleCalDialog] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [calUrlCopied, setCalUrlCopied] = useState(false);

  const calendarToken = (profile as any)?.calendar_token;
  const calFeedUrl = calendarToken
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${calendarToken}`
    : null;

  // webcal:// protocol for Apple Calendar subscription
  const webcalUrl = calFeedUrl ? calFeedUrl.replace(/^https?:\/\//, "webcal://") : null;

  const handleCopyCode = () => {
    if (profile?.invite_code) {
      navigator.clipboard.writeText(profile.invite_code);
      setCodeCopied(true);
      toast.success("Invite code copied!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleCopyCalUrl = () => {
    if (calFeedUrl) {
      navigator.clipboard.writeText(calFeedUrl);
      setCalUrlCopied(true);
      toast.success("Calendar URL copied!");
      setTimeout(() => setCalUrlCopied(false), 2000);
    }
  };

  const handleConnect = async () => {
    if (!inviteInput.trim()) return;
    setConnecting(true);
    const result = await connectPartner(inviteInput.trim());
    if (result.success) {
      toast.success(`Connected with ${result.partner_name}! 🎉`);
      setShowPartnerDialog(false);
      setInviteInput("");
    } else {
      toast.error(result.error || "Failed to connect");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    const result = await disconnectPartner();
    if (result.success) {
      toast.success("Partner disconnected");
    } else {
      toast.error(result.error || "Failed to disconnect");
    }
  };

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";
  const partnerInitial = partner?.display_name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="px-5">
      <header className="pt-12 pb-6">
        <h1 className="text-[1.75rem] font-bold tracking-display">Settings</h1>
      </header>

      {/* Profile Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{profile?.display_name || "You"}</p>
          <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
        </div>
        {partner && (
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold">
            {partnerInitial}
          </div>
        )}
      </div>

      {/* Partner Connection */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        {partner ? (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Link2 size={16} className="text-primary" />
              <span className="text-sm font-semibold">Connected Partner</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold">
                {partnerInitial}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{partner.display_name}</p>
                <p className="text-xs text-muted-foreground">{partner.email}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Disconnect"
              >
                <Unlink size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Link2 size={16} className="text-primary" />
              <span className="text-sm font-semibold">Connect with Partner</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Share your invite code or enter your partner's code to connect and share schedules, habits, and workouts.
            </p>

            {/* Your code */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-secondary rounded-lg px-3 py-2.5 text-center">
                <span className="text-xs text-muted-foreground block">Your Invite Code</span>
                <span className="text-lg font-bold tracking-widest">{profile?.invite_code || "..."}</span>
              </div>
              <button
                onClick={handleCopyCode}
                className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {codeCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>

            <button
              onClick={() => setShowPartnerDialog(true)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              Enter Partner's Code
            </button>
          </div>
        )}
      </div>

      {/* Calendar Integrations Section */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden" id="calendar-integrations">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={16} className="text-primary" />
            <span className="text-sm font-semibold">Calendar Integrations</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Subscribe to your WC Planner schedule in your favorite calendar app.
          </p>
          <div className="space-y-2">
            {/* Apple Calendar - real subscription */}
            <button
              onClick={() => setShowAppleCalDialog(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              <span className="text-xl">🍎</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Apple Calendar</p>
                <p className="text-xs text-muted-foreground">Subscribe via ICS feed</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground" />
            </button>

            {/* Google Calendar - ICS subscription */}
            <a
              href={calFeedUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calFeedUrl)}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!calFeedUrl) {
                  e.preventDefault();
                  toast.error("Calendar token not ready. Please refresh.");
                }
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Google Calendar</p>
                <p className="text-xs text-muted-foreground">Add to Google Calendar</p>
              </div>
              <ExternalLink size={14} className="text-muted-foreground" />
            </a>

            {/* Outlook Calendar - ICS subscription */}
            <a
              href={calFeedUrl ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(calFeedUrl)}&name=WC+Planner` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!calFeedUrl) {
                  e.preventDefault();
                  toast.error("Calendar token not ready. Please refresh.");
                }
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              <span className="text-xl">📧</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Outlook Calendar</p>
                <p className="text-xs text-muted-foreground">Add to Outlook</p>
              </div>
              <ExternalLink size={14} className="text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>

      {/* Settings List */}
      <div className="space-y-1">
        {settingsItems.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <item.icon size={20} className="text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors mt-4 text-destructive"
      >
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <LogOut size={20} />
        </div>
        <span className="text-sm font-semibold">Log Out</span>
      </button>

      {/* Partner Code Dialog */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect with Partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Enter the invite code your partner shared with you.
            </p>
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-center text-lg font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || inviteInput.length < 4}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apple Calendar Dialog */}
      <Dialog open={showAppleCalDialog} onOpenChange={setShowAppleCalDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apple Calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Subscribe to your WC Planner events in Apple Calendar. Your calendar will auto-refresh to stay in sync.
            </p>

            {webcalUrl ? (
              <>
                {/* Direct subscribe button */}
                <a
                  href={webcalUrl}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Calendar size={16} />
                  Open in Apple Calendar
                </a>

                <div className="text-center text-xs text-muted-foreground">or copy the URL manually</div>

                {/* Copy URL */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary rounded-lg px-3 py-2.5 overflow-hidden">
                    <p className="text-[10px] text-muted-foreground truncate">{calFeedUrl}</p>
                  </div>
                  <button
                    onClick={handleCopyCalUrl}
                    className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                  >
                    {calUrlCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Manual steps:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Copy the URL above</li>
                    <li>Open Apple Calendar → File → New Calendar Subscription</li>
                    <li>Paste the URL and click Subscribe</li>
                  </ol>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Loading your calendar feed URL...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
