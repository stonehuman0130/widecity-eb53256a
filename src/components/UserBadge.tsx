const UserBadge = ({ user }: { user: "me" | "partner" | "both" }) => {
  if (user === "both") {
    return (
      <div className="flex -space-x-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground bg-user-a ring-2 ring-card">H</div>
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground bg-user-b ring-2 ring-card">E</div>
      </div>
    );
  }

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground ${
        user === "me" ? "bg-user-a" : "bg-user-b"
      }`}
    >
      {user === "me" ? "H" : "E"}
    </div>
  );
};

export default UserBadge;
