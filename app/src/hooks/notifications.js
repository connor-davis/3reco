import useState from './state';
import { v4 } from 'uuid';

const useNotifications = () => {
  const [notificationsState, updateNotificationsState] =
    useState('notificationsState');

  const addNotification = (title, body) => {
    const id = v4();

    if (!notificationsState.notifications)
      updateNotificationsState({ notifications: [] });

    let notificationsList = [];

    notificationsState.notifications.forEach((notification) =>
      notificationsList.push({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        shown: notification.shown,
      })
    );

    notificationsList.push({ id, title, body, shown: true });

    updateNotificationsState({ notifications: notificationsList });

    setTimeout(() => {
      notificationsList = [];

      notificationsState.notifications.forEach((notification) =>
        notificationsList.push({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          shown: notification.shown,
        })
      );

      updateNotificationsState({
        notifications: notificationsList.map((notification) => {
          if (notification.id === id) return { ...notification, shown: false };
          else return notification;
        }),
      });
    }, 3000);
  };

  let deleteNotification = (id) => {
    let notificationsList = [];

    notificationsState.notifications.forEach((notification) =>
      notificationsList.push({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        shown: notification.shown,
      })
    );

    updateNotificationsState({
      notifications: notificationsList.filter(
        (notification) => notification.id !== id
      ),
    });
  };

  let clear = () => {
    updateNotificationsState({ notifications: [] });
  };

  return [notificationsState, addNotification, deleteNotification, clear];
};

export default useNotifications;
