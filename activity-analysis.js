/* Ascension 1.1 — analyses des actions libres */
'use strict';

async function renderAnalysis() {
  const period = Number($('#analysisPeriod').value || 30);
  const [allDaily, allActivities] = await Promise.all([dbGetAll('daily'), dbGetAll('activities')]);
  const daily = filterByDays(allDaily, period);
  const activities = filterByDays(allActivities.map(activity => ({ ...activity, date: activityDate(activity) })), period);
  const recordedDays = new Set([...daily.map(item => item.date), ...activities.map(item => item.date)]);
  $('#analysisDays').textContent = recordedDays.size;

  const completed = activities.filter(activity => activity.status === 'terminee' || activity.endedAt);
  $('#analysisActionRate').textContent = activities.length ? `${Math.round(completed.length / activities.length * 100)}%` : '0%';

  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  $('#analysisDifficultyGap').textContent = gap === null ? '—' : `${gap >= 0 ? '+' : ''}${gap.toFixed(1)}`;
  const energy = daily.length ? daily.reduce((sum, e) => sum + Number(e.energie || 0), 0) / daily.length : null;
  $('#analysisEnergy').textContent = energy === null ? '—' : energy.toFixed(1);

  const categoryCounts = new Map();
  activities.forEach(activity => {
    const label = activity.categorie || 'Sans catégorie';
    categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
  });
  const bars = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  $('#actionBars').innerHTML = bars.length ? bars.map(([label, count]) => {
    const pct = activities.length ? Math.round(count / activities.length * 100) : 0;
    return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label)}</span><strong>${count}/${activities.length}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  }).join('') : '<div class="empty-state">Pas encore d’action enregistrée.</div>';

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
  if (!daily.length && !activities.length) return [{ title: 'Point à vérifier', text: 'Enregistre plusieurs actions et quelques états de journée avant de tirer une conclusion.' }];
  const insights = [];
  if (gap !== null && gap >= 1) insights.push({ title: 'Fait observé', text: `La difficulté anticipée dépasse la difficulté réelle de ${gap.toFixed(1)} point en moyenne.` });
  if (gap !== null && gap <= -1) insights.push({ title: 'Fait observé', text: `La difficulté réelle dépasse l’anticipation de ${Math.abs(gap).toFixed(1)} point en moyenne. Les actions pourraient être sous-estimées ou mal préparées.` });

  const completedByDate = new Map();
  activities.filter(a => a.status === 'terminee' || a.endedAt).forEach(activity => {
    const date = activityDate(activity);
    completedByDate.set(date, (completedByDate.get(date) || 0) + 1);
  });
  const highEnergy = daily.filter(e => Number(e.energie) >= 7);
  const lowEnergy = daily.filter(e => Number(e.energie) <= 4);
  if (highEnergy.length && lowEnergy.length) {
    const highRate = highEnergy.reduce((sum, e) => sum + (completedByDate.get(e.date) || 0), 0) / highEnergy.length;
    const lowRate = lowEnergy.reduce((sum, e) => sum + (completedByDate.get(e.date) || 0), 0) / lowEnergy.length;
    if (highRate - lowRate >= 1) insights.push({ title: 'Hypothèse à tester', text: 'Tu clôtures davantage d’actions lors des journées à forte énergie. Une version minimale pourrait protéger les journées faibles.' });
  }

  const running = activities.filter(activity => activity.status === 'en_cours' && !activity.endedAt);
  if (running.length) insights.push({ title: 'Action nécessaire', text: `${running.length} action${running.length > 1 ? 's sont encore ouvertes' : ' est encore ouverte'}. Clôture-les pour fiabiliser les durées.` });
  if (energy !== null && energy < 4.5) insights.push({ title: 'Point à vérifier', text: 'L’énergie moyenne est basse. Avant de conclure à un manque de discipline, vérifie sommeil, charge réelle et récupération.' });
  if (!insights.length) insights.push({ title: 'Lecture actuelle', text: 'Aucun écart majeur ne ressort. Continue à noter les actions au moment où elles commencent, sans imposer de liste fixe.' });
  return insights;
}
