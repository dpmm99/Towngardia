import { Building } from "../game/Building.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { CityHall, DepartmentOfEnergy, EnvironmentalLab, FreeStuffTable, InformationCenter, MinigameMinilab, PostOffice, SandsOfTime, WaterTreatmentPlant } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { Effect } from "../game/Effect.js";
import { Epidemic, TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY, LONG_TICK_TIME, SHORT_TICKS_PER_LONG_TICK } from "../game/FundamentalConstants.js";
import { EffectType } from "../game/GridType.js";
import { HIGH_TECH_UNLOCK_EDU } from "../game/HappinessCalculator.js";
import { Health, MinigameOptionResearch, Timeslips, getResourceType } from "../game/ResourceTypes.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeCeil, humanizeFloor, humanizePowerCeil, humanizePowerFloor, humanizeWaterCeil, humanizeWaterFloor, longTicksToDaysAndHours } from "./UIUtil.js";

export class BuildingInfoMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(false, true);
    private timeout: NodeJS.Timeout | null = null;

    constructor(public city: City, public uiManager: UIManager, private building?: Building | undefined) {
    }

    show(building: Building | undefined): void {
        this.building = building;
        this.scroller.resetScroll();
    }

    isShown(): boolean { return !!this.building; }

    onResize():void { this.scroller.onResize(); }

    asDrawable(): Drawable {
        if (!this.building) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing
        const building = this.building!;

        const padding = 10;
        const iconSize = 48;
        const barWidth = 400;

        const infoDrawable = new Drawable({
            anchors: ['right'],
            width: barWidth + "px",
            height: "100%",
            y: 0,
            fallbackColor: '#333333',
            id: "buildingInfo",
            onClick: () => { this.show(undefined); }, //To capture clicks so they don't go through to the city
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, infoDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
        });

        let nextY = padding - this.scroller.getScroll();
        const baseY = nextY;

        // Building image
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `building/${building.type}`),
            id: `${infoDrawable.id}.image`,
        }));

        // Building name
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: "48px",
            text: building.displayName,
            id: `${infoDrawable.id}.name`,
        }));
        nextY += Math.max(iconSize, 48) + padding;

        // Category
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: `Category: ${BuildingCategory[building.category][0] + BuildingCategory[building.category].substring(1).toLowerCase().replace('_', ' ')}`,
            id: `${infoDrawable.id}.category`,
        }));
        nextY += 24 + padding;

        //If unplaced, show dimensions, whether it needs a road, and the number you own
        if (building.x === -1) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: `Dimensions: ${building.width}x${building.height}`,
                id: `${infoDrawable.id}.dimensions`,
            }));
            nextY += 24 + padding;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: building.needsRoad ? "Must be connected to road" : "No road needed",
                id: `${infoDrawable.id}.needsRoad`,
            }));
            nextY += 24 + padding;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: `Owned: ${this.city.presentBuildingCount.get(building.type) ?? 0}`,
                id: `${infoDrawable.id}.owned`,
            }));
            nextY += 24 + padding;
        }

        // Upkeep costs
        const powerUpkeep = building.getPowerUpkeep(this.city, true) * this.city.powerUsageMultiplier;
        const waterUpkeep = building.getWaterUpkeep(this.city, true);
        const upkeepCosts = building.getUpkeep(this.city, 1);
        if (waterUpkeep) upkeepCosts.unshift({ type: 'water', amount: waterUpkeep }); //Assumes getUpkeep returns a new copy each time
        if (powerUpkeep) upkeepCosts.unshift({ type: 'power', amount: powerUpkeep }); //Same
        if (upkeepCosts.length > 0) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Upkeep:",
                id: `${infoDrawable.id}.upkeepLabel`,
            }));
            nextY += 24 + 5;

            let firstFlundsCost: boolean = true;
            for (const cost of upkeepCosts) {
                const displayFactor = building.upkeepScales && cost.type === "flunds" && building.x === -1 ? (firstFlundsCost ? 10 : 1000) : 1; //per-building/citizen costs are too small to display normally
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `resource/${cost.type}`),
                    id: `${infoDrawable.id}.upkeep.${cost.type}.icon`,
                }));
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: cost.type === 'power' ? humanizePowerCeil(cost.amount) :
                        cost.type === 'water' ? `${humanizeWaterCeil(cost.amount * LONG_TICKS_PER_DAY)} water/day` :
                        `${humanizeCeil(cost.amount * LONG_TICKS_PER_DAY * displayFactor)} ${cost.type}/day`, //"5 MW" or "5 food/day"
                    id: `${infoDrawable.id}.upkeep.${cost.type}.text`,
                }));
                nextY += iconSize + 5;
                //If unplaced, show "...per covered building" after the first flunds cost and "...per covered citizen" after the next one.
                //Otherwise, show "...from <affectingBuildingCount> buildings" and "...from <affectingCitizenCount> citizens" instead.
                if (building.upkeepScales && cost.type === "flunds") {
                    infoDrawable.addChild(new Drawable({
                        x: padding,
                        y: nextY,
                        width: (barWidth - padding * 2) + "px",
                        height: "24px",
                        text: building.x === -1 ?
                            (firstFlundsCost ? "...per 10 covered buildings" : "...per 1k covered citizens") :
                            (firstFlundsCost ? `...from ${building.affectingBuildingCount} building${building.affectingBuildingCount === 1 ? "" : "s"}`
                                : `...from ${building.affectingCitizenCount} citizen${building.affectingCitizenCount === 1 ? "" : "s"}`),
                    }));
                    firstFlundsCost = false;
                    nextY += 24 + 5;
                }
            }

            nextY += padding - 5;
        }

        // Input resources (never power/water)
        if (building.inputResources.length > 0) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Consumes:",
                id: `${infoDrawable.id}.inputLabel`,
            }));
            nextY += 24 + 5;

            for (const resource of building.inputResources) {
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `resource/${resource.type}`),
                    id: `${infoDrawable.id}.input.${resource.type}.icon`,
                }));
                let text = `${humanizeFloor(resource.consumptionRate * LONG_TICKS_PER_DAY)} ${resource.type}/day`;
                if (resource.type !== 'population' && building.x !== -1 && building.owned) { //Don't show capacity or the guaranteed-0 in-stock amount for unplaced buildings; it just isn't needed
                    text += ` (${humanizeFloor(resource.amount)}/${humanizeFloor(resource.capacity)})`;
                }
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: text,
                    id: `${infoDrawable.id}.input.${resource.type}.text`,
                }));
                nextY += iconSize + 5;
            }
            nextY += padding - 5;
        }

        // Output resources
        const idealPowerProduction = building.getPowerProduction(this.city, true);
        const idealWaterProduction = building.getWaterProduction(this.city, true);
        if (building.outputResources.length || idealPowerProduction || idealWaterProduction) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Produces:",
                id: `${infoDrawable.id}.outputLabel`,
            }));
            nextY += 24 + 5;

            const outputBonus = building.getEfficiencyEffectMultiplier(this.city); //Also appears in the efficiency number, but it's a bit confusing either way. Might need to redesign.
            for (const resource of building.outputResources) {
                let text = `${humanizeFloor(resource.productionRate * outputBonus * LONG_TICKS_PER_DAY)} ${resource.displayName}/day`;
                let grayscale = false;
                if (resource.type === 'population') {
                    text = `Housing for ${humanizeFloor(resource.capacity)}`;
                } else if (resource.type === 'tourists') {
                    const touristsRegionFactor = this.city.getTouristsRegionFactor(); //Decided to just affect the display and the final calculation in City instead of modifying all tourist attractions.
                    if (building.x !== -1 && building.owned) text = `Tourism: ${humanizeFloor(resource.amount * touristsRegionFactor)}/${humanizeFloor(resource.capacity * touristsRegionFactor)}`;
                    else text = `Tourism: up to ${humanizeFloor(resource.capacity * touristsRegionFactor)}`;
                    if (!this.city.flags.has(CityFlags.UnlockedTourism)) grayscale = true;
                } else if (building.x !== -1 && building.owned && resource.capacity !== 0) { //Don't show capacity or the guaranteed-0 in-stock amount for unplaced buildings or if capacity is 0; it just isn't needed
                    text += ` (${humanizeFloor(resource.amount)}/${humanizeFloor(resource.capacity)})`;
                } else if (resource.type === 'happiness') { //Happiness bonus isn't a "per day" thing or a capacity like the above; draw it as a "+0.01%" thing.
                    text = "+" + Math.floor(building.lastEfficiency * resource.productionRate * 1000) / 10 + "% Happiness";
                }
                
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `resource/${resource.type}`),
                    id: `${infoDrawable.id}.output.${resource.type}.icon`,
                    grayscale
                }));
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: text,
                    id: `${infoDrawable.id}.output.${resource.type}.text`,
                    grayscale
                }));
                nextY += iconSize + 5;
            }

            if (building.outputResources.length) nextY += padding;
            //A bit of a mess, but do similar for power if idealPowerProduction is nonzero.
            if (idealPowerProduction) nextY = this.addProductionInfo(infoDrawable, padding, nextY, iconSize, building, barWidth, idealPowerProduction,
                "power", "getPowerProduction", "getPowerUpkeep", this.city.desiredPower, this.city.budget.powerImportLimit, this.city.getImportPowerRate());
            if (idealWaterProduction) nextY = this.addProductionInfo(infoDrawable, padding, nextY, iconSize, building, barWidth, idealWaterProduction,
                "water", "getWaterProduction", "getWaterUpkeep", this.city.desiredWater, this.city.budget.waterImportLimit, this.city.getImportWaterRate());
            if (building instanceof CityHall) nextY = this.addBudgetInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
        }

        //Effects that buildings spread
        if (building.effects) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Area effects:",
            }));
            nextY += 24 + 5;
            for (const effectDef of building.effects.effects) {
                const effect = new Effect(effectDef.type, effectDef.magnitude, building, effectDef.dynamicCalculation);
                const effectDisplayName = EffectType[effect.type].replace(/([A-Z])/g, ' $1').trim(); //Effect type enum is almost a display name; we just add the spaces here.
                const mag = Math.round(effect.getEffect(this.city, null, building.x, building.y) * 1000) / 1000;
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `ui/${EffectType[effectDef.type].toLowerCase()}`), //EffectType strings match icon IDs now
                    fallbackColor: '#333333',
                }));
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: effect.type === EffectType.BusinessValue
                        ? (effectDisplayName + " " + (mag >= 0 ? "+" + mag * 100 : mag * 100) + "%")
                        : (effectDisplayName + " " + (mag >= 0 ? "+" + mag : mag)),
                }));
                nextY += iconSize + padding + 5;
            }

            if (building.effects.effects.some(p => p.type === EffectType.GreenhouseGases) && this.city.flags.has(CityFlags.GreenhouseGasesMatter)) {
                //Show citywide accumulated greenhouse gases and estimated effect on weather events
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: "About greenhouse gases:",
                }));
                nextY += 24 + 5;
                const gas = this.city.resources.get("greenhousegases")!;
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: ` Citywide accumulation: ${humanizeCeil(gas.amount * 1000)} ppm`, //I could equate 0 to 350 ppm and 0.1 to 450 ppm, but it's easier to understand "0 = good". Instead, 0.1 = 100 ppm.
                }));
                nextY += 24 + 5;
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: ` ${(gas.productionRate > 0 ? "In" : "De")}creasing by ${Math.round(Math.abs(gas.productionRate) * LONG_TICKS_PER_DAY * 10000) / 10} ppm/day`,
                }));
                nextY += 24 + 5;

                function expectedEventTimeFraction(chance: number, duration: number, ticksBetween: number) {
                    return duration / (1 / chance + duration + ticksBetween);
                }
                function increasedEventTimeFraction(chance: number, duration: number, ticksBetween: number, greenhouseGases: number) {
                    return expectedEventTimeFraction(Math.min(1, chance * (greenhouseGases + 0.1)), duration, Math.ceil(ticksBetween * Math.max(0, 1 - greenhouseGases)))
                        / expectedEventTimeFraction(chance * 0.1, duration, ticksBetween)
                        - 1;
                }

                //Show expected increase in time spent in weather events as caused by greenhouse gases.
                //I labeled it "rate" for brevity, but it's actually "increase in the fraction of time that the city spends with this event active".
                const droughtFraction = increasedEventTimeFraction(0.03, 40, 100, gas.amount) || 0; //Numbers copied from the event definitions
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: ` Drought rate +${Math.round(droughtFraction * 1000) / 10}%`,
                }));
                nextY += 24 + 5;
                const heatwaveFraction = increasedEventTimeFraction(0.05, 20, 80, gas.amount) || 0;
                const isHeatwave = new Date().getMonth() > 3 && new Date().getMonth() < 9;
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: ` ${isHeatwave ? "Heatwave" : "Cold snap"} rate +${Math.round(heatwaveFraction * 1000) / 10}%`,
                }));
                nextY += 24 + 5 + padding;
            }
        }

        //Storage
        if (building.stores.length) nextY = this.addBuildingStorageStats(infoDrawable, padding, nextY, iconSize * 0.75, building, barWidth);

        //Education
        if (!this.city.flags.has(CityFlags.UnlockedGameDev) && building.effects?.effects.some(p => p.type === EffectType.Education)) {
            const avgEducation = this.city.getCityAverageEducation();
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: `Average education: ${Math.floor(avgEducation * 100) / 100}`,
            }));
            nextY += 24 + 5;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: `High-tech buildings unlock at ${Math.ceil(HIGH_TECH_UNLOCK_EDU * 100) / 100}`,
            }));
            nextY += 24 + padding;
        }

        if (building instanceof WaterTreatmentPlant) nextY = this.addWaterTreatmentInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);

        //These apply to your own buildings excluding a few special cases
        if (building.x !== -1 && building.owned) {
            if (building instanceof FreeStuffTable) nextY = this.addFreeStuffInfo(infoDrawable, padding, nextY, barWidth);

            //Efficiency
            if (!(building instanceof CityHall || building instanceof InformationCenter || building.isRoad)) { //Hide efficiency for City Hall and Information Center because it's meaningless
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: `Efficiency: ${(building.lastEfficiency * 100).toFixed(1)}%`,
                    id: `${infoDrawable.id}.efficiency`,
                }));
                nextY += 24 + padding;

                //TODO: Add efficiency bonuses here--healthcare bonus from food healthiness, events
            }
            if (building instanceof InformationCenter) nextY = this.addTourismInfo(infoDrawable, padding, nextY, iconSize, barWidth);
            else if (building instanceof PostOffice) nextY = this.addPostOfficeInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
            else if (building instanceof DepartmentOfEnergy) nextY = this.addDepartmentOfEnergyInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
            else if (building instanceof EnvironmentalLab) nextY = this.addEnvironmentalLabInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
            else if (building instanceof SandsOfTime) nextY = this.addSandsOfTimeInfo(infoDrawable, padding, nextY, iconSize, barWidth);
            else if (building instanceof MinigameMinilab) nextY = this.addMinigameMinilabInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
            else if (building.effects?.effects.some(p => p.type === EffectType.Healthcare)) nextY = this.addHealthInfo(infoDrawable, padding, nextY, iconSize, barWidth);

            //Patronage
            if (building.businessPatronCap && (building.roadConnected || !building.needsRoad)) {
                nextY = this.addBusinessStats(infoDrawable, padding, nextY, building, barWidth, true);
            }

            //Warnings
            const warnings: { icon: string, text: string }[] = [];
            if (building.getFireHazard(this.city) > building.getHighestEffect(this.city, EffectType.FireProtection)) warnings.push({ icon: "fire", text: "At risk of fires" });
            if (building.needsRoad && !building.roadConnected) warnings.push({ icon: "noroad", text: "No road access" });
            if (!building.powerConnected && building.needsPower) warnings.push({ icon: "nopower", text: "No power connection" });
            else if (!building.powerConnected && building.needsWater) warnings.push({ icon: "nopower", text: "No water connection" });
            if (!building.powered && building.needsPower && !building.isNew) warnings.push({ icon: "outage", text: "Not enough " + (idealPowerProduction && building.inputResources.length ? "fuel" : "power") });
            if (!building.watered && building.needsWater && !building.isNew) warnings.push({ icon: "woutage", text: "Not enough water" });
            if (building.damagedEfficiency < 1) warnings.push({ icon: "fire", text: "Damaged by " + (building.damageCause || "N/A") + " (" + Math.ceil(100 * (1 - building.damagedEfficiency)) + "%)" });
            if (building.businessFailed) warnings.push({ icon: "reopen", text: "Business failed" });

            if (warnings.length > 0) {
                for (const warning of warnings) {
                    infoDrawable.addChild(new Drawable({
                        x: padding,
                        y: nextY,
                        width: iconSize + "px",
                        height: iconSize + "px",
                        image: new TextureInfo(iconSize, iconSize, `ui/${warning.icon}`),
                        id: `${infoDrawable.id}.warning.icon`,
                    }));
                    infoDrawable.addChild(new Drawable({
                        x: padding + iconSize + 5,
                        y: nextY + 8,
                        width: (barWidth - padding * 2 - iconSize - 5) + "px",
                        height: iconSize + "px",
                        text: warning.text,
                        id: `${infoDrawable.id}.warning.text`,
                    }));
                    nextY += iconSize + 5;
                }
                nextY += padding - 5;
            }
        } else { //Unplaced buildings
            if (building.businessPatronCap) nextY = this.addBusinessStats(infoDrawable, padding, nextY, building, barWidth, false);
            if (building instanceof PostOffice) nextY = this.addPostOfficeInfo(infoDrawable, padding, nextY, iconSize, building, barWidth);
        }

        //Description
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: building.description,
            wordWrap: true,
            id: `${infoDrawable.id}.description`,
        }));

        this.scroller.setChildrenSize(nextY - baseY + 240); //TODO: reeeeally need a text height estimator or something

        return this.lastDrawable = infoDrawable;
    }

    private addBusinessStats(infoDrawable: Drawable, padding: number, nextY: number, building: Building, barWidth: number, isPlaced: boolean): number {
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: building.businessPatronCap === -1 ? "Unlimited patronage" : (isPlaced
                ? `Patronage: ${humanizeFloor(building.patronageEfficiency * building.businessPatronCap)}/${humanizeFloor(building.businessPatronCap)}`
                : `Max patronage: ${humanizeFloor(building.businessPatronCap)}`),
            id: `${infoDrawable.id}.patronage`,
        }));
        nextY += 24 + padding;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: `Business value: ${humanizeFloor(building.businessValue * (1 + building.getHighestEffect(this.city, EffectType.BusinessValue)))}`,
            id: `${infoDrawable.id}.businessValue`,
        }));
        nextY += 24 + padding;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: building.businessPatronCap === -1 ?
                `Tax revenue: ${humanizeFloor(LONG_TICKS_PER_DAY * this.city.getInfinibusinessRevenue(building.type, true, !isPlaced) * this.city.budget.taxRates["sales"])}/day`
                : (isPlaced
                //Calculation taken from Business.getRevenue()
                    ? `Tax revenue: ${humanizeFloor(LONG_TICKS_PER_DAY * building.businessValue * building.lastEfficiency * (1 + building.getHighestEffect(this.city, EffectType.BusinessValue)) * this.city.getPostOfficeBonus() * this.city.budget.taxRates["sales"])}/day`
                    : `Max tax revenue: ${humanizeFloor(LONG_TICKS_PER_DAY * building.businessValue * this.city.getPostOfficeBonus() * this.city.budget.taxRates["sales"])}/day`),
            id: `${infoDrawable.id}.salesTax`,
        }));
        nextY += 24 + padding;

        if (building.businessPatronCap !== -1 && building.patronageEfficiency < 0.1 && building.businessFailureCounter > 0 && !building.businessFailed) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Too few patrons; at risk of closing",
                reddize: true,
            }));
            nextY += 24 + padding;
        }

        //Citywide untapped patronage number. If present, you need to build more businesses.
        const untappedPatronage = this.city.resources.get("untappedpatronage")!.amount;
        if (untappedPatronage) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: `Untapped patronage: ${humanizeFloor(untappedPatronage)}`,
                id: `${infoDrawable.id}.untappedPatronage`,
            }));
            nextY += 24 + padding;
        }
        return nextY;
    }

    private addBuildingStorageStats(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: Building, barWidth: number): number {
        const floorFunc = building.stores.length === 1 && building.stores[0].type === "water" ? humanizeWaterFloor :
            building.stores.length === 1 && building.stores[0].type === "power" ? humanizePowerFloor : humanizeFloor;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: `Stores ${floorFunc(building.storeAmount)} of:`,
            id: `${infoDrawable.id}.storageLabel`,
        }));
        nextY += 24 + 5;

        for (const resource of building.stores) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: iconSize + "px",
                height: iconSize + "px",
                image: new TextureInfo(iconSize, iconSize, `resource/${resource.type}`),
                id: `${infoDrawable.id}.storage.${resource.type}.icon`,
            }));
            infoDrawable.addChild(new Drawable({
                x: padding + iconSize + 5,
                y: nextY + 4,
                width: (barWidth - padding * 2 - iconSize - 5) + "px",
                height: iconSize + "px",
                text: resource.displayName,
                id: `${infoDrawable.id}.storage.${resource.type}.text`,
            }));
            nextY += iconSize + 5;
        }
        nextY += padding;
        return nextY;
    }

    private addProductionInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: Building, barWidth: number, idealProd: number,
        type: "power" | "water", getProduction: keyof Building, getUpkeep: keyof Building, desiredAmount: number, importLimit: number, importRate: number): number {
        const floorFunc = type === "power" ? humanizePowerFloor : humanizeWaterFloor;
        const ceilFunc = type === "power" ? humanizePowerCeil : humanizeWaterCeil; //TODO: All the water numbers should be per-day
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `resource/${type}`),
        }));
        const actualProd = (building[getProduction] as (city: City, ideal?: boolean) => number)(this.city) * (type === "water" ? LONG_TICKS_PER_DAY : 1);
        const perDay = type === "water" ? "/day" : "";
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY + 8,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: floorFunc(actualProd) + (actualProd < idealProd ? `${perDay} (max ${floorFunc(idealProd)}${perDay})` : perDay),
        }));
        nextY += iconSize + padding;

        const resource = this.city.resources.get(type)!;
        const productionRate = resource.productionRate * (type === "water" ? SHORT_TICKS_PER_LONG_TICK : 1);
        const consumptionRate = resource.consumptionRate * (type === "water" ? SHORT_TICKS_PER_LONG_TICK : 1);
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Citywide production: " + floorFunc(productionRate) + perDay,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Citywide consumption: " + ceilFunc(consumptionRate) + perDay,
        }));
        nextY += 28;
        const surplus = productionRate - consumptionRate;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: surplus < 0 ? "Deficit: " + ceilFunc(-surplus) : ("Surplus: " + floorFunc(surplus)) + perDay,
            reddize: surplus < 0,
        }));
        nextY += 28;

        //New buildings generally start at 0% efficiency and therefore 0 power/water demand, so we get 1 update to warn the player about the increasing demand. Exception: if a residence just spawned/upgraded and it upgrades at the end of this long tick.
        const nextDemandIncrease = this.city.buildings.filter(p => p.isNew).reduce((acc, p) => acc +
            (p[getUpkeep] as (city: City, ideal?: boolean) => number)(this.city, true) - (p[getUpkeep] as (city: City, ideal?: boolean) => number)(this.city)
            - (p[getProduction] as (city: City, ideal?: boolean) => number)(this.city, true) + (p[getProduction] as (city: City, ideal?: boolean) => number)(this.city), 0); //+ideal upkeep -current upkeep -ideal production +current production = expected change.
        if (nextDemandIncrease > 0) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Next demand increase: " + floorFunc(nextDemandIncrease) + perDay,
                reddize: nextDemandIncrease > surplus,
            }));
            nextY += 28;
        }

        const importCap = type === "power" ? 0.5 : 1;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Importable: " + floorFunc(desiredAmount * importCap) + perDay,
        }));
        nextY += 28;
        if (importLimit < importCap) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "(Limit in budget: " + floorFunc(desiredAmount * importLimit) + perDay + ")",
            }));
            nextY += 28;
        }
        //One more: the import cost per day if there's a deficit. City has a getImportPowerRate/getImportWaterRate function for that.
        if (surplus < 0) {
            const importCost = Math.min(desiredAmount * importLimit, -surplus) * importRate * SHORT_TICKS_PER_LONG_TICK * LONG_TICKS_PER_DAY;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Import cost: " + humanizeCeil(importCost) + " flunds/day",
            }));
            nextY += 28;
            if (desiredAmount * importLimit < -surplus) {
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `ui/${type === "power" ? "" : "w"}outage`),
                }));
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: type === "power" ? "Rolling blackouts" : "Water outage",
                    reddize: true,
                }));
                nextY += iconSize + 5;
            }
        }

        if (resource.capacity) { //If there's any storage, show the total city current amount and storage capacity
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Stored citywide: " + floorFunc(resource.amount) + "/" + floorFunc(resource.capacity),
            }));
            nextY += 28;
        }

        const dirtyWaterEpidemicChance = 0.1 * Math.sqrt(this.city.untreatedWaterPortion);
        if (type === "water" && this.city.flags.has(CityFlags.WaterTreatmentMatters) && dirtyWaterEpidemicChance > 0) {
            nextY = this.addHealthInfo(infoDrawable, padding, nextY, iconSize, barWidth);
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "From untreated water: " + Math.round(dirtyWaterEpidemicChance * 1000) / 10 + "%/day",
            }));
            nextY += 28;
        }

        return nextY + padding;
    }

    private addBudgetInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: CityHall, barWidth: number): number {
        const incomeTax = this.city.budget.lastRevenue["income"] * LONG_TICKS_PER_DAY;
        const salesTax = this.city.budget.lastRevenue["sales"] * LONG_TICKS_PER_DAY;
        const propertyTax = this.city.budget.lastRevenue["property"] * LONG_TICKS_PER_DAY;
        const expenses = this.city.flunds.consumptionRate * LONG_TICKS_PER_DAY;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "From income tax: " + humanizeFloor(incomeTax) + "/day",
            id: `${infoDrawable.id}.output.budget.income`,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "From sales tax: " + humanizeFloor(salesTax) + "/day",
            id: `${infoDrawable.id}.output.budget.sales`,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "From property tax: " + humanizeFloor(propertyTax) + "/day",
            id: `${infoDrawable.id}.output.budget.property`,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Expenses: " + humanizeCeil(expenses) + "/day", //Breakdown is in the budget menu
            id: `${infoDrawable.id}.output.budget.expenses`,
        }));
        nextY += 24 + padding;
        const surplus = incomeTax + salesTax + propertyTax - expenses;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: surplus < 0 ? "Deficit: " + humanizeCeil(-surplus) : ("Surplus: " + humanizeFloor(surplus)),
            reddize: surplus < 0,
            id: `${infoDrawable.id}.output.budget.surplus`,
        }));
        nextY += 24 + padding;
        //Show the user how many hours, minutes, and seconds there are until the next long tick occurs.
        const secondsToNextLongTick = (this.city.lastLongTick + LONG_TICK_TIME - new Date().getTime()) / 1000;
        const hours = Math.floor(secondsToNextLongTick / 3600);
        const minutes = Math.floor(secondsToNextLongTick / 60) % 60;
        const seconds = Math.floor(secondsToNextLongTick) % 60;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: this.city.timeFreeze ? "Time frozen during the tutorial." : (`Update in: ${hours}h ${minutes}m ${seconds}s`),
            id: `${infoDrawable.id}.output.budget.nexttick`,
        }));
        nextY += 28;
        if (this.timeout) clearTimeout(this.timeout);
        if (!this.city.timeFreeze) this.timeout = setTimeout(() => { this.uiManager.frameRequested = true; }, 1000); //Only redraw automatically for this one building.
        return nextY + padding;
    }

    private addTourismInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, barWidth: number): number {
        const tourismEvents = this.city.events.filter(p => p instanceof TourismReward);
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `resource/tourists`),
        }));
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY + 8,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: "Active tourism bonuses:",
        }));
        nextY += iconSize + 5;

        if (!tourismEvents.length) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "\u2022 None",
            }));
            nextY += 24 + 5;
        } else {
            let totalEffect = 1;
            for (const event of tourismEvents) {
                const reward = event as TourismReward;
                const effect = (reward.variables[0] ?? 0.05) * reward.duration / (reward.maxDuration || 1);
                totalEffect *= 1 + effect;
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: `\u2022 ${humanizeFloor(effect * 100)}% decreasing over ${longTicksToDaysAndHours(reward.duration)}`,
                }));
                nextY += 24 + 5;
                if (reward.fromPlayer !== null) {
                    infoDrawable.addChild(new Drawable({
                        x: padding,
                        y: nextY,
                        width: (barWidth - padding * 2) + "px",
                        height: "24px",
                        text: `   - Courtesy of ${reward.fromPlayer}`,
                    }));
                    nextY += 24 + 5;
                }
            }
            nextY += padding - 5;

            if (tourismEvents.length > 1) {
                //Multiply them all together and show the total effect
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: `Final bonus: ${humanizeFloor((totalEffect - 1) * 100)}%`,
                }));
                nextY += 24 + padding;
            }
        }
        return nextY;
    }

    private addPostOfficeInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: PostOffice, barWidth: number): number {
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: "Business revenue +" + humanizeFloor(this.city.getPostOfficeBonus(building.x === -1) * 100 - 100) + "%",
        }));
        nextY += iconSize + padding;
        return nextY;
    }

    private addDepartmentOfEnergyInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: DepartmentOfEnergy, barWidth: number): number {
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: iconSize + "px",
            text: "City power usage -" + (Math.floor(10000 - this.city.powerUsageMultiplier * 10000) / 100) + "%",
        }));
        nextY += iconSize + 5;

        const rate = building.lastEfficiency * this.city.getPowerUsageMultiplierLastDayChange(); //Really just an estimate
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: iconSize + "px",
            text: "Usage dropping by " + (Math.floor(100000 * rate) / 1000) + "%/day",
        }));
        nextY += iconSize + padding;
        return nextY;
    }

    private addEnvironmentalLabInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: Building, barWidth: number): number {
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: iconSize + "px",
            text: "City particulates -" + (Math.floor(10000 - this.city.particulatePollutionMultiplier * 10000) / 100) + "%",
        }));
        nextY += iconSize + 5;

        const rate = building.lastEfficiency * this.city.getParticulatePollutionMultiplierLastDayChange(); //Really just an estimate
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: iconSize + "px",
            text: "Pollution dropping by " + (Math.floor(100000 * rate) / 1000) + "%/day",
        }));
        nextY += iconSize + padding;
        return nextY;
    }

    private addSandsOfTimeInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, barWidth: number): number {
        const timeslips = this.city.resources.get(new Timeslips().type)!;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `ui/fastforwardnobg`),
        }));
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY + 8,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: "Available timeslips: " + Math.floor(timeslips.amount * 100) / 100 + "/" + timeslips.capacity,
        }));
        nextY += iconSize + 5;
        return nextY;
    }

    private addFreeStuffInfo(infoDrawable: Drawable, padding: number, nextY: number, barWidth: number): number {
        //Draw total happiness bonus for all minilabs in the city. No icon this time.
        const freeStuff = this.city.buildings.filter(p => p instanceof FreeStuffTable).reduce((a, b) => a + b.lastEfficiency * b.outputResources[0].productionRate, 0); //No cap, but only <=1% each.
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Total from Free Stuff: +" + (Math.floor(freeStuff * 1000) / 10) + "%",
        }));
        nextY += 24 + padding;
        return nextY;
    }

    private addMinigameMinilabInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: MinigameMinilab, barWidth: number): number {
        const resource = this.city.resources.get(getResourceType(MinigameOptionResearch))!;
        const researchItem = building.getCurrentResearch(this.city);
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `ui/minigames`),
        }));

        if (!researchItem) {
            infoDrawable.addChild(new Drawable({
                x: padding + iconSize + 5,
                y: nextY + 8,
                width: (barWidth - padding * 2 - iconSize - 5) + "px",
                height: iconSize + "px",
                text: "No more options to research.",
                reddize: true,
            }));
            nextY += iconSize + padding;
        } else {
            infoDrawable.addChild(new Drawable({
                x: padding + iconSize + 5,
                y: nextY + 8,
                width: (barWidth - padding * 2 - iconSize - 5) + "px",
                height: iconSize + "px",
                text: "Currently researching option:",
            }));
            nextY += iconSize + padding;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: iconSize + "px",
                text: researchItem.name,
            }));
            nextY += iconSize + 5;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: iconSize + "px",
                text: "For " + researchItem.game,
            }));
            nextY += iconSize + 5;
            infoDrawable.addChild(new Drawable({
                y: nextY,
                width: "100%",
                noXStretch: false,
                height: "30px",
                fallbackColor: '#666666',
                image: new TextureInfo(200, 20, "ui/progressbg"),
                children: [
                    new Drawable({
                        width: "100%",
                        clipWidth: 0.03 + Math.min(1, Math.max(0, resource.amount)) * 0.94,
                        noXStretch: false,
                        height: "100%",
                        fallbackColor: '#00ff11',
                        image: new TextureInfo(200, 20, "ui/progressfg"),
                        id: "timerProgress",
                    })
                ]
            }));
            nextY += 30 + padding;
        }

        return nextY;
    }

    private addWaterTreatmentInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: WaterTreatmentPlant, barWidth: number): number {
        const maxTreated = 1900000 * 4;
        const treated = (building.x !== -1 ? building.lastEfficiency : 1) * maxTreated;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Treats " + humanizeWaterFloor(treated) + "/day" + (treated < maxTreated ? `(max ${humanizeWaterFloor(maxTreated)}/day)` : ""),
        }));
        nextY += 24 + padding;
        return nextY;
    }

    private addHealthInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, barWidth: number): number {
        const epidemicChance = 1 - Math.pow(1 - Math.min(1, new Epidemic().getEpidemicChance(this.city)), LONG_TICKS_PER_DAY);
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `ui/epidemic`),
        }));
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY + 8,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: "Epidemic chance: " + humanizeFloor(epidemicChance * 100) + "%/day",
        }));
        nextY += iconSize + padding;
        return nextY;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}