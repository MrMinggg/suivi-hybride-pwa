/* Ascension 1.1 — exports, restauration et événements */
'use strict';

async function getFullData() {
  const [daily, goals, journal, settings, activities] = await Promise.all([
    dbGetAll('daily'), dbGetAll('goals'), dbGetAll('journal'), getSettings(), dbGetAll('activities')
  ]);
  return { daily, goals, journal, activities, settings };
}

async function exportJson() {
  const data = await getFullData();
  const payload = {
    kind: 'ascension-backup',
    version: '1.1.0',
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
    'date', 'heureDebut', 'heureFin', 'dureeMinutes', 'statut', 'titre', 'categorie', 'note',
    'humeur', 'energie', 'stress', 'difficulteAnticipee', 'difficulteReelle', 'causeEchec', 'reussite', 'evitement', 'demain'
  ];
  const rows = [headers.map(csvEscape).join(';')];
  const sorted = [...activities].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const activity of sorted) {
    const date = activityDate(activity);
    const state = dailyByDate.get(date) || {};
    const row = {
      date,
      heureDebut: formatClock(activity.startedAt),
      heureFin: activity.endedAt ? formatClock(activity.endedAt) : '',
      dureeMinutes: activity.endedAt ? durationMinutes(activity) : '',
      statut: activity.status,
      titre: activity.titre,
      categorie: activity.categorie,
      note: activity.note,
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
  downloadBlob(`ascension-actions-${localDateISO()}.csv`, `\uFEFF${rows.join('\n')}`, 'text/csv;charset=utf-8');
  toast('CSV des actions téléchargé.');
}

function summarizeData(data) {
  const daily = data.daily || [];
  const activities = data.activities || [];
  const completed = activities.filter(activity => activity.status === 'terminee' || activity.endedAt);
  const running = activities.filter(activity => activity.status === 'en_cours' && !activity.endedAt);
  const totalMinutes = completed.reduce((sum, activity) => sum + durationMinutes(activity), 0);
  const categories = new Map();
  activities.forEach(activity => {
    const category = activity.categorie || 'Sans catégorie';
    categories.set(category, (categories.get(category) || 0) + 1);
  });
  const difficulty = daily.filter(e => Number.isFinite(e.difficulteAnticipee) && Number.isFinite(e.difficulteReelle));
  const gap = difficulty.length ? difficulty.reduce((sum, e) => sum + e.difficulteAnticipee - e.difficulteReelle, 0) / difficulty.length : null;
  const causeCounts = new Map();
  daily.filter(e => e.causeEchec).forEach(e => causeCounts.set(e.causeEchec, (causeCounts.get(e.causeEchec) || 0) + 1));
  const causes = [...causeCounts.entries()].sort((a, b) => b[1] - a[1]);
  return { total: activities.length, completed: completed.length, running: running.length, totalMinutes, categories: [...categories.entries()].sort((a, b) => b[1] - a[1]), gap, causes };
}

async function exportMarkdown() {
  const data = await getFullData();
  const summary = summarizeData(data);
  const daily = [...data.daily].sort((a, b) => b.date.localeCompare(a.date));
  const activities = [...data.activities].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const goals = data.goals.filter(g => g.status !== 'archive');
  const lines = [
    '# Rapport Ascension',
    '',
    `- Export : ${formatDateTime(new Date().toISOString())}`,
    `- Utilisateur : ${data.settings.displayName || '—'}`,
    `- Projet actif : ${data.settings.activeProject || '—'}`,
    `- Phrase directrice : ${data.settings.guidingSentence || '—'}`,
    `- Journées avec état enregistré : ${daily.length}`,
    `- Actions enregistrées : ${summary.total}`,
    `- Actions terminées : ${summary.completed}`,
    `- Actions encore ouvertes : ${summary.running}`,
    `- Temps total clôturé : ${formatDuration(summary.totalMinutes)}`,
    '',
    '## Répartition des actions',
    ''
  ];
  if (summary.categories.length) summary.categories.forEach(([category, count]) => lines.push(`- ${category} : ${count}`));
  else lines.push('- Aucune action enregistrée.');
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

  lines.push('', '## Chronologie des actions', '');
  if (!activities.length) lines.push('- Aucune action.');
  activities.forEach(activity => {
    const status = activity.status === 'terminee' || activity.endedAt ? 'Terminée' : 'En cours';
    lines.push(`### ${activityDate(activity)} · ${formatClock(activity.startedAt)} · ${activity.titre}`);
    lines.push(`- Statut : ${status}`);
    lines.push(`- Catégorie : ${activity.categorie || 'Sans catégorie'}`);
    lines.push(`- Début : ${formatDateTime(activity.startedAt)}`);
    lines.push(`- Fin : ${activity.endedAt ? formatDateTime(activity.endedAt) : '—'}`);
    lines.push(`- Durée : ${activity.endedAt ? formatDuration(durationMinutes(activity)) : 'en cours'}`);
    if (activity.note) lines.push(`- Note : ${activity.note}`);
    lines.push('');
  });

  lines.push('## États quotidiens', '');
  if (!daily.length) lines.push('- Aucune journée enregistrée.');
  daily.forEach(entry => {
    const dayActivities = activities.filter(activity => activityDate(activity) === entry.date);
    lines.push(`### ${entry.date}`);
    lines.push(`- Actions du jour : ${dayActivities.length}, dont ${dayActivities.filter(a => a.status === 'terminee' || a.endedAt).length} terminée(s)`);
    const legacyCount = legacyActionCount(entry);
    if (legacyCount) lines.push(`- Anciennes cases V1 conservées : ${legacyCount}/${ACTION_FIELDS.length}`);
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
  lines.push('## Consigne pour l’analyse ChatGPT', '', 'Distinguer les faits observés, les hypothèses, les points à vérifier et les recommandations. Ne pas poser de diagnostic. Utiliser la chronologie, les durées et les notes libres. Proposer une seule correction prioritaire pour la prochaine période.');
  downloadBlob(`ascension-rapport-${localDateISO()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  toast('Rapport Markdown téléchargé.');
}

function validateBackup(payload) {
  return payload?.kind === 'ascension-backup' && payload.data && Array.isArray(payload.data.daily) && Array.isArray(payload.data.goals) && Array.isArray(payload.data.journal) && (payload.data.activities === undefined || Array.isArray(payload.data.activities));
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
      preview.innerHTML = `<div class="insight-card"><strong>Sauvegarde complète</strong><span>${payload.data.activities?.length || 0} actions, ${payload.data.daily.length} journées, ${payload.data.goals.length} objectifs et ${payload.data.journal.length} entrées de journal. L’import remplacera les données locales.</span></div>`;
    } else {
      const changes = payload.changes;
      const count = (changes.addGoals?.length || 0) + (changes.updateGoals?.length || 0) + (changes.archiveGoalIds?.length || 0) + (changes.addJournalEntries?.length || 0) + (changes.addActivities?.length || 0) + (changes.settings ? 1 : 0);
      preview.innerHTML = `<div class="insight-card"><strong>Mise à jour structurée</strong><span>${count} groupe${count > 1 ? 's' : ''} de modification détecté${count > 1 ? 's' : ''}. Une sauvegarde locale sera exportée avant application.</span></div>`;
    }
    $('#applyImport').disabled = false;
    $('#cancelImport').disabled = false;
  } catch (error) {
    $('#importPreview').className = 'import-preview empty-state';
    $('#importPreview').textContent = `Import impossible : ${error.message}`;
  }
}

async function restoreBackup(data) {
  await Promise.all(['daily', 'goals', 'journal', 'activities', 'settings'].map(dbClear));
  await Promise.all((data.daily || []).map(item => dbPut('daily', item)));
  await Promise.all((data.goals || []).map(item => dbPut('goals', item)));
  await Promise.all((data.journal || []).map(item => dbPut('journal', item)));
  await Promise.all((data.activities || []).map(item => dbPut('activities', item)));
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
  for (const activity of changes.addActivities || []) {
    const start = activity.startedAt || new Date().toISOString();
    await dbPut('activities', {
      id: activity.id || uid('activity'),
      date: activity.date || localDateISO(new Date(start)),
      titre: activity.titre || 'Action ajoutée',
      categorie: activity.categorie || '',
      note: activity.note || '',
      status: activity.status || (activity.endedAt ? 'terminee' : 'en_cours'),
      startedAt: start,
      endedAt: activity.endedAt || null,
      createdAt: activity.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

async function resetApplication() {
  const accepted = await confirmAction('Réinitialiser toutes les données ?', 'Cette opération efface les actions, journées, objectifs, journal et réglages de cet appareil. Elle est irréversible sans sauvegarde JSON.', 'Tout effacer');
  if (!accepted) return;
  await Promise.all(['daily', 'goals', 'journal', 'activities', 'settings'].map(dbClear));
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
  $('#toggleActivityForm').addEventListener('click', () => {
    $('#activityForm').classList.toggle('hidden');
    if (!$('#activityForm').classList.contains('hidden')) $('#activityForm').elements.titre.focus();
  });
  $('#cancelActivityButton').addEventListener('click', () => { $('#activityForm').reset(); $('#activityForm').classList.add('hidden'); });
  $('#activityForm').addEventListener('submit', createActivity);
  $('#activityList').addEventListener('click', handleActivityAction);
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
  window.setInterval(() => {
    if ($('#view-today').classList.contains('active')) renderTodayActivities();
  }, 60_000);
}
