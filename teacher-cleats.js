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
     This is the single side-view silhouette that EVERY cleat is
     built from. The 3D body is extruded from it AND the student's
     drawing is projected onto it, so whatever you print on the
     paper worksheet must trace this exact outline. Swap these
     points to match the worksheet and the drawing will line up.
     Coordinates are in "cleat units": x runs heel(-) to toe(+),
     y runs sole(0) to top-of-ankle. Keep the shape closed.
     ============================================================ */
  const CLEAT_OUTLINE = [
    ['move', -2.55, 0.32],   // heel, bottom
    ['line', -2.95, 0.55],   // heel back
    ['quad', -3.05, 0.75, -2.8, 1.0],
    ['line', -2.1, 1.45],    // heel counter up to ankle collar
    ['line', -1.55, 2.05],
    ['quad', -1.15, 2.65, -0.35, 2.95], // ankle collar top
    ['line', 0.62, 3.05],
    ['line', 1.08, 2.82],    // tongue / instep
    ['line', 1.25, 2.3],
    ['line', 1.22, 1.2],     // vamp
    ['line', 1.55, 0.8],
    ['line', 2.55, 0.55],    // toe box
    ['line', 2.72, 0.32],    // toe tip, bottom
    ['line', 1.85, 0.08],
    ['line', -1.25, 0.06],   // sole line back toward heel
    ['close']
  ];

  function buildOutlineShape() {
    const shape = new THREE.Shape();
    for (const cmd of CLEAT_OUTLINE) {
      if (cmd[0] === 'move') shape.moveTo(cmd[1], cmd[2]);
      else if (cmd[0] === 'line') shape.lineTo(cmd[1], cmd[2]);
      else if (cmd[0] === 'quad') shape.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4]);
      else if (cmd[0] === 'close') shape.closePath();
    }
    return shape;
  }

  // Bounding box of the outline — used to normalize the drawing so the
  // student's artwork maps 1:1 onto the shoe silhouette.
  function outlineBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of CLEAT_OUTLINE) {
      for (let i = 1; i < cmd.length; i += 2) {
        const x = cmd[i], y = cmd[i + 1];
        if (typeof x !== 'number') continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  const bounds = outlineBounds();
  const DEPTH = 1.36; // width of the shoe (extrusion depth)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(4.5, 2.7, 6.5);
  camera.lookAt(0, 1.35, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const stage = new THREE.Group();
  stage.rotation.y = -0.35;
  scene.add(stage);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x101827, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.5);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5aa8ff, 1.8);
  rim.position.set(-4, 2, -5);
  scene.add(rim);

  /* ---------- The cleat, all built from CLEAT_OUTLINE ---------- */
  const outline = buildOutlineShape();

  // 1) The solid 3D body (gives thickness + beveled edges). Its color is the
  //    student's primary color; it shows at the shoe's edges and as a base.
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2d6cdf, roughness: 0.62, metalness: 0.08 });
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.08, bevelSegments: 2 }),
    bodyMaterial
  );
  body.position.z = -DEPTH / 2;
  stage.add(body);

  // 2) Two "artwork decals": flat panels shaped exactly like the outline,
  //    sitting on each visible side of the shoe. The student's drawing is
  //    painted onto these. Because ShapeGeometry UVs equal the vertex x,y,
  //    we normalize the drawing texture to the outline's bounding box so it
  //    lands precisely inside the silhouette.
  function makeDecalMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.72, metalness: 0.04,
      transparent: true, opacity: 0 // invisible until a drawing is applied
    });
  }
  const decalFrontMat = makeDecalMaterial();
  const decalBackMat = makeDecalMaterial();

  const decalFront = new THREE.Mesh(new THREE.ShapeGeometry(outline), decalFrontMat);
  decalFront.position.z = DEPTH / 2 + 0.02;
  stage.add(decalFront);

  const decalBack = new THREE.Mesh(new THREE.ShapeGeometry(outline), decalBackMat);
  decalBack.position.z = -DEPTH / 2 - 0.02;
  decalBack.rotation.y = Math.PI; // face outward on the far side (mirrors the art, like a real shoe's other side)
  stage.add(decalBack);

  // 3) Sole / midsole
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(5.45, 0.26, DEPTH + 0.22),
    new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.45 })
  );
  sole.position.set(-0.05, 0.03, 0);
  stage.add(sole);

  // 4) Studs (secondary color)
  const studMaterial = new THREE.MeshStandardMaterial({ color: 0xe94d4d, roughness: 0.55 });
  [-2.0, -0.85, 0.45, 1.55, 2.35].forEach((x, index) => {
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), studMaterial);
    stud.position.set(x, -0.37, index % 2 ? 0.42 : -0.42);
    stud.rotation.x = Math.PI;
    stage.add(stud);
  });

  /* ---------- Applying the student's drawing ---------- */
  const loader = new THREE.TextureLoader();
  let currentObjectUrl = null;

  function normalizeDrawing(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // Map the outline's bounding box onto the image's 0..1 range so the
    // drawing sits exactly inside the silhouette.
    texture.repeat.set(1 / bounds.w, 1 / bounds.h);
    texture.offset.set(-bounds.minX / bounds.w, -bounds.minY / bounds.h);
    texture.needsUpdate = true;
  }

  function applyDrawing(url) {
    loader.load(url, texture => {
      normalizeDrawing(texture);
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

  // Live-apply the moment a worksheet photo is chosen.
  templateInput.addEventListener('change', loadFromInput);

  /* ---------- Color controls (used as the base when there's no drawing,
     and as edge/stud accents even when there is) ---------- */
  const namedColor = value => {
    if (!value) return null;
    const probe = new THREE.Color();
    try { probe.set(value.trim().toLowerCase().replace(/\s+/g, '')); return probe; }
    catch (e) { return null; }
  };
  function applyColors() {
    const primary = namedColor(document.getElementById('cleat-primary').value);
    const secondary = namedColor(document.getElementById('cleat-secondary').value);
    if (primary) bodyMaterial.color.copy(primary);
    if (secondary) studMaterial.color.copy(secondary);
  }

  /* ---------- Interaction ---------- */
  let dragging = false;
  let lastX = 0;
  let rotation = -0.35;
  function resize() {
    const box = host.getBoundingClientRect();
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  function updateAngle() {
    const degrees = Math.round(((rotation * 180 / Math.PI) % 360 + 360) % 360);
    angleLabel.textContent = `Angle ${degrees}°`;
  }
  host.addEventListener('pointerdown', event => {
    dragging = true;
    lastX = event.clientX;
    host.setPointerCapture(event.pointerId);
    host.classList.add('is-dragging');
  });
  host.addEventListener('pointermove', event => {
    if (!dragging) return;
    rotation += (event.clientX - lastX) * 0.012;
    lastX = event.clientX;
    stage.rotation.y = rotation;
    updateAngle();
  });
  host.addEventListener('pointerup', event => {
    dragging = false;
    host.releasePointerCapture(event.pointerId);
    host.classList.remove('is-dragging');
  });
  host.addEventListener('pointercancel', () => { dragging = false; host.classList.remove('is-dragging'); });
  new ResizeObserver(resize).observe(host);
  resize();
  updateAngle();

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
    templateInput.value = '';
    modelInput.value = '';
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    clearDrawing();
    bodyMaterial.color.set(0x2d6cdf);
    studMaterial.color.set(0xe94d4d);
    rotation = -0.35;
    stage.rotation.y = rotation;
    name.textContent = 'Generic football cleat';
    meta.textContent = 'Drag the cleat to rotate it.';
    empty.classList.remove('is-ready');
    note.textContent = '';
    updateAngle();
  });

  modelInput.addEventListener('change', () => {
    if (modelInput.files[0]) {
      note.textContent = `Model selected: ${modelInput.files[0].name}. GLB loading will be connected when the final model is ready.`;
      note.dataset.tone = 'info';
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    if (!dragging) stage.rotation.y += 0.0018;
    rotation = stage.rotation.y;
    updateAngle();
    renderer.render(scene, camera);
  }
  animate();
})();
