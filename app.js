'use strict';

const APP_VERSION = '1.0.1';
const DB_NAME = 'ascension-suivi-db';
const DB_VERSION = 1;
const ACTION_FIELDS = [
  ['decisionAutonome', 'Décisions autonomes'],
  ['blocConcentration', 'Blocs de concentration'],
  ['actionSeul', 'Actions réalisées seul'],
  ['activitePhysique', 'Activités physiques'],
  ['initiativeSociale', 'Initiatives sociales'],
  ['tacheTerminee', 'Tâches terminées']
];

let dbPromise;
let deferredInstallPrompt = null;
let pendingImport = null;
let confirmResolver = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function localDateISO(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function parseISODate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value, options = { dateStyle: 'medium' }) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-BE', options).format(parseISODate(value));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(date = new Date()) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function storeRequest(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbGet = (store, key) => storeRequest(store, 'readonly', s => s.get(key));
const dbGetAll = store => storeRequest(store, 'readonly', s => s.getAll());
const dbPut = (store, value) => storeRequest(store, 'readwrite', s => s.put(value));
const dbDelete = (store, key) => storeRequest(store, 'readwrite', s => s.delete(key));
const dbClear = store => storeRequest(store, 'readwrite', s => s.clear());

async function getSettings() {
  const record = await dbGet('settings', 'profile');
  return {
    displayName: '',
    activeProject: '',
    guidingSentence: '',
    reviewDay: '0',
    ...(record?.value || {})
  };
}

async function setSettings(value) {
  await dbPut('settings', { key: 'profile', value, updatedAt: new Date().toISOString() });
}

function setSaveStatus(message) {
  const el = $('#saveStatus');
  if (!el) return;
  el.textContent = message;
  window.clearTimeout(setSaveStatus.timeout);
  setSaveStatus.timeout = window.setTimeout(() => { el.textContent = 'Données locales'; }, 1800);
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => el.classList.remove('show'), 2600);
}

function confirmAction(title, message, acceptLabel = 'Confirmer') {
  const dialog = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmAccept').textContent = acceptLabel;
  dialog.showModal();
  return new Promise(resolve => { confirmResolver = resolve; });
}

function navigateTo(viewName) {
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === viewName));
  $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === viewName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#app').focus({ preventScroll: true });
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'goals') renderGoals();
  if (viewName === 'journal') renderJournal();
  if (viewName === 'analysis') renderAnalysis();
  if (viewName === 'settings') loadSettingsForm();
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function loadTodayForm() {
  const today = localDateISO();
  $('#todayDateLabel').textContent = formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' });
  const form = $('#dailyForm');
  const entry = await dbGet('daily', today);
  form.reset();
  form.elements.humeur.value = entry?.humeur ?? 5;
  form.elements.energie.value = entry?.energie ?? 5;
  form.elements.stress.value = entry?.stress ?? 5;
  for (const [field] of ACTION_FIELDS) form.elements[field].checked = Boolean(entry?.[field]);
  for (const field of ['difficulteAnticipee', 'difficulteReelle', 'causeEchec', 'reussite', 'evitement', 'demain']) {
    form.elements[field].value = entry?.[field] ?? '';
  }
  updateRangeOutputs();
}

function updateRangeOutputs() {
  const form = $('#dailyForm');
  $('#moodOutput').value = form.elements.humeur.value;
  $('#energyOutput').value = form.elements.energie.value;
  $('#stressOutput').value = form.elements.stress.value;
}

async function saveDailyEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const entry = {
    date: localDateISO(),
    humeur: Number(data.humeur),
    energie: Number(data.energie),
    stress: Number(data.stress),
    difficulteAnticipee: data.difficulteAnticipee === '' ? null : Number(data.difficulteAnticipee),
    difficulteReelle: data.difficulteReelle === '' ? null : Number(data.difficulteReelle),
    causeEchec: data.causeEchec || '',
    reussite: data.reussite?.trim() || '',
    evitement: data.evitement?.trim() || '',
    demain: data.demain?.trim() || '',
    updatedAt: new Date().toISOString()
  };
  for (const [field] of ACTION_FIELDS) entry[field] = form.elements[field].checked;
  await dbPut('daily', entry);
  setSaveStatus('Journée enregistrée');
  toast('Journée enregistrée sur cet appareil.');
  renderDashboard();
}

function clearTodayFields() {
  const form = $('#dailyForm');
  form.reset();
  form.elements.humeur.value = 5;
  form.elements.energie.value = 5;
  form.elements.stress.value = 5;
  updateRangeOutputs();
}

function actionCount(entry) {
  return ACTION_FIELDS.reduce((sum, [field]) => sum + (entry?.[field] ? 1 : 0), 0);
}

async function renderDashboard() {
  const [daily, goals, settings] = await Promise.all([dbGetAll('daily'), dbGetAll('goals'), getSettings()]);
  const weekStart = startOfWeek();
  const weekEnd = endOfWeek();
  const startISO = localDateISO(weekStart);
  const endISO = localDateISO(weekEnd);
  const weekEntries = daily.filter(item => item.date >= startISO && item.date <= endISO);

  $('#weekTitle').textContent = `${settings.displayName || 'Ta'} — semaine du ${formatDate(startISO, { day: 'numeric', month: 'short' })}`;
  const totalDone = weekEntries.reduce((sum, entry) => sum + actionCount(entry), 0);
  const possible = Math.max(weekEntries.length * ACTION_FIELDS.length, ACTION_FIELDS.length);
  const score = Math.round((totalDone / possible) * 100);
  $('#weeklyScore').textContent = `${score}%`;
  $('#weekSummary').textContent = weekEntries.length
    ? `${weekEntries.length} jour${weekEntries.length > 1 ? 's' : ''} enregistré${weekEntries.length > 1 ? 's' : ''}. ${settings.guidingSentence || ''}`
    : 'Commence par enregistrer ta journée.';

  const sumField = field => weekEntries.filter(entry => entry[field]).length;
  $('#metricDecisions').textContent = sumField('decisionAutonome');
  $('#metricFocus').textContent = sumField('blocConcentration');
  $('#metricSolo').textContent = sumField('actionSeul');
  $('#metricPhysical').textContent = sumField('activitePhysique');

  const today = daily.find(entry => entry.date === localDateISO());
  const todayPreview = $('#todayPreview');
  if (!today) {
    todayPreview.className = 'task-list empty-state';
    todayPreview.textContent = 'Aucune journée enregistrée aujourd’hui.';
  } else {
    todayPreview.className = 'task-list';
    todayPreview.innerHTML = ACTION_FIELDS.map(([field, label]) => `
      <div class="task-item ${today[field] ? 'done' : ''}">
        <span>${today[field] ? '✓' : '○'} ${escapeHtml(label)}</span>
        <span class="chip ${today[field] ? '' : 'neutral'}">${today[field] ? 'Réalisé' : 'Non coché'}</span>
      </div>`).join('');
  }

  const activeGoals = goals.filter(goal => goal.status !== 'archive');
  const principal = activeGoals.find(goal => goal.principal) || activeGoals[0];
  const goalPreview = $('#activeGoalPreview');
  if (!principal) {
    goalPreview.className = 'empty-state';
    goalPreview.textContent = 'Aucun objectif actif.';
  } else {
    const progress = goalWeekProgress(principal);
    const pct = Math.min(100, Math.round((progress / Number(principal.cible || 1)) * 100));
    goalPreview.className = '';
    goalPreview.innerHTML = `
      <div class="item-main">
        <h3>${escapeHtml(principal.titre)}</h3>
        <p>${escapeHtml(principal.definition)}</p>
      </div>
      <div class="bar-row" style="margin-top:14px">
        <div class="bar-label"><span>${progress}/${principal.cible} cette semaine</span><strong>${pct}%</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  const insight = computeDashboardInsight(weekEntries);
  $('#insightTitle').textContent = insight.title;
  $('#insightText').textContent = insight.text;
}

function computeDashboardInsight(entries) {
  if (!entries.length) return { title: 'Premier constat à venir', text: 'Après quelques entrées, l’application comparera tes intentions et tes actions réelles.' };
  const difficultyEntries = entries.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  if (difficultyEntries.length) {
    const gap = difficultyEntries.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficultyEntries.length;
    if (gap >= 1) return { title: 'L’anticipation semble plus lourde que le réel', text: `Sur les situations mesurées cette semaine, la difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point${gap >= 2 ? 's' : ''} en moyenne.` };
  }
  const topAction = ACTION_FIELDS
    .map(([field, label]) => ({ label, count: entries.filter(e => e[field]).length }))
    .sort((a, b) => b.count - a.count)[0];
  return { title: 'Comportement le plus constant', text: `${topAction.label} : ${topAction.count} réalisation${topAction.count > 1 ? 's' : ''} enregistrée${topAction.count > 1 ? 's' : ''} cette semaine.` };
}

function goalWeekProgress(goal, referenceDate = new Date()) {
  const start = localDateISO(startOfWeek(referenceDate));
  const end = localDateISO(endOfWeek(referenceDate));
  return (goal.completions || []).filter(date => date >= start && date <= end).length;
}

async function createGoal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const goals = await dbGetAll('goals');
  if (form.elements.principal.checked) {
    await Promise.all(goals.map(goal => dbPut('goals', { ...goal, principal: false })));
  }
  const goal = {
    id: uid('goal'),
    titre: data.titre.trim(),
    categorie: data.categorie,
    definition: data.definition.trim(),
    cible: Number(data.cible),
    dateDebut: data.dateDebut,
    dateRevision: data.dateRevision,
    principal: form.elements.principal.checked,
    status: 'actif',
    completions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await dbPut('goals', goal);
  form.reset();
  form.classList.add('hidden');
  setDefaultGoalDates();
  toast('Objectif créé.');
  renderGoals();
  renderDashboard();
}

function setDefaultGoalDates() {
  const form = $('#goalForm');
  const today = new Date();
  const revision = new Date(today);
  revision.setDate(revision.getDate() + 28);
  form.elements.dateDebut.value = localDateISO(today);
  form.elements.dateRevision.value = localDateISO(revision);
  form.elements.cible.value = 2;
}

async function renderGoals() {
  const goals = (await dbGetAll('goals')).sort((a, b) => Number(b.principal) - Number(a.principal) || b.createdAt.localeCompare(a.createdAt));
  const list = $('#goalsList');
  if (!goals.length) {
    list.className = 'list-stack empty-state';
    list.textContent = 'Aucun objectif créé.';
    return;
  }
  list.className = 'list-stack';
  list.innerHTML = goals.map(goal => {
    const progress = goalWeekProgress(goal);
    const pct = Math.min(100, Math.round((progress / Number(goal.cible || 1)) * 100));
    const revisionPassed = goal.dateRevision < localDateISO();
    return `
      <article class="list-item" data-goal-id="${escapeHtml(goal.id)}">
        <div class="item-main">
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px">
            <span class="chip">${escapeHtml(goal.categorie)}</span>
            ${goal.principal ? '<span class="chip warning">Principal</span>' : ''}
            ${goal.status === 'archive' ? '<span class="chip neutral">Archivé</span>' : ''}
            ${revisionPassed && goal.status !== 'archive' ? '<span class="chip warning">Révision attendue</span>' : ''}
          </div>
          <h3>${escapeHtml(goal.titre)}</h3>
          <p>${escapeHtml(goal.definition)}</p>
          <p style="margin-top:8px">Cycle : ${formatDate(goal.dateDebut)} → ${formatDate(goal.dateRevision)}</p>
          <div class="bar-row" style="margin-top:12px">
            <div class="bar-label"><span>${progress}/${goal.cible} cette semaine</span><strong>${pct}%</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
        <div class="item-actions">
          ${goal.status !== 'archive' ? `<button class="small-button" type="button" data-goal-action="complete">+1 action</button>
          <button class="small-button" type="button" data-goal-action="undo">Annuler 1</button>
          <button class="small-button" type="button" data-goal-action="principal">Principal</button>
          <button class="small-button" type="button" data-goal-action="archive">Archiver</button>` : `<button class="small-button" type="button" data-goal-action="restore">Réactiver</button>`}
          <button class="small-button danger" type="button" data-goal-action="delete">Supprimer</button>
        </div>
      </article>`;
  }).join('');
}

async function handleGoalAction(event) {
  const button = event.target.closest('[data-goal-action]');
  if (!button) return;
  const item = button.closest('[data-goal-id]');
  const id = item.dataset.goalId;
  const action = button.dataset.goalAction;
  const goal = await dbGet('goals', id);
  if (!goal) return;

  if (action === 'complete') goal.completions = [...(goal.completions || []), localDateISO()];
  if (action === 'undo') {
    const completions = [...(goal.completions || [])];
    const todayIndex = completions.lastIndexOf(localDateISO());
    if (todayIndex >= 0) completions.splice(todayIndex, 1);
    else completions.pop();
    goal.completions = completions;
  }
  if (action === 'principal') {
    const allGoals = await dbGetAll('goals');
    await Promise.all(allGoals.map(g => dbPut('goals', { ...g, principal: g.id === id, updatedAt: new Date().toISOString() })));
    toast('Objectif principal modifié.');
    renderGoals();
    renderDashboard();
    return;
  }
  if (action === 'archive') goal.status = 'archive';
  if (action === 'restore') goal.status = 'actif';
  if (action === 'delete') {
    const accepted = await confirmAction('Supprimer cet objectif ?', 'Cette opération retire l’objectif et son historique de validation.', 'Supprimer');
    if (!accepted) return;
    await dbDelete('goals', id);
    toast('Objectif supprimé.');
    renderGoals();
    renderDashboard();
    return;
  }
  goal.updatedAt = new Date().toISOString();
  await dbPut('goals', goal);
  renderGoals();
  renderDashboard();
}

async function createJournalEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const entry = {
    id: uid('journal'),
    date: data.date,
    type: data.type,
    titre: data.titre.trim(),
    contenu: data.contenu.trim(),
    pointSuivi: data.pointSuivi?.trim() || '',
    createdAt: new Date().toISOString()
  };
  await dbPut('journal', entry);
  form.reset();
  form.elements.date.value = localDateISO();
  toast('Entrée ajoutée au journal.');
  renderJournal();
}

async function renderJournal() {
  const entries = (await dbGetAll('journal')).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const list = $('#journalList');
  if (!entries.length) {
    list.className = 'list-stack empty-state';
    list.textContent = 'Aucune entrée de journal.';
    return;
  }
  list.className = 'list-stack';
  list.innerHTML = entries.map(entry => `
    <article class="list-item" data-journal-id="${escapeHtml(entry.id)}">
      <div class="item-main">
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px"><span class="chip">${escapeHtml(entry.type)}</span><span class="chip neutral">${formatDate(entry.date)}</span></div>
        <h3>${escapeHtml(entry.titre)}</h3>
        <p>${escapeHtml(entry.contenu)}</p>
        ${entry.pointSuivi ? `<p style="margin-top:10px"><strong>À surveiller :</strong> ${escapeHtml(entry.pointSuivi)}</p>` : ''}
      </div>
      <div class="item-actions"><button class="small-button danger" type="button" data-journal-action="delete">Supprimer</button></div>
    </article>`).join('');
}

async function handleJournalAction(event) {
  const button = event.target.closest('[data-journal-action]');
  if (!button) return;
  const item = button.closest('[data-journal-id]');
  const accepted = await confirmAction('Supprimer cette entrée ?', 'Cette opération retire définitivement l’entrée du journal.', 'Supprimer');
  if (!accepted) return;
  await dbDelete('journal', item.dataset.journalId);
  toast('Entrée supprimée.');
  renderJournal();
}

function filterByDays(items, days, dateField = 'date') {
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - Number(days) + 1);
  const thresholdISO = localDateISO(threshold);
  return items.filter(item => item[dateField] >= thresholdISO);
}

async function renderAnalysis() {
  const period = Number($('#analysisPeriod').value || 30);
  const allDaily = await dbGetAll('daily');
  const daily = filterByDays(allDaily, period);
  $('#analysisDays').textContent = daily.length;

  const possible = daily.length * ACTION_FIELDS.length;
  const performed = daily.reduce((sum, entry) => sum + actionCount(entry), 0);
  $('#analysisActionRate').textContent = possible ? `${Math.round(performed / possible * 100)}%` : '0%';

  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  $('#analysisDifficultyGap').textContent = gap === null ? '—' : `${gap >= 0 ? '+' : ''}${gap.toFixed(1)}`;
  const energy = daily.length ? daily.reduce((sum, e) => sum + Number(e.energie || 0), 0) / daily.length : null;
  $('#analysisEnergy').textContent = energy === null ? '—' : energy.toFixed(1);

  const bars = ACTION_FIELDS.map(([field, label]) => ({ label, count: daily.filter(e => e[field]).length, total: daily.length }));
  $('#actionBars').innerHTML = bars.length ? bars.map(item => {
    const pct = item.total ? Math.round(item.count / item.total * 100) : 0;
    return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(item.label)}</span><strong>${item.count}/${item.total}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  }).join('') : '<div class="empty-state">Pas encore de données.</div>';

  const causeCounts = new Map();
  daily.filter(e => e.causeEchec).forEach(e => causeCounts.set(e.causeEchec, (causeCounts.get(e.causeEchec) || 0) + 1));
  const topCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  $('#failureInsight').className = topCause ? '' : 'empty-state';
  $('#failureInsight').innerHTML = topCause
    ? `<div class="insight-card"><strong>${escapeHtml(topCause[0])}</strong><span>${topCause[1]} occurrence${topCause[1] > 1 ? 's' : ''} sur la période. C’est une fréquence observée, pas une explication automatique.</span></div>`
    : 'Pas encore assez de données.';

  $('#operationalInsights').innerHTML = buildOperationalInsights(daily, gap, energy).map(item => `
    <div class="insight-card"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join('');
}

function buildOperationalInsights(daily, gap, energy) {
  if (!daily.length) return [{ title: 'Point à vérifier', text: 'Enregistre plusieurs journées avant de tirer une conclusion.' }];
  const insights = [];
  if (gap !== null && gap >= 1) insights.push({ title: 'Fait observé', text: `La difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point en moyenne.` });
  if (gap !== null && gap <= -1) insights.push({ title: 'Fait observé', text: `La difficulté réelle dépasse l’anticipation de ${Math.abs(gap).toFixed(1)} point en moyenne. Les tâches pourraient être sous-estimées ou mal préparées.` });
  const highEnergy = daily.filter(e => Number(e.energie) >= 7);
  const lowEnergy = daily.filter(e => Number(e.energie) <= 4);
  if (highEnergy.length && lowEnergy.length) {
    const highRate = highEnergy.reduce((s, e) => s + actionCount(e), 0) / highEnergy.length;
    const lowRate = lowEnergy.reduce((s, e) => s + actionCount(e), 0) / lowEnergy.length;
    if (highRate - lowRate >= 1) insights.push({ title: 'Hypothèse à tester', text: 'Tu réalises davantage d’actions lors des journées à forte énergie. Prévoir une version minimale pour les jours faibles pourrait protéger la constance.' });
  }
  const focusRate = daily.filter(e => e.blocConcentration).length / daily.length;
  if (focusRate < 0.4) insights.push({ title: 'Recommandation', text: 'Le bloc de concentration est peu fréquent. Définis-le la veille avec une tâche de sortie précise.' });
  if (energy !== null && energy < 4.5) insights.push({ title: 'Point à vérifier', text: 'L’énergie moyenne est basse. Avant de conclure à un manque de discipline, vérifie sommeil, charge réelle et récupération.' });
  if (!insights.length) insights.push({ title: 'Lecture actuelle', text: 'Aucun écart majeur ne ressort. Maintiens le suivi sans ajouter de nouvelles mesures pour le moment.' });
  return insights;
}

async function loadSettingsForm() {
  const settings = await getSettings();
  const form = $('#settingsForm');
  form.elements.displayName.value = settings.displayName || '';
  form.elements.activeProject.value = settings.activeProject || '';
  form.elements.guidingSentence.value = settings.guidingSentence || '';
  form.elements.reviewDay.value = settings.reviewDay ?? '0';
}

async function saveSettingsForm(event) {
  event.preventDefault();
  const data = formToObject(event.currentTarget);
  await setSettings({
    displayName: data.displayName.trim(),
    activeProject: data.activeProject.trim(),
    guidingSentence: data.guidingSentence.trim(),
    reviewDay: data.reviewDay
  });
  toast('Réglages enregistrés.');
  renderDashboard();
}

async function getFullData() {
  const [daily, goals, journal, settings] = await Promise.all([
    dbGetAll('daily'), dbGetAll('goals'), dbGetAll('journal'), getSettings()
  ]);
  return { daily, goals, journal, settings };
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJson() {
  const data = await getFullData();
  const payload = {
    kind: 'ascension-backup',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
  downloadBlob(`ascension-sauvegarde-${localDateISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Sauvegarde JSON téléchargée.');
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportCsv() {
  const daily = (await dbGetAll('daily')).sort((a, b) => a.date.localeCompare(b.date));
  const headers = ['date', ...ACTION_FIELDS.map(([field]) => field), 'humeur', 'energie', 'stress', 'difficulteAnticipee', 'difficulteReelle', 'causeEchec', 'reussite', 'evitement', 'demain', 'updatedAt'];
  const rows = [headers.map(csvEscape).join(';')];
  for (const entry of daily) rows.push(headers.map(header => csvEscape(typeof entry[header] === 'boolean' ? Number(entry[header]) : entry[header])).join(';'));
  downloadBlob(`ascension-donnees-${localDateISO()}.csv`, `\uFEFF${rows.join('\n')}`, 'text/csv;charset=utf-8');
  toast('CSV téléchargé.');
}

function summarizeData(data) {
  const daily = data.daily || [];
  const totals = Object.fromEntries(ACTION_FIELDS.map(([field, label]) => [label, daily.filter(e => e[field]).length]));
  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  const causeCounts = new Map();
  daily.filter(e => e.causeEchec).forEach(e => causeCounts.set(e.causeEchec, (causeCounts.get(e.causeEchec) || 0) + 1));
  const causes = [...causeCounts.entries()].sort((a, b) => b[1] - a[1]);
  return { totals, gap, causes };
}

async function exportMarkdown() {
  const data = await getFullData();
  const summary = summarizeData(data);
  const daily = [...data.daily].sort((a, b) => b.date.localeCompare(a.date));
  const goals = data.goals.filter(g => g.status !== 'archive');
  const lines = [
    '# Rapport Ascension',
    '',
    `- Export : ${formatDateTime(new Date().toISOString())}`,
    `- Utilisateur : ${data.settings.displayName || '—'}`,
    `- Projet actif : ${data.settings.activeProject || '—'}`,
    `- Phrase directrice : ${data.settings.guidingSentence || '—'}`,
    `- Journées enregistrées : ${daily.length}`,
    '',
    '## Synthèse des comportements',
    ''
  ];
  for (const [label, total] of Object.entries(summary.totals)) lines.push(`- ${label} : ${total}`);
  lines.push('', '## Difficulté', '');
  lines.push(summary.gap === null ? '- Pas assez de mesures comparables.' : `- Écart moyen difficulté anticipée − réelle : ${summary.gap >= 0 ? '+' : ''}${summary.gap.toFixed(2)}`);
  lines.push('', '## Causes déclarées', '');
  if (summary.causes.length) summary.causes.forEach(([cause, count]) => lines.push(`- ${cause} : ${count}`));
  else lines.push('- Aucune cause déclarée.');
  lines.push('', '## Objectifs actifs', '');
  if (goals.length) goals.forEach(goal => lines.push(`### ${goal.titre}\n- Catégorie : ${goal.categorie}\n- Définition : ${goal.definition}\n- Cible : ${goal.cible} par semaine\n- Révision : ${goal.dateRevision}\n- Progression semaine actuelle : ${goalWeekProgress(goal)}/${goal.cible}\n`));
  else lines.push('- Aucun objectif actif.');
  lines.push('', '## Entrées quotidiennes récentes', '');
  if (!daily.length) lines.push('- Aucune entrée.');
  daily.slice(0, 31).forEach(entry => {
    lines.push(`### ${formatDate(entry.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
    lines.push(`- Actions réalisées : ${actionCount(entry)}/${ACTION_FIELDS.length}`);
    lines.push(`- Humeur / énergie / stress : ${entry.humeur}/10 — ${entry.energie}/10 — ${entry.stress}/10`);
    if (Number.isFinite(entry.difficulteAnticipee) || Number.isFinite(entry.difficulteReelle)) lines.push(`- Difficulté anticipée / réelle : ${entry.difficulteAnticipee ?? '—'}/10 — ${entry.difficulteReelle ?? '—'}/10`);
    if (entry.causeEchec) lines.push(`- Cause déclarée : ${entry.causeEchec}`);
    if (entry.reussite) lines.push(`- Réussite : ${entry.reussite}`);
    if (entry.evitement) lines.push(`- Évitement : ${entry.evitement}`);
    if (entry.demain) lines.push(`- Première action suivante : ${entry.demain}`);
    lines.push('');
  });
  lines.push('## Journal récent', '');
  const journal = [...data.journal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (!journal.length) lines.push('- Aucune entrée.');
  journal.forEach(entry => {
    lines.push(`### ${entry.titre} — ${entry.date}`);
    lines.push(`- Type : ${entry.type}`);
    lines.push(entry.contenu);
    if (entry.pointSuivi) lines.push(`- Point à surveiller : ${entry.pointSuivi}`);
    lines.push('');
  });
  lines.push('## Consigne pour l’analyse ChatGPT', '', 'Distinguer les faits observés, les hypothèses, les points à vérifier et les recommandations. Ne pas poser de diagnostic. Proposer une seule correction prioritaire pour la prochaine période.');
  downloadBlob(`ascension-rapport-${localDateISO()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  toast('Rapport Markdown téléchargé.');
}

function validateBackup(payload) {
  return payload?.kind === 'ascension-backup' && payload.data && Array.isArray(payload.data.daily) && Array.isArray(payload.data.goals) && Array.isArray(payload.data.journal);
}

function validateUpdate(payload) {
  return payload?.kind === 'ascension-update' && payload.changes && typeof payload.changes === 'object';
}

async function readImportFile(event) {
  const file = event.target.files?.[0];
  pendingImport = null;
  $('#applyImport').disabled = true;
  $('#cancelImport').disabled = true;
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!validateBackup(payload) && !validateUpdate(payload)) throw new Error('Format non reconnu');
    pendingImport = payload;
    const preview = $('#importPreview');
    preview.className = 'import-preview';
    if (validateBackup(payload)) {
      preview.innerHTML = `<div class="insight-card"><strong>Sauvegarde complète</strong><span>${payload.data.daily.length} journées, ${payload.data.goals.length} objectifs et ${payload.data.journal.length} entrées de journal. L’import remplacera les données locales.</span></div>`;
    } else {
      const changes = payload.changes;
      const count = (changes.addGoals?.length || 0) + (changes.updateGoals?.length || 0) + (changes.archiveGoalIds?.length || 0) + (changes.addJournalEntries?.length || 0) + (changes.settings ? 1 : 0);
      preview.innerHTML = `<div class="insight-card"><strong>Mise à jour structurée</strong><span>${count} groupe${count > 1 ? 's' : ''} de modification détecté${count > 1 ? 's' : ''}. Une sauvegarde locale sera exportée avant application.</span></div>`;
    }
    $('#applyImport').disabled = false;
    $('#cancelImport').disabled = false;
  } catch (error) {
    $('#importPreview').className = 'import-preview empty-state';
    $('#importPreview').textContent = `Import impossible : ${error.message}`;
  }
}

async function applyPendingImport() {
  if (!pendingImport) return;
  if (validateBackup(pendingImport)) {
    const accepted = await confirmAction('Restaurer cette sauvegarde ?', 'Les données locales actuelles seront remplacées. Exporte-les avant si nécessaire.', 'Restaurer');
    if (!accepted) return;
    await restoreBackup(pendingImport.data);
    toast('Sauvegarde restaurée.');
  } else {
    await exportJson();
    await applyStructuredUpdate(pendingImport.changes);
    toast('Mise à jour appliquée.');
  }
  cancelImport();
  await refreshAll();
}

async function restoreBackup(data) {
  await Promise.all(['daily', 'goals', 'journal', 'settings'].map(dbClear));
  await Promise.all((data.daily || []).map(item => dbPut('daily', item)));
  await Promise.all((data.goals || []).map(item => dbPut('goals', item)));
  await Promise.all((data.journal || []).map(item => dbPut('journal', item)));
  await setSettings(data.settings || {});
}

async function applyStructuredUpdate(changes) {
  if (changes.settings) await setSettings({ ...(await getSettings()), ...changes.settings });
  for (const goal of changes.addGoals || []) {
    await dbPut('goals', {
      id: goal.id || uid('goal'),
      titre: goal.titre || 'Nouvel objectif',
      categorie: goal.categorie || 'Autre',
      definition: goal.definition || '',
      cible: Number(goal.cible || 1),
      dateDebut: goal.dateDebut || localDateISO(),
      dateRevision: goal.dateRevision || localDateISO(new Date(Date.now() + 28 * 86_400_000)),
      principal: Boolean(goal.principal),
      status: goal.status || 'actif',
      completions: Array.isArray(goal.completions) ? goal.completions : [],
      createdAt: goal.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  for (const patch of changes.updateGoals || []) {
    if (!patch.id) continue;
    const existing = await dbGet('goals', patch.id);
    if (existing) await dbPut('goals', { ...existing, ...patch, updatedAt: new Date().toISOString() });
  }
  for (const id of changes.archiveGoalIds || []) {
    const goal = await dbGet('goals', id);
    if (goal) await dbPut('goals', { ...goal, status: 'archive', updatedAt: new Date().toISOString() });
  }
  for (const entry of changes.addJournalEntries || []) {
    await dbPut('journal', {
      id: entry.id || uid('journal'),
      date: entry.date || localDateISO(),
      type: entry.type || 'Autre',
      titre: entry.titre || 'Mise à jour ChatGPT',
      contenu: entry.contenu || '',
      pointSuivi: entry.pointSuivi || '',
      createdAt: entry.createdAt || new Date().toISOString()
    });
  }
}

function cancelImport() {
  pendingImport = null;
  $('#importFile').value = '';
  $('#importPreview').className = 'import-preview empty-state';
  $('#importPreview').textContent = 'Aucun fichier sélectionné.';
  $('#applyImport').disabled = true;
  $('#cancelImport').disabled = true;
}

async function resetApplication() {
  const accepted = await confirmAction('Réinitialiser toutes les données ?', 'Cette opération efface les journées, objectifs, journal et réglages de cet appareil. Elle est irréversible sans sauvegarde JSON.', 'Tout effacer');
  if (!accepted) return;
  await Promise.all(['daily', 'goals', 'journal', 'settings'].map(dbClear));
  toast('Toutes les données ont été supprimées.');
  await refreshAll();
  navigateTo('dashboard');
}

async function refreshAll() {
  await Promise.all([loadTodayForm(), renderDashboard(), renderGoals(), renderJournal(), renderAnalysis(), loadSettingsForm()]);
}

function registerEvents() {
  $$('.nav-button').forEach(button => button.addEventListener('click', () => navigateTo(button.dataset.viewTarget)));
  $$('[data-nav-target]').forEach(button => button.addEventListener('click', () => navigateTo(button.dataset.navTarget)));
  $('#dailyForm').addEventListener('submit', saveDailyEntry);
  $('#dailyForm').addEventListener('input', event => {
    if (['humeur', 'energie', 'stress'].includes(event.target.name)) updateRangeOutputs();
  });
  $('#clearTodayButton').addEventListener('click', clearTodayFields);
  $('#toggleGoalForm').addEventListener('click', () => $('#goalForm').classList.toggle('hidden'));
  $('#cancelGoalButton').addEventListener('click', () => { $('#goalForm').classList.add('hidden'); $('#goalForm').reset(); setDefaultGoalDates(); });
  $('#goalForm').addEventListener('submit', createGoal);
  $('#goalsList').addEventListener('click', handleGoalAction);
  $('#journalForm').addEventListener('submit', createJournalEntry);
  $('#journalList').addEventListener('click', handleJournalAction);
  $('#analysisPeriod').addEventListener('change', renderAnalysis);
  $('#settingsForm').addEventListener('submit', saveSettingsForm);
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#exportMarkdown').addEventListener('click', exportMarkdown);
  $('#importFile').addEventListener('change', readImportFile);
  $('#applyImport').addEventListener('click', applyPendingImport);
  $('#cancelImport').addEventListener('click', cancelImport);
  $('#resetApp').addEventListener('click', resetApplication);
  $('#confirmCancel').addEventListener('click', () => {
    $('#confirmDialog').close();
    confirmResolver?.(false);
    confirmResolver = null;
  });
  $('#confirmAccept').addEventListener('click', () => {
    $('#confirmDialog').close();
    confirmResolver?.(true);
    confirmResolver = null;
  });
  $('#confirmDialog').addEventListener('cancel', event => {
    event.preventDefault();
    $('#confirmDialog').close();
    confirmResolver?.(false);
    confirmResolver = null;
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('#installButton').classList.remove('hidden');
  });
  $('#installButton').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installButton').classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => toast('Application installée.'));
}

async function initialize() {
  registerEvents();
  setDefaultGoalDates();
  $('#journalForm').elements.date.value = localDateISO();
  await openDatabase();
  await refreshAll();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js'); }
    catch (error) { console.warn('Service worker non enregistré', error); }
  }
}

document.addEventListener('DOMContentLoaded', initialize);
