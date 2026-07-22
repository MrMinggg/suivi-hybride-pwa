// Ascension V1.2 — timeline-actions.js
function navigateTo(viewName) {
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === viewName));
  $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === viewName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#app').focus({ preventScroll: true });
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'today') loadTodayForm();
  if (viewName === 'goals') renderGoals();
  if (viewName === 'journal') renderJournal();
  if (viewName === 'analysis') renderAnalysis();
  if (viewName === 'settings') loadSettingsForm();
}

async function renderTodayActivities() {
  const today = localDateISO();
  const activities = (await dbGetAll('activities'))
    .filter(activity => activityDate(activity) === today)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const list = $('#activityList');
  if (!activities.length) {
    list.className = 'activity-list empty-state';
    list.textContent = 'Aucune activité enregistrée aujourd’hui.';
    return;
  }

  const current = [...activities].reverse().find(activity => !isActivityFinished(activity));
  const previous = activities.filter(activity => !current || activity.id !== current.id);
  const renderCard = (activity, currentCard = false) => {
    const active = durationMinutes(activity);
    const elapsed = elapsedDurationMinutes(activity);
    const paused = pausedDurationMinutes(activity);
    const status = activityStatusLabel(activity);
    const statusClass = isActivityFinished(activity) ? 'completed' : isActivityPaused(activity) ? 'paused' : 'running';
    const durationText = isActivityFinished(activity)
      ? `${formatDuration(active)} actif${paused ? ` · ${formatDuration(paused)} en pause` : ''}`
      : `${formatDuration(active)} actif · ${formatDuration(elapsed)} écoulé`;
    return `
      <article class="activity-item ${statusClass} ${currentCard ? 'current-activity' : ''}" data-activity-id="${escapeHtml(activity.id)}">
        <div class="activity-card-head">
          <div class="activity-time"><strong>${formatClock(activity.startedAt)}</strong><span>${escapeHtml(status)}</span></div>
          <div class="item-main">
            <div class="activity-meta">
              ${activity.categorie ? `<span class="chip">${escapeHtml(activity.categorie)}</span>` : '<span class="chip neutral">Sans catégorie</span>'}
              <span class="chip ${isActivityRunning(activity) ? 'warning' : ''}">${escapeHtml(durationText)}</span>
            </div>
            <h3>${escapeHtml(activity.titre)}</h3>
          </div>
        </div>
        <ol class="activity-timeline">${activityTimelineHtml(activity)}</ol>
        <div class="item-actions activity-controls">
          <button class="small-button" type="button" data-activity-action="event">+ Repère</button>
          ${isActivityRunning(activity) ? '<button class="small-button" type="button" data-activity-action="pause">Pause</button>' : ''}
          ${isActivityPaused(activity) ? '<button class="small-button" type="button" data-activity-action="resume">Reprendre</button>' : ''}
          ${!isActivityFinished(activity) ? '<button class="button primary activity-end" type="button" data-activity-action="end">Fin</button>' : ''}
          <button class="small-button danger" type="button" data-activity-action="delete">Supprimer</button>
        </div>
      </article>`;
  };

  list.className = 'activity-list';
  list.innerHTML = `
    ${current ? `<div class="current-heading"><span class="live-indicator"></span><strong>Activité actuelle</strong></div>${renderCard(current, true)}` : '<div class="no-current-activity">Aucune activité en cours. Appuie sur « + Commencer » quand tu débutes quelque chose.</div>'}
    <div class="timeline-section-heading"><strong>Chronologie</strong><span>${activities.length} activité${activities.length > 1 ? 's' : ''}</span></div>
    <div class="day-timeline">${previous.length ? previous.map(activity => renderCard(activity)).join('') : '<div class="empty-state">Les activités terminées apparaîtront ici.</div>'}</div>`;
}

async function createActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const now = new Date();
  const nowISO = now.toISOString();

  const activities = await dbGetAll('activities');
  for (const existing of activities.filter(item => !isActivityFinished(item) && isActivityRunning(item))) {
    const pauses = [...activityPauses(existing), { id: uid('pause'), startedAt: nowISO, endedAt: null, reason: 'Nouvelle activité commencée' }];
    await dbPut('activities', { ...existing, status: 'en_pause', pauses, updatedAt: nowISO });
  }

  const activity = {
    id: uid('activity'),
    date: localDateISO(now),
    titre: data.titre.trim(),
    categorie: data.categorie || '',
    note: data.note?.trim() || '',
    conclusion: '',
    status: 'en_cours',
    startedAt: nowISO,
    endedAt: null,
    events: [],
    pauses: [],
    createdAt: nowISO,
    updatedAt: nowISO
  };
  await dbPut('activities', activity);
  form.reset();
  form.classList.add('hidden');
  toast(`Activité commencée à ${formatClock(activity.startedAt)}.`);
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
}

async function handleActivityAction(event) {
  const button = event.target.closest('[data-activity-action]');
  if (!button) return;
  const item = button.closest('[data-activity-id]');
  const activity = await dbGet('activities', item.dataset.activityId);
  if (!activity) return;
  const action = button.dataset.activityAction;
  const now = new Date().toISOString();

  if (action === 'event') {
    const form = $('#eventForm');
    form.reset();
    form.elements.activityId.value = activity.id;
    form.elements.heure.value = timeInputValue();
    $('#eventDialog').showModal();
    form.elements.texte.focus();
    return;
  }

  if (action === 'pause' && isActivityRunning(activity)) {
    const pauses = [...activityPauses(activity), { id: uid('pause'), startedAt: now, endedAt: null, reason: 'Pause manuelle' }];
    await dbPut('activities', { ...activity, status: 'en_pause', pauses, updatedAt: now });
    toast('Activité mise en pause.');
  }

  if (action === 'resume' && isActivityPaused(activity)) {
    const all = await dbGetAll('activities');
    for (const existing of all.filter(item => item.id !== activity.id && !isActivityFinished(item) && isActivityRunning(item))) {
      const pauses = [...activityPauses(existing), { id: uid('pause'), startedAt: now, endedAt: null, reason: 'Une autre activité a été reprise' }];
      await dbPut('activities', { ...existing, status: 'en_pause', pauses, updatedAt: now });
    }
    const pauses = activityPauses(activity).map(pause => !pause.endedAt ? { ...pause, endedAt: now } : pause);
    await dbPut('activities', { ...activity, status: 'en_cours', pauses, updatedAt: now });
    toast('Activité reprise.');
  }

  if (action === 'end') {
    const form = $('#endActivityForm');
    form.reset();
    form.elements.activityId.value = activity.id;
    $('#endActivityDialog').showModal();
    form.elements.conclusion.focus();
    return;
  }

  if (action === 'delete') {
    const accepted = await confirmAction('Supprimer cette activité ?', 'La chronologie, les repères, les pauses et la durée seront supprimés.', 'Supprimer');
    if (!accepted) return;
    await dbDelete('activities', activity.id);
    toast('Activité supprimée.');
  }
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
}

async function saveActivityEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const activity = await dbGet('activities', data.activityId);
  if (!activity) return;
  const at = localDateTimeToISO(activityDate(activity), data.heure);
  const events = [...activityEvents(activity), {
    id: uid('event'),
    type: data.type || 'repere',
    texte: data.texte.trim(),
    at,
    createdAt: new Date().toISOString()
  }];
  await dbPut('activities', { ...activity, events, updatedAt: new Date().toISOString() });
  $('#eventDialog').close();
  form.reset();
  toast(`Repère ajouté à ${formatClock(at)}.`);
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
}

async function finishActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);
  const activity = await dbGet('activities', data.activityId);
  if (!activity) return;
  const now = new Date().toISOString();
  const pauses = activityPauses(activity).map(pause => !pause.endedAt ? { ...pause, endedAt: now } : pause);
  const finished = {
    ...activity,
    status: 'terminee',
    endedAt: now,
    pauses,
    conclusion: data.conclusion?.trim() || activity.conclusion || '',
    updatedAt: now
  };
  await dbPut('activities', finished);
  $('#endActivityDialog').close();
  form.reset();
  toast(`Activité terminée · ${formatDuration(durationMinutes(finished))} actif.`);
  await Promise.all([renderTodayActivities(), renderDashboard(), renderAnalysis()]);
}
