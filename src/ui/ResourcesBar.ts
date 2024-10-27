import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { ResourceSlider } from "./ResourceSlider.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeFloor } from "./UIUtil.js";

export class ResourcesBar implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(true, true);
    shown: boolean = false;
    showSettings: boolean = false;
    private lastTouched: { resourceType: string, side: "buy" | "sell" } = { resourceType: "", side: "sell" };

    constructor(private city: City, private uiManager: UIManager) {
    }

    onResize(): void { this.scroller.onResize(); }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        if (!this.uiManager.isMyCity) this.showSettings = false;
        const barWidth = 170 + (this.showSettings ? 300 : 0);
        const padding = 10;
        const iconSize = 48;
        const buttonSize = 64;
        const topBarHeight = 60;

        const barDrawable = new Drawable({
            anchors: ['left'],
            width: barWidth + "px", // or something like that
            y: topBarHeight,
            fallbackColor: '#333333',
            id: "resourcesBar",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true, scaleYOnMobile: true,
        });

        //Toggle to switch between collection and provisioning modes, and toggle to switch between resource settings (auto-buy/auto-trade slider) and plain resource display
        let nextY = padding - this.scroller.getScroll();
        const baseY = nextY; //for the scroller maxScroll determination
        if (this.uiManager.isMyCity) {
            if (this.showSettings) {
                barDrawable.addChild(new Drawable({
                    x: 170 + padding,
                    y: nextY + 12,
                    width: 300 - 2 * padding + "px",
                    height: "32px",
                    text: "Auto-buy/sell",
                    id: barDrawable.id + ".tradesettings.text",
                    biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                }));
            }
            nextY += padding + buttonSize;
        }

        const lastTouchedSliderInfo = new Drawable({
            width: "0px",
            height: "24px",
            fallbackColor: '#00000066',
            id: 'autotradeInfoBackdrop',
            biggerOnMobile: true,
            scaleYOnMobile: true,
        });

        //TODO: Maybe categorize foods last?
        const resources = [...this.city.resources.values()].filter(p => !p.isSpecial && p.capacity);
        for (const resource of resources) {
            barDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: iconSize + "px",
                height: iconSize + "px",
                image: new TextureInfo(iconSize, iconSize, "resource/" + resource.type),
                id: barDrawable.id + "." + resource.type,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            barDrawable.addChild(new Drawable({
                x: padding + iconSize + 5,
                y: nextY + 4,
                width: iconSize * 2 + "px",
                height: (iconSize / 2 - 4) + "px", //Make the text just a bit smaller because it takes up a lot of space on mobile and is less readable when squished.
                text: resource.displayName,
                id: barDrawable.id + "." + resource.type + ".name",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            barDrawable.addChild(new Drawable({
                x: padding + iconSize,
                y: nextY + iconSize / 2,
                width: iconSize + "px",
                height: iconSize / 2 + "px",
                text: humanizeFloor(resource.amount),
                rightAlign: true,
                id: barDrawable.id + "." + resource.type + ".amount",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            barDrawable.addChild(new Drawable({
                x: padding + iconSize * 2 + 5,
                y: nextY + iconSize / 2,
                width: iconSize + "px",
                height: iconSize / 2 + "px",
                text: "/" + humanizeFloor(resource.capacity),
                id: barDrawable.id + "." + resource.type + ".capacity",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));

            if (this.showSettings) {
                const slider = barDrawable.addChild(new ResourceSlider({
                    x: padding * 3 + iconSize * 3.5,
                    y: nextY,
                    id: "resourceSlider",
                }, resource, this.uiManager.inTutorial(), this.lastTouched)); //Lock during the tutorial so they can't softlock themselves.
                slider.scaleXOnMobile = slider.scaleYOnMobile = true;

                //Exact number and percentage for whichever handle was last touched
                if (this.lastTouched.resourceType === resource.type) {
                    lastTouchedSliderInfo.width = slider.width;
                    lastTouchedSliderInfo.x = slider.x;
                    lastTouchedSliderInfo.y = nextY + 32 /*barHeight*/ + 10;
                    lastTouchedSliderInfo.addChild(new Drawable({
                        x: 3,
                        y: 3,
                        width: "calc(100% - 6px)",
                        height: "24px",
                        text: (this.lastTouched.side === "buy")
                            ? 'Buy < ' + (resource.autoBuyBelow * 100).toFixed(0) + '% (' + humanizeFloor(resource.autoBuyBelow * resource.capacity) + ')'
                            : 'Sell > ' + (resource.autoSellAbove * 100).toFixed(0) + '% (' + humanizeFloor(resource.autoSellAbove * resource.capacity) + ')',
                        id: 'autobuytext',
                        biggerOnMobile: true,
                    }));
                }
            }

            nextY += iconSize + padding;
        }
        barDrawable.addChild(lastTouchedSliderInfo);

        this.scroller.setChildrenSize(nextY - baseY + padding + 100 + (this.uiManager.buildTypeBarShown() ? 120 : 0)); //80 for the bottom bar, 20 more to make the pop-up text readable

        barDrawable.height = "calc(100% - 60px)"; //TopBar height: 60px. BottomBar height: 80px. Decided to leave the bottom bar out of this calculation, because it's not always visible.

        //Down here because it should be on top of everything else
        if (this.uiManager.isMyCity) {
            const fixedTopPart = new Drawable({
                x: 0,
                y: 0,
                width: "170px",
                height: (buttonSize + padding * 2) + "px",
                fallbackColor: '#333333',
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            });
            fixedTopPart.addChild(new Drawable({
                x: padding,
                y: padding,
                width: buttonSize + "px",
                height: buttonSize + "px",
                image: new TextureInfo(buttonSize, buttonSize, "ui/provisionview"),
                fallbackColor: '#FFFF00',
                id: barDrawable.id + ".provisionview",
                onClick: () => this.uiManager.toggleProvisioning(),
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            fixedTopPart.addChild(new Drawable({
                x: 170 - buttonSize - padding,
                y: padding,
                width: buttonSize + "px",
                height: buttonSize + "px",
                image: new TextureInfo(buttonSize, buttonSize, "ui/" + (this.showSettings ? "tradesettingson" : "tradesettingsoff")),
                fallbackColor: this.showSettings ? '#00FF0055' : '#FF000055',
                id: barDrawable.id + ".tradesettings",
                onClick: () => this.showSettings = !this.showSettings,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            barDrawable.addChild(fixedTopPart);
        }

        this.lastDrawable = barDrawable;
        return barDrawable;
    }
}
