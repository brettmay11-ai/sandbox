import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const page = document.querySelector('[data-teacher-page="cleats"]');

if (page) {
  const cleatStyles = document.createElement('link');
  cleatStyles.rel = 'stylesheet';
  cleatStyles.href = 'cleat-studio.css?v=2';
  document.head.appendChild(cleatStyles);

  const host = document.getElementById('cleat-viewer');
  const empty = document.getElementById('cleat-viewer-empty');
  const previewName = document.getElementById('cleat-preview-name');
  const previewMeta = document.getElementById('cleat-preview-meta');
  const angleLabel = document.getElementById('cleat-viewer-angle');
  const note = document.getElementById('cleat-upload-note');
  const modelInput = document.getElementById('cleat-model');
  const templateInput = document.getElementById('cleat-template');
  templateInput.accept = 'image/png,image/jpeg,.pdf';
  const artworkControls = document.createElement('div');
  artworkControls.className = 'cleat-artwork-controls';
  artworkControls.id = 'cleat-artwork-controls';
  artworkControls.hidden = true;
  artworkControls.innerHTML = `<div class="cleat-artwork-controls-head"><span><iconify-icon icon="lucide:scan-line"></iconify-icon>Artwork placement</span><div><label class="cleat-mirror-toggle"><input id="cleat-artwork-mirror" type="checkbox" checked>Inside fallback</label><button type="button" id="cleat-artwork-rotate" class="cleat-artwork-remove" title="Rotate artwork 180 degrees"><iconify-icon icon="lucide:rotate-cw"></iconify-icon></button><button type="button" id="cleat-artwork-remove" class="cleat-artwork-remove" title="Remove artwork"><iconify-icon icon="lucide:x"></iconify-icon></button></div></div><div class="cleat-placement-grid"><label><span>Left / right</span><input type="range" data-cleat-placement="x" min="-20" max="20" value="0"></label><label><span>Up / down</span><input type="range" data-cleat-placement="y" min="-20" max="20" value="0"></label><label><span>Size</span><input type="range" data-cleat-placement="scale" min="70" max="125" value="100"></label><label><span>Turn</span><input type="range" data-cleat-placement="rotation" min="-20" max="20" value="0"></label></div><div class="cleat-inside-generator"><div class="cleat-inside-head"><span><iconify-icon icon="lucide:sparkles"></iconify-icon>Inside design</span><strong id="cleat-inside-state">Mirrored outside</strong></div><p>Create a coordinated inside from the student’s original drawing, then inspect it on the cleat.</p><div class="cleat-inside-actions"><button type="button" id="cleat-generate-inside" class="cleat-generate-action"><iconify-icon icon="lucide:sparkles"></iconify-icon><span>Generate inside</span></button><button type="button" id="cleat-view-inside" class="cleat-inside-secondary" hidden><iconify-icon icon="lucide:rotate-3d"></iconify-icon>View inside</button><button type="button" id="cleat-approve-inside" class="cleat-inside-secondary" hidden><iconify-icon icon="lucide:check"></iconify-icon>Approve</button><button type="button" id="cleat-remove-inside" class="cleat-artwork-remove" title="Remove generated inside" hidden><iconify-icon icon="lucide:trash-2"></iconify-icon></button></div></div>`;
  templateInput.closest('.cleat-wide-field').insertAdjacentElement('afterend', artworkControls);
  artworkControls.querySelector('.cleat-placement-grid')?.remove();
  document.getElementById('cleat-artwork-rotate')?.remove();
  artworkControls.querySelector('.cleat-artwork-controls-head > span').innerHTML = '<iconify-icon icon="lucide:layers-3"></iconify-icon>Material texture';
  const mirrorInput = document.getElementById('cleat-artwork-mirror');
  const generateInsideButton = document.getElementById('cleat-generate-inside');
  const generateInsideLabel = generateInsideButton.querySelector('span');
  const viewInsideButton = document.getElementById('cleat-view-inside');
  const approveInsideButton = document.getElementById('cleat-approve-inside');
  const removeInsideButton = document.getElementById('cleat-remove-inside');
  const insideState = document.getElementById('cleat-inside-state');
  const insideUploadLabel = document.createElement('label');
  insideUploadLabel.className = 'cleat-inside-secondary cleat-inside-upload';
  insideUploadLabel.innerHTML = '<iconify-icon icon="lucide:upload"></iconify-icon>Upload inside<input id="cleat-inside-upload" type="file" accept="image/png,image/jpeg,.pdf">';
  generateInsideButton.insertAdjacentElement('beforebegin', insideUploadLabel);
  const insideArtworkInput = document.getElementById('cleat-inside-upload');
  const defaultModelUrl = 'assets/models/red-chaos-cleat.glb';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xf8fbff, 0x252a32, 2.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
  keyLight.position.set(-4, 7, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0003;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xdce9ff, 2.4);
  rimLight.position.set(5, 3, -5);
  scene.add(rimLight);

  const stage = new THREE.Group();
  scene.add(stage);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.35 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const loader = new GLTFLoader();
  let currentModel = null;
  let modelMesh = null;
  let modelBounds = null;
  let currentObjectUrl = null;
  let outsideArtworkCanvas = null;
  let artworkReferenceCanvas = null;
  let insideArtworkCanvas = null;
  let bakedArtworkTexture = null;
  let insideApproved = false;
  let generatingInside = false;
  let bakeTimer = null;
  let bakeGeneration = 0;
  let mirrorInside = true;
  let rotation = -0.18;
  let cameraDistance = 6.5;
  let framedSize = null;
  let cameraTargetY = 0;
  let zoom = 1;
  let dragging = false;
  let lastPointerX = 0;
  let lastInteraction = performance.now();

  function setStatus(message, tone = '') {
    note.textContent = message;
    note.dataset.tone = tone;
  }

  function disposeModel(model) {
    model.traverse(child => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (!material) return;
        Object.values(material).forEach(value => {
          if (value?.isTexture) value.dispose();
        });
        material.dispose();
      });
    });
  }

  function clearCurrentModel() {
    if (!currentModel) return;
    applyModelTexture(null);
    stage.remove(currentModel);
    disposeModel(currentModel);
    currentModel = null;
    modelMesh = null;
    modelBounds = null;
  }

  function prepareModel(model) {
    stage.rotation.y = 0;
    let largestMesh = null;
    let largestVertexCount = 0;
    model.traverse(child => {
      if (!child.isMesh) return;
      const vertexCount = child.geometry?.attributes?.position?.count || 0;
      if (vertexCount > largestVertexCount) {
        largestVertexCount = vertexCount;
        largestMesh = child;
      }
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (!material) return;
        material.side = THREE.FrontSide;
        if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        material.needsUpdate = true;
      });
    });

    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(model);
    const naturalSize = box.getSize(new THREE.Vector3());
    const scale = 5.5 / Math.max(naturalSize.x, naturalSize.y, naturalSize.z);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    model.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const displayCenter = box.getCenter(new THREE.Vector3());
    modelMesh = largestMesh;
    modelBounds = box.clone();
    ground.position.y = box.min.y - 0.035;

    framedSize = size;
    cameraTargetY = displayCenter.y;
    zoom = 1;
    frameCamera();

    stage.rotation.y = rotation;
    if (outsideArtworkCanvas) scheduleTextureBake();
    return { size, center: displayCenter };
  }

  function frameCamera() {
    if (!framedSize) return;
    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontalFit = framedSize.x / (2 * halfFovTan * Math.max(camera.aspect, 0.45));
    const verticalFit = framedSize.y / (2 * halfFovTan);
    cameraDistance = Math.max(horizontalFit, verticalFit) * 1.22 * zoom;
    camera.position.set(0, cameraTargetY + framedSize.y * 0.06, cameraDistance);
    camera.lookAt(0, cameraTargetY, 0);
    camera.near = Math.max(0.01, cameraDistance / 100);
    camera.far = cameraDistance * 10;
    camera.updateProjectionMatrix();
  }

  function applyModelTexture(texture) {
    if (!currentModel) return;
    currentModel.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (!material) return;
        if (!material.userData.cleatOriginal) {
          material.userData.cleatOriginal = {
            map: material.map,
            color: material.color?.clone(),
            roughness: material.roughness
          };
        }
        const original = material.userData.cleatOriginal;
        material.map = texture || original.map;
        if (material.color && original.color) material.color.copy(texture ? new THREE.Color(0xffffff) : original.color);
        if (typeof material.roughness === 'number') material.roughness = texture ? 0.74 : original.roughness;
        material.needsUpdate = true;
      });
    });
  }

  function bakeMaterialTexture(outsideCanvas, insideCanvas) {
    if (!modelMesh?.geometry?.attributes?.uv || !modelBounds) return null;
    const previousRotation = stage.rotation.y;
    stage.rotation.y = 0;
    scene.updateMatrixWorld(true);
    const textureSize = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const output = context.createImageData(textureSize, textureSize);
    const pixels = output.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 244;
      pixels[offset + 1] = 245;
      pixels[offset + 2] = 247;
      pixels[offset + 3] = 255;
    }

    const sourceData = source => {
      const sourceContext = source.getContext('2d', { willReadFrequently: true });
      return { width: source.width, height: source.height, pixels: sourceContext.getImageData(0, 0, source.width, source.height).data };
    };
    const outside = sourceData(outsideCanvas);
    const inside = sourceData(insideCanvas || outsideCanvas);
    const geometry = modelMesh.geometry;
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index;
    const vertexCount = positions.count;
    const worldPositions = new Float32Array(vertexCount * 3);
    const vertex = new THREE.Vector3();
    for (let index = 0; index < vertexCount; index++) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(modelMesh.matrixWorld);
      worldPositions[index * 3] = vertex.x;
      worldPositions[index * 3 + 1] = vertex.y;
      worldPositions[index * 3 + 2] = vertex.z;
    }

    const size = modelBounds.getSize(new THREE.Vector3());
    const center = modelBounds.getCenter(new THREE.Vector3());
    const triangleCount = indices ? indices.count / 3 : positions.count / 3;
    const getIndex = offset => indices ? indices.getX(offset) : offset;

    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const ids = [getIndex(triangle * 3), getIndex(triangle * 3 + 1), getIndex(triangle * 3 + 2)];
      const tx = ids.map(id => uvs.getX(id) * (textureSize - 1));
      const ty = ids.map(id => uvs.getY(id) * (textureSize - 1));
      const denominator = (ty[1] - ty[2]) * (tx[0] - tx[2]) + (tx[2] - tx[1]) * (ty[0] - ty[2]);
      if (Math.abs(denominator) < 0.00001) continue;
      const minX = Math.max(0, Math.floor(Math.min(...tx)));
      const maxX = Math.min(textureSize - 1, Math.ceil(Math.max(...tx)));
      const minY = Math.max(0, Math.floor(Math.min(...ty)));
      const maxY = Math.min(textureSize - 1, Math.ceil(Math.max(...ty)));
      const averageZ = ids.reduce((sum, id) => sum + worldPositions[id * 3 + 2], 0) / 3;
      const isOutside = averageZ < center.z;
      const source = isOutside ? outside : inside;

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const sampleX = px + 0.5;
          const sampleY = py + 0.5;
          const w0 = ((ty[1] - ty[2]) * (sampleX - tx[2]) + (tx[2] - tx[1]) * (sampleY - ty[2])) / denominator;
          const w1 = ((ty[2] - ty[0]) * (sampleX - tx[2]) + (tx[0] - tx[2]) * (sampleY - ty[2])) / denominator;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;

          const worldX = ids.reduce((sum, id, index) => sum + worldPositions[id * 3] * [w0, w1, w2][index], 0);
          const worldY = ids.reduce((sum, id, index) => sum + worldPositions[id * 3 + 1] * [w0, w1, w2][index], 0);
          const modelU = THREE.MathUtils.clamp((worldX - modelBounds.min.x) / size.x, 0, 1);
          const designU = isOutside ? 1 - modelU : modelU;
          const designV = 1 - THREE.MathUtils.clamp((worldY - modelBounds.min.y) / size.y, 0, 1);
          const sx = Math.min(source.width - 1, Math.max(0, Math.round(designU * (source.width - 1))));
          const sy = Math.min(source.height - 1, Math.max(0, Math.round(designV * (source.height - 1))));
          const sourceOffset = (sy * source.width + sx) * 4;
          const targetIndex = py * textureSize + px;
          const targetOffset = targetIndex * 4;
          const alpha = source.pixels[sourceOffset + 3] / 255;
          if (alpha > 0.01) {
            pixels[targetOffset] = Math.round(source.pixels[sourceOffset] * alpha + 244 * (1 - alpha));
            pixels[targetOffset + 1] = Math.round(source.pixels[sourceOffset + 1] * alpha + 245 * (1 - alpha));
            pixels[targetOffset + 2] = Math.round(source.pixels[sourceOffset + 2] * alpha + 247 * (1 - alpha));
          }
        }
      }
    }

    context.putImageData(output, 0, 0);
    stage.rotation.y = previousRotation;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }

  function scheduleTextureBake() {
    window.clearTimeout(bakeTimer);
    const generation = ++bakeGeneration;
    if (!outsideArtworkCanvas || !modelMesh) return;
    setStatus('Wrapping the artwork into the cleat material...', 'info');
    bakeTimer = window.setTimeout(() => {
      let insideSource = insideArtworkCanvas;
      if (!insideSource && mirrorInside) insideSource = outsideArtworkCanvas;
      if (!insideSource) {
        insideSource = document.createElement('canvas');
        insideSource.width = outsideArtworkCanvas.width;
        insideSource.height = outsideArtworkCanvas.height;
      }
      const texture = bakeMaterialTexture(outsideArtworkCanvas, insideSource);
      if (!texture || generation !== bakeGeneration) {
        texture?.dispose();
        return;
      }
      bakedArtworkTexture?.dispose();
      bakedArtworkTexture = texture;
      applyModelTexture(texture);
      setStatus('Artwork is baked into the cleat material. Rotate to inspect every surface.', 'success');
    }, 80);
  }

  function largestInkBox(canvas) {
    const cap = 720;
    const scale = Math.min(1, cap / Math.max(canvas.width, canvas.height));
    const width = Math.max(1, Math.round(canvas.width * scale));
    const height = Math.max(1, Math.round(canvas.height * scale));
    const scan = document.createElement('canvas');
    scan.width = width;
    scan.height = height;
    const context = scan.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const ink = new Uint8Array(width * height);

    for (let index = 0; index < ink.length; index++) {
      const offset = index * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const darkest = Math.min(r, g, b);
      const colorRange = Math.max(r, g, b) - darkest;
      ink[index] = darkest < 218 || colorRange > 26 ? 1 : 0;
    }

    const visited = new Uint8Array(ink.length);
    const queue = new Int32Array(ink.length);
    let best = null;
    let bestSize = 0;

    for (let start = 0; start < ink.length; start++) {
      if (!ink[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      queue[tail++] = start;
      visited[start] = 1;

      while (head < tail) {
        const point = queue[head++];
        const x = point % width;
        const y = Math.floor(point / width);
        count++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        const neighbors = [point - 1, point + 1, point - width, point + width];
        for (const next of neighbors) {
          if (next < 0 || next >= ink.length || visited[next] || !ink[next]) continue;
          if ((next === point - 1 || next === point + 1) && Math.floor(next / width) !== y) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const score = count + boxWidth * boxHeight * 0.02;
      if (score > bestSize && boxWidth > width * 0.12 && boxHeight > height * 0.12) {
        bestSize = score;
        best = { minX, minY, maxX, maxY };
      }
    }

    if (!best) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const padding = Math.max(best.maxX - best.minX, best.maxY - best.minY) * 0.025;
    const x0 = Math.max(0, best.minX - padding);
    const y0 = Math.max(0, best.minY - padding);
    const x1 = Math.min(width, best.maxX + padding);
    const y1 = Math.min(height, best.maxY + padding);
    return {
      x: x0 / scale,
      y: y0 / scale,
      width: (x1 - x0) / scale,
      height: (y1 - y0) / scale
    };
  }

  function makePageBackgroundTransparent(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let point = 0; point < canvas.width * canvas.height; point++) {
      const offset = point * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const brightest = Math.max(r, g, b);
      const darkest = Math.min(r, g, b);
      const colorRange = brightest - darkest;
      const saturation = brightest ? colorRange / brightest : 0;
      if (darkest > 238 || colorRange < 24 || saturation < 0.18) {
        pixels[offset + 3] = 0;
      } else {
        const colorStrength = Math.min(colorRange - 20, (saturation - 0.14) * 320);
        pixels[offset + 3] = Math.min(255, Math.max(0, colorStrength * 12));
      }
    }
    context.putImageData(image, 0, 0);
  }

  function prepareArtwork(source) {
    const crop = largestInkBox(source);
    const rotate = crop.height > crop.width;
    const naturalWidth = rotate ? crop.height : crop.width;
    const naturalHeight = rotate ? crop.width : crop.height;
    const scale = Math.min(1, 1200 / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    if (rotate) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.height, canvas.width);
    } else {
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    }

    const reference = document.createElement('canvas');
    reference.width = canvas.width;
    reference.height = canvas.height;
    reference.getContext('2d').drawImage(canvas, 0, 0);
    makePageBackgroundTransparent(canvas);
    return { design: canvas, reference };
  }

  function prepareGeneratedArtwork(source) {
    const crop = largestInkBox(source);
    const scale = Math.min(1, 1200 / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(crop.width * scale));
    canvas.height = Math.max(2, Math.round(crop.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    makePageBackgroundTransparent(canvas);
    return canvas;
  }

  function applyInsideArtworkCanvas(source) {
    const generatedArtwork = prepareGeneratedArtwork(source);
    insideArtworkCanvas = generatedArtwork;
    insideApproved = false;
    scheduleTextureBake();
    rotation = 0;
    lastInteraction = performance.now();
    updateInsideControls();
  }

  function imageDataUrlToCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas);
      };
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  function updateInsideControls(state = insideArtworkCanvas ? 'ready' : 'fallback') {
    const ready = Boolean(insideArtworkCanvas);
    insideState.textContent = state === 'generating' ? 'Generating...' : state === 'approved' ? 'Approved' : ready ? 'Ready to review' : 'Mirrored outside';
    insideState.dataset.state = state;
    generateInsideButton.disabled = generatingInside || !artworkReferenceCanvas;
    generateInsideLabel.textContent = generatingInside ? 'Generating...' : ready ? 'Regenerate' : 'Generate inside';
    viewInsideButton.hidden = !ready;
    approveInsideButton.hidden = !ready;
    approveInsideButton.disabled = insideApproved;
    approveInsideButton.innerHTML = insideApproved
      ? '<iconify-icon icon="lucide:check-check"></iconify-icon>Approved'
      : '<iconify-icon icon="lucide:check"></iconify-icon>Approve';
    removeInsideButton.hidden = !ready;
    mirrorInput.disabled = ready;
  }

  async function fileToCanvas(file) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.4, 1800 / baseViewport.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas;
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  }

  async function applyArtworkFile(file) {
    setStatus('Finding the cleat artwork on the page...', 'info');
    try {
      const source = await fileToCanvas(file);
      const artwork = prepareArtwork(source);
      outsideArtworkCanvas = artwork.design;
      insideArtworkCanvas = null;
      insideArtworkInput.value = '';
      insideApproved = false;
      artworkReferenceCanvas = artwork.reference;
      artworkControls.hidden = false;
      scheduleTextureBake();
      rotation = Math.PI;
      lastInteraction = performance.now();
      updateInsideControls();
      setStatus('Outside artwork is ready and being wrapped into the cleat material.', 'success');
    } catch (error) {
      console.error('Unable to prepare cleat artwork', error);
      setStatus('The worksheet could not be prepared. Try a clear JPG or PNG.', 'error');
    }
  }

  function loadModel(url, label, revokeAfterLoad = false) {
    empty.classList.remove('is-ready');
    empty.querySelector('strong').textContent = 'Loading 3D cleat';
    empty.querySelector('span').textContent = 'Preparing the detailed model...';
    setStatus('Loading the 3D cleat...', 'info');

    loader.load(
      url,
      gltf => {
        clearCurrentModel();
        currentModel = gltf.scene;
        stage.add(currentModel);
        prepareModel(currentModel);
        empty.classList.add('is-ready');
        previewName.textContent = label;
        previewMeta.textContent = 'Drag to rotate. Scroll to zoom.';
        setStatus('Real 3D cleat loaded and ready to inspect.', 'success');
        if (revokeAfterLoad) URL.revokeObjectURL(url);
      },
      event => {
        if (!event.total) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        empty.querySelector('span').textContent = `${percent}% loaded`;
      },
      error => {
        console.error('Unable to load cleat model', error);
        empty.querySelector('strong').textContent = 'Model could not load';
        empty.querySelector('span').textContent = 'Try reloading the page or selecting the GLB again.';
        setStatus('The GLB could not be opened.', 'error');
        if (revokeAfterLoad) URL.revokeObjectURL(url);
      }
    );
  }

  function resize() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    frameCamera();
  }

  function updateAngle() {
    const degrees = ((THREE.MathUtils.radToDeg(rotation) % 360) + 360) % 360;
    angleLabel.textContent = `Angle ${Math.round(degrees)}\u00b0`;
  }

  host.addEventListener('pointerdown', event => {
    dragging = true;
    lastPointerX = event.clientX;
    lastInteraction = performance.now();
    host.classList.add('is-dragging');
    host.setPointerCapture(event.pointerId);
  });

  host.addEventListener('pointermove', event => {
    if (!dragging) return;
    rotation += (event.clientX - lastPointerX) * 0.009;
    lastPointerX = event.clientX;
    lastInteraction = performance.now();
  });

  function stopDragging(event) {
    dragging = false;
    host.classList.remove('is-dragging');
    if (event.pointerId !== undefined && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId);
    }
  }

  host.addEventListener('pointerup', stopDragging);
  host.addEventListener('pointercancel', stopDragging);

  host.addEventListener('wheel', event => {
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.0008, 0.72, 1.65);
    frameCamera();
    lastInteraction = performance.now();
  }, { passive: false });

  modelInput.addEventListener('change', () => {
    const file = modelInput.files[0];
    if (!file) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    loadModel(currentObjectUrl, file.name.replace(/\.glb$/i, ''), false);
  });

  templateInput.addEventListener('change', async () => {
    const file = templateInput.files[0];
    if (!file) return;
    await applyArtworkFile(file);
  });

  insideArtworkInput.addEventListener('change', async () => {
    const file = insideArtworkInput.files[0];
    if (!file) return;
    setStatus('Preparing the uploaded inside artwork...', 'info');
    try {
      applyInsideArtworkCanvas(await fileToCanvas(file));
      setStatus('Inside artwork loaded. Rotate the cleat to review both sides.', 'success');
    } catch (error) {
      console.error('Unable to prepare inside cleat artwork', error);
      setStatus('The inside artwork could not be prepared. Try a clear JPG or PNG.', 'error');
    }
  });

  generateInsideButton.addEventListener('click', async () => {
    if (!artworkReferenceCanvas || generatingInside) return;
    generatingInside = true;
    insideApproved = false;
    updateInsideControls('generating');
    setStatus('Creating a coordinated inside design. This can take about a minute...', 'info');

    try {
      const response = await fetch('/api/teacher/cleats/generate-inside', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: artworkReferenceCanvas.toDataURL('image/png'),
          cause: document.getElementById('cleat-cause').value,
          primaryColor: document.getElementById('cleat-primary').value,
          secondaryColor: document.getElementById('cleat-secondary').value,
          notes: document.getElementById('cleat-notes').value
        })
      });
      const result = await response.json();
      if (response.status === 401) location.href = '/login';
      if (!response.ok) throw new Error(result.error || 'Inside artwork generation failed.');

      const generatedSource = await imageDataUrlToCanvas(result.imageDataUrl);
      applyInsideArtworkCanvas(generatedSource);
      setStatus('Inside design generated. Review it on the cleat, then approve or regenerate.', 'success');
    } catch (error) {
      console.error('Unable to generate inside cleat artwork', error);
      setStatus(error.message || 'The inside artwork could not be generated.', 'error');
    } finally {
      generatingInside = false;
      updateInsideControls();
    }
  });

  viewInsideButton.addEventListener('click', () => {
    rotation = 0;
    lastInteraction = performance.now();
    setStatus('Showing the generated inside design.', 'info');
  });

  approveInsideButton.addEventListener('click', () => {
    insideApproved = true;
    updateInsideControls('approved');
    setStatus('Inside design approved for this private preview.', 'success');
  });

  removeInsideButton.addEventListener('click', () => {
    insideArtworkCanvas = null;
    insideArtworkInput.value = '';
    insideApproved = false;
    mirrorInput.disabled = false;
    scheduleTextureBake();
    updateInsideControls();
    setStatus('Generated inside removed. The mirrored outside is showing again.', 'info');
  });

  mirrorInput.addEventListener('change', () => {
    mirrorInside = mirrorInput.checked;
    scheduleTextureBake();
  });

  document.getElementById('cleat-artwork-remove').addEventListener('click', () => {
    window.clearTimeout(bakeTimer);
    bakeGeneration++;
    applyModelTexture(null);
    bakedArtworkTexture?.dispose();
    bakedArtworkTexture = null;
    outsideArtworkCanvas = null;
    insideArtworkCanvas = null;
    insideArtworkInput.value = '';
    artworkReferenceCanvas = null;
    insideApproved = false;
    templateInput.value = '';
    artworkControls.hidden = true;
    updateInsideControls();
    setStatus('Worksheet artwork removed.', 'info');
  });

  document.getElementById('cleat-preview').addEventListener('click', () => {
    const student = document.getElementById('cleat-student-name').value.trim();
    const team = document.getElementById('cleat-team').value.trim();
    const cause = document.getElementById('cleat-cause').value.trim();
    previewName.textContent = student ? `${student}'s cleat` : 'Red Chaos cleat';
    previewMeta.textContent = [team, cause].filter(Boolean).join(' \u2022 ') || 'Drag to rotate. Scroll to zoom.';
  });

  document.getElementById('cleat-reset').addEventListener('click', () => {
    ['cleat-student-name', 'cleat-team', 'cleat-cause', 'cleat-primary', 'cleat-secondary', 'cleat-notes']
      .forEach(id => { document.getElementById(id).value = ''; });
    templateInput.value = '';
    modelInput.value = '';
    rotation = -0.18;
    window.clearTimeout(bakeTimer);
    bakeGeneration++;
    applyModelTexture(null);
    bakedArtworkTexture?.dispose();
    bakedArtworkTexture = null;
    outsideArtworkCanvas = null;
    insideArtworkCanvas = null;
    insideArtworkInput.value = '';
    artworkReferenceCanvas = null;
    insideApproved = false;
    artworkControls.hidden = true;
    mirrorInside = true;
    mirrorInput.checked = true;
    mirrorInput.disabled = false;
    updateInsideControls();
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    loadModel(defaultModelUrl, 'Red Chaos cleat');
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  function animate(time) {
    requestAnimationFrame(animate);
    if (!dragging && currentModel && time - lastInteraction > 2600) rotation += 0.0012;
    stage.rotation.y = rotation;
    updateAngle();
    renderer.render(scene, camera);
  }

  updateInsideControls();
  loadModel(defaultModelUrl, 'Red Chaos cleat');
  requestAnimationFrame(animate);
}
