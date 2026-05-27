const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

const W = 640, H = 420;
canvas.width = W;
canvas.height = H;

let nodes = [];
let edges = [];
let selected = null;
let dragging = null;
let dragOff = { x: 0, y: 0 };
let nextId = 0;
let animFrame = null;

const COLORS = [
  { fill: '#EEEDFE', stroke: '#534AB7', text: '#3C3489' },
  { fill: '#E1F5EE', stroke: '#0F6E56', text: '#085041' },
  { fill: '#FAECE7', stroke: '#993C1D', text: '#4A1B0C' },
  { fill: '#E6F1FB', stroke: '#185FA5', text: '#0C447C' },
  { fill: '#FAEEDA', stroke: '#854F0B', text: '#633806' },
  { fill: '#FBEAF0', stroke: '#993556', text: '#4B1528' },
];

// ── Nós ───────────────────────────────────────────────────

function findNode(label) {
  return nodes.find(n => n.label.toLowerCase() === label.toLowerCase().trim());
}

function createNode(label, x, y) {
  const id = nextId++;
  const node = {
    id,
    label: label.trim(),
    x: x !== undefined ? x : W / 2 + (Math.random() - 0.5) * 100,
    y: y !== undefined ? y : H / 2 + (Math.random() - 0.5) * 100,
    vx: 0, vy: 0,
    colorIdx: id % COLORS.length,
  };
  nodes.push(node);
  return node;
}

function getOrCreateEdge(idA, idB) {
  const exists = edges.find(e =>
    (e.from === idA && e.to === idB) ||
    (e.from === idB && e.to === idA)
  );
  if (!exists) edges.push({ from: idA, to: idB });
}

function removeEdge(idA, idB) {
  edges = edges.filter(e =>
    !((e.from === idA && e.to === idB) ||
      (e.from === idB && e.to === idA))
  );
}

function edgeExists(idA, idB) {
  return edges.some(e =>
    (e.from === idA && e.to === idB) ||
    (e.from === idB && e.to === idA)
  );
}

// ── Simulação de forças ───────────────────────────────────

const REPULSION   = 8000;
const SPRING_LEN  = 120;
const SPRING_K    = 0.06;
const DAMPING     = 0.82;
const CENTER_K    = 0.008;
const MAX_STEPS   = 300;

let simSteps = 0;

function simulateStep() {
  const n = nodes.length;
  if (n === 0) return;

  nodes.forEach(node => { node.fx = 0; node.fy = 0; });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy;
      b.fx += fx; b.fy += fy;
    }
  }

  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from);
    const b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const stretch = dist - SPRING_LEN;
    const force = SPRING_K * stretch;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.fx += fx; a.fy += fy;
    b.fx -= fx; b.fy -= fy;
  });

  nodes.forEach(node => {
    node.fx += (W / 2 - node.x) * CENTER_K;
    node.fy += (H / 2 - node.y) * CENTER_K;
  });

  nodes.forEach(node => {
    if (dragging && dragging.id === node.id) return;
    node.vx = (node.vx + node.fx) * DAMPING;
    node.vy = (node.vy + node.fy) * DAMPING;
    node.x = Math.max(36, Math.min(W - 36, node.x + node.vx));
    node.y = Math.max(36, Math.min(H - 36, node.y + node.vy));
  });
}

function startSim() {
  simSteps = MAX_STEPS;
  if (animFrame) return;
  function loop() {
    if (simSteps > 0 || dragging) {
      simulateStep();
      if (simSteps > 0) simSteps--;
      draw();
      animFrame = requestAnimationFrame(loop);
    } else {
      draw();
      animFrame = null;
    }
  }
  animFrame = requestAnimationFrame(loop);
}

// ── Adicionar triple ──────────────────────────────────────
function addTriple() {
  const labelTeto = document.getElementById('input-teto').value.trim();
  const labelMeio = document.getElementById('input-meio').value.trim();
  const labelPiso = document.getElementById('input-piso').value.trim();

  if (!labelTeto || !labelMeio || !labelPiso) {
    ['input-teto', 'input-meio', 'input-piso'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        el.style.borderColor = '#E24B4A';
        setTimeout(() => el.style.borderColor = '', 1200);
      }
    });
    return;
  }

  const tetoExistia = !!findNode(labelTeto);
  const pisoExistia = !!findNode(labelPiso);
  const meioExistia = !!findNode(labelMeio);

  const teto = findNode(labelTeto) || createNode(labelTeto);
  const piso = findNode(labelPiso) || createNode(labelPiso);

  // Se teto e piso já existiam e tinham uma aresta direta entre si,
  // remove essa aresta antes de inserir o nó do meio entre eles.
  const tinhaArestadireta = tetoExistia && pisoExistia && edgeExists(teto.id, piso.id);

  let meio;
  if (!meioExistia) {
    // Novo nó: posiciona entre teto e piso visualmente
    const mx = (teto.x + piso.x) / 2 + (Math.random() - 0.5) * 40;
    const my = (teto.y + piso.y) / 2 + (Math.random() - 0.5) * 40;
    meio = createNode(labelMeio, mx, my);
  } else {
    meio = findNode(labelMeio);
  }

  if (tinhaArestadireta) {
    removeEdge(teto.id, piso.id);
  }

  getOrCreateEdge(teto.id, meio.id);
  getOrCreateEdge(meio.id, piso.id);

  document.getElementById('input-teto').value = '';
  document.getElementById('input-meio').value = '';
  document.getElementById('input-piso').value = '';
  document.getElementById('input-teto').focus();

  startSim();
}

// ── Desenhar ──────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 30; x < W; x += 30)
    for (let y = 30; y < H; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }

  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from);
    const b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const ux = dx / dist, uy = dy / dist;
    const r = 28;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * r, a.y + uy * r);
    ctx.lineTo(b.x - ux * r, b.y - uy * r);
    ctx.stroke();
    ctx.restore();
  });

  nodes.forEach(node => {
    const c = COLORS[node.colorIdx];
    const isSel = selected && selected.id === node.id;
    const r = 28;
    ctx.save();
    if (isSel) { ctx.shadowColor = c.stroke; ctx.shadowBlur = 14; }
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = isSel ? 2.5 : 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '500 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.text;
    let label = node.label;
    if (ctx.measureText(label).width > r * 2 - 8) {
      while (ctx.measureText(label + '…').width > r * 2 - 8 && label.length > 1)
        label = label.slice(0, -1);
      label += '…';
    }
    ctx.fillText(label, node.x, node.y);
    ctx.restore();
  });

  if (nodes.length === 0) {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Preencha os campos acima e clique em "Adicionar ao grafo"', W / 2, H / 2);
    ctx.restore();
  }
}

// ── Mouse ─────────────────────────────────────────────────
function nodeAt(x, y) {
  return nodes.slice().reverse().find(n => Math.hypot(n.x - x, n.y - y) <= 28);
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener('mousedown', e => {
  const p = getPos(e);
  const node = nodeAt(p.x, p.y);
  selected = node || null;
  if (node) {
    dragging = node;
    dragOff = { x: p.x - node.x, y: p.y - node.y };
    canvas.style.cursor = 'grabbing';
    startSim();
  }
  draw();
});

canvas.addEventListener('mousemove', e => {
  const p = getPos(e);
  if (dragging) {
    dragging.x = Math.max(30, Math.min(W - 30, p.x - dragOff.x));
    dragging.y = Math.max(30, Math.min(H - 30, p.y - dragOff.y));
  } else {
    canvas.style.cursor = nodeAt(p.x, p.y) ? 'grab' : 'default';
  }
});

canvas.addEventListener('mouseup', () => {
  if (dragging) { dragging.vx = 0; dragging.vy = 0; }
  dragging = null;
  canvas.style.cursor = 'default';
  startSim();
});

canvas.addEventListener('mouseleave', () => {
  dragging = null;
});

// ── Teclado ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected && tag !== 'INPUT') {
    edges = edges.filter(ed => ed.from !== selected.id && ed.to !== selected.id);
    nodes = nodes.filter(n => n.id !== selected.id);
    selected = null;
    startSim();
  }
});

document.getElementById('input-teto').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('input-meio').focus();
});
document.getElementById('input-meio').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('input-piso').focus();
});
document.getElementById('input-piso').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTriple();
});

document.getElementById('add-triple-btn').addEventListener('click', addTriple);
document.getElementById('clear-btn').addEventListener('click', () => {
  nodes = []; edges = []; selected = null; nextId = 0;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  draw();
});

draw();