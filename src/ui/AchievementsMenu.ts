import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { City } from "../game/City.js";
import { Player } from "../game/Player.js";
import { UIManager } from "./UIManager.js";
import { Achievement } from "../game/Achievement.js";
import { StandardScroller } from "./StandardScroller.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";

export class AchievementsMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private mode: 'achievements' | 'titles' = 'achievements';
    private scroller = new StandardScroller(true, true);
    private achievementIconSize = 48;
    private achievementPadding = 10;
    private expandedItem: Achievement | null = null;

    constructor(private player: Player, private city: City, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    public show(mode: 'achievements' | 'titles' = 'achievements'): void {
        this.shown = true;
        this.mode = mode;
        this.scroller.resetScroll();
    }

    public isShown(): boolean {
        return this.shown;
    }

    public hide(): void {
        this.shown = false;
    }

    private get iconId(): string {
        return this.mode === 'achievements' ? 'achievements' : 'titles';
    }

    private get otherIconId(): string {
        return this.mode === 'achievements' ? 'titles' : 'achievements';
    }

    private get title(): string {
        return this.mode === 'achievements' ? 'Achievements' : 'City Titles';
    }

    private get items(): Achievement[] {
        return [...(this.mode === 'achievements' ? this.player.achievements : this.city.titles).values()];
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const menuDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "achievementsMenu",
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, menuDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        // A second close button because my click order and my draw order are different
        menuDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            fallbackColor: '#00000000',
            biggerOnMobile: true,
            onClick: () => this.hide()
        }));

        // Same for the toggle mode button
        menuDrawable.addChild(new Drawable({
            x: 68,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            fallbackColor: '#00000000',
            biggerOnMobile: true,
            scaleXOnMobile: true,
            onClick: () => {
                this.show(this.mode === 'achievements' ? 'titles' : 'achievements');
            }
        }));

        // List achievements/titles
        let paddingAdjust = 0; //gets subtracted from when a body is expanded since, due to nesting, it would double-up the padding
        let previousItem: Drawable | null = null;
        this.items.forEach((item) => {
            const itemContainer = new Drawable({
                x: paddingAdjust,
                y: 10,
                width: "100%",
                height: `${this.achievementIconSize}px`,
                fallbackColor: '#00000000',
                onClick: () => this.expandedItem = this.expandedItem === item ? null : item,
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            });

            itemContainer.addChild(new Drawable({
                x: 10,
                width: `${this.achievementIconSize}px`,
                height: `${this.achievementIconSize}px`,
                image: new TextureInfo(this.achievementIconSize, this.achievementIconSize, `${this.mode}/${item.id}`),
                fallbackImage: new TextureInfo(this.achievementIconSize, this.achievementIconSize, `${this.mode}/generic`),
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            }));

            itemContainer.addChild(new Drawable({
                x: this.achievementIconSize + 20,
                y: 8,
                text: item.name,
                width: "300px",
                height: "20px",
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            }));

            //Progress bar
            itemContainer.addChild(new Drawable({
                x: this.achievementIconSize + 18,
                y: 28,
                width: "304px",
                height: "14px",
                fallbackColor: '#444444',
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            }));
            itemContainer.addChild(new Drawable({
                x: this.achievementIconSize + 20,
                y: 30,
                width: item.attained ? "300px" : `${Math.round(item.lastProgress * 300)}px`,
                height: "10px",
                fallbackColor: item.attained ? '#22AAEE' : '#44BB44',
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            }));
            
            //Add to the top level if it's the first notification; otherwise, add to the previous notification
            if (previousItem) {
                itemContainer.anchors = ['below'];
                previousItem.addChild(itemContainer);
            } else {
                itemContainer.y = 100 - this.scroller.getScroll();
                menuDrawable.addChild(itemContainer);
            }
            previousItem = itemContainer;

            if (this.expandedItem === item) {
                itemContainer.addChild(previousItem = new Drawable({
                    x: 10,
                    y: this.achievementIconSize + this.achievementPadding,
                    text: item.description,
                    wordWrap: true,
                    keepParentWidth: true, //applies to children nested in it
                    width: "97%",
                    height: "24px",
                    scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                }));
                if (item.rewardDescription) {
                    previousItem.addChild(previousItem = new Drawable({
                        anchors: ['below'],
                        y: 10,
                        text: "Rewards: " + item.rewardDescription,
                        wordWrap: true,
                        keepParentWidth: true,
                        width: "97%",
                        height: "24px",
                        scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                    }));
                }
                paddingAdjust = -10;
            } else paddingAdjust = 0;
        });

        this.scroller.setChildrenSize(100 + this.items.length * (this.achievementIconSize + this.achievementPadding) + 200); //TODO: doesn't account for word wrapped text so I just added 200 arbitrarily

        //A box to contain the menu icon, title, and close button so the scrolling doesn't look weird.
        const topContainer = menuDrawable.addChild(new Drawable({
            width: "100%",
            height: "84px",
            fallbackColor: '#222222',
            id: "achTopContainer",
        }));

        // Menu icon
        topContainer.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/" + this.iconId)
        }));

        // Menu title
        topContainer.addChild(new Drawable({
            x: 84,
            y: 26,
            text: this.title,
            width: "130px",
            height: "32px",
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
            onClick: () => this.hide()
        }));

        // Toggle mode button
        topContainer.addChild(new Drawable({
            x: 68,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/" + this.otherIconId),
            biggerOnMobile: true,
            scaleXOnMobile: true,
            onClick: () => {
                this.show(this.mode === 'achievements' ? 'titles' : 'achievements');
            }
        }));

        this.lastDrawable = menuDrawable;
        return menuDrawable;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}
