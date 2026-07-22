// Ascension V1.2 — timeline-events.js
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
  $('#eventForm').addEventListener('submit', saveActivityEvent);
  $('#cancelEventButton').addEventListener('click', () => { $('#eventDialog').close(); $('#eventForm').reset(); });
  $('#endActivityForm').addEventListener('submit', finishActivity);
  $('#cancelEndActivityButton').addEventListener('click', () => { $('#endActivityDialog').close(); $('#endActivityForm').reset(); });
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
    $('#confirmDialog').close(); confirmResolver?.(false); confirmResolver = null;
  });
  $('#confirmAccept').addEventListener('click', () => {
    $('#confirmDialog').close(); confirmResolver?.(true); confirmResolver = null;
  });
  $('#confirmDialog').addEventListener('cancel', event => {
    event.preventDefault(); $('#confirmDialog').close(); confirmResolver?.(false); confirmResolver = null;
  });
  $('#eventDialog').addEventListener('cancel', event => { event.preventDefault(); $('#eventDialog').close(); $('#eventForm').reset(); });
  $('#endActivityDialog').addEventListener('cancel', event => { event.preventDefault(); $('#endActivityDialog').close(); $('#endActivityForm').reset(); });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredInstallPrompt = event; $('#installButton').classList.remove('hidden');
  });
  $('#installButton').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; $('#installButton').classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => toast('Application installée.'));
  window.setInterval(() => {
    if ($('#view-today').classList.contains('active')) renderTodayActivities();
  }, 30_000);
}
