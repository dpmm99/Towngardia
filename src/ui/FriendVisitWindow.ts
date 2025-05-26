import { FriendResearchVisitResult } from "../game/GrantFreePointsResult.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { longTicksToHoursAndMinutes } from "./UIUtil.js";

export class FriendVisitWindow implements IHasDrawable {
    private lastDrawable: Drawable | null = null;

    public shown: boolean = false;
    public researchResult: FriendResearchVisitResult | null = null;
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
        if (this.researchResult?.tech) {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "Received " + (Math.round(this.researchResult.points * 10) / 10) + " research progress toward:",
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
                image: new TextureInfo(64, 64, "tech/" + this.researchResult.tech.id),
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
                text: this.researchResult.tech.name,
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
            nextY += 58;

            if (this.researchResult.tech.researched) {
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
        } else if (this.researchResult?.longTicksToWait) {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "You cannot claim any more research bonuses from friends right now. Try again in about " + longTicksToHoursAndMinutes(this.researchResult.longTicksToWait) + ".",
                wordWrap: true,
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
            }));
        } else if (this.researchResult?.alreadyClaimedForThisFriend) {
            window.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: "You already received a research bonus from this friend today. Try visiting a different friend's city. You have " + this.researchResult.remainingVisits + " research bonus" + (this.researchResult.remainingVisits === 1 ? "" : "es") + " left to claim from friends.",
                wordWrap: true,
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
                text: "This friend's city has no helpful research to share right now. Try visiting another city, or coordinate with a friend to work on different branches of research.",
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

    public show(friendResearchVisitResult: FriendResearchVisitResult): void {
        this.shown = true;
        this.researchResult = friendResearchVisitResult;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}