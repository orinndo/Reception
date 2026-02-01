// Appointment Assist (No Audio)
// Staff selects date + 30-min time slots -> patient-ready bilingual display.

(() => {
  'use strict';

  // ====== CONFIG (edit here if hours change) ======
  // Based on: Mon-Fri AM 08:30-12:00 / PM 13:00-17:00
  // Thu PM closed, Sat PM closed, Sun closed.
  // Holiday is manual toggle (device doesn't have offline Japanese holiday calendar).
  const HOURS = {
    mon: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '17:00' }],
    tue: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '17:00' }],
    wed: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '17:00' }],
    thu: [{ start: '08:30', end: '12:00' }], // PM closed
    fri: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '17:00' }],
    sat: [{ start: '08:30', end: '12:00' }], // PM closed
    sun: [] // closed
  };

  const SLOT_MINUTES = 30;

  // ====== DOM ======
  const dateInput = document.getElementById('dateInput');
  const examType = document.getElementById('examType');
    
  const timeGrid = document.getElementById('timeGrid');
  const confirmTimeGrid = document.getElementById('confirmTimeGrid');
  const dayInfo = document.getElementById('dayInfo');
  const hoursNote = document.getElementById('hoursNote');

  const slotList = document.getElementById('slotList');

  const tabAvailability = document.getElementById('tabAvailability');
  const tabConfirm = document.getElementById('tabConfirm');
  const availabilityPanel = document.getElementById('availabilityPanel');
  const confirmPanel = document.getElementById('confirmPanel');

  const addSlotsBtn = document.getElementById('addSlotsBtn');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  const clearSlotsBtn = document.getElementById('clearSlotsBtn');
  const showAvailabilityBtn = document.getElementById('showAvailabilityBtn');

  const confirmBtn = document.getElementById('confirmBtn');
  const confirmPreviewEN = document.getElementById('confirmPreviewEN');
  const confirmPreviewJP = document.getElementById('confirmPreviewJP');
  const confirmPreviewDT = document.getElementById('confirmPreviewDT');

  const toggleViewBtn = document.getElementById('toggleViewBtn');
  const staffView = document.getElementById('staffView');
  const patientView = document.getElementById('patientView');
  const backToStaffBtn = document.getElementById('backToStaffBtn');
  const patientBody = document.getElementById('patientBody');

  // ====== STATE ======
  // selectedTimes: Set of "HH:MM" for current date (availability builder)
  let selectedTimes = new Set();
  // availableSlots: array of { dateISO, timeHM }
  let availableSlots = [];
  // confirmTime: single "HH:MM"
  let confirmTime = null;

  // patientMode: 'availability' | 'confirm'
  let patientMode = 'availability';

  // Exam type (staff-selected)
  let selectedExam = 'xray';

  // Patient-chosen slot key (availability mode)
  let patientChosenKey = null;

  
  function examLabelEN(key){
    const map = {
      xray: 'X-ray',
      ct: 'CT scan',
      ecg: 'ECG',
      echo: 'Echocardiography',
      tee: 'Transesophageal echocardiography',
      ultrasound: 'Ultrasound examination',
      abi: 'ABI test',
      pft: 'Pulmonary function test',
      audiometry: 'Hearing test',
      endoscopy: 'Endoscopy'
    };
    return map[key] || 'examination';
  }


  function examLabelJP(key){
    const map = {
      xray: 'レントゲン',
      ct: 'CT検査',
      ecg: '心電図',
      echo: '心エコー',
      tee: '経食道心エコー',
      ultrasound: '超音波検査',
      abi: 'ABI',
      pft: '呼吸機能検査',
      audiometry: '聴力検査',
      endoscopy: '内視鏡検査'
    };
    return map[key] || '検査';
  }



  function slotKey(s){
    const ek = s.examKey || 'unknown';
    return `${s.dateISO}T${s.timeHM}|${ek}`;
  }

// ====== HELPERS ======
  const pad2 = (n) => String(n).padStart(2, '0');

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function parseISODate(iso) {
    // iso: YYYY-MM-DD
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function weekdayKey(dateObj) {
    // JS: 0=Sun ... 6=Sat
    const k = ['sun','mon','tue','wed','thu','fri','sat'][dateObj.getDay()];
    return k;
  }

  function toMinutes(hm) {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
  }

  function toHM(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${pad2(h)}:${pad2(m)}`;
  }

  function clampToStep(mins, step) {
    return Math.floor(mins / step) * step;
  }

  function generateSlotsForRanges(ranges) {
    // ranges: [{start:'08:30', end:'12:00'}, ...] inclusive of start, inclusive of end if matches step
    const slots = [];
    for (const r of ranges) {
      const start = toMinutes(r.start);
      const end = toMinutes(r.end);
      // start must align; if not, we still include it as-is then step.
      let cur = start;
      // Ensure we don't create a slot that starts after end
      while (cur <= end) {
        slots.push(toHM(cur));
        cur += SLOT_MINUTES;
      }
      // Note: If you want end to be exclusive (i.e., last slot start <= end - 30), change loop condition.
    }
    // Deduplicate (in case of overlapping ranges)
    return Array.from(new Set(slots));
  }

  function formatDateEN(dateObj) {
    // Thursday, February 5, 2026
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateObj);
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateObj);
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();
    return `${weekday}, ${month} ${day}, ${year}`;
  }

  function formatDateJP(dateObj) {
    // 2026年2月5日（木）
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const w = ['日','月','火','水','木','金','土'][dateObj.getDay()];
    return `${y}年${m}月${d}日（${w}）`;
  }

  function formatTimeEN(hm) {
    // 13:30 -> 1:30 PM
    const [h, m] = hm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${pad2(m)} ${ampm}`;
  }

  function formatTimeJP(hm) {
    const [h, m] = hm.split(':').map(Number);
    const isAM = h < 12;
    const label = isAM ? '午前' : '午後';
    const h12 = ((h + 11) % 12) + 1;
    if (m === 0) return `${label}${h12}時`;
    return `${label}${h12}時${m}分`;
  }

  function isClosedByRule(dateObj) {
    const key = weekdayKey(dateObj);
    return (HOURS[key] || []).length === 0;
  }

  function isClosedByToggle() {
    return false;
  }

  function currentHoursForDate(dateObj) {
    const key = weekdayKey(dateObj);
    return HOURS[key] || [];
  }

  function sortSlots(slots) {
    // slots: [{dateISO,timeHM}]
    return slots.slice().sort((a,b) => {
      if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      return toMinutes(a.timeHM) - toMinutes(b.timeHM);
    });
  }

  function uniqueSlots(slots) {
    const seen = new Set();
    const out = [];
    for (const s of slots) {
      const k = slotKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  // ====== RENDER ======
  function renderDayInfo(dateObj) {
    const key = weekdayKey(dateObj);
    const wJP = ['日','月','火','水','木','金','土'][dateObj.getDay()];
    dayInfo.textContent = `${key.toUpperCase()} / ${wJP}`;
  }

  function renderHoursNote(dateObj) {
    // (intentionally blank) no operational notes
    hoursNote.textContent = '';
  }

  function buildTimeButtons(container, slots, selectedSet, disabledAll) {
    container.innerHTML = '';
    if (disabledAll) {
      const p = document.createElement('div');
      p.className = 'note';
      /* removed */
      container.appendChild(p);
      return;
    }

    slots.forEach(hm => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-btn';
      btn.textContent = hm;
      if (selectedSet && selectedSet.has(hm)) btn.classList.add('is-selected');

      btn.addEventListener('click', () => {
        // toggle selection
        if (!selectedSet) return;
        if (selectedSet.has(hm)) selectedSet.delete(hm);
        else selectedSet.add(hm);
        btn.classList.toggle('is-selected');
      });

      container.appendChild(btn);
    });
  }

  function renderTimeGrids() {
    const iso = dateInput.value;
    if (!iso) {
      timeGrid.innerHTML = '<div class="note">まず日付を選択してください。</div>';
      confirmTimeGrid.innerHTML = '<div class="note">まず日付を選択してください。</div>';
      dayInfo.textContent = '—';
      hoursNote.textContent = '';
      return;
    }
    const dateObj = parseISODate(iso);

    renderDayInfo(dateObj);
    renderHoursNote(dateObj);

    const disabledAll = isClosedByToggle() || isClosedByRule(dateObj);
    const ranges = currentHoursForDate(dateObj);
    const slots = disabledAll ? [] : generateSlotsForRanges(ranges);

    // Availability panel grid
    buildTimeButtons(timeGrid, slots, selectedTimes, disabledAll);

    // Confirm panel grid (single-select)
    renderConfirmGrid(slots, disabledAll);

    // Update confirm preview if needed
    updateConfirmPreview();
  }

  function renderConfirmGrid(slots, disabledAll) {
    confirmTimeGrid.innerHTML = '';
    if (disabledAll) {
      const p = document.createElement('div');
      p.className = 'note';
      /* removed */
      confirmTimeGrid.appendChild(p);
      return;
    }

    slots.forEach(hm => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-btn';
      btn.textContent = hm;
      if (confirmTime === hm) btn.classList.add('is-selected');

      btn.addEventListener('click', () => {
        confirmTime = hm;
        // re-render to keep single-select styling
        renderConfirmGrid(slots, false);
        updateConfirmPreview();
      });

      confirmTimeGrid.appendChild(btn);
    });
  }

  function renderSlotList() {
    slotList.innerHTML = '';
    if (!availableSlots.length) {
      slotList.innerHTML = '<div class="note">まだ空き枠がありません。左の時間枠を選んで追加してください。</div>';
      return;
    }

    const sorted = sortSlots(uniqueSlots(availableSlots));
    sorted.forEach((s, idx) => {
      const dateObj = parseISODate(s.dateISO);
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `
        <div class="slot__row">
          <div class="slot__text">
            <div class="slot__en">${formatDateEN(dateObj)} at ${formatTimeEN(s.timeHM)}</div>
            <div class="slot__jp">${formatDateJP(dateObj)} ${formatTimeJP(s.timeHM)}</div>
            <div class="slot__meta">${s.dateISO} / ${s.timeHM}</div>
        <div class="slot__exam">${examLabelJP(s.examKey || selectedExam)}</div>
          </div>
          <button class="slot__delete" type="button" aria-label="削除">削除</button>
        </div>
      `;
      const delBtn = el.querySelector('.slot__delete');
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const key = slotKey(s);
        availableSlots = availableSlots.filter(x => slotKey(x) !== key);
        renderSlotList();
      });

      slotList.appendChild(el);
    });
  }

  function updateConfirmPreview() {
    const iso = dateInput.value;
    if (!iso || !confirmTime || isClosedByToggle() || isClosedByRule(parseISODate(iso))) {
      confirmPreviewEN.textContent = '—';
      confirmPreviewJP.textContent = '—';
      confirmPreviewDT.textContent = '—';
      return;
    }
    const dateObj = parseISODate(iso);
    confirmPreviewEN.textContent = `Your ${examLabelEN(selectedExam)} appointment is scheduled as follows.`;
    confirmPreviewJP.textContent = `以下の日程で${examLabelJP(selectedExam)}の予約が入っています。日付と時間をご確認ください。`;
    confirmPreviewDT.textContent = `${formatDateEN(dateObj)} at ${formatTimeEN(confirmTime)}`;
  }

  // ====== PATIENT RENDER ======
  function renderPatientAvailability() {
    const sorted = sortSlots(uniqueSlots(availableSlots));
    if (!sorted.length) {
      patientBody.innerHTML = `
        <div class="patient-msg-en">No available appointment slots are shown.</div>
        <div class="patient-msg-jp">現在、提示できる空き枠が表示されていません。</div>
        <div class="patient-block">
          <div class="patient-dt-en">Please ask our staff.</div>
          <div class="patient-dt-jp">スタッフにお声かけください。</div>
        </div>
      `;

    // Attach tap-to-select behavior (patient)
    const slotsWrap = document.getElementById('patientSlots');
    const selectedBox = document.getElementById('patientSelected');
    const selectedEN = document.getElementById('patientSelectedEN');
    const selectedJP = document.getElementById('patientSelectedJP');
    const okBtn = document.getElementById('patientConfirmChoiceBtn');
    const clearBtn = document.getElementById('patientClearChoiceBtn');

    if (slotsWrap) {
      const slotEls = Array.from(slotsWrap.querySelectorAll('.patient-slot'));
      slotEls.forEach(el => {
        el.addEventListener('click', () => {
          slotEls.forEach(x => x.classList.remove('is-selected'));
          el.classList.add('is-selected');
          patientChosenKey = el.getAttribute('data-key');

          const en = el.querySelector('.patient-slot-en')?.textContent || '';
          const jp = el.querySelector('.patient-slot-jp')?.textContent || '';

          selectedEN.textContent = `Selected: ${en}`;
          selectedJP.textContent = `選択：${jp}`;
          selectedBox.style.display = '';
          okBtn.style.display = '';
          clearBtn.style.display = '';
        });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        patientChosenKey = null;
        document.querySelectorAll('.patient-slot.is-selected').forEach(x => x.classList.remove('is-selected'));
        if (selectedBox) selectedBox.style.display = 'none';
        if (okBtn) okBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
      });
    }

    if (okBtn) {
      okBtn.addEventListener('click', () => {
        if (!patientChosenKey) return;

        const chosen = uniqueSlots(availableSlots).find(s => slotKey(s) === patientChosenKey);
        if (!chosen) return;

        const d = parseISODate(chosen.dateISO);
        patientBody.innerHTML = `
          <div class="patient-msg-en">You selected the following ${examLabelEN(chosen.examKey || selectedExam)} appointment slot.</div>
          <div class="patient-msg-jp">以下の${examLabelJP(chosen.examKey || selectedExam)}の日時を選びました。</div>

          <div class="patient-block">
            <div class="patient-dt-en">${formatDateEN(d)}</div>
            <div class="patient-dt-en" style="margin-top:8px;">${formatTimeEN(chosen.timeHM)}</div>
            <div class="patient-dt-jp">${formatDateJP(d)} ${formatTimeJP(chosen.timeHM)}</div>
          </div>

          <div class="patient-slot-hint">
            <div class="patient-slot-jp">Please show this screen to our staff.</div>
            <div class="patient-slot-jp">※ この画面をスタッフにお見せください。</div>
          </div>

          <div class="patient-cta">
            <button class="btn btn-ghost btn-wide" id="patientBackToListBtn" type="button">
              Back to list / 候補に戻る
            </button>
          </div>
        `;

        const backBtn = document.getElementById('patientBackToListBtn');
        if (backBtn) backBtn.addEventListener('click', () => renderPatientAvailability());
      });
    }

      return;
    }

    const slotsHtml = sorted.map(s => {
      const d = parseISODate(s.dateISO);
      const en = `${formatDateEN(d)} at ${formatTimeEN(s.timeHM)}`;
      const jp = `${formatDateJP(d)} ${formatTimeJP(s.timeHM)}`;
      return `
        <div class="patient-slot" data-key="${slotKey(s)}">
          <div class="patient-slot-en">${en}</div>
          <div class="patient-slot-jp">${jp}</div>
        </div>
      `;
    }).join('');

    patientBody.innerHTML = `
      <div class="patient-msg-en">${multiExam ? 'These are the available appointment slots.' : `These are the available appointment slots for your ${examLabelEN(selectedExam)}.`}</div>
      <div class="patient-msg-jp">${multiExam ? '以下の日程で検査の空きがあります。ご希望の日時をお選びください。' : `以下の日程で${examLabelJP(selectedExam)}の空きがあります。ご希望の日時をお選びください。`}</div>

      <div class="patient-slots" id="patientSlots">
        ${slotsHtml}
      </div>

      <div class="patient-slot-hint">
        <div class="patient-slot-jp">※ 30分刻みでご案内できます。</div>
      </div>

      <div class="patient-selected" id="patientSelected" style="display:none;">
        <div class="patient-selected__en" id="patientSelectedEN">—</div>
        <div class="patient-selected__jp" id="patientSelectedJP">—</div>
      </div>

      <div class="patient-cta">
        <button class="btn btn-primary btn-wide" id="patientConfirmChoiceBtn" type="button" style="display:none;">
          Confirm / この日時でOK
        </button>
        <button class="btn btn-ghost btn-wide" id="patientClearChoiceBtn" type="button" style="display:none;">
          Choose again / 選び直す
        </button>
      </div>
    `;
  }

  function renderPatientConfirm() {
    const iso = dateInput.value;
    if (!iso || !confirmTime) {
      patientBody.innerHTML = `
        <div class="patient-msg-en">Your appointment details are not selected yet.</div>
        <div class="patient-msg-jp">予約日時がまだ選択されていません。</div>
      `;
      return;
    }
    const dateObj = parseISODate(iso);

    if (isClosedByToggle() || isClosedByRule(dateObj)) {
      patientBody.innerHTML = `
        <div class="patient-msg-en">Our reception desk is closed on this date.</div>
        <div class="patient-msg-jp">この日は休診のため、受付できません。</div>
        <div class="patient-block">
          <div class="patient-dt-en">Please choose another date.</div>
          <div class="patient-dt-jp">別の日程をご提案します。</div>
        </div>
      `;
      return;
    }

    patientBody.innerHTML = `
      <div class="patient-msg-en">Your ${examLabelEN(selectedExam)} appointment is scheduled as follows.</div>
      <div class="patient-msg-jp">以下の日程で${examLabelJP(selectedExam)}の予約が入っています。日付と時間をご確認ください。</div>

      <div class="patient-block">
        <div class="patient-dt-en">${formatDateEN(dateObj)}</div>
        <div class="patient-dt-en" style="margin-top:8px;">${formatTimeEN(confirmTime)}</div>
        <div class="patient-dt-jp">${formatDateJP(dateObj)} ${formatTimeJP(confirmTime)}</div>
      </div>
    `;
  }

  function showPatient(mode) {
    patientMode = mode;
    if (mode === 'availability') renderPatientAvailability();
    else renderPatientConfirm();

    staffView.classList.add('is-hidden');
    patientView.classList.remove('is-hidden');

    toggleViewBtn.textContent = 'スタッフ画面に戻る / Back';
  }

  function showStaff() {
    patientView.classList.add('is-hidden');
    staffView.classList.remove('is-hidden');
    toggleViewBtn.textContent = '患者画面に切替 / Show to patient';
  }

  // ====== EVENTS ======
  function setActiveTab(which) {
    if (which === 'availability') {
      tabAvailability.classList.add('is-active');
      tabConfirm.classList.remove('is-active');
      availabilityPanel.classList.add('is-active');
      confirmPanel.classList.remove('is-active');
    } else {
      tabAvailability.classList.remove('is-active');
      tabConfirm.classList.add('is-active');
      availabilityPanel.classList.remove('is-active');
      confirmPanel.classList.add('is-active');
    }
  }

  tabAvailability.addEventListener('click', () => setActiveTab('availability'));
  tabConfirm.addEventListener('click', () => setActiveTab('confirm'));

  examType.addEventListener('change', () => {
    selectedExam = examType.value;
    updateConfirmPreview();
    if (!patientView.classList.contains('is-hidden')) {
      if (patientMode === 'availability') renderPatientAvailability();
      else renderPatientConfirm();
    }
  });

  dateInput.addEventListener('change', () => {
    selectedTimes = new Set();
    confirmTime = null;
    renderTimeGrids();
    renderSlotList();
  });

    
  clearSelectionBtn.addEventListener('click', () => {
    selectedTimes = new Set();
    renderTimeGrids();
  });

  addSlotsBtn.addEventListener('click', () => {
    const iso = dateInput.value;
    if (!iso) return alert('日付を選択してください。');
    if (isClosedByToggle() || isClosedByRule(parseISODate(iso))) {
      return alert('休診日のため、空き枠を追加できません。');
    }
    if (!selectedTimes.size) return alert('時間枠を選択してください。');

    const add = Array.from(selectedTimes).map(t => ({ dateISO: iso, timeHM: t, examKey: selectedExam }));
    availableSlots = uniqueSlots(availableSlots.concat(add));
    selectedTimes = new Set();
    renderTimeGrids();
    renderSlotList();
  });

  clearSlotsBtn.addEventListener('click', () => {
    availableSlots = [];
    renderSlotList();
  });

  showAvailabilityBtn.addEventListener('click', () => showPatient('availability'));

  confirmBtn.addEventListener('click', () => {
    if (!dateInput.value) return alert('日付を選択してください。');
    if (!confirmTime) return alert('時間枠を選択してください。');
    showPatient('confirm');
  });

  toggleViewBtn.addEventListener('click', () => {
    if (patientView.classList.contains('is-hidden')) {
      // show patient based on last used mode
      showPatient(patientMode);
    } else {
      showStaff();
    }
  });

  backToStaffBtn.addEventListener('click', showStaff);

  // ====== INIT ======
  dateInput.value = todayISO();
  renderTimeGrids();
  renderSlotList();
})();