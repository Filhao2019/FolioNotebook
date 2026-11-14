// Interactive force-directed graph on a canvas. No dependencies: the page's
// Content-Security-Policy only allows first-party scripts.

const ALPHA_MIN = 0.005;
const ALPHA_DECAY = 0.0228;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 6;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const shorten = (text) => (text.length > 34 ? text.slice(0, 33) + "…" : text);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ nodes: any[], links: { source: string, target: string }[] }} data
 * @param {{ onSelect?: (node: any) => void, onOpen?: (node: any) => void }} [options]
 */
export function createGraph(canvas, data, options = {}) {
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const byId = new Map();
  const nodes = data.nodes.map((n) => {
    const node = {
      ...n,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      degree: 0,
      near: [],
      visible: true,
      fixed: false,
    };
    byId.set(n.id, node);
    return node;
  });
  const links = data.links
    .map((l) => ({ source: byId.get(l.source), target: byId.get(l.target) }))
    .filter((l) => l.source && l.target);
  for (const l of links) {
    l.source.degree++;
    l.target.degree++;
    l.source.near.push(l.target);
    l.target.near.push(l.source);
  }
  for (const n of nodes)
    n.r =
      n.kind === "notebook"
        ? 9 + Math.min(9, Math.sqrt(n.degree))
        : 4 + Math.min(7, Math.sqrt(n.degree) * 1.3);

  // Start each notebook's items around its hub so clusters untangle quickly.
  const hubs = nodes.filter((n) => n.kind === "notebook");
  const spread = hubs.length > 1 ? 90 + hubs.length * 26 : 0;
  hubs.forEach((hub, i) => {
    const angle = (i / hubs.length) * Math.PI * 2;
    hub.x = Math.cos(angle) * spread;
    hub.y = Math.sin(angle) * spread;
  });
  nodes.forEach((n, i) => {
    if (n.kind === "notebook") return;
    const hub = byId.get("n:" + n.notebookId),
      angle = i * 2.399963,
      distance = 30 + 9 * Math.sqrt(i + 1);
    n.x = (hub?.x || 0) + Math.cos(angle) * distance;
    n.y = (hub?.y || 0) + Math.sin(angle) * distance;
  });

  const view = { x: 0, y: 0, k: 1 };
  let width = 0,
    height = 0,
    dpr = 1,
    alpha = 1,
    alphaTarget = 0,
    frame = 0,
    started = false,
    destroyed = false,
    touched = false,
    hover = null,
    selected = null,
    matches = null,
    colors = {};

  function readColors() {
    const style = getComputedStyle(canvas);
    const read = (name) => style.getPropertyValue("--graph-" + name).trim();
    colors = {
      notebook: read("notebook") || "#5b4bc4",
      source: read("source") || "#2f7fb8",
      resource: read("resource") || "#c2671d",
      topic: read("topic") || "#2e8f6b",
      link: read("link") || "#c9cbd6",
      strong: read("strong") || "#5b4bc4",
      label: read("label") || "#28323d",
      halo: read("halo") || "#ffffff",
      font: style.fontFamily || "sans-serif",
    };
  }

  function tick() {
    const shown = nodes.filter((n) => n.visible);
    for (let i = 0; i < shown.length; i++) {
      const a = shown[i];
      for (let j = i + 1; j < shown.length; j++) {
        const b = shown[j];
        let dx = b.x - a.x,
          dy = b.y - a.y;
        if (!dx && !dy) {
          dx = (i - j) * 0.01 + 0.01;
          dy = 0.01;
        }
        const d2 = dx * dx + dy * dy;
        if (d2 > 640000) continue;
        const push = (460 * alpha) / Math.max(d2, 25);
        a.vx -= dx * push;
        a.vy -= dy * push;
        b.vx += dx * push;
        b.vy += dy * push;
      }
    }
    for (const l of links) {
      const s = l.source,
        g = l.target;
      if (!s.visible || !g.visible) continue;
      const dx = g.x + g.vx - s.x - s.vx || 0.01,
        dy = g.y + g.vy - s.y - s.vy || 0.01,
        distance = Math.sqrt(dx * dx + dy * dy),
        rest = 62 + s.r + g.r,
        pull =
          ((distance - rest) / distance) *
          alpha *
          (0.9 / Math.min(s.degree, g.degree, 4)),
        share = s.degree / (s.degree + g.degree);
      g.vx -= dx * pull * share;
      g.vy -= dy * pull * share;
      s.vx += dx * pull * (1 - share);
      s.vy += dy * pull * (1 - share);
    }
    for (const n of shown) {
      if (n.fixed) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx = (n.vx - n.x * 0.045 * alpha) * 0.6;
      n.vy = (n.vy - n.y * 0.045 * alpha) * 0.6;
      n.x += n.vx;
      n.y += n.vy;
    }
    alpha += (alphaTarget - alpha) * ALPHA_DECAY;
  }

  function settle(limit) {
    for (let i = 0; i < limit && alpha > ALPHA_MIN; i++) tick();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      dpr * view.k,
      0,
      0,
      dpr * view.k,
      dpr * view.x,
      dpr * view.y,
    );
    const active = hover || selected;
    const lit = active
      ? new Set([active, ...active.near])
      : matches
        ? matches
        : null;
    const px = 1 / view.k;
    ctx.lineWidth = px;
    ctx.strokeStyle = colors.link;
    ctx.globalAlpha = lit ? 0.25 : 0.9;
    ctx.beginPath();
    for (const l of links) {
      if (!l.source.visible || !l.target.visible) continue;
      if (active && (l.source === active || l.target === active)) continue;
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
    }
    ctx.stroke();
    if (active) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.strong;
      ctx.lineWidth = 1.6 * px;
      ctx.beginPath();
      for (const l of links) {
        if (!l.source.visible || !l.target.visible) continue;
        if (l.source !== active && l.target !== active) continue;
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);
      }
      ctx.stroke();
    }
    for (const n of nodes) {
      if (!n.visible) continue;
      ctx.globalAlpha = !lit || lit.has(n) ? 1 : 0.16;
      ctx.fillStyle = colors[n.kind] || colors.resource;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      if (n === selected || n === hover) {
        ctx.strokeStyle = colors.label;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3 * px, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Labels fade in with zoom, as in a note graph; hubs and the focused
    // neighbourhood are always named.
    const fade = clamp((view.k - 0.75) / 0.45, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    for (const n of nodes) {
      if (!n.visible) continue;
      const forced = lit ? lit.has(n) : n.kind === "notebook";
      const opacity = forced ? 1 : lit ? 0 : fade;
      if (opacity < 0.05) continue;
      const size = (n.kind === "notebook" ? 13 : 11.5) * px;
      ctx.font = `${n.kind === "notebook" ? 600 : 500} ${size}px ${colors.font}`;
      ctx.globalAlpha = opacity;
      const text = shorten(n.label),
        y = n.y + n.r + 4 * px;
      ctx.strokeStyle = colors.halo;
      ctx.lineWidth = 3 * px;
      ctx.strokeText(text, n.x, y);
      ctx.fillStyle = colors.label;
      ctx.fillText(text, n.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    frame = 0;
    if (destroyed) return;
    if (!canvas.isConnected) return destroy();
    const moving = alpha > ALPHA_MIN || alphaTarget > 0;
    if (moving) tick();
    draw();
    if (moving) frame = requestAnimationFrame(loop);
  }
  function redraw() {
    if (!frame && started && !destroyed) frame = requestAnimationFrame(loop);
  }
  function reheat(value = 0.5) {
    if (still) {
      alpha = value;
      settle(200);
    } else alpha = Math.max(alpha, value);
    redraw();
  }

  function fit() {
    const shown = nodes.filter((n) => n.visible);
    if (!shown.length || !width) return;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of shown) {
      x0 = Math.min(x0, n.x - n.r);
      y0 = Math.min(y0, n.y - n.r);
      x1 = Math.max(x1, n.x + n.r);
      y1 = Math.max(y1, n.y + n.r + 18);
    }
    view.k = clamp(
      Math.min(width / (x1 - x0 + 90), height / (y1 - y0 + 90)),
      MIN_ZOOM,
      1.6,
    );
    view.x = width / 2 - ((x0 + x1) / 2) * view.k;
    view.y = height / 2 - ((y0 + y1) / 2) * view.k;
    redraw();
  }
  function zoomAt(factor, cx = width / 2, cy = height / 2) {
    const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM),
      ratio = k / view.k;
    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.k = k;
    touched = true;
    redraw();
  }

  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const toWorld = (p) => ({
    x: (p.x - view.x) / view.k,
    y: (p.y - view.y) / view.k,
  });
  function nodeAt(p) {
    const w = toWorld(p),
      slack = 5 / view.k;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!n.visible) continue;
      const dx = n.x - w.x,
        dy = n.y - w.y,
        reach = n.r + slack;
      if (dx * dx + dy * dy <= reach * reach) return n;
    }
    return null;
  }

  function select(node, notify = true) {
    selected = node && node.visible ? node : null;
    redraw();
    if (notify) options.onSelect?.(selected);
  }
  function focus(id) {
    const node = byId.get(id);
    if (!node || !node.visible) return;
    view.k = Math.max(view.k, 1.25);
    view.x = width / 2 - node.x * view.k;
    view.y = height / 2 - node.y * view.k;
    touched = true;
    select(node);
  }

  // --- Pointer, wheel and keyboard -----------------------------------------
  const pointers = new Map();
  let drag = null,
    pinch = 0;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function onDown(event) {
    if (event.button > 0) return;
    const p = point(event);
    pointers.set(event.pointerId, p);
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      if (drag?.node) drag.node.fixed = false;
      drag = null;
      alphaTarget = 0;
      pinch = pinchDistance();
      return;
    }
    const node = nodeAt(p);
    drag = { node, start: p, last: p, moved: false };
  }
  function onMove(event) {
    const p = point(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, p);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()],
        distance = pinchDistance();
      zoomAt(distance / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = distance;
      return;
    }
    if (!drag) {
      const node = nodeAt(p);
      if (node !== hover) {
        hover = node;
        canvas.classList.toggle("over-node", Boolean(node));
        redraw();
      }
      return;
    }
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 4)
      return;
    if (!drag.moved) {
      drag.moved = true;
      touched = true;
      canvas.classList.add("dragging");
      if (drag.node) {
        drag.node.fixed = true;
        hover = drag.node;
        if (!still) alphaTarget = 0.3;
      }
    }
    if (drag.node) {
      const w = toWorld(p);
      drag.node.x = w.x;
      drag.node.y = w.y;
    } else {
      view.x += p.x - drag.last.x;
      view.y += p.y - drag.last.y;
    }
    drag.last = p;
    redraw();
  }
  function onUp(event) {
    pointers.delete(event.pointerId);
    pinch = 0;
    if (!drag) return;
    const done = drag;
    drag = null;
    canvas.classList.remove("dragging");
    if (done.node) done.node.fixed = false;
    alphaTarget = 0;
    if (!done.moved && event.type === "pointerup") select(done.node);
    else redraw();
  }
  function onLeave() {
    if (drag || !hover) return;
    hover = null;
    canvas.classList.remove("over-node");
    redraw();
  }
  function onWheel(event) {
    event.preventDefault();
    const p = point(event),
      unit = event.deltaMode === 1 ? 32 : 1;
    zoomAt(Math.exp(-event.deltaY * unit * 0.0016), p.x, p.y);
  }
  function onDouble(event) {
    const node = nodeAt(point(event));
    if (node) options.onOpen?.(node);
  }
  function onKey(event) {
    const step = 48;
    const moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      view.x += moves[event.key][0];
      view.y += moves[event.key][1];
      touched = true;
      redraw();
    } else if (event.key === "+" || event.key === "=") zoomAt(1.25);
    else if (event.key === "-") zoomAt(0.8);
    else if (event.key === "0") fit();
    else if (event.key === "Enter" && selected) options.onOpen?.(selected);
    else if (event.key === "Escape" && selected) select(null);
    else return;
    event.preventDefault();
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDouble);
  canvas.addEventListener("keydown", onKey);

  const sizes = new ResizeObserver(() => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const first = !started;
    if (!first) {
      // Keep the same world point in the middle while the panel resizes.
      view.x += (w - width) / 2;
      view.y += (h - height) / 2;
    }
    width = w;
    height = h;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (first) {
      started = true;
      readColors();
      // Settle off-screen first so the graph does not explode into view.
      settle(still ? 400 : nodes.length > 700 ? 30 : 140);
      fit();
    } else if (!touched) fit();
    redraw();
  });
  sizes.observe(canvas);
  const theme = new MutationObserver(() => {
    readColors();
    redraw();
  });
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(frame);
    sizes.disconnect();
    theme.disconnect();
  }

  return {
    nodes,
    links,
    fit() {
      touched = false;
      fit();
    },
    zoom: (factor) => zoomAt(factor),
    select,
    focus,
    /** Visible neighbours of a node, hubs first. */
    neighbours: (node) =>
      [...new Set(node.near)]
        .filter((n) => n.visible)
        .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label)),
    /** @param {(node: any) => boolean} test */
    setVisible(test) {
      for (const n of nodes) n.visible = Boolean(test(n));
      if (selected && !selected.visible) select(null);
      if (hover && !hover.visible) hover = null;
      reheat(0.4);
      if (!touched) fit();
    },
    /** Dim everything except the nodes passing the test; null clears it. */
    setMatch(test) {
      matches = test
        ? new Set(nodes.filter((n) => n.visible && test(n)))
        : null;
      redraw();
      return matches ? matches.size : 0;
    },
    firstMatch: () =>
      matches ? [...matches].sort((a, b) => b.degree - a.degree)[0] : null,
    destroy,
  };
}
