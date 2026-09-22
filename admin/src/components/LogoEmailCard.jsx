import { useEffect, useRef, useState } from 'react';
import { Loader2, Image as ImageIcon, Upload } from 'lucide-react';
import { SkeletonText } from './Skeleton';
import { useToast } from './Toast';
import { getLogoEmail, subirLogoEmail } from '../utils/api';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function fileToBase64(file) {
}

export default function LogoEmailCard() {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await getLogoEmail();
      setLogoUrl(res.data.url);
    } catch (err) {
      addToast(`No se pudo cargar el logo actual: ${err.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Selecciona un archivo de imagen (PNG, JPG o WebP).', { type: 'error' });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      addToast('La imagen supera el máximo de 2MB.', { type: 'error' });
      return;
    }
    setArchivo(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const imageBase64 = await fileToBase64(archivo);
      const res = await subirLogoEmail(imageBase64);
      setLogoUrl(res.data.url);
      setArchivo(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      addToast('Logo actualizado. Se usará en los próximos correos enviados.', { type: 'success' });
    } catch (err) {
      addToast(`No se pudo subir el logo: ${err.message}`, { type: 'error' });
    } finally {
      setSubiendo(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5">
        <SkeletonText lines={3} />
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
        <ImageIcon size={16} className="text-gray-400" /> Logo para correos
      </h3>
      <p className="text-sm text-gray-500">
        Se usa en el encabezado de los emails al cliente y el email interno de notificación de OT. Si no se sube
        ninguno, se usa el logo por defecto del sistema.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-40 h-20 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl || logoUrl ? (
            <img src={previewUrl || logoUrl} alt="Logo actual" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[11px] text-gray-400 text-center px-2">Sin logo personalizado</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={elegirArchivo}
            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-condor-50 file:text-condor-700 hover:file:bg-condor-100"
          />
          <button className="btn-primary py-2 px-3 text-xs" onClick={subir} disabled={!archivo || subiendo}>
            {subiendo ? 'Subiendo...' : <><Upload size={13} /> Subir</>}
          </button>
        </div>
      </div>
    </div>
  );
}
