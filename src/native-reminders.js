import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildUpcomingReminders, moveReminderOutOfQuietHours, reminderId } from './reminder-utils.js';
import { buildUpcomingTaskReminders } from './task-utils.js';

const actionTypeId = 'habit-reminder-actions';
const managedExtra = extra => extra?.kind === 'daily-habits-reminder';
const managedFocusExtra = extra => extra?.kind === 'daily-habits-focus';
const managedTaskExtra = extra => extra?.kind === 'daily-habits-task';
let configured = false;

function channelId(sound, vibration) {
  return `habit-reminders-v1-s${sound ? 1 : 0}-v${vibration ? 1 : 0}`;
}

async function ensureChannels() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const existing = new Set((await LocalNotifications.listChannels()).channels.map(channel => channel.id));
  for (const sound of [false, true]) for (const vibration of [false, true]) {
    const id = channelId(sound, vibration);
    if (existing.has(id)) continue;
    await LocalNotifications.createChannel({
      id,
      name: 'Habit reminders',
      description: 'Notifications at the times set for your habits.',
      importance: 4,
      visibility: 0,
      vibration,
      ...(sound ? { sound:'reminder.wav' } : {}),
    });
  }
}

export async function requestAndroidReminderPermission() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return { supported:false, granted:false };
  const before = await LocalNotifications.checkPermissions();
  const permission = before.display === 'granted' ? before : await LocalNotifications.requestPermissions();
  if (permission.display === 'granted') await ensureChannels();
  return { supported:true, granted:permission.display === 'granted' };
}

export async function configureAndroidReminders({ onComplete, onDelivered, onTaskComplete, onTaskDelivered, onTaskSnooze }) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' || configured) return false;
  await LocalNotifications.registerActionTypes({ types:[{
    id:actionTypeId,
    actions:[{ id:'complete', title:'Mark complete' }, { id:'snooze', title:'Snooze' }],
  }] });
  await LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
    const extra = notification?.extra;
    if (managedTaskExtra(extra)) {
      if (actionId === 'complete') await onTaskComplete(extra.taskId);
      if (actionId === 'snooze') {
        await onTaskDelivered(extra.taskId, extra.reminderKey);
        await onTaskSnooze(extra.taskId, extra.snoozeMinutes || 10);
      }
      return;
    }
    if (!managedExtra(extra)) return;
    if (actionId === 'complete') await onComplete(extra.habitId, extra.date);
    if (actionId === 'snooze') {
      await onDelivered(extra.habitId, extra.date);
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return;
      const snoozeId = reminderId(extra.habitId, `${extra.date}:${Date.now()}`, 'snooze');
      const snoozeMinutes = [5,10,15,30].includes(Number(extra.snoozeMinutes)) ? Number(extra.snoozeMinutes) : 10;
      const snoozeAt = moveReminderOutOfQuietHours(new Date(Date.now() + snoozeMinutes * 60_000), {
        quietHoursEnabled:extra.quietHoursEnabled,
        quietHoursStart:extra.quietHoursStart,
        quietHoursEnd:extra.quietHoursEnd,
      });
      await LocalNotifications.schedule({ notifications:[{
        id:snoozeId,
        title:'Daily Habits',
        body:'A planned habit is waiting. Tap to view your habits.',
        schedule:{ at:snoozeAt, allowWhileIdle:true },
        channelId:channelId(extra.notificationSound !== false, extra.notificationVibration !== false),
        actionTypeId,
        extra:{ ...extra, snoozed:true },
        isExactNotification:false,
      }] });
    }
  });
  await LocalNotifications.addListener('localNotificationReceived', async notification => {
    const extra = notification?.extra;
    if (managedExtra(extra)) await onDelivered(extra.habitId, extra.date);
    if (managedTaskExtra(extra)) await onTaskDelivered(extra.taskId, extra.reminderKey);
  });
  configured = true;
  return true;
}

export async function refreshAndroidReminders(state) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return { supported:false, scheduled:0 };
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications.filter(notification => managedExtra(notification.extra) || managedTaskExtra(notification.extra));
  if (!state.settings.reminders && !state.settings.taskReminders && !state.settings.deadlineAlerts) {
    if (managed.length) await LocalNotifications.cancel({ notifications:managed.map(({ id }) => ({ id })) });
    return { supported:true, scheduled:0 };
  }
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return { supported:true, scheduled:0, permission:permission.display };
  await ensureChannels();
  const reminders = state.settings.reminders ? buildUpcomingReminders({
    habits:state.habits,
    logs:state.logs,
    settings:state.settings,
    now:new Date(),
    days:14,
    limit:1000,
  }) : [];
  const taskReminders = buildUpcomingTaskReminders({ tasks:state.tasks, settings:state.settings, sent:state.taskReminderSent, now:new Date(), days:14 });
  if (managed.length) await LocalNotifications.cancel({ notifications:managed.map(({ id }) => ({ id })) });
  const notifications = [
    ...reminders.map(reminder => ({
      id:reminder.id,
      title:reminder.title,
      body:reminder.body,
      schedule:{ at:reminder.at, allowWhileIdle:true },
      channelId:channelId(state.settings.notificationSound !== false, state.settings.notificationVibration !== false),
      actionTypeId,
      extra:{
        kind:'daily-habits-reminder', habitId:reminder.habitId, date:reminder.date,
        snoozeMinutes:Number(state.settings.snoozeMinutes)||10,
        notificationSound:state.settings.notificationSound,
        notificationVibration:state.settings.notificationVibration,
        quietHoursEnabled:state.settings.quietHoursEnabled,
        quietHoursStart:state.settings.quietHoursStart,
        quietHoursEnd:state.settings.quietHoursEnd,
      },
      isExactNotification:false,
    })),
    ...taskReminders.map(reminder => ({
      id:reminder.id,
      title:reminder.title,
      body:reminder.body,
      schedule:{ at:reminder.at, allowWhileIdle:true },
      channelId:channelId(state.settings.notificationSound !== false, state.settings.notificationVibration !== false),
      actionTypeId,
      extra:{ kind:'daily-habits-task', taskId:reminder.taskId, reminderKey:reminder.key, snoozeMinutes:10 },
      isExactNotification:false,
    })),
  ];
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { supported:true, scheduled:notifications.length };
}

export async function testAndroidReminderSound(settings = {}) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') throw new Error('Allow notifications before testing the reminder sound.');
  await ensureChannels();
  await LocalNotifications.schedule({ notifications:[{
    id:reminderId('test', String(Date.now()), 'test'),
    title:'Daily Habits sound test',
    body:'Your reminder sound and vibration settings are active.',
    schedule:{ at:new Date(Date.now() + 1500), allowWhileIdle:true },
    channelId:channelId(settings.notificationSound !== false, settings.notificationVibration !== false),
    isExactNotification:false,
  }] });
  return true;
}

export async function cancelAndroidFocusCompletion() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications.filter(notification => managedFocusExtra(notification.extra));
  if (managed.length) await LocalNotifications.cancel({ notifications:managed.map(({ id }) => ({ id })) });
  return true;
}

export async function scheduleAndroidFocusCompletion(session, settings = {}) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return { supported:false, scheduled:false };
  await cancelAndroidFocusCompletion();
  if (!settings.focusNotifications || !session || session.paused || !Number.isFinite(Number(session.deadlineAt)) || Number(session.deadlineAt) <= Date.now()) return { supported:true, scheduled:false };
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return { supported:true, scheduled:false, permission:permission.display };
  await ensureChannels();
  await LocalNotifications.schedule({ notifications:[{
    id:reminderId(session.id, 'focus-completion', 'focus'),
    title:'Focus Session Completed!',
    body:'Your focus session has ended. Take a break or start another session.',
    schedule:{ at:new Date(Number(session.deadlineAt)), allowWhileIdle:true },
    channelId:channelId(settings.notificationSound !== false, settings.notificationVibration !== false),
    extra:{ kind:'daily-habits-focus', sessionId:session.id },
    isExactNotification:false,
  }] });
  return { supported:true, scheduled:true };
}

