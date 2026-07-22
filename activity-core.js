/* Ascension 1.1 — actions libres chronométrées */
'use strict';

function patchActivityInterface() {
  const scoreLabel = document.querySelector('.hero-score .muted');
  if (scoreLabel) scoreLabel.textContent = 'actions clôturées';

  const metrics = [
    ['metricDecisions', 'metricCompleted', 'Actions terminées', 'cette semaine'],
    ['metricFocus', 'metricTrackedTime', 'Temps suivi', 'actions terminées'],
    ['metricSolo', 'metricInProgress', 'Actions en cours', 'à clôturer'],
    ['metricPhysical', 'metricActiveDays', 'Jours actifs', 'avec une action']
  ];
  metrics.forEach(([oldId, newId, label, note]) => {
    const value = document.getElementById(oldId);
    const card = value?.closest('.metric-card');
    if (!value || !card) return;
    value.id = newId;
    card.querySelector('.metric-label').textContent = label;
    card.querySelector('.metric-note').textContent = note;
  });

  const dailyForm = document.getElementById('dailyForm');
  const oldActionPanel = dailyForm?.querySelector(':scope > .panel');
  if (dailyForm && oldActionPanel) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Chronologie libre</p><h3>Actions du moment</h3></div>
        <button id="toggleActivityForm" class="button primary" type="button">+ Ajouter</button>
      </div>
      <form id="activityForm" class="activity-form form-stack hidden">
        <label>Action en cours
          <input name="titre" required maxlength="160" placeholder="Ex. Vérifier un dossier, marcher, appeler quelqu’un…">
        </label>
        <div class="two-column">
          <label>Catégorie facultative
            <select name="categorie">
              <option value="">Sans catégorie</option><option>Travail</option><option>Autonomie</option>
              <option>Concentration</option><option>Sport</option><option>Social</option><option>Projet</option>
              <option>Apprentissage</option><option>Personnel</option><option>Autre</option>
            </select>
          </label>
          <label>Note facultative<input name="note" maxlength="240" placeholder="Contexte utile pour l’analyse"></label>
        </div>
        <p class="muted activity-help">L’heure de début sera enregistrée automatiquement lorsque tu appuieras sur « Commencer ».</p>
        <div class="action-row">
          <button class="button primary" type="submit">Commencer</button>
          <button id="cancelActivityButton" class="button secondary" type="button">Annuler</button>
        </div>
      </form>
      <div id="activityList" class="activity-list empty-state">Aucune action ajoutée aujourd’hui.</div>`;
    dailyForm.parentNode.insertBefore(panel, dailyForm);
    oldActionPanel.remove();
  }

  const actionRateLabel = document.querySelector('#analysisActionRate')?.closest('.metric-card');
  if (actionRateLabel) {
    actionRateLabel.querySelector('.metric-label').textContent = 'Taux de clôture';
    actionRateLabel.querySelector('.metric-note').textContent = 'actions terminées';
  }
  const barsTitle = document.querySelector('#actionBars')?.closest('.panel')?.querySelector('h3');
  if (barsTitle) barsTitle.textContent = 'Répartition par catégorie';
}

patchActivityInterface();
dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('activities')) db.createObjectStore('activities', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function formatClock(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function durationMinutes(activity, end = new Date()) {
  if (!activity?.startedAt) return 0;
  const startMs = new Date(activity.startedAt).getTime();
  const endMs = activity.endedAt ? new Date(activity.endedAt).getTime() : end.getTime();
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

function activityDate(activity) {
  return activity?.date || localDateISO(new Date(activity.startedAt));
}

async function renderTodayActivities() {
  const today = localDateISO();
  const activities = (await dbGetAll('activities'))
    .filter(activity => activityDate(activity) === today)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const list = $('#activityList');
  if (!activities.length) {
    list.className = 'activity-list empty-state';
    list.textContent = 'Aucune action ajoutée aujourd’hui.';
    return;
  }
  list.className = 'activity-list';
  list.innerHTML = activities.map(activity => {
    const running = activity.status === 'en_cours' && !activity.endedAt;
    const duration = durationMinutes(activity);
    const timing = running
      ? `Début ${formatClock(activity.startedAt)} · ${formatDuration(duration)} en cours`
      : `${formatClock(activity.startedAt)} → ${formatClock(activity.endedAt)} · ${formatDuration(duration)}`;
    return `
      <article class="activity-item ${running ? 'running' : 'completed'}" data-activity-id="${escapeHtml(activity.id)}">
        <div class="activity-time"><strong>${formatClock(activity.startedAt)}</strong><span>${running ? 'En cours' : 'Terminée'}</span></div>
        <div class="item-main">
          <div class="activity-meta">
            ${activity.categorie ? `<span class="chip">${escapeHtml(activity.categorie)}</span>` : '<span class="chip neutral">Sans catégorie</span>'}
            <span class="chip ${running ? 'warning' : ''}">${running ? 'Chrono actif' : formatDuration(duration)}</span>
          </div>
          <h3>${escapeHtml(activity.titre)}</h3>
          <p>${escapeHtml(timing)}</p>
          ${activity.note ? `<p class="activity-note">${escapeHtml(activity.note)}</p>` : ''}
        </div>
        <div class="item-actions">
          ${running ? '<button class="button primary activity-end" type="button" data-activity-action="end">Fin</button>' : ''}
          <button class="small-button danger" type="button" data-activity-action="delete">Supprimer</button>
        </div>
      </article>`;
  }).join('');
}

async function createActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const now = new Date();
  const activity = {
    id: uid('activity'),
    date: localDateISO(now),
    titre: data.titre.trim(),
    categorie: data.categorie || '',
    note: data.note?.trim() || '',
    status: 'en_cours',
    startedAt: now.toISOString(),
    endedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  await dbPut('activities', activity);
  form.reset();
  form.classList.add('hidden');
  toast(`Action démarrée à ${formatClock(activity.startedAt)}.`);
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
}

async function handleActivityAction(event) {
  const button = event.target.closest('[data-activity-action]');
  if (!button) return;
  const item = button.closest('[data-activity-id]');
  const activity = await dbGet('activities', item.dataset.activityId);
  if (!activity) return;
  const action = button.dataset.activityAction;
  if (action === 'end') {
    const now = new Date().toISOString();
    await dbPut('activities', { ...activity, status: 'terminee', endedAt: now, updatedAt: now });
    toast(`Action terminée · ${formatDuration(durationMinutes({ ...activity, endedAt: now }))}.`);
  }
  if (action === 'delete') {
    const accepted = await confirmAction('Supprimer cette action ?', 'L’heure de début, la durée et la note seront supprimées.', 'Supprimer');
    if (!accepted) return;
    await dbDelete('activities', activity.id);
    toast('Action supprimée.');
  }
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
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
  for (const field of ['difficulteAnticipee', 'difficulteReelle', 'causeEchec', 'reussite', 'evitement', 'demain']) {
    form.elements[field].value = entry?.[field] ?? '';
  }
  updateRangeOutputs();
  await renderTodayActivities();
}

async function saveDailyEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const date = localDateISO();
  const existing = await dbGet('daily', date);
  const entry = {
    ...(existing || {}),
    date,
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
  await dbPut('daily', entry);
  setSaveStatus('Journée enregistrée');
  toast('État du jour enregistré sur cet appareil.');
  await Promise.all([renderDashboard(), renderAnalysis()]);
}

function legacyActionCount(entry) {
  return ACTION_FIELDS.reduce((sum, [field]) => sum + (entry?.[field] ? 1 : 0), 0);
}

async function renderDashboard() {
  const [daily, goals, settings, activities] = await Promise.all([
    dbGetAll('daily'), dbGetAll('goals'), getSettings(), dbGetAll('activities')
  ]);
  const weekStart = startOfWeek();
  const weekEnd = endOfWeek();
  const startISO = localDateISO(weekStart);
  const endISO = localDateISO(weekEnd);
  const weekEntries = daily.filter(item => item.date >= startISO && item.date <= endISO);
  const weekActivities = activities.filter(item => activityDate(item) >= startISO && activityDate(item) <= endISO);
  const completed = weekActivities.filter(item => item.status === 'terminee' || item.endedAt);
  const running = weekActivities.filter(item => item.status === 'en_cours' && !item.endedAt);
  const activeDays = new Set(weekActivities.map(activityDate)).size;
  const trackedMinutes = completed.reduce((sum, activity) => sum + durationMinutes(activity), 0);

  $('#weekTitle').textContent = `${settings.displayName || 'Ta'} — semaine du ${formatDate(startISO, { day: 'numeric', month: 'short' })}`;
  const score = weekActivities.length ? Math.round(completed.length / weekActivities.length * 100) : 0;
  $('#weeklyScore').textContent = `${score}%`;
  $('#weekSummary').textContent = weekActivities.length
    ? `${weekActivities.length} action${weekActivities.length > 1 ? 's' : ''} enregistrée${weekActivities.length > 1 ? 's' : ''} sur ${activeDays} jour${activeDays > 1 ? 's' : ''}. ${settings.guidingSentence || ''}`
    : 'Ajoute une action au moment où elle commence.';

  $('#metricCompleted').textContent = completed.length;
  $('#metricTrackedTime').textContent = formatDuration(trackedMinutes);
  $('#metricInProgress').textContent = running.length;
  $('#metricActiveDays').textContent = activeDays;

  const todayActivities = weekActivities
    .filter(activity => activityDate(activity) === localDateISO())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const todayPreview = $('#todayPreview');
  if (!todayActivities.length) {
    todayPreview.className = 'task-list empty-state';
    todayPreview.textContent = 'Aucune action ajoutée aujourd’hui.';
  } else {
    todayPreview.className = 'task-list';
    todayPreview.innerHTML = todayActivities.slice(0, 5).map(activity => {
      const runningNow = activity.status === 'en_cours' && !activity.endedAt;
      return `<div class="task-item ${runningNow ? '' : 'done'}">
        <span><strong>${formatClock(activity.startedAt)}</strong> · ${escapeHtml(activity.titre)}</span>
        <span class="chip ${runningNow ? 'warning' : ''}">${runningNow ? 'En cours' : formatDuration(durationMinutes(activity))}</span>
      </div>`;
    }).join('');
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

  const insight = computeDashboardInsight(weekEntries, weekActivities);
  $('#insightTitle').textContent = insight.title;
  $('#insightText').textContent = insight.text;
}

function computeDashboardInsight(entries, activities) {
  if (!entries.length && !activities.length) return { title: 'Premier constat à venir', text: 'Ajoute tes actions au moment où elles commencent. Le tableau comparera ensuite durée, contexte et état du jour.' };
  const difficultyEntries = entries.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  if (difficultyEntries.length) {
    const gap = difficultyEntries.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficultyEntries.length;
    if (gap >= 1) return { title: 'L’anticipation semble plus lourde que le réel', text: `Sur les situations mesurées cette semaine, la difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point${gap >= 2 ? 's' : ''} en moyenne.` };
  }
  const completed = activities.filter(activity => activity.status === 'terminee' || activity.endedAt);
  if (activities.length && completed.length < activities.length) {
    return { title: 'Actions à clôturer', text: `${activities.length - completed.length} action${activities.length - completed.length > 1 ? 's sont encore ouvertes' : ' est encore ouverte'}. Utilise le bouton « Fin » pour conserver une durée fiable.` };
  }
  const categories = new Map();
  activities.forEach(activity => {
    const category = activity.categorie || 'Sans catégorie';
    categories.set(category, (categories.get(category) || 0) + 1);
  });
  const top = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return { title: 'Catégorie la plus présente', text: `${top[0]} : ${top[1]} action${top[1] > 1 ? 's' : ''} enregistrée${top[1] > 1 ? 's' : ''} cette semaine.` };
  return { title: 'Suivi en cours', text: 'Les premières données sont enregistrées. Continue sans ajouter de catégories obligatoires.' };
}
