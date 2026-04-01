(function () {
  'use strict';

  const CONTAINER_ID = 'mf-group-buttons';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeName(name) {
    return name.replace(/[\s\u3000]+/g, ' ').trim();
  }

  // 従業員マルチセレクトを探す（"数字: 名前" パターンのオプションを持つもの）
  function findEmployeeMultiselect() {
    const multiselects = document.querySelectorAll('.multiselect');
    for (const ms of multiselects) {
      const firstOption = ms.querySelector('.multiselect__element div');
      if (firstOption && /^\d+:\s/.test(firstOption.textContent.trim())) {
        return ms;
      }
    }
    return null;
  }

  // 従業員リストを取得
  function getEmployees(ms) {
    const employees = [];
    ms.querySelectorAll('.multiselect__element').forEach(li => {
      const text = li.querySelector('div')?.textContent?.trim();
      if (!text) return;
      const m = text.match(/^(\d+):\s*(.+)$/);
      if (m) employees.push({ id: m[1], name: m[2].trim() });
    });
    return employees;
  }

  // グループメンバーを一括選択
  async function selectGroup(ms, memberNames) {
    const targetNames = new Set(memberNames.map(normalizeName));
    const tags = ms.querySelector('.multiselect__tags');

    // ドロップダウンを開く
    tags.click();
    await sleep(300);

    // 現在の選択を全解除
    let selected = ms.querySelectorAll('.multiselect__element[aria-selected="true"]');
    for (const el of selected) {
      el.querySelector('span').click();
      await sleep(30);
    }
    await sleep(100);

    // ドロップダウンが閉じていたら再度開く
    const wrapper = ms.querySelector('.multiselect__content-wrapper');
    if (wrapper && wrapper.style.display === 'none') {
      tags.click();
      await sleep(300);
    }

    // 対象メンバーを選択
    const options = ms.querySelectorAll('.multiselect__element');
    let count = 0;
    for (const option of options) {
      const text = option.querySelector('div')?.textContent?.trim();
      if (!text) continue;
      const m = text.match(/^(\d+):\s*(.+)$/);
      if (!m) continue;
      const name = normalizeName(m[2]);
      if (targetNames.has(name) && option.getAttribute('aria-selected') !== 'true') {
        option.querySelector('span').click();
        count++;
        await sleep(30);
      }
    }

    // ドロップダウンを閉じる
    await sleep(100);
    document.activeElement?.blur();
    document.body.click();

    showToast(`${count}名を選択しました`);
  }

  // 選択をクリア
  async function clearSelection(ms) {
    const tags = ms.querySelector('.multiselect__tags');
    tags.click();
    await sleep(300);

    const selected = ms.querySelectorAll('.multiselect__element[aria-selected="true"]');
    for (const el of selected) {
      el.querySelector('span').click();
      await sleep(30);
    }

    await sleep(100);
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
    }, 2000);
  }

  // ボタンUIを注入
  async function injectUI() {
    const ms = findEmployeeMultiselect();
    if (!ms) {
      setTimeout(injectUI, 1500);
      return;
    }

    // 既存のUIがあれば削除
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

    // グループボタン
    const colors = ['#1a73e8', '#0d652d', '#8430ce', '#c5221f', '#e37400'];
    let colorIdx = 0;
    for (const [name, members] of Object.entries(groups)) {
      const color = colors[colorIdx++ % colors.length];
      const btn = document.createElement('button');
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
        selectGroup(ms, members);
      });
      container.appendChild(btn);
    }

    // クリアボタン
    const clearBtn = document.createElement('button');
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
      clearSelection(ms);
    });
    container.appendChild(clearBtn);

    // マルチセレクトの直前に挿入
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
