'use strict';
// Módulos de Órbita: navegación, reloj, Pomodoro, agenda, integraciones y claves.
// Usa el estado del tablero definido en app.js (estado, guardar, pintar, buscarTarjeta).

// ── Almacenamiento auxiliar ──────────────────────────────────────────────
function leer(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch (e) { return porDefecto; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
}
const pad = (n) => String(n).padStart(2, '0');
const hoyISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function todasLasTarjetas() {
  const r = [];
  for (const c of estado.columnas) for (const t of c.tarjetas) r.push({ t, c });
  return r;
}

function llenarSelectTareas(sel) {
  const actual = sel.value;
  const primera = sel.options[0];
  sel.replaceChildren(primera);
  for (const { t, c } of todasLasTarjetas()) {
    if (t.terminada) continue;
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.titulo} · ${c.nombre}`;
    sel.append(o);
  }
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
}

// ── Navegación por hash (#tablero, #enfoque, ...) ────────────────────────
const MODULOS = ['tablero', 'enfoque', 'agenda', 'integraciones', 'ajustes'];

function mostrarModulo() {
  const actual = MODULOS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'tablero';
  for (const m of MODULOS) document.getElementById('mod-' + m).hidden = m !== actual;
  document.querySelectorAll('.modulos a').forEach(a => a.classList.toggle('activo', a.dataset.mod === actual));
  document.querySelectorAll('[data-solo]').forEach(e => { e.hidden = e.dataset.solo !== actual; });
  if (actual === 'tablero') pintar();
  if (actual === 'enfoque') { llenarSelectTareas($('#pomoTarea')); pintarHistorial(); }
  if (actual === 'agenda') pintarCalendario();
  if (actual === 'integraciones') llenarSelectTareas($('#iaTarea'));
  if (actual === 'ajustes') cargarClaves();
}
window.addEventListener('hashchange', mostrarModulo);

// ── Reloj ────────────────────────────────────────────────────────────────
function tic() {
  const d = new Date();
  $('#reloj').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  revisarAlarmas(d);
}

// ── Sonido y notificaciones ──────────────────────────────────────────────
function pitido(veces = 2) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < veces; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
  } catch (e) { /* sin audio */ }
}
function notificar(titulo, cuerpo) {
  pitido();
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, { body: cuerpo });
  } catch (e) { /* sin notificaciones */ }
}
function pedirPermisoNotificaciones() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* nada */ }
}

// ── Pomodoro ─────────────────────────────────────────────────────────────
const POMO = 'orbita.pomodoro.v1';
const pomo = { fase: 'enfoque', restante: 25 * 60, total: 25 * 60, corriendo: false, ciclos: 0, inicio: null, intervalo: null };
let historial = leer(POMO, []);

function duraciones() {
  const n = (id, d) => Math.max(1, Math.min(180, parseInt($(id).value, 10) || d)) * 60;
  return { enfoque: n('#pomoEnfoque', 25), descanso: n('#pomoDescanso', 5), largo: n('#pomoLargo', 15) };
}

function pintarPomo() {
  $('#pomoTiempo').textContent = `${pad(Math.floor(pomo.restante / 60))}:${pad(pomo.restante % 60)}`;
  $('#pomoFase').textContent = { enfoque: 'Enfoque', descanso: 'Descanso', largo: 'Descanso largo' }[pomo.fase];
  $('#pomoFase').dataset.fase = pomo.fase;
  const c = 2 * Math.PI * 88;
  const aro = $('#pomoAro');
  aro.style.strokeDasharray = c;
  aro.style.strokeDashoffset = c * (1 - pomo.restante / pomo.total);
  $('#pomoIniciar').textContent = pomo.corriendo ? 'Pausar' : 'Iniciar';
  document.title = pomo.corriendo ? `${$('#pomoTiempo').textContent} · Órbita` : 'Órbita · Kanban';
}

function fijarFase(fase) {
  const d = duraciones();
  pomo.fase = fase;
  pomo.total = pomo.restante = d[fase];
  pintarPomo();
}

function terminarFase() {
  if (pomo.fase === 'enfoque') {
    const tareaId = $('#pomoTarea').value;
    const r = tareaId && buscarTarjeta(tareaId);
    historial.unshift({ en: Date.now(), minutos: Math.round(pomo.total / 60), tarea: r ? r.t.titulo : '' });
    historial = historial.slice(0, 200);
    escribir(POMO, historial);
    if (r) { r.t.pomodoros = (r.t.pomodoros || 0) + 1; guardar(); }
    pomo.ciclos++;
    notificar('Enfoque terminado', r ? `Un pomodoro más en "${r.t.titulo}".` : 'Toca descansar.');
    fijarFase(pomo.ciclos % 4 === 0 ? 'largo' : 'descanso');
  } else {
    notificar('Descanso terminado', 'De vuelta al enfoque.');
    fijarFase('enfoque');
  }
  pintarHistorial();
}

function tickPomo() {
  // Se calcula contra el reloj real para no desfasarse si la pestaña queda en segundo plano.
  const transcurrido = Math.floor((Date.now() - pomo.inicio) / 1000);
  pomo.restante = Math.max(0, pomo.base - transcurrido);
  if (pomo.restante === 0) {
    terminarFase();
    pomo.inicio = Date.now();
    pomo.base = pomo.restante;
  }
  pintarPomo();
}

$('#pomoIniciar').addEventListener('click', () => {
  pedirPermisoNotificaciones();
  if (pomo.corriendo) {
    clearInterval(pomo.intervalo);
    pomo.corriendo = false;
  } else {
    pomo.inicio = Date.now();
    pomo.base = pomo.restante;
    pomo.intervalo = setInterval(tickPomo, 250);
    pomo.corriendo = true;
  }
  pintarPomo();
});
$('#pomoSaltar').addEventListener('click', () => {
  const corria = pomo.corriendo;
  fijarFase(pomo.fase === 'enfoque' ? 'descanso' : 'enfoque');
  if (corria) { pomo.inicio = Date.now(); pomo.base = pomo.restante; }
});
$('#pomoReiniciar').addEventListener('click', () => {
  clearInterval(pomo.intervalo);
  pomo.corriendo = false;
  pomo.ciclos = 0;
  fijarFase('enfoque');
});
['#pomoEnfoque', '#pomoDescanso', '#pomoLargo'].forEach(id => $(id).addEventListener('change', () => {
  escribir('orbita.pomodoro.ajustes', { e: $('#pomoEnfoque').value, d: $('#pomoDescanso').value, l: $('#pomoLargo').value });
  if (!pomo.corriendo) fijarFase(pomo.fase);
}));

function pintarHistorial() {
  const hoy = hoyISO();
  const deHoy = historial.filter(h => hoyISO(new Date(h.en)) === hoy);
  const semana = historial.filter(h => h.en > Date.now() - 7 * 86400000);
  const min = (a) => a.reduce((s, h) => s + h.minutos, 0);
  const res = $('#pomoResumen');
  res.replaceChildren(
    ...[['Hoy', `${deHoy.length} · ${min(deHoy)} min`], ['7 días', `${semana.length} · ${min(semana)} min`]].map(([k, v]) => {
      const d = document.createElement('div'); d.className = 'metrica corte';
      const b = document.createElement('b'); b.textContent = v;
      const s = document.createElement('span'); s.textContent = k;
      d.append(b, s); return d;
    }));
  const ol = $('#pomoHistorial');
  ol.replaceChildren(...historial.slice(0, 30).map(h => {
    const li = document.createElement('li');
    const d = new Date(h.en);
    li.textContent = `${hoyISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${h.minutos} min${h.tarea ? ' · ' + h.tarea : ''}`;
    return li;
  }));
  if (!historial.length) { const li = document.createElement('li'); li.textContent = 'Aún no hay sesiones.'; ol.append(li); }
}

// ── Agenda: calendario, eventos y alarmas ────────────────────────────────
const AGENDA = 'orbita.agenda.v1';
let agenda = leer(AGENDA, []); // { id, fecha, hora, titulo, alarma, avisada }
let mesVisto = new Date(); mesVisto.setDate(1);
let diaElegido = hoyISO();
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function vencimientos() {
  const m = {};
  for (const { t } of todasLasTarjetas()) if (t.vence && !t.terminada) (m[t.vence] = m[t.vence] || []).push(t);
  return m;
}

function pintarCalendario() {
  const cal = $('#calendario');
  const y = mesVisto.getFullYear(), mo = mesVisto.getMonth();
  $('#calTitulo').textContent = `${MESES[mo]} ${y}`;
  const vence = vencimientos();
  const celdas = [];
  for (const d of ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']) {
    const c = document.createElement('div'); c.className = 'dia-sem'; c.textContent = d; celdas.push(c);
  }
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) celdas.push(document.createElement('div'));
  const diasMes = new Date(y, mo + 1, 0).getDate();
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const b = document.createElement('button');
    b.className = 'dia' + (iso === hoyISO() ? ' hoy' : '') + (iso === diaElegido ? ' elegido' : '');
    b.textContent = d;
    b.setAttribute('aria-label', `${d} de ${MESES[mo]}`);
    const puntos = document.createElement('span'); puntos.className = 'puntos';
    if (agenda.some(e => e.fecha === iso)) puntos.append(Object.assign(document.createElement('i'), { className: 'p-evento' }));
    if (vence[iso]) puntos.append(Object.assign(document.createElement('i'), { className: 'p-tarea' }));
    b.append(puntos);
    b.addEventListener('click', () => { diaElegido = iso; pintarCalendario(); });
    celdas.push(b);
  }
  cal.replaceChildren(...celdas);
  pintarDia(vence);
}

function pintarDia(vence) {
  const [y, m, d] = diaElegido.split('-').map(Number);
  $('#diaTitulo').textContent = `${d} de ${MESES[m - 1]} ${y}`;
  const ul = $('#diaEventos');
  const items = [];
  for (const e of agenda.filter(x => x.fecha === diaElegido).sort((a, b) => a.hora.localeCompare(b.hora))) {
    const li = document.createElement('li');
    li.className = e.alarma ? 'alarma' : '';
    const s = document.createElement('span'); s.textContent = `${e.hora} · ${e.titulo}${e.alarma ? ' (alarma)' : ''}`;
    const x = document.createElement('button'); x.className = 'btn mini'; x.textContent = 'Quitar';
    x.addEventListener('click', () => { agenda = agenda.filter(a => a.id !== e.id); escribir(AGENDA, agenda); pintarCalendario(); });
    li.append(s, x); items.push(li);
  }
  for (const t of (vence || vencimientos())[diaElegido] || []) {
    const li = document.createElement('li'); li.className = 'tarea';
    li.textContent = `Vence: ${t.titulo}`;
    items.push(li);
  }
  if (!items.length) { const li = document.createElement('li'); li.textContent = 'Sin eventos.'; items.push(li); }
  ul.replaceChildren(...items);
}

$('#calAnterior').addEventListener('click', () => { mesVisto.setMonth(mesVisto.getMonth() - 1); pintarCalendario(); });
$('#calSiguiente').addEventListener('click', () => { mesVisto.setMonth(mesVisto.getMonth() + 1); pintarCalendario(); });
$('#formEvento').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  agenda.push({ id: uid(), fecha: diaElegido, hora: f.hora.value, titulo: f.titulo.value.trim().slice(0, 80), alarma: f.alarma.checked, avisada: false });
  if (f.alarma.checked) pedirPermisoNotificaciones();
  escribir(AGENDA, agenda);
  f.reset();
  pintarCalendario();
});

function revisarAlarmas(ahora) {
  const iso = hoyISO(ahora), hm = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  let cambio = false;
  for (const e of agenda) {
    if (e.alarma && !e.avisada && (e.fecha < iso || (e.fecha === iso && e.hora <= hm))) {
      e.avisada = true; cambio = true;
      if (e.fecha === iso) notificar('Alarma · Órbita', `${e.hora} · ${e.titulo}`);
    }
  }
  if (cambio) escribir(AGENDA, agenda);
}

// ── Claves de API (solo en este navegador) ───────────────────────────────
const CLAVES = 'orbita.claves.v1';
const claves = () => leer(CLAVES, {});

function cargarClaves() {
  const c = claves(), f = $('#formClaves');
  f.weather.value = c.weather || '';
  f.spotify.value = c.spotify || '';
  f.gemini.value = c.gemini || '';
  f.geminiModelo.value = c.geminiModelo || '';
  $('#redirectUri').textContent = location.origin + location.pathname;
  const usadas = ['weather', 'spotify', 'gemini'].filter(k => c[k]).length;
  $('#clavesEstado').textContent = usadas ? `${usadas} de 3 integraciones configuradas.` : 'Ninguna integración configurada todavía.';
}
$('#formClaves').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  escribir(CLAVES, {
    weather: f.weather.value.trim(), spotify: f.spotify.value.trim(),
    gemini: f.gemini.value.trim(), geminiModelo: f.geminiModelo.value.trim(),
  });
  cargarClaves();
  $('#clavesEstado').textContent += ' Guardado.';
});
$('#borrarClaves').addEventListener('click', async () => {
  if (!(await confirmar('¿Borrar todas las claves guardadas en este navegador?'))) return;
  try { localStorage.removeItem(CLAVES); localStorage.removeItem(SPOTIFY_TOKEN); } catch (e) { /* nada */ }
  cargarClaves();
});

function salida(id, texto, error) {
  const el = $(id);
  el.textContent = texto;
  el.classList.toggle('error', !!error);
}
function faltaClave(nombre, id) {
  salida(id, `Falta la clave de ${nombre}. Agrégala en Ajustes.`, true);
}

// ── Clima (OpenWeatherMap) ───────────────────────────────────────────────
$('#formClima').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const key = claves().weather;
  if (!key) return faltaClave('OpenWeatherMap', '#clima');
  const ciudad = ev.target.ciudad.value.trim();
  escribir('orbita.clima.ciudad', ciudad);
  salida('#clima', 'Consultando…');
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(ciudad)}&units=metric&lang=es&appid=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || r.status);
    salida('#clima', `${d.name}: ${Math.round(d.main.temp)} °C, ${d.weather[0].description}. Sensación ${Math.round(d.main.feels_like)} °C · humedad ${d.main.humidity} % · viento ${Math.round(d.wind.speed * 3.6)} km/h`);
  } catch (e) {
    salida('#clima', 'No se pudo consultar el clima: ' + e.message, true);
  }
});
$('#formClima').ciudad.value = leer('orbita.clima.ciudad', '');

// ── Spotify (Authorization Code con PKCE, sin secreto en el navegador) ───
const SPOTIFY_TOKEN = 'orbita.spotify.token';
const SPOTIFY_VERIFIER = 'orbita.spotify.verifier';
const redirect = () => location.origin + location.pathname;

function aleatorio(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => ('0' + b.toString(16)).slice(-2)).join('');
}
async function sha256b64url(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

$('#spotifyConectar').addEventListener('click', async () => {
  const id = claves().spotify;
  if (!id) return faltaClave('Spotify (Client ID)', '#spotifyEstado');
  const verifier = aleatorio(48);
  try { sessionStorage.setItem(SPOTIFY_VERIFIER, verifier); } catch (e) { /* nada */ }
  const params = new URLSearchParams({
    client_id: id, response_type: 'code', redirect_uri: redirect(),
    code_challenge_method: 'S256', code_challenge: await sha256b64url(verifier),
    scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
  });
  location.href = 'https://accounts.spotify.com/authorize?' + params;
});

async function spotifyCallback() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code) return;
  history.replaceState(null, '', location.pathname + '#integraciones');
  let verifier = null;
  try { verifier = sessionStorage.getItem(SPOTIFY_VERIFIER); } catch (e) { /* nada */ }
  const id = claves().spotify;
  if (!verifier || !id) return;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect(), client_id: id, code_verifier: verifier }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.error);
    escribir(SPOTIFY_TOKEN, { access: d.access_token, refresh: d.refresh_token, vence: Date.now() + d.expires_in * 1000 });
  } catch (e) {
    salida('#spotifyEstado', 'No se pudo conectar Spotify: ' + e.message, true);
  }
}

async function tokenSpotify() {
  const t = leer(SPOTIFY_TOKEN, null);
  if (!t) return null;
  if (Date.now() < t.vence - 60000) return t.access;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: claves().spotify }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error();
    escribir(SPOTIFY_TOKEN, { access: d.access_token, refresh: d.refresh_token || t.refresh, vence: Date.now() + d.expires_in * 1000 });
    return d.access_token;
  } catch (e) { return null; }
}

async function spotifyApi(ruta, metodo = 'GET') {
  const tok = await tokenSpotify();
  if (!tok) { salida('#spotifyEstado', 'Spotify no está conectado.', true); return null; }
  const r = await fetch('https://api.spotify.com/v1/me/player' + ruta, { method: metodo, headers: { Authorization: 'Bearer ' + tok } });
  if (r.status === 204) return {};
  if (r.status === 403) { salida('#spotifyEstado', 'Controlar la reproducción requiere Spotify Premium.', true); return null; }
  return r.ok ? r.json().catch(() => ({})) : null;
}

async function pintarSpotify() {
  const d = await spotifyApi('/currently-playing');
  if (!d) return;
  if (!d.item) return salida('#spotifyEstado', 'Conectado. No hay nada sonando ahora.');
  salida('#spotifyEstado', `${d.is_playing ? 'Sonando' : 'En pausa'}: ${d.item.name} · ${d.item.artists.map(a => a.name).join(', ')}`);
}
$('#spotifyPlay').addEventListener('click', async () => {
  const d = await spotifyApi('/currently-playing');
  if (d === null) return;
  await spotifyApi(d.is_playing ? '/pause' : '/play', 'PUT');
  setTimeout(pintarSpotify, 500);
});
$('#spotifySiguiente').addEventListener('click', async () => { await spotifyApi('/next', 'POST'); setTimeout(pintarSpotify, 600); });
$('#spotifyAnterior').addEventListener('click', async () => { await spotifyApi('/previous', 'POST'); setTimeout(pintarSpotify, 600); });

function pintarEmbed() {
  const url = $('#spotifyEmbedUrl').value.trim();
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|show)\/([A-Za-z0-9]+)/);
  const cont = $('#spotifyEmbed');
  cont.replaceChildren();
  if (!m) return;
  const f = document.createElement('iframe');
  f.src = `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  f.width = '100%'; f.height = '152'; f.loading = 'lazy';
  f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  f.title = 'Reproductor de Spotify';
  cont.append(f);
}
$('#spotifyEmbedUrl').value = leer('orbita.spotify.embed', '');
$('#spotifyEmbedUrl').addEventListener('change', () => { escribir('orbita.spotify.embed', $('#spotifyEmbedUrl').value.trim()); pintarEmbed(); });

// ── Asistente (Gemini) ───────────────────────────────────────────────────
let iaSubtareas = [];

async function gemini(prompt) {
  const c = claves();
  if (!c.gemini) { faltaClave('Gemini', '#iaSalida'); return null; }
  const modelo = c.geminiModelo || 'gemini-2.5-flash';
  salida('#iaSalida', 'Pensando…');
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.gemini },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 800 } }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || r.status);
    return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  } catch (e) {
    salida('#iaSalida', 'Error de Gemini: ' + e.message, true);
    return null;
  }
}

$('#iaSubtareas').addEventListener('click', async () => {
  const id = $('#iaTarea').value;
  const r = id && buscarTarjeta(id);
  if (!r) return salida('#iaSalida', 'Elige primero una tarea.', true);
  const texto = await gemini(
    'Divide esta tarea en 3 a 6 subtareas concretas y verificables, en español. ' +
    'Responde solo con una subtarea por línea, sin numeración ni viñetas.\n' +
    `Tarea: ${r.t.titulo}\nDescripción: ${r.t.descripcion || '(sin descripción)'}`);
  if (texto === null) return;
  iaSubtareas = texto.split('\n').map(s => s.replace(/^[\s\-*\d.)]+/, '').trim()).filter(Boolean).slice(0, 8);
  salida('#iaSalida', iaSubtareas.map(s => '• ' + s).join('\n'));
  $('#iaAcciones').hidden = !iaSubtareas.length;
});

$('#iaAgregar').addEventListener('click', () => {
  const id = $('#iaTarea').value;
  const padre = id && buscarTarjeta(id);
  const col = estado.columnas[0];
  const ahora = Date.now();
  for (const s of iaSubtareas) {
    col.tarjetas.push({
      id: uid(), titulo: s.slice(0, 120), descripcion: padre ? `Subtarea de: ${padre.t.titulo}` : '',
      prioridad: padre ? padre.t.prioridad : 'media', etiquetas: ['subtarea'], vence: '',
      creada: ahora, historial: [{ col: col.id, en: ahora }], terminada: null,
    });
  }
  guardar();
  $('#iaAcciones').hidden = true;
  salida('#iaSalida', `${iaSubtareas.length} subtareas agregadas a "${col.nombre}".`);
  iaSubtareas = [];
});

$('#iaResumen').addEventListener('click', async () => {
  const lineas = estado.columnas.map(c => `${c.nombre} (${c.tarjetas.length}${c.wip ? '/' + c.wip : ''}): ` +
    c.tarjetas.map(t => `${t.titulo} [${t.prioridad}${t.vence ? ', vence ' + t.vence : ''}]`).join('; '));
  const texto = await gemini(
    'Eres un asistente de gestión de trabajo. Con este tablero Kanban, en español y en máximo 6 líneas: ' +
    'qué está bloqueando el flujo, qué columna supera su límite WIP, qué vence pronto y qué conviene terminar primero.\n' +
    lineas.join('\n'));
  if (texto !== null) salida('#iaSalida', texto);
  $('#iaAcciones').hidden = true;
});

// ── Arranque ─────────────────────────────────────────────────────────────
(function iniciar() {
  const a = leer('orbita.pomodoro.ajustes', null);
  if (a) { $('#pomoEnfoque').value = a.e; $('#pomoDescanso').value = a.d; $('#pomoLargo').value = a.l; }
  fijarFase('enfoque');
  pintarEmbed();
  tic();
  setInterval(tic, 15000);
  spotifyCallback().then(() => { if (leer(SPOTIFY_TOKEN, null)) pintarSpotify(); });
  mostrarModulo();
})();
