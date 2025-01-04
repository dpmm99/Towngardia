import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { BIGGER_MOBILE_RATIO } from "../rendering/RenderUtil.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class ViewsBar implements IHasDrawable, IOnResizeEvent {
    public shown: boolean = false;
    private legendShown: boolean = true;
    private lastDrawable: Drawable | null = null;
    private barHeight = 60;
    private buttonWidth = 48;
    private buttonHeight = 48;
    private padding = 10;
    private scroller = new StandardScroller(true, false);
    
    constructor(private city: City, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    handleClick(x: number, y: number): boolean {
        const clicked = this.lastDrawable?.getClickedDescendant(x, y);
        if (!clicked) return false;
        clicked.onClick!();
        return true;
    }

    asDrawable(): Drawable {
        if (!this.shown) {
            return this.lastDrawable = new Drawable({ width: "0px" });
        }

        const backgroundColor = '#333333'; // Dark gray

        const barDrawable = new Drawable({
            anchors: ['top'],
            y: 60,
            width: "100%",
            height: this.barHeight + "px",
            fallbackColor: backgroundColor,
            id: "viewsBar",
            onClick: () => { }, //To capture clicks so they don't go through to the city
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(x, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true, scaleYOnMobile: true,
        });
        
        const buttons = [
            { id: "fadebuildings", action: () => this.uiManager.toggleBuildingFade() },
            { id: "hidebuildings", action: () => this.uiManager.toggleBuildings() },
            { id: "residentialdesirability", action: () => this.uiManager.toggleResidentialDesirabilityView() },
            { id: "landvalue", action: () => this.uiManager.toggleLandValueView() },
            { id: "luxury", action: () => this.uiManager.toggleLuxuryView() },
            { id: "businesspresence", action: () => this.uiManager.toggleBusinessPresenceView() },
            { id: "pettycrime", action: () => this.uiManager.togglePettyCrimeView() },
            { id: "organizedcrime", action: () => this.uiManager.toggleOrganizedCrimeView() },
            { id: "noise", action: () => this.uiManager.toggleNoiseView() },
            { id: "particulatepollution", action: () => this.uiManager.toggleParticulatePollutionView() },
            { id: "greenhousegases", action: () => this.uiManager.toggleGreenhouseGasesView() },
            { id: "policeprotection", action: () => this.uiManager.togglePoliceView() },
            { id: "fireprotection", action: () => this.uiManager.toggleFireView() },
            { id: "healthcare", action: () => this.uiManager.toggleHealthView() },
            { id: "education", action: () => this.uiManager.toggleEducationView() },
            //{ id: "happiness", action: () => this.uiManager.toggleHappinessView() }, //TODO: Can have a few more views
            //{ id: "population", action: () => this.uiManager.togglePopulationView() },
            //{ id: "traffic", action: () => this.uiManager.toggleTrafficView() },
            //{ id: "firehazard", action: () => this.uiManager.toggleFireHazardView() },
            { id: "placementgrid", action: () => this.uiManager.togglePlacementGridView() },
            { id: "efficiencyview", action: () => this.uiManager.toggleEfficiencyView() },
        ];
        if (!this.city.flags.has(CityFlags.EducationMatters)) buttons.splice(buttons.findIndex(b => b.id === "education"), 1);
        if (!this.city.flags.has(CityFlags.HealthcareMatters)) buttons.splice(buttons.findIndex(b => b.id === "healthcare"), 1);
        if (!this.city.flags.has(CityFlags.PoliceProtectionMatters)) {
            buttons.splice(buttons.findIndex(b => b.id === "policeprotection"), 1);
            buttons.splice(buttons.findIndex(b => b.id === "organizedcrime"), 1);
            buttons.splice(buttons.findIndex(b => b.id === "pettycrime"), 1);
        }
        if (!this.city.flags.has(CityFlags.FireProtectionMatters)) buttons.splice(buttons.findIndex(b => b.id === "fireprotection"), 1);
        if (!this.city.flags.has(CityFlags.GreenhouseGasesMatter)) buttons.splice(buttons.findIndex(b => b.id === "greenhousegases"), 1);

        let nextX = this.padding - this.scroller.getScroll();
        const baseX = nextX;
        buttons.forEach((button) => {
            const buttonDrawable = new Drawable({
                x: nextX,
                y: (this.barHeight - this.buttonHeight) / 2, // Center vertically within the bar
                anchors: ['top'],
                width: this.buttonWidth + "px",
                height: this.buttonHeight + "px",
                id: barDrawable.id + "." + button.id,
                image: new TextureInfo(this.buttonWidth, this.buttonHeight, "ui/" + button.id),
                onClick: button.action,
                biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
            });

            if (button.id === "fadebuildings" && this.uiManager.isMyCity && this.city.tutorialStepIndex === 6) {
                buttonDrawable.addChild(new Drawable({
                    x: -this.buttonHeight,
                    y: -this.buttonHeight,
                    width: this.buttonHeight * 3 + "px",
                    height: this.buttonHeight * 3 + "px",
                    biggerOnMobile: true, scaleXOnMobile: true, scaleYOnMobile: true,
                    image: new TextureInfo(96, 96, "ui/majorsalience"),
                }));
            }

            barDrawable.addChild(buttonDrawable);
            nextX += this.buttonWidth + this.padding;
        });

        this.scroller.setChildrenSize(nextX - baseX + this.padding);

        //Show the name of the current view below the rest of the bar, without being affected by scrolling, so the player knows what they're seeing
        const viewNameBackdrop = new Drawable({
            x: 0,
            y: this.barHeight,
            anchors: ['centerX'],
            centerOnOwnX: true,
            width: "350px",
            height: this.buttonHeight + this.padding + "px",
            fallbackColor: backgroundColor,
            id: barDrawable.id + ".viewNameBackdrop",
            scaleYOnMobile: true,
        });
        barDrawable.addChild(viewNameBackdrop);
        viewNameBackdrop.addChild(new Drawable({
            x: 0,
            y: this.padding,
            anchors: ['centerX'],
            centerOnOwnX: true,
            width: "330px",
            height: this.buttonHeight + "px",
            text: "View: " + this.uiManager.cityView.displayName,
            id: barDrawable.id + ".currentView",
        }));

        if (this.uiManager.cityView.gradient.length || this.uiManager.cityView.legendEntries.length) {
            const legend = this.drawLegend(backgroundColor);
            //legend.y! += this.buttonHeight + this.padding; -- just not doing this because the view name text is not set to scale up on mobile
            if (globalThis.innerWidth < 1170 * BIGGER_MOBILE_RATIO) { //Really didn't want to have knowledge of the screen or pixel ratio or anything in the UI code, but for the user experience...
                //Put it below the "View: <name>" text if the screen is narrow
                legend.anchors = ['below', 'centerX'];
                legend.x = legend.y = 0;
                legend.scaleXOnMobile = legend.scaleYOnMobile = false;
                legend.centerOnOwnX = true;
                viewNameBackdrop.addChild(legend);
            }
            else barDrawable.addChild(legend);
        }

        this.lastDrawable = barDrawable;
        return barDrawable;
    }

    private drawLegend(backgroundColor: string): Drawable {
        //Legend - show 8 colors of the gradient, which end is good/bad (just depends on which gradient), and the fire or growth icon with what it means (fire = at risk, growth = may upgrade) depending on the view.
        const legendWidth = 350;
        const legend = new Drawable({
            x: 60,
            y: this.barHeight,
            anchors: ['right'],
            width: legendWidth + "px",
            fallbackColor: backgroundColor,
            scaleXOnMobile: true,
            scaleYOnMobile: true,
            onClick: () => { this.legendShown = !this.legendShown; },
        });

        const legendText = new Drawable({
            anchors: ['centerX'],
            y: 6,
            centerOnOwnX: true,
            width: "calc(100% - 10px)",
            height: "30px",
            text: "Legend",
            scaleYOnMobile: true,
        });
        let nextY = 44;
        legend.addChild(legendText);
        if (!this.legendShown) { //STILL show the legend area, but put a tiny button that says "Legend" on it
            legend.width = "100px";
        } else {
            const legendEntryCount = 8;
            const widthPerLegendEntry = (legendWidth - 20) / legendEntryCount;
            for (let x = 0; x < legendEntryCount; x++) {
                const color = this.uiManager.cityView.getColorString(x / (legendEntryCount - 1), 1);
                legend.addChild(new Drawable({
                    x: 10 + x * widthPerLegendEntry,
                    y: nextY,
                    width: widthPerLegendEntry + "px",
                    height: "40px",
                    fallbackColor: color,
                }));
            }
            nextY += 44;
            //Text to tell the player what the lower and upper ends of the gradient mean
            legend.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "40%",
                height: "28px",
                text: this.uiManager.cityView.gradientLowerText,
            }));
            legend.addChild(new Drawable({
                anchors: ['right'],
                x: 10,
                y: nextY,
                rightAlign: true,
                width: "40%",
                height: "28px",
                text: this.uiManager.cityView.gradientUpperText,
            }));
            nextY += 30;
            this.uiManager.cityView.legendEntries.forEach((icon) => {
                legend.addChild(new Drawable({
                    x: 10,
                    y: nextY,
                    width: "40px",
                    height: "40px",
                    image: new TextureInfo(40, 40, "ui/" + icon.icon),
                }));
                legend.addChild(new Drawable({
                    x: 50,
                    y: nextY + 8,
                    width: "calc(100% - 60px)",
                    height: "32px",
                    text: " = " + icon.text,
                }));
                nextY += 50;
            });
        }
        legend.height = nextY + "px";
        return legend;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}