'use strict';
const $ = id => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
let gameData, nodeId, mode = 'hand', noticeTimer, sparkleFrame;
const ambient = $('ambient');
const catPoses = ['seduto','cammina','si_pulisce','dorme','miagola'];
let catArea = null;
function placeCat() {
  const cat = $('cat-sprite');
  if (nodeId !== 'cimitero') { cat.style.display = 'none'; catArea = null; return; }
  const pose = catPoses[Math.floor(Math.random() * catPoses.length)];
  // Solo nella parte centrale del vialetto; stessa scala per evitare incongruenze prospettiche.
  const w = pose === 'cammina' || pose === 'dorme' ? 175 : 148;
  const h = pose === 'cammina' || pose === 'dorme' ? 135 : 155;
  const x = 710 + Math.floor(Math.random() * 155);
  const y = 705 + Math.floor(Math.random() * 55);
  cat.setAttribute('href', 'assets/cats/' + pose + '.png');
  cat.setAttribute('x', x); cat.setAttribute('y', y);
  cat.setAttribute('width', w); cat.setAttribute('height', h);
  cat.style.display = '';
  catArea = {x,y,w,h};
}
function meow() {
  const sound = $('meow'); sound.currentTime = 0; sound.play().catch(()=>{});
}

ambient.volume = .85;

async function loadTemplate(path, mount) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Template non trovato: ${path}`);
  const xml = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  if (xml.querySelector('parsererror')) throw new Error(`SVG non valido: ${path}`);
  $(mount).appendChild(document.importNode(xml.documentElement, true));
}
function bind(id, action) {
  const element = $(id);
  element.addEventListener('click', e => { e.stopPropagation(); action(); });
  element.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); }
  });
}
function say(message, duration = 3000) {
  $('notice-text').textContent = message;
  $('notice').style.opacity = 1;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').style.opacity = 0, duration);
}
function setIcon(id, filename) {
  const image = $(id + '-image');
  if (!image) throw new Error('Icona non trovata: ' + id);
  const url = 'assets/icons/' + filename + '.png?v=17';
  image.setAttribute('href', url);
  image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
}
function choose(tool) {
  mode = tool;
  setIcon('hand', tool === 'hand' ? 'mano_attiva' : 'mano');
  setIcon('lens', tool === 'lens' ? 'lente_attiva' : 'lente');
  $('hand').classList.toggle('selected', tool === 'hand');
  $('lens').classList.toggle('selected', tool === 'lens');
}

function go(id) {
  if (!gameData.nodes[id]) return;
  nodeId = id;
  $('scene').setAttribute('href', gameData.nodes[id].image);
  $('notice').style.opacity = 0;
  placeCat();
}
function openPanel(title) {
  $('panel-title').textContent = title;
  $('panel').style.display = '';
  const isSettings = title === 'Impostazioni';
  $('music-button').style.display = isSettings ? '' : 'none';
  $('volume-title').style.display = isSettings ? '' : 'none';
  $('volume-control').style.display = isSettings ? '' : 'none';
}
function sparkle(x, y) {
  cancelAnimationFrame(sparkleFrame);
  const start = performance.now();
  function animate(now) {
    const t = (now - start) / 460;
    if (t >= 1) { $('spark').setAttribute('opacity', 0); return; }
    $('spark').setAttribute('opacity', (1-t).toFixed(2));
    $('spark').setAttribute('transform', `translate(${x} ${y})`);
    $('spark-ring').setAttribute('r', 12 + t*30);
    sparkleFrame = requestAnimationFrame(animate);
  }
  sparkleFrame = requestAnimationFrame(animate);
}
function interact(e) {
  if (e.target.closest('.button') || e.target.closest('#panel')) return;
  const svg = $('game'), matrix = svg.getScreenCTM();
  if (!matrix) return;
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(matrix.inverse());
  if (q.x < 36 || q.x > 1636 || q.y < 36 || q.y > 905) return;
  if (catArea && q.x >= catArea.x && q.x <= catArea.x+catArea.w &&
      q.y >= catArea.y && q.y <= catArea.y+catArea.h) {
    meow(); return;
  }
  sparkle(q.x, q.y);
  // Le coordinate degli hotspot sono quelle della vignetta sorgente (1672x941).
  const x = (q.x-36)/1600*1672, y = (q.y-36)/869*941;
  const hotspot = gameData.nodes[nodeId].hotspots.find(h => x>=h.rect[0] && y>=h.rect[1] && x<=h.rect[2] && y<=h.rect[3]);
  if (mode === 'lens') {
    say(hotspot ? hotspot.look : 'Qui non vedo niente di interessante.', hotspot ? 3000 : 1500);
    return;
  }
  if (!hotspot) return;
  const action = hotspot.action;
  if (action === 'locked') {
    $('lock').currentTime = 0;
    $('lock').play().catch(() => {});
    say('La porta è chiusa. Probabilmente ci vuole una chiave.', 3200);
  } else if (action.startsWith('goto:')) go(action.slice(5));
  else if (action.startsWith('message:')) say(action.slice(8), 1800);
}
async function init() {
  try {
    const [data] = await Promise.all([
      fetch('data/nodes.json').then(r => { if (!r.ok) throw new Error('data/nodes.json mancante'); return r.json(); }),
      loadTemplate('templates/cornice.svg', 'frame-mount'),
      loadTemplate('templates/menu.svg?v=17', 'menu-mount')
    ]);
    gameData = data;
    go(data.initialNode);
    bind('hand', () => choose('hand'));
    bind('lens', () => choose('lens'));
    choose('hand');
    bind('bag', () => { openPanel('Inventario'); say('L’inventario è vuoto.', 1600); });
    bind('settings', () => openPanel('Impostazioni'));
    bind('close-button', () => $('panel').style.display = 'none');
    bind('music-button', async () => {
      if (ambient.paused) {
        try { await ambient.play(); $('music-label').textContent = '♫ Ferma musica'; }
        catch (_) { say('Impossibile riprodurre la musica.', 2000); }
      } else { ambient.pause(); $('music-label').textContent = '♫ Avvia musica'; }
    });
    $('volume').addEventListener('input', e => ambient.volume = +e.target.value / 100);
    $('game').addEventListener('pointerdown', interact);
  } catch (e) {
    console.error(e);
    $('notice-text').textContent = 'Errore di caricamento: ' + e.message;
    $('notice').style.opacity = 1;
  }
}
init();
