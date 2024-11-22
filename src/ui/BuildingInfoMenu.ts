import { Building } from "../game/Building.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { CityHall, InformationCenter } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { Effect } from "../game/Effect.js";
import { TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY, LONG_TICK_TIME, SHORT_TICKS_PER_LONG_TICK } from "../game/FundamentalConstants.js";
import { EffectType } from "../game/GridType.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { humanizeCeil, humanizeFloor, humanizePowerCeil, humanizePowerFloor, longTicksToDaysAndHours } from "./UIUtil.js";

export class BuildingInfoMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private scroller = new StandardScroller(false, true);
    private timeout: NodeJS.Timeout | null = null;

    constructor(public city: City, public uiManager: UIManager, public building?: Building | undefined) {
    }

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

        // Upkeep costs
        const powerUpkeep = building.getPowerUpkeep(this.city, true);
        const upkeepCosts = building.getUpkeep(this.city, 1);
        if (powerUpkeep) upkeepCosts.unshift({ type: 'power', amount: powerUpkeep }); //Assumes getUpkeep returns a new copy each time
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

            for (const cost of upkeepCosts) {
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
                    text: cost.type === 'power' ? humanizePowerCeil(cost.amount) : `${humanizeCeil(cost.amount * LONG_TICKS_PER_DAY)} ${cost.type}/day`, //"5 MW" or "5 food/day"
                    id: `${infoDrawable.id}.upkeep.${cost.type}.text`,
                }));
                nextY += iconSize + 5;
            }
            if (building.x === -1 && building.upkeepScales) {
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: (barWidth - padding * 2) + "px",
                    height: "24px",
                    text: "...per covered building",
                }));
                nextY += 24 + 5;
            }
            nextY += padding - 5;
        }

        // Input resources (never power)
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
        if (building.outputResources.length || idealPowerProduction) {
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
                let text = `${humanizeFloor(resource.productionRate * outputBonus * LONG_TICKS_PER_DAY)} ${resource.type}/day`;
                let grayscale = false;
                if (resource.type === 'population') {
                    text = `Housing for ${humanizeFloor(resource.capacity)}`;
                } else if (resource.type === 'tourists') {
                    if (building.x !== -1 && building.owned) text = `Tourism: ${humanizeFloor(resource.amount)}/${humanizeFloor(resource.capacity)}`;
                    else text = `Tourism: up to ${humanizeFloor(resource.capacity)}`;
                    if (!this.city.flags.has(CityFlags.UnlockedTourism)) grayscale = true;
                } else if (building.x !== -1 && building.owned) { //Don't show capacity or the guaranteed-0 in-stock amount for unplaced buildings; it just isn't needed
                    text += ` (${humanizeFloor(resource.amount)}/${humanizeFloor(resource.capacity)})`;
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

            nextY += padding;
            //A bit of a mess, but do similar for power if idealPowerProduction is nonzero.
            if (idealPowerProduction) nextY = this.addPowerProductionInfo(infoDrawable, padding, nextY, iconSize, building, barWidth, idealPowerProduction);
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
                    text: EffectType[effect.type].replace(/([A-Z])/g, ' $1').trim() + " " + (mag >= 0 ? "+" + mag : mag), //Effect type enum is almost a display name; we just add the spaces here.
                }));
                nextY += iconSize + padding + 5;
            }
        }

        //Storage
        if (building.stores.length) nextY = this.addBuildingStorageStats(infoDrawable, padding, nextY, iconSize * 0.75, building, barWidth);

        //These apply to your own buildings excluding a few special cases
        if (building.x !== -1 && building.owned) {
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
            }
            if (building instanceof InformationCenter) nextY = this.addTourismInfo(infoDrawable, padding, nextY, iconSize, barWidth);

            //Patronage
            if (building.businessPatronCap && (building.roadConnected || !building.needsRoad)) {
                nextY = this.addBusinessStats(infoDrawable, padding, nextY, building, barWidth, true);
            }

            //Warnings
            const warnings: {icon: string, text: string}[] = [];
            if (building.needsRoad && !building.roadConnected) warnings.push({ icon: "noroad", text: "No road access" });
            if (!building.powerConnected && building.needsPower) warnings.push({ icon: "nopower", text: "No power connection" });
            if (!building.powered && building.needsPower && !building.isNew) warnings.push({ icon: "outage", text: "Not enough " + (idealPowerProduction && building.inputResources.length ? "fuel" : "power") });
            if (building.damagedEfficiency < 1) warnings.push({ icon: "fire", text: "Damaged (" + Math.ceil(100 * (1 - building.damagedEfficiency)) + "%)" });
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
        } else if (building.businessPatronCap) { //Building isn't placed yet, but we still want the player to know about its business stats (patronage cap)
            nextY = this.addBusinessStats(infoDrawable, padding, nextY, building, barWidth, false);
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

        this.scroller.setChildrenSize(nextY - baseY + 140); //TODO: reeeeally need a text height estimator or something

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
            text: `Business value: ${humanizeFloor(building.businessValue)}`,
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
                    ? `Tax revenue: ${humanizeFloor(LONG_TICKS_PER_DAY * building.businessValue * building.lastEfficiency * this.city.getPostOfficeBonus() * this.city.budget.taxRates["sales"])}/day`
                    : `Max tax revenue: ${humanizeFloor(LONG_TICKS_PER_DAY * building.businessValue * this.city.getPostOfficeBonus() * this.city.budget.taxRates["sales"])}/day`),
            id: `${infoDrawable.id}.salesTax`,
        }));
        nextY += 24 + padding;
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
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: `Stores ${building.storeAmount} of:`,
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

    private addPowerProductionInfo(infoDrawable: Drawable, padding: number, nextY: number, iconSize: number, building: Building, barWidth: number, idealPowerProduction: number): number {
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: iconSize + "px",
            height: iconSize + "px",
            image: new TextureInfo(iconSize, iconSize, `resource/power`),
            id: `${infoDrawable.id}.output.power.icon`,
        }));
        const actualPowerProduction = building.getPowerProduction(this.city);
        infoDrawable.addChild(new Drawable({
            x: padding + iconSize + 5,
            y: nextY + 8,
            width: (barWidth - padding * 2 - iconSize - 5) + "px",
            height: iconSize + "px",
            text: humanizePowerFloor(actualPowerProduction) + (actualPowerProduction < idealPowerProduction ? ` (max ${humanizePowerFloor(idealPowerProduction)})` : ""),
            id: `${infoDrawable.id}.output.power.text`,
        }));
        nextY += iconSize + 5;

        const productionRate = this.city.resources.get('power')!.productionRate;
        const consumptionRate = this.city.resources.get('power')!.consumptionRate;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Citywide production: " + humanizePowerFloor(productionRate),
            id: `${infoDrawable.id}.output.power.cityp`,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Citywide consumption: " + humanizePowerCeil(consumptionRate),
            id: `${infoDrawable.id}.output.power.cityc`,
        }));
        nextY += 28;
        const surplus = productionRate - consumptionRate;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: surplus < 0 ? "Deficit: " + humanizePowerCeil(-surplus) : ("Surplus: " + humanizePowerFloor(surplus)),
            reddize: surplus < 0,
            id: `${infoDrawable.id}.output.power.citys`,
        }));
        nextY += 28;
        infoDrawable.addChild(new Drawable({
            x: padding,
            y: nextY,
            width: (barWidth - padding * 2) + "px",
            height: "24px",
            text: "Importable: " + humanizePowerFloor(this.city.desiredPower * 0.5),
            id: `${infoDrawable.id}.output.power.cityi`,
        }));
        nextY += 28;
        if (this.city.budget.powerImportLimit < 0.5) {
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "(Limit in budget: " + humanizePowerFloor(this.city.desiredPower * this.city.budget.powerImportLimit) + ")",
            }));
            nextY += 28;
        }
        //One more: the import cost per day if there's a deficit. City has a getImportPowerRate function for that.
        if (surplus < 0) {
            const importCost = Math.min(this.city.desiredPower * this.city.budget.powerImportLimit, -surplus) * this.city.getImportPowerRate() * SHORT_TICKS_PER_LONG_TICK * LONG_TICKS_PER_DAY;
            infoDrawable.addChild(new Drawable({
                x: padding,
                y: nextY,
                width: (barWidth - padding * 2) + "px",
                height: "24px",
                text: "Import cost: " + humanizeCeil(importCost) + " flunds/day",
                id: `${infoDrawable.id}.output.power.cityic`,
            }));
            nextY += 28;
            if (this.city.desiredPower * this.city.budget.powerImportLimit < -surplus) {
                infoDrawable.addChild(new Drawable({
                    x: padding,
                    y: nextY,
                    width: iconSize + "px",
                    height: iconSize + "px",
                    image: new TextureInfo(iconSize, iconSize, `ui/outage`),
                }));
                infoDrawable.addChild(new Drawable({
                    x: padding + iconSize + 5,
                    y: nextY + 8,
                    width: (barWidth - padding * 2 - iconSize - 5) + "px",
                    height: iconSize + "px",
                    text: "Rolling blackouts",
                    reddize: true,
                }));
                nextY += iconSize + 5;
            }
        }
        return nextY;
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
        nextY += 28;
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
        nextY += 28;
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
        return nextY;
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
                const effect = (reward.variables[0] ?? 0.05) * reward.duration / reward.maxDuration;
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

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}