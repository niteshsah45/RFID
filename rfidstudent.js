import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

// 🔷 Firebase config (copy from your main app)
const firebaseConfig = {
  apiKey: "AIzaSyAy55XJnvoF3W0qaT4AZ5iWxkj-4CLFWFk",
  authDomain: "rfid-attendance-system-aabc3.firebaseapp.com",
  databaseURL: "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com",
  projectId: "rfid-attendance-system-aabc3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🔷 Get ID from URL
function getStudentIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// 🔷 MAIN FUNCTION
window.loadAttendance = async function () {

  const studentId = document.getElementById("student-id").value.trim().toUpperCase();
  const resultDiv = document.getElementById("result");

  if (!studentId) {
    resultDiv.innerHTML = `<div class="error">Enter valid Student ID</div>`;
    return;
  }

  resultDiv.innerHTML = "Loading...";

  // 🔷 Fetch student
  const studentSnap = await get(ref(db, `students/${studentId}`));

  if (!studentSnap.exists()) {
    resultDiv.innerHTML = `<div class="error">Student not found</div>`;
    return;
  }

  const student = studentSnap.val();

  // 🔷 Fetch attendance + subjects
  const [attendanceSnap, subjectsSnap] = await Promise.all([
    get(ref(db, "attendance")),
    get(ref(db, "subjects"))
  ]);

  const attendanceData = attendanceSnap.val() || {};
  const subjectsData = subjectsSnap.val() || {};

  let output = "";

  for (const subjectId in attendanceData) {

    const subjectData = attendanceData[subjectId];

    let total = 0;
    let present = 0;

    for (const sessionKey in subjectData) {
      total++;

      if (subjectData[sessionKey][studentId]?.status === "present") {
        present++;
      }
    }

    const percent = total > 0
      ? ((present / total) * 100).toFixed(1)
      : 0;

    const subjectName = subjectsData[subjectId]?.name || subjectId;

    output += `
      <div class="subject-card">
        <strong>${subjectName}</strong><br>
        ${present}/${total} <br>
        <span class="percent">${percent}%</span>
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <h3>${student.name}</h3>
    <p>${student.department}</p>
    ${output || "No attendance data"}
  `;
};

// 🔥 AUTO LOAD FROM QR
window.addEventListener("load", () => {
  const id = getStudentIdFromURL();

  if (id) {
    document.getElementById("student-id").value = id;
    loadAttendance();
  }
});