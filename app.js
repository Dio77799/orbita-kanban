'use strict';

// ── Estado y persistencia ────────────────────────────────────────────────
const CLAVE = 'orbita.tablero.v1';
const DIA = 86400000;

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function tableroInicial() {
  const ahora = Date.now();
  const col = (nombre, wip, terminal) => ({ id: uid(), nombre, wip, terminal, tarjetas: [] });
  const cols = [col('Pendiente', 0, false), col('En curso', 3, false), col('Revisión', 2, false), col('Hecho', 0, true)];
  const t = (titulo, descripcion, prioridad, etiquetas) => ({
    id: uid(), titulo, descripcion, prioridad, etiquetas, vence: '',
    creada: ahora, historial: [{ col: cols[0].id, en: ahora }], terminada: null,
  });
  cols[0].tarjetas.push(
    t('Arrastra esta tarjeta', 'Muévela entre columnas con el mouse, o selecciónala y usa Alt + flechas.', 'media', ['guía']),
    t('Prueba el límite WIP', '"En curso" acepta 3 tareas. Si pones más, la columna se marca en rojo.', 'alta', ['guía']),
    t('Exporta tu tablero', 'El botón Exportar descarga un JSON que puedes volver a importar.', 'baja', ['guía']),
  );
  return { columnas: cols };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const datos = JSON.parse(crudo);
      if (valido(datos)) return datos;
    }
  } catch (e) { /* almacenamiento no disponible o dañado: se empieza de cero */ }
  return tableroInicial();
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
}

function valido(d) {
  return d && Array.isArray(d.columnas) && d.columnas.every(c =>
    typeof c.id === 'string' && typeof c.nombre === 'string' && Array.isArray(c.tarjetas) &&
    c.tarjetas.every(t => typeof t.id === 'string' && typeof t.titulo === 'string'));
}

let estado = cargar();

// ── Utilidades ───────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);

function buscarTarjeta(id) {
  for (const c of estado.columnas) {
    const i = c.tarjetas.findIndex(t => t.id === id);
    if (i >= 0) return { col: c, i, t: c.tarjetas[i] };
  }
  return null;
}

function dias(ms) {
  const min = ms / 60000;
  if (min < 60) return Math.max(1, Math.round(min)) + ' min';
  const h = min / 60;
  if (h < 24) return Math.round(h) + ' h';
  return (h / 24).toFixed(1).replace('.0', '') + ' d';
}

function texto(el, valor) { el.textContent = valor; return el; }
function crear(tag, clase) { const e = document.createElement(tag); if (clase) e.className = clase; return e; }

// Mueve una tarjeta y registra la entrada en la nueva columna (para las métricas).
function mover(id, colDestinoId, indice) {
  const origen = buscarTarjeta(id);
  const destino = estado.columnas.find(c => c.id === colDestinoId);
  if (!origen || !destino) return;
  origen.col.tarjetas.splice(origen.i, 1);
  const t = origen.t;
  if (origen.col.id !== destino.id) {
    t.historial.push({ col: destino.id, en: Date.now() });
    t.terminada = destino.terminal ? Date.now() : null;
  }
  const pos = indice == null ? destino.tarjetas.length : Math.max(0, Math.min(indice, destino.tarjetas.length));
  destino.tarjetas.splice(pos, 0, t);
  guardar();
  pintar();
  const el = document.querySelector(`[data-id="${t.id}"]`);
  if (el) el.focus();
}

// ── Métricas de flujo ────────────────────────────────────────────────────
// Lead time: de la creación a terminada. Cycle time: desde que entró por primera
// vez a una columna que no es la primera ni terminal, hasta terminada.
function metricas() {
  const primera = estado.columnas[0] && estado.columnas[0].id;
  const terminales = new Set(estado.columnas.filter(c => c.terminal).map(c => c.id));
  let abiertas = 0, enCurso = 0;
  const lead = [], ciclo = [];
  const semana = Date.now() - 7 * DIA;
  let hechasSemana = 0;
  for (const c of estado.columnas) {
    for (const t of c.tarjetas) {
      if (t.terminada) {
        lead.push(t.terminada - t.creada);
        const inicio = t.historial.find(h => h.col !== primera && !terminales.has(h.col));
        if (inicio) ciclo.push(t.terminada - inicio.en);
        if (t.terminada >= semana) hechasSemana++;
      } else {
        abiertas++;
        if (c.id !== primera) enCurso++;
      }
    }
  }
  const prom = (a) => a.length ? dias(a.reduce((x, y) => x + y, 0) / a.length) : '—';
  return [
    ['Abiertas', abiertas],
    ['En flujo', enCurso],
    ['Hechas (7 días)', hechasSemana],
    ['Tiempo de ciclo', prom(ciclo)],
    ['Tiempo de entrega', prom(lead)],
  ];
}

// ── Pintado ──────────────────────────────────────────────────────────────
function coincide(t) {
  const q = $('#buscar').value.trim().toLowerCase();
  const p = $('#filtroPrioridad').value;
  if (p && t.prioridad !== p) return false;
  if (!q) return true;
  if (q.startsWith('#')) return (t.etiquetas || []).some(e => e.toLowerCase().includes(q.slice(1)));
  return (t.titulo + ' ' + (t.descripcion || '') + ' ' + (t.etiquetas || []).join(' ')).toLowerCase().includes(q);
}

function pintarTarjeta(t, col) {
  const el = crear('article', 'tarjeta corte');
  el.draggable = true;
  el.tabIndex = 0;
  el.dataset.id = t.id;
  el.dataset.prioridad = t.prioridad || 'media';
  el.setAttribute('aria-label', `${t.titulo}, prioridad ${t.prioridad}, columna ${col.nombre}`);
  el.append(texto(crear('h3'), t.titulo));
  if (t.descripcion) el.append(texto(crear('p'), t.descripcion.length > 140 ? t.descripcion.slice(0, 140) + '…' : t.descripcion));
  const meta = crear('div', 'meta');
  for (const e of t.etiquetas || []) meta.append(texto(crear('span', 'etiqueta'), '#' + e));
  if (t.vence) {
    const v = texto(crear('span', 'vence'), 'vence ' + t.vence);
    if (!t.terminada && new Date(t.vence + 'T23:59:59') < new Date()) v.classList.add('vencida');
    meta.append(v);
  }
  const ultima = t.historial[t.historial.length - 1];
  meta.append(texto(crear('span', 'edad'), t.terminada ? '✓ ' + dias(t.terminada - t.creada) : dias(Date.now() - ultima.en) + ' aquí'));
  el.append(meta);
  el.addEventListener('dblclick', () => abrirTarjeta(t.id));
  el.addEventListener('keydown', (ev) => teclaTarjeta(ev, t.id));
  el.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', t.id); ev.dataTransfer.effectAllowed = 'move'; el.classList.add('arrastrando'); });
  el.addEventListener('dragend', () => el.classList.remove('arrastrando'));
  return el;
}

function pintar() {
  const tablero = $('#tablero');
  tablero.replaceChildren();
  for (const col of estado.columnas) {
    const sec = crear('section', 'columna corte');
    sec.dataset.col = col.id;
    if (col.wip > 0 && col.tarjetas.length > col.wip) sec.classList.add('excedida');

    const cab = crear('div', 'col-cab');
    const h = texto(crear('h2'), col.nombre);
    h.title = 'Editar columna';
    h.addEventListener('click', () => abrirColumna(col.id));
    cab.append(h, texto(crear('span', 'wip'), col.wip > 0 ? `${col.tarjetas.length}/${col.wip}` : `${col.tarjetas.length}`));
    if (col.wip > 0) cab.lastChild.title = 'Tarjetas / límite WIP';

    const lista = crear('div', 'lista');
    for (const t of col.tarjetas) if (coincide(t)) lista.append(pintarTarjeta(t, col));

    const nueva = texto(crear('button', 'nueva'), '+ Tarea');
    nueva.addEventListener('click', () => abrirTarjeta(null, col.id));

    sec.addEventListener('dragover', (ev) => { ev.preventDefault(); sec.classList.add('sobre'); });
    sec.addEventListener('dragleave', (ev) => { if (!sec.contains(ev.relatedTarget)) sec.classList.remove('sobre'); });
    sec.addEventListener('drop', (ev) => {
      ev.preventDefault();
      sec.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain');
      mover(id, col.id, indiceSoltar(lista, ev.clientY, id));
    });
    sec.append(cab, lista, nueva);
    tablero.append(sec);
  }
  const m = $('#metricas');
  m.replaceChildren(...metricas().map(([k, v]) => {
    const d = crear('div', 'metrica corte');
    d.append(texto(crear('b'), String(v)), texto(crear('span'), k));
    return d;
  }));
}

// Calcula en qué posición de la columna se soltó la tarjeta, según la altura del puntero.
function indiceSoltar(lista, y, idArrastrada) {
  const hijos = [...lista.querySelectorAll('.tarjeta')].filter(e => e.dataset.id !== idArrastrada);
  const col = estado.columnas.find(c => c.id === lista.parentElement.dataset.col);
  for (const h of hijos) {
    const r = h.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      // índice real dentro de la columna (la lista puede estar filtrada)
      return col.tarjetas.filter(t => t.id !== idArrastrada).findIndex(t => t.id === h.dataset.id);
    }
  }
  return null;
}

// ── Teclado ──────────────────────────────────────────────────────────────
function teclaTarjeta(ev, id) {
  if (ev.key === 'Enter') { ev.preventDefault(); abrirTarjeta(id); return; }
  if (!ev.altKey) return;
  const r = buscarTarjeta(id);
  const ci = estado.columnas.indexOf(r.col);
  if (ev.key === 'ArrowRight' && ci < estado.columnas.length - 1) mover(id, estado.columnas[ci + 1].id);
  else if (ev.key === 'ArrowLeft' && ci > 0) mover(id, estado.columnas[ci - 1].id);
  else if (ev.key === 'ArrowUp' && r.i > 0) mover(id, r.col.id, r.i - 1);
  else if (ev.key === 'ArrowDown' && r.i < r.col.tarjetas.length - 1) mover(id, r.col.id, r.i + 1);
  else return;
  ev.preventDefault();
}

// ── Diálogo de tarjeta ───────────────────────────────────────────────────
const dlgT = $('#dlgTarjeta');
const formT = $('#formTarjeta');
let editando = null; // { id } o { col } para nueva

function abrirTarjeta(id, colId) {
  formT.reset();
  editando = id ? { id } : { col: colId };
  const t = id && buscarTarjeta(id).t;
  $('#dlgTitulo').textContent = t ? 'Editar tarea' : 'Nueva tarea';
  $('#btnBorrar').hidden = !t;
  if (t) {
    formT.titulo.value = t.titulo;
    formT.descripcion.value = t.descripcion || '';
    formT.prioridad.value = t.prioridad || 'media';
    formT.vence.value = t.vence || '';
    formT.etiquetas.value = (t.etiquetas || []).join(', ');
  }
  dlgT.showModal();
  formT.titulo.focus();
}

formT.addEventListener('submit', () => {
  const datos = {
    titulo: formT.titulo.value.trim(),
    descripcion: formT.descripcion.value.trim(),
    prioridad: formT.prioridad.value,
    vence: formT.vence.value,
    etiquetas: formT.etiquetas.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8),
  };
  if (!datos.titulo) return;
  if (editando.id) {
    Object.assign(buscarTarjeta(editando.id).t, datos);
  } else {
    const col = estado.columnas.find(c => c.id === editando.col);
    const ahora = Date.now();
    col.tarjetas.push({ id: uid(), ...datos, creada: ahora, historial: [{ col: col.id, en: ahora }], terminada: col.terminal ? ahora : null });
  }
  guardar();
  pintar();
});
$('#btnCancelar').addEventListener('click', () => dlgT.close());
$('#btnBorrar').addEventListener('click', () => {
  if (!editando.id || !confirm('¿Borrar esta tarea?')) return;
  const r = buscarTarjeta(editando.id);
  r.col.tarjetas.splice(r.i, 1);
  guardar();
  dlgT.close();
  pintar();
});

// ── Diálogo de columna ───────────────────────────────────────────────────
const dlgC = $('#dlgColumna');
const formC = $('#formColumna');
let colEditando = null;

function abrirColumna(id) {
  formC.reset();
  colEditando = id;
  const c = id && estado.columnas.find(x => x.id === id);
  $('#dlgColTitulo').textContent = c ? 'Editar columna' : 'Nueva columna';
  $('#btnBorrarCol').hidden = !c;
  if (c) {
    formC.nombre.value = c.nombre;
    formC.wip.value = c.wip || 0;
    formC.terminal.checked = !!c.terminal;
  }
  dlgC.showModal();
  formC.nombre.focus();
}

formC.addEventListener('submit', () => {
  const nombre = formC.nombre.value.trim();
  if (!nombre) return;
  const wip = Math.max(0, Math.min(99, parseInt(formC.wip.value, 10) || 0));
  const terminal = formC.terminal.checked;
  if (colEditando) {
    const c = estado.columnas.find(x => x.id === colEditando);
    Object.assign(c, { nombre, wip, terminal });
  } else {
    estado.columnas.push({ id: uid(), nombre, wip, terminal, tarjetas: [] });
  }
  guardar();
  pintar();
});
$('#btnCancelarCol').addEventListener('click', () => dlgC.close());
$('#btnBorrarCol').addEventListener('click', () => {
  const c = estado.columnas.find(x => x.id === colEditando);
  if (!c) return;
  if (estado.columnas.length === 1) { alert('El tablero necesita al menos una columna.'); return; }
  if (c.tarjetas.length && !confirm(`La columna tiene ${c.tarjetas.length} tareas. Se moverán a la primera columna. ¿Continuar?`)) return;
  estado.columnas = estado.columnas.filter(x => x !== c);
  estado.columnas[0].tarjetas.push(...c.tarjetas);
  guardar();
  dlgC.close();
  pintar();
});
$('#btnColumna').addEventListener('click', () => abrirColumna(null));

// ── Exportar / importar ──────────────────────────────────────────────────
$('#btnExportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const a = crear('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'orbita-tablero.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#importar').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    if (!valido(datos)) throw new Error('formato');
    if (!confirm('Esto reemplaza el tablero actual. ¿Continuar?')) return;
    estado = datos;
    guardar();
    pintar();
  } catch (e) {
    alert('El archivo no es un tablero válido de Órbita.');
  }
});

$('#buscar').addEventListener('input', pintar);
$('#filtroPrioridad').addEventListener('change', pintar);

pintar();
