import { City } from './City.js';
import { CityFlags } from './CityFlags.js';
import { DietReward } from './EventTypes.js';
import { LONG_TICKS_PER_DAY } from './FundamentalConstants.js';
import { Apples, Berries, Dairy, Fish, FoodHealth, FoodSatisfaction, FoodSufficiency, Grain, Health, LabGrownMeat, LeafyGreens, Legumes, PlantBasedDairy, Poultry, RedMeat, RootVegetables, VitaminB12 } from './ResourceTypes.js';
import { HydroponicGardens } from './TechTypes.js';

export class CitizenDietSystem {
    private city: City;
    private foodTypes: string[];
    private foodEffects: Map<string, { happiness: number, health: number }>;
    private readonly perfectHealth: number;
    private readonly perfectHappiness: number;
    public lastDietComposition: { type: string, ratio: number, effectiveness: number }[] = [];

    constructor(city: City) {
        this.city = city;
        this.foodTypes = [
            Grain, RootVegetables, Apples, Berries, LeafyGreens, Legumes,
            RedMeat, Poultry, Fish, Dairy, PlantBasedDairy, LabGrownMeat,
            VitaminB12
        ].map(p => new p().type);
        this.foodEffects = new Map([
            ["grain", { happiness: 1, health: 1 }],
            ["rootvegetables", { happiness: 1, health: 2 }],
            ["apples", { happiness: 2, health: 1 }],
            ["berries", { happiness: 2, health: 2 }],
            ["leafygreens", { happiness: 0, health: 3 }],
            ["legumes", { happiness: 1, health: 2 }],
            ["redmeat", { happiness: 3, health: -2 }],
            ["poultry", { happiness: 2, health: 1 }],
            ["fish", { happiness: 2, health: 2 }],
            ["dairy", { happiness: 2, health: -1 }],
            ["plantbaseddairy", { happiness: 1, health: 2 }],
            ["labgrownmeat", { happiness: 2, health: 0 }],
            ["vitaminb12", { happiness: 0, health: 1 }]
        ]);
        //Not counting every last food in the optimum diet, not penalizing the player so much for ditching red meat and dairy.
        const optimumDiet = [...this.foodEffects.entries()].filter(p => p[0] !== 'labgrownmeat' && p[0] !== 'vitaminb12' && p[0] !== 'plantbaseddairy' && p[0] !== 'redmeat').map(p => p[1]);
        this.perfectHealth = optimumDiet.reduce((sum, effect) => sum + Math.max(0, effect.health), 0);
        this.perfectHappiness = optimumDiet.reduce((sum, effect) => sum + Math.max(0, effect.happiness), 0);
    }

    public getFoodNeeded(ignoreBonus: boolean): number {
        const population = this.city.resources.get("population")!.amount;
        const eventFoodNeedsReductionFactor = ignoreBonus ? 1 : this.city.events.filter(p => p instanceof DietReward).reduce((a, e) => a * (1 - e.getBonus()), 1); //Reduces food needs multiplicatively
        return population / 100 / LONG_TICKS_PER_DAY * eventFoodNeedsReductionFactor; // 1 unit feeds 100 people for a day
    }

    onLongTick(): void {
        const peakPopulation = this.city.peakPopulation;
        const foodNeeded = this.getFoodNeeded(false);

        // Calculate available food
        const availableFood = this.foodTypes.map(type => ({
            type,
            amount: Math.min(this.city.resources.get(type)!.amount, foodNeeded)
        }));

        //With Hydroponic Gardens researched, citizens grow some vegetables for themselves--2% each of roots, berries, leafy greens, and legumes.
        if (this.city.techManager.techs.get(new HydroponicGardens().id)!.researched) {
            const fraction = this.city.techManager.getAdoption(new HydroponicGardens().id) * 0.02;
            for (const foodType of [RootVegetables, Berries, LeafyGreens, Legumes]) {
                availableFood.find(food => food.type === new foodType().type)!.amount += foodNeeded * fraction;
            }
        }

        // Cap Vitamin B12 at 4% of total food--because it's NOT food and won't fill them up. :)
        const vitaminB12 = availableFood.find(food => food.type === "vitaminB12");
        if (vitaminB12) {
            const totalOtherFood = availableFood.reduce((sum, food) =>
                food.type !== "vitaminB12" ? sum + food.amount : sum, 0);
            const maxB12 = totalOtherFood * 0.04 / 0.96;
            vitaminB12.amount = Math.min(vitaminB12.amount, maxB12);
        }

        const totalAvailableFood = availableFood.reduce((sum, food) => sum + food.amount, 0.00001);
        const foodRatio = Math.min(1, totalAvailableFood / foodNeeded);

        // Calculate diet composition
        const dietComposition = availableFood.map(food => ({
            type: food.type,
            ratio: food.amount / totalAvailableFood,
            effectiveness: Math.min(1, food.amount / foodNeeded / 0.04)
        }));

        // Calculate effects
        let happinessEffect = 0;
        let healthEffect = 0;
        dietComposition.forEach(food => {
            const effect = this.foodEffects.get(food.type)!;
            happinessEffect += effect.happiness * food.effectiveness;
            healthEffect += effect.health * food.effectiveness;
        });

        // Apply gradual activation based on peak population
        let systemActivation = 1;
        let perfectHappiness = this.perfectHappiness;
        let perfectHealth = this.perfectHealth;
        if (peakPopulation < 500) {
            systemActivation = 0.1; // 90% of the effect of a perfect diet is free
        } else if (peakPopulation < 1200) {
            systemActivation = 0.4;
            //Pick the top <=4 foods and base the "perfectHappiness" number on just those. (Note: this will ALWAYS end up with 4 entries, even if the player doesn't have 4 food types.)
            const best = dietComposition.sort((a, b) => b.ratio - a.ratio).slice(0, 4);
            perfectHappiness = best.reduce((sum, food) => sum + this.foodEffects.get(food.type)!.happiness, 0);
            perfectHealth = best.reduce((sum, food) => sum + this.foodEffects.get(food.type)!.health, 0);
        } else if (peakPopulation < 1800) {
            systemActivation = 0.7;
            const best = dietComposition.sort((a, b) => b.ratio - a.ratio).slice(0, 6);
            perfectHappiness = best.reduce((sum, food) => sum + this.foodEffects.get(food.type)!.happiness, 0);
            perfectHealth = best.reduce((sum, food) => sum + this.foodEffects.get(food.type)!.health, 0);
        }
        happinessEffect = systemActivation * happinessEffect + (1 - systemActivation) * perfectHappiness;
        healthEffect = systemActivation * healthEffect + (1 - systemActivation) * perfectHealth;

        // Apply B12 penalty, starting at 1200 population
        if (peakPopulation >= 1200) {
            const meatFishDairyRatio = dietComposition
                .filter(food => ["redmeat", "poultry", "fish", "dairy", "labgrownmeat"].includes(food.type))
                .reduce((sum, food) => sum + food.effectiveness, 0);
            const b12Effectiveness = dietComposition.find(food => food.type === "vitaminb12")?.effectiveness ?? 0;
            const b12Penalty = -5 * (1 - Math.min(1, (meatFishDairyRatio + b12Effectiveness * 2.5) / 2.5)); //Poppin' 4% worth of B12 pills (effectiveness=1) is equivalent to 10% of the diet being other sources
            healthEffect += b12Penalty * systemActivation;
        }

        // Apply effects
        if (this.city.flags.has(CityFlags.HealthcareMatters)) {
            this.city.resources.get(new FoodHealth().type)!.amount = healthEffect / perfectHealth; //Effect on health (effectiveness of hospitals and such)
        }

        const eventGratificationBonus = this.city.events.filter(p => p instanceof DietReward).reduce((a, e) => a + e.getBonus(), 1); //Just additive
        this.city.resources.get(new FoodSatisfaction().type)!.amount = happinessEffect / perfectHappiness * eventGratificationBonus; //Effect on happiness
        this.city.resources.get(new FoodSufficiency().type)!.amount = foodRatio; //Business value effect

        // Consume food (4x a day)
        const foodToConsume = dietComposition.map(food => ({
            type: food.type,
            amount: food.ratio * foodNeeded * foodRatio
        }));
        this.city.checkAndSpendResources(foodToConsume, true);

        // Store the diet composition for display
        this.lastDietComposition = dietComposition.slice().sort((a, b) => b.ratio - a.ratio);
    }
}