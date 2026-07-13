import { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, WifiOff, Loader2, CheckCircle, LogIn, ChevronDown, ChevronUp, RotateCcw, Clock } from 'lucide-react';
import { initSyncManager, syncEvents, syncPendingOrders, MAX_RETRIES } from '../utils/syncManager';
import { getPendingCount, getPendingOrders, updateOrderStatus } from '../utils/offlineStorage';

const STATUS_CONFIG = {
  online:          { bg: 'bg-emerald-500', icon: Wifi,        hide: true },
  offline:         { bg: 'bg-red-500',     icon: WifiOff,     hide: false },
  syncing:         { bg: 'bg-amber-500',   icon: Loader2,     hide: false },
  synced:          { bg: 'bg-emerald-500', icon: CheckCircle, hide: true },
  'auth-required': { bg: 'bg-amber-600',   icon: LogIn,       hide: false },
};

let initedOnce = false;

// Órdenes que necesitan atención manual del técnico: bloqueadas por sesión vencida /
// kill switch, o que agotaron los reintentos automáticos (fallo de red/servidor
// persistente). Antes de esta corrección quedaban "zombies" invisibles en IndexedDB
// para siempre — acá se hacen visibles con un botón "Reintentar".
function esOrdenAtascada(order) {
  return order.status === 'auth-required' || (order.retries || 0) >= MAX_RETRIES;
}

export default function OfflineIndicator() {
  const [status, setStatus] = useState(navigator.onLine ? 'online' : 'offline');
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [stuck, setStuck] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const hideTimer = useRef(null);

  const refreshStuck = useCallback(async () => {
    const pending = await getPendingOrders();
    setStuck(pending.filter(esOrdenAtascada));
  }, []);

  useEffect(() => {
    // initSyncManager registra los ÚNICOS listeners 'online'/'offline' de la app —
    // guard para no duplicarlos si este componente llegara a remontarse.
    if (!initedOnce) {
      initedOnce = true;
      initSyncManager();
    }
    refreshStuck();

    const handleStatus = (e) => {
      const { status: newStatus, count } = e.detail;
      setStatus(newStatus);
      refreshStuck();

      getPendingCount().then((pending) => {
        const n = count ?? pending;
        const messages = {
          online: 'Conectado',
          offline: `Sin conexión${pending > 0 ? ` — ${pending} orden${pending > 1 ? 'es' : ''} pendiente${pending > 1 ? 's' : ''}` : ''}`,
          syncing: `Enviando ${n} orden${n > 1 ? 'es' : ''} pendiente${n > 1 ? 's' : ''}...`,
          synced: `${n} orden${n > 1 ? 'es' : ''} enviada${n > 1 ? 's' : ''} exitosamente`,
          'auth-required': `Inicia sesión para enviar ${n} orden${n > 1 ? 'es' : ''} pendiente${n > 1 ? 's' : ''}`,
        };
        setMessage(messages[newStatus] || '');
      });

      setVisible(true);
      clearTimeout(hideTimer.current);
      if (STATUS_CONFIG[newStatus]?.hide) {
        hideTimer.current = setTimeout(() => setVisible(false), 3000);
      }
    };

    syncEvents.addEventListener('status', handleStatus);

    if (!navigator.onLine) {
      setVisible(true);
      getPendingCount().then((c) => {
        setMessage(`Sin conexión${c > 0 ? ` — ${c} orden${c > 1 ? 'es' : ''} pendiente${c > 1 ? 's' : ''}` : ''}`);
      });
    }

    return () => {
      syncEvents.removeEventListener('status', handleStatus);
      clearTimeout(hideTimer.current);
    };
  }, [refreshStuck]);

  const reintentarUna = async (id) => {
    await updateOrderStatus(id, 'pending');
    await refreshStuck();
    syncPendingOrders();
  };

  const reintentarTodas = async () => {
    await Promise.all(stuck.map((o) => updateOrderStatus(o.id, 'pending')));
    setPanelOpen(false);
    await refreshStuck();
    syncPendingOrders();
  };

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.online;
  const Icon = config.icon;

  return (
    <>
      {visible && (
        <div className={`fixed top-0 left-0 right-0 z-[100] ${config.bg} text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium transition-all duration-300`}>
          <Icon className={`w-4 h-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
          <span>{message}</span>
        </div>
      )}

      {stuck.length > 0 && (
        <div className={`fixed ${visible ? 'top-12' : 'top-2'} right-2 z-[99] transition-all duration-300`}>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="flex items-center gap-1.5 bg-white border border-amber-300 shadow-lg rounded-full pl-3 pr-2.5 py-1.5 text-xs font-semibold text-amber-700"
          >
            <Clock size={13} />
            {stuck.length} pendiente{stuck.length > 1 ? 's' : ''}
            {panelOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {panelOpen && (
            <div className="mt-2 w-72 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Órdenes que necesitan atención</span>
                <button
                  type="button"
                  onClick={reintentarTodas}
                  className="text-[11px] font-bold text-accent-600 hover:text-accent-700 flex items-center gap-1"
                >
                  <RotateCcw size={11} /> Reintentar todas
                </button>
              </div>
              {stuck.map((o) => (
                <div key={o.id} className="px-3 py-2 border-b border-gray-50 last:border-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {o.data?.clienteEmpresa || o.data?.supervisor || `Orden sin enviar`}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {o.status === 'auth-required' ? 'Sesión requerida' : `${o.retries || 0} intentos fallidos`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => reintentarUna(o.id)}
                    className="shrink-0 p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
