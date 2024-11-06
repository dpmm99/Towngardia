import { UIManager } from "../ui/UIManager.js";
import { Achievement } from "./Achievement.js";
import { AchievementTypes, TitleTypes } from "./AchievementTypes.js";
import { Assist } from "./Assist.js";
import { Budget } from "./Budget.js";
import { Building } from "./Building.js";
import { BuildingCategory } from "./BuildingCategory.js";
import { AlgaeFarm, AlienMonolith, BLOCKER_TYPES, BUILDING_TYPES, Bar, Casino, CityHall, Clinic, College, ConventionCenter, Dorm, ElementarySchool, FireBay, FireStation, GregsGrogBarr, HighSchool, Hospital, InformationCenter, MediumPark, Mountain, MysteriousRubble, ObstructingGrove, Playground, PoliceBox, PoliceStation, PostOffice, ResortHotel, Road, SandBar, SesharTower, SmallHouse, SmallPark, StarterSolarPanel, TUTORIAL_COMPLETION_BUILDING_UNLOCKS, getBuildingType } from "./BuildingTypes.js";
import { CitizenDietSystem } from "./CitizenDietSystem.js";
import { CityEvent, EventTickTiming } from "./CityEvent.js";
import { CityFlags } from "./CityFlags.js";
import { Effect } from "./Effect.js";
import { EVENT_TYPES, EmergencyPowerAid, PowerOutage } from "./EventTypes.js";
import { FootprintType } from "./FootprintType.js";
import { LONG_TICKS_PER_DAY, SHORT_TICKS_PER_LONG_TICK } from "./FundamentalConstants.js";
import { GREENHOUSE_GASES_MIN_POPULATION } from "./GameplayConstants.js";
import { EffectType } from "./GridType.js";
import { HappinessCalculator } from "./HappinessCalculator.js";
import { inPlaceShuffle } from "./MiscFunctions.js";
import { Notification } from "./Notification.js";
import { Player } from "./Player.js";
import { REGIONS } from "./Region.js";
import { ResidenceSpawningSystem } from "./ResidenceSpawningSystem.js";
import { Resource } from "./Resource.js";
import * as ResourceTypes from "./ResourceTypes.js";
import { TechManager } from "./TechManager.js";

export class City {
    //Not serialized
    public uiManager: UIManager | null = null;
    public drawInFrontBuildings: Building[] = []; //Just for UI purposes, to make it easy to see one or more buildings the player is actively working with
    public readonly buildingTypesByCategory: Map<BuildingCategory, Building[]> = new Map();
    public readonly constructionResourceTypes: Set<string> = new Set([new ResourceTypes.Steel().type, new ResourceTypes.Iron().type, new ResourceTypes.Stone().type, new ResourceTypes.Wood().type, new ResourceTypes.Lumber().type, new ResourceTypes.Glass().type]);
    public residenceSpawner: ResidenceSpawningSystem; //No persistent data other than constants
    public citizenDietSystem: CitizenDietSystem; //No persistent data other than constants and lastDietComposition
    public canBuildResources: boolean = false; //Is set to true by the construction cheat so I can lay out 'regions'
    //Just aliases
    public flunds: Resource;
    public networkRoot!: Building; //You need to call startNew() or fake() immediately after the constructor.
    public cityHall!: CityHall;
    public postOffice: PostOffice | null = null;

    //These really matter
    public trafficPrecalculation: number = 0;
    public roadUpkeepPrecalculation: number = 0;
    public presentBuildingCount: Map<string, number> = new Map(); //Number of buildings of each type that the player has built (or that naturally formed) but has not demolished.
    public resources: Map<string, Resource> = new Map();
    public desiredPower: number = 50; //Used for buying enough power for a fraction of your buildings. Initialized to 50 so you can always import up to 25 MW if needed and if you have the money.
    public createdDate: Date = new Date(); //Could be used for certain fixed events--like the first earthquake that makes geothermal power available to research
    public notifications: Notification[] = [];
    public assists: Assist[] = [];
    public happinessBreakdown: Map<string, number> = new Map();
    public happinessMaxima: Map<string, number> = new Map();

    public lastImportedPowerCost: number = 0;
    public recentConstructionResourcesSold: number = 0;
    public peakPopulation: number = 1;

    public timeFreeze: boolean = false;
    public tutorialStepIndex: number = -1;

    public resourceEvents: { type: string, event: "buy" | "sell" | "earn" | "produce" | "consume", amount: number }[] = []; //Gets cleared at the end of every long tick. Used for achievements. Will need to serialize if saves occur outside long ticks (which is totally necessary).

    constructor(
        public player: Player,
        public id: string,
        public name: string,
        public width: number, //Should probably solely depend on region. //TODO: Regions are not implemented.
        public height: number,
        public buildingTypes: Building[] = [],
        resources: Resource[] = [],
        public unplacedBuildings: Building[] = [],
        public events: CityEvent[] = [],
        public techManager: TechManager = new TechManager(),
        public budget: Budget = new Budget(),
        residenceSpawner: ResidenceSpawningSystem | undefined = undefined,
        public titles: Map<string, Achievement> = new Map(Object.values(TitleTypes).map(p => p.clone()).map(p => [p.id, p])), //Not just attained ones, all of 'em
        public grid: (Building | null)[][] = Array(height).fill(null).map(() => Array(width).fill(null)),
        public eventTypes: CityEvent[] = EVENT_TYPES.map(p => p.clone()),
        public effectGrid: Effect[][][] = [], //y, x, then just an index because there are potentially many effects of each type per cell
        public buildings: Building[] = [],
        public lastLongTick: number = Date.now(),
        public lastShortTick: number = Date.now(),
        public nextBuildingID: number = 1,
        public regionID: string | null = null, //Should always be set to a valid region ID when the city is loaded. If it's null, the city existed before I implemented regions.
        public regionVersion: number = 0,
        public flags: Set<CityFlags> = new Set(), //Notification triggers
        citizenDietSystem: CitizenDietSystem | undefined = undefined,
    ) {
        if (!this.regionID) {
            this.regionID = "plains";
            this.regionVersion = 0;
        }
        const region = REGIONS.find(p => p.id === this.regionID);
        if (region && (this.width != region.width || this.height != region.height)) {
            this.width = Math.max(region.width, this.width);
            this.height = Math.max(region.height, this.height);
            //Resize grid and effectGrid while maintaining their contents
            this.grid = Array(this.height).fill(null).map((_, y) => Array(this.width).fill(null).map((_, x) => this.grid[y]?.[x] ?? null));
            this.effectGrid = Array(this.height).fill(null).map((_, y) => Array(this.width).fill(null).map((_, x) => this.effectGrid[y]?.[x] ?? []));
        }

        //In case of updates, ensure we have ALL building types. (Note: you need to account for new building that are affected by old upgrades here explicitly, too!)
        const missingBuildingTypes = [...BUILDING_TYPES.values()].filter(bt => !this.buildingTypes.some(b => b.type === bt.type)); //TODO: use a set instead.
        if (missingBuildingTypes.length) this.buildingTypes.push(...missingBuildingTypes);
        this.categorizeBuildingTypes();

        //Make sure all later-developed unlocks get unlocked, e.g., in case I add new ones after players have started their cities.
        this.ensureNewerUnlocks();
        
        this.resources = new Map(ResourceTypes.RESOURCE_TYPES.map(p => p.clone()).map(p => [p.type, p]));
        resources.forEach(r => this.resources.set(r.type, r)); //Override amounts and such based on the passed-in array

        this.flunds = this.resources.get("flunds")!; //Used a lot so we'll keep a direct reference
        this.flunds.capacity = Number.MAX_SAFE_INTEGER;
        this.resources.get("power")!.capacity = Number.MAX_SAFE_INTEGER; //Can't actually be stored, but we're using 'amount' and we don't want it to zero out randomly

        if (!this.effectGrid.length) this.effectGrid = Array(height).fill(null).map(() => Array(width).fill(null).map(() => []));
        this.residenceSpawner = residenceSpawner ?? new ResidenceSpawningSystem(this);
        this.citizenDietSystem = citizenDietSystem ?? new CitizenDietSystem(this);

        this.networkRoot = this.buildings.find(p => p instanceof Road) as Road;
        this.cityHall = this.buildings.find(p => p instanceof CityHall) as CityHall;
        this.postOffice = this.buildings.find(p => p instanceof PostOffice) as PostOffice;
        region?.apply(this);
    }

    private ensureNewerUnlocks() {
        if (this.player.finishedTutorial) this.buildingTypes.filter(p => TUTORIAL_COMPLETION_BUILDING_UNLOCKS.has(p.type)).forEach(p => p.locked = false);
        if (this.flags.has(CityFlags.UnlockedTourism)) this.unlock(getBuildingType(ConventionCenter));
        if (this.flags.has(CityFlags.EducationMatters)) this.unlock(getBuildingType(HighSchool));
        if (this.flags.has(CityFlags.EducationMatters)) this.unlock(getBuildingType(Dorm));
        if (this.buildingTypes.find(p => p.type === "seshartower")!.outputResources[0].amount < 150) this.buildingTypes.find(p => p.type === "seshartower")!.outputResources[0].amount = 150;
    }

    enableResourceConstruction() { //NOT for normal players. :)
        this.canBuildResources = true;
        const missingBuildingTypes = [...BLOCKER_TYPES.values()].filter(bt => !this.buildingTypes.some(b => b.type === bt.type));
        if (missingBuildingTypes.length) {
            this.buildingTypes.push(...missingBuildingTypes);
            for (const buildingType of missingBuildingTypes) {
                if (!this.buildingTypesByCategory.has(buildingType.category)) {
                    this.buildingTypesByCategory.set(buildingType.category, []);
                }
                this.buildingTypesByCategory.get(buildingType.category)!.push(buildingType);
            }
        }
    }

    startNew() {
        //Ensure the power/road network root is established as the very first building and City Hall is the second.
        this.networkRoot = new Road();
        this.networkRoot.x = 0;
        this.networkRoot.y = 0;
        this.networkRoot.owned = false; //Player can't move/remove it
        this.networkRoot.roadConnected = true;
        this.networkRoot.powerConnected = true;
        this.addBuilding(this.networkRoot);

        this.cityHall = new CityHall();
        this.cityHall.x = 1;
        this.cityHall.y = 0;
        this.cityHall.roadConnected = true;
        this.cityHall.powerConnected = true;
        this.addBuilding(this.cityHall);

        //Add some freebies to get the player started.
        this.addBuilding(new Road().clone(), 0, 1);
        this.addBuilding(new Road().clone(), 0, 2);
        this.addBuilding(new SmallHouse().clone(), 0, 3); //A starter house for income
        this.addBuilding(new StarterSolarPanel().clone(), 3, 0); //Free power for the first few houses
        this.addBuilding(new StarterSolarPanel().clone(), 3, 1);
        this.addBuilding(new StarterSolarPanel().clone(), 4, 0);
        this.addBuilding(new ObstructingGrove().clone(), 0, 4); //Very in-the-way. Very intended. :) Has these exact coordinates in getDemolitionCosts, so be careful if you change them.
        this.addBuilding(new Mountain().clone(), 7, 0); //Also kinda in-the-way, but it's important to have!
        this.addBuilding(new SandBar().clone(), 0, 10); //Ditto

        this.flunds.amount = 70; //Low flunds. Must provide more during tutorial.
        this.resources.get("population")!.amount = 1;
        this.resources.get("happiness")!.amount = 0.7; //Give a small boost to initial growth
        this.resources.get("concrete")!.amount = 30; //For a few road segments
        this.resources.get("wood")!.amount = 5;
        //Just enough capacity to hold the starting resources and a bit more--may as well have some storage for the most basic starting materials. Plus... a warehouse costs 25 wood right now.
        this.resources.get("concrete")!.capacity = 30;
        this.resources.get("concrete")!.buyableAmount = 10;
        this.resources.get("wood")!.capacity = 30;
        this.resources.get("wood")!.buyableAmount = 10;
        this.buildings.forEach(building => building.powerConnected = building.roadConnected = building.powered = true);
        this.spreadEffect(new Effect(EffectType.LandValue, 0.5), 5, 5, true, 2, 2); //Some higher land value in the starting corner or it'll be too hard for players to pick up momentum.

        this.lastLongTick = Date.now();
        this.lastShortTick = Date.now();
        this.timeFreeze = true; //Don't let the city do too much on its own while the player is in the tutorial.
    }

    private categorizeBuildingTypes(): void {
        for (const buildingType of this.buildingTypes) {
            if (!this.buildingTypesByCategory.has(buildingType.category)) {
                this.buildingTypesByCategory.set(buildingType.category, []);
            }
            this.buildingTypesByCategory.get(buildingType.category)!.push(buildingType);
        }
    }

    //TODO: This function was a good idea, but let's keep the multiplier at the city level and only modify it when events start and end. Just make sure you round to the nearest one or two decimal places after each multiplication to avoid drift.
    //private getAdjustedBuyPrice(resource: Resource): number {
    //    let adjustedPrice = resource.buyPrice;
    //    // Apply city events that affect buy prices
    //    this.events.forEach(event => {
    //        if (event.affectedResources.includes(resource.type)) {
    //            adjustedPrice *= event.buyPriceMultiplier;
    //        }
    //    });
    //    return adjustedPrice;
    //}

    /**
     * Use this when the player needs to know whether they can fully afford something, i.e., when selecting a building for construction
     * @param costs
     * @returns
     */
    public hasResources(costs: { type: string, amount: number }[], allowDebt = false): boolean {
        let totalCost = 0;
        let rawFlundsCost = costs.find(p => p.type === "flunds")?.amount ?? 0; //If flunds is one of the costs, take care of it first
        const flunds = (this.flunds?.amount ?? 0) - rawFlundsCost;
        if (flunds < 0 && !allowDebt && rawFlundsCost > 0) return false;

        for (const cost of costs) {
            if (cost.type === "flunds") continue;
            const resource = this.resources.get(cost.type);
            if (!resource) return false;

            const insufficientAmount = Math.max(0, cost.amount - resource.amount);
            if (insufficientAmount > 0.0001) {
                const buyableAmount = Math.min(insufficientAmount, resource.buyableAmount);
                if (buyableAmount < insufficientAmount) return false;

                totalCost += buyableAmount * resource.buyPrice * resource.buyPriceMultiplier;
            }
        }

        return totalCost === 0 || totalCost <= flunds || allowDebt;
    }

    //Same function again, but this time we need to return the total flunds cost (add it to the list of costs we output if it isn't already one of them in the input) and the amount that we DO have of each resource (up to the actual cost in terms of that resource type)
    public calculateFinalCosts(costs: { type: string, amount: number }[], copies: number = 1): { type: string, amount: number, reddize?: boolean }[] {
        const flundsCost = { type: "flunds", amount: 0, reddize: false };
        const finalCosts: { type: string, amount: number, reddize?: boolean }[] = [flundsCost];

        for (const cost of costs) {
            if (cost.type === "flunds") {
                flundsCost.amount += cost.amount * copies;
                continue;
            }
            const resource = this.resources.get(cost.type);
            if (!resource) return [];

            const multipliedCost = cost.amount * copies;
            const insufficientAmount = Math.max(0, multipliedCost - resource.amount);
            if (insufficientAmount > 0.0001) {
                const buyableAmount = Math.min(insufficientAmount, resource.buyableAmount);
                flundsCost.amount += buyableAmount * resource.buyPrice * resource.buyPriceMultiplier;
                if (buyableAmount < insufficientAmount) { //Count the buyable amount toward flunds, but don't consider this resource's amount acceptable
                    finalCosts.push({ type: cost.type, amount: multipliedCost - buyableAmount, reddize: true });
                    continue;
                }
            }
            finalCosts.push({ type: cost.type, amount: multipliedCost - insufficientAmount });
        }

        flundsCost.reddize = flundsCost.amount > this.flunds.amount;
        return finalCosts;
    }

    /**
     * Use this when you know you need the full cost available, i.e., when constructing buildings
     * @param costs
     * @returns
     */
    public checkAndSpendResources(costs: { type: string, amount: number }[], allowDebt = false): boolean {
        if (!this.hasResources(costs, allowDebt)) return false;

        let totalCost = costs.find(p => p.type === "flunds")?.amount ?? 0; //If flunds is one of the costs, take care of it first

        for (const cost of costs) {
            if (cost.type === "flunds") continue;
            const resource = this.resources.get(cost.type);
            if (!resource) return false;

            if (cost.amount < 0) { //Actually a reward--used for demolition of some natural blockers, for example
                this.transferResourcesFrom([{ amount: -cost.amount, type: cost.type }], "earn"); //Specifically using this because it has the auto-sell code in it
                continue;
            }

            const insufficientAmount = Math.max(0, cost.amount - resource.amount);
            if (insufficientAmount > 0.0001) {
                const buyableAmount = insufficientAmount; //No need for Math.min here; we've already checked that the city has enough resources to cover the cost
                totalCost += buyableAmount * resource.buyPrice * resource.buyPriceMultiplier;

                resource.amount += buyableAmount;
                resource.buyableAmount -= buyableAmount;
            }

            resource.consume(cost.amount);
            this.resourceEvents.push({ type: resource.type, event: "consume", amount: cost.amount });
        }

        this.flunds.consume(totalCost);
        return true;
    }

    /**
     * Use this when you know you're allowed to spend just a portion of the total cost, i.e., when allocating resources to production buildings or performing research.
     * @param costs
     * @returns
     */
    public calculateAffordablePortion(costs: { type: string, amount: number }[], allowDebt = false): number {
        let totalCost = 0;
        const flunds = this.flunds.amount;
        let maxPortion = 1;

        for (const cost of costs) {
            const resource = this.resources.get(cost.type);
            if (!resource) return 0;
            if (resource.type === "flunds" || cost.amount === 0) {
                totalCost += cost.amount;
                continue;
            }

            const neededAmount = Math.max(0, cost.amount - resource.amount);
            if (neededAmount > 0) {
                const buyableAmount = Math.min(neededAmount, resource.buyableAmount);
                totalCost += buyableAmount * resource.buyPrice * resource.buyPriceMultiplier;

                const resourcePortion = (cost.amount - neededAmount + buyableAmount) / cost.amount;
                maxPortion = Math.min(maxPortion, resourcePortion);
            }
        }

        if (totalCost === 0 || totalCost <= flunds || allowDebt) return maxPortion;

        // Calculate break-even point using a binary search //TODO: I'm pretty sure it's possible to calculate more directly. It's a pretty simple linear system of equations. Find x where Ax + Bx + ... = availableFlunds
        let lowPortion = 0;
        let highPortion = maxPortion;
        const epsilon = 0.0001; // Small value for floating-point comparison

        while (highPortion - lowPortion > epsilon) {
            const midPortion = (lowPortion + highPortion) / 2;
            let portionCost = 0;

            for (const cost of costs) {
                const resource = this.resources.get(cost.type);
                if (!resource) return 0;
                if (resource.type === "flunds") {
                    portionCost += cost.amount * midPortion;
                    continue;
                }

                const neededAmount = Math.max(0, cost.amount * midPortion - resource.amount);
                if (neededAmount > 0) {
                    const buyableAmount = Math.min(neededAmount, resource.buyableAmount);
                    portionCost += buyableAmount * resource.buyPrice * resource.buyPriceMultiplier;
                }
            }

            if (portionCost > flunds && !allowDebt) {
                highPortion = midPortion;
            } else {
                lowPortion = midPortion;
            }
        }

        return lowPortion;
    }

    unlock(buildingTypeId: string): void {
        const buildingType = this.buildingTypes.find(bt => bt.type === buildingTypeId);
        if (buildingType) {
            buildingType.locked = false;
        }
    }

    hasUnplacedBuilding(buildingType: Building): boolean {
        // Check if there's an unplaced copy of the building in the player's inventory
        return !!this.unplacedBuildings.find(b => b.type === buildingType.type);
    }

    canAffordBuilding(buildingType: Building): boolean {
        if (this.hasUnplacedBuilding(buildingType)) return true;
        return this.hasResources(buildingType.getCosts(this));
    }

    getUnplacedBuildingCount(buildingType: Building): number {
        return this.unplacedBuildings.filter(b => b.type === buildingType.type).length;
    }

    canAffordBuildings(buildingType: Building, count: number): boolean {
        count -= this.getUnplacedBuildingCount(buildingType);
        if (count <= 0) return true;
        const costs = buildingType.getCosts(this);
        costs.forEach(cost => cost.amount *= count);
        return this.hasResources(costs);
    }

    canAffordDemolition(buildingType: Building) {
        const costs = buildingType.getDemolitionCosts(this);
        return this.hasResources(costs);
    }

    private getLastUnplacedBuildingIndex(buildingType: Building): number { //Reversed so the last one added to the inventory is the first one the player gets to place
        for (let x = this.unplacedBuildings.length - 1; x >= 0; x--) {
            if (this.unplacedBuildings[x].type === buildingType.type) return x;
        }
        return -1;
    }

    subtractBuildingCosts(buildingType: Building): Building {
        //Remove from inventory instead of subtracting the construction cost
        if (this.hasUnplacedBuilding(buildingType)) {
            return this.unplacedBuildings.splice(this.getLastUnplacedBuildingIndex(buildingType), 1)[0];
        }

        if (this.checkAndSpendResources(buildingType.getCosts(this))) return buildingType.clone();
        return buildingType.clone(); //TODO: Spit out an error instead on this line if the cost requirements are no longer met
    }

    private applyPower(building: Building, multiplier: number) { //NOTE: Techs that affect power upkeep and are adopted gradually make this incorrect, as would machine epsilon. I don't think it's super important.
        const power = this.resources.get('power')!;
        this.desiredPower += multiplier * building.getPowerUpkeep(this, true);
        const production = multiplier * building.getPowerProduction(this); //Considered using productionRate, but if power is variable...
        power.amount += production; //To make it apply more quickly when you place a new power producer.
        power.productionRate += production;
    }

    //Also notifies the player
    public checkAndAwardTitle(achievementId: string): boolean {
        const title = this.titles.get(achievementId);
        if (title && !title.attained && (title.lastProgress = title.checkCondition(this.player, this)) >= 1) {
            title.attained = true;
            title.attainedDate = new Date();
            this.notify(new Notification("Title attained!", `City title "${title.name}" attained! Congrats! Your permanent reward: ${title.rewardDescription}`));
            return true;
        }
        return false;
    }

    public checkAndAwardAchievement(achievementId: string): boolean {
        const achievement = this.player.achievements.find(p => p.id === achievementId);
        if (achievement && !achievement.attained && (achievement.lastProgress = achievement.checkCondition(this.player, this)) >= 1) {
            achievement.attained = true;
            achievement.attainedDate = new Date();
            function punc(mark: string): string {
                return achievement!.name + ((achievement!.name.endsWith(".") || achievement!.name.endsWith("!") || achievement!.name.endsWith("?")) ? "" : (mark));
            }
            const possibleMessages = [`"${achievement.name}" achieved! Time to update your resume with this totally relevant life skill.`,
            `You can now proudly tell your friends that you obtained "${punc('.')}" I mean, maybe. I dunno. Maybe you aren't proud of it? I would be, though.`,
            `You've done it! "${achievement.name}" is yours. Feel free to brag about it at parties. I'm sure everyone will be impressed.`,
            `Alert the media! You've nabbed "${punc('.')}" This is clearly the pinnacle of human achievement.`,
            `"${achievement.name}" unlocked! Your cat remains unimpressed, but I think it's pretty neat.`,
            `Behold, the mighty conqueror of "${punc('!')}" May songs be sung of your digital deeds for generations to come.`,
            `You've unlocked "${punc('.')}" It's like winning the lottery, but without any actual money or life-changing benefits!`,
            `"${achievement.name}" is now yours! I'd give you a trophy, but you'll have to settle for this snarky message instead.`,
            `Congratulations! You've unlocked "${punc('.')}" Now, if only you could unlock the secrets of the universe...like me.`
            ];
            this.notifyPlayer(new Notification("Achievement unlocked!", possibleMessages[Math.floor(Math.random() * possibleMessages.length)]));
            return true;
        }
        return false;
    }

    public notify(notice: Notification): void {
        this.notifications.push(notice);
        if (this.notifications.length > 10) this.notifications.splice(0, this.notifications.length - 10);
    }

    public notifyPlayer(notice: Notification): void {
        this.player.notifications.push(notice);
        if (this.player.notifications.length > 10) this.player.notifications.splice(0, this.player.notifications.length - 10);
    }

    addBuilding(building: Building, x: number | null = null, y: number | null = null): void {
        if (!building.id) building.id = this.nextBuildingID++; //Assumes buildings are never GRANTED to the city without also being built at that time--or we also need to do this same thing when granting buildings.
        this.buildings.push(building);
        building.place(this, x ?? building.x, y ?? building.y);
        this.placeOnGrid(building);
        this.presentBuildingCount.set(building.type, (this.presentBuildingCount.get(building.type) ?? 0) + 1);
        building.placed(this);

        //Ensure the thing built on top is always listed BEFORE the thing it's built on, in case the built-on-top one needs to fuel the other.
        const builtOn = building.builtOn.values().next().value as Building | undefined;
        if (builtOn) {
            const builtOnIndex = this.buildings.findIndex(p => p === builtOn);
            const myIndex = this.buildings.length - 1; //Same as this.buildings.findLastIndex(p => p === building);
            if (builtOnIndex < myIndex) {
                this.buildings[myIndex] = builtOn;
                this.buildings[builtOnIndex] = building;
            }
        }

        if (building instanceof PostOffice) this.postOffice = building;

        //Achievement/title checks that depend on building presence
        if (building.isRestaurant) this.checkAndAwardTitle(TitleTypes.CulinaryCapital.id);
        if (building instanceof SmallPark || building instanceof MediumPark && !this.player.achievements.find(p => p.id === AchievementTypes.OopsAllParks.id)?.attained) {
            //Check that ANY 5x5 area around this park has NO empty tiles and ONLY park buildings--a near-optimal way to check if the player just earned this achievement.
            const nonParkCounts = new Map<Building, number>(); //A set of buildings and their tile counts, so we can add/remove buildings in O(1) time.
            const emptyTiles = new Set<number>(); //A single number representing the x + y * width of each empty tile
            this.convolution(building, 5, 5, (b, x, y) => {
                if (b && !(b instanceof SmallPark || b instanceof MediumPark)) {
                    nonParkCounts.set(b, (nonParkCounts.get(b) ?? 0) + 1);
                } else if (!b) {
                    emptyTiles.add(x + y * this.width);
                }
            }, (b, x, y) => {
                if (b && !(b instanceof SmallPark || b instanceof MediumPark)) {
                    const count = nonParkCounts.get(b)!;
                    if (count === 1) nonParkCounts.delete(b);
                    else nonParkCounts.set(b, count - 1);
                } else if (!b) {
                    emptyTiles.delete(x + y * this.width);
                }
            }, () => {
                if (nonParkCounts.size || emptyTiles.size) return false;
                return this.checkAndAwardAchievement(AchievementTypes.OopsAllParks.id);
            });
        }
        if (building instanceof Bar || building instanceof Casino || building instanceof GregsGrogBarr || building instanceof ElementarySchool) this.checkAndAwardAchievement(AchievementTypes.UrbanPlannerExtraordinaire.id);
    }

    //An example, not needed for parks
    //    private convolutionForBuildingCount(building: Building) {
    //        const parkCounts = new Map<Building, number>(); //A set of buildings and their tile counts, so we can add/remove buildings in O(1) time.
    //        this.convolution(building, 5, 5, (b, x, y) => {
    //            if (b instanceof SmallPark || b instanceof MediumPark) {
    //                parkCounts.set(b, (parkCounts.get(b) ?? 0) + 1);
    //            }
    //        }, (b, x, y) => {
    //            if (b instanceof SmallPark || b instanceof MediumPark) {
    //                parkCounts.set(b, (parkCounts.get(b) ?? 0) - 1);
    //            }
    //        }, () => {
    //            const distinctBuildings = Array.from(parkCounts.values()).filter(p => p > 0).length;
    //            if (distinctBuildings >= 5) this.checkAndAwardAchievement(AchievementTypes.Whatever.id);
    //        });
    //    }

    //Function for sliding window checks of any sort within a given area--parameters are addToWindow and removeFromWindow, and we pass in the coordinates and building at that coordinate.
    convolution(origin: Building, windowWidth: number, windowHeight: number, addToWindow: (building: Building | null, x: number, y: number) => void,
        removeFromWindow: (building: Building | null, x: number, y: number) => void, checkpoint: () => boolean): void {
        const startX = Math.max(0, origin.x - windowWidth + 1);
        const endX = Math.min(this.width - windowWidth, origin.x + origin.width - 1);
        const startY = Math.max(0, origin.y - windowHeight + 1);
        const endY = Math.min(this.height - windowHeight, origin.y + origin.height - 1);
        if (endX < startX || endY < startY) return; //No need to do anything if the window is empty, though that shouldn't happen.

        let currentX = startX;
        let currentY = startY;
        let direction = 1; // 1 for left to right, -1 for right to left. We alternate this each row for efficiency.

        // Initial window population
        for (let y = startY; y < startY + windowHeight; y++) {
            for (let x = startX; x < startX + windowWidth; x++) {
                if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
                    addToWindow(this.grid[y][x], x, y);
                }
            }
        }
        if (checkpoint()) return;

        while (currentY <= endY) {
            while ((direction === 1 && currentX <= endX) || (direction === -1 && currentX >= startX)) {
                // Move window horizontally, which requires removing the leftmost or rightmost column and adding the new column on the opposite end
                if (currentX !== startX && currentX !== endX) { //At startX and endX, we just moved vertically, so no need to add or remove anything.
                    for (let y = currentY; y < currentY + windowHeight; y++) {
                        if (y >= 0 && y < this.height) {
                            const removeX = currentX - direction * windowWidth;
                            if (removeX >= 0 && removeX < this.width) {
                                removeFromWindow(this.grid[y][removeX], removeX, y);
                            }
                            if (currentX >= 0 && currentX < this.width) {
                                addToWindow(this.grid[y][currentX], currentX, y);
                            }
                        }
                    }
                    if (checkpoint()) return; //One column added, one column removed. We're exactly the requested window size at this point.
                }

                currentX += direction;
            }

            // Adjust for overshooting at the end of each row
            currentX -= direction;

            // Move down one row
            if (currentY !== endY) {
                for (let x = currentX; x < currentX + windowWidth; x++) {
                    if (x >= 0 && x < this.width) {
                        removeFromWindow(this.grid[currentY][x], x, currentY);
                    }
                    if (currentY + windowHeight < this.height && x >= 0 && x < this.width) {
                        addToWindow(this.grid[currentY + windowHeight][x], x, currentY + windowHeight);
                    }
                }
                if (checkpoint()) return;
            }

            currentY++;
            direction *= -1; // Change direction
            currentX += direction; // Start from the opposite side
        }
    }

    removeBuilding(building: Building, demolish: boolean = false, justMoving: boolean = false): void { //Demolition costs go elsewhere.
        this.buildings.splice(this.buildings.findIndex(p => p == building), 1);
        if (!demolish) this.unplacedBuildings.push(building); //Store for later.
        else this.presentBuildingCount.set(building.type, (this.presentBuildingCount.get(building.type) ?? 0) - 1); //Demolish = no longer owned.
        this.removeFromGrid(building);
        building.remove(this, justMoving);

        if (!this.flags.has(CityFlags.UnlockedMonobrynth) && building instanceof MysteriousRubble && this.buildings.some(p => p instanceof AlienMonolith && p.owned)) {
            this.notify(new Notification("Monobrynth Unlocked", "Beneath the mysterious rubble, we found an even more mysterious monolith. Play the Monobrynth minigame to explore it via the right sidebar.", "monobrynth"));
            this.flags.add(CityFlags.UnlockedMonobrynth);
            const plays = this.resources.get(new ResourceTypes.MonobrynthPlays().type)!;
            plays.produce(plays.productionRate * LONG_TICKS_PER_DAY); //Freebie for the first day
        }
    }

    transferResourcesFrom(resources: { type: string, amount: number }[], reason: "produce" | "earn"): void {
        //Take from each of the given resources until the city is at max capacity for that resource type.
        resources.forEach(resource => {
            let cityResource = this.resources.get(resource.type)!;

            //Check the auto-sell limits. If the city WILL HAVE more than the limit, sell the excess.
            const amountToKeep = Math.min(Math.floor(cityResource.autoSellAbove * cityResource.capacity) - cityResource.amount, resource.amount);
            cityResource.amount += amountToKeep;
            resource.amount -= amountToKeep;
            this.resourceEvents.push({ type: resource.type, event: reason, amount: resource.amount });

            //Sell the rest
            if (resource.amount) {
                this.sell(cityResource, resource.amount);
                resource.amount = 0;
            }
        });
        this.checkAndAwardTitle(TitleTypes.Carnivorism.id);
    }

    sell(cityResource: Resource, amount: number) {
        this.flunds.amount += cityResource.sellPrice * cityResource.sellPriceMultiplier * amount;
        if (this.constructionResourceTypes.has(cityResource.type)) this.recentConstructionResourcesSold += amount;
        this.resourceEvents.push({ type: cityResource.type, event: "sell", amount: amount });

        //Resource Tycoon requires both producing AND selling, so check it both places
        this.checkAndAwardAchievement(AchievementTypes.ResourceTycoon.id);
    }

    //Depth-first search for connected buildings or roads; it's really just a flood-fill since there's no stopping condition (just a what-to-include condition)
    dfs(condition: (building: Building) => boolean, x: number, y: number, visited: Set<number>, includeButNoTraversal?: (building: Building) => boolean): void {
        const key = y * this.width + x;
        if (visited.has(key)) return;

        const building = this.grid[y]?.[x];
        if (!building) return;
        if (!condition(building)) {
            if (includeButNoTraversal && includeButNoTraversal(building)) visited.add(key);
            return;
        }

        visited.add(key);
        this.dfs(condition, x, y - 1, visited, includeButNoTraversal);
        this.dfs(condition, x, y + 1, visited, includeButNoTraversal);
        this.dfs(condition, x - 1, y, visited, includeButNoTraversal);
        this.dfs(condition, x + 1, y, visited, includeButNoTraversal);
    }

    visitedSetToBuildings(visited: Set<number>): Set<Building> {
        const visitedBuildings = new Set<Building>();
        [...visited.entries()].forEach(kvp => {
            const x = kvp[0] % this.width;
            const y = Math.floor(kvp[0] / this.width);
            const b = this.grid[y][x];
            if (b) visitedBuildings.add(b);
        });
        return visitedBuildings;
    }

    //Because we want to 'connect the road' to buildings that are built on the given one so their road connectivity always matches its own.
    setRoadConnected(building: Building, isConnected: boolean, cascade: boolean = false): void {
        building.roadConnected = isConnected;

        //There could be two buildings built on top of each other, but only one of them will get the message directly from the placeOnGrid/removeFromGrid functions.
        //Don't allow more than two recursive calls, to avoid infinite alternating between lower and upper layer buildings, though that means we can't build 3-tier buildings.
        //However, this does allow an upper building to call it for the lower building, which can then call it for the upper building again--desirable because there may be 2 upper buildings.
        if (cascade && building.builtOn.size) return;

        //Check if this building has been built on. If it has, the road connectivity should match for the others that are built on it.
        this.getBuildingsInArea(building.x, building.y, building.width, building.height, 0, 0).forEach(b => {
            if (b !== building && b.builtOn.has(building) && b.owned && building.owned) this.setRoadConnected(b, isConnected, true);
        });

        //Also check if this building was built on another. Note that either the building beneath or the building atop could be the one that's directly connected to the road--and if the top one doesn't fully cover the other, then both could be.
        if (building.builtOn.size) building.builtOn.forEach(p => this.setRoadConnected(p, isConnected, true));
    }

    placeOnGrid(building: Building): void {
        const affectedByBuildingSet = new Set<Building>();
        affectedByBuildingSet.add(building); //So it doesn't count toward affecting itself
        for (let y = 0; y < building.height; y++) {
            for (let x = 0; x < building.width; x++) {
                let builtOn = this.grid[building.y + y][building.x + x];

                //Remove any homes you're placing on top of.
                if (builtOn?.isResidence) {
                    this.removeBuilding(builtOn, true);
                    builtOn = null; //Don't care to remember what it was built on. That'd just be a memory leak, since we just demolished it.
                }

                //Apply the building's footprint to the tiles, except where the footprint is empty anyway.
                if (building.stampFootprint[y][x] !== FootprintType.EMPTY) {
                    if (builtOn) building.builtOn.add(builtOn); //Remember what all this building was built on top of
                    this.grid[building.y + y][building.x + x] = building;

                    //Update affectingBuildingCount for any buildings that are now affecting this one--mainly for city services. Ignore roads.
                    if (!building.isRoad) {
                        for (let i = 0; i < this.effectGrid[building.y + y][building.x + x].length; i++) {
                            const effect = this.effectGrid[building.y + y][building.x + x][i];
                            if (effect.building && !affectedByBuildingSet.has(effect.building)) {
                                effect.building.affectingBuildingCount++;
                                affectedByBuildingSet.add(effect.building);
                            }
                        }
                    }
                }
            }
        }

        this.setRoadConnected(building, building.powerConnected = (building === this.networkRoot));

        //Get the cardinal-direction-adjacent buildings for the road and power connectivity checks
        const adjacentBuildings = this.getBuildingsInArea(building.x, building.y, building.width, building.height, 1, 1, true);
        //If it's built on something, also check all around the building(s) it's built on.
        building.builtOn.forEach(p => { if (p.owned) this.getBuildingsInArea(p.x, p.y, p.width, p.height, 1, 1, true).forEach(q => adjacentBuildings.add(q)); });
        const adjacentRoads = [...adjacentBuildings].filter(b => b.isRoad);
        //TODO: This has flaws for bigger roads, but I haven't exactly decided to implement those.

        if (adjacentRoads.some(r => r.roadConnected)) {
            if (building.isRoad) {
                const roadConnected = new Set<number>();
                this.dfs((building: Building) => building.isRoad && !building.roadConnected, building.x, building.y, roadConnected, (building: Building) => !building.roadConnected);
                [...roadConnected.entries()].forEach(kvp => {
                    const x = kvp[0] % this.width;
                    const y = Math.floor(kvp[0] / this.width);
                    const b = this.grid[y][x];
                    if (b) this.setRoadConnected(b, true);
                });

                //Only check for Traffic Chaos Theory when placing a road *connected to the grid*. It's not super optimized, though--it looks through the whole map 3x, basically.
                this.checkAndAwardAchievement(AchievementTypes.TrafficChaosTheory.id);
            }
            else this.setRoadConnected(building, true);
        }

        //If any of the 4 cardinal directions are connected to power, flood-fill building.powerConnected and also add their power production to the network.
        if ([...adjacentBuildings].some(p => p.powerConnected)) {
            const powerConnected = new Set<number>();
            this.dfs((building: Building) => !building.powerConnected, building.x, building.y, powerConnected);

            //Have to remap from coordinates to a set because we need to avoid executing applyPower multiple times on the same building
            const buildings = new Set([...powerConnected.entries()].map(kvp => this.grid[Math.floor(kvp[0] / this.width)][kvp[0] % this.width]));
            buildings.forEach(b => {
                if (b) {
                    b.powerConnected = true;
                    this.applyPower(b, 1);
                }
            });
        }
    }

    //If the effect contains a building, the effect will spread from there. Otherwise, you need to specify x and y, and you should basically only do that for land value when generating the city, I guess. (After all, I don't have a method for removing effects that didn't come from a building.)
    spreadEffect(effect: Effect, xRadius: number, yRadius: number, rounded: boolean = false, x: number = 0, y: number = 0): void {
        const tiles = this.getTilesInArea(effect.building?.x ?? x, effect.building?.y ?? y, effect.building?.width ?? 1, effect.building?.height ?? 1, xRadius, yRadius, rounded);
        tiles.forEach(tile => this.effectGrid[tile.y][tile.x].push(effect));
    }
    stopEffects(building: Building, xRadius: number, yRadius: number, rounded: boolean = false): void {
        const tiles = this.getTilesInArea(building.x, building.y, building.width, building.height, xRadius, yRadius, rounded);
        tiles.forEach(tile => this.effectGrid[tile.y][tile.x] = this.effectGrid[tile.y][tile.x].filter(p => p.building !== building));
    }

    removeFromGrid(building: Building): void {
        const affectedByBuildingSet = new Set<Building>();
        affectedByBuildingSet.add(building); //So it doesn't count toward affecting itself
        for (let y = 0; y < building.height; y++) {
            for (let x = 0; x < building.width; x++) {
                if (this.grid[building.y + y][building.x + x] === building) {
                    this.grid[building.y + y][building.x + x] = null;
                    //Replace whatever was beneath this building before if its checkFootprint type indicates that it can/must be built on something (ignoring Residence and Occupied as special cases)
                    if ((building.checkFootprint[y][x] & FootprintType.MUST_BE_ON) !== 0) {
                        building.builtOn.forEach(builtOn => {
                            //Check if builtOn is the correct building for this position.
                            if (builtOn.x <= building.x + x && builtOn.x + builtOn.width > building.x + x && builtOn.y <= building.y + y && builtOn.y + builtOn.height > building.y + y) {
                                this.grid[building.y + y][building.x + x] = builtOn;
                            }
                        });
                    }

                    //Update affectingBuildingCount for any buildings that are now affecting this one--mainly for city services. Ignore roads.
                    if (!building.isRoad) {
                        for (let i = 0; i < this.effectGrid[building.y + y][building.x + x].length; i++) {
                            const effect = this.effectGrid[building.y + y][building.x + x][i];
                            if (effect.building && !affectedByBuildingSet.has(effect.building)) {
                                effect.building.affectingBuildingCount--;
                                affectedByBuildingSet.add(effect.building);
                            }
                        }
                    }
                }
            }
        }

        //Flood-fill from the root to find out what buildings are still connected.
        if (building.isRoad) {
            const roadConnected = new Set<number>(); //Set is full of "y * width + x" values
            this.dfs((building: Building) => building.isRoad, this.networkRoot.x, this.networkRoot.y, roadConnected);
            //Now, from there, find all the roads NOT in that set and set roadConnected to false.
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const road = this.grid[y][x];
                    let tileAffected = false;
                    if (road?.roadConnected && road.isRoad && !roadConnected.has(y * this.width + x)) {
                        this.setRoadConnected(road, false);
                        tileAffected = true;
                    }
                    if (tileAffected || (x === building.x && y === building.y)) { //The removed road also needs to do this check, hence it not being inside the above if statement.
                        //Check all buildings adjacent to this road tile. They should be disconnected if they are no longer adjacent to a road-connected road.
                        //If the adjacent building is built on something else, we need to check that NONE of its built-on buildings are connected-road-adjacent instead of just checking that one building.
                        const adjacentBuildings = this.getBuildingsInArea(x, y, 1, 1, 1, 1, true, true);
                        adjacentBuildings.forEach(b => {
                            if (b.builtOn.size && [...b.builtOn].some(p => p.owned)) {
                                if (b.roadConnected && ![...b.builtOn].some(p => p.owned && [...this.getBuildingsInArea(p.x, p.y, p.width, p.height, 1, 1, true, false)].filter(q => q.isRoad && q.roadConnected).length)) this.setRoadConnected(b, false);
                            } else {
                                if (b.roadConnected && ![...this.getBuildingsInArea(b.x, b.y, b.width, b.height, 1, 1, true, false)].filter(p => p.isRoad && p.roadConnected).length) this.setRoadConnected(b, false);
                            }
                        });
                    }
                }
            }
        }

        //Similar for buildings not connected to the power network. Owned buildings and unowned roads (namely, the network root, but also any other nonremovable roads) carry power. Basically, not foliage and stuff.
        const powerConnected = new Set<number>();
        this.dfs((building: Building) => building.owned || building.isRoad, this.networkRoot.x, this.networkRoot.y, powerConnected);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const building = this.grid[y][x];
                if (building?.powerConnected && !powerConnected.has(y * this.width + x)) {
                    building.powerConnected = false; //but it may still HAVE power until the next short tick
                    this.applyPower(building, -1);
                }
            }
        }

        //Remove this building's power from the grid, too--guaranteed since we removed the building itself.
        this.applyPower(building, -1);
        building.powerConnected = false;
    }

    getCellType(x: number, y: number): FootprintType {
        const building = this.grid[y][x];
        return building ? building.stampFootprint[y - building.y][x - building.x] : FootprintType.EMPTY;
    }

    //Need to account for builtOn when moving a building, e.g., geothermal power plant thinks you can place it 1 tile over and inch it over like that until it's way off the vent.
    getCellTypeUnderBuilding(x: number, y: number, building: Building): FootprintType {
        if (building === this.grid[y][x]) {
            for (const placedOn of building.builtOn) {
                if (placedOn.x <= x && placedOn.x + placedOn.width > x && placedOn.y <= y && placedOn.y + placedOn.height > y) {
                    return placedOn.stampFootprint[y - placedOn.y][x - placedOn.x];
                }
            }
            return FootprintType.EMPTY;
        } else return this.getCellType(x, y);
    }

    getBuildingsInArea(x: number, y: number, width: number, height: number, xRadius: number, yRadius: number, rounded: boolean = false, skipRoads: boolean = false): Set<Building> {
        return <Set<Building>>new Set([...this.getTilesInArea(x, y, width, height, xRadius, yRadius, rounded)].map(tile => this.grid[tile.y][tile.x]).filter(p => p !== null && (!skipRoads || !p.isRoad)));
    }

    //Includes the area of the given building itself.
    getTilesInArea(x: number, y: number, width: number, height: number, xRadius: number, yRadius: number, rounded: boolean = false): Set<{ x: number, y: number }> {
        //The 'raw' numbers are kept separate for the "rounded" check (exclude just the corner cells)
        const rawLeft = x - xRadius;
        const rawRight = x + xRadius + width - 1;
        const rawTop = y - yRadius;
        const rawBottom = y + yRadius + height - 1;
        //Those are inclusive because I wanted to do an exact equality check in the loop, but areaTop and areaBottom are exclusive, so gotta add 1 to them
        const areaLeft = Math.max(0, rawLeft);
        const areaRight = Math.min(this.width, rawRight + 1);
        const areaTop = Math.max(0, rawTop);
        const areaBottom = Math.min(this.height, rawBottom + 1);

        const tilesInArea: Set<{ x: number, y: number }> = new Set();
        for (let gridY = areaTop; gridY < areaBottom; gridY++) {
            for (let gridX = areaLeft; gridX < areaRight; gridX++) {
                //Leave off just the farthest-out corners if rounded. Should really only apply to calls where both radii are 1 for doing cardinal direction adjacency checks.
                if (rounded && (gridY === rawTop || gridY === rawBottom) && (gridX === rawLeft || gridX === rawRight)) continue;
                tilesInArea.add({ x: gridX, y: gridY });
            }
        }

        return tilesInArea;
    }

    * sortBuildingsIsometric(): Generator<Building> {
        //Sorting is more efficient than the grid for small numbers relative to the grid size
        //Note: Neither method will work for irregular or even non-square buildings unless they're completely flat.
        if (this.buildings.length * Math.log(this.buildings.length) < this.width * this.height) {
            //This can't return the whole set because it's a generator function.
            for (const building of this.buildings.slice().sort((a, b) => (a.y + a.x + a.width / 2 + a.height / 2) - (b.y + b.x + b.width / 2 + b.height / 2) - (b.builtOn.size - a.builtOn.size) * 0.01)) {
                yield building;
            }
            for (const building of this.drawInFrontBuildings) yield building;
            return;
        }

        const maxDiagonal = this.width + this.height - 2;
        const renderedBuildings = new Set<Building>();

        for (let diagonal = 0; diagonal <= maxDiagonal; diagonal++) {
            for (let x = 0; x <= diagonal; x++) {
                const y = diagonal - x;
                if (y >= this.height || x >= this.width) continue; //handles the fact that "x <= diagonal" lets x go out of bounds after reaching the midpoint

                const building = this.grid[y][x];
                if (!building || renderedBuildings.has(building)) continue;

                const leftmostY = building.y + building.height - 1;
                const leftmostX = building.x;

                //This mainly just makes the coal power plant not disappear when you put a coal truck on it. Also built-on things that are exactly the same size.
                if (building.builtOn.size) {
                    for (const builtOn of building.builtOn) {
                        const builtOnX = builtOn.x;
                        const builtOnY = builtOn.y + builtOn.height - 1;
                        if (builtOnY === y && builtOnX === x && builtOn.stampFootprint[builtOn.height - 1][0] !== FootprintType.EMPTY) {
                            yield builtOn;
                            renderedBuildings.add(builtOn);
                            break;
                        }
                    }
                }

                if (y === leftmostY && x === leftmostX) {
                    // Check if the leftmost tile is intended to be occupied by this building
                    if (building.stampFootprint[building.height - 1][0] !== FootprintType.EMPTY) {
                        yield building;
                        renderedBuildings.add(building);
                    } else {
                        // Find the first non-empty tile along the same diagonal--should be the first tile of that building encountered, but check that to ensure we only render the building once
                        for (let i = 1; i < building.width; i++) {
                            const checkY = leftmostY - i;
                            const checkX = leftmostX + i;
                            if (checkY < building.y || checkX >= building.x + building.width) break;
                            if (building.stampFootprint[checkY - building.y][checkX - building.x] !== FootprintType.EMPTY) {
                                yield building;
                                renderedBuildings.add(building);
                                break;
                            }
                        }
                    }
                }
            }
        }

        for (const building of this.drawInFrontBuildings) yield building;
    }

    getBuyCapacity(type: Resource) { //Amount of each resource that you're allowed to buy in a 5-day period (rolling)
        let buyCapacity = 20;
        const increments = [1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000, 55000, 66000, 78000, 91000];
        const incrementValue = 5;
        for (const increment of increments) {
            if (this.peakPopulation < increment) break;
            buyCapacity += incrementValue;
        }

        //Price changes the market limits a bit. I should really just have rarity instead, but I'm not unhappy with how it works out. Main problem is buying uranium/tritium, so I'll *increase* that limit instead.
        if (type.buyPrice >= 9 && this.peakPopulation >= 6000) buyCapacity += Math.ceil(Math.log(this.peakPopulation - 5999)); //You really need to be able to afford your late-game power producers--uranium and tritium cannot be produced.
        else if (type.buyPrice >= 6) buyCapacity *= 0.6; //12, 15, 18, ... or per day, 3, 3.75, 4.5, 5.25, ...
        else if (type.buyPrice >= 4) buyCapacity *= 0.8; //16, 20, 24, ... or per day, 3, 4, 5, 6, 7...

        return buyCapacity;
    }

    autoSell(resource: Resource): void {
        //Sell down to the "auto-sell above" amount
        if (resource.amount > Math.floor(resource.autoSellAbove * resource.capacity)) {
            const excess = resource.amount - Math.floor(resource.autoSellAbove * resource.capacity);
            this.sell(resource, excess);
            resource.amount -= excess;
        }
    }

    autoBuy(resource: Resource): void {
        //Buy up to the auto-buy amount, but don't go into debt for it.
        if (resource.amount < Math.floor(resource.autoBuyBelow * resource.capacity) && this.flunds.amount > 0) {
            const needed = Math.floor(resource.autoBuyBelow * resource.capacity) - resource.amount;
            if (resource.buyPrice === 0 || resource.buyPriceMultiplier === 0) throw new Error("Resource " + resource.type + " has a buy price of 0.");
            const affordableAmount = Math.min(needed, this.flunds.amount / (resource.buyPrice * resource.buyPriceMultiplier));
            this.flunds.consume(affordableAmount * resource.buyPrice * resource.buyPriceMultiplier);
            resource.amount += affordableAmount;
            this.resourceEvents.push({ type: resource.type, event: "buy", amount: affordableAmount });
        }
    }

    consume(resourceType: string, amount: number) {
        const resource = this.resources.get(resourceType)!;
        resource.consume(amount);
        this.resourceEvents.push({ type: resourceType, event: "consume", amount: amount });
        this.autoBuy(resource); //Checked immediately because you may not have enough in stock for paying all your upkeep
    }

    produce(resourceType: string, amount: number) { //Mainly for buildings to call when they output an autoCollect resource. Generally, stick to transferResourcesFrom.
        const resource = this.resources.get(resourceType)!;
        resource.produce(amount);
        this.resourceEvents.push({ type: resourceType, event: "produce", amount: amount });

        //Resource Tycoon requires both producing AND selling, so check it both places
        this.checkAndAwardAchievement(AchievementTypes.ResourceTycoon.id);
    } //Note: I'd need a "produced" function if I really wanted to track the production of resources that aren't auto-collected.

    earn(resourceType: string, amount: number) { //Mainly for minigames to call when the player completes something. Other than the resource event type, same as produce().
        const resource = this.resources.get(resourceType)!;
        resource.produce(amount);
        this.resourceEvents.push({ type: resourceType, event: "earn", amount: amount });
    }

    onLongTick(): void {
        //Increase auto-buy amount availability first, but to be nice to the player, don't cap it until the end of the tick
        this.resources.forEach(resource => {
            if (resource.isSpecial) return; //Can't buy happiness. :) ...or flunds, population, tourists, water and power (except as allowed by the hard-coded mechanism), pollution (!?), health, education, crime (!?!?), or research (okay, that's sort-of feasible, but no)
            if (resource.capacity) resource.buyCapacity = Math.min(this.getBuyCapacity(resource), resource.capacity);
            resource.buyableAmount = Math.min(resource.buyCapacity, resource.buyableAmount + resource.buyCapacity * 0.2 / LONG_TICKS_PER_DAY);
        });

        this.updatePopulation();
        this.updateTourists();
        this.techManager.updateAdoptionRates();

        //Traffic can be reduced by up to 80% globally; the rest would have to be (mostly) accounted for by nearby public transportation facilities.
        this.trafficPrecalculation =
            0.3 * this.techManager.getAdoption("graphenebattery") +
            0.2 * this.techManager.getAdoption("dronedelivery") +
            0.2 * this.techManager.getAdoption("autonomousvehicles") +
            0.1 * (this.postOffice?.lastEfficiency || 0);

        //Road upkeep costs don't use quite the same numbers; they can be halved by techs and reduced another 5 percentage points by a well-maintained post office.
        this.roadUpkeepPrecalculation = Math.max(0, (Math.log10(this.peakPopulation) - 2) * (0.5 -
            0.1 * this.techManager.getAdoption('autonomousvehicles') -
            0.15 * this.techManager.getAdoption('dronedelivery') -
            0.025 * (this.postOffice?.lastEfficiency || 0)) * this.budget.serviceAllocations[new Road().serviceAllocationType]);

        const cityFlundsBefore = this.flunds.amount; //Deduct from City Hall first, step 1

        //Produce resources and such first, then spend the upkeep costs, and perform auto-trading as needed while spending those costs
        this.budget.resetLastServiceCosts();
        this.budget.otherExpenses["powerprod"] = 0; //Currently calculated specially--but I may make it part of "lastServiceCosts" at some point; just not sure I want the user poking around with a power production slider.
        this.budget.otherExpenses["agriculture"] = this.budget.otherExpenses["industry"] = 0;
        this.buildings.forEach(building => building.onLongTick(this)); //Note: this is where inputResources consumption and outputResources production happens.
        this.flunds.amount += this.cityHall.flunds.amount; //Deduct from City Hall first, step 2
        const expectedTotalFlunds = this.flunds.amount; //Calculate expenses, step 1
        this.buildings.forEach(building => {
            const costs = building.getUpkeep(this);
            const affordableFraction = this.calculateAffordablePortion(costs, true); //Allows going into debt for upkeep costs, but still can't auto-buy past the limit.
            costs.forEach(upkeep => {
                const finalAmount = upkeep.amount * affordableFraction;
                this.consume(upkeep.type, finalAmount);

                if (upkeep.type !== "flunds") return;
                if (building.serviceAllocationType) this.budget.lastServiceCosts[building.serviceAllocationType] += finalAmount;
                else if (building.category === BuildingCategory.ENERGY) this.budget.otherExpenses["powerprod"] += finalAmount;
                else if (building.category === BuildingCategory.AGRICULTURE) this.budget.otherExpenses["agriculture"] += finalAmount;
                else if (building.category === BuildingCategory.INDUSTRIAL) this.budget.otherExpenses["industry"] += finalAmount;
            });
            building.setUpkeepEfficiency(affordableFraction);
            building.isNew = false;
        });

        this.updateHappiness(); //Do before resetting powered time, because it uses it
        this.updateMinigamePlays();

        //Go back and reset the amount of power consumed during the long tick for each building; this is likely used in efficiency calculations
        this.buildings.forEach(building => building.poweredTimeDuringLongTick = 0);

        //Auto-buy all resources as flunds permit (no debt allowed) up to the requested amounts.
        const beforeAutoBuys = this.flunds.amount;
        this.resources.forEach(resource => {
            if (resource.isSpecial) return; //No auto-buying or selling of flunds...that's what you buy/sell with... or other special resources.
            this.autoBuy(resource);
        });
        this.budget.otherExpenses["resources"] = beforeAutoBuys - this.flunds.amount;

        //Feed the people!
        this.citizenDietSystem.onLongTick();

        //Auto-sell all resources up to the requested amounts.
        this.resources.forEach(resource => {
            if (resource.isSpecial) return; //No auto-buying or selling of flunds...that's what you buy/sell with.
            this.autoSell(resource); //Normally, you sell when collecting, but if you adjust the bars, this takes care of it.
        });

        this.residenceSpawner.onLongTick();

        //Gain about 1 research point a day, or a max of around 5.4 a day for a city of 250k.
        const research = this.resources.get("research")!;
        const innovatorBonus = this.titles.get(TitleTypes.CityOfInnovators.id)?.attained ? 1.1 : 1;
        research.amount += Math.max(1, Math.min(research.productionRate, Math.log10(this.resources.get("population")!.amount) * this.getCityAverageEducation())) * innovatorBonus / LONG_TICKS_PER_DAY;

        //Cap the auto-buy amounts
        this.resources.forEach(resource => resource.buyableAmount = Math.min(resource.buyableAmount, resource.buyCapacity));

        //Adjust recent resources sold--could be a list instead and could drop off the oldest pieces of the list, but for now, just subtract a bit.
        this.recentConstructionResourcesSold = Math.max(0, Math.min(this.recentConstructionResourcesSold * 0.95, this.recentConstructionResourcesSold - 1));

        //Calculate expenses, step 2
        this.flunds.consumptionRate = Math.max(0, expectedTotalFlunds - this.flunds.amount + SHORT_TICKS_PER_LONG_TICK * this.lastImportedPowerCost);
        this.budget.lastServiceCosts["power"] = this.lastImportedPowerCost * SHORT_TICKS_PER_LONG_TICK;

        //Deduct from City Hall first, step 3
        if (this.flunds.amount > cityFlundsBefore) {
            this.cityHall.flunds.amount = this.flunds.amount - cityFlundsBefore;
            this.flunds.amount = cityFlundsBefore;
        } else {
            this.cityHall.flunds.amount = 0;
        }

        //Affect the greenhouse gases pseudo-resource
        if (this.peakPopulation >= GREENHOUSE_GASES_MIN_POPULATION) {
            const greenhouseGases = this.resources.get(new ResourceTypes.GreenhouseGases().type)!;
            greenhouseGases.amount = Math.max(0, greenhouseGases.amount + this.getCityAverageGreenhouseGases() * 0.01);
        }

        this.checkAndAwardTitle(TitleTypes.Carnivorism.id);
        this.checkAndAwardTitle(TitleTypes.VeganRetreat.id);
        this.checkAndAwardAchievement(AchievementTypes.SelfSufficiencity.id);
        this.checkAndAwardAchievement(AchievementTypes.CarbonNation.id);
        this.checkAndAwardAchievement(AchievementTypes.CrimeIsOutlawed.id);
        this.checkAndAwardAchievement(AchievementTypes.NoAdultLeftADolt.id);
        this.checkAndAwardAchievement(AchievementTypes.NoiseEnthusiast.id);
        this.checkAndAwardAchievement(AchievementTypes.FarmVile.id);

        this.resourceEvents = []; //Reset the resource events because we checked all the achievements that care already.

        this.runAssists();
        this.runEvents(EventTickTiming.Normal);
        if (!this.timeFreeze) this.checkStartEvents(); //Events won't start if the tutorial is running
    }

    onShortTick(): void {
        const power = this.resources.get('power');
        if (!power) throw new Error("power resource is missing from city"); //would be a serious bug

        //If power goes negative, you can buy *some* from other cities.
        const totalImportablePower = this.desiredPower * this.budget.powerImportLimit;
        let importablePower = totalImportablePower;
        power.consumptionRate = 0;

        //Random order to allow rolling blackouts if the city can't even buy enough power. Entirely ignore buildings that need but lack a road connection.
        const connectedBuildings = this.buildings.filter(p => p.powerConnected && (!p.needsRoad || p.roadConnected));
        inPlaceShuffle(connectedBuildings).forEach(building => {
            const powerNeeded = building.getPowerUpkeep(this);
            power.consumptionRate += powerNeeded;
            building.powered = power.amount + importablePower >= powerNeeded || powerNeeded === 0; //Buildings will be unpowered if they need more power than is available even via trading
            if (building.powered) {
                if (power.amount < powerNeeded) importablePower -= powerNeeded - Math.max(0, power.amount); //Start taking from importablePower as soon as power.amount is about to go negative
                power.consume(powerNeeded); //Will represent the total requested power; may not be the same as desiredPower if efficiency is down for other reasons
                building.poweredTimeDuringLongTick += 1 / SHORT_TICKS_PER_LONG_TICK;
                if (building.poweredTimeDuringLongTick > 0.99) building.poweredTimeDuringLongTick = 1;
            }
        });

        //power.amount needs fully *reset* to the total power production for the city each short tick (don't just add to power.amount unless maybe if we implement batteries, but that'd take more coding here)
        //This is also updated immediately when placing or removing a power producer, so that the new power or power loss takes place on the next short tick.
        //Note: took about 11% of the run time when I ran 30 days' worth of ticks at once.
        power.amount = power.productionRate = connectedBuildings.reduce((total, building) => total + building.getPowerProduction(this), 0);

        if (totalImportablePower === importablePower) { //The city had enough power for itself OR wasn't allowed to import any, so no need to deduct anything.
            this.lastImportedPowerCost = 0;
            this.checkAndAwardAchievement(AchievementTypes.WattsUpDoc.id);
            return;
        }

        this.checkAndAwardAchievement(AchievementTypes.PartyThroughBlackout.id);

        this.lastImportedPowerCost = Math.max(0, totalImportablePower - importablePower) * this.getImportPowerRate();
        if (this.lastImportedPowerCost) this.resourceEvents.push({ type: "power", event: "buy", amount: totalImportablePower - importablePower }); //At least one achievement cares about power imports
        this.budget.lastServiceCosts["power"] = this.lastImportedPowerCost * SHORT_TICKS_PER_LONG_TICK;

        //Deduct from City Hall first.
        const remainingCost = Math.max(0, this.lastImportedPowerCost - this.cityHall.flunds.amount);
        this.cityHall.flunds.amount = Math.max(0, this.cityHall.flunds.amount - this.lastImportedPowerCost);
        this.flunds.consume(remainingCost);
    }
    frozenAdvanceLongTick(): void {
        for (let i = 0; i < SHORT_TICKS_PER_LONG_TICK; i++) {
            this.onShortTick();
        }
        this.onLongTick();
    }

    getImportPowerRate(): number {
        let rate = 0.005; //multiplied by 72x4=288 flunds per 1 unit of power--that'd be 1.44 a day (vs. 2 a day to upkeep one road segment), tentatively. Needs to be higher than the upkeep for at-home power production.

        //Events can affect the rate, but this should probably be implemented on the event.apply side instead
        if (this.events.some(e => e instanceof PowerOutage)) rate *= 1.2; //If a nearby city can't readily provide for you because they have their own problems
        else if (this.events.some(e => e instanceof EmergencyPowerAid)) rate *= 0.4; //This would be an event if the player is in a position to receive aid--brings it just under the upkeep cost of wind power

        return rate;
    }

    updateMinigamePlays() {
        { //TODO: Memory Mixology may need a bar to unlock, but for now, it's a freebie
            const plays = this.resources.get(new ResourceTypes.BarPlays().type)!;
            plays.produce(plays.productionRate);
            //if (!this.flags.has(CityFlags.UnlockedMemoryMixology)) {
            //    this.flags.add(CityFlags.UnlockedMemoryMixology);
            //    this.notify(new Notification("Memory Mixology", "You've unlocked a minigame! You can access Memory Mixology from the side bar. One play token is generated each day, and you can have up to ten days' worth at a time. In Memory Mixology, you can earn resources by matching pairs of cards.", "memorymixology"));
            //    plays.produce(plays.productionRate * LONG_TICKS_PER_DAY); //Freebie for the first day
            //}
        }
        if (this.flags.has(CityFlags.UnlockedTourism)) { //Nepotism Networking is unlocked with tourism, since its reward is meant to be just a tourism bonus.
            const plays = this.resources.get(new ResourceTypes.NepotismNetworkingPlays().type)!;
            plays.produce(plays.productionRate);
        }
        if (this.peakPopulation >= 400 && this.presentBuildingCount.get(new Casino().type)) { //Only matters whether or not you've built a casino--not if it's place, not how many you have.
            const plays = this.resources.get(new ResourceTypes.SlotsPlays().type)!;
            plays.produce(plays.productionRate);
            if (!this.flags.has(CityFlags.UnlockedSlots)) {
                this.flags.add(CityFlags.UnlockedSlots);
                this.notify(new Notification("Bling Bling!", "You've unlocked a minigame! You can access the casino Slot Machine from the side bar. One play token is generated each day, and you can have up to ten days' worth at a time, but you'll have to bet with your flunds on top of using a play token.", "slots"));
                plays.produce(plays.productionRate * LONG_TICKS_PER_DAY); //Freebie for the first day
            }
        }
        if (this.peakPopulation >= 175) { //Starbox is unlocked early since it gives some fairly basic resource rewards like iron and copper.
            const plays = this.resources.get(new ResourceTypes.StarboxPlays().type)!;
            plays.produce(plays.productionRate);
            if (!this.flags.has(CityFlags.UnlockedStarbox)) {
                this.flags.add(CityFlags.UnlockedStarbox);
                this.notify(new Notification("Fusion...ha!", "You've unlocked a minigame! You can access Starbox from the side bar. One play token is generated each day, and you can have up to ten days' worth at a time. In Starbox, you can earn materials as rewards depending on how many stars you fuse.", "starbox"));
                plays.produce(plays.productionRate * LONG_TICKS_PER_DAY); //Freebie for the first day
            }
        }
        if (this.flags.has(CityFlags.UnlockedMonobrynth)) {
            const plays = this.resources.get(new ResourceTypes.MonobrynthPlays().type)!;
            plays.produce(plays.productionRate);
        }
    }

    getBusinessDensity(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.BusinessPresence).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getPettyCrime(x: number, y: number): number { //Negative effect on happiness
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.PettyCrime).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getNetPettyCrime(x: number, y: number): number {
        return Math.max(0, this.getPettyCrime(x, y) - this.getPoliceProtection(x, y));
    }
    getOrganizedCrime(x: number, y: number): number { //Negative effect on happiness and maybe something like lifespan (just simulated)
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.OrganizedCrime).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getNetOrganizedCrime(x: number, y: number): number {
        return Math.max(0, this.getOrganizedCrime(x, y) - (this.getPoliceProtection(x, y) - this.getPettyCrime(x, y)) * 0.5); //Reduce petty crime first arbitrarily
    }
    getParticulatePollution(x: number, y: number): number { //Negative effect on health
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.ParticulatePollution).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getGreenhouseGases(x: number, y: number): number { //The odd one out: should increase on each tick--the longer you have factories and no air cleaning, the worse. But doesn't affect happiness so much.
        //const greenhouseGases = this.resources.get("greenhousegases")!; //Originally made the cumulative amount visible, but it makes the production areas impossible to see.
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.GreenhouseGases).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getNoise(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.Noise).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getLandValue(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.LandValue).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getLuxury(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.Luxury).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getPoliceProtection(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.PolicePresence).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getFireProtection(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.FirePrevention).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getHealthcare(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.Healthcare).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getEducation(x: number, y: number): number {
        return Math.max(0, this.effectGrid[y][x].filter(p => p.type === EffectType.Education).reduce((sum, effect) => sum + effect.getEffect(this, null, y, x), 0));
    }
    getResidentialDesirability(x: number, y: number): number {
        return this.residenceSpawner.calculateDesirability(x, y);
    }
    getCityAverageGreenhouseGases(): number {
        let total = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                total += this.getGreenhouseGases(x, y);
            }
        }
        return total / (this.height * this.width);
    }
    getCityAverageEducation(): number { //Not the same as greenhouse gases--this only counts for residence tiles.
        const residences = this.buildings.filter(p => p.isResidence);
        if (!residences.length) return 0;

        const total = residences.reduce((sum, residence) => sum + residence.getHighestEffect(this, EffectType.Education), 0);
        return total / residences.length;
    }

    isRoadAdjacent(x: number, y: number): boolean {
        if (x > 0 && this.grid[y][x - 1]?.isRoad) return true;
        if (y > 0 && this.grid[y - 1][x]?.isRoad) return true;
        if (x < this.width - 1 && this.grid[y][x + 1]?.isRoad) return true;
        if (y < this.height - 1 && this.grid[y + 1][x]?.isRoad) return true;
        return false;
    }

    isRoadAdjacentAndNotRoad(x: number, y: number): boolean {
        return this.isRoadAdjacent(x, y) && !this.grid[y]?.[x]?.isRoad;
    }

    /**
     * Get revenue for all or only the given type of infini-businesses (those with a patron cap of -1).
     * BusinessValue of 150 and tax of 10% is ~10 per tick at 800 pop, ~15 at 4400, ~20 at 15k, ~25 at 65k, and nearly no increase past that. Second copy is ~52% as effective, third copy is <16%.
     * @param type The type of infini-business to get revenue for. If not provided, all infini-businesses are considered.
     * @param each If true, return the revenue divided by the total efficiency sum of the infini-business. If false, return the total revenue for all infini-businesses.
     * @param theoretical If true, return the ADDITIONAL revenue for building one more copy of the infini-business. If false, return the TOTAL revenue for the current number of copies.
     * @returns The revenue for the infini-businesses, NOT multiplied by sales tax rate.
     */
    getInfinibusinessRevenue(type?: string, each?: boolean, theoretical?: boolean): number {
        const populationResource = this.resources.get("population");
        if (!populationResource) return 0;
        const population = populationResource.amount;

        const infinibusinessTypes = new Map<string, { efficiencySum: number, typeValue: number }>();
        let infinibusinesses = this.buildings
            .filter(building => building.businessValue > 0 && building.businessPatronCap === -1 && (building.roadConnected || !building.needsRoad) && building.lastEfficiency);

        //Filter if we're only wanting to look at one type of business rather than actually calculating revenue now. This is used for the info view for both placed and unplaced copies.
        if (type) infinibusinesses = infinibusinesses.filter(p => p.type === type);

        infinibusinesses.forEach(business => infinibusinessTypes.set(business.type,
            { efficiencySum: (infinibusinessTypes.get(business.type)?.efficiencySum || 0) + business.lastEfficiency, typeValue: business.businessValue }));

        //Have to use Math.min on efficiencySum here so it doesn't *increase* the value of 1 partially-functioning building.
        const formula = (sum: number, type: { efficiencySum: number, typeValue: number }) => sum
            + Math.log10(1 + (population / 50)) * (1 - Math.min(Math.exp(type.efficiencySum * -0.77), type.efficiencySum * 0.463)) * type.typeValue;
        let value = Array.from(infinibusinessTypes.values()).reduce(formula, 0);

        //If we're looking for a theoretical number for building one more copy, we recalculate the same thing but with +1 to efficiencySum, and get the difference between that and the original value.
        if (theoretical) value = Array.from(infinibusinessTypes.values()).map(p => ({ typeValue: p.typeValue, efficiencySum: p.efficiencySum + 1 })).reduce(formula, 0) - value;

        //If we want the value of just one copy, divide by efficiency sum. This is used for the info view for placed copies only.
        if (each) value /= Array.from(infinibusinessTypes.values()).reduce((sum, type) => sum + type.efficiencySum, 0.0000001);

        return value * this.getPostOfficeBonus();
    }

    /**
     * @returns 1 plus up to 5% depending on the post office's presence and last efficiency
     */
    getPostOfficeBonus(): number {
        return 1 + 0.05 * (this.postOffice?.lastEfficiency || 0);
    }

    private updatePopulation(): void {
        const populationResource = this.resources.get("population");
        if (!populationResource) return;

        const residences = this.buildings.filter(b => b.isResidence);
        const maxPopulation = residences.reduce((sum, residence) => {
            const housingCapacity = residence.outputResources.find(p => p.type === "population")?.capacity || 0;
            return sum + housingCapacity * residence.lastEfficiency; //Reduced if the building is damaged; doesn't count if the residence is freshly spawned
        }, 0);

        const happiness = this.resources.get("happiness")!.amount;
        const happinessMultiplier = 0.5 + (happiness / 2); // 0.5 to 1.0 based on happiness

        const targetPopulation = maxPopulation * happinessMultiplier;

        // Gradually adjust population towards target
        const populationChange = (targetPopulation - populationResource.amount) / Math.max(1, Math.min(5, populationResource.amount / 35)); //No floor or ceiling or round, because then the population can't change *at all* early in the game. Just round in the UI.
        populationResource.amount = Math.max(1, populationResource.amount + populationChange); //Can't be 0; that causes math errors. Plus the player can't move out of their own city. :)

        this.runEvents(EventTickTiming.Population);

        this.peakPopulation = Math.max(this.peakPopulation, populationResource.amount);

        // Update production rate for smoother transitions (really just usable for UI purposes)
        populationResource.productionRate = populationChange > 0 ? populationChange : 0;
        populationResource.consumptionRate = populationChange < 0 ? -populationChange : 0;
    }

    updateTourists() {
        const touristsResource = this.resources.get("tourists");
        if (!touristsResource?.capacity) return;

        touristsResource.amount = 0; //Full recalculation
        this.buildings.forEach(building => {
            const tourists = building.outputResources.find(r => r.type === touristsResource.type);
            if (!tourists) return; //Could've used filter() and then forEach or aggregate or whatever, but it's just less efficient to use filter().
            touristsResource.amount += tourists.amount * building.lastEfficiency;
            //DO NOT reduce/reset tourists.amount in the buildings; those numbers increase over time until tourist traps reach max tourism draw.
        });

        this.runEvents(EventTickTiming.Tourism);

        touristsResource.productionRate = touristsResource.amount;
    }

    checkStartEvents() {
        for (const eventType of this.eventTypes) {
            if (eventType.shouldStart(this, new Date(this.lastLongTick))) {
                this.events.push(eventType.clone());
                if (eventType.startMessage) this.notify(new Notification(eventType.displayName, eventType.startMessage, eventType.notificationIcon ?? undefined));
            }
        }
    }

    runEvents(tickTiming: EventTickTiming) {
        this.events.filter(p => p.tickTiming === tickTiming).forEach(p => {
            if (!p.onLongTick(this)) { //true = keep it going
                this.events.splice(this.events.indexOf(p), 1); //Remove when the event is done.
                if (p.endMessage) this.notify(new Notification(p.displayName, p.endMessage, p.notificationIcon ?? undefined));
            }
        });
    }

    runAssists() {
        for (let i = 0; i < this.assists.length; i++) {
            if (this.assists[i].startAt <= this.lastLongTick) {
                //Would change if the assist's effect can be anything other than CityEvent
                const effect = this.assists[i].effect;
                if (effect instanceof CityEvent) {
                    const fromFriend = this.player.friends.find(p => p.id == this.assists[i].playerId);
                    effect.fromPlayer = fromFriend?.name ?? "Ex-friend";
                    this.events.push(effect);
                }
                this.assists.splice(i, 1);
                i--;
            }
        }
    }

    updateHappiness() {
        const happiness = this.resources.get("happiness")!;

        //Trigger notifications and unlock buildings when the city reaches certain population thresholds. Should actually trigger tutorials.
        if (this.peakPopulation >= 100 && !this.flags.has(CityFlags.PoliceProtectionMatters)) {
            this.notify(new Notification("I Am the Law", "You've reached a population of 100! You can now build a police station to fight crime. I say 'can', but you really must, because your people will no longer be content without police coverage. I can already hear the grumblings... See Tutorials in the main menu for more info.", "policeprotection"));
            this.unlock(getBuildingType(PoliceBox));
            this.unlock(getBuildingType(PoliceStation));
            this.flags.add(CityFlags.PoliceProtectionMatters);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 250 && !this.flags.has(CityFlags.FireProtectionMatters)) {
            this.notify(new Notification("Yowza! Fiya!", "You've reached a population of 250! You can now build fire stations to fight fires. Don't let the fire win, unless we're talking about the fiery passion in your heart to keep your citizens safe. See Tutorials in the main menu for more info.", "fireprotection"));
            this.unlock(getBuildingType(FireBay));
            this.unlock(getBuildingType(FireStation));
            this.flags.add(CityFlags.FireProtectionMatters);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 325 && !this.flags.has(CityFlags.BlockersPointedOut)) {
            this.notify(new Notification("Metaphorical Hermit Crab", "Our city sprawls across the landscape, asphalt tendrils like roots feeding upon the lush soil, yet its healthy growth is stifled, pressured by obstructions on every side. We should consider clearing out construction blockers in the surrounding area to make room for continued expansion. The city must grow.", "environment"));
            this.flags.add(CityFlags.BlockersPointedOut);
        }
        if (this.peakPopulation >= 400 && !this.flags.has(CityFlags.UnlockedTourism)) {
            this.notify(new Notification("Business Booster", "You've reached a population of 400! You can now build an information center to enable tourism in your city. Tourists patronize your businesses and therefore help you earn revenue via sales tax. However, nobody's going to visit if you don't build both the information center and some proper tourist traps. You can also play the Nepotism Networking minigame in any friend's city for a shared bonus after drawing in some tourists! See Tutorials in the main menu for more info.", "neponet"));
            this.unlock(getBuildingType(InformationCenter));
            this.unlock(getBuildingType(SesharTower));
            this.unlock(getBuildingType(ResortHotel));
            this.unlock(getBuildingType(ConventionCenter));
            this.flags.add(CityFlags.UnlockedTourism);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 500 && !this.flags.has(CityFlags.FoodMatters)) {
            this.notify(new Notification("Food for Thought", "You've reached a population of 500, and they are starting to get hangry! Increase your food diversity to sate the people's hunger before they start rioting. Note: There are more than ten types of food, and it needs to be in your storage for the citizens to consume it. Food is mainly kept in Cold Storage. See Tutorials in the main menu for more info.", "diet"));
            this.flags.add(CityFlags.FoodMatters);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 600 && !this.flags.has(CityFlags.EducationMatters)) {
            this.notify(new Notification("(Smart) Help Wanted", "You've reached a population of 600! You can now build schools to provide education to your citizens. They'll be unhappy without it in a town of this size, anyway. Plus, if they're smart enough, they might help you research a bit faster. Most importantly, you need to thoroughly educate your population before you can build higher-tech facilities. See Tutorials in the main menu for more info.", "education"));
            this.unlock(getBuildingType(ElementarySchool));
            this.unlock(getBuildingType(HighSchool));
            this.unlock(getBuildingType(Dorm));
            this.unlock(getBuildingType(College));
            this.unlock(getBuildingType(Playground));
            this.flags.add(CityFlags.EducationMatters);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 750 && !this.flags.has(CityFlags.UnlockedPost)) {
            this.notify(new Notification("Mail Call", "You've reached a population of 750! You can now build a post office to help with business correspondence and package deliveries. Keep it running for a small citywide boost to sales tax revenue.", "infrastructure"));
            this.unlock(getBuildingType(PostOffice));
            this.flags.add(CityFlags.UnlockedPost);
        }
        if (this.peakPopulation >= 900 && !this.flags.has(CityFlags.HealthcareMatters)) {
            this.notify(new Notification("Cough, cough", "You've reached a population of 900! You can now build healthcare facilities to keep your citizens happy and productive. Diet also affects healthcare effectiveness, so farm wisely! See Tutorials in the main menu for more info.", "healthcare"));
            this.unlock(getBuildingType(Clinic));
            this.unlock(getBuildingType(Hospital));
            this.flags.add(CityFlags.HealthcareMatters);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= 1200 && !this.flags.has(CityFlags.B12Matters)) {
            this.notify(new Notification("Vitamin B12", "You've reached a population of 1200 and unlocked the Algae Farm, which produces Vitamin B12! Your citizens' health will suffer if animal products comprise less than 10% of their diet. But now you can prevent a nutritional deficiency by making just 4% of their diet Vitamin B12! By the way, they want at least 6 distinct types of food now. Reminder: you can view Tutorials in the main menu for more info about food and diet.", "diet"));
            this.unlock(getBuildingType(AlgaeFarm));
            this.flags.add(CityFlags.B12Matters);
        }
        if (this.peakPopulation >= 1800 && !this.flags.has(CityFlags.CitizenDietFullSwing)) {
            this.notify(new Notification("Dietary Diversity", "You've reached a population of 1800, and they're hungrier than ever. Until now, they've been happy with just six types of food...but now they want them all. Reminder: you can view Tutorials in the main menu for more info about food and diet.", "diet"));
            this.flags.add(CityFlags.CitizenDietFullSwing);
            this.uiManager?.updateTutorialSteps();
        }
        if (this.peakPopulation >= GREENHOUSE_GASES_MIN_POPULATION && !this.flags.has(CityFlags.GreenhouseGasesMatter)) {
            this.notify(new Notification("Disastrous Change", "As our population rises, so does the concern that unchecked pollution will harm our environment and lead to more frequent severe weather. We should choose the cleaner, greener option when we have a choice, and for when we don't, we should look into technologies that can undo our damage. See Tutorials in the main menu for more info.", "greenhousegases"));
            this.flags.add(CityFlags.GreenhouseGasesMatter);
            this.uiManager?.updateTutorialSteps();
            this.resources.get(new ResourceTypes.GreenhouseGases().type)!.amount = this.getCityAverageGreenhouseGases() * 0.1;
        }

        const target = new HappinessCalculator(this).calculateHappiness(); //Results in a value between 0 and 1. We want to adjust this a bit faster in the negative than the positive direction.
        const change = target - happiness.amount;
        happiness.amount += change > 0 ? change * 0.1 : change * 0.2; //Happiness drops twice as fast as it rises. This speaks to the persistent effects of unpleasant events. ;)
    }

    public failBusiness(building: Building): void {
        building.lastEfficiency = 0;
        this.notify(new Notification("Business failure", `A ${building.type} has failed due to poor performance. Once your population or tourism rises a bit, or if you remove other businesses, you can pay to reopen it.`));
    }

    public showReopenBusinessDialog(building: Building): void {
        this.uiManager?.showReopenBusinessDialog(building);
    }

    public showRepairBuildingDialog(building: Building): void {
        this.uiManager?.showRepairBuildingDialog(building);
    }

    updateResources(): void { }
    updateServices(): void { }
    handleEvent(event: CityEvent): void { }
}
