import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/services/notification.service';
import { useAuthStore } from '@/store/authStore';
import type { Notification } from '@/types/notification';

function timeAgo(ts: Notification['createdAt']): string {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

const iconByType: Record<Notification['type'], string> = {
  new_application: '📩',
  application_accepted: '✅',
  application_rejected: '❌',
  job_completed: '🏁',
  job_cancelled: '🚫',
  deadline_expired: '⏰',
  completion_requested: '📋',
  job_invite: '💌',
};

export default function NotificationBell() {
  const { userProfile } = useAuthStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeToNotifications(userProfile.uid, setNotifications);
    return unsub;
  }, [userProfile?.uid]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
  }

  async function handleMarkAllRead() {
    if (!userProfile?.uid) return;
    await markAllNotificationsRead(userProfile.uid);
  }

  async function handleClickNotification(n: Notification) {
    if (!n.read) await markNotificationRead(n.id);
    setOpen(false);
    if (n.jobId) navigate(`/jobs/${n.jobId}`);
  }

  if (!userProfile) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
        aria-label="Thông báo"
      >
        {unread > 0 ? (
          <BellRing className="h-5 w-5 text-[var(--color-primary)]" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-[var(--color-border)] bg-white shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <span className="font-semibold">Thông báo</span>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Đọc tất cả
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
                  <Bell className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Chưa có thông báo nào
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-secondary)] ${
                      !n.read ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-lg">{iconByType[n.type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.read ? 'font-medium' : ''}`}>{n.message}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
