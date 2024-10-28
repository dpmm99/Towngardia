import { Building } from "./Building.js";
import { City } from "./City.js";
import { CityFlags } from "./CityFlags.js";
import { EffectType } from "./GridType.js";
import { FoodSatisfaction } from "./ResourceTypes.js";
import { Notification } from "./Notification.js";
import { AssemblyHouse, DataCenter, ECarRental, GameDevStudio, MohoMine, Nanogigafactory, NuclearFuelTruck, NuclearPowerPlant, NuclearStorage, PharmaceuticalsLab, SpaceLaunchSite, getBuildingType } from "./BuildingTypes.js";

export class HappinessCalculator {
    private effectSums: Map<EffectType, number> = new Map();
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
        happiness -= this.calculateResidentialBlackoutPenalty(); //A big effect--caps at 1.0

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

                for (const effect of this.city.effectGrid[y][x]) {
                    const currentSum = this.effectSums.get(effect.type) || 0;
                    this.effectSums.set(effect.type, currentSum + effect.getEffect(this.city, null, y, x));
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

    private calculateSafetyHappiness(): number {
        let safety = 0;

        if (this.city.flags.has(CityFlags.PoliceProtectionMatters)) {
            const policePresence = this.getAverageEffect(EffectType.PolicePresence); //TODO: I probably should have considered the net effect on individual tiles...oh, well.
            const pettyCrime = this.getAverageEffect(EffectType.PettyCrime);
            const organizedCrime = this.getAverageEffect(EffectType.OrganizedCrime);
            const difference = Math.sqrt(Math.max(0, policePresence)) - pettyCrime - 2 * organizedCrime;
            safety += Math.min(0.5, difference) * (difference > 0 ? 0.1 : 0.15); //Caps at +0.05, no cap in the other direction, but even worse impact if below zero
        } else safety += 0.09;

        if (this.city.flags.has(CityFlags.FireProtectionMatters)) {
            safety += Math.min(1, Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.FirePrevention)))) * 0.05; //Caps at +0.05, no cap in the other direction
        } else safety += 0.045;

        return safety;
    }

    private calculateEnvironmentHappiness(): number {
        let environment = 0;
        environment -= this.getAverageEffect(EffectType.ParticulatePollution) * 0.12;
        environment -= this.getAverageEffect(EffectType.Noise) * 0.07;

        if (this.city.flags.has(CityFlags.GreenhouseGasesMatter)) {
            environment -= this.getAverageEffect(EffectType.GreenhouseGases) * 0.05;
        }

        return environment;
    }

    private calculateEconomyHappiness(): number {
        let economy = 0;
        economy += Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.BusinessPresence))) * 0.05; //No cap
        economy += this.getAverageEffect(EffectType.LandValue) * 0.05; //No cap
        economy -= (this.city.budget.taxRates["income"] - 0.09) * 3; //9%, 10%, 11% -> deductions of 0, 0.03, 0.06
        economy -= (this.city.budget.taxRates["sales"] - 0.09) * 2; //0, 0.02, 0.04
        return economy;
    }

    private calculateQualityOfLifeHappiness(): number {
        let qol = 0;
        qol += Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.Luxury))) * 0.12; //No cap

        if (this.city.flags.has(CityFlags.HealthcareMatters)) {
            qol += Math.sqrt(Math.max(0, this.getAverageEffect(EffectType.Healthcare))) * 0.1; //No cap
        } else qol += 0.09;

        if (this.city.flags.has(CityFlags.EducationMatters)) {
            const avgEducation = Math.max(0, this.city.getCityAverageEducation());
            qol += Math.sqrt(avgEducation) * 0.1; //No cap

            if (!this.city.flags.has(CityFlags.UnlockedGameDev) && avgEducation > 0.9) {
                this.city.notify(new Notification("Neeerd!", "You've granted your population a grand education. As such, they are now capable of constructing higher-tech facilities relating to electronics, medicine, nuclear energy, astronomy, and geology.", "education"));
                for (const type of [ECarRental, DataCenter, NuclearStorage, NuclearPowerPlant, NuclearFuelTruck, GameDevStudio, AssemblyHouse, Nanogigafactory, PharmaceuticalsLab, MohoMine, SpaceLaunchSite])
                    this.city.unlock(getBuildingType(type));
                this.city.flags.add(CityFlags.UnlockedGameDev);
            }
        } else qol += 0.09;

        //Food satisfaction
        qol += this.city.resources.get(new FoodSatisfaction().type)!.amount * 0.13;

        return qol;
    }

    private calculateResidentialBlackoutPenalty(): number {
        let totalPowerNeeded = 0;
        let totalPowerReceived = 0;

        this.city.buildings.forEach(building => {
            if (building.isResidence && building.needsPower) {
                totalPowerNeeded += 1;
                totalPowerReceived += building.poweredTimeDuringLongTick;
            }
        });

        return totalPowerNeeded > 0 ? 1 - totalPowerReceived / totalPowerNeeded : 0;
    }
}