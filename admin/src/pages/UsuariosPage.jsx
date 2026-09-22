import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, KeyRound, Trash2, ShieldCheck, Building2, Mail, Smartphone, LockOpen,
  ArrowLeft, Pencil, UserX, UserCheck, Send, Copy, AlertCircle, ClipboardList,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatCLP, formatFecha, formatRelativo, formatRutInput, iniciales } from '../utils/format';
import { getSession, hasRole, ROLES } from '../utils/auth';
import {
  listUsuarios, getUsuario, crearUsuario, actualizarUsuario, asignarPinUsuario, quitarPinUsuario,
  invitarUsuario, resetPasswordUsuario, quitarPanelUsuario, desbloquearUsuario, eliminarUsuario,
  getEmpleadoStats,
} from '../utils/api';

// Usuarios = TODAS las personas del sistema en una sola tabla (técnicos, oficina, administradores).
// Una persona, un perfil; los accesos se activan por contexto:
//   - Terreno: tiene PIN (entra a la app del celular con usuario/RUT + PIN).
//   - Panel:   tiene correo + contraseña y un rol con panel (oficina / admin).
// Puede tener uno, ambos o ninguno. Promover a un técnico a la oficina ya no obliga a
// recrearlo como otra persona. Toda la escritura va por /api/admin/usuarios.

const ROL_LABEL = { tecnico: 'Técnico', oficina: 'Oficina', admin: 'Administrador', notstudio: 'NotStudio' };
const ROLES_PANEL = ['oficina', 'admin', 'notstudio'];
const ESPECIALIDADES = ['Hidrojet', 'Evacuación de fosas', 'Destape', 'Cámara CCTV', 'Mantención'];

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'terreno', label: 'Terreno' },
  { key: 'panel', label: 'Oficina / Admin' },
  { key: 'inactivos', label: 'Inactivos' },
];

function RolBadge({ rol }) {
  const tone = {
    tecnico: 'bg-blue-50 text-blue-700 border-blue-100',
    oficina: 'bg-amber-50 text-amber-700 border-amber-100',
    admin: 'bg-condor-50 text-condor-700 border-condor-100',
    notstudio: 'bg-gray-900 text-white border-gray-900',
  }[rol] || 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tone}`}>{ROL_LABEL[rol] || rol}</span>;
}

function AccesoChips({ p }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.tiene_pin && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
          <Smartphone size={11} /> Terreno
        </span>
      )}
      {p.tiene_panel && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-condor-50 text-condor-700 border border-condor-100">
          <Building2 size={11} /> Panel
        </span>
      )}
      {!p.tiene_panel && p.invitacion_pendiente && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
          <Mail size={11} /> Invitado
        </span>
      )}
      {!p.tiene_pin && !p.tiene_panel && !p.invitacion_pendiente && <span className="text-[11px] text-gray-400">Sin accesos</span>}
    </span>
  );
}

// Credenciales que se muestran UNA sola vez (PIN nuevo, contraseña temporal, enlace de invitación).
function CredencialModal({ data, onClose }) {
  const { addToast } = useToast();
  if (!data) return null;
  const copiar = (v) => navigator.clipboard?.writeText(v).then(() => addToast('Copiado', { type: 'success' }));
  return (
    <Modal open onClose={onClose} title={data.titulo} footer={<button className="btn-primary" onClick={onClose}>Listo</button>}>
      <div className="bg-condor-50 border border-condor-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-condor-700 uppercase tracking-wide">Se muestra una sola vez</p>
        {data.items.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{it.label}</p>
              <p className={`text-sm text-gray-800 break-all ${it.mono ? 'font-mono text-lg tracking-widest' : ''}`}>{it.value}</p>
            </div>
            <button className="btn-secondary py-1.5 px-2 text-xs shrink-0" onClick={() => copiar(it.value)}>
              <Copy size={13} /> Copiar
            </button>
          </div>
        ))}
        {data.nota && <p className="text-xs text-condor-700">{data.nota}</p>}
      </div>
    </Modal>
  );
}

const FORM_VACIO = { nombre: '', rut: '', telefono: '', usuario: '', email: '', fechaIngreso: '', especialidades: [], rol: 'tecnico', accesoTerreno: true };

function PersonaForm({ form, setForm, esEdicion, puedeNotstudio }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const rolConPanel = ROLES_PANEL.includes(form.rol);
  const roles = ['tecnico', 'oficina', 'admin', ...(puedeNotstudio ? ['notstudio'] : [])];
  return (
    <div className="space-y-4">
      <div>
        <label className="label-field">Nombre completo *</label>
        <input className="input-field" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Juan Pérez" autoFocus />
      </div>
      <div>
        <label className="label-field">Rol</label>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set('rol', r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                form.rol === r ? 'bg-condor-900 text-white border-condor-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {ROL_LABEL[r]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {form.rol === 'tecnico' && 'Solo app de terreno. No entra al panel.'}
          {form.rol === 'oficina' && 'Panel: dashboard, órdenes, clientes, servicios y notificaciones.'}
          {form.rol === 'admin' && 'Panel completo, incluidos usuarios, configuración y auditoría.'}
          {form.rol === 'notstudio' && 'Soporte de NotStudio. Invisible para los demás roles.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-field">RUT</label>
          <input className="input-field" value={form.rut} onChange={(e) => set('rut', formatRutInput(e.target.value))} placeholder="12.345.678-9" />
        </div>
        <div>
          <label className="label-field">Teléfono</label>
          <input className="input-field" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="+56 9 1234 5678" />
        </div>
      </div>
      <div className={`rounded-xl border p-3 space-y-3 ${rolConPanel ? 'border-condor-100 bg-condor-50/40' : 'border-gray-100 bg-gray-50/60'}`}>
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Building2 size={13} /> Acceso al panel</p>
        <div>
          <label className="label-field">Correo {rolConPanel ? '*' : '(opcional)'}</label>
          <input className="input-field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@condoralcantarillados.cl" />
          {rolConPanel && !esEdicion && <p className="text-xs text-gray-400 mt-1">Se le enviará una invitación para que defina su propia contraseña.</p>}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Smartphone size={13} /> Acceso a terreno</p>
          {!esEdicion && (
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" className="rounded border-gray-300" checked={form.accesoTerreno} onChange={(e) => set('accesoTerreno', e.target.checked)} />
              Generar PIN
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-field">Usuario de terreno {form.accesoTerreno && !esEdicion ? '*' : ''}</label>
            <input className="input-field" value={form.usuario} onChange={(e) => set('usuario', e.target.value.toLowerCase())} placeholder="juan.perez" />
          </div>
          <div>
            <label className="label-field">Fecha de ingreso</label>
            <input className="input-field" type="date" value={form.fechaIngreso} onChange={(e) => set('fechaIngreso', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label-field">Especialidades</label>
          <div className="flex flex-wrap gap-1.5">
            {ESPECIALIDADES.map((esp) => {
              const on = form.especialidades.includes(esp);
              return (
                <button
                  key={esp}
                  type="button"
                  onClick={() => set('especialidades', on ? form.especialidades.filter((x) => x !== esp) : [...form.especialidades, esp])}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {esp}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function payloadDesdeForm(form) {
  return {
    nombre: form.nombre.trim(),
    rut: form.rut.trim() || null,
    telefono: form.telefono.trim() || null,
    usuario: form.usuario.trim() || null,
    email: form.email.trim() || null,
    fechaIngreso: form.fechaIngreso || null,
    especialidades: form.especialidades.length ? form.especialidades : null,
    rol: form.rol,
  };
}

// ─────────────────────────── Ficha ───────────────────────────

function Ficha({ id, onVolver, onCambio }) {
  const { addToast } = useToast();
  const yo = getSession()?.user;
  const [p, setP] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [confirm, setConfirm] = useState(null); // { tipo, ... }
  const [ocupado, setOcupado] = useState(false);
  const [credencial, setCredencial] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUsuario(id);
      setP(res.data);
      getEmpleadoStats(id).then((s) => setStats(s.data)).catch(() => setStats(null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = async () => { await cargar(); onCambio?.(); };
  const esYo = String(yo?.id) === String(id);
  const puedeNotstudio = hasRole(yo, [ROLES.NOTSTUDIO]);
  const rolConPanel = p && ROLES_PANEL.includes(p.rol);

  const abrirEdicion = () => {
    setForm({
      nombre: p.nombre || '', rut: p.rut || '', telefono: p.telefono || '', usuario: p.usuario || '', email: p.email || '',
      fechaIngreso: p.fecha_ingreso ? String(p.fecha_ingreso).slice(0, 10) : '', especialidades: p.especialidades || [], rol: p.rol, accesoTerreno: p.tiene_pin,
    });
    setEditOpen(true);
  };

  const guardarEdicion = async () => {
    if (!form.nombre.trim()) return addToast('El nombre es requerido', { type: 'error' });
    setGuardando(true);
    try {
      await actualizarUsuario(id, payloadDesdeForm(form));
      setEditOpen(false);
      addToast('Datos guardados', { type: 'success' });
      await recargar();
    } catch (err) {
      addToast(err.message, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const ejecutar = async (fn, ok) => {
    setOcupado(true);
    try {
      const r = await fn();
      setConfirm(null);
      if (ok) addToast(ok, { type: 'success' });
      await recargar();
      return r;
    } catch (err) {
      addToast(err.message, { type: 'error' });
    } finally {
      setOcupado(false);
    }
  };

  const darPin = async () => {
    const r = await ejecutar(() => asignarPinUsuario(id));
    if (r?.data?.pin) setCredencial({ titulo: p.tiene_pin ? 'PIN nuevo' : 'Acceso a terreno activado', items: [{ label: 'Usuario', value: p.usuario }, { label: 'PIN', value: r.data.pin, mono: true }], nota: 'Compártelo con la persona por un canal seguro. No se puede volver a ver.' });
  };
  const invitar = async () => {
    const r = await ejecutar(() => invitarUsuario(id));
    if (r?.data) setCredencial({ titulo: 'Invitación al panel', items: [{ label: 'Enlace (válido 72 h)', value: r.data.enlaceInvitacion }], nota: r.data.invitacionEnviada ? `Se envió por correo a ${p.email}. También puedes compartir el enlace.` : 'No se pudo enviar el correo: comparte el enlace manualmente.' });
  };
  const resetPassword = async () => {
    const r = await ejecutar(() => resetPasswordUsuario(id));
    if (r?.data?.password) setCredencial({ titulo: 'Contraseña temporal', items: [{ label: 'Correo', value: p.email }, { label: 'Contraseña', value: r.data.password, mono: true }], nota: 'Recomiéndale cambiarla apenas entre.' });
  };

  if (loading) return <div className="card p-5"><SkeletonText lines={6} /></div>;
  if (error || !p) {
    return (
      <div className="card p-10 text-center">
        <AlertCircle size={22} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-gray-600">{error || 'Persona no encontrada'}</p>
        <button className="btn-secondary mt-4" onClick={onVolver}><ArrowLeft size={15} /> Volver</button>
      </div>
    );
  }

  const bloqueada = p.locked_until && new Date(p.locked_until) > new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary py-2 px-3" onClick={onVolver}><ArrowLeft size={15} /> Usuarios</button>
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-11 rounded-full bg-condor-900 text-white text-sm font-bold flex items-center justify-center shrink-0">{iniciales(p.nombre)}</span>
          <div className="min-w-0">
            <h2 className="font-heading font-semibold text-gray-900 text-lg leading-tight truncate">{p.nombre} {esYo && <span className="text-xs font-normal text-gray-400">(tú)</span>}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1"><RolBadge rol={p.rol} /><AccesoChips p={p} />{!p.activo && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Inactivo</span>}</div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={abrirEdicion}><Pencil size={15} /> Editar</button>
          {p.activo ? (
            <button className="btn-secondary text-gray-600" disabled={esYo} onClick={() => setConfirm({ tipo: 'desactivar' })}><UserX size={15} /> Desactivar</button>
          ) : (
            <button className="btn-secondary text-emerald-700" onClick={() => ejecutar(() => actualizarUsuario(id, { activo: true }), 'Persona reactivada')}><UserCheck size={15} /> Reactivar</button>
          )}
          <button className="btn-secondary text-red-600" disabled={esYo} onClick={() => setConfirm({ tipo: 'eliminar' })}><Trash2 size={15} /> Eliminar</button>
        </div>
      </div>

      {bloqueada && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
          <AlertCircle size={18} className="text-amber-600" />
          <p className="text-sm text-amber-800 flex-1">Bloqueada por intentos fallidos hasta {formatRelativo(p.locked_until)}.</p>
          <button className="btn-secondary py-1.5 px-3 text-xs" onClick={() => ejecutar(() => desbloquearUsuario(id), 'Desbloqueada')}><LockOpen size={13} /> Desbloquear ahora</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-gray-900 text-sm">Datos</h3>
          <dl className="text-sm space-y-2">
            {[['RUT', p.rut || '—'], ['Teléfono', p.telefono || '—'], ['Correo', p.email || '—'], ['Código', p.codigo || '—'], ['Ingreso', p.fecha_ingreso ? formatFecha(p.fecha_ingreso) : '—'], ['Especialidades', (p.especialidades || []).join(', ') || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-gray-400">{k}</dt><dd className="text-gray-800 text-right break-all">{v}</dd></div>
            ))}
          </dl>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5"><Smartphone size={15} className="text-emerald-600" /> Acceso a terreno</h3>
          {p.tiene_pin ? (
            <>
              <p className="text-sm text-gray-600">Entra a la app con el usuario <span className="font-mono text-gray-800">{p.usuario}</span> o su RUT, más su PIN.</p>
              <p className="text-xs text-gray-400">Último ingreso: {p.last_login_terreno_at ? formatRelativo(p.last_login_terreno_at) : 'nunca'}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-secondary py-1.5 px-3 text-xs" onClick={() => setConfirm({ tipo: 'pin' })}><KeyRound size={13} /> Resetear PIN</button>
                <button className="btn-secondary py-1.5 px-3 text-xs text-red-600" onClick={() => setConfirm({ tipo: 'quitarPin' })}>Quitar acceso</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">No tiene acceso a la app de terreno.</p>
              {!p.usuario && <p className="text-xs text-amber-700">Asigna primero un usuario de terreno (Editar).</p>}
              <button className="btn-primary py-1.5 px-3 text-xs" disabled={!p.usuario} onClick={() => setConfirm({ tipo: 'pin' })}><Smartphone size={13} /> Dar acceso (generar PIN)</button>
            </>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5"><Building2 size={15} className="text-condor-600" /> Acceso al panel</h3>
          {!rolConPanel ? (
            <p className="text-sm text-gray-500">Su rol es <b>{ROL_LABEL[p.rol]}</b>: no entra al panel. Cámbiale el rol a Oficina o Administrador (Editar) para darle acceso.</p>
          ) : p.tiene_panel ? (
            <>
              <p className="text-sm text-gray-600">Entra al panel con <span className="text-gray-800">{p.email}</span> como <b>{ROL_LABEL[p.rol]}</b>.</p>
              <p className="text-xs text-gray-400">Último ingreso: {p.last_login_at ? formatRelativo(p.last_login_at) : 'nunca'}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-secondary py-1.5 px-3 text-xs" onClick={() => setConfirm({ tipo: 'password' })}><KeyRound size={13} /> Contraseña temporal</button>
                <button className="btn-secondary py-1.5 px-3 text-xs" onClick={invitar}><Send size={13} /> Reenviar invitación</button>
                <button className="btn-secondary py-1.5 px-3 text-xs text-red-600" disabled={esYo} onClick={() => setConfirm({ tipo: 'quitarPanel' })}>Quitar acceso</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">{p.invitacion_pendiente ? 'Invitación enviada, aún no define su contraseña.' : 'Todavía no tiene contraseña.'}</p>
              {!p.email && <p className="text-xs text-amber-700">Asigna primero un correo (Editar).</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-primary py-1.5 px-3 text-xs" disabled={!p.email} onClick={invitar}><Send size={13} /> {p.invitacion_pendiente ? 'Reenviar invitación' : 'Enviar invitación'}</button>
                <button className="btn-secondary py-1.5 px-3 text-xs" disabled={!p.email} onClick={() => setConfirm({ tipo: 'password' })}>Contraseña temporal</button>
              </div>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="card p-5">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5 mb-3"><ClipboardList size={15} className="text-gray-400" /> Actividad en terreno</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-400">Órdenes</p><p className="text-xl font-heading font-semibold">{stats.totalOrdenes}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-400">Monto generado</p><p className="text-xl font-heading font-semibold">{formatCLP(stats.montoGenerado)}</p></div>
          </div>
          {stats.ultimasOrdenes?.length > 0 && (
            <ul className="divide-y divide-gray-100 text-sm">
              {stats.ultimasOrdenes.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                  <a href={`#/ordenes/${o.id}`} className="text-condor-700 hover:underline font-medium">OT-{o.numero_orden_display}</a>
                  <span className="text-gray-500 truncate flex-1">{o.cliente_empresa}</span>
                  <span className="text-gray-400 text-xs">{formatFecha(o.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar persona" size="lg"
        footer={<><button className="btn-secondary" onClick={() => setEditOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardarEdicion} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button></>}>
        <PersonaForm form={form} setForm={setForm} esEdicion puedeNotstudio={puedeNotstudio} />
      </Modal>

      <ConfirmDialog open={confirm?.tipo === 'pin'} onClose={() => setConfirm(null)} onConfirm={darPin} loading={ocupado}
        title={p.tiene_pin ? 'Resetear PIN' : 'Dar acceso a terreno'} message={p.tiene_pin ? 'Se generará un PIN nuevo y el anterior dejará de funcionar de inmediato.' : `Se generará un PIN de 4 dígitos para que ${p.nombre} entre a la app de terreno.`} confirmLabel="Generar PIN" />
      <ConfirmDialog open={confirm?.tipo === 'quitarPin'} onClose={() => setConfirm(null)} onConfirm={() => ejecutar(() => quitarPinUsuario(id), 'Acceso a terreno quitado')} loading={ocupado} danger
        title="Quitar acceso a terreno" message="La persona dejará de poder entrar a la app de terreno en su próximo intento. Conserva su historial de órdenes." confirmLabel="Quitar acceso" />
      <ConfirmDialog open={confirm?.tipo === 'password'} onClose={() => setConfirm(null)} onConfirm={resetPassword} loading={ocupado}
        title="Contraseña temporal" message="Se generará una contraseña temporal para el panel. La actual dejará de funcionar." confirmLabel="Generar" />
      <ConfirmDialog open={confirm?.tipo === 'quitarPanel'} onClose={() => setConfirm(null)} onConfirm={() => ejecutar(() => quitarPanelUsuario(id), 'Acceso al panel quitado')} loading={ocupado} danger
        title="Quitar acceso al panel" message="Se borrará su contraseña y su sesión del panel se cortará de inmediato. Su rol y su correo se conservan para poder re-invitarla." confirmLabel="Quitar acceso" />
      <ConfirmDialog open={confirm?.tipo === 'desactivar'} onClose={() => setConfirm(null)} onConfirm={() => ejecutar(() => actualizarUsuario(id, { activo: false }), 'Persona desactivada')} loading={ocupado} danger
        title="Desactivar persona" message={`${p.nombre} no podrá entrar ni a la app de terreno ni al panel. Su historial se conserva y puedes reactivarla cuando quieras.`} confirmLabel="Desactivar" />
      <ConfirmDialog open={confirm?.tipo === 'eliminar'} onClose={() => setConfirm(null)} onConfirm={() => ejecutar(async () => { await eliminarUsuario(id); onVolver(); }, 'Persona eliminada')} loading={ocupado} danger
        title="Eliminar persona" message="Solo se puede eliminar a personas sin órdenes asociadas; si las tiene, desactívala. Esta acción no se puede deshacer." confirmLabel="Eliminar" requireText="ELIMINAR" />
      <CredencialModal data={credencial} onClose={() => setCredencial(null)} />
    </div>
  );
}

// ─────────────────────────── Lista ───────────────────────────

export default function UsuariosPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const yo = getSession()?.user;
  const puedeNotstudio = hasRole(yo, [ROLES.NOTSTUDIO]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [personas, setPersonas] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [credencial, setCredencial] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listUsuarios();
      setPersonas(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personas.filter((p) => {
      if (filtro === 'terreno' && !p.tiene_pin) return false;
      if (filtro === 'panel' && !(p.tiene_panel || p.invitacion_pendiente)) return false;
      if (filtro === 'inactivos' && p.activo) return false;
      if (filtro !== 'inactivos' && !p.activo) return false;
      if (!q) return true;
      return [p.nombre, p.usuario, p.email, p.rut, p.codigo].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [personas, filtro, busqueda]);

  const conteos = useMemo(() => ({
    todos: personas.filter((p) => p.activo).length,
    terreno: personas.filter((p) => p.activo && p.tiene_pin).length,
    panel: personas.filter((p) => p.activo && (p.tiene_panel || p.invitacion_pendiente)).length,
    inactivos: personas.filter((p) => !p.activo).length,
  }), [personas]);

  const crear = async () => {
    if (!form.nombre.trim()) return addToast('El nombre es requerido', { type: 'error' });
    if (form.accesoTerreno && !form.usuario.trim()) return addToast('El acceso a terreno requiere un usuario', { type: 'error' });
    if (ROLES_PANEL.includes(form.rol) && !form.email.trim()) return addToast('Un rol con panel requiere un correo', { type: 'error' });
    setCreando(true);
    try {
      const res = await crearUsuario({ ...payloadDesdeForm(form), accesoTerreno: form.accesoTerreno });
      setNuevoOpen(false);
      setForm(FORM_VACIO);
      const items = [];
      if (res.data.pin) items.push({ label: 'Usuario de terreno', value: res.data.persona.usuario }, { label: 'PIN', value: res.data.pin, mono: true });
      if (res.data.enlaceInvitacion) items.push({ label: 'Enlace de invitación al panel (72 h)', value: res.data.enlaceInvitacion });
      if (items.length) {
        setCredencial({ titulo: `${res.data.persona.nombre} creado`, items, nota: res.data.invitacionEnviada ? `La invitación al panel se envió por correo a ${res.data.persona.email}.` : res.data.invitacionEnviada === false ? 'No se pudo enviar el correo de invitación: comparte el enlace manualmente.' : null });
      } else {
        addToast('Persona creada', { type: 'success' });
      }
      cargar();
    } catch (err) {
      addToast(err.message, { type: 'error' });
    } finally {
      setCreando(false);
    }
  };

  if (id) return <Ficha id={id} onVolver={() => navigate('/usuarios')} onCambio={cargar} />;

  const columns = [
    { key: 'nombre', label: 'Persona', sortValue: (r) => r.nombre, render: (r) => (
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="h-8 w-8 rounded-full bg-condor-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{iniciales(r.nombre)}</span>
        <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{r.nombre}{String(r.id) === String(yo?.id) && <span className="text-xs text-gray-400 font-normal"> (tú)</span>}</p><p className="text-xs text-gray-400 truncate">{r.usuario || r.email || r.codigo || '—'}</p></div>
      </div>
    ) },
    { key: 'rol', label: 'Rol', sortValue: (r) => r.rol, render: (r) => <RolBadge rol={r.rol} /> },
    { key: 'accesos', label: 'Accesos', render: (r) => <AccesoChips p={r} /> },
    { key: 'total_ordenes', label: 'Órdenes', sortValue: (r) => Number(r.total_ordenes || 0), render: (r) => <span className="tabular-nums">{r.total_ordenes || 0}</span> },
    { key: 'ultimo', label: 'Último ingreso', sortValue: (r) => Math.max(new Date(r.last_login_at || 0), new Date(r.last_login_terreno_at || 0)), render: (r) => {
      const u = [r.last_login_at, r.last_login_terreno_at].filter(Boolean).sort().pop();
      return <span className="text-xs text-gray-500">{u ? formatRelativo(u) : 'nunca'}</span>;
    } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.key} onClick={() => setFiltro(f.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filtro === f.key ? 'bg-condor-900 text-white border-condor-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {f.label} <span className={filtro === f.key ? 'text-white/60' : 'text-gray-400'}>{conteos[f.key]}</span>
            </button>
          ))}
        </div>
        <input className="input-field w-full sm:w-64 py-2 text-sm" placeholder="Buscar por nombre, usuario, correo, RUT..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button className="btn-primary ml-auto" onClick={() => { setForm(FORM_VACIO); setNuevoOpen(true); }}><Plus size={16} /> Nueva persona</button>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5"><ShieldCheck size={13} /> Una persona, un perfil: el acceso a terreno (PIN) y al panel (correo + contraseña) se activan por separado desde su ficha.</p>

      {error ? (
        <div className="card p-6 text-center text-sm text-red-600">{error}</div>
      ) : (
        <DataTable columns={columns} rows={filtradas} loading={loading} onRowClick={(r) => navigate(`/usuarios/${r.id}`)} emptyTitle="Sin personas" emptyDescription="Prueba con otro filtro o búsqueda." />
      )}

      <Modal open={nuevoOpen} onClose={() => setNuevoOpen(false)} title="Nueva persona" size="lg"
        footer={<><button className="btn-secondary" onClick={() => setNuevoOpen(false)}>Cancelar</button><button className="btn-primary" onClick={crear} disabled={creando}>{creando ? 'Creando...' : 'Crear'}</button></>}>
        <PersonaForm form={form} setForm={setForm} esEdicion={false} puedeNotstudio={puedeNotstudio} />
      </Modal>
      <CredencialModal data={credencial} onClose={() => setCredencial(null)} />
    </div>
  );
}
