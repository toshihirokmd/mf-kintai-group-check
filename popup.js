(async function () {
  'use strict';

  // --- State ---
  let allEmployees = []; // { id, name }
  let groups = {};       // { groupName: [name, ...] }
  let editingGroup = null; // null = new, string = editing existing

  // --- DOM refs ---
  const groupsList = document.getElementById('groups-list');
  const editPanel = document.getElementById('edit-panel');
  const groupsPanel = document.getElementById('groups-panel');
  const groupNameInput = document.getElementById('group-name-input');
  const employeeListEl = document.getElementById('employee-list');
  const searchBox = document.getElementById('search-employee');
  const selectedCountEl = document.getElementById('selected-count');
  const editStatus = document.getElementById('edit-status');
  const tabs = document.querySelectorAll('.tab');

  // --- Init ---
  await loadData();
  renderGroups();

  // --- Tab switching ---
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab.dataset.tab + '-panel').classList.add('active');
    });
  });

  // --- Load data ---
  async function loadData() {
    const data = await chrome.storage.sync.get(['groups']);
    groups = data.groups || {};

    // ページから従業員リストを取得
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url?.includes('attendance.moneyforward.com')) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getEmployees' });
        if (response?.employees?.length > 0) {
          allEmployees = response.employees;
          await chrome.storage.sync.set({ employees: allEmployees });
          return;
        }
      }
    } catch (e) { /* content script not ready */ }

    // フォールバック: storage から取得
    const cached = await chrome.storage.sync.get(['employees']);
    allEmployees = cached.employees || [];
  }

  // --- Render groups list ---
  function renderGroups() {
    if (Object.keys(groups).length === 0) {
      groupsList.innerHTML = '<div class="empty">グループがありません</div>';
      return;
    }

    groupsList.innerHTML = '';
    for (const [name, members] of Object.entries(groups)) {
      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <div class="group-header">
          <span class="group-name">${escapeHtml(name)}</span>
          <div class="group-actions">
            <button class="btn-edit" data-group="${escapeHtml(name)}">編集</button>
            <button class="btn-delete" data-group="${escapeHtml(name)}">削除</button>
          </div>
        </div>
        <div class="group-count">${members.length}名</div>
        <div class="group-members">${members.map(escapeHtml).join(', ')}</div>
      `;
      groupsList.appendChild(card);
    }

    // イベント
    groupsList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => startEdit(btn.dataset.group));
    });
    groupsList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteGroup(btn.dataset.group));
    });
  }

  // --- Render employee checkboxes ---
  function renderEmployees(filter = '') {
    employeeListEl.innerHTML = '';
    const selected = getSelectedNames();
    const filterLower = filter.toLowerCase();

    const list = allEmployees.length > 0
      ? allEmployees
      : getEmployeesFromGroups();

    for (const emp of list) {
      const name = emp.name || emp;
      if (filter && !name.toLowerCase().includes(filterLower) && !(emp.id || '').includes(filter)) continue;

      const item = document.createElement('div');
      item.className = 'employee-item';
      const checked = selected.has(normalizeName(name)) ? 'checked' : '';
      item.innerHTML = `
        <input type="checkbox" id="emp-${emp.id || name}" value="${escapeHtml(name)}" ${checked}>
        <label for="emp-${emp.id || name}">${emp.id ? emp.id + ': ' : ''}${escapeHtml(name)}</label>
      `;
      employeeListEl.appendChild(item);
    }

    updateSelectedCount();

    // チェックボックス変更時にカウント更新
    employeeListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateSelectedCount);
    });
  }

  function getEmployeesFromGroups() {
    const nameSet = new Set();
    const result = [];
    for (const members of Object.values(groups)) {
      for (const name of members) {
        const n = normalizeName(name);
        if (!nameSet.has(n)) {
          nameSet.add(n);
          result.push({ name, id: '' });
        }
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  function getSelectedNames() {
    if (!editingGroup || !groups[editingGroup]) return new Set();
    return new Set(groups[editingGroup].map(normalizeName));
  }

  function updateSelectedCount() {
    const count = employeeListEl.querySelectorAll('input:checked').length;
    selectedCountEl.textContent = `${count}名選択中`;
  }

  function normalizeName(name) {
    return name.replace(/[\s\u3000]+/g, ' ').trim();
  }

  // --- Edit mode ---
  function startEdit(groupName) {
    editingGroup = groupName || null;
    groupNameInput.value = groupName || '';

    switchTab('edit');
    renderEmployees();
    editStatus.innerHTML = '';
  }

  document.getElementById('btn-new-group').addEventListener('click', () => {
    editingGroup = null;
    groupNameInput.value = '';
    switchTab('edit');
    renderEmployees();
    editStatus.innerHTML = '';
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    switchTab('groups');
  });

  // --- Save ---
  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = groupNameInput.value.trim();
    if (!name) {
      editStatus.innerHTML = '<div class="status status-warn">グループ名を入力してください</div>';
      return;
    }

    const checked = employeeListEl.querySelectorAll('input:checked');
    const members = Array.from(checked).map(cb => cb.value);

    if (members.length === 0) {
      editStatus.innerHTML = '<div class="status status-warn">メンバーを1名以上選択してください</div>';
      return;
    }

    // 名前変更時に旧グループを削除
    if (editingGroup && editingGroup !== name) {
      delete groups[editingGroup];
    }

    groups[name] = members;
    await chrome.storage.sync.set({ groups });

    notifyContentScript();
    switchTab('groups');
    renderGroups();
  });

  // --- Delete ---
  async function deleteGroup(name) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    delete groups[name];
    await chrome.storage.sync.set({ groups });
    notifyContentScript();
    renderGroups();
  }

  // --- Select all / Deselect all ---
  document.getElementById('btn-select-all').addEventListener('click', () => {
    employeeListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.closest('.employee-item').style.display !== 'none') cb.checked = true;
    });
    updateSelectedCount();
  });

  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    employeeListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateSelectedCount();
  });

  // --- Search ---
  searchBox.addEventListener('input', () => {
    const filter = searchBox.value.trim();
    const items = employeeListEl.querySelectorAll('.employee-item');
    items.forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = !filter || text.includes(filter.toLowerCase()) ? '' : 'none';
    });
  });

  // --- Helpers ---
  function switchTab(tabName) {
    tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(tabName + '-panel').classList.add('active');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function notifyContentScript() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'refreshButtons' });
    } catch (e) { /* ignore */ }
  }
})();
