import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import Modal from './Modal';

/**
 * Diálogo de confirmación genérico. Soporta `requireText` para acciones
 * destructivas críticas (ej. escribir el nombre exacto antes de eliminar).
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  requireText = null,
  loading = false,
}) {
  const [typed, setTyped] = useState('');
  const locked = requireText && typed.trim() !== requireText;

  const handleClose = () => {
    setTyped('');
    onClose?.();
  };

  const handleConfirm = () => {
    onConfirm?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={handleClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn-accent' : 'btn-primary'}
            onClick={handleConfirm}
            disabled={loading || locked}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="shrink-0 rounded-full bg-red-100 text-red-600 p-2 h-fit">
            <AlertTriangle size={18} />
          </div>
        )}
        <div className="text-sm text-gray-600 leading-relaxed">{message}</div>
      </div>

      {requireText && (
        <div className="mt-4">
          <label className="label-field">
            Escribe <span className="font-mono font-bold text-gray-900">{requireText}</span> para continuar
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="input-field"
            autoFocus
          />
        </div>
      )}
    </Modal>
  );
}
