import { Building } from "./Building.js";
import { City } from "./City.js";
import { CityFlags } from "./CityFlags.js";
import { EffectType } from "./GridType.js";
import { FoodSatisfaction } from "./ResourceTypes.js";
import { Notification } from "./Notification.js";
import { AssemblyHouse, DataCenter, ECarRental, GameDevStudio, MohoMine, Nanogigafactory, NuclearFuelTruck, NuclearPowerPlant, NuclearStorage, PharmaceuticalsLab, SpaceLaunchSite, getBuildingType } from "./BuildingTypes.js";

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
                const unaffectedTypes = new Set([EffectType.PolicePresence, EffectType.FirePrevention, EffectType.Healthcare, EffectType.Luxury]);
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
            const policePresence = this.getAverageEffect(EffectType.PolicePresence); //Note: since it's not a linear factor, it would make a little bit more sense to sum the net of individual tiles (e.g., high-crime areas should be more important than having decent overall coverage)
            const pettyCrime = this.getAverageEffect(EffectType.PettyCrime);
            const organizedCrime = this.getAverageEffect(EffectType.OrganizedCrime);
            const difference = Math.sqrt(Math.max(0, policePresence)) - pettyCrime - 2 * organizedCrime;
            safety += Math.min(0.5, difference) * (difference > 0 ? 0.1 : 0.15); //Caps at +0.05, no cap in the other direction, but even worse impact if below zero
            if (this.city.peakPopulation > 150) safety += (this.uncoveredTiles.get(EffectType.PolicePresence) || 0) / this.relevantTileCount * -0.1; //Extra penalty for zero coverage kicks in a bit later
            this.setDisplayStats("Police and crime", safety, 0.05);
        } else safety += 0.04;

        if (this.city.flags.has(CityFlags.FireProtectionMatters)) {
            let fire = Math.min(1, Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.FirePrevention)))) * 0.05; //Caps at +0.05, no cap in the other direction
            if (this.city.peakPopulation > 325) fire += (this.uncoveredTiles.get(EffectType.FirePrevention) || 0) / this.relevantTileCount * -0.1; //Extra penalty for zero coverage kicks in a bit later
            this.setDisplayStats("Fire protection", fire, 0.05);
            safety += fire;
        } else safety += 0.045;

        return safety;
    }

    private calculateEnvironmentHappiness(): number {
        const particulate = this.getAverageEffect(EffectType.ParticulatePollution) * -0.12;
        this.setDisplayStats("Particulate pollution", particulate);
        const noise = this.getAverageEffect(EffectType.Noise) * -0.07;
        this.setDisplayStats("Noise", noise);

        let environment = particulate + noise;
        if (this.city.flags.has(CityFlags.GreenhouseGasesMatter)) {
            const greenhouse = this.getAverageEffect(EffectType.GreenhouseGases) * -0.05;
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
        return businessPresence + landValue + incomeTax + salesTax + propertyTax;
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

            if (!this.city.flags.has(CityFlags.UnlockedGameDev) && avgEducation > 0.9) {
                this.city.notify(new Notification("Neeerd!", "You've granted your population a grand education. As such, they are now capable of constructing higher-tech facilities relating to electronics, medicine, nuclear energy, astronomy, and geology.", "education"));
                for (const type of [ECarRental, DataCenter, NuclearStorage, NuclearPowerPlant, NuclearFuelTruck, GameDevStudio, AssemblyHouse, Nanogigafactory, PharmaceuticalsLab, MohoMine, SpaceLaunchSite])
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
        let totalResidences = 0;
        let totalRepair = 0;

        this.city.buildings.forEach(building => {
            if (building.isResidence) {
                if (building.needsPower) {
                    totalPowerNeeded += 1;
                    totalPowerReceived += building.poweredTimeDuringLongTick;
                }
                totalResidences++;
                totalRepair += building.damagedEfficiency;
            }
        });

        const blackoutPenalty = totalPowerNeeded > 0 ? 0.75 * (totalPowerReceived / totalPowerNeeded - 1) : 0;
        this.setDisplayStats("Power outages", blackoutPenalty, 0);
        const damagePenalty = totalResidences > 0 ? 0.75 * (totalRepair / totalResidences - 1) : 0;
        this.setDisplayStats("Residence damage", damagePenalty, 0);
        return blackoutPenalty + damagePenalty;
    }
}