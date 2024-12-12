import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { City } from "../game/City.js";
import { Player } from "../game/Player.js";
import { Notification } from "../game/Notification.js";
import { StandardScroller } from "./StandardScroller.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { GameState } from "../game/GameState.js";
import { UIManager } from "./UIManager.js";

export class NotificationsMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(true, true);
    private notificationIconSize = 64;
    private notificationPadding = 10;
    private expandedNotifications: Set<Notification> = new Set();

    constructor(private player: Player, private city: City, private game: GameState, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    public show(): void {
        this.shown = true;
    }

    public isShown(): boolean {
        return this.shown;
    }

    public hide(): void {
        this.shown = false;
    }

    private get notifications(): Notification[] {
        const allNotifications = [...this.city.notifications, ...this.player.notifications];
        return allNotifications.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20);
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const menuDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "notificationMenu",
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, menuDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        const nonResizingTop = menuDrawable.addChild(new Drawable({
            y: 94,
            height: "0px",
            fallbackColor: '#00000000',
        }));

        // List notifications
        let paddingAdjust = 0; //gets subtracted from when a body is expanded since, due to nesting, it would double-up the padding
        let previousNotification: Drawable | null = null;
        this.notifications.forEach((notification, index) => {
            const height = this.notificationIconSize + (this.expandedNotifications.has(notification) ? 150 : 0);
            const notificationDrawable = new Drawable({
                anchors: ['below'],
                x: paddingAdjust,
                width: "100%",
                height: `${height}px`,
                fallbackColor: '#00000000',
                onClick: () => {
                    if (this.expandedNotifications.has(notification)) {
                        this.expandedNotifications.delete(notification);
                    } else {
                        this.expandedNotifications.add(notification);
                    }
                    if (!notification.seen) {
                        notification.seen = true;
                        this.city.updateLastUserActionTime();
                        this.game.fullSave();
                    }
                }
            });

            //Add to the top level if it's the first notification; otherwise, add to the previous notification
            if (previousNotification) {
                previousNotification.addChild(notificationDrawable);
            } else {
                notificationDrawable.y = -this.scroller.getScroll();
                notificationDrawable.scaleYOnMobile = true;
                nonResizingTop.addChild(notificationDrawable);
            }
            previousNotification = notificationDrawable;

            //Icon
            notificationDrawable.addChild(new Drawable({
                x: 10,
                width: `${this.notificationIconSize}px`,
                height: `${this.notificationIconSize}px`,
                image: new TextureInfo(this.notificationIconSize, this.notificationIconSize, `ui/${notification.icon}`)
            }));
            //Unread?
            if (!notification.seen) {
                notificationDrawable.addChild(new Drawable({
                    x: 10,
                    width: "24px",
                    height: "24px",
                    image: new TextureInfo(24, 24, "ui/unread")
                }));
            }

            //Title
            notificationDrawable.addChild(new Drawable({
                x: this.notificationIconSize + 20,
                y: 8,
                text: notification.title,
                width: "calc(100% - 74px)",
                height: "48px"
            }));
            //Body
            if (this.expandedNotifications.has(notification)) {
                notificationDrawable.addChild(previousNotification = new Drawable({
                    x: 10,
                    y: this.notificationIconSize + 10,
                    text: notification.body,
                    wordWrap: true,
                    keepParentWidth: true, //applies to children nested in it
                    biggerOnMobile: true,
                    width: "97%",
                    height: "24px"
                }));
                paddingAdjust = -10;
            } else paddingAdjust = 0;
        });

        //Top bar (menu icon, title, close button)
        const topContainer = menuDrawable.addChild(new Drawable({
            width: "100%",
            height: "84px",
            fallbackColor: '#222222',
        }));

        // Menu icon
        topContainer.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/notifications")
        }));

        // Menu title
        topContainer.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Notifications",
            width: "130px",
            height: "32px"
        }));

        // Close button
        topContainer.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.uiManager.hideNotifications()
        }));

        this.scroller.setChildrenSize(this.notifications.length * (this.notificationIconSize + this.notificationPadding) + 140 * this.expandedNotifications.size + 200); //TODO: doesn't account for word wrapped text so I just added 200 arbitrarily

        this.lastDrawable = menuDrawable;
        return menuDrawable;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}
