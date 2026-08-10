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

  const outline = new THREE.Shape();
  outline.moveTo(-2.55, 0.32);
  outline.lineTo(-2.95, 0.55);
  outline.quadraticCurveTo(-3.05, 0.75, -2.8, 1.0);
  outline.lineTo(-2.1, 1.45);
  outline.lineTo(-1.55, 2.05);
  outline.quadraticCurveTo(-1.15, 2.65, -0.35, 2.95);
  outline.lineTo(0.62, 3.05);
  outline.lineTo(1.08, 2.82);
  outline.lineTo(1.25, 2.3);
  outline.lineTo(1.22, 1.2);
  outline.lineTo(1.55, 0.8);
  outline.lineTo(2.55, 0.55);
  outline.lineTo(2.72, 0.32);
  outline.lineTo(1.85, 0.08);
  outline.lineTo(-1.25, 0.06);
  outline.closePath();

  const upper = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, { depth: 1.36, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.08, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: 0x2d6cdf, roughness: 0.68, metalness: 0.08 })
  );
  upper.position.z = -0.68;
  stage.add(upper);

  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(5.45, 0.26, 1.58),
    new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.45 })
  );
  sole.position.set(-0.05, 0.03, 0);
  stage.add(sole);

  const studMaterial = new THREE.MeshStandardMaterial({ color: 0xe94d4d, roughness: 0.55 });
  [-2.0, -0.85, 0.45, 1.55, 2.35].forEach((x, index) => {
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 5), studMaterial);
    stud.position.set(x, -0.37, index % 2 ? 0.42 : -0.42);
    stud.rotation.x = Math.PI;
    stage.add(stud);
  });

  const laceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  [-1.85, -1.55, -1.25, -0.95, -0.65].forEach((x, index) => {
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.055, 0.08), laceMaterial);
    lace.position.set(x, 1.52 + index * 0.12, 0.72);
    lace.rotation.z = index % 2 ? -0.12 : 0.12;
    stage.add(lace);
  });

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x102f68, roughness: 0.9 })
  );
  panel.position.set(0.1, 1.6, 0.71);
  panel.rotation.x = -0.02;
  stage.add(panel);

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
    empty.classList.add('is-ready');
    note.textContent = templateInput.files[0] ? `Template staged: ${templateInput.files[0].name}` : 'Preview staged privately. Nothing has been published.';
    note.dataset.tone = 'success';
  });
  document.getElementById('cleat-reset').addEventListener('click', () => {
    ['cleat-student-name', 'cleat-team', 'cleat-cause', 'cleat-primary', 'cleat-secondary', 'cleat-notes'].forEach(id => { document.getElementById(id).value = ''; });
    templateInput.value = '';
    modelInput.value = '';
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
