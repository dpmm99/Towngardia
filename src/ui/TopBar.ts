import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeFloor } from "./UIUtil.js";

export class TopBar implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(true, false);
    public shown: boolean = true;

    constructor(private city: City, private uiManager: UIManager) {
    }

    onResize(): void { this.scroller.onResize(); }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public asDrawable(): Drawable {
        if (!this.shown) return new Drawable({ width: "0px" }); //Empty drawable

        const barHeight = 60;
        const padding = 10;
        const iconSize = 40;
        const textWidth = 75;

        const barDrawable = new Drawable({
            anchors: ['top'],
            width: "100%",
            height: barHeight + "px",
            fallbackColor: '#333333',
            id: "topBar",
            onClick: () => { }, //To capture clicks so they don't go through to the city
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(x, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true
        });

        const flunds = this.city.flunds.amount;
        const population = Math.floor(this.city.resources.get('population')?.amount || 0);
        const touristsResource = this.city.resources.get('tourists');
        const happinessResource = this.city.resources.get('happiness');
        let nextX = padding - this.scroller.getScroll();
        const baseX = nextX;

        // Add resource menu button
        const resourceMenuButton = barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "ui/resources"),
            id: barDrawable.id + ".resources",
            onClick: () => this.uiManager.toggleResources(),
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        if (this.uiManager.isMyCity && (this.city.tutorialStepIndex === 4 || this.city.tutorialStepIndex === 20) && !this.uiManager.resourcesBarShown()) {
            resourceMenuButton.addChild(new Drawable({
                x: -iconSize,
                y: -iconSize,
                width: iconSize * 3 + "px",
                height: iconSize * 3 + "px",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                image: new TextureInfo(96, 96, "ui/majorsalience"),
            }));
        }
        nextX += iconSize + padding;

        // Add 'views' bar button
        const viewsMenuButton = barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "ui/views"),
            id: barDrawable.id + ".views",
            onClick: () => this.uiManager.toggleViews(),
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        if (this.uiManager.isMyCity && (this.city.tutorialStepIndex === 5)) {
            viewsMenuButton.addChild(new Drawable({
                x: -iconSize,
                y: -iconSize,
                width: iconSize * 3 + "px",
                height: iconSize * 3 + "px",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                image: new TextureInfo(96, 96, "ui/majorsalience"),
            }));
        }
        nextX += iconSize + padding;

        // Add happiness meter
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "resource/happiness"),
            id: barDrawable.id + ".happiness",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            onClick: () => this.uiManager.toggleHappinessFactorsWindow(),
        }));
        barDrawable.addChild(new Drawable({
            x: nextX + iconSize + padding,
            y: padding + 10,
            width: "100px",
            noXStretch: false,
            height: "20px",
            fallbackColor: '#666666',
            id: barDrawable.id + ".happinessBg",
            image: new TextureInfo(100, 20, "ui/progressbg"),
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            onClick: () => this.uiManager.toggleHappinessFactorsWindow(),
            children: [
                new Drawable({
                    x: 0,
                    y: 0,
                    width: "100px",
                    noXStretch: false,
                    height: "20px",
                    fallbackColor: '#00ff11',
                    id: barDrawable.id + ".happinessFg",
                    clipWidth: 0.03 + (happinessResource?.amount ?? 0) * 0.94, //buffer of 7/226 on left and 7/226 on right, so 3% is unusable on each side. 100 wide, but happiness is 0-1.
                    image: new TextureInfo(100, 20, "ui/progressfg"),
                    biggerOnMobile: true,
                })
            ],
        }));
        nextX += iconSize + 100 + padding * 3;

        // Add flunds display
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "resource/flunds"),
            id: barDrawable.id + ".flunds",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextX += iconSize + padding;
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding * 2,
            width: textWidth + "px",
            height: iconSize + "px",
            text: humanizeFloor(flunds),
            reddize: flunds < 0,
            cssClasses: ['flunds'],
            id: barDrawable.id + ".flundsNum",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextX += textWidth + padding * 2;

        // Add population display
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "resource/population"),
            id: barDrawable.id + ".population",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextX += iconSize + padding;
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding * 2,
            width: textWidth + "px",
            height: iconSize + "px",
            text: humanizeFloor(population),
            cssClasses: ['population'],
            id: barDrawable.id + ".populationNum",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextX += textWidth + padding * 2;

        //Tourism number, no capacity, and only shown if the city HAS a tourism capacity
        if (touristsResource?.capacity) {
            barDrawable.addChild(new Drawable({
                x: nextX,
                y: padding,
                width: iconSize + "px",
                height: iconSize + "px",
                image: new TextureInfo(iconSize, iconSize, "resource/tourists"),
                id: barDrawable.id + ".tourists",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            nextX += iconSize + padding;
            barDrawable.addChild(new Drawable({
                x: nextX,
                y: padding * 2,
                width: textWidth + "px",
                height: iconSize + "px",
                text: humanizeFloor(Math.floor(touristsResource.amount)),
                cssClasses: ['tourists'],
                id: barDrawable.id + ".touristsNum",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            nextX += textWidth + padding * 2;
        }

        // Add main menu button
        barDrawable.addChild(new Drawable({
            x: nextX,
            y: padding,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, "ui/menu"),
            id: barDrawable.id + ".menu",
            onClick: () => this.uiManager.showMainMenu(),
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextX += iconSize + padding;

        this.scroller.setChildrenSize(nextX - baseX + padding);

        this.lastDrawable = barDrawable;
        return barDrawable;
    }
}
