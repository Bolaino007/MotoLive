// script.js - intenta obtener live timing desde motogp endpoint.
// Si falla (CORS o error), usa times.json local.
// También actualiza tablas en las diferentes páginas.

const MOTOGP_LIVE_BASE = 'https://www.motogp.com/en/json/live_timing'; // añadir /<catId>
const REFRESH_MS = 10000; // 10s

function qp(name){ return new URLSearchParams(location.search).get(name); }

async function fetchLiveEndpoint(catId) {
  const url = `${MOTOGP_LIVE_BASE}/${catId}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchLocalTimes() {
  // times.json en la raíz del repo (servido por GitHub Pages)
  const res = await fetch('/MotoLive/times.json').catch(()=>null);
  if(!res || !res.ok) throw new Error('No local times.json');
  return res.json();
}

async function loadData(catId = 1) {
  // Intentar endpoint real, si falla usar local times.json
  let data = null;
  try {
    documentQuery('#status','Estado: intentando obtener datos en vivo desde motogp.com ...');
    data = await fetchLiveEndpoint(catId);
    documentQuery('#status','Estado: datos en vivo obtenidos desde motogp.com');
    return {source:'live', data};
  } catch (e) {
    console.warn('No se pudo usar endpoint en vivo:', e.message);
    try {
      documentQuery('#status','Estado: cargando fallback times.json (local)');
      const local = await fetchLocalTimes();
      documentQuery('#status','Estado: datos cargados desde times.json (local)');
      return {source:'local', data: local};
    } catch (e2) {
      documentQuery('#status','Estado: no hay datos disponibles');
      return {source:'none', data: null};
    }
  }
}

// helpers DOM
function documentQuery(sel, text){
  const el = document.querySelector(sel);
  if(el) el.textContent = text;
}

// Actualizar tabla en live.html
function updateLiveTableFromData(catId, payload) {
  // payload structure may vary: support a few shapes
  const tbody = document.getElementById('live-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  let rows = [];

  // caso: si payload.data tiene propiedad pilotos o rows (ajustar)
  if(payload && payload.pilots) rows = payload.pilots;
  else if(payload && payload.rows) rows = payload.rows;
  else if(Array.isArray(payload)) rows = payload;
  else if(payload && payload.data && Array.isArray(payload.data)) rows = payload.data;

  // Normalizar: cada pilot -> {pos, name, best, tyre_front, tyre_rear, brakes}
  rows.forEach((p, i) => {
    // intentar mapear campos comunes
    const name = p.name || p.p || p.riderName || p.fullName || p.piloto || p.title || p.nickname || 'Piloto';
    const best = p.best || p.time || p.lap || p.bestTime || (p.t && p.t[0]) || '-';
    const tyreFront = p.tyreFront || p.t_front || p.del || (p.tyres && p.tyres.front) || (p.tyres0)|| '-';
    const tyreRear = p.tyreRear || p.t_rear || p.tras || (p.tyres && p.tyres.rear) || '-';
    const brakes = p.brakes || p.frenos || (p.brake) || '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${name}</td><td>${best}</td><td>${tyreFront} / ${tyreRear}</td><td>${brakes}</td>`;
    tbody.appendChild(tr);
  });
}

// Actualiza records (records.html)
function updateRecordsFromData(payload){
  const area = document.getElementById('records-area');
  if(!area) return;
  area.innerHTML = '';
  // payload could be structured by categories
  const categories = [{id:1,name:'MotoGP'},{id:2,name:'Moto2'},{id:3,name:'Moto3'}];
  categories.forEach(cat=>{
    const div = document.createElement('div'); div.className = 'card';
    // Try to find data for category
    let list = [];
    if(payload && payload[cat.name]) list = payload[cat.name];
    else if(payload && payload.pilots && payload.pilots[cat.id]) list = payload.pilots[cat.id];
    else if(Array.isArray(payload)) list = payload;
    const items = (list.map(p=>`<li><strong>${p.name || p.p || p.fullName}</strong> — ${p.best || p.time || '-'} <small class='small'>(${p.tyres ? p.tyres.front : (p.del||'-')}/${p.tyres? p.tyres.rear : (p.tras||'-')}, frenos:${p.brakes||p.frenos||'-'})</small></li>`).join('')) || '<li>No hay datos</li>';
    div.innerHTML = `<h3>${cat.name}</h3><ul>${items}</ul>`;
    area.appendChild(div);
  });
}

// Circuitos
function updateCircuitsFromData(payload){
  const area = document.getElementById('circuitos-list');
  if(!area) return;
  area.innerHTML = '';
  // try payload.circuits / payload.circuitos / fallback example
  const list = payload && (payload.circuits || payload.circuitos) || [];
  if(list.length === 0) {
    // fallback sample
    area.innerHTML = `<div class="card"><h3>No hay circuitos</h3><p class="small">Sube circuitos en times.json o en tu API</p></div>`;
    return;
  }
  list.forEach(c=>{
    const el = document.createElement('div'); el.className='card';
    const clima = c.clima || c.weather || {};
    const ultimo = c.ultimo_mejor || c.last_best || {};
    el.innerHTML = `<h3>${c.name || c.nombre}</h3>
      <p class="muted">Fechas: ${c.dias || c.dates || '-'}</p>
      <p>Último mejor: <strong>${ultimo.piloto || ultimo.name || '-'}</strong> ${ultimo.tiempo || ultimo.time || '-'} <small class='small'>(${ultimo.del || '-'} / ${ultimo.tras || '-'} frenos: ${ultimo.frenos || '-'})</small></p>
      <p class='small'>Clima: ${clima.cond || clima.condition || '-'} · Ambiente ${clima.ambiente || clima.temp_air || '-'}°C · Pista ${clima.pista || clima.temp_track || '-' }°C</p>`;
    area.appendChild(el);
  });
}

// Constructores
function updateConstructorsFromData(payload){
  const area = document.getElementById('constructores-table');
  if(!area) return;
  area.innerHTML = '';
  const table = document.createElement('table');
  table.className='table';
  table.innerHTML = `<thead><tr><th>Constructor</th><th>Puntos</th></tr></thead><tbody></tbody>`;
  const tb = table.querySelector('tbody');
  const list = payload && (payload.constructores || payload.constructors || payload.builders) || payload || [];
  list.forEach(c=>{
    const name = c.name || c.nombre || c.constructor || '-';
    const pts = c.points || c.puntos || c.points_total || 0;
    const color = c.color || c.colour || c.hex || '#888';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class='pilot-color' style='background:${color}'></span>${name}</td><td>${pts}</td>`;
    tb.appendChild(tr);
  });
  area.appendChild(table);
}

// función principal que decide qué cargar según la página
async function main() {
  // detectar página:
  const path = location.pathname.split('/').pop();
  // categoría para live
  const catId = parseInt(qp('cat')) || 1;

  // Cargar datos (intentará endpoint, si no fallback local)
  const result = await loadData(catId);
  const payload = result.data;

  // actualizar según página
  if(path === 'live.html' || path === '') {
    // título categoría
    const catNames = {1:'MotoGP',2:'Moto2',3:'Moto3'};
    documentQuery('#categoria-title','Categoría: ' + (catNames[catId] || catId));
    updateLiveTableFromData(catId, payload);
  }
  if(path === 'records.html') updateRecordsFromData(payload);
  if(path === 'circuitos.html') updateCircuitsFromData(payload);
  if(path === 'constructores.html') updateConstructorsFromData(payload);

  // actualizar periódicamente
  setTimeout(main, REFRESH_MS);
}

// start
document.addEventListener('DOMContentLoaded', main);
