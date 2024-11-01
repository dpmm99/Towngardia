import { Tech } from "../game/Tech.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { TextureInfo } from "./TextureInfo.js";

export class FriendVisitWindow implements IHasDrawable {
    private lastDrawable: Drawable | null = null;

    public shown: boolean = false;
    public tech: Tech | null = null;
    public techPoints: number = 0;
    public bonusClaimed: boolean = false;
    constructor() {
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const window = new Drawable({
            anchors: ['centerX'],
            y: 400,
            centerOnOwnX: true,
            width: "380px",
            height: "260px",
            fallbackColor: "#333333",
            biggerOnMobile: true,
            onClick: () => this.shown = false,
        });

        let nextY = 10;
        if (this.tech) {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "Received " + this.techPoints + " research progress toward:",
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
            nextY += 40;

            //Tech icon
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, "tech/" + this.tech.id),
                fallbackImage: new TextureInfo(64, 64, "tech/generic"),
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));

            nextY += 16;
            window.addChild(new Drawable({
                x: 80,
                y: nextY,
                width: "calc(100% - 90px)",
                height: "32px",
                text: this.tech.name,
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
            nextY += 58;

            if (this.tech.researched) {
                window.addChild(new Drawable({
                    anchors: ['centerX'],
                    centerOnOwnX: true,
                    y: nextY,
                    width: "100%",
                    height: "32px",
                    text: "Research completed!",
                    biggerOnMobile: true,
                    scaleYOnMobile: true,
                }));
                nextY += 40;
            }
        } else if (this.bonusClaimed) {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "Research bonus already claimed today.",
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
        } else {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "This friend has no helpful research to share right now.",
                wordWrap: true,
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
        }
        
        window.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            y: 10,
            width: "100%",
            height: "32px",
            text: "Tap to continue",
            biggerOnMobile: true,
            scaleYOnMobile: true,
        }));

        return this.lastDrawable = window;
    }

    public isShown(): boolean {
        return this.shown;
    }

    public show(tech: Tech | null, points: number = 0, bonusClaimed: boolean = false): void {
        this.shown = true;
        this.tech = tech;
        this.techPoints = points;
        this.bonusClaimed = bonusClaimed;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}