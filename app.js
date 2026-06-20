const screens = [...document.querySelectorAll(".screen")];
const recordsKey = "brightsmile-records";
const apiBaseUrl = (window.BRIGHTSMILE_API_URL || "").replace(/\/$/, "");
let selectedArea = "A";
let selectedFile = null;

const showScreen = (id) => {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  if (id === "records-screen") renderRecords();
};

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.target));
});

document.getElementById("start-button").addEventListener("click", () => showScreen("area-screen"));
document.getElementById("history-from-home").addEventListener("click", () => showScreen("records-screen"));

document.querySelectorAll(".area-card").forEach((card) => {
  card.addEventListener("click", () => {
    selectedArea = card.dataset.area;
    showScreen("scan-screen");
  });
});

const imageInput = document.getElementById("image-input");
const previewImage = document.getElementById("preview-image");
const scanFrame = document.querySelector(".scan-frame");
const scanStatus = document.getElementById("scan-status");

imageInput.addEventListener("change", () => {
  selectedFile = imageInput.files[0] || null;
  if (!selectedFile) return;
  previewImage.src = URL.createObjectURL(selectedFile);
  scanFrame.classList.add("has-image");
  scanStatus.textContent = "";
});

document.getElementById("reset-image").addEventListener("click", () => {
  selectedFile = null;
  imageInput.value = "";
  previewImage.removeAttribute("src");
  scanFrame.classList.remove("has-image");
  scanStatus.textContent = "";
});

document.getElementById("predict-button").addEventListener("click", async () => {
  if (!selectedFile) {
    scanStatus.textContent = "กรุณาเลือกหรือถ่ายภาพก่อนตรวจ";
    return;
  }

  const formData = new FormData();
  formData.append("image", selectedFile);
  scanStatus.textContent = "กำลังวิเคราะห์ภาพ...";
  scanStatus.classList.remove("success");

  try {
    const response = await fetch(`${apiBaseUrl}/api/predict`, { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "ตรวจภาพไม่สำเร็จ");
    saveRecord(data);
    scanStatus.textContent = `ผลตรวจ: ${data.label} (${data.confidence}%)`;
    scanStatus.classList.add("success");
    setTimeout(() => showScreen("records-screen"), 800);
  } catch (error) {
    scanStatus.textContent = error.message;
  }
});

const getRecords = () => JSON.parse(localStorage.getItem(recordsKey) || "[]");
const setRecords = (records) => localStorage.setItem(recordsKey, JSON.stringify(records));

function saveRecord(result) {
  const name = document.getElementById("patient-name").value.trim() || "ไม่ระบุชื่อ";
  const records = getRecords();
  records.unshift({
    id: crypto.randomUUID(),
    name,
    area: selectedArea,
    result,
    date: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }),
  });
  setRecords(records.slice(0, 20));
}

function renderRecords() {
  const records = getRecords();
  const list = document.getElementById("records-list");
  document.getElementById("scan-count").textContent = `${records.length} Scans`;

  if (!records.length) {
    list.innerHTML = `<div class="record-card good"><span class="record-icon">✓</span><div><span class="tag">READY</span><h3>ยังไม่มีข้อมูล</h3><p class="muted">เริ่มตรวจภาพเพื่อบันทึกประวัติ</p></div><span>›</span></div>`;
    return;
  }

  list.innerHTML = records
    .map((record) => {
      const good = !record.result.needsAttention;
      const tag = good ? "EXCELLENT" : "NEEDS ATTENTION";
      const line = good
        ? "ไม่พบความเสี่ยงเด่นชัด"
        : `พบ${record.result.label} ความมั่นใจ ${record.result.confidence}%`;
      return `
        <article class="record-card ${good ? "good" : ""}">
          <span class="record-icon">${good ? "✓" : "!"}</span>
          <div>
            <span class="tag">${tag}</span>
            <h3>${record.name}</h3>
            <p class="result-line">${line}</p>
          </div>
          <div class="muted">Area ${record.area}<br />${record.date}</div>
        </article>
      `;
    })
    .join("");
}
