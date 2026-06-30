global.chrome = {
  runtime: { onMessage: { addListener: () => {} }, onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} }, onMessageExternal: { addListener: () => {} } },
  storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
  alarms: { onAlarm: { addListener: () => {} }, create: () => {} }
};
import('./public/background.js').catch(console.error);
