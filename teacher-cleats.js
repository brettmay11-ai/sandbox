(() => {
  if (!document.querySelector('[data-teacher-page="cleats"]') || !window.THREE) return;

  const host = document.getElementById('cleat-viewer');
  const empty = document.getElementById('cleat-viewer-empty');
  const name = document.getElementById('cleat-preview-name');
  const meta = document.getElementById('cleat-preview-meta');
  const angleLabel = document.getElementById('cleat-viewer-angle');
  const note = document.getElementById('cleat-upload-note');
  const modelInput = document.getElementById('cleat-model');
  const templateInput = document.getElementById('cleat-template');

  /* ============================================================
     SHARED CLEAT TEMPLATE OUTLINE
     ------------------------------------------------------------
     Traced directly from the printed "My Cause My Cleats" paper
     worksheet (MyCleatMyCause1.pdf), so the 3D silhouette matches
     the shape students color in. Coordinates are in the SAME
     orientation as the worksheet: portrait, toe at the bottom
     (low y), ankle collar at the top (high y), studs on the right
     (high x), laces on the left (low x). Because the student's
     drawing is projected using this outline's bounding box, the
     art lands exactly inside the silhouette. Re-trace and replace
     these points if the worksheet art ever changes.
     ============================================================ */
  const CLEAT_OUTLINE = [
    [0.375,5.6],[0.471,5.589],[0.584,5.45],[0.68,5.38],[0.771,5.364],[0.841,5.172],[0.728,5.124],[0.744,5.075],[0.814,5.043],[0.846,4.984],[1.06,4.952],[1.071,4.797],[1.028,4.77],[1.049,4.62],[0.878,4.529],[0.835,4.433],[0.867,4.117],[0.99,3.978],[1.162,3.93],[1.231,3.86],[1.226,3.715],[1.028,3.63],[0.942,3.485],[0.953,3.442],[1.103,3.421],[1.108,3.255],[1.14,3.234],[1.146,3.094],[1.13,3.052],[1.001,3.03],[0.921,2.95],[0.857,2.281],[0.857,1.633],[0.942,1.537],[1.114,1.51],[1.124,1.354],[1.108,1.296],[0.905,1.247],[0.819,1.14],[0.835,0.996],[0.889,0.889],[1.178,0.776],[1.21,0.717],[1.21,0.584],[0.953,0.503],[0.932,0.444],[0.857,0.391],[0.803,0.203],[0.696,0.096],[0.567,0.037],[0.385,0],[0.118,0],[-0.246,0.054],[-0.423,0.054],[-0.685,0.182],[-0.862,0.225],[-1.065,0.359],[-1.087,0.482],[-1.06,0.535],[-0.964,0.616],[-0.728,0.728],[-0.626,0.814],[-0.53,0.969],[-0.509,1.14],[-0.567,1.371],[-0.712,1.622],[-0.787,1.708],[-0.883,1.665],[-0.969,1.665],[-1.049,1.708],[-1.162,1.847],[-1.231,2.061],[-1.231,2.136],[-1.033,2.5],[-1.001,2.639],[-0.91,2.698],[-0.857,2.784],[-0.835,2.912],[-0.755,2.971],[-0.717,3.046],[-0.685,3.121],[-0.68,3.228],[-0.605,3.303],[-0.519,3.56],[-0.434,3.71],[-0.412,3.833],[-0.337,3.946],[-0.348,4.021],[-0.294,4.074],[-0.198,4.428],[-0.123,4.861],[0.037,5.327],[0.198,5.536],[0.369,5.6]
  ];
  const DEPTH = 0.9; // shoe width (extrusion depth), in outline units

  function buildOutlineShape() {
    const shape = new THREE.Shape();
    CLEAT_OUTLINE.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    return shape;
  }
  function outlineBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of CLEAT_OUTLINE) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  const bounds = outlineBounds();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.0, 9);
  camera.lookAt(0, 1.25, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfc4cc, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(5, 9, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.camera.left = -6; keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6; keyLight.shadow.camera.bottom = -6;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.85);
  fillLight.position.set(-5, 2, 6);
  scene.add(fillLight);

  // stage = user drag rotation (spin around Y to see both painted sides)
  const stage = new THREE.Group();
  scene.add(stage);
  // cleatGroup = the shoe itself, laid down naturally and auto-centered
  const cleatGroup = new THREE.Group();
  stage.add(cleatGroup);

  // Build the ROUNDED cleat body by "inflating" the flat silhouette into a
  // 3D volume: thickness is greatest along the centerline and tapers to zero
  // at the outline, giving a real shoe-like dome (rounded toe box, instep,
  // heel) instead of a flat extruded slab. UVs stay planar (raw x,y), so the
  // student's drawing still projects straight onto the domed upper.
  function buildInflatedGeometry() {
    const minX = bounds.minX, minY = bounds.minY, w = bounds.w, h = bounds.h;
    const CELL = 0.026, MAX_HALF = 0.62, K = 0.72; // grid step, thickness cap, dome steepness
    const gw = Math.ceil(w / CELL) + 1, gh = Math.ceil(h / CELL) + 1;
    const P = CLEAT_OUTLINE;
    const X = gx => minX + gx * CELL, Y = gy => minY + gy * CELL;
    const inPoly = (px, py) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
      }
      return c;
    };
    const inside = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) inside[gy * gw + gx] = inPoly(X(gx), Y(gy)) ? 1 : 0;
    // chamfer distance transform: distance (in cells) from each inside node to the edge
    const dist = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) dist[i] = inside[i] ? 1e9 : 0;
    const oC = 1, dC = Math.SQRT2;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx; if (!inside[i]) continue; let m = dist[i];
      if (gx > 0) m = Math.min(m, dist[i - 1] + oC);
      if (gy > 0) m = Math.min(m, dist[i - gw] + oC);
      if (gx > 0 && gy > 0) m = Math.min(m, dist[i - gw - 1] + dC);
      if (gx < gw - 1 && gy > 0) m = Math.min(m, dist[i - gw + 1] + dC); dist[i] = m;
    }
    for (let gy = gh - 1; gy >= 0; gy--) for (let gx = gw - 1; gx >= 0; gx--) {
      const i = gy * gw + gx; if (!inside[i]) continue; let m = dist[i];
      if (gx < gw - 1) m = Math.min(m, dist[i + 1] + oC);
      if (gy < gh - 1) m = Math.min(m, dist[i + gw] + oC);
      if (gx < gw - 1 && gy < gh - 1) m = Math.min(m, dist[i + gw + 1] + dC);
      if (gx > 0 && gy < gh - 1) m = Math.min(m, dist[i + gw - 1] + dC); dist[i] = m;
    }
    const bulge = i => Math.min(MAX_HALF, K * Math.sqrt(Math.max(0, (dist[i] - 1)) * CELL)); // 0 at rim -> closes the volume
    const idxOf = new Int32Array(gw * gh).fill(-1);
    const pos = [], uv = []; let n = 0;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx; if (!inside[i]) continue;
      idxOf[i] = n++; const x = X(gx), y = Y(gy), z = bulge(i); pos.push(x, y, z); uv.push(x, y);
    }
    const frontCount = n;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx; if (!inside[i]) continue;
      const x = X(gx), y = Y(gy), z = bulge(i); pos.push(x, y, -z); uv.push(x, y); n++;
    }
    const tris = [];
    for (let gy = 0; gy < gh - 1; gy++) for (let gx = 0; gx < gw - 1; gx++) {
      const i00 = gy * gw + gx, i10 = i00 + 1, i01 = i00 + gw, i11 = i01 + 1;
      if (inside[i00] && inside[i10] && inside[i01] && inside[i11]) {
        const a = idxOf[i00], b = idxOf[i10], c = idxOf[i01], d = idxOf[i11];
        tris.push(a, c, b, b, c, d); // front (+z)
        const A = a + frontCount, B = b + frontCount, C = c + frontCount, D = d + frontCount;
        tris.push(A, B, C, B, D, C); // back (-z), reversed winding
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(tris);
    g.computeVertexNormals();
    return g;
  }

  // One material for the whole cleat; the drawing becomes its map when uploaded.
  const cleatMaterial = new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.52, metalness: 0.05, side: THREE.DoubleSide });
  const cleat = new THREE.Mesh(buildInflatedGeometry(), cleatMaterial);
  cleat.castShadow = true;
  cleatGroup.add(cleat);

  // Lay the cleat down (toe -> left, heel/collar -> right, sole+studs -> down),
  // then auto-center and scale to fill the viewer regardless of outline size.
  cleatGroup.rotation.z = -Math.PI / 2;
  (function fit() {
    cleatGroup.scale.setScalar(1);
    cleatGroup.position.set(0, 0, 0);
    cleatGroup.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(cleatGroup);
    const size = box.getSize(new THREE.Vector3());
    const factor = 5.4 / Math.max(size.x, size.y);
    cleatGroup.scale.setScalar(factor);
    cleatGroup.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(cleatGroup);
    const center = box.getCenter(new THREE.Vector3());
    cleatGroup.position.set(-center.x, 1.25 - center.y, -center.z);
  })();

  // Soft ground shadow to seat the cleat.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.26 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------- Applying the student's drawing ---------- */
  let sourceImage = null;          // the uploaded photo/scan, unmodified
  let sourceObjectUrl = null;
  let drawingTexture = null;
  const adjust = { flipH: false, rot: 0, fine: 0 }; // rot in 90° steps, fine in degrees
  const workCanvas = document.createElement('canvas');   // orientation-corrected image
  const detectCanvas = document.createElement('canvas'); // downscaled copy for detection

  const adjustBar = document.getElementById('cleat-adjust');
  const straightenInput = document.getElementById('cleat-straighten');
  const straightenVal = document.getElementById('cleat-straighten-val');

  // Bounding box of the largest connected blob in a 1/0 mask (4-neighbour).
  function largestComponentBox(mask, w, h) {
    const label = new Int32Array(w * h);
    let best = null, bestSize = 0, cur = 0;
    const stack = [];
    for (let start = 0; start < w * h; start++) {
      if (!mask[start] || label[start]) continue;
      cur++; let size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack.length = 0; stack.push(start); label[start] = cur;
      while (stack.length) {
        const p = stack.pop(); size++;
        const x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x + 1 < w && mask[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack.push(p + 1); }
        if (x - 1 >= 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack.push(p - 1); }
        if (y + 1 < h && mask[p + w] && !label[p + w]) { label[p + w] = cur; stack.push(p + w); }
        if (y - 1 >= 0 && mask[p - w] && !label[p - w]) { label[p - w] = cur; stack.push(p - w); }
      }
      if (size > bestSize) { bestSize = size; best = { x0, y0, x1, y1 }; }
    }
    return best;
  }

  // Locate the drawn cleat inside a (corrected) image: find the paper (largest
  // bright region) to ignore any dark desk/background, then take the largest
  // inked/colored blob inside it — the cleat — ignoring stray text/watermarks.
  // Returns fractions of the source canvas.
  function detectContentBox(srcCanvas) {
    try {
      const cap = 520;
      const s = Math.min(1, cap / Math.max(srcCanvas.width, srcCanvas.height));
      const w = Math.max(1, Math.round(srcCanvas.width * s));
      const h = Math.max(1, Math.round(srcCanvas.height * s));
      detectCanvas.width = w; detectCanvas.height = h;
      const cx = detectCanvas.getContext('2d', { willReadFrequently: true });
      cx.drawImage(srcCanvas, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      const N = w * h;
      const paper = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        paper[i] = (lum > 200 && chroma < 30) ? 1 : 0;
      }
      const paperBox = largestComponentBox(paper, w, h) || { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
      const inset = Math.round(Math.min(w, h) * 0.012);
      const content = new Uint8Array(N);
      for (let y = Math.max(0, paperBox.y0 + inset); y <= Math.min(h - 1, paperBox.y1 - inset); y++) {
        for (let x = Math.max(0, paperBox.x0 + inset); x <= Math.min(w - 1, paperBox.x1 - inset); x++) {
          const i = y * w + x;
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          content[i] = (lum < 205 || chroma > 32) ? 1 : 0;
        }
      }
      const box = largestComponentBox(content, w, h);
      if (!box) return { fx0: 0, fy0: 0, fx1: 1, fy1: 1 };
      const px = (box.x1 - box.x0) * 0.012, py = (box.y1 - box.y0) * 0.012;
      return { fx0: Math.max(0, (box.x0 - px) / w), fy0: Math.max(0, (box.y0 - py) / h), fx1: Math.min(1, (box.x1 + px) / w), fy1: Math.min(1, (box.y1 + py) / h) };
    } catch (e) {
      return { fx0: 0, fy0: 0, fx1: 1, fy1: 1 };
    }
  }

  // Map the shared outline onto the detected cleat region of the image.
  // Flip-aware: worksheet top (collar) is the image top, but textures sample
  // bottom-up, so v is inverted. Outline y runs toe(0) -> collar(max).
  function mapDrawing(texture, box) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const fw = box.fx1 - box.fx0, fh = box.fy1 - box.fy0;
    texture.repeat.set(fw / bounds.w, fh / bounds.h);
    texture.offset.set(box.fx0 - bounds.minX * (fw / bounds.w), (1 - box.fy1) - bounds.minY * (fh / bounds.h));
    texture.needsUpdate = true;
  }

  // Redraw the uploaded photo into workCanvas with the teacher's flip / rotate /
  // straighten adjustments applied, on a white background (so corners read as
  // paper, not black). This is what the detector and the texture both use.
  function renderCorrectedCanvas() {
    const img = sourceImage;
    const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    const angle = adjust.rot * Math.PI / 2 + adjust.fine * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const ow = Math.max(1, Math.ceil(sw * cos + sh * sin));
    const oh = Math.max(1, Math.ceil(sw * sin + sh * cos));
    workCanvas.width = ow; workCanvas.height = oh;
    const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ow, oh);
    ctx.save();
    ctx.translate(ow / 2, oh / 2);
    ctx.rotate(angle);
    ctx.scale(adjust.flipH ? -1 : 1, 1);
    ctx.drawImage(img, -sw / 2, -sh / 2);
    ctx.restore();
  }

  function projectDrawing() {
    if (!sourceImage) return;
    renderCorrectedCanvas();
    const box = detectContentBox(workCanvas);
    if (drawingTexture) drawingTexture.dispose();
    drawingTexture = new THREE.CanvasTexture(workCanvas);
    mapDrawing(drawingTexture, box);
    cleatMaterial.map = drawingTexture;
    cleatMaterial.color.set(0xffffff); // let the drawing show its true colors
    cleatMaterial.needsUpdate = true;
    empty.classList.add('is-ready');
    note.textContent = 'Drawing projected onto the cleat. Use Flip / Rotate / Straighten if it needs aligning.';
    note.dataset.tone = 'success';
  }

  function clearDrawing() {
    cleatMaterial.map = null;
    cleatMaterial.color.set(0xeef1f5);
    cleatMaterial.needsUpdate = true;
    if (drawingTexture) { drawingTexture.dispose(); drawingTexture = null; }
  }

  function syncAdjustUI() {
    if (straightenInput) straightenInput.value = String(adjust.fine);
    if (straightenVal) straightenVal.textContent = `${adjust.fine}°`;
  }
  function showAdjustBar(show) { if (adjustBar) adjustBar.hidden = !show; }

  function loadFromInput() {
    const file = templateInput.files[0];
    if (!file) return false;
    if (!/^image\//.test(file.type)) {
      note.textContent = `Staged “${file.name}”. For the 3D preview, upload a photo/scan (PNG or JPG) of the drawing.`;
      note.dataset.tone = 'info';
      return false;
    }
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
    sourceObjectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      adjust.flipH = false; adjust.rot = 0; adjust.fine = 0;
      syncAdjustUI(); showAdjustBar(true);
      projectDrawing();
    };
    img.onerror = () => {
      note.textContent = 'That file could not be read as an image. Use a photo, PNG, or JPG of the worksheet.';
      note.dataset.tone = 'info';
    };
    img.src = sourceObjectUrl;
    return true;
  }
  templateInput.addEventListener('change', loadFromInput);

  // Adjust controls (only meaningful once a photo is loaded).
  let straightenRaf = 0;
  document.getElementById('cleat-flip')?.addEventListener('click', () => { adjust.flipH = !adjust.flipH; projectDrawing(); });
  document.getElementById('cleat-rotate')?.addEventListener('click', () => { adjust.rot = (adjust.rot + 1) % 4; projectDrawing(); });
  document.getElementById('cleat-adjust-reset')?.addEventListener('click', () => { adjust.flipH = false; adjust.rot = 0; adjust.fine = 0; syncAdjustUI(); projectDrawing(); });
  straightenInput?.addEventListener('input', () => {
    adjust.fine = Number(straightenInput.value) || 0;
    if (straightenVal) straightenVal.textContent = `${adjust.fine}°`;
    if (straightenRaf) cancelAnimationFrame(straightenRaf);
    straightenRaf = requestAnimationFrame(projectDrawing);
  });

  /* ---------- Color controls (base cleat color + edge accent) ---------- */
  const namedColor = value => {
    if (!value) return null;
    const probe = new THREE.Color();
    try { probe.set(value.trim().toLowerCase().replace(/\s+/g, '')); return probe; }
    catch (e) { return null; }
  };
  function applyColors() {
    const primary = namedColor(document.getElementById('cleat-primary').value);
    if (primary && !cleatMaterial.map) cleatMaterial.color.copy(primary);
  }

  /* ---------- Interaction ---------- */
  let dragging = false, lastX = 0, rotation = 0;
  function resize() {
    const box = host.getBoundingClientRect();
    const width = Math.max(1, box.width), height = Math.max(1, box.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  function updateAngle() {
    const degrees = Math.round(((rotation * 180 / Math.PI) % 360 + 360) % 360);
    angleLabel.textContent = `Angle ${degrees}°`;
  }
  host.addEventListener('pointerdown', event => {
    dragging = true; lastX = event.clientX;
    host.setPointerCapture(event.pointerId); host.classList.add('is-dragging');
  });
  host.addEventListener('pointermove', event => {
    if (!dragging) return;
    rotation += (event.clientX - lastX) * 0.012; lastX = event.clientX;
    stage.rotation.y = rotation; updateAngle();
  });
  host.addEventListener('pointerup', event => {
    dragging = false; host.releasePointerCapture(event.pointerId); host.classList.remove('is-dragging');
  });
  host.addEventListener('pointercancel', () => { dragging = false; host.classList.remove('is-dragging'); });
  new ResizeObserver(resize).observe(host);
  resize(); updateAngle();

  document.getElementById('cleat-preview').addEventListener('click', () => {
    const student = document.getElementById('cleat-student-name').value.trim();
    const team = document.getElementById('cleat-team').value.trim();
    const cause = document.getElementById('cleat-cause').value.trim();
    name.textContent = student ? `${student}'s cleat` : 'Generic football cleat';
    meta.textContent = [team, cause].filter(Boolean).join(' · ') || 'Drag the cleat to rotate it.';
    applyColors();
    if (sourceImage) {
      projectDrawing();
    } else {
      empty.classList.add('is-ready');
      note.textContent = 'Preview staged privately with your colors. Add a worksheet photo to project the drawing.';
      note.dataset.tone = 'success';
    }
  });

  document.getElementById('cleat-reset').addEventListener('click', () => {
    ['cleat-student-name', 'cleat-team', 'cleat-cause', 'cleat-primary', 'cleat-secondary', 'cleat-notes'].forEach(id => { document.getElementById(id).value = ''; });
    templateInput.value = ''; modelInput.value = '';
    if (sourceObjectUrl) { URL.revokeObjectURL(sourceObjectUrl); sourceObjectUrl = null; }
    sourceImage = null;
    adjust.flipH = false; adjust.rot = 0; adjust.fine = 0;
    syncAdjustUI(); showAdjustBar(false);
    clearDrawing();
    cleatMaterial.color.set(0xeef1f5);
    rotation = 0; stage.rotation.y = 0;
    name.textContent = 'Generic football cleat';
    meta.textContent = 'Drag the cleat to rotate it.';
    empty.classList.remove('is-ready');
    note.textContent = ''; updateAngle();
  });

  modelInput.addEventListener('change', () => {
    if (modelInput.files[0]) {
      note.textContent = `Model selected: ${modelInput.files[0].name}. GLB loading will be connected when the final model is ready.`;
      note.dataset.tone = 'info';
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    if (!dragging) { rotation += 0.0016; stage.rotation.y = rotation; }
    updateAngle();
    renderer.render(scene, camera);
  }
  animate();
})();
