/// <reference lib="webworker" />
const _self = self as unknown as ServiceWorkerGlobalScope; //TypeScript seems pretty broken

_self.addEventListener('push', (event) => {
    const { title, body } = event.data?.json();
    const options = {
        body: body ?? 'No message content',
        icon: '/towngardia/assets/ui/advisor.png',
        badge: '/towngardia/assets/ui/advisor.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    event.waitUntil(
        _self.registration.showNotification(title ?? "Towngardia", options)
    );
});

_self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(_self.clients.openWindow('/towngardia/game.html'));
});
