import { User, Bell, Shield, Palette, HelpCircle, LogOut, ChevronRight } from "lucide-react";

const settingsItems = [
  { icon: User, label: "Profile", desc: "Manage your account" },
  { icon: Bell, label: "Notifications", desc: "Reminders & alerts" },
  { icon: Shield, label: "Privacy", desc: "Data & sharing" },
  { icon: Palette, label: "Appearance", desc: "Theme & display" },
  { icon: HelpCircle, label: "Help & Support", desc: "FAQ & contact" },
];

const SettingsPage = () => {
  return (
    <div className="px-5">
      <header className="pt-12 pb-6">
        <h1 className="text-[1.75rem] font-bold tracking-display">Settings</h1>
      </header>

      {/* Profile Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-user-a flex items-center justify-center text-primary-foreground text-xl font-bold">
          H
        </div>
        <div className="flex-1">
          <p className="font-semibold text-base">Harrison</p>
          <p className="text-sm text-muted-foreground">Partnered with Evelyn</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-user-b flex items-center justify-center text-primary-foreground text-sm font-bold">
          E
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

      <button className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors mt-4 text-destructive">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <LogOut size={20} />
        </div>
        <span className="text-sm font-semibold">Log Out</span>
      </button>
    </div>
  );
};

export default SettingsPage;
