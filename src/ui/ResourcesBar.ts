import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { ResourceSlider } from "./ResourceSlider.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeCeil, humanizeFloor } from "./UIUtil.js";

export class ResourcesBar implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(true, true);
    shown: boolean = false;
    showSettings: boolean = false;
    private page: number = 0; //Tentative design for showing info in place of the buy/sell sliders
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
        const barWidth = 170;
        const expandedWidth = 340;
        const padding = 10;
        const iconSize = 48;
        const buttonSize = 64;
        const topBarHeight = 60;

        const barDrawable = new Drawable({
            anchors: ['left'],
            width: "min(100%, " + (barWidth + (this.showSettings ? expandedWidth : 0)) + "px)", //Note: makes it take up significantly more space on mobile than it uses
            height: "calc(100% - 60px)", //TopBar height: 60px. BottomBar height: 80px. Decided to leave the bottom bar out of this calculation, because it's not always visible.
            y: topBarHeight,
            fallbackColor: '#333333',
            id: "resourcesBar",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true, scaleYOnMobile: true,
        });
        const expandedBar = new Drawable({
            x: barWidth,
            width: "min(" + expandedWidth + "px, calc(100% - " + barWidth + "px))", //should be 300, could be smaller on tiny screens.
            height: barDrawable.height,
            fallbackColor: '#00000000',
            id: barDrawable.id + ".expanded",
            scaleXOnMobile: true, biggerOnMobile: true
        });

        //Toggle to switch between collection and provisioning modes, and toggle to switch between resource settings (auto-buy/auto-trade slider) and plain resource display
        let nextY = padding - this.scroller.getScroll();
        const baseY = nextY; //for the scroller maxScroll determination
        if (this.uiManager.isMyCity) nextY += padding + buttonSize; //For the trade and provision buttons, added last

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
                if (this.page === 0) {
                    const slider = expandedBar.addChild(new ResourceSlider({
                        x: padding * 2,
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
                } else if (this.page === 1) {
                    //Show buy and sell prices
                    expandedBar.addChild(new Drawable({
                        x: padding,
                        y: nextY + 12,
                        width: "calc(100% - " + padding * 3 + ")",
                        height: "32px",
                        text: "Buy: " + (resource.buyPrice ? humanizeCeil(resource.buyPrice * resource.buyPriceMultiplier) : "N/A") + "; sell: " + humanizeFloor(resource.sellPrice * resource.sellPriceMultiplier),
                        id: barDrawable.id + "." + resource.type + ".buyprice",
                        biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    }));
                } else if (this.page === 2) {
                    //Show market quantities and limits
                    const buyCapacity = this.city.getBuyCapacity(resource);
                    expandedBar.addChild(new Drawable({
                        x: padding,
                        y: nextY + 12,
                        width: "calc(100% - " + padding * 3 + ")",
                        height: "32px",
                        text: buyCapacity ? ("For sale: " + humanizeFloor(resource.buyableAmount) + "/" + humanizeFloor(buyCapacity)) : "Cannot import",
                        id: barDrawable.id + "." + resource.type + ".buyable",
                        biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    }));
                }
            }

            nextY += iconSize + padding;
        }
        expandedBar.addChild(lastTouchedSliderInfo);

        this.scroller.setChildrenSize(nextY - baseY + padding + 100 + (this.uiManager.buildTypeBarShown() ? 120 : 0)); //80 for the bottom bar, 20 more to make the pop-up text readable

        //Down here because it should be on top of everything else
        if (this.uiManager.isMyCity) {
            const fixedTopPart = barDrawable.addChild(new Drawable({
                width: barWidth + "px",
                height: (buttonSize + padding * 2) + "px",
                fallbackColor: '#333333',
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
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
                x: barWidth - buttonSize - padding,
                y: padding,
                width: buttonSize + "px",
                height: buttonSize + "px",
                image: new TextureInfo(buttonSize, buttonSize, "ui/" + (this.showSettings ? "tradesettingson" : "tradesettingsoff")),
                fallbackColor: this.showSettings ? '#00FF0055' : '#FF000055',
                id: barDrawable.id + ".tradesettings",
                onClick: () => this.showSettings = !this.showSettings,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));

            if (this.showSettings) {
                barDrawable.addChild(expandedBar);
                const settingsFixedTopPart = expandedBar.addChild(new Drawable({
                    width: "100%",
                    height: (buttonSize + padding * 2) + "px",
                    fallbackColor: '#333333',
                    biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                }));
                settingsFixedTopPart.addChild(new Drawable({
                    anchors: ['centerX'],
                    y: padding,
                    centerOnOwnX: true,
                    width: "100%",
                    height: "32px",
                    text: this.page === 0 ? "Auto-buy/sell" : this.page === 1 ? "Market prices" : "Market supply",
                    id: barDrawable.id + ".tradesettings.text",
                    biggerOnMobile: true, scaleYOnMobile: true,
                }));

                if (this.page > 0)
                    settingsFixedTopPart.addChild(new Drawable({
                        x: padding,
                        y: padding + 32,
                        width: "44px",
                        height: "32px",
                        image: new TextureInfo(64, 64, "ui/arrowleft"),
                        id: barDrawable.id + ".tradesettings.left",
                        biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                        onClick: () => this.page = Math.max(0, this.page - 1), //TODO: I really need to make the click order opposite the draw order still
                    }));
                if (this.page < 2)
                    settingsFixedTopPart.addChild(new Drawable({
                        anchors: ['right'],
                        rightAlign: true,
                        x: padding,
                        y: padding + 32,
                        width: "44px",
                        height: "32px",
                        image: new TextureInfo(64, 64, "ui/arrowright"),
                        id: barDrawable.id + ".tradesettings.right",
                        biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                        onClick: () => this.page = Math.min(2, this.page + 1), //0 for auto-trade level sliders, 1 for buy/sell prices, 2 for market quantities and limits.
                    }));
            }
        }

        this.lastDrawable = barDrawable;
        return barDrawable;
    }
}
