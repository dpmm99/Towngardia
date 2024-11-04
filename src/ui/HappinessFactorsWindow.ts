import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";

export class HappinessFactorsWindow implements IHasDrawable {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    constructor(private city: City) {
    }

    public isShown(): boolean {
        return this.shown;
    }

    public show(): void {
        this.shown = true;
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
        });

        //"Happiness factors" text
        window.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "calc(100% - 20px)",
            height: "40px",
            text: "Happiness factors",
            biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
        }));

        let nextY = 50;
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

        window.height = "min(calc(100% - 60px), " + (nextY + 10) + "px)";

        return this.lastDrawable = window;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}