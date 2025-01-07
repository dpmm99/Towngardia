import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";

export class HappinessFactorsWindow implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(true, true);
    constructor(private city: City) {
    }

    onResize(): void { this.scroller.onResize(); }

    public isShown(): boolean {
        return this.shown;
    }

    public show(): void {
        this.shown = true;
        this.scroller.resetScroll();
    }

    public hide(): void {
        this.shown = false;
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const window = new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            width: "min(100%, 500px)",
            height: "min(100%, 800px)",
            y: 60, //Height of the top bar
            fallbackColor: "#333333",
            biggerOnMobile: true, scaleYOnMobile: true,
            onClick: () => this.shown = false,
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, window.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        //"Happiness factors" text
        let baseY = -this.scroller.getScroll();
        if (baseY < 0) {
            //Cover up the top bar, too
            window.addChild(new Drawable({
                anchors: ['selfBottom'],
                width: "100%",
                height: "60px",
                fallbackColor: "#333333",
                biggerOnMobile: true, scaleYOnMobile: true,
            }));
        }

        let nextY = baseY + 10;
        window.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "calc(100% - 20px)",
            height: "40px",
            text: "Happiness factors",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextY += 40;

        [...this.city.happinessBreakdown.entries()].sort((a, b) => a[1] - b[1]).forEach(([key, value]) => { //Sorted from most negative to most positive; "Other" is expected to be last
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "62%",
                height: "28px",
                text: key + ":",
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));
            window.addChild(new Drawable({
                anchors: ['right'],
                rightAlign: true,
                x: 10,
                y: nextY,
                width: "32%", //310 + 160 + 30 for padding = 500. 160/500 = 32% of the width.
                height: "28px",
                text: (value > 0 ? "+" : "") + (Math.round(10000 * value) / 100) + (this.city.happinessMaxima.has(key) ? "/" + 100 * <number>this.city.happinessMaxima.get(key) : ""),
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            }));

            nextY += 28;
        });

        nextY += 20;
        window.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "62%",
            height: "28px",
            text: "Current happiness:",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        window.addChild(new Drawable({
            anchors: ['right'],
            rightAlign: true,
            x: 10,
            y: nextY,
            width: "32%",
            height: "28px",
            text: (Math.round(10000 * this.city.resources.get("happiness")!.amount) / 100) + "%",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextY += 28;
        window.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "62%",
            height: "28px",
            text: "Approaching:",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        window.addChild(new Drawable({
            anchors: ['right'],
            rightAlign: true,
            x: 10,
            y: nextY,
            width: "32%",
            height: "28px",
            text: (Math.round(10000 * [...this.city.happinessBreakdown.values()].reduce((a, b) => a + b, 0)) / 100) + "%",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));
        nextY += 28;

        window.height = "min(calc(100% - 60px), " + (nextY - baseY) + "px)";
        this.scroller.setChildrenSize(nextY - baseY);

        return this.lastDrawable = window;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}