import { Pencil, Save, Loader2 } from 'lucide-react';

/**
 * Piezas de layout para fichas "por secciones" (orden, cliente): cada tarjeta es una
 * sección independiente con su propio botón Editar/Cancelar en la esquina y una grilla
 * de campos label-arriba/valor-abajo en modo lectura. Estilo Condor (card, btn-*, paleta
 * condor-*), distribución al estilo de la ficha de orden de H&A.
 */

export function Section({ title, icon: Icon, action, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading font-semibold text-gray-900 flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} className="text-gray-400 shrink-0" />}
          <span className="truncate">{title}</span>
        </h2>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Grilla de lectura: 1 columna en móvil, 2 en tablet, 3 en escritorio. */
export function FieldGrid({ children, className = '' }) {
  return <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4 ${className}`}>{children}</div>;
}

/** Campo de solo lectura: label gris pequeño arriba, valor abajo. `span` ocupa toda la fila. */
export function Field({ label, value, mono = false, span = false, children }) {
  const vacio = value === null || value === undefined || value === '';
  return (
    <div className={span ? 'sm:col-span-2 lg:col-span-3 min-w-0' : 'min-w-0'}>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {children ?? (
        <p className={`text-sm font-medium text-gray-800 break-words ${mono ? 'font-mono' : ''} ${vacio ? 'text-gray-400 font-normal' : ''}`}>
          {vacio ? '—' : value}
        </p>
      )}
    </div>
  );
}

export function EditarBtn({ onClick, disabled, label = 'Editar', title }) {
  return (
    <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={onClick} disabled={disabled} title={title}>
      <Pencil size={13} />
      {label}
    </button>
  );
}

export function CancelarBtn({ onClick, disabled, label = 'Cancelar' }) {
  return (
    <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

/** Pie de una sección en edición: Guardar (primario) + Cancelar, con estado de carga. */
export function SeccionAcciones({ onGuardar, onCancelar, guardando, guardarLabel = 'Guardar' }) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={onGuardar} disabled={guardando}>
        {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {guardando ? 'Guardando...' : guardarLabel}
      </button>
      <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={onCancelar} disabled={guardando}>
        Cancelar
      </button>
    </div>
  );
}
