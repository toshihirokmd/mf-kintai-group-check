(function () {
  'use strict';

  const CONTAINER_ID = 'mf-group-buttons';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeName(name) {
    return name.replace(/[\s　]+/g, ' ').trim();
  }

  // vue-multiselect は mousedown.prevent を使うため click では発火しない
  function fireMouseDown(el) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 0, view: window
    }));
    el.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, button: 0, view: window
    }));
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, button: 0, view: window
    }));
  }

  // 選択肢テキストを取り出す。v1.0.0 と同じ「最初の div」を優先し、
  // 無い場合のみ .multiselect__option / 要素全体にフォールバックする
  function getOptionText(optionEl) {
    const div = optionEl.querySelector('div');
    if (div) {
      const t = div.textContent?.trim() || '';
      if (t) return t;
    }
    const opt = optionEl.querySelector('.multiselect__option');
    return opt?.textContent?.trim() || optionEl.textContent?.trim() || '';
  }

  // 従業員マルチセレクトを探す
  // "数字: 名前" パターンの選択肢を1つでも持つ .multiselect が対象
  // 複数ある場合は最も多くマッチするものを採用（部署選択等との誤認識を防ぐ）
  function findEmployeeMultiselect() {
    const multiselects = document.querySelectorAll('.multiselect');
    let best = null;
    let bestCount = 0;
    for (const ms of multiselects) {
      let count = 0;
      ms.querySelectorAll('.multiselect__element').forEach(li => {
        const text = getOptionText(li);
        if (/^\d+:\s/.test(text)) count++;
      });
      if (count > bestCount) {
        best = ms;
        bestCount = count;
      }
    }
    return best;
  }

  // 従業員リストを取得
  function getEmployees(ms) {
    const employees = [];
    ms.querySelectorAll('.multiselect__element').forEach(li => {
      const text = getOptionText(li);
      if (!text) return;
      const m = text.match(/^(\d+):\s*(.+)$/);
      if (m) employees.push({ id: m[1], name: m[2].trim() });
    });
    return employees;
  }

  // ドロップダウンを開く（vue-multiselect は focus で activate）
  async function openDropdown(ms) {
    const input = ms.querySelector('.multiselect__input');
    const tags = ms.querySelector('.multiselect__tags');
    if (input) {
      input.focus();
      // focus だけで開かない実装のため mousedown もフォールバックで送る
      if (tags) fireMouseDown(tags);
    } else if (tags) {
      fireMouseDown(tags);
    }
    await sleep(200);
  }

  // ドロップダウンを閉じる
  function closeDropdown(ms) {
    const input = ms.querySelector('.multiselect__input');
    if (input) input.blur();
  }

  // 検索入力をクリア（選択肢のフィルタを解除）
  async function clearSearch(ms) {
    const input = ms.querySelector('.multiselect__input');
    if (input && input.value !== '') {
      // ネイティブ setter 経由で値を設定しないと Vue に検知されない
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80);
    }
  }

  // オプションを選択/解除（vue-multiselect は mousedown.prevent をリッスン）
  async function toggleOption(optionEl) {
    const span = optionEl.querySelector('.multiselect__option') || optionEl.querySelector('span');
    fireMouseDown(span);
  }

  // ドロップダウンが閉じていたら開き直す
  async function ensureOpen(ms) {
    const wrapper = ms.querySelector('.multiselect__content-wrapper');
    if (!wrapper || wrapper.style.display === 'none') {
      await openDropdown(ms);
    }
  }

  // グループメンバーを一括選択
  async function selectGroup(ms, memberNames) {
    const targetNames = new Set(memberNames.map(normalizeName));

    await openDropdown(ms);
    await clearSearch(ms);
    await ensureOpen(ms);

    // 現在の選択を全解除
    const selected = Array.from(ms.querySelectorAll('.multiselect__element[aria-selected="true"]'));
    for (const el of selected) {
      await toggleOption(el);
      await sleep(40);
      await ensureOpen(ms);
    }
    await sleep(100);
    await clearSearch(ms);
    await ensureOpen(ms);

    // 対象メンバーを選択
    const options = ms.querySelectorAll('.multiselect__element');
    let count = 0;
    let notFound = [];
    const foundNames = new Set();

    for (const option of options) {
      const text = getOptionText(option);
      if (!text) continue;
      const m = text.match(/^(\d+):\s*(.+)$/);
      if (!m) continue;
      const name = normalizeName(m[2]);
      if (!targetNames.has(name)) continue;
      foundNames.add(name);
      if (option.getAttribute('aria-selected') === 'true') continue;

      await toggleOption(option);
      count++;
      await sleep(40);
      await ensureOpen(ms);
    }

    // ターゲットに含まれるが選択肢になかった名前を検出
    for (const n of targetNames) {
      if (!foundNames.has(n)) notFound.push(n);
    }

    await sleep(100);
    closeDropdown(ms);
    document.body.click();

    if (notFound.length > 0) {
      showToast(`${count}名を選択（${notFound.length}名未検出: ${notFound.slice(0, 2).join('、')}${notFound.length > 2 ? '…' : ''}）`);
    } else {
      showToast(`${count}名を選択しました`);
    }
  }

  // 選択をクリア
  async function clearSelection(ms) {
    await openDropdown(ms);
    await clearSearch(ms);
    await ensureOpen(ms);

    const selected = Array.from(ms.querySelectorAll('.multiselect__element[aria-selected="true"]'));
    for (const el of selected) {
      await toggleOption(el);
      await sleep(40);
      await ensureOpen(ms);
    }

    await sleep(100);
    closeDropdown(ms);
    document.body.click();
    showToast('選択をクリアしました');
  }

  // トースト通知
  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      background: #323232; color: #fff; padding: 12px 24px;
      border-radius: 8px; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.3);
      transition: opacity .3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ボタンUIを注入
  async function injectUI() {
    const ms = findEmployeeMultiselect();
    if (!ms) {
      setTimeout(injectUI, 1500);
      return;
    }

    document.getElementById(CONTAINER_ID)?.remove();

    const data = await chrome.storage.sync.get(['groups']);
    const groups = data.groups || {};
    if (Object.keys(groups).length === 0) return;

    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText = `
      margin: 6px 0 10px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
    `;

    const label = document.createElement('span');
    label.textContent = 'グループ選択:';
    label.style.cssText = 'font-size: 13px; font-weight: bold; color: #555; margin-right: 4px;';
    container.appendChild(label);

    const colors = ['#1a73e8', '#0d652d', '#8430ce', '#c5221f', '#e37400'];
    let colorIdx = 0;
    for (const [name, members] of Object.entries(groups)) {
      const color = colors[colorIdx++ % colors.length];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${name} (${members.length}名)`;
      btn.style.cssText = `
        padding: 5px 14px; border: 2px solid ${color}; background: #fff;
        color: ${color}; border-radius: 20px; cursor: pointer; font-size: 13px;
        font-weight: 600; transition: all .15s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = color;
        btn.style.color = '#fff';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#fff';
        btn.style.color = color;
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // クリック時に再度 multiselect を探し直す（再レンダリング対策）
        const currentMs = findEmployeeMultiselect() || ms;
        selectGroup(currentMs, members);
      });
      container.appendChild(btn);
    }

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'クリア';
    clearBtn.style.cssText = `
      padding: 5px 14px; border: 1px solid #999; background: #fff;
      color: #666; border-radius: 20px; cursor: pointer; font-size: 12px;
      transition: all .15s;
    `;
    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.background = '#f5f5f5';
    });
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.background = '#fff';
    });
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentMs = findEmployeeMultiselect() || ms;
      clearSelection(currentMs);
    });
    container.appendChild(clearBtn);

    ms.parentElement.insertBefore(container, ms);
  }

  // popup からのメッセージ受信
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getEmployees') {
      const ms = findEmployeeMultiselect();
      sendResponse({
        employees: ms ? getEmployees(ms) : []
      });
    } else if (request.action === 'refreshButtons') {
      injectUI();
      sendResponse({ ok: true });
    }
    return true;
  });

  // storage 変更時にボタンを再描画
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.groups) injectUI();
  });

  // 初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectUI, 1500));
  } else {
    setTimeout(injectUI, 1500);
  }
})();
