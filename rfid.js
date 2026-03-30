// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

// for auto logout if tab is closed 

import { setPersistence, browserSessionPersistence } 
from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  getDatabase,
  ref,
  onValue,
  off,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

// Config
const firebaseConfig = {
  apiKey: "AIzaSyAy55XJnvoF3W0qaT4AZ5iWxkj-4CLFWFk",
  authDomain: "rfid-attendance-system-aabc3.firebaseapp.com",
  databaseURL: "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com",
  projectId: "rfid-attendance-system-aabc3",
  storageBucket: "rfid-attendance-system-aabc3.firebasestorage.app",
  messagingSenderId: "162396605109",
  appId: "1:162396605109:web:f6795c46f9f020daa70cfc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);
const db = getDatabase(app);

// DOM
const loginCard = document.getElementById('login-card');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginMessage = document.getElementById('login-message');
const teacherEmail = document.getElementById('teacher-email');
const subjectSelect = document.getElementById('subject-select');
const activeDateEl = document.getElementById('active-date');
const logoutBtn = document.getElementById('logout-btn');
const studentsBody = document.getElementById('students-body');


// For chainging subjects and  logout
function showConfirm(message) {
  return new Promise((resolve) => {

    const modal = document.getElementById("confirm-modal");
    const text = document.getElementById("modal-text");
    const confirmBtn = document.getElementById("confirm-btn");
    const cancelBtn = document.getElementById("cancel-btn");

    text.textContent = message;
    modal.classList.remove("hidden");

    const cleanup = () => {
      modal.classList.add("hidden");
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

// State
let studentsMap = {};
let attendanceMap = {};
let subjects = [];
let activeSession = null;
let selectedSubject = '';
let totalSessionsBySubject = {};
let detachAttendanceListener = null;

// ---------------- 🔥 NEW FUNCTION ----------------
function createNewSession(subjectId) {
  const today = new Date().toISOString().slice(0, 10);
  const sessionId = Date.now();

  const data = {
    subject: subjectId,
    status: "active",
    date: today,
    sessionId: sessionId
  };

  console.log("SESSION CREATED:", data);

  set(ref(db, 'activeSession'), data);
}

// ---------------- AUTH ----------------

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMessage.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    loginForm.reset();
  } catch (err) {
    loginMessage.textContent = err.message;
  }
});

// password show
// const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("toggle-password");

if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    const type = passwordInput.type === "password" ? "text" : "password";
    passwordInput.type = type;

    toggleBtn.textContent = type === "password" ? "👁" : "👁‍🗙";
  });
}

// Logout
logoutBtn.addEventListener('click', async () => {

  const confirmLogout = await showConfirm(
    "Logout and end current session?"
  );

  if (!confirmLogout) return;

  await update(ref(db, 'activeSession'), {
    status: "inactive"
  });

  await signOut(auth);
});

// ---------------- AUTH STATE ----------------

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    teacherEmail.textContent = user.email;

    loadTeacherSubjects(user.email);
    attachDataListeners();

  } else {
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    cleanupDynamicListeners();
  }
});

// ---------------- LOAD SUBJECTS ----------------

function loadTeacherSubjects(email) {
  onValue(ref(db, 'teachers'), (snapshot) => {
    const teachers = snapshot.val() || {};
    let teacherId = null;

    Object.entries(teachers).forEach(([id, t]) => {
      if (t.email === email) teacherId = id;
    });

    if (!teacherId) {
      subjects = [];
      renderSubjects();
      return;
    }

    const subjectIds = Object.keys(teachers[teacherId].subjects || {});

    onValue(ref(db, 'subjects'), (snap) => {
      const allSubjects = snap.val() || {};

      subjects = subjectIds
        .filter(id => allSubjects[id])
        .map(id => [id, allSubjects[id]]);

      renderSubjects();
    });
  });
}

// ---------------- DATA LISTENERS ----------------

function attachDataListeners() {

  onValue(ref(db, 'students'), (snapshot) => {
    studentsMap = snapshot.val() || {};
    renderTable();
  });

  onValue(ref(db, 'activeSession'), (snapshot) => {
    activeSession = snapshot.val();

    if (activeSession) {
      activeDateEl.textContent = activeSession.date;

      if (activeSession.subject) {
        selectedSubject = activeSession.subject;
        subjectSelect.value = selectedSubject;
      }
    }

    subscribeAttendanceForSelection();
    loadTotalSessionsBySubject();
  });

  // Session selection and conformation for subject switching
  subjectSelect.addEventListener('change', async () => {

  const newSubject = subjectSelect.value;

  if (activeSession && activeSession.status === "active") {

    const confirmSwitch = await showConfirm(
      "End current session and start a new one?"
    );

    if (!confirmSwitch) {
      subjectSelect.value = selectedSubject;
      return;
    }

    //saveSessionHistory();

    await update(ref(db, 'activeSession'), {
      status: "inactive"
    });
  }

    selectedSubject = newSubject;
    createNewSession(selectedSubject);

  });
}

// ---------------- CLEANUP ----------------

function cleanupDynamicListeners() {
  if (detachAttendanceListener) detachAttendanceListener();
}

// ---------------- ATTENDANCE ----------------

function subscribeAttendanceForSelection() {

  if (detachAttendanceListener) detachAttendanceListener();

  if (!selectedSubject || !activeSession?.sessionId) {
    attendanceMap = {};
    renderTable();
    return;
  }

  const sessionKey = `${activeSession.date}_${activeSession.sessionId}`;

  const attendanceRef = ref(db, `attendance/${selectedSubject}/${sessionKey}`);

  const callback = (snapshot) => {
    attendanceMap = snapshot.val() || {};
    renderTable();
  };

  onValue(attendanceRef, callback);
  detachAttendanceListener = () => off(attendanceRef, 'value', callback);
}

// ---------------- TOTAL SESSIONS ----------------

function loadTotalSessionsBySubject() {
  if (!selectedSubject) return;

  onValue(ref(db, `attendance/${selectedSubject}`), (snapshot) => {
    const data = snapshot.val() || {};
    const sessions = Object.keys(data);

    const totals = {};

    sessions.forEach(session => {
      const sData = data[session] || {};
      Object.keys(sData).forEach(id => {
        totals[id] = (totals[id] || 0) + 1;
      });
    });

    totalSessionsBySubject = {
      totals,
      totalSessions: sessions.length
    };

    renderTable();
  });
}

// ---------------- SUBJECT UI ----------------

function renderSubjects() {
  subjectSelect.innerHTML = '';

  if (subjects.length === 0) {
    subjectSelect.innerHTML = '<option>No subjects</option>';
    return;
  }

  subjects.forEach(([id, s]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = s.name;
    subjectSelect.appendChild(option);
  });

  if (!selectedSubject) selectedSubject = subjects[0][0];
  subjectSelect.value = selectedSubject;

  // 🔥 AUTO SESSION FIX
  if (
    selectedSubject &&
    (!activeSession?.sessionId || activeSession.status !== "active")
  ) {
    createNewSession(selectedSubject);
  }
}

// ---------------- TABLE ----------------



function renderTable() {

  const totalStudents = Object.keys(studentsMap).length;

  const presentToday = Object.values(attendanceMap).filter(
  s => s.status === "present"
  ).length;

  const attendancePercent =
  totalStudents > 0
    ? ((presentToday / totalStudents) * 100).toFixed(1)
    : 0;

  const students = Object.entries(studentsMap);
  const totalSessions = totalSessionsBySubject.totalSessions || 0;
  const totals = totalSessionsBySubject.totals || {};

  if (students.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="6">No students</td></tr>';
    return;
  }

  studentsBody.innerHTML = students.map(([id, s]) => {
    const present = attendanceMap[id]?.status === "present";
    const count = totals[id] || 0;
    const percent = totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : 0;
    const rowClass = present ? "row-present" : "";

    return `
      <tr class="${rowClass}">

        <td>${id}</td>
        <td>${s.name}</td>
        <td class="${present ? 'status-present' : 'status-absent'}">
          ${present ? '✔ Present' : '✖ Absent'}
        </td>
        <td>${attendanceMap[id]?.time || '-'}</td>
        <td>${count}/${totalSessions}</td>
        <td>${percent}%</td>
      </tr>
    `;
  }).join('');

  document.getElementById("total-students").textContent = totalStudents;
  document.getElementById("present-today").textContent = presentToday;
  document.getElementById("attendance-percent").textContent = attendancePercent + "%";
}

// default date
activeDateEl.textContent = new Date().toISOString().slice(0, 10);

// 🔥 QR GENERATION (login page)
const qrBox = document.getElementById("qr-box");

if (qrBox) {

  const studentId = "S001"; // test first

 const url = `https://endearing-valkyrie-5f5b07.netlify.app/rfidstudent.html?id=${studentId}`;

  QRCode.toCanvas(url, function (err, canvas) {
    if (!err) qrBox.appendChild(canvas);
  });
}
//final