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
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

// TODO: Replace with your own Firebase project credentials.
const firebaseConfig = {
  apiKey: "AIzaSyAy55XJnvoF3W0qaT4AZ5iWxkj-4CLFWFk",
    authDomain: "rfid-attendance-system-aabc3.firebaseapp.com",
    projectId: "rfid-attendance-system-aabc3",
    databaseURL:"https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com",
    storageBucket: "rfid-attendance-system-aabc3.firebasestorage.app",
    messagingSenderId: "162396605109",
    appId: "1:162396605109:web:f6795c46f9f020daa70cfc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM references
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

// Keep listener references so we can detach/re-attach when selection changes
let detachAttendanceListener = null;

// --- Authentication ---
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    loginForm.reset();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    teacherEmail.textContent = user.email || 'Teacher';
    attachDataListeners();
  } else {
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    cleanupDynamicListeners();
  }
});

// --- Realtime Database listeners ---
function attachDataListeners() {
  // Listen to students node once and live updates
  onValue(ref(db, 'students'), (snapshot) => {
    studentsMap = snapshot.val() || {};
    renderTable();
  });

  // Listen to subjects list for dropdown options
  onValue(ref(db, 'subjects'), (snapshot) => {
    const data = snapshot.val();
    // Handle both array format and object list format
    subjects = Array.isArray(data)
      ? data.filter(Boolean)
      : data
      ? Object.values(data)
      : [];
    renderSubjects();
  });

  // Listen to active session and auto-select subject/date
  onValue(ref(db, 'activeSession'), (snapshot) => {
    activeSession = snapshot.val() || null;

    if (activeSession?.date) {
      activeDateEl.textContent = activeSession.date;
    } else {
      activeDateEl.textContent = new Date().toISOString().slice(0, 10);
    }

    // If current selected subject is missing, default to active subject
    if (!selectedSubject && activeSession?.subject) {
      selectedSubject = activeSession.subject;
      subjectSelect.value = selectedSubject;
    }

    // If selected subject diverges from dropdown and active has value, keep selection valid
    if (!selectedSubject && subjects.length > 0) {
      selectedSubject = subjects[0];
      subjectSelect.value = selectedSubject;
    }

    subscribeAttendanceForSelection();
    loadTotalSessionsBySubject();
  });

  subjectSelect.addEventListener('change', () => {
    selectedSubject = subjectSelect.value;
    subscribeAttendanceForSelection();
    loadTotalSessionsBySubject();
  });
}

function cleanupDynamicListeners() {
  if (typeof detachAttendanceListener === 'function') {
    detachAttendanceListener();
    detachAttendanceListener = null;
  }
}

function subscribeAttendanceForSelection() {
  // Stop previous attendance listener if any
  if (typeof detachAttendanceListener === 'function') {
    detachAttendanceListener();
    detachAttendanceListener = null;
  }

  const date = activeSession?.date || new Date().toISOString().slice(0, 10);
  const subject = selectedSubject || activeSession?.subject;

  if (!subject) {
    attendanceMap = {};
    renderTable();
    return;
  }

  // Live updates for current subject/date attendance
  const attendanceRef = ref(db, `attendance/${subject}/${date}`);
  const callback = (snapshot) => {
    attendanceMap = snapshot.val() || {};
    renderTable();
  };

  onValue(attendanceRef, callback);
  detachAttendanceListener = () => off(attendanceRef, 'value', callback);
}

function loadTotalSessionsBySubject() {
  const subject = selectedSubject || activeSession?.subject;
  if (!subject) {
    totalSessionsBySubject = {};
    renderTable();
    return;
  }

  // Read all dates under this subject to compute total sessions and attendance percentage
  onValue(ref(db, `attendance/${subject}`), (snapshot) => {
    const subjectData = snapshot.val() || {};
    const allDates = Object.keys(subjectData);
    const totalSessions = allDates.length;

    const totals = {};
    allDates.forEach((dateKey) => {
      const dateData = subjectData[dateKey] || {};
      Object.keys(dateData).forEach((studentId) => {
        totals[studentId] = (totals[studentId] || 0) + 1;
      });
    });

    totalSessionsBySubject = { totals, totalSessions };
    renderTable();
  });
}

// --- Rendering ---
function renderSubjects() {
  subjectSelect.innerHTML = '';

  if (subjects.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No subjects available';
    subjectSelect.appendChild(option);
    selectedSubject = '';
    return;
  }

  subjects.forEach((subject) => {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = subject;
    subjectSelect.appendChild(option);
  });

  // Prefer selected, then active subject, then first subject
  if (selectedSubject && subjects.includes(selectedSubject)) {
    subjectSelect.value = selectedSubject;
  } else if (activeSession?.subject && subjects.includes(activeSession.subject)) {
    selectedSubject = activeSession.subject;
    subjectSelect.value = selectedSubject;
  } else {
    selectedSubject = subjects[0];
    subjectSelect.value = selectedSubject;
  }

  subscribeAttendanceForSelection();
  loadTotalSessionsBySubject();
}

function renderTable() {
  const studentEntries = Object.entries(studentsMap);
  const totalSessions = totalSessionsBySubject.totalSessions || 0;
  const totals = totalSessionsBySubject.totals || {};

  if (studentEntries.length === 0) {
    studentsBody.innerHTML = '<tr><td colspan="6" class="center-muted">No students found.</td></tr>';
    return;
  }

  studentsBody.innerHTML = studentEntries
    .map(([studentId, student]) => {
      const attendanceToday = attendanceMap[studentId];
      const isPresent = Boolean(attendanceToday);
      const time = attendanceToday?.time || '-';

      const attendedCount = totals[studentId] || 0;
      const percentage = totalSessions > 0 ? ((attendedCount / totalSessions) * 100).toFixed(1) : '0.0';

      return `
        <tr>
          <td>${studentId}</td>
          <td>${student?.name || '-'}</td>
          <td class="${isPresent ? 'status-present' : 'status-absent'}">${isPresent ? 'Present' : 'Absent'}</td>
          <td>${time}</td>
          <td>${attendedCount}/${totalSessions}</td>
          <td>${percentage}%</td>
        </tr>
      `;
    })
    .join('');
}

// Initial placeholder date before activeSession is loaded
activeDateEl.textContent = new Date().toISOString().slice(0, 10);
