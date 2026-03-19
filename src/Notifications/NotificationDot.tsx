import { useNotifications } from "./UseNotifications";

export default function NotificationDot() {
  const { unreadCount } = useNotifications();
  if (unreadCount === 0) return null;
  return (
    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-error ring-2 ring-base-100" />
  );
}
