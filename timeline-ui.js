// Ascension V1.2 — couche chronologique chargée après app.js
(function prepareChronologyInterface() {
  const today = document.querySelector('#view-today');
  if (today) today.innerHTML = `
        <div class="section-heading sticky-heading">
          <div>
            <p class="eyebrow">Journal chronologique</p>
            <h2>Aujourd’hui</h2>
          </div>
          <span id="todayDateLabel" class="date-chip"></span>
        </div>

        <section class="panel chronology-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Ce que tu fais maintenant</p>
              <h3>Chronologie de la journée</h3>
            </div>
            <button id="toggleActivityForm" class="button primary" type="button">+ Commencer</button>
          </div>
          <p class="muted chronology-intro">Démarre une activité, ajoute les événements au moment où ils arrivent, mets-la en pause si tu changes de tâche, puis appuie sur « Fin ».</p>
          <form id="activityForm" class="activity-form form-stack hidden">
            <label>Que commences-tu ?
              <input name="titre" required maxlength="160" placeholder="Ex. Préparer le souper, salle, travailler sur un dossier…">
            </label>
            <div class="two-column">
              <label>Catégorie facultative
                <select name="categorie">
                  <option value="">Sans catégorie</option>
                  <option>Travail</option>
                  <option>Autonomie</option>
                  <option>Concentration</option>
                  <option>Sport</option>
                  <option>Social</option>
                  <option>Projet</option>
                  <option>Apprentissage</option>
                  <option>Personnel</option>
                  <option>Autre</option>
                </select>
              </label>
              <label>Contexte de départ facultatif
                <input name="note" maxlength="240" placeholder="Ex. Je voulais commencer depuis 20 min">
              </label>
            </div>
            <p class="muted activity-help">L’heure est automatique. Démarrer une nouvelle activité met l’activité actuelle en pause sans la terminer.</p>
            <div class="action-row">
              <button class="button primary" type="submit">Commencer maintenant</button>
              <button id="cancelActivityButton" class="button secondary" type="button">Annuler</button>
            </div>
          </form>
          <div id="activityList" class="activity-list empty-state">Aucune activité enregistrée aujourd’hui.</div>
        </section>

        <details class="panel day-review">
          <summary>
            <span><strong>Bilan facultatif de fin de journée</strong><small>Humeur, énergie, stress, difficulté et notes générales</small></span>
          </summary>
          <form id="dailyForm" class="form-stack day-review-form">
            <section class="review-section">
              <h3>État du jour</h3>
              <div class="range-grid">
                <label>Humeur <output id="moodOutput">5</output>/10<input type="range" name="humeur" min="1" max="10" value="5"></label>
                <label>Énergie <output id="energyOutput">5</output>/10<input type="range" name="energie" min="1" max="10" value="5"></label>
                <label>Stress <output id="stressOutput">5</output>/10<input type="range" name="stress" min="1" max="10" value="5"></label>
              </div>
            </section>

            <section class="review-section">
              <h3>Difficulté et évitement</h3>
              <div class="two-column">
                <label>Difficulté anticipée
                  <input type="number" name="difficulteAnticipee" min="0" max="10" step="1" placeholder="0 à 10">
                </label>
                <label>Difficulté réelle
                  <input type="number" name="difficulteReelle" min="0" max="10" step="1" placeholder="0 à 10">
                </label>
              </div>
              <label>Cause principale si quelque chose n’a pas été fait
                <select name="causeEchec">
                  <option value="">Aucune / non applicable</option>
                  <option>Manque de temps réel</option>
                  <option>Fatigue</option>
                  <option>Oubli</option>
                  <option>Évitement</option>
                  <option>Dépendance à quelqu’un</option>
                  <option>Distraction numérique</option>
                  <option>Objectif mal défini</option>
                  <option>Imprévu externe</option>
                  <option>Résultat partiel jugé suffisant</option>
                  <option>Nouvelle idée plus stimulante</option>
                </select>
              </label>
            </section>

            <section class="review-section">
              <h3>Notes générales</h3>
              <label>Réussite du jour<textarea name="reussite" rows="3" placeholder="Ce que tu as réellement réussi"></textarea></label>
              <label>Chose évitée<textarea name="evitement" rows="3" placeholder="Ce que tu as reporté ou contourné"></textarea></label>
              <label>Première action de demain<textarea name="demain" rows="2" placeholder="Une action concrète et précise"></textarea></label>
            </section>

            <div class="action-row">
              <button class="button primary" type="submit">Enregistrer le bilan</button>
              <button id="clearTodayButton" class="button secondary" type="button">Effacer les champs</button>
            </div>
          </form>
        </details>
      `;
  const scoreLabel = document.querySelector('#weeklyScore')?.nextElementSibling; if (scoreLabel) scoreLabel.textContent = 'temps actif';
  const completedLabel = document.querySelector('#metricCompleted')?.previousElementSibling; if (completedLabel) completedLabel.textContent = 'Activités terminées';
  const trackedLabel = document.querySelector('#metricTrackedTime')?.previousElementSibling; if (trackedLabel) trackedLabel.textContent = 'Temps actif';
  const interruptionCard = document.querySelector('#metricInProgress')?.parentElement; if (interruptionCard) { interruptionCard.querySelector('.metric-label').textContent = 'Interruptions'; interruptionCard.querySelector('.metric-note').textContent = 'pauses enregistrées'; }
  const eventCard = document.querySelector('#metricActiveDays')?.parentElement; if (eventCard) { eventCard.querySelector('.metric-label').textContent = 'Repères ajoutés'; eventCard.querySelector('.metric-note').textContent = 'pendant les activités'; }
  const analysisRate = document.querySelector('#analysisActionRate')?.parentElement; if (analysisRate) { analysisRate.querySelector('.metric-label').textContent = 'Temps actif'; analysisRate.querySelector('.metric-note').textContent = 'sur la période'; }
  const barsTitle = document.querySelector('#actionBars')?.previousElementSibling; if (barsTitle) barsTitle.textContent = 'Répartition du temps actif';
  const confirmDialog = document.querySelector('#confirmDialog'); if (confirmDialog && !document.querySelector('#eventDialog')) confirmDialog.insertAdjacentHTML('beforebegin', `  <dialog id="eventDialog">
    <form id="eventForm" class="dialog-content form-stack">
      <input type="hidden" name="activityId">
      <div>
        <p class="eyebrow">Pendant l’activité</p>
        <h2>Ajouter un repère</h2>
      </div>
      <div class="two-column">
        <label>Type
          <select name="type">
            <option value="repere">Repère</option>
            <option value="decision">Décision</option>
            <option value="probleme">Problème</option>
            <option value="emotion">Émotion</option>
            <option value="idee">Idée</option>
            <option value="resultat">Résultat</option>
          </select>
        </label>
        <label>Heure
          <span class="date-input-wrap"><input type="time" name="heure" required></span>
        </label>
      </div>
      <label>Ce qui s’est passé
        <textarea name="texte" rows="4" required maxlength="800" placeholder="Ex. Il me manque un ingrédient, j’ai changé de méthode, je commence à perdre ma concentration…"></textarea>
      </label>
      <div class="action-row">
        <button class="button primary" type="submit">Ajouter à la chronologie</button>
        <button id="cancelEventButton" class="button secondary" type="button">Annuler</button>
      </div>
    </form>
  </dialog>

  <dialog id="endActivityDialog">
    <form id="endActivityForm" class="dialog-content form-stack">
      <input type="hidden" name="activityId">
      <div>
        <p class="eyebrow">Clôture</p>
        <h2>Terminer l’activité</h2>
      </div>
      <label>Quelque chose à retenir ? <span class="muted">(facultatif)</span>
        <textarea name="conclusion" rows="4" maxlength="800" placeholder="Résultat, ressenti, décision pour la prochaine fois…"></textarea>
      </label>
      <div class="action-row">
        <button class="button primary" type="submit">Fin maintenant</button>
        <button id="cancelEndActivityButton" class="button secondary" type="button">Annuler</button>
      </div>
    </form>
  </dialog>

`);
})();

function formatClock(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function timeInputValue(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function localDateTimeToISO(date, time) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function activityEvents(activity) {
  return Array.isArray(activity?.events) ? activity.events : [];
}

function activityPauses(activity) {
  return Array.isArray(activity?.pauses) ? activity.pauses : [];
}

function openPause(activity) {
  return activityPauses(activity).find(pause => pause.startedAt && !pause.endedAt) || null;
}

function elapsedDurationMinutes(activity, end = new Date()) {
  if (!activity?.startedAt) return 0;
  const startMs = new Date(activity.startedAt).getTime();
  const endMs = activity.endedAt ? new Date(activity.endedAt).getTime() : end.getTime();
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

function pausedDurationMinutes(activity, end = new Date()) {
  return activityPauses(activity).reduce((sum, pause) => {
    if (!pause.startedAt) return sum;
    const startMs = new Date(pause.startedAt).getTime();
    const endMs = pause.endedAt ? new Date(pause.endedAt).getTime() : end.getTime();
    return sum + Math.max(0, Math.round((endMs - startMs) / 60_000));
  }, 0);
}

function durationMinutes(activity, end = new Date()) {
  return Math.max(0, elapsedDurationMinutes(activity, end) - pausedDurationMinutes(activity, end));
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

function isActivityFinished(activity) {
  return activity?.status === 'terminee' || Boolean(activity?.endedAt);
}

function isActivityPaused(activity) {
  return !isActivityFinished(activity) && (activity?.status === 'en_pause' || Boolean(openPause(activity)));
}

function isActivityRunning(activity) {
  return !isActivityFinished(activity) && !isActivityPaused(activity);
}

function eventTypeLabel(type) {
  const labels = {
    repere: 'Repère', decision: 'Décision', probleme: 'Problème', emotion: 'Émotion',
    idee: 'Idée', resultat: 'Résultat', pause: 'Pause', reprise: 'Reprise', debut: 'Début', fin: 'Fin'
  };
  return labels[type] || 'Repère';
}

function activityTimelineItems(activity) {
  const items = [{ id: `${activity.id}_start`, at: activity.startedAt, type: 'debut', text: activity.note || 'Activité commencée' }];
  for (const event of activityEvents(activity)) {
    if (event?.at && event?.texte) items.push({ ...event, type: event.type || 'repere' });
  }
  for (const pause of activityPauses(activity)) {
    if (pause.startedAt) items.push({ id: `${pause.id}_start`, at: pause.startedAt, type: 'pause', text: pause.reason || 'Activité mise en pause' });
    if (pause.endedAt) items.push({ id: `${pause.id}_end`, at: pause.endedAt, type: 'reprise', text: 'Activité reprise' });
  }
  if (activity.endedAt) items.push({ id: `${activity.id}_end`, at: activity.endedAt, type: 'fin', text: activity.conclusion || 'Activité terminée' });
  return items.filter(item => item.at).sort((a, b) => a.at.localeCompare(b.at));
}

function activityTimelineHtml(activity) {
  return activityTimelineItems(activity).map(item => `
    <li class="timeline-event timeline-${escapeHtml(item.type)}">
      <time>${formatClock(item.at)}</time>
      <span class="timeline-dot" aria-hidden="true"></span>
      <div><strong>${escapeHtml(eventTypeLabel(item.type))}</strong><p>${escapeHtml(item.text)}</p></div>
    </li>`).join('');
}

function activityStatusLabel(activity) {
  if (isActivityFinished(activity)) return 'Terminée';
  if (isActivityPaused(activity)) return 'En pause';
  return 'En cours';
}
