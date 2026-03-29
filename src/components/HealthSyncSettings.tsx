import { useState } from "react";
import { Smartphone, Check, ChevronRight, Unlink, Loader2, Watch } from "lucide-react";
import { toast } from "sonner";

interface ConnectedDevice {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  lastSync?: string;
}

const AVAILABLE_SOURCES: ConnectedDevice[] = [
  { id: "apple_health", name: "Apple Health", icon: "🍎", connected: false },
  { id: "garmin", name: "Garmin Connect", icon: "⌚", connected: false },
  { id: "strava", name: "Strava", icon: "🏃", connected: false },
  { id: "fitbit", name: "Fitbit", icon: "💪", connected: false },
  { id: "samsung_health", name: "Samsung Health", icon: "📱", connected: false },
  { id: "google_fit", name: "Google Fit", icon: "🏋️", connected: false },
];

const HealthSyncSettings = () => {
  const [devices, setDevices] = useState<ConnectedDevice[]>(AVAILABLE_SOURCES);
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (deviceId: string) => {
    setConnecting(deviceId);
    // Simulate connection flow - in production this would open OAuth
    await new Promise((r) => setTimeout(r, 1500));
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, connected: true, lastSync: new Date().toLocaleString() }
          : d
      )
    );
    const device = devices.find((d) => d.id === deviceId);
    toast.success(`${device?.name} connected! Auto-sync enabled.`);
    setConnecting(null);
  };

  const handleDisconnect = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, connected: false, lastSync: undefined } : d
      )
    );
    const device = devices.find((d) => d.id === deviceId);
    toast.success(`${device?.name} disconnected`);
  };

  const connectedDevices = devices.filter((d) => d.connected);
  const availableDevices = devices.filter((d) => !d.connected);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <Watch size={18} className="text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Health & Device Sync</h3>
          <p className="text-xs text-muted-foreground">Connect fitness trackers to auto-import workouts</p>
        </div>
      </div>

      {/* Connected devices */}
      {connectedDevices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected</p>
          {connectedDevices.map((device) => (
            <div
              key={device.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20"
            >
              <span className="text-xl">{device.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{device.name}</p>
                {device.lastSync && (
                  <p className="text-[10px] text-muted-foreground">
                    Last synced: {device.lastSync}
                  </p>
                )}
              </div>
              <Check size={14} className="text-primary flex-shrink-0" />
              <button
                onClick={() => handleDisconnect(device.id)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Unlink size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available devices */}
      <div className="space-y-2">
        {connectedDevices.length > 0 && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available</p>
        )}
        {availableDevices.map((device) => (
          <button
            key={device.id}
            onClick={() => handleConnect(device.id)}
            disabled={connecting === device.id}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-all disabled:opacity-60"
          >
            <span className="text-xl">{device.icon}</span>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium">{device.name}</p>
              <p className="text-[10px] text-muted-foreground">Tap to connect</p>
            </div>
            {connecting === device.id ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="p-3 rounded-xl bg-secondary/50">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <Smartphone size={11} className="inline mr-1 -mt-0.5" />
          When connected, completed workouts from your device will appear automatically.
          If a matching planned workout exists, you'll be prompted to mark it complete with the imported data.
        </p>
      </div>
    </div>
  );
};

export default HealthSyncSettings;
