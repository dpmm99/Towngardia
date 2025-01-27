import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { Player } from "../game/Player.js";
import { BarPlays, MonobrynthPlays, NepotismNetworkingPlays, SlotsPlays, StarboxPlays } from "../game/ResourceTypes.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class RightBar implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    public shown: boolean = true;
    private scroller = new StandardScroller(true, true);

    constructor(private player: Player, private city: City | null, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    private hasUnreadNotifications() {
        return this.city?.notifications.some(p => !p.seen) || this.player.notifications.some(p => !p.seen);
    }

    public asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const barWidth = 60;
        const padding = 10;
        const iconSize = 40;

        const barDrawable = new Drawable({
            y: 60 + (this.uiManager.viewsBarShown() ? 60 : 0),
            anchors: ['right'],
            width: barWidth + "px",
            fallbackColor: '#333333',
            id: "rightBar",
            onClick: () => { }, //To capture clicks so they don't go through to the city
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true, scaleYOnMobile: true,
        });

        const buttons = <{ id:string, onClick: (() => void), resourceType?: string, resourceAmount?: number }[]>[
            { id: 'friends', onClick: () => this.uiManager.showFriendsMenu() },
        ];
        if (this.uiManager.inTutorial()) buttons.shift(); //Drop the friends button during the tutorial.
        if (this.uiManager.isMyCity) {
            buttons.push(
                { id: 'notifications' + (this.hasUnreadNotifications() ? "on" : ""), onClick: () => this.uiManager.showNotifications() },
                { id: 'budget', onClick: () => this.uiManager.showBudget() },
                { id: 'research', onClick: () => this.uiManager.showTechMenu() },
            );
        }
        if (this.city?.flags.has(CityFlags.FoodMatters)) buttons.push({ id: 'diet', onClick: () => this.uiManager.showCitizenDietWindow() });
        buttons.push({ id: 'titles', onClick: () => this.uiManager.showTitles() },
            { id: 'achievements', onClick: () => this.uiManager.showAchievements() },
            { id: 'milestones', onClick: () => this.uiManager.showMilestonesMenu() }); //TODO: May actually want to compile all three of those into a "progress menus" button or something.
        if (this.uiManager.isMyCity && this.player.finishedTutorial) {
            buttons.push({ id: 'memorymixology', onClick: () => this.uiManager.showMemoryMixologyMinigame(), resourceType: new BarPlays().type });

            if (this.city?.flags.has(CityFlags.UnlockedSlots)) {
                buttons.push({ id: "slots", onClick: () => this.uiManager.showSlotsMinigame(), resourceType: new SlotsPlays().type });
            }
            if (this.city?.flags.has(CityFlags.UnlockedStarbox)) {
                buttons.push({ id: 'starbox', onClick: () => this.uiManager.showStarboxMinigame(), resourceType: new StarboxPlays().type });
            }
            if (this.city?.flags.has(CityFlags.UnlockedMonobrynth)) {
                buttons.push({ id: 'monobrynth', onClick: () => this.uiManager.showMonobrynthMinigame(), resourceType: new MonobrynthPlays().type });
            }
            //TODO: Do I want a 'minigames' button instead? I made an icon. But then I'd need a tray for the minigames to pop into.
        } else { //Not my city--show shared reward minigames and the Send Gift button
            if (this.uiManager.game.city!.flags.has(CityFlags.UnlockedTourism)) {
                buttons.push({ id: 'neponet', onClick: () => this.uiManager.showNeponetMinigame(), resourceType: new NepotismNetworkingPlays().type });
            }
            if (this.uiManager.game.city!.hasGifts()) {
                buttons.push({ id: 'gift', onClick: () => this.uiManager.showFriendGiftWindow() });
            }
        }
        let nextY = padding - this.scroller.getScroll();
        const baseY = nextY;
        buttons.forEach((button, index) => {
            const buttonDrawable = barDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: iconSize + "px",
                height: iconSize + "px",
                image: new TextureInfo(iconSize, iconSize, "ui/" + button.id),
                id: barDrawable.id + "." + button.id,
                onClick: button.onClick,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));

            if (button.id === "research" && this.uiManager.isMyCity && this.city?.tutorialStepIndex === 26) {
                buttonDrawable.addChild(new Drawable({
                    x: -iconSize,
                    y: -iconSize,
                    width: iconSize * 3 + "px",
                    height: iconSize * 3 + "px",
                    biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    image: new TextureInfo(96, 96, "ui/majorsalience"),
                }));
            }

            //Draw zero to nine boxes on top of the resource icon (3x3 covering it up) based on city.resources.get(type).amount divided by resourceAmount and floored.
            if (button.resourceType) {
                const resourceAmount = button.resourceAmount ?? 1;
                const resourceCount = this.uiManager.game.city!.resources.get(button.resourceType)?.amount ?? 0;
                const resourceBoxes = Math.min(9, Math.floor(resourceCount / resourceAmount)); //Number of plays available
                for (let i = 0; i < resourceBoxes; i++) {
                    barDrawable.addChild(new Drawable({
                        x: padding + (i % 3) * 14, //3 per row
                        y: nextY + Math.floor(i / 3) * 14,
                        width: "12px",
                        height: "12px",
                        image: new TextureInfo(12, 12, "ui/unread"),
                        biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    }));
                }
            }

            nextY += iconSize + padding;
        });

        const totalHeight = nextY - baseY + padding;
        this.scroller.setChildrenSize(totalHeight);

        //Needed 'min' because of landscape mode on mobile, or else it has to always fill up the right side of the screen.
        const myTop = 80 + barDrawable.y!; //TopBar height and ViewsBar height are both 60px, included in barDrawable.y. BottomBar height is 80px.
        barDrawable.height = `min(${totalHeight}px, calc(100% - ${myTop}px))`;

        this.lastDrawable = barDrawable;
        return barDrawable;
    }
}
