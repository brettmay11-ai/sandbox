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
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.7, 8.4);
  camera.lookAt(0, 1.35, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x101827, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5aa8ff, 1.7);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  // stage = user drag rotation (spin around Y to see both painted sides)
  const stage = new THREE.Group();
  scene.add(stage);
  // cleatGroup = the shoe itself, laid down naturally and auto-centered
  const cleatGroup = new THREE.Group();
  stage.add(cleatGroup);

  const outline = buildOutlineShape();

  // 1) Solid 3D body (thickness + beveled edge). Base/primary color.
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe9edf4, roughness: 0.66, metalness: 0.06 });
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 }),
    bodyMaterial
  );
  body.position.z = -DEPTH / 2;
  cleatGroup.add(body);

  // 2) Artwork decals — flat panels shaped exactly like the outline, one on
  //    each visible side. The student's drawing is painted here. ShapeGeometry
  //    UVs equal vertex x,y, so we normalize the texture to the outline's
  //    bounding box and the art lands precisely inside the silhouette.
  function makeDecalMaterial() {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, metalness: 0.03, transparent: true, opacity: 0, side: THREE.DoubleSide });
  }
  const decalFrontMat = makeDecalMaterial();
  const decalBackMat = makeDecalMaterial();
  const decalFront = new THREE.Mesh(new THREE.ShapeGeometry(outline), decalFrontMat);
  decalFront.position.z = DEPTH / 2 + 0.05;
  cleatGroup.add(decalFront);
  const decalBack = new THREE.Mesh(new THREE.ShapeGeometry(outline), decalBackMat);
  decalBack.position.z = -DEPTH / 2 - 0.05;
  decalBack.rotation.y = Math.PI; // face outward on the far side (mirrors the art, like a real shoe)
  cleatGroup.add(decalBack);

  // Lay the cleat down (toe -> left, heel/collar -> right, sole+studs -> down),
  // then auto-center and scale to fill the viewer regardless of outline size.
  cleatGroup.rotation.z = -Math.PI / 2;
  (function fit() {
    cleatGroup.scale.setScalar(1);
    cleatGroup.position.set(0, 0, 0);
    cleatGroup.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(cleatGroup);
    const size = box.getSize(new THREE.Vector3());
    const factor = 5.6 / Math.max(size.x, size.y);
    cleatGroup.scale.setScalar(factor);
    cleatGroup.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(cleatGroup);
    const center = box.getCenter(new THREE.Vector3());
    cleatGroup.position.set(-center.x, 1.35 - center.y, -center.z);
  })();

  /* ---------- Applying the student's drawing ---------- */
  const loader = new THREE.TextureLoader();
  let currentObjectUrl = null;

  // Find the drawn cleat inside an uploaded photo/scan: the bounding box of
  // non-white (inked or colored) pixels, ignoring the bottom-right watermark.
  // Returns fractions of the image so we can map onto any crop or zoom.
  function detectContentBox(image) {
    try {
      const cap = 500;
      const s = Math.min(1, cap / Math.max(image.width, image.height));
      const w = Math.max(1, Math.round((image.width || image.naturalWidth) * s));
      const h = Math.max(1, Math.round((image.height || image.naturalHeight) * s));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(image, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      let minx = w, miny = h, maxx = 0, maxy = 0, found = false;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const isContent = lum < 232 || chroma > 24;
        const inWatermark = x > w * 0.72 && y > h * 0.93;
        if (isContent && !inWatermark) { found = true; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      }
      if (!found) return { fx0: 0, fy0: 0, fx1: 1, fy1: 1 };
      const px = (maxx - minx) * 0.01, py = (maxy - miny) * 0.01;
      return { fx0: Math.max(0, (minx - px) / w), fy0: Math.max(0, (miny - py) / h), fx1: Math.min(1, (maxx + px) / w), fy1: Math.min(1, (maxy + py) / h) };
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

  function applyDrawing(url) {
    loader.load(url, texture => {
      mapDrawing(texture, detectContentBox(texture.image));
      [decalFrontMat, decalBackMat].forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.map = texture;
        mat.opacity = 1;
        mat.needsUpdate = true;
      });
      empty.classList.add('is-ready');
      note.textContent = 'Drawing projected onto the cleat. Drag to see both sides.';
      note.dataset.tone = 'success';
    }, undefined, () => {
      note.textContent = 'That file could not be read as an image. Use a photo, PNG, or JPG of the worksheet.';
      note.dataset.tone = 'info';
    });
  }
  function clearDrawing() {
    [decalFrontMat, decalBackMat].forEach(mat => {
      if (mat.map) { mat.map.dispose(); mat.map = null; }
      mat.opacity = 0;
      mat.needsUpdate = true;
    });
  }
  function loadFromInput() {
    const file = templateInput.files[0];
    if (!file) return false;
    if (!/^image\//.test(file.type)) {
      note.textContent = `Staged “${file.name}”. For the 3D preview, upload a photo/scan (PNG or JPG) of the drawing.`;
      note.dataset.tone = 'info';
      return false;
    }
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    applyDrawing(currentObjectUrl);
    return true;
  }
  templateInput.addEventListener('change', loadFromInput);

  /* ---------- Color controls (base cleat color + edge accent) ---------- */
  const namedColor = value => {
    if (!value) return null;
    const probe = new THREE.Color();
    try { probe.set(value.trim().toLowerCase().replace(/\s+/g, '')); return probe; }
    catch (e) { return null; }
  };
  function applyColors() {
    const primary = namedColor(document.getElementById('cleat-primary').value);
    if (primary) bodyMaterial.color.copy(primary);
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
    const staged = loadFromInput();
    if (!staged) {
      empty.classList.add('is-ready');
      note.textContent = templateInput.files[0]
        ? `Template staged: ${templateInput.files[0].name}`
        : 'Preview staged privately with your colors. Add a worksheet photo to project the drawing.';
      note.dataset.tone = 'success';
    }
  });

  document.getElementById('cleat-reset').addEventListener('click', () => {
    ['cleat-student-name', 'cleat-team', 'cleat-cause', 'cleat-primary', 'cleat-secondary', 'cleat-notes'].forEach(id => { document.getElementById(id).value = ''; });
    templateInput.value = ''; modelInput.value = '';
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    clearDrawing();
    bodyMaterial.color.set(0xe9edf4);
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
