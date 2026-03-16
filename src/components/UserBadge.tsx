const UserBadge = ({ user }: { user: "me" | "partner" }) => (
  <div
    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground ${
      user === "me" ? "bg-user-a" : "bg-user-b"
    }`}
  >
    {user === "me" ? "H" : "E"}
  </div>
);

export default UserBadge;
