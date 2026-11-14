import { taskStatus } from './task-utils.js';

export function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function taskCard(task, escapeHtml, now) {
  const status = taskStatus(task, now);
  const labels = { pending:'Pending', in_progress:'In progress', overdue:'Overdue', completed:'Completed' };
  const when = new Date(task.endAt);
  const deadline = Number.isFinite(when.getTime()) ? when.toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'No deadline';
  const snooze = task.snoozeUntil && Date.parse(task.snoozeUntil) > now ? `<small>Reminder snoozed until ${escapeHtml(new Date(task.snoozeUntil).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }))}</small>` : '';
  const actions = status === 'completed'
    ? `<button class="button button-sm" data-task-action="edit" data-task-id="${escapeHtml(task.id)}">Edit</button>`
    : `<button class="button button-sm" data-task-action="start" data-task-id="${escapeHtml(task.id)}">${status==='in_progress'?'In progress':'Start'}</button><button class="button button-sm button-primary" data-task-action="complete" data-task-id="${escapeHtml(task.id)}">Mark complete</button><button class="button button-sm" data-task-action="extend" data-task-id="${escapeHtml(task.id)}">Extend 10 min</button><button class="button button-sm" data-task-action="snooze" data-task-id="${escapeHtml(task.id)}">Snooze 10 min</button><button class="button button-sm" data-task-action="edit" data-task-id="${escapeHtml(task.id)}">Edit</button>`;
  return `<article class="card task-card task-${status}" data-task-id="${escapeHtml(task.id)}"><div class="task-card-head"><div><span class="tag task-status">${labels[status]}</span><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description||'')}</p></div><button class="button button-sm task-delete" data-task-action="delete" data-task-id="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.title)}">Delete</button></div><div class="task-deadline"><strong>${status==='overdue'?'Time is up':status==='completed'?'Completed':'Deadline'}</strong><span>${escapeHtml(deadline)}</span>${snooze}</div><div class="button-row task-actions">${actions}</div></article>`;
}

export function renderTasksPage(tasks, escapeHtml, now = Date.now()) {
  const sorted = [...(tasks||[])].sort((a,b)=>{
    const aStatus=taskStatus(a,now),bStatus=taskStatus(b,now);
    const priority={overdue:0,in_progress:1,pending:2,completed:3};
    return priority[aStatus]-priority[bStatus]||Date.parse(a.endAt)-Date.parse(b.endAt);
  });
  const counts={pending:0,in_progress:0,overdue:0,completed:0};
  for (const task of sorted) counts[taskStatus(task,now)]++;
  return `<section class="task-summary-grid"><div class="card"><strong>${counts.pending}</strong><span>Pending</span></div><div class="card"><strong>${counts.in_progress}</strong><span>In progress</span></div><div class="card"><strong>${counts.overdue}</strong><span>Overdue</span></div><div class="card"><strong>${counts.completed}</strong><span>Completed</span></div></section><div class="task-list">${sorted.length?sorted.map(task=>taskCard(task,escapeHtml,now)).join(''):'<div class="card empty-state">Nothing on your task list yet. Add a task with a deadline to get started.</div>'}</div>`;
}

export function taskFormMarkup(task, escapeHtml, now = Date.now()) {
  const suggestedEnd = new Date(Number(now)+60*60_000);
  const start = localDateTimeValue(task?.startAt)||localDateTimeValue(new Date(Number(now)).toISOString());
  const end = localDateTimeValue(task?.endAt)||localDateTimeValue(suggestedEnd.toISOString());
  const leads = task?.reminderLeadMinutes||[5];
  return `<div class="field"><label for="task-title">Task name *</label><input id="task-title" name="title" required maxlength="120" value="${escapeHtml(task?.title||'')}" placeholder="e.g. Complete Physics Chapter 3"></div><div class="field"><label for="task-description">Details</label><textarea id="task-description" name="description" maxlength="1000" placeholder="Optional notes">${escapeHtml(task?.description||'')}</textarea></div><div class="field-grid"><div class="field"><label for="task-start">Start time (optional)</label><input id="task-start" name="startAt" type="datetime-local" value="${start}"></div><div class="field"><label for="task-end">End time *</label><input id="task-end" name="endAt" type="datetime-local" value="${end}" required></div></div><div class="field"><label for="task-lead-reminders">Deadline reminders</label><select id="task-lead-reminders" name="reminderLeadMinutes"><option value="" ${!leads.length?'selected':''}>At deadline only</option><option value="5" ${leads.length===1&&leads.includes(5)?'selected':''}>5 minutes before and at deadline</option><option value="10" ${leads.length===1&&leads.includes(10)?'selected':''}>10 minutes before and at deadline</option><option value="5,10" ${leads.includes(5)&&leads.includes(10)?'selected':''}>5 and 10 minutes before, and at deadline</option></select></div><p class="muted small">Tasks stay pending until you complete them. Missed deadlines are marked Overdue.</p>`;
}

