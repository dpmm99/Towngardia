import { TitleTypes } from "./AchievementTypes.js";
import { Building } from "./Building.js";
import { BuildingCategory } from "./BuildingCategory.js";
import { Business } from "./Business.js";
import { City } from "./City.js";
import { FootprintType } from "./FootprintType.js";
import { EffectType } from "./GridType.js";
import { Apples, Apps, BarPlays, Batteries, Berries, BrainBrews, Bricks, CAPACITY_MULTIPLIER, Chocolate, Clay, Clothing, Coal, Concrete, Copper, Dairy, DeptOfEnergyBonus, Electronics, EnvironmentalLabBonus, Fish, Flunds, Furniture, Gemstones, Glass, GleeGrenades, Grain, Happiness, Iron, LabGrownMeat, LeafyGreens, Legumes, Lithium, Lumber, MinigameOptionResearch, MonobrynthPlays, NepotismNetworkingPlays, Oil, Paper, Pharmaceuticals, PlantBasedDairy, Plastics, Population, Poultry, PowerCosts, RedMeat, Research, RootVegetables, Rubber, Sand, Silicon, SlotsPlays, StarboxPlays, Steel, Stone, Textiles, Tourists, Toys, Tritium, TurboTonics, Uranium, VitaminB12, Wood, getResourceType } from "./ResourceTypes.js";
import { Geothermal } from "./TechTypes.js";
import { Notification } from "./Notification.js";
import { LONG_TICKS_PER_DAY } from "./FundamentalConstants.js";
import { BuildingEffects, EffectDefinition } from "./BuildingEffects.js";
import { CityFlags } from "./CityFlags.js";

//This is a cache for the type string of a class. It's used to avoid creating an instance of a class just to get its type.
const buildingTypeCache = new Map<Function, string>();
export function getBuildingType<T extends { new(...args: any[]): {} }>(cls: T): string {
    if (!buildingTypeCache.has(cls)) {
        const instance = new cls();
        buildingTypeCache.set(cls, (instance as any).type);
    }
    return buildingTypeCache.get(cls)!;
}

//# Infrastructure
export class Road extends Building {
    public trafficQuantity: number = 0;

    constructor() {
        super(
            "road", "Road", "A chunk of cement to make travels smoother. Comes complete with wiring. Maintenance cost increases as the population rises, and it spreads noise and pollution proportional to nearby businesses' patronage.",
            BuildingCategory.INFRASTRUCTURE,
            1, 1, 0,
            0,
        );
        this.isRoad = true;
        this.maxVariant = 2;
        this.serviceAllocationType = "infrastructure";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.0002, "dynamicEffectByTrafficQuantity"),
            new EffectDefinition(EffectType.GreenhouseGases, 0.0001, "dynamicEffectByTrafficQuantity", false, 0, 0),
            new EffectDefinition(EffectType.Noise, 0.0005, "dynamicEffectByTrafficQuantityAndBudget")]); //Reduced infrastructure budget = noisier roads.
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 10 }, { type: "concrete", amount: 3 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        //Price goes up as the city grows (no cost until reaching 101 population). Optimally, I'd go by local traffic needs, but... such a system doesn't exist right now.
        //Techs reduce the cost by up to half.
        return [{ type: "flunds", amount: city.roadUpkeepPrecalculation * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    dynamicEffectByTrafficQuantity(): number {
        return this.x === -1 ? 1 : this.trafficQuantity;
    }

    dynamicEffectByTrafficQuantityAndBudget(city: City): number {
        return (this.x === -1 ? 1 : this.trafficQuantity) * (1 + 2 * (1 - city.budget.serviceAllocations[this.serviceAllocationType] ** 2)); //x1.72 noise for 80% budget, x1.32 noise for 90%. Nothing protects from noise other than vacuum glass.
    }

    determineVariant(city: City, triggerOthers: boolean): void {
        const touchingRoads = [...city.getBuildingsInArea(this.x, this.y, 1, 1, 1, 1, true, false).values()];
        let hasXAdjacent = false;
        let hasYAdjacent = false;
        for (const building of touchingRoads) {
            if (building.isRoad && building != this) {
                if (building.x === this.x) hasYAdjacent = true;
                else if (building.y === this.y) hasXAdjacent = true;
                if (triggerOthers) (<Road>building).determineVariant(city, false);
            }
        }
        if (hasXAdjacent && hasYAdjacent) this.variant = 2;
        else if (hasYAdjacent) this.variant = 1;
        else this.variant = 0;
    }

    override placed(city: City): void {
        this.determineVariant(city, true); //This road and any roads adjacent to it should switch their variant image according to connectivity.
        this.powered = this.powerConnected;
    }

    override remove(city: City, justMoving: boolean = false): void {
        let x = this.x;
        let y = this.y;
        super.remove(city, justMoving);

        //Trigger adjacent roads to update their variant images.
        const touchingRoads = [...city.getBuildingsInArea(x, y, 1, 1, 1, 1, true, false).values()];
        for (const building of touchingRoads) {
            if (building.isRoad) (<Road>building).determineVariant(city, false);
        }
    }

    //All road tiles emit noise pollution and particulate pollution in cardinal directions based on how many buildings are nearby plus the density of those buildings (should include residences, even), and of course there will be public transportation buildings to reduce those effects in the *local* area and multiple techs to reduce the effects *everywhere*.
    override onLongTick(city: City): void {
        const nearbyTravelers = city.effectGrid[this.y][this.x].filter(p => p.type === EffectType.BusinessPresence && p.building).reduce((sum, effect) => sum + effect.building!.patronageEfficiency * Math.max(50, effect.building!.businessPatronCap), 0); //Infinibusinesses count as just 50 patrons.
        const nearbyPublicTransportation = city.effectGrid[this.y][this.x].filter(p => p.type === EffectType.PublicTransport && p.building).reduce((sum, effect) => sum + effect.getEffect(city, this, this.y, this.x), 0);
        this.trafficQuantity = nearbyTravelers * (1 - city.trafficPrecalculation) //0 to 0.8 depending on techs and post office
            * (2 / (2 + nearbyPublicTransportation)); //Diminishing returns for public transportation, starting at a mere 33% reduction of the remaining traffic.
    }
}

export class BikeRental extends Building {
    constructor() {
        super(
            "bikerental", "Bike Rental", "A collection of two-wheeled freedom machines that mysteriously all have slightly wobbly seats. Slightly reduces traffic in the area by convincing people that walking isn't so bad after all. Does not have to be directly adjacent to a road.",
            BuildingCategory.INFRASTRUCTURE,
            1, 1, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.needsRoad = false;
        this.serviceAllocationType = "infrastructure";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PublicTransport, 0.2, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 35 }, { type: "iron", amount: 1 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.25 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 1;
    }
}

export class BusStation extends Building {
    constructor() {
        super(
            "busstation", "Bus Station", "A place where our noble buses find a moment's respite between their grand adventures. Reduces traffic in the area.",
            BuildingCategory.INFRASTRUCTURE,
            2, 2, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 9;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "infrastructure";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PublicTransport, 1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 140 }, { type: "concrete", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 14 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 6;
    }
}

export class ECarRental extends Building {
    constructor() {
        super(
            "ecarrental", "E-Car Rental", "Shockingly cheap electric car rental--most of the cost comes out of the city's pocket for the greater good. Reduces the pollution and noise caused by traffic in the area.",
            BuildingCategory.INFRASTRUCTURE,
            2, 2, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 10;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "infrastructure";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PublicTransport, 1.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 260 }, { type: "concrete", amount: 10 }, { type: "batteries", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 8 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 18;
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }
}

export class TeleportationPod extends Building {
    constructor() {
        super(
            "teleportationpod", "Teleportation Pod", "Folds space-time like origami through the power of scientific hand-waving, massively reducing road noise and pollution in the area--because, come on, it's a teleportation pod; everyone's dying to use it. Warning: may occasionally swap a few of your carbon atoms. It's easy to get them confused since they all look alike. May lead to happy scientific accidents if you also have a Quantum Computing Lab, like, I don't know, maybe a museum of future arts that later unlocks another building with a time fast-forwarding ability? Just a shot in the dark!",
            BuildingCategory.INFRASTRUCTURE,
            1, 1, 0,
            0.4,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 8;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "infrastructure";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PublicTransport, 5, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1000 }, { type: "electronics", amount: 30 }, { type: "gemstones", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 8 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 38;
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }
}

export class Warehouse extends Building {
    constructor() {
        super(
            "warehouse", "Warehouse", "A place to store things. This type of warehouse only stores basic construction materials and textiles. Wait... It's not really a warehouse if it doesn't contain wares, is it?",
            BuildingCategory.INFRASTRUCTURE,
            2, 3, 0,
            0.2,
        );
        this.stores.push(new Clay(), new Stone(), new Bricks(), new Glass(), new Concrete(), new Wood(), new Lumber(), new Iron(), new Steel(), new Rubber(), new Textiles());
        this.storeAmount = 50;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 80 }, { type: "wood", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

//Same as above, but Cold Storage. Stores all the various food resources
export class ColdStorage extends Building {
    constructor() {
        super(
            "coldstorage", "Cold Storage", "A place to store things. This type of warehouse only stores food and pharmaceuticals, and it's cold. Brrr. (That's the sound of the door opening.)",
            BuildingCategory.INFRASTRUCTURE,
            3, 2, 0,
            0.2,
        );
        this.stores.push(new Apples(), new Berries(), new LeafyGreens(), new Legumes(), new Poultry(), new RedMeat(), new RootVegetables(), new Dairy(), new PlantBasedDairy(), new Fish(), new Pharmaceuticals(), new VitaminB12(), new LabGrownMeat());
        this.storeAmount = 30;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 140 }, { type: "steel", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * (10 - 3 * city.techManager.getAdoption('heatpumps'));
    }
}

export class Silo extends Building {
    constructor() {
        super(
            "silo", "Silo", "A place to store things. This type of warehouse only stores granular or powdery resources. It's like a big bucket with a lid, aaand unable to hold liquids.",
            BuildingCategory.INFRASTRUCTURE,
            1, 1, 0,
            0.1,
        );
        this.stores.push(new Grain(), new Coal(), new Plastics(), new Sand()); //May store Cement, Salt, whatever similarly granular/powdery things exist.
        this.storeAmount = 10;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 30 }, { type: "iron", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class OilTank extends Building {
    constructor() {
        super(
            "oiltank", "Oil Tank", "Storage for oil only. That's for...well...fairly obvious reasons.",
            BuildingCategory.INFRASTRUCTURE,
            2, 2, 0,
            0.4,
        );
        this.stores.push(new Oil());
        this.storeAmount = 150;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 90 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class SecureStorage extends Building {
    constructor() {
        super(
            "securestorage", "Secure Storage", "Guarded storage for valuable or sensitive resources.",
            BuildingCategory.INFRASTRUCTURE,
            3, 3, 0,
            0.25,
        );
        this.stores.push(new Batteries(), new Clothing(), new Copper(), new Electronics(), new Furniture(), new Gemstones(), new Lithium(), new Paper(), new Silicon(), new Toys());
        this.storeAmount = 20;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 160 }, { type: "concrete", amount: 20 }, { type: "iron", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 3;
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 4 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class DataCenter extends Building {
    constructor() {
        super(
            "datacenter", "Data Center", "A warehouse full of very expensive space heaters that occasionally process data, also known as servers. Hosts apps and enables some high-tech research.",
            BuildingCategory.INFRASTRUCTURE,
            2, 2, 0,
            0.4,
        );
        this.stores.push(new Apps());
        this.storeAmount = 100;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3500 }, { type: "electronics", amount: 60 }, { type: "steel", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 6 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * (50 - 8 * city.techManager.getAdoption('heatpumps')); //Probably pointless since Heat Pumps is the easiest tech to get, but hey...maybe for a challenge run or something. :)
    }
}

export class NuclearStorage extends Building { //Should probably be required before you can build any nuclear power plant, 'cuz the waste has to have a place to go!
    constructor() {
        super(
            "nuclearstorage", "Nuclear Storage", "Guarded underground storage for nuclear materials. Devalues the surrounding land because, y'know, radiation and scary guards and all.",
            BuildingCategory.INFRASTRUCTURE,
            3, 3, 0,
            0.1,
        );
        this.stores.push(new Tritium(), new Uranium());
        this.storeAmount = 80;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, -0.2)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 550 }, { type: "concrete", amount: 70 }, { type: "steel", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) * 5;
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 10 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

//# Government
export class CityHall extends Building {
    flunds: Flunds;
    constructor() {
        super(
            "cityhall", "City Hall", "The seat of government for the city. It's where the mayor sits, where the buck stops, and where the sitting mayor never stops collecting bucks. Your tax revenue is generated here, and upkeep expenses are taken from here before city flunds.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.1,
            false,
        );
        this.canStowInInventory = false;
        this.outputResources = [this.flunds = new Flunds(0, 0, 0, 250)];
        this.flunds.isSpecial = false; //Or else you can't collect them. :)
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, 0.1)]);
    }

    onLoad() {
        this.flunds = this.outputResources[0] as Flunds;
        this.flunds.isSpecial = false; //Or else you can't collect them. :)
    }

    override onLongTick(city: City): void {
        const population = city.resources.get("population")?.amount || 0;
        const tourists = city.resources.get("tourists")?.amount || 0;
        //TODO: Actually want to start scaling back down per-capita income after 2k or so; diminishing returns because I don't want you to be earning 2.1k flunds a day with only 6500 citizens and only enough businesses for ~half of them.
        const baseRevenuePerCapita = city.budget.taxRates["income"] * (city.peakPopulation >= 1000 ? 35 : (15 + 0.02 * city.peakPopulation)); //Scale up slowly until you hit 1k population. Don't want to give way too many resources too early.
        city.budget.lastRevenue["income"] = Math.floor(10 + Math.pow(population, 0.6) * baseRevenuePerCapita); //Comes out to about 42 for 10 people, 60 for 46, 114 for 258, 357 for 2.5k, 1335 for 25k, 2553 for 75k, 3855 for 150k...

        //I considered a property tax formula using residenceLevel**2, but sum of residenceLevel + 1 is better because it dampens the huge wealth that easily comes with higher-tier residences.
        //Simpler but less efficient version of this math: city.buildings.filter(b => b.isResidence).reduce((sum, b) => sum + b.residenceLevel + 1, 0)
        city.budget.lastRevenue["property"] = 10 * (city.budget.taxRates["property"] ?? 0.1) *
            ((city.presentBuildingCount.get(getBuildingType(SmallHouse)) ?? 0) +
                2 * (city.presentBuildingCount.get(getBuildingType(Quadplex)) ?? 0) + 2 * (city.presentBuildingCount.get(getBuildingType(SmallApartment)) ?? 0) +
                3 * (city.presentBuildingCount.get(getBuildingType(Highrise)) ?? 0) +
                4 * (city.presentBuildingCount.get(getBuildingType(Skyscraper)) ?? 0));

        //NOTE: Sales tax is on a one-long-tick delay because lastEfficiency isn't calculated until after the City Hall's onLongTick is called.
        //city.budget.lastRevenue["sales"] = city.budget.taxRates["sales"] * 10 * city.buildings.reduce((sum, building) => sum + building.lastEfficiency * building.businessValue, 0);
        city.budget.lastRevenue["sales"] = this.calculateSalesRevenue(city, population, tourists) * city.budget.taxRates["sales"];

        //Update the city's flunds production rate, update city hall's capacity (but don't delete any money they've already earned), and produce the new revenue on city hall
        this.flunds.productionRate = city.flunds.productionRate = city.budget.lastRevenue["income"] + city.budget.lastRevenue["sales"] + city.budget.lastRevenue["property"];
        const targetCapacity = Math.max((city.flunds.productionRate - city.flunds.consumptionRate) * CAPACITY_MULTIPLIER, this.flunds.amount, 250);
        if (this.flunds.capacity <= targetCapacity) this.flunds.capacity = targetCapacity;
        else this.flunds.capacity = this.flunds.capacity * 0.9 + targetCapacity * 0.1; //Reduce by 10% of the difference each tick if downsizing
        this.flunds.produce(city.flunds.productionRate);
    }

    private calculateSalesRevenue(city: City, population: number, tourists: number): number {
        //Ephemeral storage for businesses so we can process them--only looking at businesses that are running and connected and all.
        const businesses = city.buildings
            .filter(building => building.businessValue > 0 && building.businessPatronCap >= 0 && !building.businessFailed && (building.roadConnected || !building.needsRoad) && building.poweredTimeDuringLongTick > 0)
            .map(building => new Business(
                building,
                Math.min(building.poweredTimeDuringLongTick * building.upkeepEfficiency, building.damagedEfficiency) //Don't count bonuses or patronage efficiency
            ));

        //Sort businesses from best to worst--just being nice to the player, but it's also logical to think that the biggest businesses get the most patronage
        businesses.sort((a, b) => b.building.businessValue * b.connectedPoweredAndUpkeepEfficiency - a.building.businessValue * a.connectedPoweredAndUpkeepEfficiency);

        // Assign tourists and residents to businesses
        const totalPeople = population + tourists;
        this.assignPeopleToBusinesses(city, businesses, totalPeople);

        // Calculate total revenue and update business failure counters
        let totalRevenue = 0;
        businesses.forEach(business => {
            if (business.building.updateBusinessFailures(city, business.totalAssigned)) return; //continue if the business failed, so we don't count its revenue or update its patronageEfficiency
            // Update the building's lastEfficiency to include assigned people
            if (business.building.businessPatronCap === 0) throw new Error("Patron cap 0 on building " + business.building.type);
            business.building.patronageEfficiency = (business.totalAssigned / business.building.businessPatronCap);
            totalRevenue += business.getRevenue(city);
        });
        totalRevenue *= city.getPostOfficeBonus(); //Save some multiplications by just doing it once.

        //Businesses that don't take patrons from other businesses (except for those of the exact same type):
        totalRevenue += city.getInfinibusinessRevenue();

        return totalRevenue;
    }

    private assignPeopleToBusinesses(city: City, businesses: Business[], totalPeople: number): void {
        let remainingPeople = totalPeople;
        const totalBusinessValue = businesses.reduce((sum, b) => sum + b.building.businessValue * b.connectedPoweredAndUpkeepEfficiency, 0);
        if (totalBusinessValue === 0 && businesses.length) throw new Error("Total business value 0 but there are businesses.");

        // First pass: Assign patrons proportionally
        businesses.forEach(business => {
            const share = (business.building.businessValue * business.connectedPoweredAndUpkeepEfficiency) / totalBusinessValue;
            const assigned = Math.min(remainingPeople, Math.ceil(totalPeople * share), business.building.businessPatronCap);
            business.totalAssigned = assigned;
            remainingPeople -= assigned;
        });

        // Second pass: Redistribute any remaining people by overflowing from higher-value to lower-value businesses
        if (remainingPeople > 0) {
            for (const business of businesses) { //Already sorted from highest to lowest value
                const additionalCapacity = business.building.businessPatronCap - business.totalAssigned;
                if (additionalCapacity <= 0) continue;
                const additionalAssigned = Math.min(remainingPeople, additionalCapacity);
                business.totalAssigned += additionalAssigned;
                remainingPeople -= additionalAssigned;
                if (remainingPeople <= 0) break;
            }
        }

        //Store the untapped business potential somewhere
        city.resources.get("untappedpatronage")!.amount = Math.max(0, remainingPeople);
        if (!city.flags.has(CityFlags.RemindedAboutUntappedPatrons) && remainingPeople > 50) {
            city.notify(new Notification("Crying Capitalism", "Unsolicited (but totally correct) advice from your advisor: You've successfully created a city full of people with money burning holes in their pockets and precisely nowhere to spend it. It's like trying to pack your clothes for a 12-day cruise into a single shoe. Build more businesses to free your citizens of their unspent cash woes. Your treasurer is begging you. You can check the untapped patronage by viewing the info of any business.", "advisor"));
            city.flags.add(CityFlags.RemindedAboutUntappedPatrons);
        }
    }

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }
}

export class InformationCenter extends Building {
    constructor() {
        super(
            "informationcenter", "Information Center", "A place where people can learn about the city and its attractions. There is no tourism without an information center. I guess tourists are scared of the unknown or something. I dunno.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.1,
        );
        this.canStowInInventory = false;
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 500 }]; }

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);

        //Make the city able to receive tourists. No need to run this on every place() call, but it's okay because it's directly setting capacity, not adding to it.
        const resource = new Tourists();
        const cityResource = city.resources.get(resource.type);
        if (cityResource) cityResource.capacity = Number.MAX_SAFE_INTEGER;
        else city.resources.set(resource.type, resource.clone({ capacity: Number.MAX_SAFE_INTEGER })); //Note: the city should have all resources from the start
    }
}

//Post Office: slightly decreases traffic and increases business revenue citywide. Effects will be handled elsewhere. No visible radius. Low power, no upkeep.
export class PostOffice extends Building {
    constructor() {
        super(
            "postoffice", "Post Office", "A place to send and receive mail. It's a business that makes businesses more effective while making them pay for it. Slightly decreases traffic, too.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.1,
        );
        this.canStowInInventory = false;
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1100 }, { type: "concrete", amount: 15 }]; } //TODO: Switch a few buildings to brick...and make clay and bricks somehow.

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class LogisticsCenter extends Building {
    constructor() {
        super(
            "logisticscenter", "Logistics Center", "A resource storage and distribution facility that can hold a little bit of a lot of things. Building one unlocks a button for collecting all resources across the entire city. It also provides space for you to build multiple Free Stuff tables, which distribute resources in exchange for happiness.",
            BuildingCategory.GOVERNMENT,
            3, 3, 0,
            0.3,
        );
        this.stores.push(
            //Same storage as Silo, Warehouse, and Cold Storage, plus a few Secure Storage items. No oil, no nuclear fuel, no apps, and not the other Secure Storage resources.
            new Grain(), new Coal(), new Plastics(), new Sand(),
            new Clay(), new Stone(), new Bricks(), new Glass(), new Concrete(), new Wood(), new Lumber(), new Iron(), new Steel(), new Rubber(), new Textiles(),
            new Apples(), new Berries(), new LeafyGreens(), new Legumes(), new Poultry(), new RedMeat(), new RootVegetables(), new Dairy(), new PlantBasedDairy(), new Fish(), new Pharmaceuticals(), new VitaminB12(), new LabGrownMeat(),
            new Furniture(), new Clothing(), new Toys(),
        );
        this.storeAmount = 10;
        this.stampFootprint[1][1] = this.stampFootprint[1][2] = this.stampFootprint[2][1] = this.stampFootprint[2][2] = FootprintType.LOGISTICS;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 400 }, { type: "concrete", amount: 30 }, { type: "steel", amount: 15 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class FreeStuffTable extends Building { //TODO: Might be another good event: free stuff "stolen"! Lose a portion of input resources depending on how bad your police coverage is (up to 25% for no citywide coverage + up to 75% for no local coverage).
    constructor() {
        super(
            "freestuff", "Free Stuff Table", "A location dedicated to proving to your citizens that you have a heart... or at least a mildly sympathetic appendage. If you provide the resources, your city workers hand out free stuff here. Everybody loves free stuff! Actually, it might just be the thrill of unexpected urban generosity that tickles their fancy. Consumes some resources of your chosen type to directly increase happiness, but the effect weakens as population grows.",
            BuildingCategory.GOVERNMENT,
            1, 1, 0,
            0.1,
        );
        this.inputResourceOptions = [new Toys(0, 0, 0.25), new Pharmaceuticals(0, 0, 0.25), new Clothing(0, 0, 0.5), new Furniture(0, 0, 0.5), new Batteries(0, 0, 0.75), new Paper(0, 0, 1.5)];
        this.outputResources = [new Happiness(0, 0.01, 0, 0)];
        this.checkFootprint[0][0] = FootprintType.LOGISTICS;
        this.maxVariant = 2;
    }

    override placed(city: City): void {
        this.variant = Math.floor(Math.random() * (this.maxVariant + 1)); //Random variant images, just two for now.
        //Pick a random input resource if it doesn't already have one.
        if (!this.inputResources.length) this.inputResources.push(this.inputResourceOptions[Math.floor(Math.random() * this.inputResourceOptions.length)].clone());
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 50 }, { type: "wood", amount: 3 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 2; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.25 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override onLongTick(city: City): void {
        super.onLongTick(city);
        this.outputResources[0].productionRate = 1 / Math.max(100, Math.sqrt(city.peakPopulation)); //1% until 10k population, decreasing to 0.5% at 40,000, 0.25% at 160k, 0.2% at 250k
    }
}

export class DepartmentOfEnergy extends Building { //Unlocked by a tech. Increases city-wide power efficiency.
    constructor() {
        super(
            "deptofenergy", "Department of Energy", "A power efficiency research facility where the staff celebrate their victories in milliwatts and consider a 5% improvement over five years to be on par with discovering cold fusion. We've already picked all the low-hanging fruit, so now they're basically trying to coax slightly better performance out of already-optimized systems through interpretive dance and strongly worded memos. Slowly increases city-wide power efficiency as long as it's connected and powered, but the rate of improvement decreases over time because, as it turns out, you can only tell people to turn off their lights so many times. The efficiency bonus still applies even if you disconnect or stash the building. Falls under Environment in the budget.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.4,
        );
        this.serviceAllocationType = "environment";
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1700 }, { type: "batteries", amount: 20 }]; }

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 30; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    //We'll target about a 1% energy cost reduction each nextDays * LONG_TICKS_PER_DAY, and start nextDays at 60 and double it each time. 60=1% (2 mo), 60+120=2% (6 mo), 60+120+240=3% (~14 mo), 4% at ~30 mo, 5% at ~60 mo...nobody's gonna be playing that long. :)
    //At 20MW, that's 60*4*20*1.44 (worst case with power imports) or 60*4*20*0.177 (best case with fusion power) for the first 1% (e.g., maybe about 10MW for a city with ~2000 population).
    //That means it should pretty easily be paying for its own power cost by the time it hits 2% (my population grew past 2000 in barely over a month, so 6 months should lead to >12k population or >60W payback even if it were still just 1%).
    //The actual formula is in City.calculateEnergyEfficiencyBonus; this building simply adds <=1 per long tick to a hidden resource.
    override onLongTick(city: City): void {
        super.onLongTick(city);
        city.resources.get(new DeptOfEnergyBonus().type)!.amount += this.lastEfficiency;
    }
}

export class EnvironmentalLab extends Building { //Unlocked by a tech. Decreases particulate pollution effects.
    constructor() {
        super(
            "environmentallab", "Environmental Lab", "A research facility dedicated to keeping the city habitable. Watch as they gradually reduce pollution through a combination of advanced technology, precise measurements, and sternly worded emails to factory owners. Slowly decreases particulate pollution across the city as long as it's connected and powered, but the rate of improvement decreases over time because, as it turns out, you can only tell people to stop spraying toxic waste into the air so many times before they start filing restraining orders. The pollution reduction bonus still applies even if you disconnect or stash the building.",
            BuildingCategory.GOVERNMENT,
            3, 3, 0,
            0.4,
        );
        this.serviceAllocationType = "environment";
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1400 }, { type: "concrete", amount: 20 }, { type: "steel", amount: 10 }]; }

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 7; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override onLongTick(city: City): void {
        super.onLongTick(city);
        city.resources.get(new EnvironmentalLabBonus().type)!.amount += this.lastEfficiency;
    }
}

export class MinigameMinilab extends Building { //Could make it cost paper or toys in order to run, too...
    constructor() {
        super(
            "minigameminilab", "Minigame Minilab", "Not happy with the kinds of rewards minigames give? Build this lab and keep it running! As you play minigames, the lab will research new options--the better you play, the faster the options unlock. The lab also generates extra minigame tokens at random. You may only build one.",
            BuildingCategory.GOVERNMENT,
            2, 1, 0,
            0.2,
        );
    }

    override isBuyable(city: City, bySpawner: boolean = false): boolean {
        //Can only have one
        return super.isBuyable(city, bySpawner) && (bySpawner || !city.presentBuildingCount.get(this.type));
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 950 }]; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return 12; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return []; }

    override placed(city: City): void {
        city.unlockedMinigameOptions.add("mb-r1"); //Monobrynth reward set 1. 0 is unlocked automatically when you open Monobrynth.
    }

    public getCurrentResearch(city: City): { id: string, game: string, name: string } | undefined {
        if (!city.unlockedMinigameOptions.has("nn-r1")) return { id: "nn-r1", game: "Nepotism Networking", name: "Power Pals" };
        if (!city.unlockedMinigameOptions.has("sb-r1")) return { id: "sb-r1", game: "Starbox", name: "Star Fuel" };
        if (!city.unlockedMinigameOptions.has("mm-r1")) return { id: "mm-r1", game: "Memory Mixology", name: "Napkin Notes" };
        if (!city.unlockedMinigameOptions.has("sb-r2")) return { id: "sb-r2", game: "Starbox", name: "Fermi Paradox" };
        if (!city.unlockedMinigameOptions.has("nn-r2")) return { id: "nn-r2", game: "Nepotism Networking", name: "Industrial Invitees" };
        if (!city.unlockedMinigameOptions.has("mb-r2")) return { id: "mb-r2", game: "Monobrynth", name: "Fuel Replicator" };
    }

    override onLongTick(city: City): void {
        this.outputResources.splice(0, this.outputResources.length); //Clear the output resources so it doesn't try to produce them the normal way.
        super.onLongTick(city);

        //Pick a random minigame resource and add 0.1 times lastEfficiency--it's gotta keep running to keep generating plays. The plays it generates easily make up for its city service/power costs.
        const unlockedMinigames = [new BarPlays()];
        if (city.flags.has(CityFlags.UnlockedSlots)) unlockedMinigames.push(new SlotsPlays());
        if (city.flags.has(CityFlags.UnlockedStarbox)) unlockedMinigames.push(new StarboxPlays());
        if (city.flags.has(CityFlags.UnlockedMonobrynth)) unlockedMinigames.push(new MonobrynthPlays());
        if (city.flags.has(CityFlags.UnlockedTourism)) unlockedMinigames.push(new NepotismNetworkingPlays());
        const resource = unlockedMinigames[Math.floor(Math.random() * unlockedMinigames.length)];
        city.resources.get(resource.type)!.produce(0.1 * this.lastEfficiency); //2.5 days for one extra token.

        //Set outputResource[0] to the last type of token it generated, for display purposes.
        this.outputResources.push(resource.clone({productionRate: 0.1, capacity: 0, amount: 0}));
    }
}

//# Residences
export class SmallHouse extends Building {
    constructor() {
        super(
            "smallhouse", "Small House", "Someone moved in. You can demolish the place, but they won't be happy about it.",
            BuildingCategory.RESIDENTIAL,
            1, 1, 0,
            0.2,
            true, //Cannot build these yourself.
            true, //But you can remove them, I guess.
        );
        this.movable = this.canStowInInventory = !(this.isResidence = this.demolishAllowed = true); //Made it one line so it's obvious that you should copy all three to new residence types. ;)
        this.stampFootprint[0][0] = FootprintType.RESIDENCE;
        this.outputResources.push(new Population(0, 6));
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (4 - 0.5 * city.techManager.getAdoption('heatpumps') - 0.5 * city.techManager.getAdoption('vacuumwindows') - 0.5 * city.techManager.getAdoption('smarthome'));
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 1 * city.techManager.getAdoption('rooftopsolar'); }
}

export class Quadplex extends Building {
    constructor() {
        super(
            "quadplex", "Quadplex", "Housing built like a stack of pancakes on a tiny plate. Sometimes it even *smells* like pancakes. You can demolish the place, but they won't be happy about it.",
            BuildingCategory.RESIDENTIAL,
            1, 1, 0,
            0.25,
            true, //Same deal as small houses
            true,
        );
        this.movable = this.canStowInInventory = !(this.isResidence = this.demolishAllowed = true);
        this.residenceLevel = 1;
        this.stampFootprint[0][0] = FootprintType.RESIDENCE;
        this.outputResources.push(new Population(0, 24));
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (14 - 2 * city.techManager.getAdoption('heatpumps') - 1.5 * city.techManager.getAdoption('vacuumwindows') - 1 * city.techManager.getAdoption('smarthome'));
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 1.5 * city.techManager.getAdoption('rooftopsolar'); }
}

export class SmallApartment extends Building {
    constructor() {
        super(
            "smallapartment", "Small Apartment", "A landlord thought it was a good spot for a bigger residence. You can demolish the place, but they won't be happy about it.",
            BuildingCategory.RESIDENTIAL,
            2, 2, 0,
            0.3,
            true, //Same deal as small houses
            true,
        );
        this.movable = this.canStowInInventory = !(this.isResidence = this.demolishAllowed = true);
        this.residenceLevel = 1;
        //Not touching checkFootprint, so these can be built on other residences.
        this.stampFootprint[0][0] = FootprintType.RESIDENCE;
        this.stampFootprint[0][1] = FootprintType.RESIDENCE;
        this.stampFootprint[1][0] = FootprintType.RESIDENCE;
        this.stampFootprint[1][1] = FootprintType.RESIDENCE;
        this.outputResources.push(new Population(0, 35)); //Note: Bigger residences need to have 500-1k people to make it possible to reach hundreds of thousands of citizens.
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (21 - 3 * city.techManager.getAdoption('heatpumps') - 2 * city.techManager.getAdoption('vacuumwindows') - 1 * city.techManager.getAdoption('smarthome'));
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 4 * city.techManager.getAdoption('rooftopsolar'); }
}

export class Highrise extends Building {
    constructor() {
        super(
            "highrise", "Highrise", "A very tall building with many residents. It's like a small apartment building, but really tall.",
            BuildingCategory.RESIDENTIAL,
            2, 2, 0,
            0.35,
            true, //Same deal as small houses
            true,
        );
        this.movable = this.canStowInInventory = !(this.isResidence = this.demolishAllowed = true);
        this.residenceLevel = 2;
        this.stampFootprint[0][0] = FootprintType.RESIDENCE;
        this.stampFootprint[0][1] = FootprintType.RESIDENCE;
        this.stampFootprint[1][0] = FootprintType.RESIDENCE;
        this.stampFootprint[1][1] = FootprintType.RESIDENCE;
        this.outputResources.push(new Population(0, 110));
    }
    
    override canPlace(city: City, x: number, y: number, bySpawner: boolean): boolean {
        return super.canPlace(city, x, y, bySpawner) && city.peakPopulation > 330
            && (city.getBusinessDensity(x, y) >= 0.4 || city.getBusinessDensity(x, y + 1) >= 0.4 || city.getBusinessDensity(x + 1, y) >= 0.4 || city.getBusinessDensity(x + 1, y + 1) >= 0.4)
            && (city.getResidentialDesirability(x, y) >= 0.5 || city.getResidentialDesirability(x, y + 1) >= 0.5 || city.getResidentialDesirability(x + 1, y) >= 0.5 || city.getResidentialDesirability(x + 1, y + 1) >= 0.5);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (52 - 8 * city.techManager.getAdoption('heatpumps') - 6 * city.techManager.getAdoption('vacuumwindows') - 2 * city.techManager.getAdoption('smarthome'));
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 5 * city.techManager.getAdoption('rooftopsolar'); }
}

export class Skyscraper extends Building {
    constructor() {
        super(
            "skyscraper", "Skyscraper", "A very tall building housing hundreds of residents. It's like a highrise, but even taller.",
            BuildingCategory.RESIDENTIAL,
            2, 2, 0,
            0.4,
            true, //Same deal as small houses
            true,
        );
        this.movable = this.canStowInInventory = !(this.isResidence = this.demolishAllowed = true);
        this.residenceLevel = 3;
        this.stampFootprint[0][0] = FootprintType.RESIDENCE;
        this.stampFootprint[0][1] = FootprintType.RESIDENCE;
        this.stampFootprint[1][0] = FootprintType.RESIDENCE;
        this.stampFootprint[1][1] = FootprintType.RESIDENCE;
        this.outputResources.push(new Population(0, 470));
    }

    override canPlace(city: City, x: number, y: number, bySpawner: boolean): boolean {
        return super.canPlace(city, x, y, bySpawner) && city.peakPopulation > 800
            && (city.getBusinessDensity(x, y) >= 0.5 || city.getBusinessDensity(x, y + 1) >= 0.5 || city.getBusinessDensity(x + 1, y) >= 0.5 || city.getBusinessDensity(x + 1, y + 1) >= 0.5)
            && (city.getResidentialDesirability(x, y) >= 0.65 || city.getResidentialDesirability(x, y + 1) >= 0.65 || city.getResidentialDesirability(x + 1, y) >= 0.65 || city.getResidentialDesirability(x + 1, y + 1) >= 0.65);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (130 - 14 * city.techManager.getAdoption('heatpumps') - 11 * city.techManager.getAdoption('vacuumwindows') - 4 * city.techManager.getAdoption('smarthome'));
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 8 * city.techManager.getAdoption('rooftopsolar'); }
}

export class Dorm extends Building {
    constructor() {
        super(
            "dorm", "Dorm", "A place where students live while they're studying. Notice I didn't say \"sleep.\" You can build one of these on both the left and right corners of a college.",
            BuildingCategory.RESIDENTIAL,
            2, 2, 0,
            0.2,
            true, //Locked until the tech unlocks it.
        );
        this.checkFootprint[0][0] = this.checkFootprint[0][1] = this.checkFootprint[1][0] = this.checkFootprint[1][1] = FootprintType.COLLEGE;
        this.outputResources.push(new Population(0, 80));
        this.maxVariant = 1;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 350 }, { type: "concrete", amount: 10 }, { type: "steel", amount: 5 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number {
        return (ideal ? 1 : this.lastEfficiency) *
            (36 - 6 * city.techManager.getAdoption('heatpumps') - 5 * city.techManager.getAdoption('vacuumwindows') - 1 * city.techManager.getAdoption('smarthome'));
    }

    override placed(city: City): void {
        const college = <College>this.builtOn.values().next().value;
        this.variant = this.x === college.x ? 0 : 1;
        this.roadConnected = college.roadConnected;
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 4 * city.techManager.getAdoption('rooftopsolar'); }
}

export class ShowHome extends Building {
    constructor() {
        super(
            "showhome", "Show Home", "A model home that shows what your city's houses could be like. Everything inside is voice-activated, touch-sensitive, and absolutely nothing like what you can actually afford. The kitchen provides condescending commentary on your cooking skills, and the bathroom mirror that gives unsolicited fashion advice.",
            BuildingCategory.RESIDENTIAL,
            2, 2, 0,
            0.15,
            true, //Locked until the tech unlocks it.
        );
        this.outputResources.push(new Tourists(10, 10, 0, 150)); //Brings in 150 tourists per long tick, but it takes 3.75 days to get up to full steam.
        this.outputResources.push(new Population(0, 4));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.2, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 700 }, { type: "wood", amount: 15 }, { type: "glass", amount: 15 }, { type: "electronics", amount: 5 }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 5 * city.techManager.getAdoption('rooftopsolar'); }
}

//# Power
export class StarterSolarPanel extends Building {
    constructor() {
        super(
            "startersolarpanel", "Starter Solar Panel", "A small solar panel that produces electricity. It's a start. It's free. It's free energy from a star.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
            true,
        );
        this.needsRoad = false;
    }

    override getCosts(city: City): { type: string, amount: number }[] { return []; }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        this.powered = true; //Just to avoid showing the "not enough power" warning
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return 8; }
}

export class WindTurbine extends Building {
    constructor() {
        super(
            "windturbine", "Wind Turbine", "A wind turbine that produces electricity. It's a fan that makes money.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
        );
        this.needsRoad = false;
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        this.powered = true; //Just to avoid showing the "not enough power" warning--you really need to be able to see the "power not connected" warning first
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        const costReductionTech = city.techManager.getAdoption('windlattice');
        return [{ type: "flunds", amount: 100 - costReductionTech * 40 }, { type: "concrete", amount: 5 - costReductionTech * 1 }, { type: "iron", amount: 10 - costReductionTech * 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        const costReductionTech = city.techManager.getAdoption('windlattice');
        return [{ type: "flunds", amount: (4 - costReductionTech) * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 20; }
}

export class SolarFarm extends Building {
    constructor() {
        super(
            "solarfarm", "Solar Farm", "A bunch of panels that always face the sun like sunflowers and use photons to power life necessities such as social media flamewars and death metal.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.1,
        );
        this.needsRoad = false;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        const costReductionTech = city.techManager.getAdoption('perovskitesolar');
        return [{ type: "flunds", amount: 800 - costReductionTech * 200 }, { type: "silicon", amount: 20 - costReductionTech * 15 }, { type: "steel", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        const costReductionTech = city.techManager.getAdoption('perovskitesolar');
        return [{ type: "flunds", amount: (28 - 4 * costReductionTech) * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number {
        const costReductionTech = city.techManager.getAdoption('perovskitesolar');
        return (ideal ? 1 : this.lastEfficiency) * (200 + 20 * costReductionTech);
    }
}

export class GeothermalPowerPlant extends Building {
    constructor() {
        super(
            "geothermalpowerplant", "Geothermal Power Plant", "A power plant that uses the planet's heat to produce electricity. It's like a hat for a volcano, except not. Must be built on a geothermal vent.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.3,
            true,
        );
        this.checkFootprint[1][1] = FootprintType.GEO_VENT;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 300 }, { type: "concrete", amount: 10 }, { type: "copper", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 19 * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 450 * (1 + 0.2 * city.techManager.getAdoption("thermalrecovery")); }
}

export class OilPowerPlant extends Building {
    constructor() {
        super(
            "oilpowerplant", "Oil Power Plant", "A power plant that burns oil to produce electricity. It's like a car engine, except those aren't *supposed* to burn oil.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.5,
        );
        this.inputResources.push(new Oil(0, 0, 1, 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important. This input cost is counted much like upkeep.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.stampFootprint[0][2] = FootprintType.OIL_PLANT; //Allows an Oil Truck on its rightmost tile for sustained player absences
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.25, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.GreenhouseGases, 0.2, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 280 }, { type: "concrete", amount: 20 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 12 * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number {
        //Show the unpowered warning if it's going to run out soon. Note: this is called right after the loop that sets powered = true for buildings that have enough power.
        if (!ideal && this.inputResources[0].amount <= 4 && city.getBuildingsInArea(this.x, this.y, this.width, this.height, 0, 0).size === 1) this.powered = false;
        return (ideal ? 1 : this.lastEfficiency) * 300 * (1 + 0.2 * city.techManager.getAdoption("thermalrecovery"));
    }
}

export class OilTruck extends Building {
    constructor() {
        super(
            "oiltruck", "Oil Truck", "A truck that keeps your oil power plant running as long as there's oil in storage or on the market (and you can afford it). Good for preventing blackouts when you're on vacation.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
            true,
        );
        this.needsRoad = this.needsPower = false;
        this.checkFootprint[0][0] = FootprintType.OIL_PLANT; //Must be placed on the rightmost tile of an oil power plant
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 80 }, { type: "steel", amount: 5 }]; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1.5 * (atEfficiency || city.resources.get(getResourceType(PowerCosts))!.amount) }]; }

    override placed(city: City) {
        this.onLongTick(city);
        (this.builtOn.values().next().value as Building)?.immediatePowerOn(city);
    }

    override onLongTick(city: City): void {
        this.lastEfficiency = 0;
        const oilPowerPlant = this.builtOn.values().next().value as OilPowerPlant;
        if (!oilPowerPlant) return;

        //First, calculate how much the power plant needs in order to run for a whole long tick. (That part is obvious; the complication is you have to consider how much oil it has NOW.)
        //The * 2 is to make it so it always has one tick's worth (this always runs in the same tick right before the built-on power plant's onLongTick), causing the provisioning arrow to (normally) be hidden.
        const neededAmount = Math.min(oilPowerPlant.inputResources[0].consumptionRate * 2, oilPowerPlant.inputResources[0].consumptionRate * 2 - oilPowerPlant.inputResources[0].amount);
        this.lastEfficiency = 1;
        if (neededAmount <= 0) return;

        //Spend the resources/flunds as needed and allowed, then put the oil into the power plant.
        const affordableFraction = Math.min(this.damagedEfficiency, city.calculateAffordablePortion([{ type: "oil", amount: neededAmount }], false));
        this.lastEfficiency = affordableFraction;
        const oilToGrant = neededAmount * affordableFraction;
        city.checkAndSpendResources([{ type: "oil", amount: oilToGrant }], false);
        oilPowerPlant.inputResources[0].produce(oilToGrant);
    }
}

export class CoalPowerPlant extends Building {
    constructor() {
        super(
            "coalpowerplant", "Coal Power Plant", "A power plant that burns coal to produce electricity. The heat is transferred to homes by wire...sort of.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.5,
        );
        this.inputResources.push(new Coal(0, 0, 1, 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important. This input cost is counted much like upkeep.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.stampFootprint[2][0] = FootprintType.COAL_PLANT; //Allows a Coal Truck on its leftmost tile for sustained player absences
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.4, "pollutionEffectDynamicCalculation"),
            new EffectDefinition(EffectType.GreenhouseGases, 0.3, "dynamicEffectByEfficiency")]); //Should be about 50% more greenhouse gases than oil power
    }

    pollutionEffectDynamicCalculation(city: City, building: Building | null, x: number, y: number): number {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 - 0.25 * city.techManager.getAdoption('coalscrubbers'));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 400 }, { type: "concrete", amount: 25 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 13 * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number {
        //Show the unpowered warning if it's going to run out soon. Note: this is called right after the loop that sets powered = true for buildings that have enough power.
        //The getBuildingsInArea check is a lazy way to check for a fuel truck.
        if (!ideal && this.inputResources[0].amount <= 4 && city.getBuildingsInArea(this.x, this.y, this.width, this.height, 0, 0).size === 1) this.powered = false;
        return (ideal ? 1 : this.lastEfficiency) * 350 * (1 + 0.2 * city.techManager.getAdoption("thermalrecovery"));
    } //Realistically, it should be more like 4000 if a wind turbine is 25, but...eh.
}

export class CoalTruck extends Building {
    constructor() {
        super(
            "coaltruck", "Coal Truck", "A truck that keeps your coal power plant running as long as there's coal in storage or on the market (and you can afford it). Good for preventing blackouts when you're on vacation.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
            true,
        );
        this.needsRoad = this.needsPower = false;
        this.checkFootprint[0][0] = FootprintType.COAL_PLANT; //Must be placed on the leftmost tile of a coal power plant
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 70 }, { type: "steel", amount: 3 }]; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1.5 * (atEfficiency || city.resources.get(getResourceType(PowerCosts))!.amount) }]; }

    override placed(city: City) {
        this.onLongTick(city);
        (this.builtOn.values().next().value as Building)?.immediatePowerOn(city);
    }

    override onLongTick(city: City): void {
        this.lastEfficiency = 0;
        const coalPowerPlant = this.builtOn.values().next().value as CoalPowerPlant;
        if (!coalPowerPlant) return;

        //First, calculate how much the power plant needs in order to run for a whole long tick. (That part is obvious; the complication is you have to consider how much coal it has NOW.)
        const neededAmount = Math.min(coalPowerPlant.inputResources[0].consumptionRate * 2, coalPowerPlant.inputResources[0].consumptionRate * 2 - coalPowerPlant.inputResources[0].amount);
        this.lastEfficiency = 1;
        if (neededAmount <= 0) return;

        //Spend the resources/flunds as needed and allowed, then put the coal into the power plant.
        const affordableFraction = Math.min(this.damagedEfficiency, city.calculateAffordablePortion([{ type: "coal", amount: neededAmount }], false));
        this.lastEfficiency = affordableFraction;
        const coalToGrant = neededAmount * affordableFraction;
        city.checkAndSpendResources([{ type: "coal", amount: coalToGrant }], false);
        coalPowerPlant.inputResources[0].produce(coalToGrant);
    }
}

export class NuclearPowerPlant extends Building {
    constructor() {
        super(
            "nuclearpowerplant", "Nuclear Power Plant", "A perfectly safe facility where we convince atoms to break up for our benefit. The ominous green glow is just for ambiance, we promise! Comes with a \"Days Since Last Incident\" sign that's always suspiciously at zero.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.2,
            true,
        );
        this.inputResources.push(new Uranium(0, 0, 1, 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important. This input cost is counted much like upkeep.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.stampFootprint[2][1] = FootprintType.NUCLEAR_PLANT;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, 0.05, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.LandValue, -0.05)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 4500 }, { type: "concrete", amount: 40 }, { type: "steel", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 45 * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number {
        //Show the unpowered warning if it's going to run out soon. Note: this is called right after the loop that sets powered = true for buildings that have enough power.
        if (!ideal && this.inputResources[0].amount <= 4 && city.getBuildingsInArea(this.x, this.y, this.width, this.height, 0, 0).size === 1) this.powered = false;
        return (ideal ? 1 : this.lastEfficiency) * 950 * (1 + 0.2 * city.techManager.getAdoption("thermalrecovery"));
    }
}

export class NuclearFuelTruck extends Building {
    constructor() {
        super(
            "nuclearfueltruck", "Nuclear Fuel Truck", "A truck that keeps your nuclear power plant running as long as there's uranium in storage or on the market (and you can afford it). Good for preventing blackouts when you're on vacation.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
            true,
        );
        this.needsRoad = this.needsPower = false;
        this.checkFootprint[0][0] = FootprintType.NUCLEAR_PLANT; //Must be placed on the bottom-left tile of a nuclear power plant
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 180 }, { type: "concrete", amount: 5 }, { type: "steel", amount: 5 }]; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return [{ type: "flunds", amount: 2.5 * (atEfficiency || city.resources.get(getResourceType(PowerCosts))!.amount) }]; }

    override placed(city: City) {
        this.onLongTick(city);
        (this.builtOn.values().next().value as Building)?.immediatePowerOn(city);
    }

    override onLongTick(city: City): void {
        this.lastEfficiency = 0;
        const nuclearPowerPlant = this.builtOn.values().next().value as NuclearPowerPlant;
        if (!nuclearPowerPlant) return;

        //First, calculate how much the power plant needs in order to run for a whole long tick. (That part is obvious; the complication is you have to consider how much uranium it has NOW.)
        const neededAmount = Math.min(nuclearPowerPlant.inputResources[0].consumptionRate * 2, nuclearPowerPlant.inputResources[0].consumptionRate * 2 - nuclearPowerPlant.inputResources[0].amount);
        this.lastEfficiency = 1;
        if (neededAmount <= 0) return;

        //Spend the resources/flunds as needed and allowed, then put the uranium into the power plant.
        const affordableFraction = Math.min(this.damagedEfficiency, city.calculateAffordablePortion([{ type: "uranium", amount: neededAmount }], false));
        this.lastEfficiency = affordableFraction;
        const uraniumToGrant = neededAmount * affordableFraction;
        city.checkAndSpendResources([{ type: "uranium", amount: uraniumToGrant }], false);
        nuclearPowerPlant.inputResources[0].produce(uraniumToGrant);
    }
}

export class FusionPowerPlant extends Building {
    constructor() {
        super(
            "fusionpowerplant", "Fusion Power Plant", "The power plant that makes stars jealous by copying their party trick. Creates energy through the power of very, very spicy atoms hugging.",
            BuildingCategory.ENERGY,
            3, 3, 0,
            0.4,
            true,
        );
        this.inputResources.push(new Tritium(0, 0, 1, 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important. This input cost is counted much like upkeep.
        this.stampFootprint[0][2] = FootprintType.FUSION_PLANT; //Allows a Fusion Fuel Truck on its rightmost tile for sustained player absences
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 7000 }, { type: "steel", amount: 50 }, { type: "electronics", amount: 20 }, { type: "lithium", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 84 * (atEfficiency || (this.poweredTimeDuringLongTick * city.resources.get(getResourceType(PowerCosts))!.amount)) }];
    }

    override getPowerProduction(city: City, ideal: boolean = false): number {
        //Show the unpowered warning if it's going to run out soon. Note: this is called right after the loop that sets powered = true for buildings that have enough power.
        //The getBuildingsInArea check is a lazy way to check for a fuel truck.
        if (!ideal && this.inputResources[0].amount <= 4 && city.getBuildingsInArea(this.x, this.y, this.width, this.height, 0, 0).size === 1) this.powered = false;
        return (ideal ? 1 : this.lastEfficiency) * 1800 * (1 + 0.2 * city.techManager.getAdoption("thermalrecovery"));
    }
}

export class FusionFuelTruck extends Building {
    constructor() {
        super(
            "fusionfueltruck", "Fusion Fuel Truck", "A truck that keeps your fusion power plant running as long as there's tritium (and lithium, if it's a breeder reactor) in storage or on the market (and you can afford it). Good for preventing blackouts when you're on vacation.",
            BuildingCategory.ENERGY,
            1, 1, 0,
            0,
            true,
        );
        this.needsRoad = this.needsPower = false;
        this.checkFootprint[0][0] = FootprintType.FUSION_PLANT; //Must be placed on the rightmost tile of a fusion power plant
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 150 }, { type: "steel", amount: 5 }]; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return [{ type: "flunds", amount: 2 * (atEfficiency || city.resources.get(getResourceType(PowerCosts))!.amount) }]; }

    override placed(city: City) {
        this.onLongTick(city);
        (this.builtOn.values().next().value as Building)?.immediatePowerOn(city);
    }

    override onLongTick(city: City): void {
        this.lastEfficiency = 0;
        const fusionPowerPlant = this.builtOn.values().next().value as FusionPowerPlant;
        if (!fusionPowerPlant) return;
        const inputResources = fusionPowerPlant.inputResources;

        //First, calculate how much the power plant needs in order to run for a whole long tick. (That part is obvious; the complication is you have to consider how much tritium/lithium it has NOW.)
        const neededTritium = Math.min(inputResources[0].consumptionRate * 2, inputResources[0].consumptionRate * 2 - inputResources[0].amount);
        const neededLithium = inputResources.length === 1 ? 0 : Math.min(inputResources[1].consumptionRate * 2, inputResources[1].consumptionRate * 2 - inputResources[1].amount);
        this.lastEfficiency = 1;
        if (neededTritium <= 0 && neededLithium <= 0) return;

        //Spend the resources/flunds as needed and allowed, then put the tritium and/or lithium into the power plant.
        const affordableFraction = Math.min(this.damagedEfficiency, city.calculateAffordablePortion([{ type: "tritium", amount: Math.max(0, neededTritium) }, { type: "lithium", amount: Math.max(0, neededLithium) }], false));
        this.lastEfficiency = affordableFraction;
        const grants = [{ type: "tritium", amount: neededTritium * affordableFraction }, { type: "lithium", amount: neededLithium * affordableFraction }];
        city.checkAndSpendResources(grants, false);
        if (grants[0].amount > 0) inputResources[0].produce(grants[0].amount);
        if (grants[1].amount > 0) inputResources[1].produce(grants[1].amount);
    }
}

//# Agriculture
export class TreeFarm extends Building {
    constructor() {
        super(
            "treefarm", "Tree Farm", "Locally sourced wood. Not food. In fact, it's more like a hair farm for bald terrain.",
            BuildingCategory.AGRICULTURE,
            4, 4, 0,
            0.3,
        );
        this.outputResources.push(new Wood(0, 1)); //Very slow growth. Maybe you need some GMO trees. :) NOTE: Production rate gets reset in onLongTick
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, -0.05),
            new EffectDefinition(EffectType.Luxury, 0.05)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 70 }, { type: "wood", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }]; //Never pays itself off, which is bad, but it's the only way to get wood when you hit the purchase limit.
    }

    override onLongTick(city: City): void {
        this.outputResources[0].productionRate = 1 + 0.35 * city.techManager.getAdoption("gmcrops");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }
}

export class Farm extends Building {
    constructor() {
        super(
            "farm", "Farm", "A place where crops are grown. People generally like food.",
            BuildingCategory.AGRICULTURE,
            3, 3, 0,
            0.2,
        );
        this.outputResourceOptions = [Grain, RootVegetables, Apples, Berries, LeafyGreens, Legumes].map(foodType => new foodType(0, 3)); //NOTE: Production rate gets reset in onLongTick
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, -0.02, undefined, true, 3, 3, false)]);
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        if (this.outputResources.length === 0) {
            //TODO: the allowed resource types may depend on the region. Amounts could also differ.
            const foodType = this.outputResourceOptions[Math.floor(Math.random() * this.outputResourceOptions.length)];
            this.outputResources.push(foodType.clone());
        }
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.VeganRetreat.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override onLongTick(city: City): void {
        const drought = city.events.find(p => p.type === "drought");
        const retainingSoil = city.techManager.getAdoption('retainingsoil');
        if (drought) this.upkeepEfficiency *= 0.5 + 0.4 * retainingSoil;

        const coldSnap = city.events.find(p => p.type === "coldsnap");
        if (coldSnap && ["apples", "berries", "legumes"].includes(this.outputResources[0].type)) this.upkeepEfficiency *= 0.5;

        this.outputResources[0].productionRate = 3 + 1 * city.techManager.getAdoption("gmcrops");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 40 }, { type: "wood", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 3; }
}

export class Ranch extends Building {
    constructor() {
        super(
            "ranch", "Ranch", "A place where animals are raised for food. It's a farm, but the food walks around on its own, and that makes some people sad.",
            BuildingCategory.AGRICULTURE, //it's questionable, but we'll go with this for now.
            4, 4, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.outputResourceOptions = [RedMeat, Poultry, Dairy].map(foodType => new foodType(0, 4)); //NOTE: Production rate gets reset in onLongTick
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, 0.1)]);
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.Carnivorism.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        if (this.outputResources.length === 0) {
            const foodType = this.outputResourceOptions[Math.floor(Math.random() * this.outputResourceOptions.length)];
            this.outputResources.push(foodType.clone());
        }
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 80 }, { type: "wood", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: (1.5 + city.techManager.getAdoption('incubators')) * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * (2 + 12 * city.techManager.getAdoption('incubators')); }

    override onLongTick(city: City): void {
        this.outputResources[0].productionRate = 4 + 2 * city.techManager.getAdoption("incubators");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }
}

export class AlgaeFarm extends Building {
    constructor() {
        super(
            "algaefarm", "Algae Farm", "A liquid farm that grows algae, the most sustainable source of Vitamin B12. It kinda looks like a spilled smoothie...",
            BuildingCategory.AGRICULTURE,
            3, 3, 0,
            0,
        );
        this.outputResources.push(new VitaminB12(0, 3)); //NOTE: Production rate gets reset in onLongTick
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, -0.05)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 40 }, { type: "stone", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }

    override onLongTick(city: City): void {
        this.outputResources[0].productionRate = 3 + 1 * city.techManager.getAdoption("gmcrops");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }
}

export class FishFarm extends Building {
    constructor() {
        super(
            "FishFarm", "Fish Farm", "A farm that grows fish. It's like a fish tank, but with more fish and less tank...and--let's be frank--more stank.",
            BuildingCategory.AGRICULTURE,
            3, 3, 0,
            0.1,
        );
        this.outputResources.push(new Fish(0, 3)); //NOTE: Production rate gets reset in onLongTick
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, 0.1)]); //Still less than a ranch since the footprint is smaller
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.Carnivorism.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 100 }, { type: "wood", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: (2 + 1 * city.techManager.getAdoption('incubators')) * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * (4 + 8 * city.techManager.getAdoption('incubators')); }

    override onLongTick(city: City): void {
        this.outputResources[0].productionRate = 3 + 1 * city.techManager.getAdoption("incubators");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }
}

export class PlantMilkPlant extends Building {
    constructor() {
        super(
            "plantmilkplant", "Plant Milk Plant", "A plant that produces plant-based dairy. Plants don't grow plants, so you gotta plant the plants on a farm and then pop the produce into this puppy. Doesn't pollute, unlike a ranch--mmm, smell that fresh dairy air.",
            BuildingCategory.AGRICULTURE,
            2, 2, 0,
            0.3,
        );
        this.inputResources.push(new Grain(0, 0, 2));
        this.outputResources.push(new PlantBasedDairy(0, 1));
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.VeganRetreat.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 175 }, { type: "wood", amount: 10 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }
}

export class VerticalFarm extends Building {
    constructor() {
        super(
            "verticalfarm", "Vertical Farm", "A farm that grows crops in a vertical arrangement. It's like a skyscraper, but with more dirt, so I guess it's really more like a ground-scraper.",
            BuildingCategory.AGRICULTURE,
            2, 2, 0,
            0.2,
            true,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.outputResourceOptions = [Grain, RootVegetables, Berries, LeafyGreens, Legumes].map(foodType => new foodType(0, 5)); //NOTE: Production rate gets reset in onLongTick
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, -0.04)]);
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        if (this.outputResources.length === 0) {
            const foodType = this.outputResourceOptions[Math.floor(Math.random() * this.outputResourceOptions.length)];
            this.outputResources.push(foodType);
        }
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.VeganRetreat.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override onLongTick(city: City): void {
        const drought = city.events.find(p => p.type === "drought");
        const retainingSoil = city.techManager.getAdoption('retainingsoil');
        if (drought) this.upkeepEfficiency *= 0.6 + 0.33 * retainingSoil;

        const coldSnap = city.events.find(p => p.type === "coldsnap");
        if (coldSnap && ["berries", "legumes"].includes(this.outputResources[0].type)) this.upkeepEfficiency *= 0.6;

        this.outputResources[0].productionRate = 5 + 1.67 * city.techManager.getAdoption("gmcrops");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 150 }, { type: "wood", amount: 15 }, { type: "steel", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class Carnicultivator extends Building {
    constructor() {
        super(
            "carnicultivator", "Carnicultivator", "Cultivates a crop for the carnivore. Produces perfectly palatable pork in a petri...plate.",
            BuildingCategory.AGRICULTURE, //it's questionable, but we'll go with this for now.
            2, 2, 0,
            0.3,
            true,
        );
        this.outputResources.push(new LabGrownMeat(0, 3)); //NOTE: Production rate gets reset in onLongTick
    }

    override getEfficiencyEffectMultiplier(city: City): number {
        return (city.titles.get(TitleTypes.Carnivorism.id)?.attained ? 0.05 : 0) + super.getEfficiencyEffectMultiplier(city);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 650 }, { type: "wood", amount: 20 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: (3 + 1.5 * city.techManager.getAdoption('incubators')) * (atEfficiency || this.poweredTimeDuringLongTick) }];  // Example upkeep: efficiency multiplier if the population is low or the power is off
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * (6 + 8 * city.techManager.getAdoption('incubators')); }

    override onLongTick(city: City): void {
        this.outputResources[0].productionRate = 3 + 1 * city.techManager.getAdoption("incubators");
        this.outputResources[0].capacity = Math.max(this.outputResources[0].capacity, this.outputResources[0].amount * CAPACITY_MULTIPLIER);
        super.onLongTick(city);
    }
}

//# Industrial
export class MountainIronMine extends Building {
    constructor() {
        super(
            "mountainironmine", "Iron Mine", "Where we convince mountains to share their metal collection. Must be built on the eastern foothills of iron-rich mountains because, surprisingly, sand mountains just don't cut it.",
            BuildingCategory.INDUSTRIAL,
            1, 2, 0,
            0.1,
        );
        this.checkFootprint[0][0] = FootprintType.MINE;
        this.checkFootprint[1][0] = FootprintType.MINE;
        this.needsPower = false;
        this.outputResources.push(new Iron(0, 2)); //Makes a small amount of iron a day
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 30 }, { type: "wood", amount: 5 }]; //Cheap 'cuz it's early-game and there's only one place to put it
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.25 * (atEfficiency || this.poweredTimeDuringLongTick) }]; //Very cheap to upkeep
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.2 + super.getEfficiencyEffectMultiplier(city); }
}

export class Quarry extends Building {
    constructor() {
        super(
            "quarry", "Quarry", "A place where stone is mined, turning perfectly good cliffs into perfectly good rubble. It looks funny, but don't think about it too much.",
            BuildingCategory.INDUSTRIAL,
            4, 4, 0,
            0,
        );
        this.stores.push(new Stone());
        this.storeAmount = 3; //Stores 3 stone so the player doesn't need a warehouse before they can use Cement Mill.
        this.needsPower = false;
        this.outputResources.push(new Stone(0, 1.5));
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);

        for (let resource of this.stores) {
            const cityResource = city.resources.get(resource.type);
            if (cityResource) cityResource.capacity += this.storeAmount;
            else city.resources.set(resource.type, resource.clone({ capacity: this.storeAmount })); //Note: the city should have all resources from the start
        }
    }

    override remove(city: City, justMoving: boolean = false): void {
        for (let resource of this.stores) {
            const cityResource = city.resources.get(resource.type);
            if (cityResource) cityResource.capacity -= this.storeAmount;
        }
        super.remove(city, justMoving);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        const costs = [{ type: "flunds", amount: 100 }];
        if (city.presentBuildingCount.get(this.type)) costs.push({ type: "iron", amount: 20 }); //Costs more if you already own one
        return costs;
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class CementMill extends Building {
    constructor() {
        super(
            "cementmill", "Cement Mill", "A mill that produces cement from stone for all your concrete needs. I mean, your needs for concrete, not your needs that are concrete.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.3,
        );
        this.inputResources.push(new Stone(0, 0, 1));
        this.outputResources.push(new Concrete(0, 3.5));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 40 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class ShaftCoalMine extends Building {
    constructor() {
        super(
            "shaftcoalmine", "Shaft Coal Mine", "Thanks to quantum tunneling technology, this mine can access coal from parallel universes where your city is nothing but coal. Side effects may include occasional dimensional rifts and coal that tastes suspiciously like chicken. Okay, no, that's all a lie, but this vertical coal mine *can* be placed anywhere.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.3,
            true,
        );
        this.outputResources.push(new Coal(0, 1.25));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 120 }, { type: "steel", amount: 8 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class VerticalCopperMine extends Building {
    constructor() {
        super(
            "verticalcoppermine", "Copper Mine", "A vertical bore machine that seeks copper wherever it may be found--namely, underground. Can be placed roughly anywhere except, y'know, in the air.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.3,
            true,
        );
        this.outputResources.push(new Copper(0, 1.5));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 150 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class SandCollector extends Building {
    constructor() {
        super(
            "sandcollector", "Sand Collector", "A mechanical beast with an insatiable appetite for tiny rock particles. If your children's sandbox goes missing, we deny any involvement. Must be built on a sandy area.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0,
        );
        this.outputResources.push(new Sand(0, 2.5));
        this.checkFootprint[0][0] = this.checkFootprint[1][0] = this.checkFootprint[0][1] = this.checkFootprint[1][1] = FootprintType.SAND;
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 50 }, { type: "iron", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }
}

export class Glassworks extends Building {
    constructor() {
        super(
            "glassworks", "Glassworks", "A factory that produces glass from sand. It output is in high demand, yet its input is rather bland.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.5,
        );
        this.inputResources.push(new Sand(0, 0, 1.5));
        this.outputResources.push(new Glass(0, 2));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 70 }, { type: "iron", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class SiliconRefinery extends Building {
    constructor() {
        super(
            "siliconrefinery", "Silicon Refinery", "A factory that turns sand into silicon. It uses really expensive ovens to remove the gold color from tiny rock grains, and that somehow makes the sand worth more. Weird.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.5
        );
        this.inputResources.push(new Sand(0, 0, 1.75));
        this.outputResources.push(new Silicon(0, 1.25));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.05, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 90 }, { type: "concrete", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.25 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class CrystalMine extends Building {
    constructor() {
        super(
            "crystalmine", "Crystal Mine", "Produces gemstones. The shiny ones are mine! Must be placed on the right corner of a crystal mountain.",
            BuildingCategory.INDUSTRIAL,
            1, 1, 0,
            0.1,
        );
        this.checkFootprint[0][0] = FootprintType.GEM_MINE;
        this.needsPower = false;
        this.outputResources.push(new Gemstones(0, 0.5)); //Produces a tiny amount of gemstones a day.
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 180 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.75 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.2 + super.getEfficiencyEffectMultiplier(city); }
}

export class AssemblyHouse extends Building {
    constructor() {
        super(
            "assemblyhouse", "Assembly House", "A factory where copper and silicon have awkward first dates that result in electronics.",
            BuildingCategory.INDUSTRIAL,
            3, 3, 0,
            0.35,
        );
        this.inputResources.push(new Copper(0, 0, 1));
        this.inputResources.push(new Silicon(0, 0, 1));
        this.outputResources.push(new Electronics(0, 2));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 370 }, { type: "concrete", amount: 15 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.75 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }
}

export class OilDerrick extends Building {
    constructor() {
        super(
            "oilderrick", "Oil Derrick", "A derrick that pumps oil from beneath the soil. Keep it well-oiled, and it'll keep you well-oiled. Must be built on a natural oil seep.",
            BuildingCategory.INDUSTRIAL,
            1, 1, 0,
            0.5,
        );
        this.checkFootprint[0][0] = FootprintType.OIL_WELL;
        this.outputResources.push(new Oil(0, 1));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 130 }, { type: "iron", amount: 5 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 2; }
}

export class TextileMill extends Building {
    constructor() {
        super(
            "textilemill", "Textile Mill", "A place that convinces trees they'd look better as t-shirts...by crushing, dissolving, filtering, spinning, and weaving it. That sounds somewhat horrific, now that I spell it out.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.35,
        );
        this.inputResources.push(new Wood(0, 0, 0.25));
        this.outputResources.push(new Textiles(0, 1.25));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Noise, 0.05, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 200 }, { type: "wood", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.75 * (atEfficiency || this.poweredTimeDuringLongTick) }]; //Pretty cheap--it's a factory, so it makes its own money
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class ApparelFactory extends Building {
    constructor() {
        super(
            "apparelfactory", "Apparel Factory", "A factory that produces clothing from textiles. It supports public decency...and the economy.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.35,
        );
        this.inputResources.push(new Textiles(0, 0, 1));
        this.outputResources.push(new Clothing(0, 0.5)); //Trying to kinda balance with the minigame that uses it
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.02, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 200 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 0.5 * (atEfficiency || this.poweredTimeDuringLongTick) }]; //Pretty cheap--it's a factory, so it makes its own money
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class SteelMill extends Building {
    constructor() {
        super(
            "steelmill", "Steel Mill", "A mill that produces steel from iron. Behold a bakery bearing bread that breaks bricks.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.5,
        );
        this.inputResources.push(new Iron(0, 0, 1.5));
        this.outputResources.push(new Steel(0, 1.75));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.1, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.Noise, 0.05, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 300 }, { type: "concrete", amount: 20 }, { type: "iron", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.25 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 7; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class PlasticsFactory extends Building {
    constructor() {
        super(
            "plasticsfactory", "Plastics Factory", "A factory that produces plastics from oil and wood. It's like a toy factory, but...well, no, it's a factory that fuels toy factories. It also doesn't smell great and is surprisingly loud.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.4,
        );
        this.inputResources.push(new Oil(0, 0, 0.25));
        this.inputResources.push(new Wood(0, 0, 0.5));
        this.outputResources.push(new Plastics(0, 2));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.1, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.Noise, 0.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 350 }, { type: "steel", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 8; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class ToyManufacturer extends Building {
    constructor() {
        super(
            "toymanufacturer", "Toy Manufacturer", "A factory that produces toys from plastics and electronics. It's a bit noisy. The company's core values are \"flunds for me but not for thee\" and \"fun for thee but not for me.\"",
            BuildingCategory.INDUSTRIAL,
            3, 3, 0,
            0.3,
        );
        this.inputResources.push(new Plastics(0, 0, 1));
        this.inputResources.push(new Electronics(0, 0, 0.25));
        this.outputResources.push(new Toys(0, 2.5)); //TODO: Reduce this if you make a "toy distribution" minigame (for happiness boost) as mentioned in the design doc. It's only this high to make the factory a net flunds gain.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Noise, 0.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 280 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class Furnifactory extends Building {
    constructor() {
        super(
            "furnifactory", "Furnifactory", "Craftsmen turn wood and plastics into furniture here, ensuring that citizens never run out of things to stub their toes on in the middle of the night. The constant power tool symphony ensures your neighbors will develop a newfound appreciation for mime performances.",
            BuildingCategory.INDUSTRIAL,
            3, 3, 0,
            0.3,
        );
        this.inputResources.push(new Wood(0, 0, 1));
        this.inputResources.push(new Plastics(0, 0, 0.5));
        this.outputResources.push(new Furniture(0, 1));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Noise, 0.15, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 320 }, { type: "wood", amount: 35 }, { type: "steel", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class LithiumMine extends Building {
    constructor() {
        super(
            "lithiummine", "Lithium Mine", "A mine that produces lithium, the lifeblood of batteries. It's a little noisy, but it's worth it for the mobile gaming.",
            BuildingCategory.INDUSTRIAL,
            3, 3, 0,
            0.1,
        );
        this.checkFootprint[0][0] = this.checkFootprint[0][1] = this.checkFootprint[0][2] = this.checkFootprint[1][0] = this.checkFootprint[1][1] = this.checkFootprint[1][2] = this.checkFootprint[2][0] = this.checkFootprint[2][1] = this.checkFootprint[2][2] = FootprintType.LITHIUM_MINE;
        this.needsPower = false;
        this.outputResources.push(new Lithium(0, 1.5));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.05, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.Noise, 0.3, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 620 }, { type: "iron", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class MohoMine extends Building {
    constructor() {
        super(
            "mohomine", "Moho Mine", "A mine that gathers iron, silicon, and copper from deep in the planet. It takes quite the initial investment, though not as much as asteroid mining (nor is it anywhere near as cool).",
            BuildingCategory.INDUSTRIAL,
            4, 4, 0,
            0.3,
            true,
        );
        this.outputResources.push(new Iron(0, 3));
        this.outputResources.push(new Silicon(0, 1));
        this.outputResources.push(new Copper(0, 0.75));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Noise, 0.2, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1600 }, { type: "steel", amount: 40 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class Nanogigafactory extends Building {
    constructor() {
        super(
            "nanogigafactory", "Nanogigafactory", "A factory that produces electric vehicle batteries from lithium, copper, and plastics. The process isn't great for the environment, but it's far more efficient and sustainable than ICEs. In other words... Sure, we mine the Earth like there's no tomorrow, but hey, at least there might be a tomorrow!",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.5,
        );
        this.inputResources.push(new Lithium(0, 0, 0.75)); //NOTE: gets reset every frame in onLongTick.
        this.inputResources.push(new Copper(0, 0, 0.5));
        this.inputResources.push(new Plastics(0, 0, 0.5));
        this.outputResources.push(new Batteries(0, 1));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 400 }, { type: "steel", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1.5 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 10; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }

    override onLongTick(city: City): void {
        this.inputResources.find(p => p.type === 'lithium')!.consumptionRate = 0.75 - 0.375 * city.techManager.getAdoption('graphenebattery');
        super.onLongTick(city);
    }
}

export class PharmaceuticalsLab extends Building {
    constructor() {
        super(
            "pharmaceuticalslab", "Pharmaceuticals Lab", "A lab where smart people in white coats turn science into things that make you feel better, usually with names nobody can pronounce. Not quite a farm--I see.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.35,
        );
        this.outputResources.push(new Pharmaceuticals(0, 2.5));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 550 }, { type: "steel", amount: 15 }, { type: "glass", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 3 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 18; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

export class SpaceLaunchSite extends Building {
    constructor() {
        super(
            "spacelaunchsite", "Space Launch Site", "Prospecting in the final frontier: each space launch site can be set to mine iron, copper, lithium, or uranium from asteroids. They're quite loud and polluting, but the view is out of this world...though only the operators get to enjoy it.",
            BuildingCategory.INDUSTRIAL,
            3, 3, 0,
            0.3,
        );
        this.outputResourceOptions = [new Iron(0, 9.5), new Copper(0, 7), new Lithium(0, 3.5), new Uranium(0, 2.5)]; //TODO: Other options to consider: space tourism to rake in the flunds, asteroid crashing for a chance of damage to nearby structures but higher returns that always include stone
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.ParticulatePollution, 0.2, "dynamicEffectByEfficiencyAndHydrolox"),
            new EffectDefinition(EffectType.GreenhouseGases, 0.15, "dynamicEffectByEfficiencyAndHydrolox"),
            new EffectDefinition(EffectType.Noise, 0.3, "dynamicEffectByEfficiency")]);
    }

    public dynamicEffectByEfficiencyAndHydrolox(city: City, building: Building | null, x: number, y: number): number {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 - city.techManager.getAdoption("hydrolox"));
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        if (this.outputResources.length === 0) {
            //If the city has uranium storage, choose that. Otherwise, default to lithium.
            if (city.resources.get("uranium")?.capacity) this.outputResources.push(this.outputResourceOptions.find(p => p.type === "uranium")!);
            else this.outputResources.push(this.outputResourceOptions.find(p => p.type === "lithium")!);
        }
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 11000 }, { type: "steel", amount: 30 }, { type: "electronics", amount: 40 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 7 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 7; }

    override getEfficiencyEffectMultiplier(city: City): number { return city.techManager.getAdoption("advrobots") * 0.1 + super.getEfficiencyEffectMultiplier(city); }
}

//Seasonal industries
export class MiracleWorkshop extends Building {
    constructor() {
        super(
            "miracleworkshop", "Miracle Workshop", "Produces special gifts that you can give to a friend, using only hopes, dreams, wintry magic, and a few megawatts as ingredients. Brain Brews increase research point gains by 10%. Glee Grenades directly add 1% to happiness. Turbo Tonics increase factory output by 5%. Each effect lasts for 5 days. Use them via the gift button in the right bar when visiting a friend's city.",
            BuildingCategory.INDUSTRIAL,
            2, 2, 0,
            0.2,
            true,
        );
        this.outputResourceOptions = [new BrainBrews(0, 0.25), new GleeGrenades(0, 0.25), new TurboTonics(0, 0.25)];
        this.stores.push(...this.outputResourceOptions);
        this.storeAmount = 5;
    }

    override place(city: City, x: number, y: number): void { //Pick a random output resource if none is set
        super.place(city, x, y);
        if (this.outputResources.length === 0) {
            const foodType = this.outputResourceOptions[Math.floor(Math.random() * this.outputResourceOptions.length)];
            this.outputResources.push(foodType.clone());
        }
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 120 + 1200 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "wood", amount: 20 }, { type: "iron", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 3; }

    //No upkeep cost because it's already kind of a negative for the player that owns it.
}
//End of seasonal industries

//# Commercial
export class CornerStore extends Building {
    constructor() {
        super(
            "cornerstore", "Corner Store", "The architectural equivalent of a college student's ramen dinner--cheap and basic, but it gets the job done. The fake brick exterior is fooling absolutely nobody, but we've committed to the bit.",
            BuildingCategory.COMMERCIAL,
            1, 1, 0,
            0.15,
        );
        this.setBusinessValue(50, 0.55);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.05, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 40 }, { type: "wood", amount: 5 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }
}

export class Junkyard extends Building {
    constructor() {
        super(
            "junkyard", "Junkyard", "A place where people can buy and sell used goods. Yes, that refrigerator is vintage, and no, that rust is not load-bearing. It makes the area a little trashy, but it's a living.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
        );
        this.setBusinessValue(150, 0.65); //Higher because of the negative luxury effect and greater space requirement
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.1, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.Luxury, -0.25, undefined, undefined, -1, -1)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 50 }, { type: "wood", amount: 5 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 2; }
}

export class SuckasCandy extends Building {
    constructor() {
        super(
            "suckascandy", "Suckas Candy", "A candy store that sells candy. It's a sweet deal for suckas.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.3,
        );
        this.setBusinessValue(140, 0.6);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.15, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 90 }, { type: "wood", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 3; }
}

export class Cafe extends Building {
    constructor() {
        super(
            "cafe", "Cafe", "A place where people drink coffee and eat pastries. It's a good place to meet up with friends and pretend to be productive.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4,
        );
        this.setBusinessValue(150, 0.65);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 160 }, { type: "wood", amount: 25 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class TheLoadedDie extends Building {
    constructor() {
        super(
            "theloadeddie", "The Loaded Die", "Step into The Loaded Die, where we specialize in turning \"I'm bored\" into \"I'm bankrupt from impulse buying board games with rules I can't wrap my head around.\" This friendly local game shop specializes in converting citizens' flunds into colorful bits of cardboard and plastic that ruin their friendships.",
            BuildingCategory.COMMERCIAL,
            2, 2, -3,
            0.3,
        );
        this.setBusinessValue(260, 0.65);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 320 }, { type: "wood", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class Cinema extends Building {
    constructor() {
        super(
            "cinema", "Plot Hole Cinema", "A dark cave where people pay extra to watch things they could see at home in two months, but with the bonus of getting to listen to strangers chew. Features seats that are slightly sticky for reasons nobody wants to investigate and floors with the unique texture of 40 years of spilled soda and popcorn. A relatively weak earner despite snacks having 1100% markup, but it takes a lot of patrons on a journey through someone else's trope-dense dreams every day.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.2,
        );
        this.setBusinessValue(430, 0.68); //Worth less for the space compared to The Loaded Die
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.15, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 560 }, { type: "wood", amount: 25 }, { type: "textiles", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 7; }
}

export class Whalemart extends Building {
    constructor() {
        super(
            "whalemart", "Whalemart", "A supermarket where citizens go to krill time, since the checkout lines are longer than a whale's migratory path. They come for the blowhole-sized discounts and stay because they got lost somewhere between the plankton-flavored protein bars and the suspiciously fresh seafood section.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.3,
        );
        this.setBusinessValue(510, 0.65);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.15, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 640 }, { type: "wood", amount: 35 }, { type: "glass", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 9; }
}

export class Bar extends Building {
    constructor() {
        super(
            "bar", "Bar", "A place where people drink when they'd rather not think. Patrons have a tendency to vandalize the area and harass strangers because of the not-thinking.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4
        );
        this.setBusinessValue(250, 0.68); //A bit higher due to the crime effect
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.PettyCrime, 0.15, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 140 }, { type: "wood", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }
}

export class PalmNomNom extends Building {
    constructor() {
        super(
            "palmnomnom", "Palm Nom Nom", "A place to go to leaf your worries behind. Tourists are particularly frond of this restaurant and gift shop.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4,
        );
        this.setBusinessValue(180, 0.7); //Reduced due to the tourism (free patronage)
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.outputResources.push(new Tourists(1.25, 1.25, 0, 50)); //Brings in 50 tourists per long tick, but it takes 10 days to get up to full steam (50/LONG_TICKS_PER_DAY/10).
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 270 }, { type: "wood", amount: 20 }, { type: "sand", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }
}

export class GregsGrogBarr extends Building {
    constructor() {
        super(
            "gregsgrogbarr", "Greg's Grog B'Arr", "Where landlubbers and sea dogs alike come to get ship-faced. Our peanuts are as salty as an old captain's vocabulary. Pirate-wannabe patrons aren't particularly organized, but they do perpetrate some crime of various sorts.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4,
        );
        this.setBusinessValue(270, 0.75);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.PettyCrime, 0.2, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.OrganizedCrime, 0.05, "dynamicEffectByEfficiency", undefined, -2, -2)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 400 }, { type: "wood", amount: 25 }, { type: "sand", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class IceCreamTruck extends Building {
    constructor() {
        super(
            "icecreamtruck", "Ice Cream Truck", "A truck that sells ice cream. It's neat when you meet one and get to eat sweet treats. Has a wide reach, but it can't handle a lot of customers.",
            BuildingCategory.COMMERCIAL,
            1, 1, 0,
            0.1,
        );
        this.setBusinessValue(80, 0.7);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 9;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.05, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 100 }, { type: "iron", amount: 5 }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return super.getEfficiencyEffectMultiplier(city) + city.techManager.getAdoption("advrobots") * 0.1; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick) }];
    }
}

export class FurnitureStore extends Building {
    constructor() {
        super(
            "furniturestore", "Sit Happens", "A store that sells furniture. Come for the chairs; stay because you can't get back up. We call it 'five more minutes' syndrome. Slightly increases the likelihood of prospective citizens moving into the city, but you have to supply the furniture.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.3,
        );
        this.setBusinessValue(200, 0.9); //Higher due to the fact that it requires resources to operate
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.inputResources.push(new Furniture(0, 0, 0.5));
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 350 }, { type: "wood", amount: 25 }, { type: "glass", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class MaidTwoTeas extends Building {
    constructor() {
        super(
            "maidtwoteas", "Maid Two Teas", "A cleverly disguised economics lesson where patrons learn about inflation via their rapidly thinning wallets. The maids have turned hair-twirling into a business strategy and 'accidentally' dropping things into a competitive sport. Each table comes equipped with a built-in ATM because management knows exactly what they're doing.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4,
        );
        this.setBusinessValue(240, 0.85);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness"),
        new EffectDefinition(EffectType.PettyCrime, 0.1, "dynamicEffectByEfficiency")]);
    }
    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 460 }, { type: "wood", amount: 25 }, { type: "glass", amount: 10 }, { type: "clothing", amount: 10 }];
    }
    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class SauceCode extends Building {
    constructor() {
        super(
            "saucecode", "Sauce Code", "A robot-hosted pizza diner. The robots are programmed to be friendly, but they're not very good at it (neither are humans, though). At least they don't judge you for ordering pineapple--they just silently log it in their 'Human Peculiarities' database. Complaints do not compute.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.4,
        );
        this.setBusinessValue(310, 0.8);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness")]);
    }
    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 490 }, { type: "wood", amount: 20 }, { type: "electronics", amount: 15 }, { type: "batteries", amount: 5 }];
    }
    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 9; }
}

export class Casino extends Building {
    constructor() {
        super(
            "casino", "Casino", "A place where people gamble their money away. It's a tax on the statistically challenged.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.4,
        );
        this.setBusinessValue(400, 1.3); //Higher due to the crime effect and size
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.OrganizedCrime, 0.2, "dynamicEffectByEfficiency", undefined, -1, -1)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: city.presentBuildingCount.get("casino") ? 890 : 390 }, { type: "wood", amount: 35 }, { type: "gemstones", amount: 10 }]; //Cheaper for the first one just so you can unlock Slots sooner.
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }
}

export class CartersCars extends Building {
    constructor() {
        super(
            "carterscars", "Carter's Cars", "A dealership managed by your run-of-the-mill eccentric whose laugh sounds just like 'carcarcar.' Watch in amazement as salespeople perform their ancient ritual of turning 'catastrophic engine failure' into 'quirky personality' and 'rust damage' into 'vintage charm.' The complimentary water bottles are actually tears from previous customers. If you research Autonomous Vehicles, each dealership increases the adoption growth rate by 30%.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.4,
        );
        this.setBusinessValue(440, 0.9);
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 700 }, { type: "concrete", amount: 30 }, { type: "steel", amount: 20 }, { type: "glass", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class GameDevStudio extends Building {
    constructor() {
        super(
            "gamedevstudio", "Game Dev Studio", "A place where ideas go to become monetized. Work here is a lifeline built on deadlines. Sales aren't limited to within the city, and it also produces apps. However, each copy competes for revenue--if you build more than three or four, you're just wasting your flunds.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.3,
        );
        this.outputResources.push(new Apps(0, 0.25));
        this.businessPatronCap = -1; //Infinite patron cap. Produces a fraction of the population worth of value with diminishing returns.
        this.businessValue = 300; //Increased it because it isn't worth the space otherwise
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.3, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 700 }, { type: "steel", amount: 30 }, { type: "electronics", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 16; }
}

export class BlankCheckBank extends Building {
    constructor() {
        super(
            "blankcheckbank", "Blank Check Bank", "A towering temple of marble and money, where dreams come with interest rates and savings come with sighs. Our vault doors are heavy, our columns are tall, and our pens are chained down because someone's got trust issues. The fancy marble floors are meant to make you feel poor. May lose revenue to embezzling if the area has unchecked organized crime.",
            BuildingCategory.COMMERCIAL,
            2, 2, 0,
            0.3,
        );
        this.businessPatronCap = -1; //Infinite patron cap. Produces a fraction of the population worth of value with diminishing returns.
        this.businessValue = 320; //Likely to be built before Game Dev Studio, but this one spreads crime, so I increased the value a bit
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.3, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.OrganizedCrime, 0.15, "dynamicEffectByEfficiency", undefined, -1, -1)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 980 }, { type: "stone", amount: 25 }, { type: "steel", amount: 15 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 8; }

    override getEfficiencyEffectMultiplier(city: City): number {
        const embezzling = this.x === -1 ? 0 : Math.min(city.getNetOrganizedCrime(this.x, this.y), city.getNetOrganizedCrime(this.x + 1, this.y), city.getNetOrganizedCrime(this.x, this.y + 1), city.getNetOrganizedCrime(this.x + 1, this.y + 1));
        return super.getEfficiencyEffectMultiplier(city) * Math.max(0, 1 - embezzling);
    }
}

export class ResortHotel extends Building {
    constructor() {
        super(
            "resorthotel", "Resort Hotel", "A hotel that offers a luxurious experience. Here, you can pretend you're royalty and avoid your responsibilities, like making your own bed.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.4,
        );
        this.setBusinessValue(650, 1.2); //Reduced just a bit compared to the casino due to the tourists and luxury effect
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(5, 5, 0, 200)); //Brings in 200 tourists per long tick, but it takes 10 days to get up to full steam.
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness"), new EffectDefinition(EffectType.Luxury, 0.1)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1500 }, { type: "steel", amount: 25 }, { type: "glass", amount: 15 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 35; }
}

export class HotSpringInn extends Building {
    constructor() {
        super(
            "hotspringinn", "Hot Spring Inn", "A rustic retreat where you can soak your troubles away, along with one or two layers of skin. Our five-star accommodations perfectly complement nature's own crockpot, balancing comfort and controlled danger. Don't worry: we keep it cool enough that it won't cook people--but we do poach eggs in it for your dinner. Must be built on a Hot Spring.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.3,
        );
        this.setBusinessValue(350, 1.5); //Excessively high because you can only build one anyway.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(6.25, 6.25, 0, 250)); //Brings in 250 tourists per long tick, but it takes 10 days to get up to full steam. Heheh. Steam.
        this.isRestaurant = true;
        this.isEntertainment = true;
        //The weirdest footprint yet: it must fully cover the Hot Spring, but the inn itself (y=0) shouldn't be on top of the hot spring.
        this.checkFootprint[1][0] = this.checkFootprint[1][2] = this.checkFootprint[2][0] = this.checkFootprint[2][2] = FootprintType.HOT_SPRING | FootprintType.EMPTY | FootprintType.RESIDENCE;
        this.checkFootprint[1][1] = this.checkFootprint[2][1] = FootprintType.HOT_SPRING;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness"), new EffectDefinition(EffectType.Luxury, 0.1)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1100 }, { type: "wood", amount: 25 }, { type: "stone", amount: 10 }];
    }

    override placed(city: City): void {
        (this.builtOn.values().next().value as HotSpring).variant = 1; //won't draw anymore since max variant is 0
    }

    override remove(city: City, justMoving: boolean = false): void {
        (this.builtOn.values().next().value as HotSpring).variant = 0; //allowed to draw again (this must be before the call to super.remove)
        super.remove(city, justMoving);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 22; }
}

export class ConventionCenter extends Building {
    constructor() {
        super(
            "conventioncenter", "Convention Center", "This marvel of modern architecture periodically transforms from an empty cavern into a bustling hub of overpriced food and questionable fashion choices. It hosts a few events each year, and its tourism draw temporarily spikes whenever an event begins, because apparently nothing says 'vacation' like choking yourself with a lanyard and paying six flunds for a character-themed cookie you'd rather take a picture of than eat.",
            BuildingCategory.COMMERCIAL,
            3, 3, 0,
            0.4,
        );
        this.setBusinessValue(1600, 0.7); //Changed to an immense patronage count but lower value as a later-game approach to maximizing income by minimizing space
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(3.75, 3.75, 0, 300)); //Brings in 300 tourists per long tick, but it takes 20 days to get up to full steam.
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.maxVariant = 3;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.25, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2200 }, { type: "steel", amount: 30 }, { type: "glass", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 22; }

    pickVariant(city: City): boolean { //Returns true when the variant changes.
        let variant = 0;
        let lastTick = city.lastLongTick;
        if (new Date(lastTick).getMonth() === 9) variant = 1; //Hauntymonth
        if (new Date(lastTick).getMonth() === 10) variant = 3; //Munchymonth
        if (new Date(lastTick).getMonth() === 11) variant = 2; //Giftymonth

        if (this.variant === variant) return false;
        this.variant = variant;
        return true;
    }

    override onLongTick(city: City): void {
        //Convention centers get a boost to the tourism draw at the START of events for a week or two. Events switch at specific times.
        const tourism = this.outputResources.find(p => p.type === "tourists")!;
        if (this.pickVariant(city) && this.variant !== 0) {
            tourism.capacity = 600;
            tourism.produce(tourism.amount); //Double the current tourism amount, but don't go over the new temporary capacity.
        } else if (tourism.capacity > 300) {
            tourism.capacity -= 300 / 14 / LONG_TICKS_PER_DAY; //Takes two weeks to drop back to 300
            tourism.amount = Math.min(tourism.amount, tourism.capacity);
        }
        
        super.onLongTick(city);
    }
}

//Seasonal businesses
export class ChocolateBar extends Building {
    constructor() {
        super(
            "chocolatebar", "Chocolate Bar", "This establishment, built entirely of the finest (and most edible) chocolate, is a monument to excess and bad decisions. It's structurally sound, mostly, although a few nibbles here and there are hard to resist. We strongly advise against licking the walls unless you want to end up in a cocoa coma. This place is such a sweet deal that it'll melt away at the end of the month. Produces chocolate, which you can send to a friend to reduce their food consumption and increase their food gratification by 3% for 5 days. Use chocolate via the gift button in the right bar when visiting a friend's city.",
            BuildingCategory.COMMERCIAL,
            2, 1, 0,
            0.4,
            true
        );
        this.setBusinessValue(190, 0.8); //A bit high since it's seasonal
        this.outputResources.push(new Chocolate(0, 0.25));
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.2, "dynamicEffectForBusiness"),
            new EffectDefinition(EffectType.PettyCrime, 0.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 180 + 1800 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "wood", amount: 20 }, { type: "dairy", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 8; }
}

export class HeartyShack extends Building {
    constructor() {
        super(
            "heartyshack", "Hearty Shack", "A speed-dating site where citizens' romantic hopes go to be processed like a fast-food order. It has all the charm of a dentist's office mixed with the high stakes of a game show. Though it looks like a place to get shacked, it's less \"holy matrimony\" and more \"holy moly, this small talk is awkward.\" It'll cease to exist like my love life at the end of the month.",
            BuildingCategory.COMMERCIAL,
            1, 1, 0,
            0.4,
            true
        );
        this.setBusinessValue(260, 0.75); //A bit high since it's seasonal
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.isEntertainment = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.BusinessPresence, 0.15, "dynamicEffectForBusiness")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 140 + 1400 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "concrete", amount: 15 }, { type: "textiles", amount: 10 }, { type: "glass", amount: 5 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}
//End of seasonal businesses

//# Luxury (Recreation/Decorations)
export class HauntymonthGrave extends Building {
    constructor() {
        super(
            "hauntymonthgrave", "Hauntymonth Grave", "A spooky decoration. Gives people a bit of a shock when they see the hand sticking up. It'll be spirited away at the end of the month.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.1,
            true,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.06)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 20 + 200 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "stone", amount: 3 }];
    }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class HauntymonthLamp extends Building {
    constructor() {
        super(
            "hauntymonthlamp", "Hauntymonth Lamp", "A spooky lamp that lights up with the energy of spirits. Well, it's actually electricity, but anyway... It'll fade from this world at the end of the month.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.2,
            true,
        );
        this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.08)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 25 + 250 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "iron", amount: 5 }];
    }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }
}

export class HauntymonthHouse extends Building {
    constructor() {
        super(
            "hauntymonthhouse", "Hauntymonth House", "Nobody lives here, but it's just the right kind of spooky to get people excited and bring in some tourists. It does need power, though, for the, uh, haunted lights. It'll disappear in true ghostly fashion at the end of the month, so make sure it's not a critical part of your power network.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.25,
            true,
        );
        this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(5, 5, 0, 80)); //Brings in 80 tourists per long tick, and it gets up to full steam in 4 days.
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.15)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 50 + 500 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "wood", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 3; }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class PeppermintPillar extends Building {
    constructor() {
        super(
            "peppermintpillar", "Peppermint Pillar", "A candy cane decoration. Standing tall and proud, contributing absolutely nothing except a visual reminder that it's cold outside. And cold or not, it'll melt away at the end of the month.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.1,
            true,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.12)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 30 + 300 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "iron", amount: 5 }];
    }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class CocoaCupCo extends Building {
    constructor() {
        super(
            "cocoacupco", "Cocoa Cup Co.", "A tiny outpost of sugary salvation, dispensing hope in a cup and economic stimulation by the ounce. Businesses nearby will perk up faster than customers after their third choco-latte thanks to customers' melted inhibitions. It'll dissolve like a marshmallow at the end of the month.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.3,
            true,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.isRestaurant = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.05),
            new EffectDefinition(EffectType.BusinessValue, 0.05)]); //Doesn't affect sorting (for giving more revenue to higher earning businesses), failed business reopening costs, displayed efficiency numbers, or infinibusinesses.
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 90 + 900 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "plastics", amount: 10 }, { type: "stone", amount: 5 }];
    }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class ReindeerRetreat extends Building {
    constructor() {
        super(
            "reindeerretreat", "Reindeer Retreat", "A retreat for seasonally employed ungulates. Precision-aligned hooves, meticulously maintained antlers, and an air of professional pride that suggests these aren't just critters--they're dedicated to the job of spreading joy to the locals. They'll pack up and move out at the end of the month.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.2,
            true,
        );
        this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(4.375, 4.375, 0, 70)); //Brings in 70 tourists per long tick, and it gets up to full steam in 4 days.
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.13)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 45 + 450 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "wood", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 2; }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class WrappedWonder extends Building {
    constructor() {
        super(
            "wrappedwonder", "Wrapped Wonder", "Artificial arbor bedazzled with baubles and bulbs, communicating the dreams of the denizens, elevating the future. The gifts at the hem, however, are imitations, impairing the joy of kids who look at the material from nearby. Ostensibly, parents queried reply with surety that they think it's unproductive to vainly wish for world-famous xylophones to be yielded to youthful zealots...but I digress. Anyway, the presents are fake, and the tree will 'leave' on its own at the end of the month.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.3,
            true,
        );
        this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.25)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 80 + 800 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "wood", amount: 40 }, { type: "glass", amount: 15 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 8; }

    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}

export class FlowerTower extends Building {
    constructor() {
        super(
            "flowertower", "Flower Tower", "A pretty pollen palace with petals perched atop, this monument to floral extravagance stands tall; 'tis an oversized, flamboyant reminder that we all like a little eye candy. It'll wilt away at the end of the month.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.1,
            true,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.15)]);
    }
    override getCosts(city: City): { type: string, amount: number }[] {
        //Costs rise for each copy you've already bought.
        return [{ type: "flunds", amount: 40 + 400 * (city.presentBuildingCount.get(this.type) ?? 0) }, { type: "stone", amount: 5 }, { type: "plastics", amount: 5 }];
    }
    override isPlaceable(city: City): boolean { return super.isPlaceable(city) && !this.locked; } //When it's locked, it can't be placed, even if you have it in inventory.
}
//End of seasonal decorations

export class SmallPark extends Building {
    constructor() {
        super(
            "smallpark", "Small Park", "A small park that makes the block marginally more attractive. Meant for your behind, not your car.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.1,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 3;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.05), new EffectDefinition(EffectType.GreenhouseGases, -0.01)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 30 }]; }
}

export class PenguinSculpture extends Building {
    constructor() {
        super(
            "penguinsculpture", "Penguin Sculpture", "A sculpture of a penguin. Penguins are cool. No relation to any eccentric criminal mastermind.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.25,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.06)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 50 }, { type: "wood", amount: 10 }, { type: "stone", amount: 2 }]; }
}

export class MediumPark extends Building {
    constructor() {
        super(
            "mediumpark", "Medium Park", "A medium park that makes the neighborhood slightly more attractive. Medium not included.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.1,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.1), new EffectDefinition(EffectType.GreenhouseGases, -0.04)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 80 }]; }
}

export class KellyStatue extends Building {
    constructor() {
        super(
            "kellystatue", "Kelly Statue", "A monument to a friend. Local pigeons rate it five stars for comfort and convenience.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.07)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 120 }, { type: "stone", amount: 5 }]; }
}

export class SharonStatue extends Building {
    constructor() {
        super(
            "sharonstatue", "Sharon Statue", "A monument to a mother.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.12)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 180 }, { type: "stone", amount: 5 }]; }
}

export class SmallFountain extends Building {
    constructor() {
        super(
            "smallfountain", "Small Fountain", "A small fountain that makes the area more attractive. The water gets recycled, so no worries.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.09)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 280 }, { type: "stone", amount: 5 }]; }
}

export class Greenhouse extends Building {
    constructor() {
        super(
            "greenhouse", "Greenhouse", "A glass-encrusted sort of farm for decorative purposes. It's neither a house nor green, but it does at least house greenery.",
            BuildingCategory.LUXURY,
            2, 1, 0,
            0.1,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.13), new EffectDefinition(EffectType.GreenhouseGases, -0.05)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 150 }, { type: "glass", amount: 10 }]; }
}

export class CrystalSpire extends Building {
    constructor() {
        super(
            "crystalspire", "Crystal Spire", "A transparent testament to the city's love affair with geometric shapes, catching sunlight and redistributing it directly into drivers' eyes with democratic fairness. The stone base adds that perfect touch of \"we ran out of crystal budget.\" On cloudy days, it's just an expensive lightning rod with delusions of grandeur.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0.18,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.18)]);
    }
    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 250 }, { type: "gemstones", amount: 10 }, { type: "stone", amount: 5 }]; }
}

export class Playground extends Building {
    constructor() {
        super(
            "playground", "Playground", "A place for future politicians learn to climb ladders and sling mud without getting caught. May cause unexpected alliances and sandbox coups. Okay, that's a lie; its only effect is increased luxury.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.1,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.2)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 210 }, { type: "plastics", amount: 10 }]; }
}

export class UrbanCampDome extends Building {
    constructor() {
        super(
            "urbancampdome", "Urban Camp Dome", "Welcome to the great indoors, where nature meets nurture under climate-controlled conditions! It's like someone took a forest, gave it a roof, and convinced urban professionals they're \"roughing it\" despite having Wi-Fi and barista-made coffee within arm's reach. Watch as city dwellers proudly pitch their designer tents on perfectly level ground while real squirrels judge them from carefully manicured branches. But hey, at least you won't get eaten by bears.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.2,
        );
        this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 7;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.18)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 240 }, { type: "glass", amount: 30 }, { type: "plastics", amount: 5 }]; }
}

export class FlippinFun extends Building {
    constructor() {
        super(
            "flippinfun", "Flippin' Fun", "A small pinball arcade, enclosed in glass to produce as many arcade addicts as possible. Not lucrative enough to qualify as a business, but a popular attraction for all (okay, most) ages nonetheless. High scores are recorded with 3-letter names to minimize opportunity for teenagers' favorite kind of words.",
            BuildingCategory.LUXURY,
            2, 1, 0,
            0.2,
        );
        this.needsRoad = false; //DOES need power, unlike most luxury buildings.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 7;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.15)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 250 }, { type: "glass", amount: 10 }, { type: "electronics", amount: 5 }]; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 3; }

    override onLongTick(city: City): void {
        this.upkeepEfficiency = city.events.find(p => p.type === "drought") ? 0 : 1;
        super.onLongTick(city);
    }
}

export class H2Whoa extends Building { //Light-up water jets, just a local luxury
    constructor() {
        super(
            "h2whoa", "H2Whoa", "A glorified sprinkler system masquerading as public art. Watch as children and inebriated adults alike try to predict the pattern of the water jets and fail spectacularly. Disabled during droughts.",
            BuildingCategory.LUXURY,
            1, 1, 0,
            0,
        );
        this.needsRoad = false; //DOES need power, unlike most luxury buildings.
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.13)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 370 }, { type: "concrete", amount: 5 }, { type: "electronics", amount: 1 }]; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 2; }

    override onLongTick(city: City): void {
        this.upkeepEfficiency = city.events.find(p => p.type === "drought") ? 0 : 1;
        super.onLongTick(city);
    }
}

export class SesharTower extends Building {
    constructor() {
        super(
            "seshartower", "Seshar Tower", "A tower erected in honor of Seshar... aaand to attract tourists. Come see the tower that answers the question, \"What if we built something really tall and slapped the name 'Seshar' on it?\" ...Okay, yes, it's mainly to attract tourists. Requires a road, unlike most Luxury structures.",
            BuildingCategory.LUXURY,
            3, 3, 0,
            0.2,
        );
        this.outputResources.push(new Tourists(7.5, 7.5, 0, 150)); //The tower can only bring in 150 tourists per long tick, and it takes 2.5 days to get up to full steam (assuming it's connected and powered).
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 600 }, { type: "concrete", amount: 50 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class MuseumOfFutureArts extends Building { //Unlocked by Quantum Computing Lab after some time if you've played a perfect game of Monobrynth
    constructor() {
        super(
            "futurearts", "Museum of Future Arts", "A gallery where today's \"what if?\" becomes tomorrow's \"why, though?\" Visitors are advised that understanding the art is strictly optional and possibly temporally impossible. Not even the curator can do it, and she has a PhD in Post-Post-Post-Modern Design. The gift shop sells postcards from next Tuesday, which is enough to fund the whole museum because some of them include lottery numbers. May lead to unlocking technology from the future. Requires a road, unlike most Luxury structures.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 8;
        this.areaIndicatorRounded = true;
        this.outputResources.push(new Tourists(10, 10, 0, 200));
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2200 }, { type: "glass", amount: 30 }, { type: "electronics", amount: 20 }, { type: "gemstones", amount: 20 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 15; }

    override onLongTick(city: City): void {
        super.onLongTick(city);
        if (this.outputResources[0].amount > 150 && Math.random() < 0.1 * this.lastEfficiency && city.buildingTypes.find(p => p.type === getBuildingType(SandsOfTime))?.locked) {
            city.unlock(getBuildingType(SandsOfTime));
            city.notify(new Notification("Illusion of Time", "The Museum of Future Arts has discovered alien technology that can manipulate time! You can now build Sands of Time monuments from the Luxury construction category.", "fastforwardnobg"));
        }
    }
}

export class SandsOfTime extends Building { //Unlocked by having Museum of Future Arts for a while
    constructor() {
        super(
            "sandsoftime", "Sands of Time", "A monument to the passage of time, built with sand and glass, which is also made from sand. Oh, yeah, and it's actually a time machine based on alien technology we found in the Museum of Future Arts. It can advance time by a few hours every several days, but it's limited by how easy it is to accidentally unravel the fabric of time itself and destroy the universe, so your daily fast-forward allowance is fixed no matter how many you construct. To advance time, tap the clock icon in the building's context menu when you have at least 1 available timeslip.",
            BuildingCategory.LUXURY,
            2, 2, 0,
            0.1,
        );
        this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 8;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Luxury, 0.25)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2600 }, { type: "glass", amount: 40 }, { type: "sand", amount: 30 }, { type: "concrete", amount: 10 }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 7; }
}

//# Services
export class PoliceBox extends Building {
    constructor() {
        super(
            "policebox", "Police Box", "A miniature police station. It doesn't look like much from out here, but who knows--it might seem bigger on the inside.",
            BuildingCategory.GOVERNMENT,
            1, 1, 0,
            0.1
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "policeprotection";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PoliceProtection, 0.2, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 50 }, { type: "wood", amount: 5 }];
    }

    //Doesn't cost the maximum amount of upkeep unless there are 10 buildings in the area.
    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
        }];
    }

    //Includes the city police budget allocation; the effect is squared so 80% budget is only 64% effectiveness and 90% budget is 81% effectiveness.
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }
}

export class PoliceStation extends Building {
    constructor() {
        super(
            "policestation", "Police Station", "A place where police officers work. They keep the peace, but they also take a piece of the budget.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.2,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 7;
        this.serviceAllocationType = "policeprotection";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PoliceProtection, 1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 250 }, { type: "concrete", amount: 20 }];
    }

    //Doesn't cost the maximum amount of upkeep unless there are 10 buildings in the area.
    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 5 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
        }];
    }

    //Includes the city police budget allocation; the effect is squared so 80% budget is only 64% effectiveness and 90% budget is 81% effectiveness.
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 5; }
}

export class PoliceUAVHub extends Building {
    constructor() {
        super(
            "policeuavhub", "Police UAV Hub", "The meat and potatoes of a dystopian police state, but it's not so bad once you get past the initial shock! This police station uses aerial drones to cover a wider area, but it isn't quite as effective as boots on the ground.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.3,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 10;
        this.serviceAllocationType = "policeprotection";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.PoliceProtection, 0.75, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 620 }, { type: "batteries", amount: 15 }, { type: "steel", amount: 10 }];
    }

    //Doesn't cost the maximum amount of upkeep unless there are 10 buildings in the area.
    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 4 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
        }];
    }

    //Includes the city police budget allocation; the effect is squared so 80% budget is only 64% effectiveness and 90% budget is 81% effectiveness.
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }
}

export class FireBay extends Building {
    constructor() {
        super(
            "firebay", "Fire Bay", "A small fire station. It ensures swift delivery of suffocation to flames that are just trying to live their lives.",
            BuildingCategory.GOVERNMENT,
            1, 2, 0,
            0,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "fireprotection";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.FireProtection, 0.4, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 70 }, { type: "concrete", amount: 6 }];
    }

    //Doesn't cost the maximum amount of upkeep unless there are 10 buildings in the area.
    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 2 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
        }];
    }

    //Affected by fire protection budget (deficit squared) AND drought (30% debuff).
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2 - (city.events.some(p => p.type === 'drought') ? 0.3 : 0); }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 1; }
}

export class FireStation extends Building {
    constructor() {
        super(
            "firestation", "Fire Station", "A place where firefighters work. They put out fires, but they also burn our city flunds.",
            BuildingCategory.GOVERNMENT,
            3, 2, 0,
            0,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 8;
        this.serviceAllocationType = "fireprotection";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.FireProtection, 1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 300 }, { type: "concrete", amount: 15 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 4 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
        }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2 - (city.events.some(p => p.type === 'drought') ? 0.3 : 0); }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 4; }
}

export class Clinic extends Building {
    constructor() {
        super(
            "clinic", "Clinic", "A place of employment for a few doctors. They keep our residents healthy, so we need to keep their wallets healthy.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.3,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 7;
        this.serviceAllocationType = "healthcare";
        this.upkeepScales = true;
        //Only half as effective as a hospital would be.
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Healthcare, 0.5, "dynamicEffectByEfficiency")], [{ tech: "telemedicine", amount: 2 }]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 200 }, { type: "concrete", amount: 10 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 8 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10 //I realized after a looong time that I meant for this to be Math.min...but now I kinda like how the costs scale up so much.
                * (city.techManager.techs.get("aidiagnostics")?.researched ? 0.75 : 1)
        }];
    }

    //Affected by healthcare budget (deficit squared) AND food health (75% of perfect diet = no effect, up to +10% effect, but can easily be a debuff)
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2 + 0.4 * (city.resources.get("foodhealth")!.amount - 0.75); }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 8; }
}

//TODO: Generate images for more. Police HQ, fire HQ, etc.
export class Hospital extends Building {
    constructor() {
        super(
            "hospital", "Hospital", "A place where doctors work...a lot of kinds of them.",
            BuildingCategory.GOVERNMENT,
            4, 4, 0,
            0.5,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 10; //That's a 24x24 area in total!
        this.serviceAllocationType = "healthcare";
        this.upkeepScales = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Healthcare, 1, "dynamicEffectByEfficiency")], [{ tech: "telemedicine", amount: 2 }]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1400 }, { type: "concrete", amount: 60 }, { type: "glass", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{
            type: "flunds", amount: 30 * (atEfficiency || this.poweredTimeDuringLongTick)
                * city.budget.serviceAllocations[this.serviceAllocationType] * Math.max(1, this.affectingBuildingCount) / 10
                * (1 - city.techManager.getAdoption("aidiagnostics") * 0.2)
        }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2 + 0.4 * (city.resources.get("foodhealth")!.amount - 0.75); }

    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number) {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 + city.techManager.getAdoption("nanomedicine") * 0.2);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 24; }
}

export class Library extends Building {
    constructor() {
        super(
            "library", "Library", "When someone asked, \"How do we make learning fun?\" the architect responded by making the building look like a book instead of actually solving the problem. Provides education at a quality level best described as \"well, it's better than nothing... probably,\" because most students aren't motivated by a fear of getting bad grades on open-book self-tests. Plus, half of them can't read.",
            BuildingCategory.GOVERNMENT,
            1, 2, 0,
            0.3,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 7;
        this.serviceAllocationType = "education";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Education, 0.25, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 130 }, { type: "wood", amount: 10 }, { type: "paper", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 7 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number) {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 + city.techManager.getAdoption("braininterface") * 0.6); //Massively more effective with brain-computer interface.
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class ElementarySchool extends Building { //TODO: Strongly consider splitting up education into lower, middle, and upper. Then all three school types could spread a wider area effect of 0.9 (since there are techs to upgrade them) and libraries could spread two or all three types of education with a smaller strength.
    constructor() {
        super(
            "elementaryschool", "Elementary School", "A place where children learn. For some reason, everyone who applies for the principal position is named Watson.",
            BuildingCategory.GOVERNMENT,
            3, 3, 0,
            0.3,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 8;
        this.serviceAllocationType = "education";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Education, 0.5, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 400 }, { type: "concrete", amount: 25 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 15 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number) {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 + city.techManager.getAdoption("braininterface") * 0.25 + city.techManager.getAdoption("vrclassrooms") * 0.1);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 12; }
}

//3x3 highschool as well.
export class HighSchool extends Building {
    constructor() {
        super(
            "highschool", "High School", "A place where teenagers get high. I mean, that's clearly why it's called a high school, right? That's what teenagers do--get taller.",
            BuildingCategory.GOVERNMENT,
            3, 3, -3, //Has a little offset due to a tree on the left side
            0.3,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 9;
        this.serviceAllocationType = "education";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Education, 0.75, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 600 }, { type: "concrete", amount: 30 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 21 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number) {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 + city.techManager.getAdoption("braininterface") * 0.2 + city.techManager.getAdoption("vrclassrooms") * 0.1);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 16; }
}

export class College extends Building {
    constructor() {
        super(
            "college", "College", "A place where young adults learn, exchanging their time and energy for caffeine addictions and strong opinions about obscure philosophers. Produces a tiny amount of research. Also noisy, what with the bell tower and all.",
            BuildingCategory.GOVERNMENT,
            4, 4, 0,
            0.4,
        );
        this.stampFootprint[0][2] = this.stampFootprint[1][2] = this.stampFootprint[0][3] = this.stampFootprint[1][3] = FootprintType.COLLEGE; //Allows two dorms on it
        this.stampFootprint[2][0] = this.stampFootprint[2][1] = this.stampFootprint[3][0] = this.stampFootprint[3][1] = FootprintType.COLLEGE;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 10;
        this.outputResources.push(new Research(0, 0.0625)); //0.25 a day
        this.serviceAllocationType = "education";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.Education, 0.8, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.Noise, 0.2, undefined, true, 4, 4, false)]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 950 }, { type: "concrete", amount: 50 }, { type: "glass", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 30 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    public dynamicEffectByEfficiency(city: City, building: Building | null, x: number, y: number) {
        return (this.x === -1 ? 1 : this.lastEfficiency) * (1 + city.techManager.getAdoption("braininterface") * 0.2 + city.techManager.getAdoption("vrclassrooms") * 0.1);
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 22; }
}

export class CarbonCapturePlant extends Building {
    constructor() {
        super(
            "carboncaptureplant", "Carbon Capture Plant", "A facility that captures carbon dioxide from the air and stores it underground. Also filters out some particulate pollution. It's a plant that's like a plant--get it?",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.3,
            true,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 6;
        this.areaIndicatorRounded = true;
        this.serviceAllocationType = "environment";
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.GreenhouseGases, -0.5, "dynamicEffectByEfficiency"),
            new EffectDefinition(EffectType.ParticulatePollution, -0.1, "dynamicEffectByEfficiency")]);
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 800 }, { type: "textiles", amount: 70 }, { type: "concrete", amount: 20 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 16 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    //Affected by environment budget (deficit squared).
    override getEfficiencyEffectMultiplier(city: City): number { return city.budget.serviceAllocations[this.serviceAllocationType] ** 2; }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 6; }
}

export class Observatory extends Building {
    constructor() {
        super(
            "observatory", "Observatory", "Where stargazing scientists sit alone in the dark, ruminating over objects of unimaginable size at an incomprehensible distance and the relative insignificance of our own lives. Features a roof that opens dramatically only to reveal it's cloudy for the 47th night in a row.",
            BuildingCategory.GOVERNMENT,
            2, 2, 0,
            0.3,
            true,
        );
        this.outputResources.push(new Research(0, 0.0375)); //0.15 a day
    }

    override getCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 780 }, { type: "steel", amount: 20 }, { type: "glass", amount: 15 }, { type: "electronics", amount: 10 }]; }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] { return [{ type: "flunds", amount: 7 * (atEfficiency || this.poweredTimeDuringLongTick) }]; }
}

export class QuantumComputingLab extends Building {
    constructor() {
        super(
            "quantumcomputinglab", "Quantum Computing Lab", "A lab where quantum computing research is conducted. It's kind of a big deal and draws in some tourism. May result in quantum leaps in your research progress.",
            BuildingCategory.GOVERNMENT,
            3, 3, 0,
            0.3,
            true,
        );
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.outputResources.push(new Tourists(4.5, 4.5, 0, 180)); //Brings in 180 tourists per long tick, but it takes 10 days to get up to full steam. This makes the building not totally useless if the chance doesn't fire.
    }

    override onLongTick(city: City): void {
        super.onLongTick(city);
        if (this.lastEfficiency > 0.9 && Math.random() < 0.01) { //1% per long tick, about 24.6% chance a week or 68% chance a month
            const researchProgress = 0.3 + Math.random() * 0.2; //30%-50% of the base cost
            city.techManager.randomFreeResearch(city, researchProgress); //Apply research to one of the researchable techs
        }

        //Teleportation Pod unlocked and Museum of Future Arts locked -> 10% chance per long tick to unlock Museum of Future Arts
        if (this.outputResources[0].amount > 200 && Math.random() < 0.1 * this.lastEfficiency && !city.buildingTypes.find(p => p.type === getBuildingType(TeleportationPod))?.locked && city.buildingTypes.find(p => p.type === getBuildingType(MuseumOfFutureArts))?.locked) {
            city.unlock(getBuildingType(MuseumOfFutureArts));
            city.notify(new Notification("Particle Accelerator Accident", "Thanks to what we're legally required to call an 'unexpected synergistic intersection of experimental technologies' (but was actually just an intern trying to teleport his lunch while the particle accelerator was running and someone was using the quantum computer to mine cryptocurrency), we now have access to art from approximately 47 years in the future. The good news: temporal art tourism is now possible! The bad news: future art critics are still just as pretentious. You can now build the Museum of Future Arts from the Luxury construction category.", "luxury"));
        }
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 1400 }, { type: "steel", amount: 30 }, { type: "electronics", amount: 30 }];
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 20 * (atEfficiency || (this.poweredTimeDuringLongTick)) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 10; }
}

export class WeatherControlMachine extends Building {
    constructor() {
        super(
            "weathercontrolmachine", "Weather Control Machine", "A machine that can control the weather. It's a bit of a stretch, but if you think about it, so is water or ice falling from the sky. Droughts, heatwaves, and cold snaps last a third as long if you have one of these. Build another to cut the duration to 20%.",
            BuildingCategory.GOVERNMENT,
            4, 4, 0,
            0.3,
            true,
        );
        this.serviceAllocationType = "environment";
    }

    override getCosts(city: City): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 2400 }, { type: "electronics", amount: 50 }, { type: "steel", amount: 30 }, { type: "copper", amount: 30 }];
    }

    override onLongTick(city: City): void {
        super.onLongTick(city);
        this.lastEfficiency *= city.budget.serviceAllocations[this.serviceAllocationType] ** 2; //Weakened by the square of the environment budget deficit

        //One copy of this halves the duration; two copies cuts it to a third...
        const drought = city.events.find(p => p.type === "drought");
        if (drought) drought.duration -= this.lastEfficiency * 2;
        const heatwave = city.events.find(p => p.type === "heatwave");
        if (heatwave) heatwave.duration -= this.lastEfficiency * 2;
        const coldsnap = city.events.find(p => p.type === "coldsnap");
        if (coldsnap) coldsnap.duration -= this.lastEfficiency * 2;
    }

    override getUpkeep(city: City, atEfficiency: number = 0): { type: string, amount: number }[] {
        return [{ type: "flunds", amount: 15 * (atEfficiency || (this.poweredTimeDuringLongTick * city.budget.serviceAllocations[this.serviceAllocationType])) }];
    }

    override getPowerUpkeep(city: City, ideal: boolean = false): number { return (ideal ? 1 : this.lastEfficiency) * 20; }
}

//# Obstacles to city areas (unlockable areas, effectively)
export class SmallBoulder extends Building {
    constructor() {
        super(
            "smallboulder", "Small Boulder", "A big rock, but a small boulder. It's in the way of progress.",
            BuildingCategory.BLOCKER,
            2, 2, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 800 }, { type: "stone", amount: -5 }]; }
}

export class MediumBoulder extends Building {
    constructor() {
        super(
            "mediumboulder", "Medium Boulder", "A pretty hefty chunk of rock. It has mass and takes up space, but it won't matter once we blow it up.",
            BuildingCategory.BLOCKER,
            3, 3, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 1400 }, { type: "stone", amount: -15 }]; }
}

export class BigBoulder extends Building {
    constructor() {
        super(
            "bigboulder", "Big Boulder", "Pretty big even for a boulder. It puts us in a tough spot by being tough and in our spot.",
            BuildingCategory.BLOCKER,
            4, 4, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 2000 }, { type: "stone", amount: -25 }]; }
}

export class ObstructingGrove extends Building {
    constructor() {
        super(
            "obstructinggrove", "Obstructing Grove", "A dense grove of trees. If you would, use it for wood.",
            BuildingCategory.BLOCKER,
            4, 4, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: this.x === 0 && this.y === 4 ? 10 : 150 }, { type: "wood", amount: -25 }]; }
}

//# Non-obstacle natural formations (NATURAL_RESOURCE category)
export class Mountain extends Building {
    constructor() {
        super(
            "mountain", "Mountain", "There's gold in them there hills! Well, that would be nice, but I think this particular hill only has iron in it. Hey, at least the supply is bottomless.",
            BuildingCategory.NATURAL_RESOURCE,
            4, 4, 0,
            0,
        );
        this.stampFootprint[1][3] = FootprintType.MINE;
        this.stampFootprint[2][3] = FootprintType.MINE;
        this.owned = this.needsPower = this.needsRoad = false;
    }
}

export class CrystalMountain extends Building {
    constructor() {
        super(
            "crystalmountain", "Crystal Mountain", "A mountain with a lot of crystal formations. They're pretty, but they're also pretty useful. The mountain itself is fairly attractive, increasing the surrounding land value slightly.",
            BuildingCategory.NATURAL_RESOURCE,
            3, 3, 0,
            0,
        );
        this.stampFootprint[0][2] = FootprintType.GEM_MINE;
        this.owned = this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, 0.15)]);
    }
}

export class LithiumPlateau extends Building {
    constructor() {
        super(
            "lithiumplateau", "Lithium Plateau", "A plateau with a high concentration of lithium. Strip it down to gather it up by building a Lithium Strip Mine on it.",
            BuildingCategory.NATURAL_RESOURCE,
            3, 3, 0,
            0,
        );
        this.stampFootprint[0][0] = this.stampFootprint[0][1] = this.stampFootprint[0][2] = this.stampFootprint[1][0] = this.stampFootprint[1][1] = this.stampFootprint[1][2] = this.stampFootprint[2][0] = this.stampFootprint[2][1] = this.stampFootprint[2][2] = FootprintType.LITHIUM_MINE;
        this.owned = this.needsPower = this.needsRoad = false;
    }
}

export class PrettyPond extends Building {
    constructor() {
        super(
            "prettypond", "Pretty Pond", "A modest pond with a pleasant appearance. It's a nice place to relax, and its mere presence raises the value of the surrounding land.",
            BuildingCategory.NATURAL_RESOURCE,
            3, 3, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 4;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, 0.3)]);
    }
}

export class CleanPond extends Building {
    constructor() {
        super(
            "cleanpond", "Clean Pond", "A pond that's so clean that you could drink from it and only get a *little* diarrhea. Its mere presence raises the value of the surrounding land.",
            BuildingCategory.NATURAL_RESOURCE,
            3, 3, 0,
            0,
        );
        this.stampFootprint[0][0] = this.stampFootprint[0][1] = this.stampFootprint[0][2] = this.stampFootprint[1][0] = this.stampFootprint[1][1] = this.stampFootprint[1][2] = this.stampFootprint[2][0] = this.stampFootprint[2][1] = this.stampFootprint[2][2] = FootprintType.SPECIAL;
        this.owned = this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, 0.3, "hasFilthDynamicEffect")]);
    }

    public hasFilthDynamicEffect(city: City, building: Building | null, x: number, y: number) {
        //0 if there's filth placed atop it, 1 if it's been cleaned up.
        return [...city.getBuildingsInArea(this.x, this.y, 1, 1, 0, 0)].filter(p => p != this).length ? 0 : 1;
    }
}

export class PondFilth extends Building {
    constructor() {
        super(
            "pondfilth", "Pond Filth", "A pond that's so filthy that you'd get diarrhea just from looking at it. Clean it up to raise the value of the surrounding land.",
            BuildingCategory.BLOCKER, //Blocks the CleanPond from producing any land value.
            3, 3, 0,
            0,
        );
        this.checkFootprint[0][0] = this.checkFootprint[0][1] = this.checkFootprint[0][2] = this.checkFootprint[1][0] = this.checkFootprint[1][1] = this.checkFootprint[1][2] = this.checkFootprint[2][0] = this.checkFootprint[2][1] = this.checkFootprint[2][2] = FootprintType.SPECIAL;
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 350 }, { type: "iron", amount: -3 }]; }
}

export class HotSpring extends Building {
    constructor() {
        super(
            "hotspring", "Hot Spring", "A fount of hot mineral water formed by an earthquake. Keep out if you don't want to be turned into spicy human soup. With a little work, it could become a tourist attraction: you can build a Hot Spring Inn on it.",
            BuildingCategory.NATURAL_RESOURCE,
            2, 2, 0,
            0,
        );
        this.stampFootprint[0][0] = this.stampFootprint[0][1] = this.stampFootprint[1][0] = this.stampFootprint[1][1] = FootprintType.HOT_SPRING;
        this.owned = this.needsPower = this.needsRoad = false;
        this.areaIndicatorRadiusX = this.areaIndicatorRadiusY = 5;
        this.areaIndicatorRounded = true;
        this.effects = new BuildingEffects([new EffectDefinition(EffectType.LandValue, 0.25)]);
    }
}

export class AlienMonolith extends Building {
    constructor() {
        super(
            "alienmonolith", "Alien Monolith", "A mysterious monolith of unknown origin. Exploring it may yield resources or knowledge. Secrets aren't that easy to keep, so it draws tourists as well.",
            BuildingCategory.NATURAL_RESOURCE,
            3, 3, 0,
            0,
        );
        this.stampFootprint[0][0] = this.stampFootprint[0][1] = this.stampFootprint[0][2] = this.stampFootprint[1][0] = this.stampFootprint[1][1] = this.stampFootprint[1][2] = this.stampFootprint[2][0] = this.stampFootprint[2][1] = this.stampFootprint[2][2] = FootprintType.SPECIAL;
        this.owned = this.needsPower = this.needsRoad = false;
        //Note: gets set to 'owned' and has Tourists output added when the MysteriousRubble is removed from it.
    }

    override onLongTick(city: City): void {
        this.upkeepEfficiency = this.poweredTimeDuringLongTick = 1;
        super.onLongTick(city);
    }
}

export class MysteriousRubble extends Building {
    constructor() {
        super(
            "mysteriousrubble", "Mysterious Rubble", "A pile of rubble that seems to be covering some sort of anomaly. The local wildlife avoid it like the plague. We're humans, though--we don't avoid plagues (apparently)!",
            BuildingCategory.BLOCKER,
            3, 3, 0,
            0,
        );
        this.checkFootprint[0][0] = this.checkFootprint[0][1] = this.checkFootprint[0][2] = this.checkFootprint[1][0] = this.checkFootprint[1][1] = this.checkFootprint[1][2] = this.checkFootprint[2][0] = this.checkFootprint[2][1] = this.checkFootprint[2][2] = FootprintType.SPECIAL;
        this.owned = this.needsPower = this.needsRoad = false;
        this.demolishAllowed = true;
    }

    getDemolitionCosts(city: City): { type: string, amount: number }[] { return [{ type: "flunds", amount: 400 }, { type: "stone", amount: -8 }]; }

    override remove(city: City, justMoving: boolean = false): void {
        const builtOn = this.builtOn.values().next().value as AlienMonolith;
        if (builtOn) {
            builtOn.outputResources.push(new Tourists(5, 5, 0, 280));
            builtOn.owned = true;
            builtOn.lastEfficiency = 1;
        }
        super.remove(city, justMoving);
    }
}

export class OilSeep extends Building {
    constructor() {
        super(
            "oilseep", "Oil Seep", "A natural oil seep. It's not much, but it makes your BP rise when you think about how much people will shell out for it.",
            BuildingCategory.NATURAL_RESOURCE,
            1, 1, 0,
            0,
        );
        this.stampFootprint[0][0] = FootprintType.OIL_WELL;
        this.owned = this.needsPower = this.needsRoad = false;
    }
}

export class GeothermalVent extends Building {
    constructor() {
        super(
            "geothermalvent", "Geothermal Vent", "A geothermal vent. It's a hot spot we might be able to tap into.",
            BuildingCategory.NATURAL_RESOURCE,
            1, 1, 0,
            0,
        );
        this.stampFootprint[0][0] = FootprintType.GEO_VENT;
        this.owned = this.needsPower = this.needsRoad = false;
    }

    override place(city: City, x: number, y: number): void {
        super.place(city, x, y);
        const geoTech = city.techManager.techs.get(new Geothermal().id)!;
        if (geoTech.unavailable) {
            geoTech.unavailable = false;
            city.notify(new Notification("Geothermal Energy", "The discovery of a geothermal vent in the region has made geothermal energy research available."));
        }
    }
}

export class SandBar extends Building {
    constructor() {
        super(
            "sandbar", "Sand Bar", "A bottomless source of sand, needed for making glass, among other things. You need to build something here to collect it, though.",
            BuildingCategory.NATURAL_RESOURCE,
            2, 2, 0,
            0,
        );
        this.owned = this.needsPower = this.needsRoad = false;
        this.stampFootprint[0][0] = this.stampFootprint[1][0] = this.stampFootprint[0][1] = this.stampFootprint[1][1] = FootprintType.SAND;
    }
}
//A good idea for a sand collection building on water would be: Sand Dredger, 2x2. Costs 100 funds, 10 stone, 10 wood. Produces 2 sand per long tick. Requires power and road access.

export const BLOCKER_TYPES: Map<string, Building> = new Map([
    SmallBoulder, MediumBoulder, BigBoulder, ObstructingGrove, PondFilth, MysteriousRubble,
    Mountain, CrystalMountain, LithiumPlateau, PrettyPond, CleanPond, AlienMonolith, OilSeep, GeothermalVent, HotSpring, SandBar
    ].map(p => new p()).map(p => [p.type, p]));

export const BUILDING_TYPES: Map<string, Building> = new Map([
    /*Residential*/ SmallHouse, Quadplex, SmallApartment, Highrise, Skyscraper, Dorm, ShowHome,
    /*Commercial*/ CornerStore, Junkyard, SuckasCandy, Cafe, TheLoadedDie, Cinema, Whalemart, Bar, IceCreamTruck, PalmNomNom, GregsGrogBarr, FurnitureStore, MaidTwoTeas, SauceCode, Casino, CartersCars, GameDevStudio, BlankCheckBank, ResortHotel, HotSpringInn, ConventionCenter,
    /*Seasonal (also commercial)*/ ChocolateBar, HeartyShack,
    /*Industrial*/ MountainIronMine, Quarry, CementMill, ShaftCoalMine, VerticalCopperMine, SandCollector, Glassworks, SiliconRefinery, CrystalMine, AssemblyHouse, OilDerrick, TextileMill, ApparelFactory, SteelMill, PlasticsFactory, ToyManufacturer, Furnifactory, LithiumMine, MohoMine, Nanogigafactory, PharmaceuticalsLab, SpaceLaunchSite,
    /*Seasonal (also industrial)*/ MiracleWorkshop,
    /*Power*/ StarterSolarPanel, WindTurbine, SolarFarm, OilPowerPlant, OilTruck, GeothermalPowerPlant, CoalPowerPlant, CoalTruck, NuclearPowerPlant, NuclearFuelTruck, FusionPowerPlant, FusionFuelTruck,
    /*Agriculture*/ TreeFarm, Farm, Ranch, FishFarm, AlgaeFarm, PlantMilkPlant, VerticalFarm, Carnicultivator,
    /*Infrastructure*/ Road, BikeRental, BusStation, ECarRental, TeleportationPod, Warehouse, Silo, OilTank, ColdStorage, SecureStorage, LogisticsCenter, FreeStuffTable, DataCenter, NuclearStorage,
    /*Government*/ CityHall, InformationCenter, PostOffice, DepartmentOfEnergy, EnvironmentalLab, MinigameMinilab,
    /*Services (also government)*/ PoliceBox, PoliceStation, PoliceUAVHub, FireBay, FireStation, Clinic, Library, ElementarySchool, HighSchool, College, Hospital, CarbonCapturePlant, Observatory, QuantumComputingLab, WeatherControlMachine,
    /*Seasonal (also luxury)*/ HauntymonthGrave, HauntymonthLamp, HauntymonthHouse, PeppermintPillar, CocoaCupCo, ReindeerRetreat, WrappedWonder, FlowerTower,
    /*Luxury (Recreation/Decorations)*/ SmallPark, PenguinSculpture, MediumPark, KellyStatue, SharonStatue, SmallFountain, CrystalSpire, Greenhouse, Playground, UrbanCampDome, FlippinFun, H2Whoa, SesharTower, MuseumOfFutureArts, SandsOfTime,
    ].map(p => new p()).map(p => [p.type, p]));
export function get(type: string): Building { //Get an UNMODIFIED copy of the building type. (City.buildingTypes can have modified values; this and BUILDING_TYPES do not.)
    return BUILDING_TYPES.get(type)!;
}

export const TUTORIAL_COMPLETION_BUILDING_UNLOCKS: Set<string> = new Set([
    Farm, CementMill, Quarry, CornerStore, MountainIronMine, WindTurbine, TreeFarm, //Were originally unlocked *during* the tutorial, but then I switched to granting them so you can't softlock yourself.
    Junkyard, BikeRental, BusStation, Warehouse, ColdStorage, Silo, OilTank, SecureStorage, SolarFarm, OilPowerPlant, OilTruck, CoalPowerPlant, CoalTruck,
    FurnitureStore, MaidTwoTeas, Ranch, FishFarm, ShaftCoalMine, VerticalCopperMine, SandCollector, Glassworks,
    SiliconRefinery, CrystalMine, OilDerrick, TextileMill, ApparelFactory, SteelMill, PlasticsFactory,
    ToyManufacturer, Furnifactory, LithiumMine,
    IceCreamTruck, PlantMilkPlant,
    SuckasCandy, Cafe, TheLoadedDie, Cinema, Whalemart, Bar, PalmNomNom, GregsGrogBarr, Casino, CartersCars, BlankCheckBank,
    SmallPark, PenguinSculpture, MediumPark, KellyStatue, SharonStatue, SmallFountain, CrystalSpire, Greenhouse, FlippinFun, H2Whoa].map(getBuildingType));
