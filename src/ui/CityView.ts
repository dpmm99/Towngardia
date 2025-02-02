import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { CAPACITY_MULTIPLIER } from "../game/ResourceTypes.js";
import { Drawable } from "./Drawable.js";
import { LockStepSlider } from "./LockStepSlider.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

const GreenOrangeRedBlackGradient = [[0, 1, 0, 0.3], [1, 0.8, 0, 0.5], [1, 0, 0, 0.6], [0, 0, 0, 0.6]];
const RedOrangeGreenCyanGradient = [[1, 0, 0, 0.3], [1, 0.8, 0, 0.5], [0, 1, 0, 0.6], [0, 0.7, 1, 0.6]];

export class CityView {
    public showCollectibles = true;
    public showProvisioning = false;
    public drawBuildings = true; //Rarely would be usable, I'm sure, but improves performance and helps you see the data in the data views
    public provisionTicks = 1;
    public provisionHideAtTicks = 1; //Provisioning icon will be hidden if the building has at least this many ticks' worth of resources
    public lastDrawables: Drawable[] = [];
    public lastDraggables: Drawable[] = [];

    public drawResidentialDesirability = false;
    public drawLandValue = false;
    public drawPettyCrime = false;
    public drawOrganizedCrime = false;
    public drawGreenhouseGases = false;
    public drawNoise = false;
    public drawParticulatePollution = false;
    public drawPoliceCoverage = false;
    public drawFireCoverage = false;
    public drawHealthCoverage = false;
    public drawEducation = false;
    public drawLuxury = false;
    public drawBusiness = false;
    public drawEfficiency = false;
    public drawGrid = false;
    public gradient: number[][] = [];
    public gradientLowerText = "Bad";
    public gradientUpperText = "Good";
    public legendEntries: {icon: string, text: string}[] = [];
    constructor(public city: City, public uiManager: UIManager, public displayName: string = "Default") {
    }

    public getColorString(value: number, alphaOverride: number = 0): string {
        const interpolatedColor = this.getColorArray(value);
        const [r, g, b, a] = interpolatedColor;
        return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alphaOverride || a})`;
    }

    public getColorArray(value: number): number[] {
        value = Math.max(0, Math.min(1, value)); //Clamp
        const gradient = this.gradient;
        if (!gradient.length) return [1 - value, value, 0, 0.35 + value * 0.25]; //Just red to green.

        //The gradient should be a blend of the TWO colors nearest the current value (even spacing--the first gradient's value is 0, the last is 1, and if there are 3, the middle is 0.5)
        const index = value * (gradient.length - 1);
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        if (lowerIndex === upperIndex) return gradient[lowerIndex]; //Edge case

        //Interpolate between the two colors (could be done better in HSV, but oh well)
        const factor = index - lowerIndex;
        const lowerColor = gradient[lowerIndex];
        const upperColor = gradient[upperIndex];
        const interpolatedColor = lowerColor.map((channel, i) =>
            channel + factor * (upperColor[i] - channel)
        );
        
        return interpolatedColor;
    }

    public getWindowDrawables(): Drawable[] {
        return [];
    }

    public getLastWindowDrawables(): Drawable[] { return this.lastDrawables; }
    public getLastWindowDraggables(): Drawable[] { return this.lastDraggables; }
}

export class ProvisioningView extends CityView {
    private amountSlider: LockStepSlider;
    private filterSlider: LockStepSlider;
    private lastFocusedBuilding: Building | undefined = undefined;

    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Resource Provisioning");
        this.showCollectibles = false;
        this.showProvisioning = true;
        this.provisionTicks = this.city.provisionAmountPerTap;
        this.provisionHideAtTicks = this.city.provisionFilterLevel;
        const sliderOptions = { "6 hours": 1, "12 hours": 2, "1 day": 4, "2 days": 8, "3 days": 12, "Max": 100 }; //Most should be 5 days max (20 ticks), but coal power plants are tentatively 10 (40 ticks)...
        this.amountSlider = new LockStepSlider(uiManager,
            { x: 20, y: 80, fallbackColor: "#00000000" },
            "Amount per tap",
            "",
            Object.keys(sliderOptions),
            Math.max(1, Object.values(sliderOptions).indexOf(this.city.provisionAmountPerTap)),
            (value) => { this.provisionTicks = this.city.provisionAmountPerTap = (<any>sliderOptions)[value]; }
        );
        this.filterSlider = new LockStepSlider(uiManager,
            { x: 20, y: 150, fallbackColor: "#00000000" },
            "Filter level",
            "",
            Object.keys(sliderOptions),
            Math.max(1, Object.values(sliderOptions).indexOf(this.city.provisionFilterLevel)),
            (value) => { this.provisionHideAtTicks = this.city.provisionFilterLevel = (<any>sliderOptions)[value]; }
        );
        this.lastDraggables = [this.amountSlider, this.filterSlider];
    }

    public override getWindowDrawables(): Drawable[] {
        const menuDrawable = new Drawable({
            x: 0,
            y: 60,
            width: "540px",
            height: "300px",
            fallbackColor: '#222222',
            id: "provisioningMenu",
            anchors: ['right'],
            onClick: () => { }, //Prevent clicks from going through to the city
        });

        // Title and icon
        menuDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(32, 32, "ui/provisionview")
        }));
        menuDrawable.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Provide resources to buildings",
            width: "400px",
            height: "32px"
        }));

        // Sliders
        menuDrawable.addChild(this.amountSlider);
        menuDrawable.addChild(this.filterSlider);

        // Close button
        menuDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['bottom'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.uiManager.toggleProvisioning()
        }));

        // Identify buildings meeting the provisioning criteria for the arrows
        const buildings = this.city.buildings.filter(p => p.owned && p.shouldShowProvisioning(this));
        let nextIndex = -1;
        if (this.lastFocusedBuilding) nextIndex = buildings.indexOf(this.lastFocusedBuilding); //Can be -1, which is fine as indicated on the previous line

        // Right arrow button at the right edge
        const rightArrow = menuDrawable.addChild(new Drawable({
            anchors: ['right', 'bottom'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/arrowright"),
            biggerOnMobile: true,
            grayscale: !buildings.length,
            onClick: () => {
                nextIndex = (nextIndex + 1) % buildings.length;
                this.lastFocusedBuilding = buildings[nextIndex];
                if (buildings[nextIndex]) this.uiManager.centerOn(buildings[nextIndex]);
            }
        }));

        //Left arrow, anchored to the right arrow
        rightArrow.addChild(new Drawable({
            anchors: ['bottom'],
            rightAlign: true,
            x: -10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/arrowleft"),
            biggerOnMobile: true,
            grayscale: !buildings.length,
            onClick: () => {
                if (--nextIndex < 0) nextIndex = buildings.length - 1; //Not using modulo because a not-found building index (i.e., -1) would become -2, and adding buildings.length would skip the last building in the list.
                this.lastFocusedBuilding = buildings[nextIndex];
                if (buildings[nextIndex]) this.uiManager.centerOn(buildings[nextIndex]);
            }
        }));

        return this.lastDrawables = [menuDrawable];
    }
}

export class ResidentialDesirabilityView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Residential Desirability");
        this.showCollectibles = false;
        this.drawResidentialDesirability = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class LandValueView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Land Value");
        this.showCollectibles = false;
        this.drawLandValue = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class PettyCrimeView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Petty Crime");
        this.showCollectibles = false;
        this.drawPettyCrime = true;
        this.gradient = GreenOrangeRedBlackGradient;
        this.gradientLowerText = "Good";
        this.gradientUpperText = "Bad";
    }
}

export class OrganizedCrimeView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Organized Crime");
        this.showCollectibles = false;
        this.drawOrganizedCrime = true;
        this.gradient = GreenOrangeRedBlackGradient;
        this.gradientLowerText = "Good";
        this.gradientUpperText = "Bad";
    }
}

export class GreenhouseGasesView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Greenhouse Gases");
        this.showCollectibles = false;
        this.drawGreenhouseGases = true;
        this.gradient = GreenOrangeRedBlackGradient;
        this.gradientLowerText = "Good";
        this.gradientUpperText = "Bad";
    }
}

export class NoiseView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Noise Pollution");
        this.showCollectibles = false;
        this.drawNoise = true;
        this.gradient = GreenOrangeRedBlackGradient;
        this.gradientLowerText = "Good";
        this.gradientUpperText = "Bad";
    }
}

export class ParticulatePollutionView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Particulate Pollution");
        this.showCollectibles = false;
        this.drawParticulatePollution = true;
        this.gradient = GreenOrangeRedBlackGradient;
        this.gradientLowerText = "Good";
        this.gradientUpperText = "Bad";
    }
}

export class PoliceView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Police Protection");
        this.showCollectibles = false;
        this.drawPoliceCoverage = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class FireProtectionView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Fire Protection");
        this.showCollectibles = false;
        this.drawFireCoverage = true;
        this.gradient = RedOrangeGreenCyanGradient;
        this.legendEntries = [{ icon: "fire", text: "May cause fire" }];
    }
}

export class HealthcareView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Healthcare");
        this.showCollectibles = false;
        this.drawHealthCoverage = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class EducationView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Education");
        this.showCollectibles = false;
        this.drawEducation = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class LuxuryView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Luxury");
        this.showCollectibles = false;
        this.drawLuxury = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class BusinessPresenceView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Business Presence");
        this.showCollectibles = false;
        this.drawBusiness = true;
        this.gradient = RedOrangeGreenCyanGradient;
        this.legendEntries = [{ icon: "willupgrade", text: "May upgrade" }];
    }
}

export class EfficiencyView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Efficiency");
        this.showCollectibles = false;
        this.drawEfficiency = true;
        this.gradient = RedOrangeGreenCyanGradient;
    }
}

export class PlacementGridView extends CityView {
    constructor(public city: City, public uiManager: UIManager) {
        super(city, uiManager, "Placement Grid");
        this.showCollectibles = false;
        this.drawGrid = true;
    }
}
