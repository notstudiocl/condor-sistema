import { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // max-h en dvh (no vh): en móvil descuenta la barra del navegador, así el footer con los
    // botones nunca queda tapado. En 844x390 el cuerpo scrollea internamente.
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-white rounded-2xl shadow-xl w-full ${SIZES[size]} max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] min-h-0 flex flex-col animate-[modalIn_.15s_ease-out]`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-heading font-semibold text-gray-900 min-w-0 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="h-10 w-10 -mr-2 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto min-h-0">{children}</div>
        {footer && (
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0">{footer}</div>
        )}
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
