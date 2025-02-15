import { DEBUG_MORE, IS_TEST } from '../config';
import { getActions } from '../global';
import { formatShareText } from './deeplink';
import { IS_ANDROID, IS_IOS, IS_SERVICE_WORKER_SUPPORTED } from './windowEnvironment';
import { validateFiles } from './files';
import { notifyClientReady, playNotifySoundDebounced } from './notifications';

type WorkerAction = {
  type: string;
  payload: Record<string, any>;
};

const IGNORE_WORKER_PATH = '/k/';

const TEMP_DEBUG = true;

function handleWorkerMessage(e: MessageEvent) {
  const action: WorkerAction = e.data;
  if (DEBUG_MORE) {
    // eslint-disable-next-line no-console
    console.log('[SW] Message from worker', action);
  }
  if (!action.type) return;
  const dispatch = getActions();
  const payload = action.payload;
  switch (action.type) {
    case 'focusMessage':
      dispatch.focusMessage?.(payload as any);
      break;
    case 'playNotificationSound':
      playNotifySoundDebounced(action.payload.id);
      break;
    case 'share':
      dispatch.openChatWithDraft({
        text: formatShareText(payload.url, payload.text, payload.title),
        files: validateFiles(payload.files),
      });
      break;
  }
}

function subscribeToWorker() {
  navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
  // Notify web worker that client is ready to receive messages
  notifyClientReady();
}

if (IS_SERVICE_WORKER_SUPPORTED) {
  window.addEventListener('load', async () => {
    try {
      const controller = navigator.serviceWorker.controller;
      if (!controller || controller.scriptURL.includes(IGNORE_WORKER_PATH)) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const ourRegistrations = registrations.filter((r) => !r.scope.includes(IGNORE_WORKER_PATH));
        if (ourRegistrations.length) {
          if (TEMP_DEBUG) {
            // eslint-disable-next-line no-console
            console.log('[SW] Hard reload detected, re-enabling Service Worker');
          }
          await Promise.all(ourRegistrations.map((r) => r.unregister()));
        }
      }

      await navigator.serviceWorker.register(new URL('../serviceWorker.ts', import.meta.url));

      if (TEMP_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[SW] ServiceWorker registered');
      }

      await navigator.serviceWorker.ready;

      // eslint-disable-next-line no-console
      console.log('Service Worker', navigator.serviceWorker?.controller?.scriptURL);

      if (navigator.serviceWorker.controller) {
        if (TEMP_DEBUG) {
          // eslint-disable-next-line no-console
          console.log('[SW] ServiceWorker ready');
        }
        subscribeToWorker();
      } else {
        if (TEMP_DEBUG) {
          // eslint-disable-next-line no-console
          console.error('[SW] ServiceWorker not available');
          // eslint-disable-next-line no-console
          console.warn('Assigned registration', await navigator.serviceWorker.getRegistration());
          // eslint-disable-next-line no-console
          console.warn('Ready promise', navigator.serviceWorker?.ready);
        }

        if (!IS_IOS && !IS_ANDROID && !IS_TEST) {
          getActions().showDialog?.({ data: { message: 'SERVICE_WORKER_DISABLED', hasErrorKey: true } });
        }
      }
    } catch (err) {
      if (TEMP_DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[SW] ServiceWorker registration failed: ', err);
      }
    }
  });
  window.addEventListener('focus', async () => {
    await navigator.serviceWorker.ready;
    subscribeToWorker();
  });
}
