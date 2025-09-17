// API helper
const api = (path, opts = {}) => fetch('/api' + path, opts).then(r => r.json ? r.json() : r.text());
const $ = id => document.getElementById(id);
function formatMoney(n) { return parseFloat(n || 0).toFixed(2); }

// ---- Page switching (sidebar + mobile bottom nav) ----
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

function activatePage(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');

  navButtons.forEach(b => {
    if (b.dataset.page === pageId) b.classList.add('active');
    else b.classList.remove('active');
  });
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    if (page) activatePage(page);
  });
});

// Show default page
const defaultBtn = document.querySelector(".nav-btn[data-page='entry']");
if (defaultBtn) activatePage('entry');

// ---- Parties ----
async function loadParties() {
  const parties = await api('/parties');
  const wrap = $('partyList');
  wrap.innerHTML = '';

  parties.forEach(p => {
    const card = document.createElement('div');
    card.className = 'party-card';
    const bal = parseFloat(p.balance || 0);

    let statusText = '';
    let statusClass = '';

    if (bal > 0) {
      statusText = `Collect ₹${formatMoney(bal)}`;
      statusClass = 'status-collect';
    } else if (bal < 0) {
      statusText = `Pay ₹${formatMoney(Math.abs(bal))}`;
      statusClass = 'status-pay';
    } else {
      statusText = 'Settled';
      statusClass = 'status-settled';
    }

    card.innerHTML = `
      <strong>${p.name}</strong>
      <div>${p.mobile || ''}</div>
      <div class="status ${statusClass}">${statusText}</div>
      <div class="party-actions">
        <button class="open" data-id="${p.id}">Open</button>
        <button class="export" data-id="${p.id}">Export CSV</button>
        <button class="delete" data-id="${p.id}">Delete</button>
      </div>
      <div class="party-details" id="party-details-${p.id}" style="margin-top:10px;"></div>
    `;
    wrap.appendChild(card);

    // Open button
    card.querySelector('.open').onclick = async () => {
      const id = p.id;
      document.querySelectorAll('.party-details').forEach(div => {
        if (div.id !== `party-details-${id}`) div.innerHTML = '';
      });
      const data = await api(`/party/${id}`);
      const detailsWrap = document.getElementById(`party-details-${id}`);
      if (data) {
        detailsWrap.innerHTML = `<h4>Transactions:</h4>
          <div>Balance: ${formatMoney(data.balance)}</div>
          <table class="data">
            <thead><tr>
              <th>Date</th><th>Purpose</th><th>Debit</th><th>Credit</th><th>Ref</th>
            </tr></thead>
            <tbody>
              ${data.entries.map(e => `<tr>
                <td>${e.date}</td>
                <td>${e.purpose || ''}</td>
                <td>${formatMoney(e.debit)}</td>
                <td>${formatMoney(e.credit)}</td>
                <td>${e.reference || ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>`;
      } else {
        detailsWrap.innerHTML = 'No transactions for this party.';
      }
    };

    // Export button
    card.querySelector('.export').onclick = () => {
      window.location = `/api/export/party/${p.id}/csv`;
    };

    // Delete button
    card.querySelector('.delete').onclick = async () => {
      if (confirm(`Are you sure you want to delete party "${p.name}"? This will remove all its transactions too.`)) {
        const resp = await fetch(`/api/party/${p.id}`, { method: 'DELETE' });
        const json = await resp.json();
        if (json.ok) loadParties();
        else alert('Error deleting: ' + (json.error || 'unknown'));
      }
    };
  });
}

// ---- Entry form ----
$('entryForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const body = {
    date: $('date').value || new Date().toISOString().slice(0,10),
    partyName: $('partyName').value.trim(),
    purpose: $('purpose').value.trim(),
    debit: parseFloat($('debit').value || 0),
    credit: parseFloat($('credit').value || 0),
    reference: $('reference').value.trim()
  };
  if (!body.partyName) return alert('party name required');

  const resp = await fetch('/api/entry', {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(body)
  });
  const json = await resp.json();
  if (json.ok) {
    $('entryForm').reset();
    loadParties();
    loadMonthsList();
  } else alert('Error: ' + (json.error || 'unknown'));
});

$('clearBtn').onclick = () => $('entryForm').reset();

// ---- Add party ----
$('partyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('pname').value.trim();
  if (!name) return alert('name required');
  const res = await fetch('/api/parties', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      name,
      mobile:$('pmobile').value.trim(),
      email:$('pemail').value.trim()
    })
  });
  const json = await res.json();
  if (json.ok) {
    $('partyForm').reset();
    loadParties();
  } else alert('error');
});

// ---- Monthly report ----
$('loadMonth').onclick = async () => {
  const m = $('monthPicker').value;
  if (!m) return alert('select month');
  const data = await api(`/month/${m}`);
  renderMonth(data);
};
$('exportMonthCSV').onclick = () => {
  const m = $('monthPicker').value;
  if (!m) return alert('select month');
  window.location = `/api/export/month/${m}/csv`;
};
$('exportMonthPDF').onclick = () => {
  const m = $('monthPicker').value;
  if (!m) return alert('select month');
  window.location = `/api/export/month/${m}/pdf`;
};

function renderMonth({ month, rows, totals }) {
  const wrap = $('monthTableWrap');
  wrap.innerHTML = `<h3>Month: ${month}</h3>
    <table class="data">
      <thead><tr><th>Date</th><th>Party</th><th>Purpose</th><th>Debit</th><th>Credit</th><th>Ref</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${r.date}</td><td>${r.party_name}</td><td>${r.purpose || ''}</td>
        <td>${formatMoney(r.debit)}</td><td>${formatMoney(r.credit)}</td><td>${r.reference || ''}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Totals</td><td>${formatMoney(totals.total_debit)}</td><td>${formatMoney(totals.total_credit)}</td><td></td></tr></tfoot>
    </table>`;
}

// ---- Months list ----
async function loadMonthsList() {
  const months = await api('/months');
  if (months && months.length && !$('monthPicker').value) $('monthPicker').value = months[0].month;
}

// ---- Init ----
(async function init() {
  $('date').value = new Date().toISOString().slice(0,10);
  await loadParties();
  await loadMonthsList();
})();

// ---- Account & Logout buttons ----
function openAccount() {
  window.location = "/change-credentials.html";
}
function logout() {
  localStorage.removeItem("user");
  window.location = "/login.html";
}

['accountBtn', 'accountBtnMobile'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', openAccount);
});
['logoutBtn', 'logoutBtnMobile'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', logout);
});
