import { TitleTypes } from "./AchievementTypes.js";
import { Building } from "./Building.js";
import { ChocolateBar, CocoaCupCo, ColdStorage, FireBay, FireStation, FlowerTower, GeothermalVent, HauntymonthGrave, HauntymonthHouse, HauntymonthLamp, HeartyShack, HotSpring, HotSpringInn, MiracleWorkshop, PeppermintPillar, ReindeerRetreat, WrappedWonder, getBuildingType } from "./BuildingTypes.js";
import { City } from "./City.js";
import { CityEvent, EventTickTiming } from "./CityEvent.js";
import { CityFlags } from "./CityFlags.js";
import { LONG_TICKS_PER_DAY, LONG_TICK_TIME, SHORT_TICK_TIME } from "./FundamentalConstants.js";
import { EffectType } from "./GridType.js";
import { inPlaceShuffle } from "./MiscFunctions.js";
import { Notification } from "./Notification.js";
import { GreenhouseGases, PowerCosts, ProductionEfficiency, getResourceType } from "./ResourceTypes.js";

export class Hauntymonth extends CityEvent {
    constructor() {
        super("hauntymonth", "Hauntymonth", 31 * LONG_TICKS_PER_DAY,
            "I don't know how a one-day celebration extended to a month of decorations and events, but here we are! Happy Hauntymonth! You can find a few spooky temporary decorations in the Luxury construction category.",
            "The event culminated in one night of candy distribution and hauntings, but the decorations are no more. You'll get them back next year.");
    }

    override shouldStart(city: City, date: Date): boolean {
        //Starts on October 1st; ends midnight November 1.
        return this.checkedStart(date.getMonth() === 9 && !city.events.some(p => p.type === this.type), city, date);
    }

    override start(city: City, date: Date) {
        super.start(city, date);
        //Calculate duration if it wasn't exactly October 1 when it started (e.g., for new players)
        this.duration = Math.floor((32 - date.getDate()) * LONG_TICKS_PER_DAY - Math.floor(date.getHours() * LONG_TICKS_PER_DAY / 24)); //Second floor is because the duration doesn't decrease on the first tick.
        this.lockUnlockBuildings(city, false);
    }

    override end(city: City) {
        super.end(city);
        this.lockUnlockBuildings(city, true);
    }

    lockUnlockBuildings(city: City, locked: boolean): void {
        const buildingTypeIDs = [getBuildingType(HauntymonthLamp), getBuildingType(HauntymonthHouse), getBuildingType(HauntymonthGrave)];
        for (const type of buildingTypeIDs) {
            const buildingTemplate = city.buildingTypes.find(p => p.type === type);
            if (buildingTemplate) buildingTemplate.isHidden = buildingTemplate.locked = locked;

            //Also remove the buildings from the city. The buildings' isPlaceable() function would have to check if this event is active, or the player can just put them right back.
            if (locked) for (const building of city.buildings.filter(p => p.type === type)) city.removeBuilding(building);
        }
    }
}

export class Merrymonth extends CityEvent {
    constructor() {
        super("merrymonth", "Merrymonth", 31 * LONG_TICKS_PER_DAY,
            "The city is all decked out for the countless winter holidays! It's Merrymonth, and temporary decorations of varying qualities are available now in the Luxury construction category. You can also gift bonuses to friends' cities if you build the Miracle Workshop, available in the Industrial category.",
            "The decorations have been taken down--keeping them up into January is illegal throughout the Towngardian nation--but the holiday spirit remains. You'll get your decorations back next year.");
    }

    override shouldStart(city: City, date: Date): boolean {
        //Starts on December 1st; ends midnight January 1.
        return this.checkedStart(date.getMonth() === 11 && !city.events.some(p => p.type === this.type), city, date);
    }

    override start(city: City, date: Date) { //Same logic as Hauntymonth
        super.start(city, date);
        this.duration = Math.floor((32 - date.getDate()) * LONG_TICKS_PER_DAY - Math.floor(date.getHours() * LONG_TICKS_PER_DAY / 24));
        this.lockUnlockBuildings(city, false);
    }

    override end(city: City) {
        super.end(city);
        this.lockUnlockBuildings(city, true);
    }

    lockUnlockBuildings(city: City, locked: boolean): void {
        const buildingTypeIDs = [getBuildingType(PeppermintPillar), getBuildingType(CocoaCupCo), getBuildingType(ReindeerRetreat), getBuildingType(WrappedWonder), getBuildingType(MiracleWorkshop)];
        for (const type of buildingTypeIDs) {
            const buildingTemplate = city.buildingTypes.find(p => p.type === type);
            if (buildingTemplate) buildingTemplate.isHidden = buildingTemplate.locked = locked;
            if (locked) for (const building of city.buildings.filter(p => p.type === type)) city.removeBuilding(building);
        }
    }
}

export class Chocomonth extends CityEvent {
    constructor() {
        super("chocomonth", "Chocomonth", 31 * LONG_TICKS_PER_DAY,
            "It's Chocomonth! The city is filled with the sweet scents of adolescence and chocolate. You can find temporary businesses and decorations in the Commercial and Luxury construction categories respectively. You can gift food bonuses to friends' cities if you build the Chocolate Bar, available in the Commercial category.",
            "It's the end of the month, and you know what that means--love is dead again, and chocolate is relegated to a delicious dental danger! You'll get your Chocomonth buildings back next year.");
    }

    override shouldStart(city: City, date: Date): boolean {
        //Starts on February 1st; ends midnight March 1.
        return this.checkedStart(date.getMonth() === 1 && !city.events.some(p => p.type === this.type), city, date);
    }

    override start(city: City, date: Date) { //Same logic as Hauntymonth except the number of days changes
        super.start(city, date);
        const daysInFebruary = new Date(date.getFullYear(), 1, 29).getDate() === 29 ? 29 : 28;
        this.duration = Math.floor((1 + daysInFebruary - date.getDate()) * LONG_TICKS_PER_DAY - Math.floor(date.getHours() * LONG_TICKS_PER_DAY / 24));
        this.lockUnlockBuildings(city, false);
    }

    override end(city: City) {
        super.end(city);
        this.lockUnlockBuildings(city, true);
    }

    lockUnlockBuildings(city: City, locked: boolean): void {
        const buildingTypeIDs = [getBuildingType(ChocolateBar), getBuildingType(HeartyShack), getBuildingType(FlowerTower)];
        for (const type of buildingTypeIDs) {
            const buildingTemplate = city.buildingTypes.find(p => p.type === type);
            if (buildingTemplate) buildingTemplate.isHidden = buildingTemplate.locked = locked;
            if (locked) for (const building of city.buildings.filter(p => p.type === type)) city.removeBuilding(building);
        }
    }
}

export class TourismReward extends CityEvent {
    constructor(initialDuration = 12, bonusFraction = 0) {
        super("tourismreward", "Tourism Reward", initialDuration, "", "", undefined, EventTickTiming.Tourism);
        if (bonusFraction) this.variables.push(bonusFraction);
        this.duration = initialDuration;
    }

    override onLongTick(city: City): boolean {
        const touristsResource = city.resources.get("tourists");

        if (!this.variables.length) this.variables.push(0.05); //Default 5% bonus
        if (!this.maxDuration) this.maxDuration = 1;
        if (touristsResource?.capacity) touristsResource.amount *= 1 + (this.variables[0] * this.duration / this.maxDuration); //Bonus goes down over time

        return super.onLongTick(city);
    }

    //No shouldStart because it should never start on its own
}

export class ProductionReward extends CityEvent { //Applies to physical resources, i.e., not flunds, tourists, power, or business revenue
    constructor(initialDuration = 12, bonusFraction = 0) {
        super("productionreward", "Production Reward", initialDuration, "", "", undefined, EventTickTiming.Early);
        if (bonusFraction) this.variables.push(bonusFraction);
        this.duration = initialDuration;
    }

    override onLongTick(city: City): boolean {
        const productionResource = city.resources.get(getResourceType(ProductionEfficiency));

        if (!this.variables.length) this.variables.push(0.05); //Default 5% bonus
        if (productionResource?.capacity) productionResource.amount *= 1 + this.variables[0]; //Bonus stays constant

        return super.onLongTick(city);
    }

    //No shouldStart because it should never start on its own
}

export class DietReward extends CityEvent { //Considered in the diet system long tick rather than doing anything directly
    constructor(initialDuration = 12, bonusFraction = 0) {
        super("dietreward", "Diet Reward", initialDuration, "", "");
        if (bonusFraction) this.variables.push(bonusFraction);
        this.duration = initialDuration;
    }

    public getBonus(): number { return this.variables[0] ?? 0.05; } //Constant bonus
}

export class HappinessReward extends CityEvent {
    constructor(initialDuration = 12, bonusAmount = 0) {
        super("happinessreward", "Happiness Reward", initialDuration, "", "");
        if (bonusAmount) this.variables.push(bonusAmount);
        this.duration = initialDuration;
    }

    public getBonus(): number { return this.variables[0]; } //Constant bonus
}

export class ResearchReward extends CityEvent {
    constructor(initialDuration = 12, bonusAmount = 0) {
        super("researchreward", "Research Reward", initialDuration, "", "");
        if (bonusAmount) this.variables.push(bonusAmount);
        this.duration = initialDuration;
    }

    public getBonus(): number { return this.variables[0]; } //Constant bonus
}

export class PowerReward extends CityEvent {
    constructor(initialDuration = 12, discountFraction = 0) {
        super("powerreward", "Power Reward", initialDuration, "", "", undefined, EventTickTiming.Early);
        if (discountFraction) this.variables.push(discountFraction);
        this.duration = initialDuration;
    }

    override onLongTick(city: City): boolean {
        const powerResource = city.resources.get(getResourceType(PowerCosts));

        if (!this.variables.length) this.variables.push(0.05); //Default 5% discount
        if (powerResource?.capacity) powerResource.amount *= 1 - this.variables[0]; //Discount stays constant

        return super.onLongTick(city);
    }

    //No shouldStart because it should never start on its own
}

export class Drought extends CityEvent { //Implemented on Fire Station already
    constructor() {
        super("drought", "Drought", 10 * LONG_TICKS_PER_DAY,
            "The city is experiencing a drought. Water usage is restricted, leading to slower crop growth and less effective firefighting.",
            "The drought has ended. Water usage restrictions have been lifted.", "greenhousegases");
    }

    override shouldStart(city: City, date: Date): boolean {
        //0.3% chance if the city has >2k people and it hasn't happened in at least 25 days, with an increasing chance and decreasing min delay based on collected greenhouse gases (3% at 0.95 greenhouse gases)
        return this.checkedStart(city.peakPopulation >= 2000
            && this.skippedStarts > this.maxDuration + 25 * LONG_TICKS_PER_DAY * Math.max(0, 1 - city.resources.get(new GreenhouseGases().type)!.amount)
            && Math.random() < 0.03 * (city.resources.get(new GreenhouseGases().type)!.amount ** 2 + 0.1) && !city.events.some(p => p.type === this.type), city, date);
    }
}

export class Heatwave extends CityEvent {
    constructor() {
        super("heatwave", "Heatwave", 5 * LONG_TICKS_PER_DAY,
            "The city is experiencing a heatwave. Power usage is higher than usual.",
            "The heatwave has ended. Power usage has returned to normal levels.", "greenhousegases");
    }

    override shouldStart(city: City, date: Date): boolean {
        //0.5% chance if the city has >1.5k people and it hasn't happened in at least 20 days, with an increasing chance and decreasing min delay based on collected greenhouse gases (5% at 0.95 greenhouse gases)
        return this.checkedStart(date.getMonth() > 3 && date.getMonth() < 9 && city.peakPopulation >= 4000
            && this.skippedStarts > this.maxDuration + 20 * LONG_TICKS_PER_DAY * Math.max(0, 1 - city.resources.get(new GreenhouseGases().type)!.amount)
            && Math.random() < 0.05 * (city.resources.get(new GreenhouseGases().type)!.amount ** 2 + 0.1) && !city.events.some(p => p.type === this.type), city, date);
    }
}

export class ColdSnap extends CityEvent {
    constructor() {
        super("coldsnap", "Cold Snap", 5 * LONG_TICKS_PER_DAY,
            "A cold snap has hit the city. Normal farms growing tree fruits, berries, and legumes will have a reduced yield for a few days.",
            "The cold snap has ended. Crops are growing normally again.", "coldsnap");
    }

    override shouldStart(city: City, date: Date): boolean {
        //Same frequency and such as heatwave, but only in the winter
        return this.checkedStart((date.getMonth() <= 3 || date.getMonth() >= 9) && city.peakPopulation >= 1500
            && this.skippedStarts > this.maxDuration + 20 * LONG_TICKS_PER_DAY * Math.max(0, 1 - city.resources.get(new GreenhouseGases().type)!.amount)
            && Math.random() < 0.05 * (city.resources.get(new GreenhouseGases().type)!.amount ** 2 + 0.1) && !city.events.some(p => p.type === this.type), city, date);
    }
}

export class PowerOutage extends CityEvent {
    constructor() {
        super("poweroutage", "Power Outage", 3 * LONG_TICKS_PER_DAY,
            "A power outage has occurred in the city that you normally import power from. Power import costs are increased.",
            "The power outage has ended. Power import costs have returned to normal.");
    }

    override shouldStart(city: City, date: Date): boolean {
        //5% chance if the city has >2.2k people and pays >30 for power and it hasn't happened in at least 15 days
        return this.checkedStart(city.peakPopulation >= 2200 && this.skippedStarts > this.maxDuration + 15 * LONG_TICKS_PER_DAY && city.flunds.amount > 500 && city.lastImportedPowerCost > 30
            && Math.random() < 0.05 && !city.events.some(p => p.type === this.type), city, date);
    }
}

export class Burglary extends CityEvent {
    constructor() {
        super("burglary", "Burglary", 0, //Instant event
            "When you weren't looking, someone broke into City Hall and helped themselves to the flunds you had lying around, taking about 20%. You should really keep that in a safe...",
            "", "policeprotection");
    }

    override shouldStart(city: City, date: Date): boolean {
        //0.1% chance if the city has >1000 people and the player has more funds than people and it hasn't happened in at least 12 days. Increases with net petty crime.
        const shouldStart = this.checkedStart(city.peakPopulation > 1000 && city.flunds.amount > city.peakPopulation
            && this.skippedStarts > 12 * LONG_TICKS_PER_DAY && Math.random() < 0.01 * (0.1 + 5 * this.getAveragePettyCrime(city)), city, date);

        this.startMessage = new Burglary().startMessage;
        if (shouldStart && this.getAveragePettyCrime(city) > 0.01) this.startMessage += "but also increase your police coverage.";
        else this.startMessage += "but there's really not much you can do about the occasional break-in.";

        return shouldStart;
    }

    getAveragePettyCrime(city: City): number {
        return Math.max(0, (city.getNetPettyCrime(city.cityHall.x, city.cityHall.y) +
            city.getNetPettyCrime(city.cityHall.x + 1, city.cityHall.y) +
            city.getNetPettyCrime(city.cityHall.x, city.cityHall.y + 1) +
            city.getNetPettyCrime(city.cityHall.x + 1, city.cityHall.y + 1)) / 4);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        city.flunds.amount *= 0.8;
    }
}

export class Heist extends CityEvent {
    constructor() {
        super("heist", "Heist", 0, //Instant event
            "When you weren't looking, a local criminal organization (we think!) spirited away most of your ready cash. ",
            "", "policeprotection");
    }

    override shouldStart(city: City, date: Date): boolean {
        //0.15% chance if the city has >1500 people and the player has more funds than people and it hasn't happened in at least 18 days. Increases with net organized crime.
        const shouldStart = this.checkedStart(city.peakPopulation > 1500 && city.flunds.amount > city.peakPopulation
            && this.skippedStarts > 18 * LONG_TICKS_PER_DAY && Math.random() < 0.015 * (0.1 + 5 * this.getAverageOrganizedCrime(city)), city, date);

        this.startMessage = new Heist().startMessage;
        if (shouldStart && this.getAverageOrganizedCrime(city) > 0.01) this.startMessage += "It was deemed due to negligence--you need to increase the city's police coverage.";
        else this.startMessage += "The insurance agent just kind of mumbled unintelligibly when asked why it wasn't covered.";

        return shouldStart;
    }

    getAverageOrganizedCrime(city: City): number { //TODO: I'd really prefer a city average here //TODO: OR make a business go out of business in one fell swoop
        return Math.max(0, (city.getNetOrganizedCrime(city.cityHall.x, city.cityHall.y) +
            city.getNetOrganizedCrime(city.cityHall.x + 1, city.cityHall.y) +
            city.getNetOrganizedCrime(city.cityHall.x, city.cityHall.y + 1) +
            city.getNetOrganizedCrime(city.cityHall.x + 1, city.cityHall.y + 1)) / 4);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        city.flunds.amount *= 0.4;
    }
}

export class EmergencyPowerAid extends CityEvent {
    constructor() {
        super("emergencypoweraid", "Emergency Power Aid", 3 * LONG_TICKS_PER_DAY,
            "A neighboring city saw that you're in a bit of a pickle, and they voted to subsidize your power import costs temporarily.",
            "The emergency aid has ended. Power import costs have returned to normal.");
    }

    override shouldStart(city: City, date: Date): boolean {
        //Can only happen three times, and only while you have under 5k population. Takes one long tick before it kicks in.
        //Remember: lastImportedPowerCost is an amount per short tick, so 4 * 72 = 288 times that much in a day.
        return this.checkedStart(city.peakPopulation < 5000 && this.skippedStarts > 0 && this.activations < 3 && city.flunds.amount < 50 && city.lastImportedPowerCost > 0.1
            && !city.events.some(p => p.type === this.type), city, date);
    }
}

export class UrbanRenewalGrant extends CityEvent {
    constructor() {
        super("urbanrenewalgrant", "Urban Renewal Grant", 0,
            "Your pleas for help as you drown in debt have not fallen on deaf ears. You've been granted some funding to help you get your city afloat again.",
            "");
    }

    override shouldStart(city: City, date: Date): boolean {
        //You'll occasionally get reset to a small amount of cash if you get bankrupt pretty badly. Can happen once every 7 days at the most
        return this.checkedStart(city.lastLongTick > new Date().getTime() - LONG_TICK_TIME - SHORT_TICK_TIME //Don't fire off when fast-forwarding; fire when that finishes
            && ((city.peakPopulation <= 1000 && city.flunds.amount < -25) || (city.peakPopulation <= 3000 && city.flunds.amount < -200) || (city.peakPopulation > 3000 && city.flunds.amount < -400))
            && this.skippedStarts > 7 * LONG_TICKS_PER_DAY, city, date);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        city.flunds.amount = Math.floor(Math.sqrt(city.peakPopulation) * 10); //About 632 at 4000, 1000 at 10k, 2236 at 50k, 4472 at 200k
    }
}

export class Earthquake extends CityEvent {
    constructor() {
        super("earthquake", "Earthquake", 0, //Instant event
            "An earthquake has struck the city. Some buildings may need repairs to restore full function.",
            "");
    }

    override shouldStart(city: City, date: Date): boolean {
        //4% chance if the city has >800 people and it hasn't happened in at least 25 days (plus an extra safe day for each time it's happened before) //TODO: Should be partly based on SOMETHING the user can control.
        return this.checkedStart(city.peakPopulation > 800 && this.skippedStarts > (25 + this.activations) * LONG_TICKS_PER_DAY && Math.random() < 0.04, city, date);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        this.startMessage = new Earthquake().startMessage;
        //If you didn't start with a geothermal vent, the first earthquake should create one. Otherwise, a diminishing chance for each vent you have. 0 -> 100%, 1 -> 33%, 2 -> 20%, 3 -> 14%, 4 -> 11%, 5 -> 9%...
        if (Math.random() < 1 / ((city.presentBuildingCount.get(getBuildingType(GeothermalVent)) ?? 0) * 2 + 1)) {
            //Select random coordinates and try to find a spot without a building there
            let x: number;
            let y: number;
            let tries: number = 20;
            do {
                x = 1 + Math.floor((city.width - 2) * Math.random()); //Can't be on any edge of the map because it wouldn't be accessible.
                y = 1 + Math.floor((city.height - 2) * Math.random());
            } while (--tries > 0 && city.getBuildingsInArea(x, y, 1, 1, 1, 1).size); //Also don't place adjacent to any immovable object or it'll be unusable. But I opted to just check that there are no buildings nearby of any type.
            if (!city.grid[y][x]) {
                city.addBuilding(new GeothermalVent(), x, y);
                this.startMessage += " The earthquake formed a new geothermal vent in the region, which could be a source of cheap, reliable, eco-friendly power.";
            }
        }

        //Also produce a hot spring on the first earthquake, no random factor and no second hot spring. Will not spawn within 8 tiles of the map edges.
        if ((city.presentBuildingCount.get(getBuildingType(HotSpring)) ?? 0) === 0) {
            let x: number;
            let y: number;
            let tries: number = 30;
            do {
                x = 8 + Math.floor((city.width - 10) * Math.random());
                y = 8 + Math.floor((city.height - 10) * Math.random());
            } while (--tries > 0 && city.getBuildingsInArea(x, y, 2, 2, 0, 0).size);
            if (!city.grid[y][x]) {
                city.addBuilding(new HotSpring(), x, y);
                city.unlock(getBuildingType(HotSpringInn));
                this.startMessage += " It also formed a hot spring, which we can turn into a tourist trap--Hot Spring Inn is now available.";
            }
        }

        //Damage a few buildings (more for higher population counts) near the epicenter (minus roads) by 10-35% of their efficiency.
        const epicenterX = 3 + Math.floor((city.width - 6) * Math.random());
        const epicenterY = 3 + Math.floor((city.height - 6) * Math.random());
        let buildingsToDamage = Math.ceil(Math.log(city.peakPopulation)) - 1;
        const potentiallyDamaged = city.getBuildingsInArea(epicenterX, epicenterY, 1, 1, 6, 6, true, true);
        for (const building of potentiallyDamaged) {
            if (!building.owned) continue; //Don't touch unowned buildings (boulders and mountains and such)
            building.damagedEfficiency = Math.max(0, building.damagedEfficiency - Math.random() * 0.25 - 0.1);
            if (--buildingsToDamage === 0) break;
        }
    }
}

export class Fire extends CityEvent {
    constructor() {
        super("fire", "Fire", 0, //Instant event
            "A fire has broken out in the city. Firefighters are on the scene, but there's been some major damage. Improve your fire protection coverage, or it's bound to happen again.",
            "", "fire");
    }

    private getAtRiskBuildings(city: City): Building[] {
        return city.buildings.filter(p => p.owned && !p.isRoad && p.fireHazard * (city.titles.get(TitleTypes.AsbestosIntentions.id)?.attained ? 0.85 : 1) > p.getHighestEffect(city, EffectType.FireProtection));
    }

    private getFireEpicenter(city: City): Building | undefined {
        //Pick a random flammable (low fire protection) building
        return inPlaceShuffle(this.getAtRiskBuildings(city))[0];
    }

    override shouldStart(city: City, date: Date): boolean {
        //Give the player a reminder if they're not building enough fire protection when the city is still small.
        if (!city.flags.has(CityFlags.RemindedToCheckFireView) && city.peakPopulation > 375 && city.peakPopulation < 900 && this.getAtRiskBuildings(city).length >= 5) {
            city.notify(new Notification("Fear of Frying", "Your advisor's eyebrow-raising observation: you've still got buildings at risk of burning down unfettered. Remember to check the fire protection view when you're expanding the city's borders! Also keep in mind that a Fire Bay isn't enough protection for every type of building, such as Steel Mill, although it still helps reduce the maximum damage. If one building catches on fire, it'll spread to others, and you'll have to fork out your own resources and flunds to repair them all.", "advisor"));
            city.flags.add(CityFlags.RemindedToCheckFireView);
        }

        //Can only happen once every 5 days, and only to buildings with poor fire protection. Significant chance--about 35% in a day.
        //Don't start counting until the flag is set, giving them a chance to build fire stations before the first fire has a chance to break out.
        return city.flags.has(CityFlags.FireProtectionMatters) && this.checkedStart(this.skippedStarts > 5 * LONG_TICKS_PER_DAY && Math.random() < 0.1 && this.getFireEpicenter(city) !== undefined, city, date);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);

        const epicenter = this.getFireEpicenter(city);
        if (!epicenter) return; //Shouldn't have started the fire in the first place

        let intensity = epicenter.fireHazard * (city.titles.get(TitleTypes.AsbestosIntentions.id)?.attained ? 0.85 : 1) + 0.3 * Math.random();
        epicenter.damagedEfficiency = Math.max(0, epicenter.damagedEfficiency - intensity);
        intensity *= 0.9;

        //Generally do the most damage to the closest buildings, but not roads, fire stations, or already-very-damaged buildings. More damage but fewer buildings affected than an Earthquake.
        let buildingsToDamage = Math.ceil(Math.log10(city.peakPopulation));
        const potentiallyDamaged = [...city.getBuildingsInArea(epicenter.x, epicenter.y, epicenter.width, epicenter.height, 5, 5, false, true)];
        potentiallyDamaged.sort((a, b) => Math.abs(a.x - epicenter.x) + Math.abs(a.y - epicenter.y) - Math.abs(b.x - epicenter.x) - Math.abs(b.y - epicenter.y));
        for (const building of potentiallyDamaged) {
            if (building === epicenter || building instanceof FireBay || building instanceof FireStation || building.damagedEfficiency < 1 - intensity || !building.owned) continue;
            const coverage = building.getHighestEffect(city, EffectType.FireProtection);
            building.damagedEfficiency = Math.max(0, building.damagedEfficiency - (0.8 + Math.random() * 0.2) * intensity * (1.1 - coverage));
            intensity *= 0.9;
            if (--buildingsToDamage === 0) break;
        }
    }
}

export class Riot extends CityEvent {
    constructor() {
        super("riot", "Riot", 0, //Instant event
            "A riot has broken out in the city. Citizens are setting fires to buildings in protest of their poor treatment. Wait, are you treating them like that because they're poor!? Make them happy or they'll keep it up--increase service coverage, feed them better, reduce noise pollution around homes, and so on.",
            "", "policeprotection");
    }

    private getRiotEpicenter(city: City): Building | undefined {
        //Pick a random building
        const buildings = city.buildings.filter(p => p.owned && !p.isRoad);
        return inPlaceShuffle(buildings)[0];
    }

    override shouldStart(city: City, date: Date): boolean {
        //Chance and max frequency both increase as happiness decreases, but only if the city is big enough to have a riot. 4.6% chance per tick (16% a day) at 0.65 happiness, 30% (76% a day) at 0.1 happiness.
        const happiness = city.resources.get("happiness")!.amount;
        return this.checkedStart(this.skippedStarts > 2 * LONG_TICKS_PER_DAY / Math.max(0.1, happiness) && happiness < 0.65 && city.peakPopulation > 100 && Math.random() < 0.03 / Math.max(0.1, happiness) && this.getRiotEpicenter(city) !== undefined, city, date);
    }

    private calculatePoliceCoverage(city: City, epicenter: Building): number {
        const tiles = city.getTilesInArea(epicenter.x, epicenter.y, epicenter.width, epicenter.height, 5, 5);
        const sum = [...tiles].reduce((sum, tile) => sum +
            city.effectGrid[tile.y][tile.x].filter(p => p.type === EffectType.PoliceProtection).reduce((sum, p) => sum + p.getEffect(city, null, tile.x, tile.y), 0)
            , 0);
        return sum / tiles.size;
    }

    override start(city: City, date: Date): void {
        super.start(city, date);

        const epicenter = this.getRiotEpicenter(city);
        if (!epicenter) return; //Shouldn't have started the riot in the first place

        //Even perfect fire coverage can only reduce it to 0.1
        let intensity = Math.max(0.1, 0.3 + 0.3 * Math.random() - 0.6 * epicenter.getHighestEffect(city, EffectType.FireProtection));
        epicenter.damagedEfficiency = Math.max(0, epicenter.damagedEfficiency - intensity);
        intensity *= 0.9;

        //Generally do the most damage to the closest buildings, but not roads or already-very-damaged buildings. More damage but fewer buildings affected than an Earthquake.
        //Police coverage reduces the number of damaged buildings.
        const policeCoverage = this.calculatePoliceCoverage(city, epicenter);
        let buildingsToDamage = Math.ceil(Math.log10(city.peakPopulation) * (1 - policeCoverage));
        if (buildingsToDamage <= 0) return; //One was enough, I guess!

        const potentiallyDamaged = [...city.getBuildingsInArea(epicenter.x, epicenter.y, epicenter.width, epicenter.height, 5, 5, false, true)];
        potentiallyDamaged.sort((a, b) => Math.abs(a.x - epicenter.x) + Math.abs(a.y - epicenter.y) - Math.abs(b.x - epicenter.x) - Math.abs(b.y - epicenter.y));
        for (const building of potentiallyDamaged) {
            if (building === epicenter || building.damagedEfficiency < 1 - intensity || !building.owned) continue;
            building.damagedEfficiency = Math.max(0, building.damagedEfficiency - (0.8 + Math.random() * 0.2) * intensity);
            intensity *= 0.9;
            if (--buildingsToDamage === 0) break;
        }
    }
}

export class EconomicBoom extends CityEvent {
    public chosenOnes: string[] = []; //Gets saved and loaded
    constructor() {
        super("economicboom", "Economic Boom", 7 * LONG_TICKS_PER_DAY,
            "Prices are taking off! They'll probably settle down within a week, though. The buy and sell values of the following resources have doubled: ",
            "The economic boom has ended. Prices have returned to normal levels.", "businesspresence");
    }

    override shouldStart(city: City, date: Date): boolean {
        //1% chance if the city has >200 people and it hasn't happened in at least 20 days
        const shouldStart = this.checkedStart(city.peakPopulation > 200 && this.skippedStarts > this.maxDuration + 20 * LONG_TICKS_PER_DAY && Math.random() < 0.01, city, date);

        if (shouldStart) {
            //Pick random resources based on the player's in-stock amounts with chance based on weighted average of quantity, so it's a positive event (gives them a reason to sell off).
            this.chosenOnes = [];
            const resources = Array.from(city.resources.values()).filter(p => p.capacity !== 0 && !p.isSpecial).sort((a, b) => b.amount - a.amount);
            let totalAmount = resources.reduce((sum, p) => sum + p.amount, 0);
            for (let i = 0; i < 3; i++) {
                let target = Math.random() * totalAmount;
                for (const resource of resources) {
                    target -= resource.amount;
                    if (target <= 0) {
                        this.chosenOnes.push(resource.type);
                        totalAmount -= resource.amount; //Don't pick the same one twice
                        resources.splice(resources.indexOf(resource), 1);
                        break;
                    }
                }
            }

            //Update the start message with specifics if it triggers.
            this.startMessage = new EconomicBoom().startMessage + this.chosenOnes.join(", ") + ".";
        }

        return shouldStart;
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        for (const type of this.chosenOnes) {
            const resource = city.resources.get(type)!;
            resource.buyPrice *= 2;
            resource.sellPrice *= 2;
        }
    }

    override end(city: City): void {
        super.end(city);
        for (const type of this.chosenOnes) {
            const resource = city.resources.get(type)!;
            resource.buyPrice /= 2; //Multiplying or dividing by powers of 2 won't cause any rounding error.
            resource.sellPrice /= 2;
        }
    }
}

export class Epidemic extends CityEvent {
    constructor() {
        super("epidemic", "Epidemic", 7 * LONG_TICKS_PER_DAY,
            "People are clueless about how to take care of their own bodies, and your healthcare coverage is underwhelming. An epidemic has spread and is causing economic havoc.",
            "They got better--the coughers are back to breaking their backs to fill your coffers.", "epidemic", EventTickTiming.Population);
    }

    override shouldStart(city: City, date: Date): boolean {
        //No chance unless health coverage is subpar; if the city has enough people and it hasn't happened in at least 25 days, and at 0.5 coverage, it's a 2.5% chance. At 0 coverage, it's 5%.
        return city.flags.has(CityFlags.HealthcareMatters) && this.checkedStart(this.skippedStarts > 25 * LONG_TICKS_PER_DAY && Math.random() < this.getEpidemicChance(city), city, date);
    }

    public getEpidemicChance(city: City): number {
        return 0.005 * (10 - Math.round(10 * this.getAverageHealth(city)));
    }

    private getAverageHealth(city: City): number {
        let effectSum = 0;
        let relevantTileCount = 0;
        for (let y = 0; y < city.height; y++) {
            for (let x = 0; x < city.width; x++) {
                const building = city.grid[y][x];
                if (!building || !this.isRelevantBuilding(building)) continue;

                relevantTileCount++;
                for (const effect of city.effectGrid[y][x]) {
                    if (effect.type === EffectType.Healthcare) effectSum += effect.getEffect(city, null, y, x);
                    else if (effect.type === EffectType.ParticulatePollution) effectSum -= effect.getEffect(city, null, y, x) * city.particulatePollutionMultiplier;
                }
            }
        }
        return relevantTileCount > 0 ? Math.min(1, effectSum / relevantTileCount) : 0;
    }

    private isRelevantBuilding(building: Building): boolean {
        return building.owned &&
            !building.isRoad &&
            (!building.needsRoad || building.roadConnected);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        this.duration *= 2 - this.getAverageHealth(city); //The worse the health coverage, the longer the epidemic lasts, up to 2x for 0 coverage
    }

    override onLongTick(city: City): boolean {
        const populationResource = city.resources.get("population");
        if (populationResource) populationResource.amount *= 0.995; //Can lose about 13%-25% of the population over the course of the epidemic
        return super.onLongTick(city);
    }
}

export class Spoilage extends CityEvent {
    constructor() {
        super("spoilage", "Spoilage", 0, //Instant event
            "One of your Cold Storages has had insufficient power for too long, and the food inside has spoiled. You gotta keep that juice flowin'! They consume power for a reason!",
            "", "foodsatisfaction");
    }

    private getSpoilableFoods(city: City, coldStorages: Building[]): { type: string, amountToSpoil: number }[] {
        //Calculate how much food we have by type, how much storage we have by type, and how many Cold Storages can be completely unpowered without spoilage by type.
        const usableCapacityFraction = 1 - coldStorages.filter(p => p.businessFailureCounter > LONG_TICKS_PER_DAY).length / coldStorages.length;
        const foods = [...new Set(coldStorages.flatMap(p => p.stores.map(p => p.type)))].map(p => ({
            type: p,
            amountToSpoil: city.resources.get(p)!.amount - Math.min(city.resources.get(p)!.amount, city.resources.get(p)!.capacity * usableCapacityFraction)
        }));
        return foods.filter(p => p.amountToSpoil > 0);
    }

    override shouldStart(city: City, date: Date): boolean {
        //Increasing chance each tick if a cold storage has been underpowered for at least 1 day. Track it on the Cold Storages themselves via the businessFailureCounter.
        let anyUnpowered = false;
        let maxBusinessFailureCounter = 0;
        const coldStorages = city.buildings.filter(p => p.type === getBuildingType(ColdStorage));
        if (!coldStorages.length) return false;
        coldStorages.forEach(p => {
            if (p.lastEfficiency < 0.8) {
                if (++p.businessFailureCounter >= LONG_TICKS_PER_DAY) {
                    anyUnpowered = true;
                    if (p.businessFailureCounter > maxBusinessFailureCounter) maxBusinessFailureCounter = p.businessFailureCounter;
                }
            } else p.businessFailureCounter = 0;
        });
        if (!anyUnpowered) return false;

        //Use the maximum coldStorages' businessFailureCounter as the chance to trigger the event. Guaranteed by 5 days.
        const spoilableFoods = this.getSpoilableFoods(city, coldStorages);
        return this.checkedStart(spoilableFoods.length > 0 && Math.random() < maxBusinessFailureCounter / LONG_TICKS_PER_DAY / 5, city, date);
    }

    override start(city: City, date: Date): void {
        super.start(city, date);
        const coldStorages = city.buildings.filter(p => p.type === getBuildingType(ColdStorage));
        const spoilableFoods = this.getSpoilableFoods(city, coldStorages);
        spoilableFoods.forEach(p => {
            const resource = city.resources.get(p.type)!;
            resource.amount -= p.amountToSpoil;
        });
    }
}

//Dropped idea (since I made the Alien Monolith): Alien structure spawn event. +land value and organized crime and it produces a unique resource.
//TODO: Close call - fission power plant has to shut down for a day to repair after the safety triggered

export const EVENT_TYPES = <CityEvent[]>([
    /*Fixed seasonal events*/ Hauntymonth, Merrymonth,
    /*Minigame-triggered events*/ TourismReward, ProductionReward, PowerReward, HappinessReward, ResearchReward, //TODO: Others could be a temporary construction cost reduction and a temporary market buy price reduction
    /*Random negative events*/ Drought, Heatwave, ColdSnap, PowerOutage, Burglary, Heist, Epidemic, Fire, Earthquake, Riot, Spoilage,
    //...but Earthquake has positive effects, too: spawns a cheap geothermal power source sometimes, and spawns a hot spring the first time.
    /*Random positive events*/ EconomicBoom,
    /*Less random events*/ EmergencyPowerAid, UrbanRenewalGrant,
].map(p => new p()));
