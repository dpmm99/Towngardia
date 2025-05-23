import { Building } from "./Building.js";
import { City } from "./City.js";
import { CityFlags } from "./CityFlags.js";
import { EffectType } from "./GridType.js";
import { FoodSatisfaction } from "./ResourceTypes.js";
import { Notification } from "./Notification.js";
import { AssemblyHouse, DataCenter, ECarRental, FreeStuffTable, GameDevStudio, Geolab, MohoMine, Nanogigafactory, NuclearFuelTruck, NuclearPowerPlant, NuclearStorage, Observatory, PharmaceuticalsLab, SauceCode, SpaceLaunchSite, TourksTrekkers, getBuildingType } from "./BuildingTypes.js";
import { HappinessReward } from "./EventTypes.js";

export const HIGH_TECH_UNLOCK_EDU = 0.9;

export class HappinessCalculator {
    private effectSums: Map<EffectType, number> = new Map();
    private uncoveredTiles: Map<EffectType, number> = new Map();
    private relevantTileCount: number = 0;

    constructor(
        private city: City,
    ) {
    }

    public calculateHappiness(): number {
        this.calculateEffectSums(); //All at once so we don't loop through the grid a bunch of times

        let happiness = 0.5; // Start at neutral happiness. Note: the sum of all positive effects would be about 1.17 if everything is perfect (but it can be higher due to overlapping service coverage, luxury, land value, etc., though land value is rarely nonzero).

        happiness += this.calculateSafetyHappiness();
        happiness += this.calculateEnvironmentHappiness();
        happiness += this.calculateEconomyHappiness();
        happiness += this.calculateQualityOfLifeHappiness();
        happiness += this.calculateResidentialPenalties(); //A couple of big effects (power outages and residential damage)--the sum caps at 1.5
        const eventBonus = this.city.events.filter(p => p instanceof HappinessReward).reduce((a, b) => a + (b as HappinessReward).getBonus(), 0); //Add happiness from events
        this.setDisplayStats("Events", eventBonus);
        happiness += eventBonus;

        this.setDisplayStats("Other", happiness - [...this.city.happinessBreakdown].filter(p => p[0] != "Other").reduce((a, b) => a + b[1], 0));

        // Normalize happiness to be between 0 and 1
        return Math.max(0, Math.min(1, happiness));
    }

    private calculateEffectSums(): void {
        this.effectSums.clear();
        this.relevantTileCount = 0;

        for (let y = 0; y < this.city.height; y++) {
            for (let x = 0; x < this.city.width; x++) {
                const building = this.city.grid[y][x];
                if (!building || !this.isRelevantBuilding(building)) continue;

                this.relevantTileCount++;

                //We will only possibly penalize for these effect types
                const unaffectedTypes = new Set([EffectType.PoliceProtection, EffectType.FireProtection, EffectType.Healthcare, EffectType.Luxury]);
                for (const effect of this.city.effectGrid[y][x]) {
                    const currentSum = this.effectSums.get(effect.type) || 0;
                    this.effectSums.set(effect.type, currentSum + effect.getEffect(this.city, null, y, x));
                    if (currentSum > 0.0001) unaffectedTypes.delete(effect.type);
                }

                //We want a subtraction effect for tiles with zero coverage for certain services, even if the average is pretty nice.
                for (const effectType of unaffectedTypes) {
                    //Check if the building has ANY coverage for that effect type--not a very efficient algorithm, especially with low coverage and large buildings, but it's a simple implementation.
                    if (building.getHighestEffect(this.city, effectType) <= 0.0001) {
                        const currentUncovered = this.uncoveredTiles.get(effectType) || 0;
                        this.uncoveredTiles.set(effectType, currentUncovered + 1);
                    }
                }
            }
        }
        if (!this.relevantTileCount) this.relevantTileCount = 1; //Avoid division by zero the easy way
    }

    private isRelevantBuilding(building: Building): boolean {
        return building.owned &&
            !building.isRoad &&
            (!building.needsRoad || building.roadConnected);
    }

    private getAverageEffect(effectType: EffectType): number {
        return this.relevantTileCount > 0 ? (this.effectSums.get(effectType) || 0) / this.relevantTileCount : 0;
    }

    private setDisplayStats(name: string, current: number, maximum?: number | undefined) {
        this.city.happinessBreakdown.set(name, current);
        if (maximum !== undefined) this.city.happinessMaxima.set(name, maximum);
        else this.city.happinessMaxima.delete(name);
    }

    private calculateSafetyHappiness(): number {
        let safety = 0;

        if (this.city.flags.has(CityFlags.PoliceProtectionMatters)) {
            const policePresence = this.getAverageEffect(EffectType.PoliceProtection); //Note: since it's not a linear factor, it would make a little bit more sense to sum the net of individual tiles (e.g., high-crime areas should be more important than having decent overall coverage)
            const pettyCrime = this.getAverageEffect(EffectType.PettyCrime);
            const organizedCrime = this.getAverageEffect(EffectType.OrganizedCrime);
            const difference = Math.sqrt(Math.max(0, policePresence)) - pettyCrime - 2 * organizedCrime;
            safety += Math.min(0.5, difference) * (difference > 0 ? 0.1 : 0.15); //Caps at +0.05, no cap in the other direction, but even worse impact if below zero
            if (this.city.peakPopulation > 150) safety += (this.uncoveredTiles.get(EffectType.PoliceProtection) || 0) / this.relevantTileCount * -0.1; //Extra penalty for zero coverage kicks in a bit later
            this.setDisplayStats("Police and crime", safety, 0.05);
        } else safety += 0.04;

        if (this.city.flags.has(CityFlags.FireProtectionMatters)) {
            let fire = Math.min(1, Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.FireProtection)))) * 0.05; //Caps at +0.05, no cap in the other direction
            if (this.city.peakPopulation > 325) fire += (this.uncoveredTiles.get(EffectType.FireProtection) || 0) / this.relevantTileCount * -0.1; //Extra penalty for zero coverage kicks in a bit later
            this.setDisplayStats("Fire protection", fire, 0.05);
            safety += fire;
        } else safety += 0.045;

        return safety;
    }

    private calculateEnvironmentHappiness(): number {
        const particulate = Math.max(0, this.getAverageEffect(EffectType.ParticulatePollution)) * -0.12 * this.city.particulatePollutionMultiplier;
        this.setDisplayStats("Particulate pollution", particulate);
        const noise = this.getAverageEffect(EffectType.Noise) * -0.07;
        this.setDisplayStats("Noise", noise);

        let environment = particulate + noise;
        if (this.city.flags.has(CityFlags.GreenhouseGasesMatter)) {
            const greenhouse = Math.max(0, this.getAverageEffect(EffectType.GreenhouseGases)) * -0.05;
            environment += greenhouse;
            this.setDisplayStats("Greenhouse gases", greenhouse);
        }

        return environment;
    }

    private calculateEconomyHappiness(): number {
        const businessPresence = Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.BusinessPresence))) * 0.05; //No cap
        this.setDisplayStats("Business presence", businessPresence);
        const landValue = this.getAverageEffect(EffectType.LandValue) * 0.05; //No cap
        this.setDisplayStats("Land value", landValue);
        const incomeTax = (this.city.budget.taxRates["income"] - 0.09) * -3; //9%, 10%, 11% -> deductions of 0, 0.03, 0.06
        this.setDisplayStats("Income tax", incomeTax, 0);
        const salesTax = (this.city.budget.taxRates["sales"] - 0.09) * -2; //0, 0.02, 0.04
        this.setDisplayStats("Sales tax", salesTax, 0);
        const propertyTax = (this.city.budget.taxRates["property"] - 0.09) * -1; //0, 0.01, 0.02
        this.setDisplayStats("Property tax", propertyTax, 0);

        const freeStuff = this.city.buildings.filter(p => p instanceof FreeStuffTable).reduce((a, b) => a + b.lastEfficiency * b.outputResources[0].productionRate, 0); //No cap, but only <=1% each.
        this.setDisplayStats("Free stuff", freeStuff);

        return businessPresence + landValue + incomeTax + salesTax + propertyTax + freeStuff;
    }

    private calculateQualityOfLifeHappiness(): number {
        let qol = 0;
        let luxury = Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.Luxury))) * 0.12; //No cap
        if (this.city.peakPopulation > 550) luxury += (this.uncoveredTiles.get(EffectType.Luxury) || 0) / this.relevantTileCount * -0.1; //Penalty kicks in after a while to encourage at least basic luxuries
        this.setDisplayStats("Luxury", luxury);
        qol += luxury;

        if (this.city.flags.has(CityFlags.HealthcareMatters)) {
            let healthcare = Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.Healthcare))) * 0.1; //No cap
            if (this.city.peakPopulation > 1050) healthcare += (this.uncoveredTiles.get(EffectType.Healthcare) || 0) / this.relevantTileCount * -0.1; //Extra penalty for zero coverage kicks in a bit later
            this.setDisplayStats("Healthcare", healthcare);
            qol += healthcare;
        } else qol += 0.09;

        if (this.city.flags.has(CityFlags.EducationMatters)) {
            const avgEducation = Math.max(0, this.city.getCityAverageEducation());
            const education = Math.sqrt(avgEducation) * 0.1; //No cap
            this.setDisplayStats("Education", education);
            qol += education;

            if (!this.city.flags.has(CityFlags.UnlockedGameDev) && avgEducation >= HIGH_TECH_UNLOCK_EDU) {
                this.city.notify(new Notification("Neeerd!", "You've granted your population a grand education. As such, they are now capable of constructing and running higher-tech facilities relating to electronics, medicine, nuclear energy, astronomy, and geology.", "education"));
                for (const type of [ECarRental, DataCenter, NuclearStorage, NuclearPowerPlant, NuclearFuelTruck, SauceCode, GameDevStudio, Observatory, AssemblyHouse, Nanogigafactory, PharmaceuticalsLab, MohoMine, SpaceLaunchSite,
                    /*Volcanic*/TourksTrekkers, Geolab,])
                    this.city.unlock(getBuildingType(type));
                this.city.flags.add(CityFlags.UnlockedGameDev);
            }
        } else qol += 0.09;

        const food = this.city.resources.get(new FoodSatisfaction().type)!.amount * 0.13;
        this.setDisplayStats("Food gratification", food, 0.13); //Food gratification itself has a cap of 1
        qol += food;

        return qol;
    }

    private calculateResidentialPenalties(): number {
        let totalPowerNeeded = 0;
        let totalPowerReceived = 0;
        let totalWaterNeeded = 0;
        let totalWaterReceived = 0;
        let totalResidences = 0;
        let totalRepair = 0;

        this.city.buildings.forEach(building => {
            if (building.isResidence) {
                if (!building.isNew) { //Don't count "power outages" for newly placed buildings--they wouldn't be at 100% if not placed during the first short tick after a long tick, anyway.
                    if (building.needsPower) {
                        totalPowerNeeded += 1;
                        totalPowerReceived += building.poweredTimeDuringLongTick;
                    }
                    if (building.needsWater) {
                        totalWaterNeeded += 1;
                        totalWaterReceived += building.wateredTimeDuringLongTick;
                    }
                }
                totalResidences++;
                totalRepair += building.damagedEfficiency;
            }
        });

        let untreatedWaterPenalty = 0;
        if (this.city.flags.has(CityFlags.WaterTreatmentMatters)) {
            untreatedWaterPenalty = -0.5 * Math.sqrt(this.city.untreatedWaterPortion); //Lose 5% happiness for the first 1% untreated water, 15% for 9%.
            this.setDisplayStats("Untreated water", untreatedWaterPenalty, 0);
        }

        const blackoutPenalty = totalPowerNeeded > 0 ? 0.75 * (totalPowerReceived / totalPowerNeeded - 1) : 0;
        this.setDisplayStats("Power outages", blackoutPenalty, 0);

        let waterOutagePenalty = 0;
        if (this.city.flags.has(CityFlags.WaterMatters)) {
            waterOutagePenalty = totalWaterNeeded > 0 ? 0.75 * (totalWaterReceived / totalWaterNeeded - 1) : 0;
            this.setDisplayStats("Water outages", waterOutagePenalty, 0);
        }

        const damagePenalty = totalResidences > 0 ? 0.75 * (totalRepair / totalResidences - 1) : 0;
        this.setDisplayStats("Residence damage", damagePenalty, 0);
        return blackoutPenalty + damagePenalty + untreatedWaterPenalty + waterOutagePenalty;
    }
}