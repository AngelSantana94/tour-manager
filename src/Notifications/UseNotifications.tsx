import { useState } from "react";

export type NotifType = "reservation" | "cancellation" | "modification";

export interface Notification {
  id: string;
  type: NotifType;
  message: string;
  tour_id: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications] = useState<Notification[]>([]);
  const loading = false;
  const unreadCount = 0;

  const markAsRead = async (_id: string) => {};
  const markAllAsRead = async () => {};
  const deleteNotification = async (_id: string) => {};

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
