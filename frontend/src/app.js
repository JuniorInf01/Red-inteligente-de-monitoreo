/* ============================================================
   UrbanSense — App Logic
   Handles: navigation, scroll animations, camera access,
            file upload, processing simulation, toasts
   ============================================================ */

"use strict";

// ── STATE ───────────────────────────────────────────────────
const state = {
  activeTab: "live",
  cameraStream: null,
  isMonitoring: false,
  monitoringInterval: null,
  frameCount: 0,
  vehicleCount: 0,
  selectedFile: null,
  isProcessing: false,
  processedData: null,
};

// ── DOM UTILS ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (id) => {
  const el = $(id);
  if (el) el.classList.remove("hidden");
};
const hide = (id) => {
  const el = $(id);
  if (el) el.classList.add("hidden");
};
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};

// ── NAVIGATION ──────────────────────────────────────────────
const navHeader = $("nav-header");
const navHamburger = $("nav-hamburger");
const navLinks = $("nav-links");

window.addEventListener(
  "scroll",
  () => {
    navHeader.classList.toggle("scrolled", window.scrollY > 20);
  },
  { passive: true },
);

navHamburger.addEventListener("click", () => {
  navLinks.classList.toggle("open");
  navHamburger.classList.toggle("active");
});

// Close mobile menu on link click
navLinks.querySelectorAll(".nav-link, .nav-btn-nav").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navHamburger.classList.remove("active");
  });
});

// ── SCROLL ANIMATIONS ───────────────────────────────────────
const animObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        animObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
);

document.querySelectorAll("[data-animate]").forEach((el) => {
  animObserver.observe(el);
});

// Stagger children inside animated parents
document
  .querySelectorAll(".tech-grid, .team-grid, .metrics-grid")
  .forEach((parent) => {
    parent.querySelectorAll(":scope > *").forEach((child, i) => {
      child.style.transitionDelay = `${i * 60}ms`;
    });
  });

// ── SCROLL TO ANALYSIS ──────────────────────────────────────
function scrollToAnalysis(tab) {
  switchTab(tab);
  const analysisSection = document.getElementById("analizar");
  if (analysisSection) {
    const offset = navHeader.offsetHeight + 24;
    const top =
      analysisSection.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
}

// ── TABS ────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;

  // Update tab buttons
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  $(`tab-${tab}`).classList.add("active");

  // Show / hide panels
  if (tab === "live") {
    show("panel-live");
    hide("panel-upload");
  } else {
    hide("panel-live");
    show("panel-upload");
  }
}

// ── CAMERA ──────────────────────────────────────────────────
async function detectCamera() {
  const statusMsg = $("live-status-msg");
  statusMsg.textContent = "Buscando cámaras disponibles...";
  statusMsg.style.color = "var(--text-muted)";

  setText("cam-status", "Detectando...");
  setText("cam-device", "—");
  setText("cam-resolution", "—");

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");

    if (videoDevices.length === 0) {
      statusMsg.textContent =
        "No se encontraron cámaras. Verifica que tu cámara esté conectada correctamente.";
      statusMsg.style.color = "#C0392B";
      setText("cam-status", "Sin cámara detectada");
      showToast("No se encontraron cámaras disponibles.", "error");
      return;
    }

    // Use first available camera (prefers non-front camera)
    const chosen = videoDevices[videoDevices.length - 1];
    setText("cam-status", "✓ Cámara encontrada");
    setText(
      "cam-device",
      chosen.label || `Cámara ${videoDevices.indexOf(chosen) + 1}`,
    );

    // Request stream to get resolution info
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: chosen.deviceId ? { exact: chosen.deviceId } : undefined,
      },
    });

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const w = settings.width || "—";
    const h = settings.height || "—";
    setText("cam-resolution", `${w} × ${h} px`);

    // Stop temporary stream
    stream.getTracks().forEach((t) => t.stop());

    statusMsg.textContent = `✓ Cámara lista. Haz clic en "Iniciar monitoreo en vivo" para comenzar.`;
    statusMsg.style.color = "#52B788";

    const btn = $("btn-start-live");
    btn.disabled = false;
    btn.dataset.deviceId = chosen.deviceId;

    showToast(
      `Cámara detectada: ${chosen.label || "Dispositivo de video"}`,
      "success",
    );
  } catch (err) {
    console.error("Camera detection error:", err);
    let msg = "No se pudo acceder a la cámara.";
    if (err.name === "NotAllowedError")
      msg = "Permiso de cámara denegado. Permite el acceso en tu navegador.";
    else if (err.name === "NotFoundError")
      msg = "No se encontró ninguna cámara conectada.";

    statusMsg.textContent = msg;
    statusMsg.style.color = "#C0392B";
    setText("cam-status", "Error de acceso");
    showToast(msg, "error");
  }
}

async function startLiveMonitoring() {
  if (state.isMonitoring) return;

  const btn = $("btn-start-live");
  const deviceId = btn.dataset.deviceId;

  try {
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };

    state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

    const video = $("live-video");
    video.srcObject = state.cameraStream;
    await video.play();

    const track = state.cameraStream.getVideoTracks()[0];
    const settings = track.getSettings();
    setText(
      "cam-resolution",
      `${settings.width || "?"} × ${settings.height || "?"} px`,
    );
    setText("cam-status", "● Transmitiendo");

    // Show video, hide idle
    hide("camera-idle");
    show("live-video");
    show("live-badge");
    show("live-results");

    state.isMonitoring = true;
    state.frameCount = 0;
    state.vehicleCount = 0;

    $("btn-start-live").disabled = true;
    $("btn-detect-camera").disabled = true;
    $("live-status-msg").textContent =
      "● Monitoreo activo — enviando frames al backend.";
    $("live-status-msg").style.color = "var(--orange-soft)";

    // Start sending frames to backend
    startSendingFrames();

    showToast("Monitoreo en vivo iniciado correctamente.", "success");
  } catch (err) {
    console.error("Live monitoring error:", err);
    const msg =
      err.name === "NotAllowedError"
        ? "Permiso de cámara denegado."
        : "No se pudo iniciar el monitoreo.";
    $("live-status-msg").textContent = msg;
    $("live-status-msg").style.color = "#C0392B";
    showToast(msg, "error");
  }
}

function stopLiveMonitoring() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }

  if (state.monitoringInterval) {
    clearInterval(state.monitoringInterval);
    state.monitoringInterval = null;
  }

  state.isMonitoring = false;

  const video = $("live-video");
  video.srcObject = null;

  show("camera-idle");
  hide("live-video");
  hide("live-badge");
  hide("live-results");

  $("btn-start-live").disabled = false;
  $("btn-detect-camera").disabled = false;
  $("live-status-msg").textContent = "Monitoreo detenido.";
  $("live-status-msg").style.color = "var(--text-muted)";

  setText("cam-status", "Cámara lista");
  showToast("Monitoreo detenido.", "info");
}

// Send frames to backend periodically (HTTP POST approach)
function startSendingFrames() {
  const video = $("live-video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Enviar un frame cada 2 segundos (ajustable)
  state.monitoringInterval = setInterval(async () => {
    if (!state.isMonitoring) return;

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append("frame", blob, "frame.jpg");

        const response = await fetch("http://localhost:8000/live-camera", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          // Por ahora simulamos la interfaz (hasta implementar la respuesta real)
          state.frameCount++;
          setText("rc-count", state.frameCount * 2); // Simulado temporal
          setText("rc-frames-val", state.frameCount);
          setText("rc-fps-val", "30 fps");
        }
      }, "image/jpeg", 0.8);

    } catch (err) {
      console.error("Error sending frame:", err);
    }
  }, 2000);
}

// ── FILE UPLOAD ──────────────────────────────────────────────
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  $("upload-zone").classList.add("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  $("upload-zone").classList.remove("drag-over");

  const files = event.dataTransfer.files;
  if (files.length > 0) processFileSelect(files[0]);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processFileSelect(file);
}

function processFileSelect(file) {
  const validTypes = [
    "video/mp4",
    "video/avi",
    "video/quicktime",
    "video/x-matroska",
    "video/x-msvideo",
    "video/webm",
  ];
  const validExtensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"];
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
    showToast("Formato no válido. Usa MP4, AVI, MOV o MKV.", "error");
    $("upload-status-msg").textContent = "Formato de archivo no compatible.";
    $("upload-status-msg").style.color = "#C0392B";
    return;
  }

  state.selectedFile = file;

  // Show file info
  const sizeFormatted = formatBytes(file.size);
  setText("file-name", file.name);
  setText("file-size", sizeFormatted);
  setText("file-format", ext.toUpperCase().replace(".", ""));
  setText("file-duration", "Calculando...");

  show("file-info-box");
  hide("upload-steps");

  // Show video preview
  const previewVideo = $("preview-video");
  const url = URL.createObjectURL(file);
  previewVideo.src = url;
  hide("upload-idle");
  show("upload-preview");

  previewVideo.onloadedmetadata = () => {
    const dur = formatDuration(previewVideo.duration);
    setText("file-duration", dur);
  };

  // Enable process button
  $("btn-process-video").disabled = false;
  $("btn-clear-video").style.display = "inline-flex";

  $("upload-status-msg").textContent = "Video listo para procesar.";
  $("upload-status-msg").style.color = "#52B788";

  showToast(`Video cargado: ${file.name}`, "success");
}

function clearVideo() {
  state.selectedFile = null;
  state.processedData = null;
  state.isProcessing = false;

  const previewVideo = $("preview-video");
  if (previewVideo.src) {
    URL.revokeObjectURL(previewVideo.src);
    previewVideo.src = "";
  }

  $("video-input").value = "";

  hide("file-info-box");
  hide("upload-preview");
  hide("processing-overlay");
  hide("video-results");
  show("upload-idle");
  show("upload-steps");

  $("btn-process-video").disabled = true;
  $("btn-clear-video").style.display = "none";

  $("upload-status-msg").textContent = "";

  // Reset processing steps
  resetProcessingSteps();
}

// ── VIDEO PROCESSING ─────────────────────────────────────────
async function processVideo() {
  if (!state.selectedFile || state.isProcessing) return;

  state.isProcessing = true;

  // Hide video preview panel, show processing overlay
  show("processing-overlay");
  hide("video-results");

  $("btn-process-video").disabled = true;
  $("btn-clear-video").style.display = "none";
  $("upload-status-msg").textContent = "";

  try {
    const formData = new FormData();
    formData.append("video", state.selectedFile);

    // Comenzar la simulación visual de progreso
    const progressPromise = runProcessingPipelineVisuals();
    
    // Hacer la llamada real al backend
    const response = await fetch("http://localhost:8000/upload-video", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const json = await response.json();
    
    if (json.error) {
      throw new Error(json.error);
    }
    
    // Esperar a que terminen las animaciones visuales iniciales (por UX)
    await progressPromise;

    markStepDone("pt-4");
    $("progress-bar").style.width = "100%";
    $("progress-pct").textContent = "100%";
    
    await sleep(400);

    state.processedData = json.data;
    state.isProcessing = false;

    hide("processing-overlay");
    showResults(state.processedData);
    showToast("Análisis completado correctamente.", "success");
    
  } catch (err) {
    console.error("Processing error:", err);
    hide("processing-overlay");
    $("upload-status-msg").textContent = "Error durante el procesamiento.";
    $("upload-status-msg").style.color = "#C0392B";
    state.isProcessing = false;
    $("btn-process-video").disabled = false;
    $("btn-clear-video").style.display = "inline-flex";
    showToast("Error durante el procesamiento del video.", "error");
  }
}

// Simulate the AI processing pipeline visuals while waiting for backend
async function runProcessingPipelineVisuals() {
  const progressBar = $("progress-bar");
  const progressPct = $("progress-pct");
  const processingDesc = $("processing-desc");

  const steps = [
    {
      id: "pt-1",
      label: "Enviando archivo al backend...",
      pct: 20,
      duration: 800,
    },
    {
      id: "pt-2",
      label: "YOLOv8n detectando vehículos...",
      pct: 50,
      duration: 1500,
    },
    {
      id: "pt-3",
      label: "CNN analizando espectrogramas Mel...",
      pct: 75,
      duration: 1500,
    },
    {
      id: "pt-4",
      label: "Esperando resultados del servidor...",
      pct: 95,
      duration: 800,
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Mark current step active, prev done
    if (i > 0) markStepDone(`pt-${i}`);
    markStepActive(step.id);

    processingDesc.textContent = step.label;

    await animateProgress(progressBar, progressPct, step.pct, step.duration);
  }
  
  markStepActive("pt-4"); // Queda activo hasta que backend termine
}

function showResults(data) {
  show("video-results");

  setText("res-total", data.total);
  setText("res-frames", data.framesAnalyzed);
  setText("res-time", `${data.processTimeSec}s`);
  setText("res-audio", data.noiseClass);

  const fileName = state.selectedFile ? state.selectedFile.name : "video";
  setText("results-meta", `Archivo: ${fileName}`);

  // Breakdown bars
  const barsContainer = $("breakdown-bars");
  barsContainer.innerHTML = "";
  const maxCount = Math.max(...Object.values(data.counts));

  Object.entries(data.counts).forEach(([cls, count]) => {
    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const row = document.createElement("div");
    row.className = "bb-row";
    row.innerHTML = `
      <span class="bb-label">${cls}</span>
      <div class="bb-bar-wrap">
        <div class="bb-bar" style="width:0%" data-target="${pct}"></div>
      </div>
      <span class="bb-count">${count}</span>
    `;
    barsContainer.appendChild(row);
  });

  // Animate bars after render
  requestAnimationFrame(() => {
    barsContainer.querySelectorAll(".bb-bar").forEach((bar) => {
      bar.style.width = bar.dataset.target + "%";
    });
  });

  $("btn-clear-video").style.display = "none";
  $("btn-process-video").disabled = true;
}

function downloadReport() {
  if (!state.processedData) return;
  const d = state.processedData;
  const lines = [
    "=== REPORTE URBANSENSE — reporte_pipeline.txt ===",
    `Archivo: ${state.selectedFile ? state.selectedFile.name : "video"}`,
    `Fecha: ${new Date().toLocaleString("es-PE")}`,
    "",
    "--- DETECCIÓN VEHICULAR (YOLOv8n) ---",
    `Fotogramas analizados: ${d.framesAnalyzed}`,
    `Total vehículos detectados: ${d.total}`,
    "",
    "Conteo por clase:",
    ...Object.entries(d.counts).map(
      ([cls, cnt]) => `  ${cls.toUpperCase()}: ${cnt}`,
    ),
    "",
    "--- ANÁLISIS ACÚSTICO (CNN) ---",
    `Clase de sonido predominante: ${d.noiseClass}`,
    "",
    "--- ESTADÍSTICAS DEL SISTEMA ---",
    `Tiempo de procesamiento: ${d.processTimeSec}s`,
    `Modelo de video: YOLOv8n (VisDrone-DET, 35 épocas, mAP50=28.5%)`,
    `Modelo de audio: CNN PyTorch (UrbanSound8K, 50 épocas, acc=71.32%)`,
    "",
    "=== FIN DEL REPORTE ===",
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reporte_pipeline.txt";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Reporte descargado: reporte_pipeline.txt", "success");
}

// ── HELPERS ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  if (isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animateProgress(bar, pctEl, targetPct, duration) {
  return new Promise((resolve) => {
    const start = parseFloat(bar.style.width) || 0;
    const diff = targetPct - start;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      bar.style.width = current + "%";
      pctEl.textContent = Math.round(current) + "%";

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function markStepActive(id) {
  const el = $(id);
  if (el) {
    el.classList.remove("done");
    el.classList.add("active");
  }
}

function markStepDone(id) {
  const el = $(id);
  if (el) {
    el.classList.remove("active");
    el.classList.add("done");
  }
}

function resetProcessingSteps() {
  ["pt-1", "pt-2", "pt-3", "pt-4"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.classList.remove("active", "done");
    }
  });
  const bar = $("progress-bar");
  if (bar) bar.style.width = "0%";
  setText("progress-pct", "0%");
  setText("processing-desc", "Extrayendo fotogramas del video...");
}

// ── TOASTS ──────────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = $("toast-container");
  const icons = { success: "✓", error: "✗", info: "ℹ" };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || "ℹ"}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, 3800);
}

// ── METRIC BARS ANIMATION ───────────────────────────────────
// Animate metric progress bars when visible
const metricBarsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(".mc-pb").forEach((bar) => {
          const target = bar.style.width;
          bar.style.width = "0%";
          requestAnimationFrame(() => {
            bar.style.transition = "width 1.2s ease 0.3s";
            bar.style.width = target;
          });
        });
        metricBarsObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 },
);

document.querySelectorAll(".metric-card").forEach((card) => {
  metricBarsObserver.observe(card);
});

// ── PIPELINE STEP STAGGER ───────────────────────────────────
const pipelineObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const steps = entry.target.querySelectorAll(".pipeline-step");
        steps.forEach((step, i) => {
          setTimeout(() => {
            step.style.opacity = "1";
            step.style.transform = "translateX(0)";
          }, i * 100);
        });
        pipelineObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 },
);

const pipelineTrack = document.querySelector(".pipeline-track");
if (pipelineTrack) {
  // Set initial state for stagger
  pipelineTrack.querySelectorAll(".pipeline-step").forEach((step) => {
    step.style.opacity = "0";
    step.style.transform = "translateX(-20px)";
    step.style.transition = "opacity 0.5s ease, transform 0.5s ease";
  });
  pipelineObserver.observe(pipelineTrack);
}
