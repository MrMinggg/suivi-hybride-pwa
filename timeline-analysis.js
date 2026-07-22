// Ascension V1.2 — timeline-analysis.js
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
  const completed = weekActivities.filter(isActivityFinished);
  const activeDays = new Set(weekActivities.map(activityDate)).size;
  const trackedMinutes = weekActivities.reduce((sum, activity) => sum + durationMinutes(activity), 0);
  const eventCount = weekActivities.reduce((sum, activity) => sum + activityEvents(activity).length, 0);
  const pauseCount = weekActivities.reduce((sum, activity) => sum + activityPauses(activity).length, 0);

  $('#weekTitle').textContent = `${settings.displayName || 'Ta'} — semaine du ${formatDate(startISO, { day: 'numeric', month: 'short' })}`;
  $('#weeklyScore').textContent = formatDuration(trackedMinutes);
  $('#weekSummary').textContent = weekActivities.length
    ? `${weekActivities.length} activité${weekActivities.length > 1 ? 's' : ''}, ${eventCount} repère${eventCount > 1 ? 's' : ''} et ${pauseCount} interruption${pauseCount > 1 ? 's' : ''} sur ${activeDays} jour${activeDays > 1 ? 's' : ''}. ${settings.guidingSentence || ''}`
    : 'Commence une activité au moment où elle débute, puis raconte ce qui se passe dedans.';

  $('#metricCompleted').textContent = completed.length;
  $('#metricTrackedTime').textContent = formatDuration(trackedMinutes);
  $('#metricInProgress').textContent = pauseCount;
  $('#metricActiveDays').textContent = eventCount;

  const todayActivities = weekActivities
    .filter(activity => activityDate(activity) === localDateISO())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const todayPreview = $('#todayPreview');
  if (!todayActivities.length) {
    todayPreview.className = 'task-list empty-state';
    todayPreview.textContent = 'Aucune activité ajoutée aujourd’hui.';
  } else {
    todayPreview.className = 'task-list';
    todayPreview.innerHTML = todayActivities.slice(0, 5).map(activity => `
      <div class="task-item ${isActivityFinished(activity) ? 'done' : ''}">
        <span><strong>${formatClock(activity.startedAt)}</strong> · ${escapeHtml(activity.titre)}</span>
        <span class="chip ${isActivityRunning(activity) ? 'warning' : ''}">${escapeHtml(activityStatusLabel(activity))} · ${formatDuration(durationMinutes(activity))}</span>
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

  const insight = computeDashboardInsight(weekEntries, weekActivities);
  $('#insightTitle').textContent = insight.title;
  $('#insightText').textContent = insight.text;
}

function computeDashboardInsight(entries, activities) {
  if (!entries.length && !activities.length) return { title: 'Premier constat à venir', text: 'Commence les activités au moment où elles démarrent et ajoute les événements importants pendant leur déroulement.' };
  const difficultyEntries = entries.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  if (difficultyEntries.length) {
    const gap = difficultyEntries.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficultyEntries.length;
    if (gap >= 1) return { title: 'L’anticipation semble plus lourde que le réel', text: `Sur les situations mesurées cette semaine, la difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point${gap >= 2 ? 's' : ''} en moyenne.` };
  }
  const open = activities.filter(activity => !isActivityFinished(activity));
  if (open.length) return { title: 'Chronologie encore ouverte', text: `${open.length} activité${open.length > 1 ? 's restent ouvertes' : ' reste ouverte'}. Mets-la en pause ou termine-la pour garder une chronologie fiable.` };
  const events = activities.reduce((sum, activity) => sum + activityEvents(activity).length, 0);
  if (events) return { title: 'La journée devient lisible', text: `${events} repère${events > 1 ? 's ont' : ' a'} été ajouté${events > 1 ? 's' : ''} à l’intérieur des activités. Ce sont ces détails qui permettront une analyse contextualisée.` };
  return { title: 'Ajoute le déroulement', text: 'Les durées sont enregistrées. La prochaine étape utile est d’ajouter un repère lorsqu’une décision, une interruption, une émotion ou un problème survient.' };
}

async function renderAnalysis() {
  const period = Number($('#analysisPeriod').value || 30);
  const [allDaily, allActivities] = await Promise.all([dbGetAll('daily'), dbGetAll('activities')]);
  const daily = filterByDays(allDaily, period);
  const activities = filterByDays(allActivities.map(activity => ({ ...activity, date: activityDate(activity) })), period);
  const recordedDays = new Set([...daily.map(item => item.date), ...activities.map(item => item.date)]);
  $('#analysisDays').textContent = recordedDays.size;

  const activeMinutes = activities.reduce((sum, activity) => sum + durationMinutes(activity), 0);
  $('#analysisActionRate').textContent = formatDuration(activeMinutes);

  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  $('#analysisDifficultyGap').textContent = gap === null ? '—' : `${gap >= 0 ? '+' : ''}${gap.toFixed(1)}`;
  const energy = daily.length ? daily.reduce((sum, e) => sum + Number(e.energie || 0), 0) / daily.length : null;
  $('#analysisEnergy').textContent = energy === null ? '—' : energy.toFixed(1);

  const categoryMinutes = new Map();
  activities.forEach(activity => {
    const label = activity.categorie || 'Sans catégorie';
    categoryMinutes.set(label, (categoryMinutes.get(label) || 0) + durationMinutes(activity));
  });
  const bars = [...categoryMinutes.entries()].sort((a, b) => b[1] - a[1]);
  $('#actionBars').innerHTML = bars.length ? bars.map(([label, minutes]) => {
    const pct = activeMinutes ? Math.round(minutes / activeMinutes * 100) : 0;
    return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label)}</span><strong>${formatDuration(minutes)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  }).join('') : '<div class="empty-state">Pas encore d’activité enregistrée.</div>';

  const causeCounts = new Map();
  daily.filter(e => e.causeEchec).forEach(e => causeCounts.set(e.causeEchec, (causeCounts.get(e.causeEchec) || 0) + 1));
  const topCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  $('#failureInsight').className = topCause ? '' : 'empty-state';
  $('#failureInsight').innerHTML = topCause
    ? `<div class="insight-card"><strong>${escapeHtml(topCause[0])}</strong><span>${topCause[1]} occurrence${topCause[1] > 1 ? 's' : ''} sur la période. C’est une fréquence observée, pas une explication automatique.</span></div>`
    : 'Pas encore assez de données.';

  $('#operationalInsights').innerHTML = buildOperationalInsights(daily, activities, gap, energy).map(item => `
    <div class="insight-card"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join('');
}

function buildOperationalInsights(daily, activities, gap, energy) {
  if (!daily.length && !activities.length) return [{ title: 'Point à vérifier', text: 'Enregistre plusieurs activités et quelques événements internes avant de tirer une conclusion.' }];
  const insights = [];
  if (gap !== null && gap >= 1) insights.push({ title: 'Fait observé', text: `La difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point en moyenne.` });
  if (gap !== null && gap <= -1) insights.push({ title: 'Fait observé', text: `La difficulté réelle dépasse l’anticipation de ${Math.abs(gap).toFixed(1)} point en moyenne.` });

  const pauses = activities.reduce((sum, activity) => sum + activityPauses(activity).length, 0);
  const events = activities.reduce((sum, activity) => sum + activityEvents(activity).length, 0);
  if (pauses >= 3) insights.push({ title: 'Point à analyser', text: `${pauses} interruptions ont été enregistrées. L’export permettra de vérifier si elles viennent de transitions normales, d’imprévus ou d’une dispersion.` });
  if (activities.length >= 3 && events === 0) insights.push({ title: 'Donnée manquante', text: 'Les activités ont des horaires, mais aucun événement interne. Ajoute un repère lorsqu’un changement important survient pour rendre l’analyse plus précise.' });

  const open = activities.filter(activity => !isActivityFinished(activity));
  if (open.length) insights.push({ title: 'Action nécessaire', text: `${open.length} activité${open.length > 1 ? 's sont encore ouvertes' : ' est encore ouverte'}. Mets-les en pause ou termine-les pour fiabiliser le temps actif.` });
  if (energy !== null && energy < 4.5) insights.push({ title: 'Point à vérifier', text: 'L’énergie moyenne est basse. Avant de conclure à un manque de discipline, vérifie sommeil, charge réelle et récupération.' });
  if (!insights.length) insights.push({ title: 'Lecture actuelle', text: 'La chronologie est exploitable. Continue à enregistrer surtout les décisions, interruptions, émotions et changements de direction pendant les activités.' });
  return insights;
}
