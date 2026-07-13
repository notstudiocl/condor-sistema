import { useEffect, useMemo, useState } from 'react';
import { Plus, KeyRound, Trash2, ShieldCheck, AlertCircle, Building2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatFechaHora, iniciales } from '../utils/format';
import { getSession } from '../utils/auth';
import { listUsuarios, crearUsuario, actualizarUsuario, resetPasswordUsuario, eliminarUsuario } from '../utils/api';

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina' };

const MATRIZ_PERMISOS = [
  { seccion: 'Dashboard, Órdenes, Clientes, Personal, Servicios, Notificaciones', oficina: true, admin: true },
  { seccion: 'Configuración (claves Resend/Telegram)', oficina: false, admin: true },
  { seccion: 'Usuarios del panel', oficina: false, admin: true },
  { seccion: 'Eliminar órdenes', oficina: false, admin: true },
];

function CredencialesReveladas({ email, password, invitacionEnviada }) {
  return (
    <div className="bg-condor-50 border border-condor-200 rounded-xl p-4 space-y-2">
      <p className="text-xs font-semibold text-condor-700 uppercase tracking-wide">Credenciales — se muestran una vez</p>
      <p className="text-sm text-gray-700">
        <span className="text-gray-400">Correo:</span> {email}
      </p>
      <p className="text-sm text-gray-700 font-mono">
        <span className="text-gray-400 font-sans">Contraseña temporal:</span> {password}
      </p>
      <p className="text-xs text-condor-700">
        {invitacionEnviada ? 'Se envió por correo automáticamente.' : 'No se pudo enviar por correo — compártela manualmente.'}
      </p>
    </div>
  );
}

export default function UsuariosAdminPage() {
  const { addToast } = useToast();
  const yo = getSession()?.user;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [credenciales, setCredenciales] = useState(null);

  const [resetTarget, setResetTarget] = useState(null);
  const [reseteando, setReseteando] = useState(false);

  const [eliminarTarget, setEliminarTarget] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listUsuarios();
      setUsuarios(res.data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleCrear = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setCreando(true);
    try {
      const res = await crearUsuario({ email: form.get('email'), nombre: form.get('nombre'), rol: form.get('rol') });
      setNuevoOpen(false);
      setCredenciales({ email: res.data.user.email, password: res.data.password, invitacionEnviada: res.data.invitacionEnviada });
      cargar();
    } catch (err) {
      addToast(`No se pudo crear el usuario: ${err.message}`, { type: 'error' });
    } finally {
      setCreando(false);
    }
  };

  const toggleActivo = async (u) => {
    try {
      await actualizarUsuario(u.id, { activo: !u.activo });
      addToast(`${u.nombre} ${u.activo ? 'desactivado' : 'reactivado'}.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo actualizar: ${err.message}`, { type: 'error' });
    }
  };

  const cambiarRol = async (u, rol) => {
    try {
      await actualizarUsuario(u.id, { rol });
      addToast(`Rol de ${u.nombre} actualizado a ${ROL_LABEL[rol]}.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo cambiar el rol: ${err.message}`, { type: 'error' });
    }
  };

  const handleResetPassword = async () => {
    setReseteando(true);
    try {
      const res = await resetPasswordUsuario(resetTarget.id);
      setResetTarget(null);
      setCredenciales({ email: resetTarget.email, password: res.data.password, invitacionEnviada: res.data.invitacionEnviada });
    } catch (err) {
      addToast(`No se pudo resetear la contraseña: ${err.message}`, { type: 'error' });
    } finally {
      setReseteando(false);
    }
  };

  const handleEliminar = async () => {
    try {
      await eliminarUsuario(eliminarTarget.id);
      addToast(`${eliminarTarget.nombre} eliminado.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo eliminar: ${err.message}`, { type: 'error' });
    } finally {
      setEliminarTarget(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'nombre',
        label: 'Usuario',
        sortable: true,
        render: (u) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-full bg-condor-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {iniciales(u.nombre)}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate max-w-[200px]">
                {u.nombre} {String(u.id) === String(yo?.id) && <span className="text-xs text-gray-400">(tú)</span>}
              </p>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{u.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'rol',
        label: 'Rol',
        sortable: true,
        render: (u) => (
          <select
            value={u.rol}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => cambiarRol(u, e.target.value)}
            disabled={String(u.id) === String(yo?.id)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="admin">Administrador</option>
            <option value="oficina">Oficina</option>
          </select>
        ),
      },
      {
        key: 'activo',
        label: 'Estado',
        align: 'center',
        render: (u) => (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
            {u.activo ? 'Activo' : 'Inactivo'}
          </span>
        ),
      },
      {
        key: 'last_login_at',
        label: 'Último acceso',
        sortable: true,
        render: (u) => (u.last_login_at ? formatFechaHora(u.last_login_at) : 'Nunca'),
      },
      {
        key: 'acciones',
        label: '',
        align: 'right',
        render: (u) => (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setResetTarget(u)} title="Restablecer contraseña" className="p-1.5 text-gray-400 hover:text-condor-700">
              <KeyRound size={14} />
            </button>
            <button
              onClick={() => toggleActivo(u)}
              disabled={String(u.id) === String(yo?.id)}
              title={u.activo ? 'Desactivar' : 'Reactivar'}
              className="text-xs font-medium text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1"
            >
              {u.activo ? 'Desactivar' : 'Reactivar'}
            </button>
            <button
              onClick={() => setEliminarTarget(u)}
              disabled={String(u.id) === String(yo?.id)}
              title="Eliminar"
              className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yo?.id]
  );

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudieron cargar los usuarios"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 flex items-center gap-1.5">
        <Building2 size={14} className="text-gray-400 shrink-0" />
        Personal de oficina que usa este panel (email + contraseña) — distinto del{' '}
        <span className="font-medium text-gray-600">Personal</span> técnico de terreno.
      </p>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} del panel</p>
        <button onClick={() => setNuevoOpen(true)} className="btn-primary shrink-0">
          <Plus size={16} /> Invitar usuario
        </button>
      </div>

      <DataTable columns={columns} rows={usuarios} loading={loading} getRowId={(u) => u.id} emptyTitle="Sin usuarios" />

      <div className="card p-5">
        <h3 className="font-heading font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-gray-400" /> Matriz de permisos
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase">
                <th className="py-2 pr-4">Sección</th>
                <th className="py-2 px-4 text-center">Oficina</th>
                <th className="py-2 px-4 text-center">Administrador</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ_PERMISOS.map((row) => (
                <tr key={row.seccion} className="border-t border-gray-100">
                  <td className="py-2 pr-4 text-gray-700">{row.seccion}</td>
                  <td className="py-2 px-4 text-center">{row.oficina ? '✓' : '—'}</td>
                  <td className="py-2 px-4 text-center">{row.admin ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitar usuario */}
      <Modal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        title="Invitar usuario"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNuevoOpen(false)}>Cancelar</button>
            <button className="btn-primary" type="submit" form="form-nuevo-usuario" disabled={creando}>
              {creando ? 'Creando...' : 'Crear e invitar'}
            </button>
          </>
        }
      >
        <form id="form-nuevo-usuario" onSubmit={handleCrear} className="space-y-4">
          <div>
            <label className="label-field">Nombre completo</label>
            <input name="nombre" required className="input-field" placeholder="Ej: María Pérez" />
          </div>
          <div>
            <label className="label-field">Correo</label>
            <input name="email" type="email" required className="input-field" placeholder="maria@condoralcantarillados.cl" />
          </div>
          <div>
            <label className="label-field">Rol</label>
            <select name="rol" defaultValue="oficina" className="input-field">
              <option value="oficina">Oficina</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">
            Se genera una contraseña temporal y se intenta enviar por correo (Resend). Si el envío falla, se muestra una
            sola vez en pantalla para compartirla manualmente.
          </p>
        </form>
      </Modal>

      {/* Credenciales reveladas (alta o reset) */}
      <Modal open={!!credenciales} onClose={() => setCredenciales(null)} title="Credenciales generadas" size="sm">
        {credenciales && <CredencialesReveladas {...credenciales} />}
      </Modal>

      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={handleResetPassword}
        loading={reseteando}
        title="Restablecer contraseña"
        message={`Se generará una contraseña temporal nueva para ${resetTarget?.nombre}. La anterior dejará de funcionar de inmediato.`}
        confirmLabel="Restablecer"
      />

      <ConfirmDialog
        open={!!eliminarTarget}
        onClose={() => setEliminarTarget(null)}
        onConfirm={handleEliminar}
        danger
        title="Eliminar usuario"
        message={`${eliminarTarget?.nombre} perderá acceso al panel de administración de inmediato. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
