const DB_NAME = "aga-pet-db";
const STORE = "pet";
const KEY = "active";

const $ = (id) => document.getElementById(id);
const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const nowIso = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID?.() || "pet-" + Date.now() + "-" + Math.random().toString(16).slice(2);

function defaultPet() {
  return {
    schema_version: "pet-portable-state/1.0",
    pet_id: uid(),
    exported_at: null,
    identity: { name: "", birth_time: nowIso(), dna_hash: "" },
    dna: { warmth: .62, curiosity: .58, calmness: .54, playfulness: .61 },
    emotion: { valence: .65, arousal: .5, security: .7, curiosity: .55, attachment: .2, fatigue: .1 },
    personality: {},
    growth: { stage: 0, label: "막 태어남", active_days: 1 },
    memory: [],
    concepts: [],
    skills: [],
    places: [],
    daily_activity: {
      [todayKey()]: { care: 0, play: 0, talk: 0, learning: 0 }
    },
    device: { current: "aga-pwa", last_opened_at: nowIso() }
  };
}

let petState = defaultPet();
let installPrompt = null;
let storageInfo = {
  persisted: null,
  usage: null,
  quota: null,
  snapshotAvailable: false
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPet() {
  const db = await openDB();
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (value) petState = normalizeState(value);
  petState.device = { ...(petState.device || {}), current: "aga-pwa", last_opened_at: nowIso() };
  touchDay();
  render();
  await refreshStorageInfo();
}

async function savePet() {
  const db = await openDB();
  petState.device = {
    ...(petState.device || {}),
    current: "aga-pwa",
    last_saved_at: nowIso()
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const previousReq = store.get(KEY);

    previousReq.onsuccess = () => {
      if (previousReq.result) {
        store.put(previousReq.result, "backup:previous");
      }
      store.put(petState, KEY);
    };

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });

  $("saveState").textContent = "로컬 저장됨";
  await refreshStorageInfo();
  setTimeout(() => $("saveState").textContent = "로컬 자동저장", 1100);
}


function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatLocalDate(value) {
  if (!value) return "아직 없음";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
  }).format(d);
}

async function hasPreviousSnapshot() {
  const db = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("backup:previous");
    req.onsuccess = () => resolve(!!req.result);
    req.onerror = () => reject(req.error);
  });
}

async function refreshStorageInfo() {
  try {
    const storage = navigator.storage;
    if (storage?.persisted) {
      storageInfo.persisted = await storage.persisted();
    } else {
      storageInfo.persisted = null;
    }

    if (storage?.estimate) {
      const estimate = await storage.estimate();
      storageInfo.usage = estimate.usage ?? null;
      storageInfo.quota = estimate.quota ?? null;
    }

    storageInfo.snapshotAvailable = await hasPreviousSnapshot();
  } catch (err) {
    console.warn("Storage status check failed", err);
  }

  const origin = location.origin || "이 기기";
  const stateBytes = new Blob([JSON.stringify(petState)]).size;

  if ($("storageOrigin")) $("storageOrigin").textContent = origin;
  if ($("persistStatus")) {
    $("persistStatus").textContent =
      storageInfo.persisted === true ? "보호됨" :
      storageInfo.persisted === false ? "브라우저 관리" : "지원 여부 미확인";
  }
  if ($("storageUsage")) {
    $("storageUsage").textContent =
      storageInfo.usage != null && storageInfo.quota != null
        ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}`
        : "브라우저가 제공하지 않음";
  }
  if ($("petDataSize")) $("petDataSize").textContent = formatBytes(stateBytes);
  if ($("lastSavedAt")) $("lastSavedAt").textContent = formatLocalDate(petState.device?.last_saved_at);
  if ($("snapshotState")) {
    $("snapshotState").textContent = storageInfo.snapshotAvailable
      ? "직전 저장 상태가 기기 안에 보관되어 있습니다."
      : "아직 로컬 복구 지점이 없습니다.";
  }
  if ($("restoreSnapshotBtn")) {
    $("restoreSnapshotBtn").disabled = !storageInfo.snapshotAvailable;
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    alert("이 브라우저는 영구 저장 요청 기능을 제공하지 않습니다.");
    return;
  }
  try {
    const granted = await navigator.storage.persist();
    await refreshStorageInfo();
    speak(granted
      ? "이 기기에서 내 데이터를 더 안전하게 보관하도록 요청했어."
      : "브라우저가 저장 보호 요청을 허용하지 않았어. JSON 백업을 가끔 저장해줘.");
  } catch (err) {
    console.error(err);
    alert("저장 보호 요청 중 오류가 발생했습니다.");
  }
}

function downloadStateFile(kind = "backup") {
  const out = structuredClone(petState);
  out.exported_at = nowIso();
  out.device = {
    ...(out.device || {}),
    exported_from:"aga-pwa",
    export_kind:kind,
    exported_at:out.exported_at
  };

  const blob = new Blob([JSON.stringify(out, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = (out.identity.name || "AI-PET").replace(/[^가-힣A-Za-z0-9_-]+/g, "_");
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  a.href = url;
  a.download = kind === "transfer"
    ? `${name}_PET_STATE.json`
    : `${name}_AGA_BACKUP_${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function restorePreviousSnapshot() {
  const db = await openDB();
  const snapshot = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("backup:previous");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  if (!snapshot) {
    alert("복구할 직전 로컬 상태가 없습니다.");
    return;
  }

  const ok = confirm("현재 상태를 직전 로컬 저장 상태로 되돌릴까요? 현재 상태는 다시 직전 복구 지점으로 보관됩니다.");
  if (!ok) return;

  petState = normalizeState(snapshot);
  remember("복원", "직전 로컬 상태로 되돌렸다.", .35);
  await savePet();
  render();
  speak("직전 상태로 돌아왔어.");
}

function normalizeState(input) {
  const base = defaultPet();
  if (!input || typeof input !== "object") return base;
  return {
    ...base,
    ...input,
    schema_version: "pet-portable-state/1.0",
    identity: { ...base.identity, ...(input.identity || {}) },
    dna: { ...base.dna, ...(input.dna || {}) },
    emotion: { ...base.emotion, ...(input.emotion || {}) },
    growth: { ...base.growth, ...(input.growth || {}) },
    memory: Array.isArray(input.memory) ? input.memory : [],
    concepts: Array.isArray(input.concepts) ? input.concepts : [],
    skills: Array.isArray(input.skills) ? input.skills : [],
    places: Array.isArray(input.places) ? input.places : [],
    daily_activity: input.daily_activity && typeof input.daily_activity === "object" ? input.daily_activity : {}
  };
}

function touchDay() {
  const key = todayKey();
  petState.daily_activity ||= {};
  petState.daily_activity[key] ||= { care: 0, play: 0, talk: 0, learning: 0 };
  petState.growth.active_days = Object.keys(petState.daily_activity).length;
  updateGrowth();
}

function addActivity(kind, n = 1) {
  touchDay();
  petState.daily_activity[todayKey()][kind] = (petState.daily_activity[todayKey()][kind] || 0) + n;
  updateGrowth();
}

function totals() {
  return Object.values(petState.daily_activity || {}).reduce((acc, d) => {
    for (const k of ["care","play","talk","learning"]) acc[k] += Number(d?.[k] || 0);
    return acc;
  }, { care:0, play:0, talk:0, learning:0 });
}

function updateGrowth() {
  const t = totals();
  const days = Object.keys(petState.daily_activity || {}).length;
  const score =
    Math.min(1, days / 30) * .32 +
    Math.min(1, t.care / 120) * .20 +
    Math.min(1, t.play / 80) * .12 +
    Math.min(1, t.talk / 100) * .16 +
    Math.min(1, t.learning / 70) * .20;

  const labels = [
    [0.15, 0, "막 태어남"],
    [0.32, 1, "아기"],
    [0.52, 2, "유아기"],
    [0.72, 3, "어린이"],
    [Infinity, 4, "성장기"]
  ];
  const found = labels.find(([limit]) => score < limit);
  petState.growth = { ...petState.growth, stage: found[1], label: found[2], active_days: days, experience: +score.toFixed(3) };
}

function remember(type, detail, importance = .2) {
  petState.memory.unshift({ id: uid(), type, detail, importance, at: nowIso() });
  petState.memory = petState.memory.slice(0, 120);
}

function speak(text) {
  $("speech").textContent = text;
}

function render() {
  touchDay();
  const e = petState.emotion;
  $("petName").textContent = petState.identity.name || "아가야";
  $("growthLabel").textContent = petState.growth.label || "막 태어남";
  $("moodMeter").value = clamp(e.valence) * 100;
  $("securityMeter").value = clamp(e.security) * 100;
  $("curiosityMeter").value = clamp(e.curiosity) * 100;
  $("attachmentMeter").value = clamp(e.attachment) * 100;

  const today = petState.daily_activity[todayKey()] || {};
  $("todaySummary").textContent =
    `오늘 돌봄 ${today.care || 0} · 놀이 ${today.play || 0} · 대화 ${today.talk || 0} · 배움 ${today.learning || 0}`;

  const t = totals();
  $("stats").textContent =
    `함께한 날 ${petState.growth.active_days || 0}일 · 기억 ${petState.memory.length} · 개념 ${petState.concepts.length} · 성장 ${petState.growth.label}`;

  $("memoryList").innerHTML = petState.memory.slice(0, 8).map(m =>
    `<div class="memory-item"><strong>${escapeHtml(m.type)}</strong><br>${escapeHtml(m.detail || "")}</div>`
  ).join("") || '<div class="memory-item">아직 특별한 기억이 없어요.</div>';

  $("learnedPreview").innerHTML = petState.concepts.slice(-5).reverse().map(c =>
    `<div class="memory-item">${escapeHtml(c.raw || c.subject || "")}</div>`
  ).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

async function care(kind = "care") {
  const e = petState.emotion;
  if (kind === "play") {
    e.valence = clamp(e.valence + .045);
    e.arousal = clamp(e.arousal + .05);
    e.curiosity = clamp(e.curiosity + .025);
    e.attachment = clamp(e.attachment + .012);
    addActivity("play");
    remember("놀이", "함께 놀았다.", .18);
    speak("좋아! 조금 더 놀고 싶어.");
  } else {
    e.valence = clamp(e.valence + .035);
    e.security = clamp(e.security + .04);
    e.attachment = clamp(e.attachment + .018);
    e.arousal = clamp(e.arousal - .01);
    addActivity("care");
    remember("돌봄", "부드럽게 쓰다듬어 주었다.", .2);
    speak(e.attachment > .55 ? "네 손길이 익숙해. 좋아." : "따뜻해…");
  }
  render();
  await savePet();
}

function parseTeaching(raw) {
  const text = raw.trim();
  if (!text) return null;
  const patterns = [
    [/^(.+?)은\s*(.+?)이야[.!?]?$/, "is_a"],
    [/^(.+?)는\s*(.+?)이야[.!?]?$/, "is_a"],
    [/^(.+?)은\s*(.+?)야[.!?]?$/, "is_a"],
    [/^(.+?)는\s*(.+?)야[.!?]?$/, "is_a"]
  ];
  for (const [re, relation] of patterns) {
    const m = text.match(re);
    if (m) return { subject:m[1].trim(), relation, object:m[2].trim(), raw:text, learned_at:nowIso(), confidence:.6, source:"user" };
  }
  return { subject:"", relation:"note", object:text, raw:text, learned_at:nowIso(), confidence:.5, source:"user" };
}

function validatePortableState(data) {
  return !!(
    data &&
    typeof data === "object" &&
    data.schema_version === "pet-portable-state/1.0" &&
    typeof data.pet_id === "string" &&
    data.identity &&
    data.emotion &&
    data.growth &&
    Array.isArray(data.memory) &&
    Array.isArray(data.concepts)
  );
}

function exportPet() {
  downloadStateFile("transfer");
  remember("이동 준비", "PET Portable State를 내보냈다.", .3);
  savePet();
  speak("내 기억을 이동 파일에 담았어.");
}

function backupPet() {
  downloadStateFile("backup");
  remember("백업", "기기 밖 JSON 백업 파일을 만들었다.", .24);
  savePet();
  speak("내 기억을 백업 파일에 담았어.");
}

async function importPet(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!validatePortableState(data)) throw new Error("PET Portable State v1 형식이 아닙니다.");
  petState = normalizeState(data);
  petState.device = { ...(petState.device || {}), current:"aga-pwa", imported_at:nowIso() };
  remember("기기 이동", "AGA PWA로 상태를 가져왔다.", .45);
  await savePet();
  render();
  await refreshStorageInfo();
  speak(`${petState.identity.name || "아가야"}의 기억을 이어받았어.`);
}

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === btn.dataset.tab));
  });
});

$("petBtn").addEventListener("click", () => care("care"));
$("playBtn").addEventListener("click", () => care("play"));

$("nameBtn").addEventListener("click", async () => {
  const name = $("nameInput").value.trim();
  if (!name) return;
  petState.identity.name = name.slice(0, 12);
  remember("이름", `내 이름은 ${petState.identity.name}`, .8);
  petState.emotion.attachment = clamp(petState.emotion.attachment + .03);
  speak(`내 이름은 ${petState.identity.name}. 기억할게.`);
  render();
  await savePet();
});

$("teachBtn").addEventListener("click", async () => {
  const item = parseTeaching($("teachInput").value);
  if (!item) return;
  petState.concepts.push({ id:uid(), ...item });
  petState.concepts = petState.concepts.slice(-250);
  petState.emotion.curiosity = clamp(petState.emotion.curiosity + .025);
  petState.emotion.attachment = clamp(petState.emotion.attachment + .006);
  addActivity("learning");
  addActivity("talk");
  remember("배움", item.raw, .38);
  $("teachInput").value = "";
  speak(item.relation === "is_a" ? `${item.subject}… ${item.object}. 기억해볼게.` : "응. 그 말을 기억해볼게.");
  render();
  await savePet();
});

$("exportBtn").addEventListener("click", exportPet);
$("backupBtn").addEventListener("click", backupPet);
$("persistBtn").addEventListener("click", requestPersistentStorage);
$("restoreSnapshotBtn").addEventListener("click", restorePreviousSnapshot);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try { await importPet(file); }
  catch (err) { alert(err.message || "가져오기에 실패했습니다."); }
  e.target.value = "";
});

let pressStart = 0;
$("pet").addEventListener("pointerdown", e => {
  pressStart = performance.now();
  $("pet").classList.add("pressed");
  e.currentTarget.setPointerCapture?.(e.pointerId);
});
$("pet").addEventListener("pointerup", async () => {
  $("pet").classList.remove("pressed");
  const duration = performance.now() - pressStart;
  await care(duration > 550 ? "care" : "care");
});
$("pet").addEventListener("pointercancel", () => $("pet").classList.remove("pressed"));

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

refreshStorageInfo().catch(console.warn);

loadPet().catch(err => {
  console.error(err);
  $("saveState").textContent = "저장소 오류";
  speak("로컬 저장소를 열지 못했어.");
});