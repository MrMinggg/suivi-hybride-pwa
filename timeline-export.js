// Ascension V1.2 — timeline-export.js
async function exportJson() {
  const data = await getFullData();
  const payload = {
    kind: 'ascension-backup',
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    data
  };
  downloadBlob(`ascension-sauvegarde-${localDateISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Sauvegarde JSON téléchargée.');
}

async function exportCsv() {
  const [activities, daily] = await Promise.all([dbGetAll('activities'), dbGetAll('daily')]);
  const dailyByDate = new Map(daily.map(entry => [entry.date, entry]));
  const headers = [
    'date', 'heureDebut', 'heureFin', 'dureeActiveMinutes', 'dureeEcouleeMinutes', 'pauseMinutes', 'statut', 'titre', 'categorie', 'contexteDepart', 'conclusion', 'nombreReperes', 'chronologie',
    'humeur', 'energie', 'stress', 'difficulteAnticipee', 'difficulteReelle', 'causeEchec', 'reussite', 'evitement', 'demain'
  ];
  const rows = [headers.map(csvEscape).join(';')];
  const sorted = [...activities].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const activity of sorted) {
    const date = activityDate(activity);
    const state = dailyByDate.get(date) || {};
    const chronology = activityTimelineItems(activity).map(item => `${formatClock(item.at)} ${eventTypeLabel(item.type)}: ${item.text}`).join(' | ');
    const row = {
      date,
      heureDebut: formatClock(activity.startedAt),
      heureFin: activity.endedAt ? formatClock(activity.endedAt) : '',
      dureeActiveMinutes: durationMinutes(activity),
      dureeEcouleeMinutes: elapsedDurationMinutes(activity),
      pauseMinutes: pausedDurationMinutes(activity),
      statut: activityStatusLabel(activity),
      titre: activity.titre,
      categorie: activity.categorie,
      contexteDepart: activity.note,
      conclusion: activity.conclusion,
      nombreReperes: activityEvents(activity).length,
      chronologie,
      humeur: state.humeur,
      energie: state.energie,
      stress: state.stress,
      difficulteAnticipee: state.difficulteAnticipee,
      difficulteReelle: state.difficulteReelle,
      causeEchec: state.causeEchec,
      reussite: state.reussite,
      evitement: state.evitement,
      demain: state.demain
    };
    rows.push(headers.map(header => csvEscape(row[header])).join(';'));
  }
  downloadBlob(`ascension-chronologie-${localDateISO()}.csv`, `\uFEFF${rows.join('\n')}`, 'text/csv;charset=utf-8');
  toast('CSV de la chronologie téléchargé.');
}

function summarizeData(data) {
  const daily = data.daily || [];
  const activities = data.activities || [];
  const completed = activities.filter(isActivityFinished);
  const open = activities.filter(activity => !isActivityFinished(activity));
  const totalMinutes = activities.reduce((sum, activity) => sum + durationMinutes(activity), 0);
  const totalElapsed = activities.reduce((sum, activity) => sum + elapsedDurationMinutes(activity), 0);
  const totalPaused = activities.reduce((sum, activity) => sum + pausedDurationMinutes(activity), 0);
  const eventCount = activities.reduce((sum, activity) => sum + activityEvents(activity).length, 0);
  const pauseCount = activities.reduce((sum, activity) => sum + activityPauses(activity).length, 0);
  const categories = new Map();
  activities.forEach(activity => {
    const category = activity.categorie || 'Sans catégorie';
    categories.set(category, (categories.get(category) || 0) + durationMinutes(activity));
  });
  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  const causeCounts = new Map();
  daily.filter(e => e.causeEchec).forEach(e => causeCounts.set(e.causeEchec, (causeCounts.get(e.causeEchec) || 0) + 1));
  const causes = [...causeCounts.entries()].sort((a, b) => b[1] - a[1]);
  return { total: activities.length, completed: completed.length, running: open.length, totalMinutes, totalElapsed, totalPaused, eventCount, pauseCount, categories: [...categories.entries()].sort((a, b) => b[1] - a[1]), gap, causes };
}

async function exportMarkdown() {
  const data = await getFullData();
  const summary = summarizeData(data);
  const daily = [...data.daily].sort((a, b) => b.date.localeCompare(a.date));
  const activities = [...data.activities].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const goals = data.goals.filter(g => g.status !== 'archive');
  const lines = [
    '# Rapport Ascension — Chronologie',
    '',
    `- Export : ${formatDateTime(new Date().toISOString())}`,
    `- Utilisateur : ${data.settings.displayName || '—'}`,
    `- Projet actif : ${data.settings.activeProject || '—'}`,
    `- Phrase directrice : ${data.settings.guidingSentence || '—'}`,
    `- Journées documentées : ${new Set([...daily.map(item => item.date), ...activities.map(activityDate)]).size}`,
    `- Activités enregistrées : ${summary.total}`,
    `- Activités terminées : ${summary.completed}`,
    `- Activités encore ouvertes : ${summary.running}`,
    `- Temps actif : ${formatDuration(summary.totalMinutes)}`,
    `- Temps écoulé total : ${formatDuration(summary.totalElapsed)}`,
    `- Temps en pause : ${formatDuration(summary.totalPaused)}`,
    `- Repères internes : ${summary.eventCount}`,
    `- Interruptions : ${summary.pauseCount}`,
    '',
    '## Répartition du temps actif',
    ''
  ];
  if (summary.categories.length) summary.categories.forEach(([category, minutes]) => lines.push(`- ${category} : ${formatDuration(minutes)}`));
  else lines.push('- Aucune activité enregistrée.');
  lines.push('', '## Difficulté', '');
  lines.push(summary.gap === null ? '- Pas assez de mesures comparables.' : `- Écart moyen difficulté anticipée − réelle : ${summary.gap >= 0 ? '+' : ''}${summary.gap.toFixed(2)}`);
  lines.push('', '## Causes déclarées', '');
  if (summary.causes.length) summary.causes.forEach(([cause, count]) => lines.push(`- ${cause} : ${count}`));
  else lines.push('- Aucune cause déclarée.');
  lines.push('', '## Objectifs actifs', '');
  if (goals.length) goals.forEach(goal => {
    lines.push(`### ${goal.titre}`);
    lines.push(`- Catégorie : ${goal.categorie}`);
    lines.push(`- Définition : ${goal.definition}`);
    lines.push(`- Cible : ${goal.cible} par semaine`);
    lines.push(`- Cycle : ${goal.dateDebut} → ${goal.dateRevision}`);
    lines.push(`- Progression semaine actuelle : ${goalWeekProgress(goal)}/${goal.cible}`);
    lines.push('');
  });
  else lines.push('- Aucun objectif actif.');

  lines.push('', '## Chronologie détaillée', '');
  if (!activities.length) lines.push('- Aucune activité.');
  let currentDate = '';
  for (const activity of activities) {
    const date = activityDate(activity);
    if (date !== currentDate) {
      currentDate = date;
      lines.push(`## Journée du ${date}`, '');
    }
    lines.push(`### ${formatClock(activity.startedAt)} — ${activity.titre}`);
    lines.push(`- Statut : ${activityStatusLabel(activity)}`);
    lines.push(`- Catégorie : ${activity.categorie || 'Sans catégorie'}`);
    lines.push(`- Début : ${formatDateTime(activity.startedAt)}`);
    lines.push(`- Fin : ${activity.endedAt ? formatDateTime(activity.endedAt) : '—'}`);
    lines.push(`- Temps actif : ${formatDuration(durationMinutes(activity))}`);
    lines.push(`- Temps écoulé : ${formatDuration(elapsedDurationMinutes(activity))}`);
    if (pausedDurationMinutes(activity)) lines.push(`- Temps en pause : ${formatDuration(pausedDurationMinutes(activity))}`);
    if (activity.note) lines.push(`- Contexte de départ : ${activity.note}`);
    lines.push('- Déroulement :');
    for (const item of activityTimelineItems(activity)) lines.push(`  - ${formatClock(item.at)} — ${eventTypeLabel(item.type)} : ${item.text}`);
    if (activity.conclusion) lines.push(`- À retenir : ${activity.conclusion}`);
    lines.push('');
  }

  lines.push('## Bilans quotidiens', '');
  if (!daily.length) lines.push('- Aucun bilan enregistré.');
  daily.forEach(entry => {
    lines.push(`### ${entry.date}`);
    lines.push(`- Humeur / énergie / stress : ${entry.humeur}/10 — ${entry.energie}/10 — ${entry.stress}/10`);
    if (Number.isFinite(entry.difficulteAnticipee) || Number.isFinite(entry.difficulteReelle)) lines.push(`- Difficulté anticipée / réelle : ${entry.difficulteAnticipee ?? '—'}/10 — ${entry.difficulteReelle ?? '—'}/10`);
    if (entry.causeEchec) lines.push(`- Cause déclarée : ${entry.causeEchec}`);
    if (entry.reussite) lines.push(`- Réussite : ${entry.reussite}`);
    if (entry.evitement) lines.push(`- Évitement : ${entry.evitement}`);
    if (entry.demain) lines.push(`- Première action suivante : ${entry.demain}`);
    lines.push('');
  });
  lines.push('## Journal séparé', '');
  const journal = [...data.journal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (!journal.length) lines.push('- Aucune entrée.');
  journal.forEach(entry => {
    lines.push(`### ${entry.titre} — ${entry.date}`);
    lines.push(`- Type : ${entry.type}`);
    lines.push(entry.contenu);
    if (entry.pointSuivi) lines.push(`- Point à surveiller : ${entry.pointSuivi}`);
    lines.push('');
  });
  lines.push('## Consigne pour l’analyse ChatGPT', '', 'Reconstituer la journée dans l’ordre. Distinguer faits observés, hypothèses, points à vérifier et recommandations. Examiner les transitions, interruptions, décisions, émotions, temps actifs et écarts entre intention et action. Ne pas poser de diagnostic. Demander d’abord quels éléments étaient seulement des tests si le rapport contient des données de test.');
  downloadBlob(`ascension-chronologie-${localDateISO()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  toast('Rapport chronologique téléchargé.');
}

async function applyStructuredUpdate(changes) {
  if (changes.settings) await setSettings({ ...(await getSettings()), ...changes.settings });
  for (const goal of changes.addGoals || []) {
    await dbPut('goals', {
      id: goal.id || uid('goal'), titre: goal.titre || 'Nouvel objectif', categorie: goal.categorie || 'Autre',
      definition: goal.definition || '', cible: Number(goal.cible || 1), dateDebut: goal.dateDebut || localDateISO(),
      dateRevision: goal.dateRevision || localDateISO(new Date(Date.now() + 28 * 86_400_000)), principal: Boolean(goal.principal),
      status: goal.status || 'actif', completions: Array.isArray(goal.completions) ? goal.completions : [],
      createdAt: goal.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
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
      id: entry.id || uid('journal'), date: entry.date || localDateISO(), type: entry.type || 'Autre',
      titre: entry.titre || 'Mise à jour ChatGPT', contenu: entry.contenu || '', pointSuivi: entry.pointSuivi || '',
      createdAt: entry.createdAt || new Date().toISOString()
    });
  }
  for (const activity of changes.addActivities || []) {
    const start = activity.startedAt || new Date().toISOString();
    await dbPut('activities', {
      id: activity.id || uid('activity'), date: activity.date || localDateISO(new Date(start)), titre: activity.titre || 'Activité ajoutée',
      categorie: activity.categorie || '', note: activity.note || '', conclusion: activity.conclusion || '',
      status: activity.status || (activity.endedAt ? 'terminee' : 'en_cours'), startedAt: start, endedAt: activity.endedAt || null,
      events: Array.isArray(activity.events) ? activity.events : [], pauses: Array.isArray(activity.pauses) ? activity.pauses : [],
      createdAt: activity.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
}
