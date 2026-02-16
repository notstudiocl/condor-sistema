import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Loader2, CheckCircle } from 'lucide-react';
import { initSyncManager } from '../utils/syncManager';
import { getPendingCount } from '../utils/offlineStorage';

const STATUS_CONFIG = {
  online:  { bg: 'bg-emerald-500', icon: Wifi,        hide: true },
  offline: { bg: 'bg-red-500',     icon: WifiOff,     hide: false },
  syncing: { bg: 'bg-amber-500',   icon: Loader2,     hide: false },
  synced:  { bg: 'bg-emerald-500', icon: CheckCircle,  hide: true },
};

export default function OfflineIndicator() {
  const [status, setStatus] = useState(navigator.onLine ? 'online' : 'offline');
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    initSyncManager(async ({ status: newStatus, count }) => {
      setStatus(newStatus);
      const pending = count ?? await getPendingCount();

      const messages = {
        online:  'Conectado',
        offline: `Sin conexión${pending > 0 ? ` — ${pending} orden${pending > 1 ? 'es' : ''} pendiente${pending > 1 ? 's' : ''}` : ''}`,
        syncing: `Enviando ${pending} orden${pending > 1 ? 'es' : ''} pendiente${pending > 1 ? 's' : ''}...`,
        synced:  `${pending} orden${pending > 1 ? 'es' : ''} enviada${pending > 1 ? 's' : ''} exitosamente`,
      };

      setMessage(messages[newStatus] || '');
      setVisible(true);

      clearTimeout(hideTimer.current);
      if (STATUS_CONFIG[newStatus]?.hide) {
        hideTimer.current = setTimeout(() => setVisible(false), 3000);
      }
    });

    // Initial state
    if (!navigator.onLine) {
      setVisible(true);
      getPendingCount().then((c) => {
        setMessage(`Sin conexión${c > 0 ? ` — ${c} orden${c > 1 ? 'es' : ''} pendiente${c > 1 ? 's' : ''}` : ''}`);
      });
    }

    return () => clearTimeout(hideTimer.current);
  }, []);

  if (!visible) return null;

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.online;
  const Icon = config.icon;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] ${config.bg} text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium transition-all duration-300`}>
      <Icon className={`w-4 h-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      <span>{message}</span>
    </div>
  );
}
