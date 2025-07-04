import { CityView } from "../ui/CityView.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { TitleTypes } from "./AchievementTypes.js";
import { BuildingCategory } from "./BuildingCategory.js";
import { BuildingEffects, EffectDefinition } from "./BuildingEffects.js";
import { City } from "./City.js";
import { CityFlags } from "./CityFlags.js";
import { Effect } from "./Effect.js";
import { FootprintType } from "./FootprintType.js";
import { LONG_TICKS_PER_DAY, SHORT_TICKS_PER_LONG_TICK, SHORT_TICK_TIME } from "./FundamentalConstants.js";
import { EffectType } from "./GridType.js";
import { Resource } from "./Resource.js";
import { Batteries, CAPACITY_MULTIPLIER, Clothing, Electronics, Furniture, Glass, Iron, Paper, Population, ProductionEfficiency, Research, Steel, Tourists, Toys, Wood, getResourceType } from "./ResourceTypes.js";

export type BuildingModEffectType = EffectType | "research" | "population" | "storage";
export type BuildingMod = { type: BuildingModEffectType; magnitude: number };
export class Building implements IHasDrawable {
    poweredTimeDuringLongTick: number = 0;
    powered = false; //Mainly for drawing
    powerConnected = false; //For city power network flood-fills and for drawing
    needsPower = true; //Most will, so just set it to false for parks and such. Power plants DO "need power" (because they need to be on the power network).
    //Going to reuse powerConnected for water connectivity since they can both just go through roads and other adjacent buildings.
    wateredTimeDuringLongTick: number = 0;
    watered = false;
    needsWater = true;

    roadConnected = false;
    needsRoad = true;
    isRoad = false;

    onlyAllowInRegions: string[] = []; //Should fail to unlock if the city is not in one of these regions, even if it's in TutorialUnlocks or whatever.

    isNew = true; //Just so buildings don't show 'unpowered' right away when you place them, which seems a bit odd as a player
    isHidden = false; //Just for seasonal buildings. Don't want to show them year-round when they're unusable.

    isResidence = false;
    residenceLevel = 0; //Higher numbers = more people AND can be placed on top of lower numbers

    isRestaurant = false; //For a title, mainly
    isEntertainment = false; //Similar

    movable = true;
    canStowInInventory = true; //Cannot be removed from the city and kept in inventory
    demolishAllowed = false; //Most buildings you just can't destroy, but you can store.

    lastCollectibleDrawable: Drawable | null = null;
    lastProvisioningDrawable: Drawable | null = null;
    lastEfficiency: number = 0;
    damagedEfficiency: number = 1; //Reduce if the building is damaged due to fire or earthquake
    damageCause: string = "";

    businessValue: number = 0; //This is what sales tax will be calculated from, multiplied by efficiency. It's also the cost to reopen a failed business.
    businessPatronCap: number = 0;
    businessFailureCounter: number = 0;
    businessFailed: boolean = false;
    patronageEfficiency: number = 1; //Stays 1 if it's not a business.

    affectingBuildingCount: number = 0; //For services, mainly, so it can be calculated in place() and remove() instead of repeated for every service on every long tick.
    affectingCitizenCount: number = 0; //Same idea as above, but for housing--theoretical max for surrounding residences, used for scaling service upkeep costs "more intuitively".
    upkeepScales: boolean = false; //affectingBuildingCount will only be recalculated on placement or radius-upgrade if this is true.

    //Drawable radius when placing the building
    areaIndicatorRadiusX: number = 0;
    areaIndicatorRadiusY: number = 0;
    areaIndicatorRounded: boolean = false;

    variant: number = 0; //Alternative appearances for buildings
    maxVariant: number = 0; //Total number of variants other than the default image--not serialized, just used for preloading images
    outputResourceOptions: Resource[] = []; //For buildings that can produce multiple types of resources
    inputResourceOptions: Resource[] = [];

    builtOn: Set<Building> = new Set(); //For buildings with footprints of the "NEEDS_MINE" or "NEEDS_WATER" type. They can only be built on top of certain other buildings.
    effects: BuildingEffects | null = null; //For buildings that spread effects; not cloned since it has no modifiable state

    //For storage facilities
    public stores: Resource[] = [];
    public storeAmount: number = 0;

    public mods: BuildingMod[] = []; // Store all modified building effects here

    constructor(
        public type: string,
        public displayName: string,
        public description: string,
        public category: BuildingCategory,
        public width: number = 1, //in terms of tiles
        public height: number = 1,
        public xDrawOffset: number = 0, //pixels
        public fireHazard: number = 0.1, //Fire protection needed to completely prevent Fire events from being triggered by this building
        public locked: boolean = true, //If locked, the player can't build it, but they CAN place it if they have one already
        public owned: boolean = true, //Player vs. nature; can't move OR remove unowned buildings and don't pay upkeep for them. For owned buildings, use cannotRemove if you want them to be move-only.
        public x: number = -1,
        public y: number = -1,
        public id: number = 0, //First set when built or placed in a city.
        public upkeepEfficiency: number = 1,
        public outputResources: Resource[] = [], //Resources that have been produced by the building
        public inputResources: Resource[] = [], //Resources needed for production
        public checkFootprint: FootprintType[][] = Array(height).fill(null).map(() => Array(width).fill(FootprintType.EMPTY | FootprintType.RESIDENCE)),
        public stampFootprint: FootprintType[][] = Array(height).fill(null).map(() => Array(width).fill(FootprintType.OCCUPIED)),
        public serviceAllocationType: "" | "fireprotection" | "policeprotection" | "healthcare" | "education" | "environment" | "infrastructure" | "power" | "water" = "",
    ) { }

    clone(id: number | null = null): Building {
        //Assign the right subclass to the clone via this.constructor. Only problem: it gives the wrong prototype.
        const newBuilding = <Building>Object.assign(Object.create(this), this);
        newBuilding.outputResources = this.outputResources.map(p => p.clone({ amount: 0 }));
        newBuilding.inputResources = this.inputResources.map(p => p.clone({ amount: 0 }));
        newBuilding.checkFootprint = this.checkFootprint.map(row => row.slice());
        newBuilding.stampFootprint = this.stampFootprint.map(row => row.slice());
        newBuilding.outputResourceOptions = this.outputResourceOptions.map(p => p.clone());
        newBuilding.inputResourceOptions = this.inputResourceOptions.map(p => p.clone());
        newBuilding.stores = this.stores.map(p => p.clone());
        newBuilding.builtOn = new Set();
        newBuilding.x = newBuilding.y = -1;
        if (this.businessPatronCap > 0) newBuilding.patronageEfficiency = 0; //Reset if it's a business so it doesn't start off at max output when you build it.

        newBuilding.id = id || 0; //Never retain the ID when cloning; City will reassign if needed.
        return newBuilding;
    }

    //Should be idempotent; is called when the city is loaded and (just in case) also in Building.placed().
    setInfoRegion(regionID: string) { }

    getFireHazard(city: City): number {
        if (city.regionID === "volcanic") {
            if (this.fireHazard < 0.1) return this.fireHazard;
            if (this.fireHazard < 0.2) return this.fireHazard + 0.05;
            return this.fireHazard + 0.1;
        }
        return this.fireHazard;
    }

    setBusinessValue(patronCap: number, valueFraction: number) { //Made this so I can more easily see/adjust how much moolah you can get *per* patron, because my income was way too high mid-game.
        this.businessPatronCap = patronCap;
        this.businessValue = Math.round(valueFraction * patronCap);
    }

    public applyMods(city: City, mods?: BuildingMod[], negate: boolean = false, reapply: boolean = false) {
        if (mods) {
            if (this.mods?.length) this.applyMods(city, undefined, true); //Overwrite mods entirely by first negating any existing mods
            this.mods = mods;
        }
        const newEffects: EffectDefinition[] = [];
        for (const mod of this.mods) {
            if (typeof mod.type === 'string') {
                //Handle string type modifications
                switch (mod.type) {
                    case "storage": //Apply and reapply are the same for storage because it's not serialized
                        if (!negate) this.stores.push(...[Wood, Iron, Steel, Glass, Batteries, Clothing, Furniture, Electronics, Paper, Toys].map(p => new p()));

                        //storeAmount is saved, but stores is not, so we need to reset storeAmount to that of the template building type before applying this mod (note: assumes there's only one storage mod on any given building)
                        //We need to call addStorage since the building may or may not be placed when the mod is applied.
                        this.addStorage(city, (city.buildingTypes.find(p => p.type === this.type)?.storeAmount || 0) - this.storeAmount + (negate ? 0 : mod.magnitude));
                        if (negate) this.stores.length = 0;
                        break;
                    case "population": // Modify existing population resource--unless we're reapplying, in which case there's nothing to do here.
                        if (reapply) continue;
                        const populationResource = this.outputResources.find(res => res instanceof Population) as Population;
                        if (populationResource) {
                            const difference = (negate ? -1 : 1) * mod.magnitude;
                            if (difference) city.changedPopulation(this, difference); //Ensure appropriate adjustments are made to service building upkeep costs when mods are applied
                            populationResource.capacity = Math.max(0, populationResource.capacity + difference);
                            if (populationResource.capacity === 0) this.outputResources = this.outputResources.filter(p => p !== populationResource); //Would only happen if (negate).
                        } else if (!negate) {
                            //Add new population resource if there isn't one already
                            this.outputResources.push(new Population(0, mod.magnitude))
                            city.changedPopulation(this, mod.magnitude);
                        }
                        break;
                    case "research": //Same code as population but for Research
                        if (reapply) continue;
                        const researchResource = this.outputResources.find(res => res instanceof Research);
                        if (researchResource) {
                            researchResource.amount = Math.max(0, researchResource.amount + (negate ? -1 : 1) * mod.magnitude / LONG_TICKS_PER_DAY);
                            if (researchResource.amount === 0) this.outputResources = this.outputResources.filter(p => p !== researchResource);
                        } else if (!negate) {
                            this.outputResources.push(new Research(0, mod.magnitude / LONG_TICKS_PER_DAY));
                        }
                        break;
                    default:
                        // Any other non-enum modifiers to be applied (this can be expanded later)
                        console.error("Unhandled mod effect type: ", mod.type);
                        break;
                }
            } else if (mod.type === EffectType.FireHazard) { //This one DOES have an EffectType enum entry, but FireHazard effects don't go in the grid.
                //Doesn't get serialized, so reapply is the same as apply.
                this.fireHazard = Math.max(0, this.fireHazard + (negate ? -1 : 1) * mod.magnitude);
            } else {
                newEffects.push(new EffectDefinition(mod.type, mod.magnitude, undefined, false, 0, 0, false)); //The effects that belong in the grid--all 0 radius
            }
        }
        if (newEffects.length) {
            if (negate) {
                //Remove just these exact effects by type and magnitude
                if (this.effects) this.effects.effects = this.effects.effects.filter(p => !newEffects.some(q => q.type === p.type && q.magnitude === p.magnitude));
            } else {
                if (this.effects) this.effects.effects.push(...newEffects);
                else this.effects = new BuildingEffects(newEffects);
            }
            //Reapply effects to the city grid
            this.upgradeRadius(city);
        }
    }

    getRadiusUpgradeAmount(city: City): number {
        return this.effects?.getRadiusUpgradeAmount(city) ?? 0;
    }

    upgradeRadius(city: City) { //Only runs for already-placed clinics and hospitals when the telemedicine tech gets researched... and for Skyscrapers when applyMods is called.
        this.effects?.stopEffects(this, city);
        this.effects?.applyEffects(this, city);
        if (this.upkeepScales) this.recalculateAffectingBuildings(city);
    }

    //Like canPlace, but not checking a specific location. Also not intended for checking costs, so we can display cost problems separately from other reasons that something is unplaceable.
    isPlaceable(city: City, bySpawner: boolean = false): boolean { return this.movable || bySpawner; } //Assumes you'd never want to 'lock' a residence so that even the spawner can't place it.
    isBuyable(city: City, bySpawner: boolean = false): boolean { return !this.locked || bySpawner; }

    //Default implementation: buildings can be placed anywhere except on top of other buildings, based on the footprint (defaults to width x height, all occupied).
    canPlace(city: City, x: number, y: number, bySpawner: boolean = false): boolean {
        if (!this.isPlaceable(city, bySpawner)) return false;

        //City bounds
        if (x < 0 || y < 0 || x + this.width > city.width || y + this.height > city.height) {
            return false;
        }
        
        //Compare this building's footprint to the city's footprint grid.
        for (let gridY = 0; gridY < this.height; gridY++) {
            for (let gridX = 0; gridX < this.width; gridX++) {
                const existingBuilding = city.grid[y + gridY][x + gridX];
                if (bySpawner && existingBuilding?.residenceLevel && (existingBuilding.residenceLevel >= this.residenceLevel)) return false; //Spawner won't overwrite existing residences of the same or higher tier

                const cityTile = city.getCellTypeUnderBuilding(x + gridX, y + gridY, this);
                const buildingTile = this.checkFootprint[gridY][gridX];
                //FootprintType is now a flags enum, and checkFootprint is now separate from stampFootprint (getCellType returns the stamped footprint). We only care if ANY of the checkFootprint flags are in the stampFootprint.
                if ((buildingTile & cityTile) === 0) return false; //The cell does not meet the building's requirements.
            }
        }
        return true;
    }

    //Call City.addBuilding instead of this (except in City, of course).
    place(city: City, x: number, y: number): void {
        this.x = x;
        this.y = y;

        //For storage buildings
        for (const resource of this.stores) {
            const cityResource = city.resources.get(resource.type);
            if (cityResource) cityResource.capacity += this.storeAmount;
            else city.resources.set(resource.type, resource.clone({ capacity: this.storeAmount })); //Note: the city should have all resources from the start
        }

        //For buildings that spread effects
        this.effects?.applyEffects(this, city);
        if (this.upkeepScales) this.recalculateAffectingBuildings(city);

        //Buildings with no needs may as well start at 100% efficiency. But upkeep, power, and water costs have to be paid in advance for efficiency.
        if (!this.needsPower && !this.needsWater && (!this.needsRoad || this.roadConnected) && !this.getUpkeep(city, 1).length && !this.inputResources.length) this.lastEfficiency = 1;
    }

    //Called after adding to the city grid
    placed(city: City) {
        this.setInfoRegion(city.regionID!);
    }

    //Call City.removeBuilding instead of this (except in City, of course). This happens after removeFromGrid, so we clear builtOn here.
    remove(city: City, justMoving: boolean = false): void {
        this.effects?.stopEffects(this, city);
        if (!justMoving) {
            this.x = -1;
            this.y = -1;
        }
        this.affectingBuildingCount = 0;
        this.affectingCitizenCount = 0;
        this.builtOn.clear();
        if (!justMoving && this.businessPatronCap > 0) this.patronageEfficiency = 0;

        //For storage buildings
        for (const resource of this.stores) {
            const cityResource = city.resources.get(resource.type);
            if (cityResource) {
                cityResource.capacity -= this.storeAmount;
                if (!justMoving) { //Auto-sell if you can't store it all anymore or your configuration says to.
                    const amountToSell = Math.max(0, cityResource.amount - Math.floor(cityResource.autoSellAbove * cityResource.capacity));
                    if (amountToSell) city.sell(cityResource, amountToSell);
                    cityResource.amount -= amountToSell;
                }
            }
        }

        //Inheritors would do building type-specific actions like removing effects from surrounding buildings/tiles here (via city.stopEffects).
    }

    recalculateAffectingBuildings(city: City) {
        const radiusBonus = this.getRadiusUpgradeAmount(city);
        const buildings = city.getBuildingsInArea(this.x, this.y, this.width, this.height, this.areaIndicatorRadiusX + radiusBonus, this.areaIndicatorRadiusY + radiusBonus, this.areaIndicatorRounded, true);
        this.affectingBuildingCount = buildings.size;
        this.affectingCitizenCount = [...buildings].filter(p => p.isResidence).reduce((a, b) => a + (b.outputResources.find(p => p instanceof Population)?.capacity ?? 0), 0);
    }

    addStorage(city: City, amount: number) {
        this.storeAmount += amount; //For when it next gets placed/removed from the city or gets newly bought
        if (this.x === -1) return; //Not placed; nothing to do to the city itself *now*
        for (const resource of this.stores) {
            city.resources.get(resource.type)!.capacity += amount;
        }
    }

    hasStorage() { return this.stores.length > 0; }

    canStow(city: City): boolean { return this.owned && this.canStowInInventory; }

    canMove(city: City): boolean { return ((this.owned && (!this.isResidence || this.mods.length !== 0)) || city.canBuildResources) && this.movable; }

    //Buildings can be moved, stowed, or demolished (I'm not checking that, though) while they have something else built on top of them as long as you stow the on-top ones first.
    getBuildingsOnTop(city: City) {
        return [...city.getBuildingsInArea(this.x, this.y, this.width, this.height, 0, 0)].filter(b => b !== this); //Note: most logic allows A->B->C stacking. This does not, but you could expand it by recursively including the builtOn buildings.
        //Note: this logic also doesn't allow irregular footprints, but it would if you just filtered where builtOn includes 'this'. That wouldn't be directly compatible with the A->B->C stacking expansion.
    }

    canDemolish(city: City): boolean { return this.demolishAllowed; } //No longer requires it to be owned (in the player's city but not really the player's property)--because if it's not owned, then I wouldn't set demolishAllowed.

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return []; }

    //Expected to be dynamic. Cost of constructing the building.
    getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 5 }]; }

    //Also expected to be dynamic. Cost of maintaining the building (only special resources--money, flunds, water--not materials and products like iron, coal, whatever). May or may not be affected by patronageEfficiency.
    getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return []; }

    setUpkeepEfficiency(fraction: number) { this.upkeepEfficiency = fraction; }

    //Any short tick-based resources need to be strictly in their own functions so that if the player fixes the issue, the fix can take effect immediately without doubling other resource costs for that time period.
    getPowerUpkeep(city: City, ideal: boolean = false): number { return 0; }
    getPowerProduction(city: City, ideal: boolean = false): number { return 0; }
    getWaterUpkeep(city: City, ideal: boolean = false): number { return 0; }
    getWaterProduction(city: City, ideal: boolean = false): number { return 0; }

    //This needs to consider earned titles, active events, and other effects (e.g., from surrounding buildings that apply a bonus).
    //By default, it's affected by the Culinary Capital title for restaurants and the Production Efficiency resource for any non-business that produces resources.
    getEfficiencyEffectMultiplier(city: City): number {
        return (this.isRestaurant && city.titles.get(TitleTypes.CulinaryCapital.id)?.attained ? 1.1 : 1) *
            (this.outputResources.filter(p => !p.isSpecial && p.type !== getResourceType(Tourists)).length && !this.businessPatronCap
                ? city.resources.get(getResourceType(ProductionEfficiency))!.amount : 1);
    }

    //Calculate the given type of effect for each cell the building covers and return the highest one.
    //NOTE: Doesn't consider irregular footprints
    getHighestEffect(city: City, type: EffectType, atX: number = this.x, atY: number = this.y): number {
        let maxEffect = 0;
        if (atX === -1) return 0; //Assume 0 effect for unplaced buildings
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const effects = city.effectGrid[atY + y][atX + x].filter(p => p.type === type);
                if (effects.length) {
                    const effect = effects.reduce((a, b) => a + b.getEffect(city, this, atX + x, atY + y), 0);
                    if (effect > maxEffect) maxEffect = effect;
                }
            }
        }
        return maxEffect;
    }

    //NOTE: Doesn't consider irregular footprints
    * getAllEffects(city: City): Generator<Effect> {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                for (const effect of city.effectGrid[this.y + y][this.x + x]) {
                    yield effect;
                }
            }
        }
    }

    isAffectedBy(city: City, buildingType: string): boolean {
        for (const effect of this.getAllEffects(city)) if (effect.building?.type === buildingType) return true;
        return false;
    }

    //Call with CAPACITY_MULTIPLIER for number of provisioned ticks.
    private getProvisionedFraction(max: number = 1): number {
        let availableFraction = max;
        for (const cost of this.inputResources) {
            if (cost.consumptionRate === 0) continue;
            const portion = cost.amount / cost.consumptionRate;
            if (portion < availableFraction) availableFraction = portion;
        }
        return availableFraction;
    }

    //Returns true if the building is a business and has failed.
    public updateBusinessFailures(city: City, patrons: number) {
        if (patrons < 0.1 * this.businessPatronCap) { //No special consideration needed for businessPatronCap === -1 since revenue wouldn't be negative. :)
            this.businessFailureCounter++;
            if (!this.businessFailed && this.businessFailureCounter >= 20) { // Business fails after 5 days of poor performance
                this.businessFailed = true;
                this.patronageEfficiency = 0;
                city.failBusiness(this);
                return true;
            }
        } else {
            this.businessFailureCounter = 0;
        }
        return false;
    }

    public reopenBusiness(city: City): boolean {
        if (!this.businessFailed) return false;

        if (city.flunds.amount >= this.businessValue) {
            city.flunds.amount -= this.businessValue;
            this.businessFailed = false;
            this.businessFailureCounter = 0;
            return true;
        }
        return false;
    }

    public repair(city: City): void {
        city.checkAndAwardTitle(TitleTypes.AsbestosIntentions.id);
        this.damagedEfficiency = 1;
    }

    //You can use this for dynamic effects based on the building's current efficiency.
    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number): number {
        return this.x === -1 ? 1 : this.lastEfficiency;
    }

    //Business presence is a fixed magnitude unless the business isn't properly connected or has failed.
    public dynamicEffectForBusiness(city: City, building: Building | null, x: number, y: number): number {
        return this.x !== -1 && (this.businessFailed || (!this.roadConnected && this.needsRoad) || (!this.powerConnected && (this.needsPower || this.needsWater))) ? 0 : 1;
    }

    //Where you'd do stuff like produce resources
    onLongTick(city: City): void {
        //No work done if it needs a road and isn't connected to one
        if (this.upkeepEfficiency && this.poweredTimeDuringLongTick && (this.roadConnected || !this.needsRoad)) {
            //Work rate depends on upkeep, powered time, watered time, and input resource sufficiency
            const waterEffect = (this.needsWater && city.flags.has(CityFlags.WaterMatters)) ? 0.5 + 0.5 * Math.min(1, this.wateredTimeDuringLongTick) : 1; //Lack of water should only reduce efficiency by up to 50%
            this.lastEfficiency = Math.min(this.upkeepEfficiency * this.poweredTimeDuringLongTick * waterEffect * this.patronageEfficiency, this.getProvisionedFraction(), this.damagedEfficiency);

            if (this.isRestaurant) { //Can be as much as a 20% debuff if the player grows no food.
                this.lastEfficiency *= 0.8 + 0.2 * city.resources.get("foodsufficiency")!.amount;
            } else if (this.businessValue) { //Half the effect for non-food-focused businesses
                this.lastEfficiency *= 0.9 + 0.1 * city.resources.get("foodsufficiency")!.amount;
            }

            //Consume the necessary amount from inputs.
            this.inputResources.forEach(resource => {
                let amount = resource.consumptionRate * this.lastEfficiency;
                if (resource.type === "plastics") amount *= 1 - 0.5 * city.techManager.getAdoption("3dprinting");
                resource.consume(amount);
            });

            //Produce the outputs proportionally to the same efficiency
            this.lastEfficiency *= this.getEfficiencyEffectMultiplier(city); //I guess I'm not going to make *bonuses* affect upkeep or input costs.
            this.outputResources.forEach(resource => {
                //For some building types, we'll put the produced resources into the city.resources directly.
                //Note: Could also do this if the player unlocks a "you don't need to collect Item X anymore" tech. Might need to be allowed to automate some production so you can leave the game for a while and not run out of money. (It should be HARD to have a budget surplus without accounting for selling off resources.)
                if (resource.autoCollect) city.produce(resource.type, resource.productionRate * this.lastEfficiency);
                else {
                    const toProduce = { type: resource.type, amount: resource.productionRate * this.lastEfficiency };
                    city.applyReceiptBonus(toProduce); //Only applies to Research, so it does nothing here, but just so I don't forget this location if I expand it in the future...
                    resource.produce(toProduce.amount);
                }
            });
        }
    }

    //If getPowerProduction is nonzero, then the building is a power plant. In that case, turn it on immediately at whatever capacity you can manage.
    immediatePowerOn(city: City) {
        const efficiencyCap = Math.min(1, this.damagedEfficiency);
        if (this.lastEfficiency < efficiencyCap && (this.roadConnected || !this.needsRoad) && this.getPowerProduction(city, true) > 0) {
            //Calculate short ticks to the next long tick.
            const shortTicksToNextLongTick = Math.floor((city.lastShortTick - city.lastLongTick) / SHORT_TICK_TIME);
            //Get affordability of that fraction of the input resources. Account for lastEfficiency--if it's above 0, then we've already consumed some resources this long tick.
            const fractionOfLongTick = shortTicksToNextLongTick / SHORT_TICKS_PER_LONG_TICK * (efficiencyCap - this.lastEfficiency);
            const allowedFraction = Math.min(1, ...this.inputResources.map(p => p.amount / p.consumptionRate / fractionOfLongTick));
            if (allowedFraction > 0) {
                //Consume the affordable fraction of that fraction of the input resources.
                this.inputResources.forEach(p => p.consume(p.consumptionRate * fractionOfLongTick * allowedFraction));
                //Add the affordable fraction times the remaining efficiency deficit to lastEfficiency.
                this.lastEfficiency += allowedFraction * (efficiencyCap - this.lastEfficiency);
            }
        }
    }

    //If the building produces resources, it should display an icon above itself that the user can tap to collect them.
    collectiblesAsDrawable(city: City): Drawable | null {
        //Pick the best one to display based on the highest amount. Exclude special resources because they shouldn't be collected manually.
        const resource = this.outputResources.filter(p => p.amount > 0 && !p.isSpecial).sort((a, b) => b.amount - a.amount)[0];
        if (resource) {
            //Collection
            return this.lastCollectibleDrawable = new Drawable({
                anchors: ['bottom'],
                width: "64px",
                height: "64px",
                image: new TextureInfo(128, 128, 'ui/collectionbackdrop'),
                fallbackColor: "#0055bbaa",
                onClick: () => { //TODO: Consider making the collect/provision/repair functions accessible by just tapping on the building's base, too. I ended up not needing a single-tap function.
                    city.uiManager?.collectedResources(this);
                    city.transferResourcesFrom(this.outputResources, "produce");
                    city.updateLastUserActionTime();
                },
                children: [
                    new Drawable({
                        x: 16,
                        y: 16,
                        width: "32px",
                        height: "32px",
                        image: new TextureInfo(64, 64, "resource/" + resource.type),
                    }),
                ],
            });
        }

        //If the business is failed, show a different icon, and make the onClick reopen the business.
        if (this.businessFailed) {
            return this.lastCollectibleDrawable = new Drawable({
                anchors: ['bottom'],
                width: "64px",
                height: "64px",
                image: new TextureInfo(128, 128, 'ui/errorbackdrop'),
                fallbackColor: "#bb0000aa",
                onClick: () => city.showReopenBusinessDialog(this),
                children: [
                    new Drawable({
                        x: 16,
                        y: 16,
                        width: "32px",
                        height: "32px",
                        image: new TextureInfo(64, 64, "ui/reopen"),
                    }),
                ],
            });
        }

        //Damage
        if (this.damagedEfficiency < 1) {
            return this.lastCollectibleDrawable = new Drawable({
                anchors: ['bottom'],
                width: "64px",
                height: "64px",
                image: new TextureInfo(128, 128, 'ui/warningbackdrop'),
                fallbackColor: "#bb0000aa",
                onClick: () => city.showRepairBuildingDialog(this),
                children: [
                    new Drawable({
                        x: 16,
                        y: 16,
                        width: "32px",
                        height: "32px",
                        image: new TextureInfo(64, 64, "ui/fire"), //TODO: Either a separate image per cause or a unique "damage" image would be nice.
                    }),
                ],
            });
        }

        return this.lastCollectibleDrawable = null;
    }

    shouldShowProvisioning(view: CityView): boolean {
        return this.inputResources.length > 0 && this.getProvisionedFraction(CAPACITY_MULTIPLIER) < view.provisionHideAtTicks && this.inputResources.some(p => p.amount < p.capacity);
    }

    //Show icons for when buildings are low on input resources as well. If they don't have enough for the next <view-provided number> long ticks, then the "feed me" icon should appear.
    //Of course, that doesn't apply to every resource. Resources that are needed by MOST or ALL buildings, like power and perhaps water, should not require tapping.
    provisioningAsDrawable(city: City, view: CityView): Drawable | null {
        if (this.inputResources.length === 0 || (!view.showProvisioning && this.outputResources.some(p => p.amount > 0 && !p.isSpecial))) return this.lastProvisioningDrawable = null;

        //The minimum amount for showing this drawable depends on the view's settings.
        if (!this.shouldShowProvisioning(view)) return this.lastProvisioningDrawable = null;

        //Tell the player if they can't afford to give it ANY resources
        const requestedAmounts = this.inputResources.map(p => ({ type: p.type, amount: Math.min(p.consumptionRate * view.provisionTicks, p.capacity - p.amount) }));
        const canProvision = city.calculateAffordablePortion(requestedAmounts) > 0.00001;

        this.lastCollectibleDrawable = null; //So it doesn't steal the click from the provisioning view
        return this.lastProvisioningDrawable = new Drawable({
            anchors: ['bottom'],
            x: 0,
            y: 0,
            width: "32px",
            height: "32px",
            image: new TextureInfo(64, 64, canProvision ? "ui/provision" : "ui/cannotprovision"),
            onClick: view.showProvisioning ? () => {
                if (this.inputResources.some(p => !city.resources.get(p.type)?.capacity)) {
                    city.uiManager?.showProvisioningAlert(this); //Tell the user they need to build storage first
                    return;
                }

                //Calculate desired and affordable amounts, take them from the city, and put them in the building.
                const requestedAmounts = this.inputResources.map(p => ({ type: p.type, amount: Math.min(p.consumptionRate * view.provisionTicks, p.capacity - p.amount) }));
                const allowedFraction = city.calculateAffordablePortion(requestedAmounts);
                city.checkAndSpendResources(requestedAmounts.map(p => ({ type: p.type, amount: p.amount * allowedFraction })));
                this.inputResources.forEach(p => p.produce(p.consumptionRate * view.provisionTicks * allowedFraction));
                //TODO: Show popup briefly--including if you can't afford the resources--to say how much is on the market and how much it has now.

                this.immediatePowerOn(city);
                city.updateLastUserActionTime();
            } : () => {
                if (this.inputResources.some(p => !city.resources.get(p.type)?.capacity)) {
                    city.uiManager?.showProvisioningAlert(this); //Tell the user they need to build storage first
                    return;
                }

                //The view isn't supposed to show provisioning, but since we are anyway (decided it's necessary so the player doesn't forget), enter provisioning mode *instead* of providing resources to the building.
                view.uiManager.toggleProvisioning();
            },
        });
    }

    asDrawable(): Drawable { //Kind of a bad interface...
        throw new Error("AsDrawable not implemented for Building.");
    }

    getLastDrawable(): Drawable | null {
        const ret = new Drawable();
        if (this.lastCollectibleDrawable) ret.addChild(this.lastCollectibleDrawable);
        else if (this.lastProvisioningDrawable) ret.addChild(this.lastProvisioningDrawable);
        return ret;
    }
}
