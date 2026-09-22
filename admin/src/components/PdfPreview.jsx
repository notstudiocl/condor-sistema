import { FileText, Download, ExternalLink } from 'lucide-react';
import Modal from './Modal';

// Ícono + modal de previsualización de PDF para filas de tabla (mismo comportamiento que H&A):
// ícono atenuado si no hay PDF, o botón que abre un modal con el PDF embebido y Descargar.
// `data-stop-row-click` evita que DataTable dispare onRowClick al hacer clic en el ícono.

export function PdfCelda({ url, etiqueta, onAbrir }) {
  if (!url) {
    return (
      <span data-stop-row-click className="inline-flex p-1.5 text-gray-300 cursor-default" title="PDF aún no generado">
        <FileText size={16} />
      </span>
    );
  }
  return (
    <button
      type="button"
      data-stop-row-click
      onClick={(e) => { e.stopPropagation(); onAbrir(); }}
      className="inline-flex p-1.5 rounded-md text-condor-700 hover:bg-condor-50 hover:text-condor-900 transition-colors"
      title={`Ver PDF de ${etiqueta}`}
      aria-label={`Ver PDF de ${etiqueta}`}
    >
      <FileText size={16} />
    </button>
  );
}

export function PdfModal({ item, onClose }) {
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item ? `PDF · ${item.titulo}` : ''}
      size="xl"
      footer={item && (
        <>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-secondary"><ExternalLink size={15} /> Abrir en pestaña</a>
          <a href={item.url} target="_blank" rel="noopener noreferrer" download className="btn-primary"><Download size={15} /> Descargar</a>
        </>
      )}
    >
      {item && <iframe src={item.url} title={`PDF de ${item.titulo}`} className="w-full h-[75vh] border border-gray-200 rounded-lg bg-gray-50" />}
    </Modal>
  );
}
