import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class ViewsBar implements IHasDrawable, IOnResizeEvent {
    public shown: boolean = false;
    private lastDrawable: Drawable | null = null;
    private barHeight = 60;
    private buttonWidth = 48;
    private buttonHeight = 48;
    private padding = 10;
    private scroller = new StandardScroller(true, false);
    private lastClickedButtonText: string = "Default";
    
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
            this.lastClickedButtonText = "Default";
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
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(x, barDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            biggerOnMobile: true, scaleYOnMobile: true,
        });
        
        const buttons = [
            { id: "residentialdesirability", action: () => { this.lastClickedButtonText = "Residential Desirability"; this.uiManager.toggleResidentialDesirabilityView(); } },
            { id: "landvalue", action: () => { this.lastClickedButtonText = "Land Value"; this.uiManager.toggleLandValueView(); } },
            { id: "luxury", action: () => { this.lastClickedButtonText = "Luxury"; this.uiManager.toggleLuxuryView(); } },
            { id: "businesspresence", action: () => { this.lastClickedButtonText = "Business Presence"; this.uiManager.toggleBusinessPresenceView(); } },
            { id: "pettycrime", action: () => { this.lastClickedButtonText = "Petty Crime"; this.uiManager.togglePettyCrimeView(); } },
            { id: "organizedcrime", action: () => { this.lastClickedButtonText = "Organized Crime"; this.uiManager.toggleOrganizedCrimeView(); } },
            { id: "noise", action: () => { this.lastClickedButtonText = "Noise Pollution"; this.uiManager.toggleNoiseView(); } },
            { id: "particulatepollution", action: () => { this.lastClickedButtonText = "Particulate Pollution"; this.uiManager.toggleParticulatePollutionView(); } },
            { id: "greenhousegases", action: () => { this.lastClickedButtonText = "Greenhouse Gases"; this.uiManager.toggleGreenhouseGasesView(); } },
            { id: "policeprotection", action: () => { this.lastClickedButtonText = "Police Protection"; this.uiManager.togglePoliceView(); } },
            { id: "fireprotection", action: () => { this.lastClickedButtonText = "Fire Protection"; this.uiManager.toggleFireView(); } },
            { id: "healthcare", action: () => { this.lastClickedButtonText = "Healthcare"; this.uiManager.toggleHealthView(); } },
            { id: "education", action: () => { this.lastClickedButtonText = "Education"; this.uiManager.toggleEducationView(); } },
            //{ id: "happiness", action: () => this.uiManager.toggleHappinessView() }, //TODO: Can have a few more views
            //{ id: "population", action: () => this.uiManager.togglePopulationView() },
            //{ id: "traffic", action: () => this.uiManager.toggleTrafficView() },
            //{ id: "firehazard", action: () => this.uiManager.toggleFireHazardView() },
            { id: "placementgrid", action: () => { this.lastClickedButtonText = "Placement Grid"; this.uiManager.togglePlacementGridView(); } },
            { id: "hidebuildings", action: () => this.uiManager.toggleBuildings() },
            { id: "fadebuildings", action: () => this.uiManager.toggleBuildingFade() },
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
            text: "View: " + this.lastClickedButtonText,
            id: barDrawable.id + ".currentView",
        }));

        this.lastDrawable = barDrawable;
        return barDrawable;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}