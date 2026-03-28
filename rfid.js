// Firebase v10+ modular SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getDatabase,
  ref,
  onValue,
  off,
  set
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAy55XJnvoF3W0qaT4AZ5iWxkj-4CLFWFk",
  authDomain: "rfid-attendance-system-aabc3.firebaseapp.com",
  projectId: "rfid-attendance-system-aabc3",
  databaseURL: "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com",
  storageBucket: "rfid-attendance-system-aabc3.firebasestorage.app",
  messagingSenderId: "162396605109",
  appId: "1:162396605109:web:f6795c46f9f020daa70cfc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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

let studentsMap = {};
let attendanceMap = {};
let subjects = [];
let activeSession = null;
let selectedSubject = '';
let totalSessionsBySubject = {};

let detachAttendanceListener = null;

// --- AUTH ---
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

logoutBtn.addEventListener('click', async () => {
  await set(ref(db, 'activeSession/status'), 'inactive');
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    teacherEmail.textContent = user.email;

    // Load teacher-specific subjects
    onValue(ref(db, 'teachers'), (snapshot) => {
      const teachers = snapshot.val() || {};
      let currentTeacherId = null;

      Object.entries(teachers).forEach(([id, teacher]) => {
        if (teacher.email === user.email) {
          currentTeacherId = id;
        }
      });

      if (!currentTeacherId) {
        subjects = [];
        renderSubjects();
        return;
      }

      const teacherSubjects = teachers[currentTeacherId].subjects || {};
      const subjectIds = Object.keys(teacherSubjects);

      onValue(ref(db, 'subjects'), (subSnap) => {
        const allSubjects = subSnap.val() || {};

        subjects = subjectIds
          .filter(id => allSubjects[id])
          .map(id => [id, allSubjects[id]]);

        renderSubjects();
      });
    });

    attachDataListeners();
  } else {
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    cleanupDynamicListeners();
  }
});

// --- DATA LISTENERS ---
function attachDataListeners() {

  onValue(ref(db, 'students'), (snapshot) => {
    studentsMap = snapshot.val() || {};
    renderTable();
  });

  // 🔥 ACTIVE SESSION FIXED
  onValue(ref(db, 'activeSession'), (snapshot) => {
    activeSession = snapshot.val() || null;

    if (activeSession) {
      activeDateEl.textContent = activeSession.date || new Date().toISOString().slice(0, 10);

      if (activeSession.subject) {
        selectedSubject = activeSession.subject;
        subjectSelect.value = selectedSubject;
      }
    } else {
      activeDateEl.textContent = new Date().toISOString().slice(0, 10);
    }

    subscribeAttendanceForSelection();
    loadTotalSessionsBySubject();
  });

  // 🔥 SUBJECT CHANGE → WRITE SESSION
  subjectSelect.addEventListener('change', () => {
    selectedSubject = subjectSelect.value;

    const today = new Date().toISOString().slice(0, 10);

    set(ref(db, 'activeSession'), {
      subject: selectedSubject,
      status: 'active',
      date: today
    });

    subscribeAttendanceForSelection();
    loadTotalSessionsBySubject();
  });
}

function cleanupDynamicListeners() {
  if (detachAttendanceListener) detachAttendanceListener();
}

// --- ATTENDANCE LISTENER ---
function subscribeAttendanceForSelection() {

  if (detachAttendanceListener) detachAttendanceListener();

  const date = activeSession?.date || new Date().toISOString().slice(0, 10);
  const subject = selectedSubject;

  if (!subject) {
    attendanceMap = {};
    renderTable();
    return;
  }

  const attendanceRef = ref(db, `attendance/${subject}/${date}`);

  const callback = (snapshot) => {
    attendanceMap = snapshot.val() || {};
    renderTable();
  };

  onValue(attendanceRef, callback);
  detachAttendanceListener = () => off(attendanceRef, 'value', callback);
}

// --- TOTAL SESSIONS ---
function loadTotalSessionsBySubject() {
  const subject = selectedSubject;
  if (!subject) return;

  onValue(ref(db, `attendance/${subject}`), (snapshot) => {
    const subjectData = snapshot.val() || {};
    const dates = Object.keys(subjectData);
    const totalSessions = dates.length;

    const totals = {};

    dates.forEach(date => {
      const data = subjectData[date] || {};
      Object.keys(data).forEach(id => {
        totals[id] = (totals[id] || 0) + 1;
      });
    });

    totalSessionsBySubject = { totals, totalSessions };
    renderTable();
  });
}

// --- RENDER SUBJECTS ---
function renderSubjects() {
  subjectSelect.innerHTML = '';

  if (subjects.length === 0) {
    subjectSelect.innerHTML = '<option>No subjects</option>';
    return;
  }

  subjects.forEach(([id, data]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = data.name;
    subjectSelect.appendChild(option);
  });

  if (!selectedSubject) {
    selectedSubject = subjects[0][0]; // FIXED
  }

  subjectSelect.value = selectedSubject;
}

// --- TABLE ---
function renderTable() {
  const students = Object.entries(studentsMap);
  const totalSessions = totalSessionsBySubject.totalSessions || 0;
  const totals = totalSessionsBySubject.totals || {};

  if (students.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="6">No students</td></tr>';
    return;
  }

  studentsBody.innerHTML = students.map(([id, s]) => {
    const present = attendanceMap[id];
    const count = totals[id] || 0;
    const percent = totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : 0;

    return `
      <tr>
        <td>${id}</td>
        <td>${s.name}</td>
        <td class="${present ? 'status-present' : 'status-absent'}">
          ${present ? 'Present' : 'Absent'}
        </td>
        <td>${present?.time || '-'}</td>
        <td>${count}/${totalSessions}</td>
        <td>${percent}%</td>
      </tr>
    `;
  }).join('');
}

// default date
activeDateEl.textContent = new Date().toISOString().slice(0, 10);