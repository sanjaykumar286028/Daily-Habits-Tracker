import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildUpcomingReminders, reminderId } from './reminder-utils.js';

const actionTypeId = 'habit-reminder-actions';
const managedExtra = extra => extra?.kind === 'daily-habits-reminder';
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

export async function configureAndroidReminders({ onComplete, onDelivered }) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' || configured) return false;
  await LocalNotifications.registerActionTypes({ types:[{
    id:actionTypeId,
    actions:[{ id:'complete', title:'Mark complete' }, { id:'snooze', title:'Snooze' }],
  }] });
  await LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
    const extra = notification?.extra;
    if (!managedExtra(extra)) return;
    if (actionId === 'complete') await onComplete(extra.habitId, extra.date);
    if (actionId === 'snooze') {
      await onDelivered(extra.habitId, extra.date);
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return;
      const snoozeId = reminderId(extra.habitId, `${extra.date}:${Date.now()}`, 'snooze');
      const snoozeMinutes = [5,10,15,30].includes(Number(extra.snoozeMinutes)) ? Number(extra.snoozeMinutes) : 10;
      await LocalNotifications.schedule({ notifications:[{
        id:snoozeId,
        title:'Daily Habits',
        body:'A planned habit is waiting. Tap to view your habits.',
        schedule:{ at:new Date(Date.now() + snoozeMinutes * 60_000), allowWhileIdle:true },
        channelId:channelId(true, true),
        actionTypeId,
        extra:{ ...extra, snoozed:true },
        isExactNotification:false,
      }] });
    }
  });
  await LocalNotifications.addListener('localNotificationReceived', async notification => {
    const extra = notification?.extra;
    if (managedExtra(extra)) await onDelivered(extra.habitId, extra.date);
  });
  configured = true;
  return true;
}

export async function refreshAndroidReminders(state) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return { supported:false, scheduled:0 };
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications.filter(notification => managedExtra(notification.extra));
  if (!state.settings.reminders) {
    if (managed.length) await LocalNotifications.cancel({ notifications:managed.map(({ id }) => ({ id })) });
    return { supported:true, scheduled:0 };
  }
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return { supported:true, scheduled:0, permission:permission.display };
  await ensureChannels();
  const reminders = buildUpcomingReminders({
    habits:state.habits,
    logs:state.logs,
    settings:state.settings,
    now:new Date(),
    days:14,
    limit:1000,
  });
  if (managed.length) await LocalNotifications.cancel({ notifications:managed.map(({ id }) => ({ id })) });
  if (reminders.length) await LocalNotifications.schedule({
    notifications:reminders.map(reminder => ({
      id:reminder.id,
      title:reminder.title,
      body:reminder.body,
      schedule:{ at:reminder.at, allowWhileIdle:true },
      channelId:channelId(state.settings.notificationSound !== false, state.settings.notificationVibration !== false),
      actionTypeId,
      extra:{ kind:'daily-habits-reminder', habitId:reminder.habitId, date:reminder.date, snoozeMinutes:Number(state.settings.snoozeMinutes)||10 },
      isExactNotification:false,
    })),
  });
  return { supported:true, scheduled:reminders.length };
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
