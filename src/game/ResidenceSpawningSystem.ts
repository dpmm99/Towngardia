import { Building } from "./Building.js";
import { FurnitureStore, Highrise, Quadplex, Skyscraper, SmallApartment, SmallHouse, getBuildingType } from "./BuildingTypes.js";
import { City } from "./City.js";
import { CityFlags } from "./CityFlags.js";
import { EffectType } from "./GridType.js";
import { Notification } from "./Notification.js";
import { Happiness, Population, UntappedPatronage, getResourceType } from "./ResourceTypes.js";

const MIN_GLOBAL_CHANCE_FOR_UPGRADE = 0.6;
const MIN_DENSITY_FOR_UPGRADE = 0.35;
const MIN_DENSITY_FOR_HIGHRISE = 0.4;
const MIN_DENSITY_FOR_SKYSCRAPER = 0.5;
export class ResidenceSpawningSystem {
    private city: City;
    private residenceTypes: Building[];
    public globalSpawnChance: number = 0; //Now serialized so it can be checked in the UI
    private populationResource: Population;

    constructor(city: City) {
        this.city = city;
        this.residenceTypes = <Building[]>[
            new SmallHouse(),
            new Quadplex(),
            new SmallApartment(),
            new Highrise(),
            new Skyscraper(),
            //TODO: maybe a few others like a rich person's mansion (max 1 per city)
        ];
        this.populationResource = <Population>city.resources.get(new Population().type)!;
    }

    public onLongTick(): void {
        this.updateGlobalFactors();
        this.spawnResidences();
        this.upgradeResidences();
        this.despawnResidences();

        //Tell bad players that they're bad and how to stop being bad
        if (this.globalSpawnChance <= MIN_GLOBAL_CHANCE_FOR_UPGRADE && !this.city.flags.has(CityFlags.RemindedAboutResidencesNeedingBusinesses)
            && (this.city.presentBuildingCount.get(getBuildingType(SmallHouse)) ?? 0) >= 10
            && (this.city.presentBuildingCount.get(getBuildingType(SmallApartment)) ?? 0) + (this.city.presentBuildingCount.get(getBuildingType(Quadplex)) ?? 0)
            + (this.city.presentBuildingCount.get(getBuildingType(Highrise)) ?? 0) + (this.city.presentBuildingCount.get(getBuildingType(Skyscraper)) ?? 0) <= 3) {
            this.city.notify(new Notification("Horizontal Heresy", "Mutterings from your caffeine-fueled advisor: Your city planning strategy appears to be 'dramatically spread out and hope for the best.' Pro tip: Citizens love spending money. Squeeze those businesses close enough that they can hear each other's cash registers, and apartments (or better) will pop up faster than rumors at a small-town coffee shop. Key takeaways: one bigger residence costs you less and earns you more than several smaller residences, but they won't be built without several businesses around, and apartments are 2x2 tiles. Check the Business Presence view to see which houses may upgrade.", "advisor"));
            this.city.flags.add(CityFlags.RemindedAboutResidencesNeedingBusinesses);
        }
        if (!this.city.flags.has(CityFlags.RemindedAboutUntappedPatrons) && this.city.resources.get(getResourceType(UntappedPatronage))!.amount > 50) {
            this.city.notify(new Notification("Crying Capitalism", "Unsolicited (but totally correct) advice from your advisor: You've successfully created a city full of people with money burning holes in their pockets and precisely nowhere to spend it. It's like trying to pack your clothes for a 12-day cruise into a single shoe. Build more businesses to free your citizens of their unspent cash woes. Your treasurer is begging you. You can check the untapped patronage by viewing the info of any business.", "advisor"));
            this.city.flags.add(CityFlags.RemindedAboutUntappedPatrons);
        }
    }

    private updateGlobalFactors(): void {
        const happiness = this.city.resources.get(new Happiness().type)!.amount; //0 to 1
        const recentResourceSales = this.city.recentConstructionResourcesSold;
        const furnitureStores = this.city.buildings.filter(p => p instanceof FurnitureStore).reduce((acc, b) => acc + b.lastEfficiency, 0);
        const furnitureStoreEffect = 2 - Math.pow(2, 1 - furnitureStores); //Range of 0 to 2 with very sharp diminishing returns; 1 store at full efficiency is worth 1.

        // Adjust global spawn chance based on factors. Range: -0.6668 (0 happiness, 0 resource sales) to 1.21 (max happiness plus max resource sales plus a whole lot of maxed-out furniture stores).
        this.globalSpawnChance = (happiness - 0.4) * 1.667
            + Math.min(0.05, recentResourceSales * 0.001) //Selling construction resources locally makes it cheaper for people to build homes (max 5% bonus)
            + 0.08 * furnitureStoreEffect; //Furniture stores also make it cheaper for people to move in (max 16% bonus)

        // Boost chance if recovering from disaster
        if (this.populationResource.amount < this.city.peakPopulation * 0.9) {
            this.globalSpawnChance *= this.globalSpawnChance < 0 ? 0.5 : 1.5; //Higher impact if the global chance was negative
        }
    }

    private spawnResidences(): void {
        const visited = new Set<number>();
        this.city.dfs(p => p.isRoad, this.city.networkRoot.x, this.city.networkRoot.y, visited); //Now visited = the road tiles; let's loop through those and check tiles adjacent to the road. If those are null, we can build.

        //Max tiles to spawn on. The logarithmic population factor starts being a tiny bonus around 1000, about 40% at 15,000, 70% at 125,000, and 100% at 1,000,000.
        const calculatedMaxSpawnCount = Math.ceil(this.globalSpawnChance * 5 * Math.max(1, Math.min(2, Math.log10(this.city.peakPopulation) / 3)));
        const bestTiles: { x: number, y: number, desirability: number }[] = [];
        const checked = new Set<number>();
        for (const roadTile of visited) {
            const x = roadTile % this.city.width;
            const y = Math.floor(roadTile / this.city.width);
            for (let tile of [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }]) {
                if (tile.x < 0 || tile.y < 0 || tile.x >= this.city.width || tile.y >= this.city.height || this.city.grid[tile.y][tile.x] || checked.has(y * this.city.width + x)) continue; //No building, not out of bounds
                checked.add(y * this.city.width + x); //Don't check the same tile twice

                const desirability = this.calculateDesirability(tile.x, tile.y);
                if (bestTiles.some(tile => tile.desirability < desirability) || bestTiles.length < calculatedMaxSpawnCount) {
                    bestTiles.push({ x: tile.x, y: tile.y, desirability });
                    if (bestTiles.length > calculatedMaxSpawnCount) {
                        bestTiles.sort((a, b) => b.desirability - a.desirability);
                        bestTiles.pop();
                    }
                }
            }
        }

        for (const tile of bestTiles) {
            if (Math.random() < tile.desirability * this.globalSpawnChance) {
                this.spawnResidence(tile.x, tile.y); //TODO: if it can't spawn ANY, maybe we need to ensure it gets a higher calculatedMaxSpawnCount next time, or store more bestTiles than that count, or consider that a bug.
            }
        }
    }

    private upgradeResidences() {
        //Pick a random house and see if it can upgrade to an apartment. Has a minimum happiness requirement, and the chance increases as happiness increases, but limited to 1 per long tick.
        if (this.globalSpawnChance > MIN_GLOBAL_CHANCE_FOR_UPGRADE && Math.random() < this.globalSpawnChance) {
            const houses = this.city.buildings.filter(p => p.isResidence && !p.residenceLevel && this.city.getBusinessDensity(p.x, p.y) >= MIN_DENSITY_FOR_UPGRADE); //Higher minimum density than normal apartment spawning
            const house = houses[Math.floor(Math.random() * houses.length)];
            if (house) {
                const upgradeTo = this.selectResidenceType(house.x, house.y, true);
                if (upgradeTo) this.city.addBuilding(upgradeTo.type.clone(), upgradeTo.x, upgradeTo.y);
            }

            //Upgrade apartments to bigger ones as well. Note: theoretically possible to upgrade the one we JUST upgraded from a house.
            //Warning: This specifically checks for SmallApartments, so if you add more apartment types, you'll need to adjust this.
            const upgradableApartments = this.city.buildings.filter(p => p.isResidence && p.residenceLevel && (p instanceof SmallApartment || p instanceof Quadplex) && this.city.getBusinessDensity(p.x, p.y) >= MIN_DENSITY_FOR_HIGHRISE);
            const apartment = upgradableApartments[Math.floor(Math.random() * upgradableApartments.length)];
            if (apartment) {
                const upgradeTo = this.selectResidenceType(apartment.x, apartment.y, true); //Basically only a 50% chance to upgrade. I like that, so not changing the interface.
                if (upgradeTo) this.city.addBuilding(upgradeTo.type.clone(), upgradeTo.x, upgradeTo.y);
            }

            //Same for Highrise.
            const upgradableHighrises = this.city.buildings.filter(p => p.isResidence && p.residenceLevel && p instanceof Highrise && this.city.getBusinessDensity(p.x, p.y) >= MIN_DENSITY_FOR_SKYSCRAPER);
            const highrise = upgradableHighrises[Math.floor(Math.random() * upgradableHighrises.length)];
            if (highrise) {
                const upgradeTo = this.selectResidenceType(highrise.x, highrise.y, true); //Basically only a 50% chance to upgrade. I like that, so not changing the interface.
                if (upgradeTo) this.city.addBuilding(upgradeTo.type.clone(), upgradeTo.x, upgradeTo.y);
            }

            //Nothing above Skyscraper at the moment, so no block for that.
        }
    }

    private despawnResidences() {
        //Despawn, too
        const maxDespawnCount = Math.ceil(Math.log10(this.city.peakPopulation)) * 2 - 1;
        const suckyHomes: { building: Building, desirability: number }[] = [];
        const buildings = this.city.buildings.filter(p => p.isResidence);
        for (const building of buildings) {
            const desirability = Math.max(this.calculateDesirability(building.x, building.y), building.width !== 1
                ? Math.max(this.calculateDesirability(building.x + building.width - 1, building.y), this.calculateDesirability(building.x + building.width - 1, building.y + building.height - 1), this.calculateDesirability(building.x, building.y + building.height - 1))
                : -2) + 0.5 * (building.damagedEfficiency - 1); //Damage is now also a factor
            if (desirability < 0 || this.globalSpawnChance < 0) { //The home sucks OR the city really sucks.
                if ((this.globalSpawnChance >= 0 && Math.random() < -desirability) //But people are happy in the city overall--chance is just desirability.
                    || this.globalSpawnChance < 0 && Math.random() < 1 - desirability + Math.abs(this.globalSpawnChance)) { //Or the home sucks AND people are generally unhappy across the city--chance is undesirability PLUS unhappiness.
                    suckyHomes.push({ building, desirability });
                    if (suckyHomes.length > maxDespawnCount) {
                        suckyHomes.sort((a, b) => b.desirability - a.desirability);
                        suckyHomes.pop();
                    }
                }
            }
        }

        for (const home of suckyHomes) {
            this.city.removeBuilding(home.building);
        }
    }

    //Wasn't needed
    //private isEmptyAndRoadAdjacent(x: number, y: number): boolean {
    //    const tile = this.city.grid[y][x];
    //    if (tile) return false;
    //    if (x > 0 && this.city.grid[y][x - 1]?.isRoad) return true;
    //    if (x < this.city.width - 1 && this.city.grid[y][x + 1]?.isRoad) return true;
    //    if (y > 0 && this.city.grid[y - 1][x]?.isRoad) return true;
    //    if (y < this.city.height - 1 && this.city.grid[y + 1][x]?.isRoad) return true;
    //    return false;
    //}

    public calculateDesirability(x: number, y: number): number {
        let score = -0.15; //Initial bias chosen based on actual values in a test city. They were too eager to build apartments next to a coal power plant.
        score += this.city.getLandValue(x, y) + Math.sqrt(Math.max(0, this.city.getEducation(x, y))) * 0.25;
        //Organized crime is twice as harmful; 1 police protection is worth 1 crime elimination. Caps at 0.2 because police protection alone doesn't make a place very desirable.
        score += Math.min(0.25, Math.sqrt(Math.max(0, this.city.getPoliceProtection(x, y))) - this.city.getPettyCrime(x, y) - 2 * this.city.getOrganizedCrime(x, y));
        //Healthcare CAN be worth a bit more than police protection and pollution always has a negative impact. But doubled-up healthcare doesn't help anything.
        score += 0.3 * (Math.min(1, Math.sqrt(Math.max(0, this.city.getHealthcare(x, y)))) - this.city.getParticulatePollution(x, y)); //May want to square pollution or something, though...
        score -= 0.05 * this.city.getNoise(x, y) * (3 - this.city.techManager.getAdoption('vacuumwindows')); //Noise has an impact of 0.15 and can be reduced by a third by vacuum windows.
        //Fire protection doesn't have much impact, but it does affect happiness (and therefore global chance).

        return score;
    }

    private spawnResidence(x: number, y: number): void {
        const residenceTypeAndPos = this.selectResidenceType(x, y);
        if (residenceTypeAndPos) {
            this.city.addBuilding(residenceTypeAndPos.type.clone(), residenceTypeAndPos.x, residenceTypeAndPos.y);
            this.city.recentConstructionResourcesSold = Math.max(0, this.city.recentConstructionResourcesSold - 2 * residenceTypeAndPos.type.width * residenceTypeAndPos.type.height);
        }
    }

    private getAllowedTypesAndPositions(x: number, y: number, minLevel: number = 0): { type: Building, x: number, y: number }[] {
        return this.residenceTypes.filter(p => p.residenceLevel >= minLevel)
            .flatMap(type => type.width === 1 && type.height === 1
                ? { type, x, y } //One tile; be faster
                : [{ type, x, y }, { type, x: x - type.width + 1, y }, { type, x, y: y - type.height + 1 }, { type, x: x - type.width + 1, y: y - type.height + 1 }]) //The four corners
            .filter(tp => tp.type.canPlace(this.city, tp.x, tp.y, true));
    }

    public getWillUpgrade(building: Building): boolean {
        if (this.globalSpawnChance <= MIN_GLOBAL_CHANCE_FOR_UPGRADE) return false;

        const allowedTypesAndPositions = this.getAllowedTypesAndPositions(building.x, building.y, building.residenceLevel + 1);
        const businessDensity = Math.max(...allowedTypesAndPositions.map(p => p.type.getHighestEffect(this.city, EffectType.BusinessPresence, p.x, p.y)));
        return businessDensity > MIN_DENSITY_FOR_UPGRADE;
    }

    private selectResidenceType(x: number, y: number, forceApartment: boolean = false): { type: Building, x: number, y: number } | undefined {
        const allowedTypesAndPositions = this.getAllowedTypesAndPositions(x, y, forceApartment ? 1 : 0);
        let isApartment = forceApartment;
        if (!forceApartment) {
            const businessDensity = Math.max(...allowedTypesAndPositions.map(p => p.type.getHighestEffect(this.city, EffectType.BusinessPresence, p.x, p.y)));
            const apartmentChance = businessDensity * 0.5;
            isApartment = businessDensity >= 0.25 && Math.random() < apartmentChance;
        }

        //Quadplex is ONLY allowed if SmallApartment can't fit.
        if (isApartment && allowedTypesAndPositions.some(tp => tp.type instanceof SmallApartment)) {
            const quadplexIndex = allowedTypesAndPositions.findIndex(tp => tp.type instanceof Quadplex);
            if (quadplexIndex > -1) allowedTypesAndPositions.splice(quadplexIndex, 1);
        }

        //TODO: If there are multiple allowed positions, prefer the one that's a perfect fit or that destroys the least houses. :)
        return allowedTypesAndPositions.find(tp => isApartment ? tp.type.residenceLevel : !tp.type.residenceLevel) //Apartments are a nonzero residenceLevel
            || allowedTypesAndPositions[0]; // Fallback to first type if not found
    }
}
