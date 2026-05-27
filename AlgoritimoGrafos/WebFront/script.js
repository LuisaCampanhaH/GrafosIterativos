const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const W = 640, H = 420;
canvas.width = W; canvas.height = H;

let nodes = [], edges = [], selected = null, dragging = null;
let dragOff = { x: 0, y: 0 }, nextId = 0, animFrame = null;
let pairs = [], pairIdx = 0, round = 1, seenPairs = new Set();

const GROUP_COLORS = {
  teto:        { fill: '#FAECE7', stroke: '#993C1D', text: '#4A1B0C' },
  piso:        { fill: '#E6F1FB', stroke: '#185FA5', text: '#0C447C' },
  relacionado: { fill: '#E1F5EE', stroke: '#0F6E56', text: '#085041' },
  meio:        { fill: '#EEEDFE', stroke: '#534AB7', text: '#3C3489' },
};

// ── Nós ──────────────────────────────────────────────────

function findNode(label) {
  return nodes.find(n => n.label.toLowerCase() === label.toLowerCase().trim());
}

function createNode(label, group, x, y) {
  const id = nextId++;
  const node = {
    id, label: label.trim(), group,
    x: x !== undefined ? x : W / 2 + (Math.random() - 0.5) * 100,
    y: y !== undefined ? y : H / 2 + (Math.random() - 0.5) * 100,
    vx: 0, vy: 0,
    highlight: false,
    pulse: 0,
  };
  nodes.push(node);
  return node;
}

function getOrCreateEdge(idA, idB) {
  const exists = edges.find(e =>
    (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
  if (!exists) edges.push({ from: idA, to: idB });
}

function removeEdge(idA, idB) {
  edges = edges.filter(e =>
    !((e.from === idA && e.to === idB) || (e.from === idB && e.to === idA)));
}

function edgeExists(idA, idB) {
  return edges.some(e =>
    (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA));
}

// ── Simulação de forças ───────────────────────────────────

const REPULSION = 8000, SPRING_LEN = 130, SPRING_K = 0.05;
const DAMPING = 0.82, CENTER_K = 0.008;
let simSteps = 0;

function simulateStep() {
  const n = nodes.length;
  if (!n) return;

  nodes.forEach(nd => { nd.fx = 0; nd.fy = 0; });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
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
    const force = SPRING_K * (dist - SPRING_LEN);
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.fx += fx; a.fy += fy;
    b.fx -= fx; b.fy -= fy;
  });

  nodes.forEach(nd => {
    nd.fx += (W / 2 - nd.x) * CENTER_K;
    nd.fy += (H / 2 - nd.y) * CENTER_K;
  });

  nodes.forEach(nd => {
    if (dragging && dragging.id === nd.id) return;
    if (nd.fixed) return;
    nd.vx = (nd.vx + nd.fx) * DAMPING;
    nd.vy = (nd.vy + nd.fy) * DAMPING;
    nd.x = Math.max(36, Math.min(W - 36, nd.x + nd.vx));
    nd.y = Math.max(36, Math.min(H - 36, nd.y + nd.vy));
  });
}

function startSim(steps = 300) {
  simSteps = steps;
  if (animFrame) return;
  function loop() {
    if (simSteps > 0 || dragging) {
      simulateStep();
      if (simSteps > 0) simSteps--;
      nodes.forEach(nd => { if (nd.highlight) nd.pulse = (nd.pulse || 0) + 0.07; });
      draw();
      animFrame = requestAnimationFrame(loop);
    } else {
      draw();
      animFrame = null;
    }
  }
  animFrame = requestAnimationFrame(loop);
}

// ── Desenhar ─────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);

  // grid de pontos
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 30; x < W; x += 30)
    for (let y = 30; y < H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }

  // arestas
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.from);
    const b = nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const ux = dx / dist, uy = dy / dist, r = 28;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * r, a.y + uy * r);
    ctx.lineTo(b.x - ux * r, b.y - uy * r);
    ctx.stroke();
    ctx.restore();
  });

  // linha tracejada entre o par atual (se ainda não conectados)
  const curPair = pairs[pairIdx];
  if (curPair) {
    const na = nodes.find(n => n.label === curPair[0]);
    const nb = nodes.find(n => n.label === curPair[1]);
    if (na && nb && !edgeExists(na.id, nb.id)) {
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const ux = dx / dist, uy = dy / dist, r = 28;
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(83,74,183,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(na.x + ux * r, na.y + uy * r);
        ctx.lineTo(nb.x - ux * r, nb.y - uy * r);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // nós
  nodes.forEach(nd => {
    const c = GROUP_COLORS[nd.group] || GROUP_COLORS.meio;
    const isSel = selected && selected.id === nd.id;
    const r = 28;

    if (nd.highlight) {
      const pulse = Math.sin(nd.pulse || 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, r + 6 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.25 + 0.15 * pulse;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (isSel) { ctx.shadowColor = c.stroke; ctx.shadowBlur = 14; }
    ctx.beginPath();
    ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = (isSel || nd.highlight) ? 2.5 : 1;
    ctx.stroke();
    ctx.restore();

    // pin indicator
    if (nd.fixed) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(nd.x, nd.y - r + 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = c.stroke;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.font = '500 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.text;
    let label = nd.label;
    if (ctx.measureText(label).width > r * 2 - 8) {
      while (ctx.measureText(label + '…').width > r * 2 - 8 && label.length > 1)
        label = label.slice(0, -1);
      label += '…';
    }
    ctx.fillText(label, nd.x, nd.y);
    ctx.restore();
  });

  if (!nodes.length) {
    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Preencha os grupos acima para começar', W / 2, H / 2);
    ctx.restore();
  }
}

// ── Fase 1 ────────────────────────────────────────────────

function parseList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function layoutNodes(nodeList) {
  const n = nodeList.length;
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.32;
  nodeList.forEach((nd, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    nd.x = cx + Math.cos(angle) * rad;
    nd.y = cy + Math.sin(angle) * rad;
    nd.vx = 0; nd.vy = 0;
  });
}

function generatePairs(labels) {
  const result = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      result.push([labels[i], labels[j]]);
  return result;
}

document.getElementById('start-btn').addEventListener('click', () => {
  const tetos = parseList(document.getElementById('input-teto').value);
  const pisos  = parseList(document.getElementById('input-piso').value);
  const rels   = parseList(document.getElementById('input-rel').value);

  if (!tetos.length || !pisos.length) {
    ['input-teto', 'input-piso'].forEach(id => {
      const el = document.getElementById(id);
      if (!parseList(el.value).length) {
        el.style.borderColor = '#E24B4A';
        setTimeout(() => el.style.borderColor = '', 1200);
      }
    });
    return;
  }

  nodes = []; edges = []; selected = null; nextId = 0;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

  const allLabels = [];
  tetos.forEach(l => { const n = createNode(l, 'teto');        n.fixed = true; allLabels.push(l); });
  pisos.forEach(l  => { const n = createNode(l, 'piso');        n.fixed = true; allLabels.push(l); });
  rels.forEach(l   => { const n = createNode(l, 'relacionado'); n.fixed = true; allLabels.push(l); });

  layoutNodes(nodes);
  pairs = generatePairs(allLabels);
  pairIdx = 0;

  document.getElementById('phase1-panel').style.display = 'none';
  document.getElementById('phase2-panel').style.display = 'block';
  updatePairUI();
  startSim(400);
});

// ── Fase 2 ────────────────────────────────────────────────

function updatePairUI() {
  const total = pairs.length;

  // pula pares já conectados diretamente
  while (pairIdx < total) {
    const [a, b] = pairs[pairIdx];
    const na = nodes.find(n => n.label === a);
    const nb = nodes.find(n => n.label === b);
    if (na && nb && edgeExists(na.id, nb.id)) { pairIdx++; continue; }
    break;
  }

  nodes.forEach(n => { n.highlight = false; n.pulse = 0; });

  if (pairIdx >= total) {
    document.getElementById('pair-prompt').style.opacity = '0.4';
    document.getElementById('input-meio').disabled = true;
    document.getElementById('confirm-btn').disabled = true;
    document.getElementById('skip-btn').disabled = true;
    document.getElementById('done-msg').style.display = 'flex';
    document.getElementById('round-num').textContent = round;
    document.getElementById('pair-counter').textContent = 'Rodada ' + round + ' concluída!';
    document.getElementById('progress-bar').style.width = '100%';

    // verifica se existem pares novos para a próxima rodada
    const newPairs = generatePairs(nodes.map(n => n.label))
      .filter(([a, b]) => {
        const key = [a, b].sort().join('|||');
        if (seenPairs.has(key)) return false;
        const na = nodes.find(n => n.label === a);
        const nb = nodes.find(n => n.label === b);
        return na && nb && !edgeExists(na.id, nb.id);
      });

    document.getElementById('next-round-btn').style.display = newPairs.length ? 'inline-flex' : 'none';
    document.getElementById('no-pairs-msg').style.display  = newPairs.length ? 'none' : 'inline';

    startSim(60);
    return;
  }

  const [labelA, labelB] = pairs[pairIdx];
  seenPairs.add([labelA, labelB].sort().join('|||'));
  document.getElementById('node-a-label').textContent = labelA;
  document.getElementById('node-b-label').textContent = labelB;
  document.getElementById('pair-counter').textContent = `Par ${pairIdx + 1} de ${total}`;
  document.getElementById('progress-bar').style.width = `${(pairIdx / total) * 100}%`;
  document.getElementById('input-meio').value = '';
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';

  const na = nodes.find(n => n.label === labelA);
  const nb = nodes.find(n => n.label === labelB);
  if (na) na.highlight = true;
  if (nb) nb.highlight = true;

  document.getElementById('input-meio').focus();
  startSim(200);
}

function confirmPair() {
  const meio = document.getElementById('input-meio').value.trim();
  if (!meio) { advancePair(); return; }

  const [labelA, labelB] = pairs[pairIdx];
  const na = nodes.find(n => n.label === labelA);
  const nb = nodes.find(n => n.label === labelB);
  if (!na || !nb) { advancePair(); return; }

  if (edgeExists(na.id, nb.id)) removeEdge(na.id, nb.id);

  let nm = findNode(meio);
  if (!nm) {
    const mx = (na.x + nb.x) / 2 + (Math.random() - 0.5) * 30;
    const my = (na.y + nb.y) / 2 + (Math.random() - 0.5) * 30;
    nm = createNode(meio, 'meio', mx, my);
  }

  getOrCreateEdge(na.id, nm.id);
  getOrCreateEdge(nm.id, nb.id);
  advancePair();
}

function advancePair() {
  pairIdx++;
  updatePairUI();
  startSim(300);
}

document.getElementById('confirm-btn').addEventListener('click', confirmPair);
document.getElementById('skip-btn').addEventListener('click', advancePair);
document.getElementById('next-round-btn').addEventListener('click', () => {
  round++;
  // gera todos os pares possíveis entre os nós atuais, filtra os já conectados
  pairs = generatePairs(nodes.map(n => n.label))
    .filter(([a, b]) => {
      const key = [a, b].sort().join('|||');
      if (seenPairs.has(key)) return false;
      const na = nodes.find(n => n.label === a);
      const nb = nodes.find(n => n.label === b);
      return na && nb && !edgeExists(na.id, nb.id);
    });
  pairIdx = 0;

  document.getElementById('done-msg').style.display = 'none';
  document.getElementById('pair-prompt').style.opacity = '1';
  document.getElementById('input-meio').disabled = false;
  document.getElementById('confirm-btn').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  updatePairUI();
  startSim(300);
});

document.getElementById('input-meio').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmPair();
  if (e.key === 'Escape') advancePair();
});

// ── Reset ─────────────────────────────────────────────────

function resetAll() {
  nodes = []; edges = []; selected = null; nextId = 0; pairs = []; pairIdx = 0; round = 1; seenPairs = new Set();
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  document.getElementById('phase1-panel').style.display = 'block';
  document.getElementById('phase2-panel').style.display = 'none';
  document.getElementById('input-teto').value = '';
  document.getElementById('input-piso').value = '';
  document.getElementById('input-rel').value = '';
  draw();
}

document.getElementById('reset-btn').addEventListener('click', resetAll);
document.getElementById('reset-btn2').addEventListener('click', resetAll);

// ── Mouse ─────────────────────────────────────────────────

function nodeAt(x, y) {
  return nodes.slice().reverse().find(n => Math.hypot(n.x - x, n.y - y) <= 28);
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top)  * (H / rect.height),
  };
}

canvas.addEventListener('mousedown', e => {
  const p = getPos(e), node = nodeAt(p.x, p.y);
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

canvas.addEventListener('mouseleave', () => { dragging = null; });

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

draw();