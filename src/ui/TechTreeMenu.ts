import { City } from "../game/City.js";
import { Tech } from "../game/Tech.js";
import { TechManager } from "../game/TechManager.js";
import { TECH_TYPES } from "../game/TechTypes.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { addResourceCosts, humanizeFloor } from "./UIUtil.js";

export class TechTreeMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scrollerX = new StandardScroller(false, false);
    private scrollerY = new StandardScroller(false, true);
    private techIconSize = 64;
    private techPadding = 20;
    private outerExtremesPadding = 200;
    private techManager: TechManager;
    private selectedTech: Tech | null = null;
    private preloaded: boolean = false;

    constructor(private city: City, private uiManager: UIManager) {
        this.techManager = city.techManager;
    }

    onResize(): void { this.scrollerX.onResize(); this.scrollerY.onResize(); }

    //TODO: Icons for all the techs

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        const techTreeDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "techTree",
            onDrag: (x: number, y: number) => {
                this.scrollerX.handleDrag(x, techTreeDrawable.screenArea);
                this.scrollerY.handleDrag(y, techTreeDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scrollerX.resetDrag();
                this.scrollerY.resetDrag();
            }
        });

        const techs = this.techManager.techs;
        let maxX = 0;
        let maxY = 0;

        //Connections first so they don't go over the tech icons or text
        this.renderConnections(techTreeDrawable);

        techs.forEach(tech => {
            maxX = Math.max(maxX, tech.displayX + this.outerExtremesPadding);
            maxY = Math.max(maxY, tech.displayY + this.outerExtremesPadding);
            const x = tech.displayX + this.outerExtremesPadding - this.scrollerX.getScroll();
            const y = tech.displayY + this.outerExtremesPadding - this.scrollerY.getScroll();
            const grayscale = !this.techManager.canResearchTech(this.city, tech);
            const reddize = grayscale || this.techManager.calculateCurrentResearchableAmount(this.city, tech) < this.techManager.fudgeFactor; //including grayscale is a short-circuit for performance

            techTreeDrawable.addChild(new Drawable({
                x: x,
                y: y,
                width: this.techIconSize + "px",
                height: this.techIconSize + "px",
                image: new TextureInfo(this.techIconSize, this.techIconSize, "tech/" + tech.id),
                fallbackImage: new TextureInfo(this.techIconSize, this.techIconSize, "tech/generic"),
                id: techTreeDrawable.id + "." + tech.id,
                onClick: () => this.selectedTech = tech,
                grayscale: grayscale,
            }));

            // Add tech name
            techTreeDrawable.addChild(new Drawable({
                x: x + this.techIconSize / 2,
                y: y + this.techIconSize + 2,
                width: this.techIconSize * 3 + "px",
                height: "20px",
                text: tech.name,
                centerOnOwnX: true,
                grayscale: grayscale,
            }));

            if (tech.researched) {
                techTreeDrawable.addChild(new Drawable({
                    x: x, y: y,
                    width: this.techIconSize + "px", height: this.techIconSize + "px",
                    fallbackColor: "#00aa0033",
                }));
                techTreeDrawable.addChild(new Drawable({
                    x: x,
                    y: y + this.techIconSize / 2 - 15,
                    width: this.techIconSize + "px",
                    height: "30px",
                    text: "RESEARCHED",
                }));
            } else if (tech.isUnavailable(this.city)) {
                //Unavaliable techs are darkened AND say 'unavailable' on them.
                const unavailBackdrop = new Drawable({
                    x: x,
                    y: y,
                    width: this.techIconSize + "px",
                    height: this.techIconSize + "px",
                    fallbackColor: "#00000066",
                });
                unavailBackdrop.addChild(new Drawable({
                    y: this.techIconSize / 2 - 15,
                    width: "100%",
                    height: "30px",
                    text: "UNAVAILABLE",
                    reddize: true,
                }));
                techTreeDrawable.addChild(unavailBackdrop);
            } else if (!this.techManager.prereqsAreResearched(tech)) {
                techTreeDrawable.addChild(new Drawable({
                    x: x, y: y,
                    width: this.techIconSize + "px", height: this.techIconSize + "px",
                    fallbackColor: "#00000066",
                }));
            }

            // Add resource costs
            if (!tech.researched) addResourceCosts(techTreeDrawable, tech.costs, x, y + this.techIconSize + 24, undefined, undefined, undefined, undefined, undefined, undefined, undefined, grayscale, reddize, this.city);
        });

        this.scrollerX.setChildrenSize(maxX + this.techIconSize + this.techPadding + this.outerExtremesPadding);
        this.scrollerY.setChildrenSize(maxY + this.techIconSize + this.techPadding + this.outerExtremesPadding + 300); //200 extra for the bottom bar, another 100 in case it's on mobile

        // Title
        techTreeDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/research")
        }));
        const points = humanizeFloor(this.city.resources.get("research")!.amount);
        techTreeDrawable.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Research (" + points + " point" + (points === "1" ? "" : "s") + " available)",
            width: "250px",
            height: "32px"
        }));

        //A close button
        techTreeDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.uiManager.hideTechMenu(),
        }));

        techTreeDrawable.addChild(this.generateBottomBar());
        
        this.lastDrawable = techTreeDrawable;
        return techTreeDrawable;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    private renderConnections(techTreeDrawable: Drawable): void {
        this.techManager.techs.forEach(tech => {
            tech.connections.forEach(connection => {
                const connectedTech = this.techManager.techs.get(connection.id);
                if (connectedTech) {
                    const lineColor = connectedTech.researched ? '#888888' : '#cc7777';
                    const startX = tech.displayX + this.techIconSize / 2 - this.scrollerX.getScroll();
                    const startY = tech.displayY + this.techIconSize / 2 - this.scrollerY.getScroll();
                    const endX = connectedTech.displayX + this.techIconSize / 2 - this.scrollerX.getScroll();
                    const endY = connectedTech.displayY + this.techIconSize / 2 - this.scrollerY.getScroll();

                    let nextIsVertical = Math.abs(startX - endX) < Math.abs(startY - endY);
                    
                    let currentX = startX;
                    let currentY = startY;
                    connection.path.forEach((fraction, index) => {
                        let distanceToCover = (Math.abs(endY - startY) + Math.abs(endX - startX)) * fraction; //The fraction of the TOTAL distance that needs covered--so we can deliberately overshoot if needed. Negatives would go the opposite way.
                        if (nextIsVertical) {
                            distanceToCover *= Math.sign(endY - startY); //which way would make this line segment APPROACH the target
                            techTreeDrawable.addChild(new Drawable({
                                x: this.outerExtremesPadding + currentX,
                                y: this.outerExtremesPadding + Math.min(currentY, currentY + distanceToCover),
                                width: "2px",
                                height: Math.abs(distanceToCover) + 2 + "px",
                                fallbackColor: lineColor,
                            }));
                            currentY += distanceToCover;
                        } else {
                            distanceToCover *= Math.sign(endX - startX);
                            techTreeDrawable.addChild(new Drawable({
                                x: this.outerExtremesPadding + Math.min(currentX, currentX + distanceToCover),
                                y: this.outerExtremesPadding + currentY,
                                width: Math.abs(distanceToCover) + 2 + "px",
                                height: "2px",
                                fallbackColor: lineColor,
                            }));
                            currentX += distanceToCover;
                        }
                        nextIsVertical = !nextIsVertical;
                    });

                    // Final segment to end point
                    techTreeDrawable.addChild(new Drawable({
                        x: this.outerExtremesPadding + Math.min(currentX, endX),
                        y: this.outerExtremesPadding + currentY,
                        width: Math.abs(endX - currentX) + 2 + "px",
                        height: "2px",
                        fallbackColor: lineColor,
                    }));
                    techTreeDrawable.addChild(new Drawable({
                        x: this.outerExtremesPadding + endX,
                        y: this.outerExtremesPadding + Math.min(currentY, endY),
                        width: "2px",
                        height: Math.abs(endY - currentY) + 2 + "px",
                        fallbackColor: lineColor,
                    }));
                }
            });
        });
    }

    private getResearchButtonIcon() {
        if (!this.techManager.canResearchTech(this.city, this.selectedTech!)) return "ui/cannotresearch";
        const affordableFraction = this.techManager.calculateCurrentResearchableAmount(this.city, this.selectedTech!);
        if (affordableFraction >= this.techManager.fudgeFactor) return "ui/completeresearch";
        if (affordableFraction <= 1 - this.techManager.fudgeFactor) return "ui/cannotresearch";
        return "ui/progressresearch";
    }

    private generateBottomBar(): Drawable {
        const bar = new Drawable({
            anchors: ['bottom'],
            x: 0,
            y: 0,
            width: "100%",
            height: "200px",
            fallbackColor: '#333333',
            id: "tech.description",
            biggerOnMobile: true,
        });

        if (this.selectedTech && !this.selectedTech.researched && this.uiManager.isMyCity) {
            const researchButton = new Drawable({
                anchors: ['right'],
                x: 26,
                y: 10,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, this.getResearchButtonIcon()),
                biggerOnMobile: true,
                onClick: () => { if (this.selectedTech) this.techManager.researchTech(this.city, this.selectedTech); },
            })
            bar.addChild(researchButton);

            const grayscale = !this.techManager.canResearchTech(this.city, this.selectedTech);
            const reddize = grayscale || this.techManager.calculateCurrentResearchableAmount(this.city, this.selectedTech) < this.techManager.fudgeFactor; //including grayscale is a short-circuit for performance
            addResourceCosts(researchButton, this.selectedTech.costs, 0, 74, true, true, true, 32, 4, 24, 2, grayscale, reddize, this.city);
        } else if (this.selectedTech) {
            //Show adoption rate where the button used to be
            const adoptionRate = this.techManager.getAdoption(this.selectedTech.id);
            bar.addChild(new Drawable({
                anchors: ['right'],
                x: 26,
                y: 10,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, "ui/adoptionrate"),
                biggerOnMobile: true,
            }));
            bar.addChild(new Drawable({
                anchors: ['right'],
                x: 16,
                y: 74,
                width: "84px",
                height: "32px",
                text: Math.round(adoptionRate * 100) + "%",
                biggerOnMobile: true,
                scaleYOnMobile: true,
            }));
        }

        bar.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "calc(100% - 116px)",
            height: "30px",
            text: this.selectedTech ? this.selectedTech.name : "No Tech Selected",
            biggerOnMobile: true,
        }));

        bar.addChild(new Drawable({
            x: 10,
            y: 50,
            width: "calc(100% - 116px)",
            height: "22px",
            text: this.selectedTech ? this.selectedTech.description : "Select a tech to see its description",
            wordWrap: true,
            biggerOnMobile: true,
            scaleYOnMobile: true,
        }));

        return bar;
    }

    public show(): void {
        this.scrollerX.resetScroll();
        this.scrollerY.resetScroll();
        this.shown = true;
    }

    public isShown(): boolean {
        return this.shown;
    }

    public hide(): void {
        this.shown = false;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;

        const urls: { [key: string]: string } = {};
        for (const tech of TECH_TYPES) {
            urls["tech/" + tech.id] = `assets/tech/${tech.id}.png`;
        }

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}