import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Mail, MessageCircle } from 'lucide-react';
import { listNotificacionesLog } from '../utils/api';

// Campana de notificaciones internas del admin. Reusa notificacion_log (los
// envíos reales de email/Telegram) como fuente de eventos — sin tabla nueva.
// El estado "leído/descartado" vive 100% en localStorage: un Set de ids ya
// vistos. Leer un item, descartarlo con la X, o "marcar todas" hacen lo mismo
// a nivel de storage (agregar id(s) al Set); la X además lo saca de la vista
// actual para que la bandeja se sienta como una bandeja.
const STORAGE_KEY = 'condor_admin_notif_seen';
const MAX_SEEN_IDS = 500; // evita que el Set crezca sin límite con los meses
const POLL_MS = 30000;
const FETCH_LIMIT = 20;

function loadSeenIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(set) {
  try {
    let arr = Array.from(set);
    if (arr.length > MAX_SEEN_IDS) arr = arr.slice(arr.length - MAX_SEEN_IDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — la campana sigue
    // funcionando en memoria para esta sesión, simplemente no persiste.
  }
}

function resumenNotificacion(item) {
  if (item.plantilla === 'email_cliente') return 'Email a cliente';
  if (item.plantilla === 'email_interno') return 'Email interno';
  if (item.plantilla === 'telegram_ot') return 'Telegram';
  return item.canal === 'telegram' ? 'Telegram' : 'Email';
}

function tiempoRelativo(fecha) {
  const d = new Date(fecha).getTime();
  if (isNaN(d)) return '';
  const diffMin = Math.floor((Date.now() - d) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return `hace ${Math.floor(diffH / 24)} d`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seenIds, setSeenIds] = useState(() => loadSeenIds());
  const panelRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const res = await listNotificacionesLog({ limit: FETCH_LIMIT });
      setItems(res.data?.rows || []);
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling cada ~30s mientras la campana está montada (siempre, vive en el
  // Topbar) — así el badge se mantiene al día sin necesidad de abrir el panel.
  useEffect(() => {
    cargar();
    const interval = setInterval(cargar, POLL_MS);
    return () => clearInterval(interval);
  }, [cargar]);

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const marcarLeido = useCallback((ids) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(String(id)));
      saveSeenIds(next);
      return next;
    });
  }, []);

  const unreadCount = items.filter((item) => !seenIds.has(String(item.id))).length;

  const handleItemClick = (item) => {
    marcarLeido([item.id]);
    setOpen(false);
    if (item.orden_id) navigate(`/ordenes/${item.orden_id}`);
  };

  const handleDismiss = (e, item) => {
    e.stopPropagation();
    marcarLeido([item.id]);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const handleMarkAllRead = () => {
    marcarLeido(items.map((item) => item.id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notificaciones</p>
            {items.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-condor-700 hover:text-condor-900"
              >
                <CheckCheck size={13} /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="px-3.5 py-6 text-center text-xs text-gray-400">Cargando...</div>
            ) : error ? (
              <div className="px-3.5 py-6 text-center text-xs text-red-500">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-3.5 py-8 text-center text-xs text-gray-400">Sin notificaciones recientes.</div>
            ) : (
              items.map((item) => {
                const isUnread = !seenIds.has(String(item.id));
                const Icon = item.canal === 'telegram' ? MessageCircle : Mail;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex items-start gap-2.5 pl-4 pr-2 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isUnread ? 'bg-condor-50/60' : ''
                    }`}
                  >
                    {isUnread && (
                      <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-condor-600" aria-hidden="true" />
                    )}
                    <Icon size={15} className={`shrink-0 mt-0.5 ${item.ok ? 'text-gray-400' : 'text-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                        {resumenNotificacion(item)} — OT-{item.numero_orden_display}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.ok ? (
                          <span className="text-[10px] font-medium text-emerald-600">Entregado</span>
                        ) : (
                          <span className="text-[10px] font-medium text-red-500" title={item.error || ''}>
                            Falló
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">· {tiempoRelativo(item.sent_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDismiss(e, item)}
                      className="shrink-0 p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-600 hover:bg-gray-100 transition-all"
                      aria-label="Descartar"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
