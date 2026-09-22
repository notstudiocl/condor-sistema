import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

// Un error de render en cualquier pantalla dejaba el panel en blanco, sin ningún aviso (pasó en
// producción con la ficha de orden). Acá se muestra un mensaje y un botón para recargar.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
            <AlertTriangle size={22} />
          </div>
          <p className="font-heading font-semibold text-gray-900">Algo salió mal en esta pantalla</p>
          <p className="text-sm text-gray-500 mt-1.5">
            El error quedó registrado. Recarga la página; si vuelve a pasar, avisa a NotStudio.
          </p>
          <p className="mt-3 text-[11px] font-mono text-gray-400 break-all">{String(this.state.error?.message || this.state.error)}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button className="btn-secondary" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Ir al inicio</button>
            <button className="btn-primary" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}
