import { LONG_TICKS_PER_DAY } from "./FundamentalConstants.js";
import { Resource } from "./Resource.js";
const CAPACITY_MULTIPLIER = 5 * LONG_TICKS_PER_DAY; //Capacity is 5 days' worth
export { CAPACITY_MULTIPLIER };

//Special resources
export class Population extends Resource {
    constructor(initialCount: number = 0, capacity: number = Number.MAX_SAFE_INTEGER) {
        super(
            "population", "Population",
            initialCount, 0, capacity, 0,
            true
        );
    }
}

export class Tourists extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "tourists", "Tourists",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class UntappedPatronage extends Resource {
    constructor(initialCount: number = 0) {
        super(
            "untappedpatronage", "Untapped Patronage",
            initialCount, 0, Number.MAX_SAFE_INTEGER, 0,
            true
        );
    }
}

//Multiplicative bonus or penalty applied to factory production rates; only affected by a reward event currently
export class ProductionEfficiency extends Resource {
    constructor(initialCount: number = 1) {
        super(
            "prodeff", "Production Efficiency",
            initialCount, 0, Number.MAX_SAFE_INTEGER, 0,
            true
        );
    }
}

export class PowerCosts extends Resource {
    constructor(initialCount: number = 1) {
        super(
            "powercosts", "Power Costs",
            initialCount, 0, Number.MAX_SAFE_INTEGER, 0,
            true
        );
    }
}

export class DeptOfEnergyBonus extends Resource {
    constructor(initialCount: number = 0) {
        super(
            "doebonus", "Dept of Energy Bonus",
            initialCount, 0, Number.MAX_SAFE_INTEGER, 0,
            true
        );
    }
}

export class EnvironmentalLabBonus extends Resource {
    constructor(initialCount: number = 0) {
        super(
            "elbonus", "Environmental Lab Bonus",
            initialCount, 0, Number.MAX_SAFE_INTEGER, 0,
            true
        );
    }
}

export class Flunds extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "flunds", "Flunds",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class Water extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 0) {
        super(
            "water", "Water",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class Power extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 0) {
        super(
            "power", "Power",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class BarPlays extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER * 2) {
        super(
            "barplays", "Memory Mixology Plays",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class SlotsPlays extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER * 2) {
        super(
            "slotsplays", "Slots Plays",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class StarboxPlays extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER * 2) {
        super(
            "starboxplays", "Starbox Plays",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class MonobrynthPlays extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER * 2) {
        super(
            "monobrynthplays", "Monobrynth Plays",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class NepotismNetworkingPlays extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER * 2) {
        super(
            "neponetplays", "Nepotism Networking Plays",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class PracticeRuns extends Resource {
    constructor(initialCount: number = 3) {
        super(
            "practiceruns", "Practice Runs",
            initialCount, 0, 3, 0,
            true
        );
    }
}

export class MinigameOptionResearch extends Resource {
    constructor(initialCount: number = 0) {
        super(
            "miniresearch", "Minigame Option Research",
            initialCount, 0, 1, 0,
            true
        );
    }
}

export class Timeslips extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 4) {
        super(
            "timeslips", "Timeslips",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class GreenhouseGases extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "greenhousegases", "Greenhouse Gases",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class Happiness extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 1) {
        super(
            "happiness", "Happiness",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class Health extends Resource { //TODO: Can be used for a city-wide base amount, just more efficient than adding an effect to every tile
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "health", "Health",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class Education extends Resource { //TODO: Can be used for a city-wide base amount, just more efficient than adding an effect to every tile
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "education", "Education",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}
//TODO: Do similar for fire hazard so each type of trash-disposal mechanism can reduce it globally by a smidge.

export class Crime extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "crime", "Crime",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

export class FoodHealth extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 1) {
        super(
            "foodhealth", "Food Health",
            initialCount, productionRate, capacity, consumptionRate,
            true
        )
    }
}

export class FoodSufficiency extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 1) {
        super(
            "foodsufficiency", "Food Sufficiency",
            initialCount, productionRate, capacity, consumptionRate,
            true
        )
    }
}

export class FoodSatisfaction extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = 1) {
        super(
            "foodsatisfaction", "Food Satisfaction",
            initialCount, productionRate, capacity, consumptionRate,
            true
        )
    }
}

export class Research extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 1, consumptionRate: number = 0, capacity: number = 9999) {
        super(
            "research", "Research Points",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
        this.autoCollect = true;
    }
}

export class FriendResearchVisits extends Resource {
    constructor(initialCount: number = 1, productionRate: number = 0.25, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "friendresearch", "Friend Research Visit Allowance",
            initialCount, productionRate, capacity, consumptionRate,
            true
        );
    }
}

/*Food types are: Grain, RootVegetables, Apples, Berries, LeafyGreens, Legumes, RedMeat, Poultry, Fish, Dairy, PlantBasedDairy, LabGrownMeat.*/
export class Grain extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "grain", "Grain",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class RootVegetables extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "rootvegetables", "Root Vegetables",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class Apples extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "apples", "Tree Fruits",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class Berries extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "berries", "Berries",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class LeafyGreens extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "leafygreens", "Leafy Greens",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class Legumes extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "legumes", "Legumes",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

export class RedMeat extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "redmeat", "Red Meat",
            initialCount, productionRate, capacity, consumptionRate,
            false, 2, 2
        );
    }
}

export class Poultry extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "poultry", "Poultry",
            initialCount, productionRate, capacity, consumptionRate,
            false, 2, 2
        );
    }
}

export class Fish extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "fish", "Fish",
            initialCount, productionRate, capacity, consumptionRate,
            false, 2, 2
        );
    }
}

export class Dairy extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "dairy", "Dairy",
            initialCount, productionRate, capacity, consumptionRate,
            false, 2, 2
        );
    }
}

export class PlantBasedDairy extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "plantbaseddairy", "Plant-Based Dairy",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class LabGrownMeat extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "labgrownmeat", "Lab-Grown Meat",
            initialCount, productionRate, capacity, consumptionRate,
            false, 4, 3
        );
    }
}

export class VitaminB12 extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "vitaminb12", "Vitamin B12",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1, 1
        );
    }
}

//Non-food, not-special, raw resources
export class Stone extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "stone", "Stone",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5, 3
        );
    }
}

export class Iron extends Resource { //Could need refined
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "iron", "Iron",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Copper extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "copper", "Copper",
            initialCount, productionRate, capacity, consumptionRate,
            false, 4, 3
        );
    }
}

export class Lithium extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "lithium", "Lithium",
            initialCount, productionRate, capacity, consumptionRate,
            false, 8, 5
        );
    }
}

export class Clay extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "clay", "Clay",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Sand extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "sand", "Sand",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Wood extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "wood", "Wood",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1.5, 1
        );
    }
}

export class Coal extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "coal", "Coal",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5, 4
        );
    }
}

export class Oil extends Resource { //Could need refined
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "oil", "Oil",
            initialCount, productionRate, capacity, consumptionRate,
            false, 8, 5
        );
    }
}

export class Gemstones extends Resource { //Could need refined
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "gemstones", "Gemstones",
            initialCount, productionRate, capacity, consumptionRate,
            false, 11, 9.5
        );
    }
}

export class Uranium extends Resource { //Could need refined
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "uranium", "Uranium",
            initialCount, productionRate, capacity, consumptionRate,
            false, 11, 9
        );
    }
}

export class Tritium extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "tritium", "Tritium",
            initialCount, productionRate, capacity, consumptionRate,
            false, 15, 12
        );
    }
}

//Refined resources
export class Silicon extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "silicon", "Silicon",
            initialCount, productionRate, capacity, consumptionRate,
            false, 8.5, 7
        );
    }
}

export class Batteries extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "batteries", "Batteries",
            initialCount, productionRate, capacity, consumptionRate,
            false, 15, 12
        );
    }
}

export class Bricks extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "bricks", "Bricks",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Glass extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "glass", "Glass",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5.5, 4.5
        );
    }
}

export class Concrete extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "concrete", "Concrete",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Steel extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "steel", "Steel",
            initialCount, productionRate, capacity, consumptionRate,
            false, 6, 5
        );
    }
}

export class Plastics extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "plastics", "Plastics",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5, 4
        );
    }
}

export class Lumber extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "lumber", "Lumber",
            initialCount, productionRate, capacity, consumptionRate,
            false, 4, 3
        );
    }
}

export class Paper extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "paper", "Paper",
            initialCount, productionRate, capacity, consumptionRate,
            false, 1.5, 1
        );
    }
}

export class Rubber extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "rubber", "Rubber",
            initialCount, productionRate, capacity, consumptionRate,
            false, 3, 2
        );
    }
}

export class Textiles extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "textiles", "Textiles",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5, 4
        );
    }
}

//Manufactured goods
export class Electronics extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "electronics", "Electronics",
            initialCount, productionRate, capacity, consumptionRate,
            false, 10, 8.5
        );
    }
}

export class Furniture extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "furniture", "Furniture",
            initialCount, productionRate, capacity, consumptionRate,
            false, 13, 10
        );
    }
}

export class Clothing extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "clothing", "Clothing",
            initialCount, productionRate, capacity, consumptionRate,
            false, 14, 11
        );
    }
}

export class Pharmaceuticals extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "pharmaceuticals", "Pharmaceuticals",
            initialCount, productionRate, capacity, consumptionRate,
            false, 7, 5
        );
    }
}

export class Toys extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "toys", "Toys",
            initialCount, productionRate, capacity, consumptionRate,
            false, 5.5, 5
        );
    }
}

export class Apps extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "apps", "Apps",
            initialCount, productionRate, capacity, consumptionRate,
            false, 14, 11
        );
    }
}

//Event-limited
export class BrainBrews extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "brainbrews", "Brain Brews",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 3
        );
    }
}

export class GleeGrenades extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "gleegrenades", "Glee Grenades",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 3
        );
    }
}

export class TurboTonics extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "turbotonics", "Turbo Tonics",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 3
        );
    }
}

export class Chocolate extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "chocolate", "Chocolate",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 5
        );
    }
}

//Region-limited. Volcanic region:
export class Obsidian extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "obsidian", "Obsidian",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 2
        );
    }
}

export class GreenObsidian extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "greenobsidian", "Green Obsidian",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 5
        );
    }
}

export class FireObsidian extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "fireobsidian", "Fire Obsidian",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 7
        );
    }
}

export class Sulfur extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "sulfur", "Sulfur",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 2
        );
    }
}

export class Dynamite extends Resource {
    constructor(initialCount: number = 0, productionRate: number = 0, consumptionRate: number = 0, capacity: number = (productionRate + consumptionRate) * CAPACITY_MULTIPLIER) {
        super(
            "dynamite", "Dynamite",
            initialCount, productionRate, capacity, consumptionRate,
            false, 0, 5
        );
    }
}

//More special resources: cars, self-driving cars, bicycles, buses, drones, snowplows? (or it's just a building's radius effect)

export const RESOURCE_TYPES = <Resource[]>([
    /*Food*/ Apples, Berries, Dairy, Fish, Grain, LabGrownMeat, LeafyGreens, Legumes, PlantBasedDairy, Poultry, RedMeat, RootVegetables, VitaminB12,
    /*Building materials*/ Concrete, Glass, Iron, Bricks, Clay, Lumber, Steel, Stone, Wood,
    /*Fuel and ingredients*/ Coal, Copper, Gemstones, Lithium, Oil, Plastics, Rubber, Sand, Silicon, Textiles, Tritium, Uranium,
    /*Manufactured goods*/ Apps, Batteries, Clothing, Electronics, Furniture, Paper, Pharmaceuticals, Toys,
    /*Minigames*/ BarPlays, SlotsPlays, StarboxPlays, MonobrynthPlays, NepotismNetworkingPlays, PracticeRuns, MinigameOptionResearch,
    /*Mainly math*/ FriendResearchVisits, Crime, Education, FoodHealth, FoodSufficiency, FoodSatisfaction, Happiness, Health, GreenhouseGases, ProductionEfficiency, PowerCosts, DeptOfEnergyBonus, EnvironmentalLabBonus,
    /*Citywide needs*/ Flunds, Research, Population, Tourists, UntappedPatronage, Power, Timeslips, Water,
    /*Event-limited*/ BrainBrews, GleeGrenades, TurboTonics, Chocolate,
    /*Region-limited*/ Obsidian, GreenObsidian, FireObsidian, Sulfur, Dynamite,
].map(p => new p()));

//For easy checking if something is a food.
export const FOOD_TYPES = new Set([Apples, Berries, Dairy, Fish, Grain, LabGrownMeat, LeafyGreens, Legumes, PlantBasedDairy, Poultry, RedMeat, RootVegetables, VitaminB12].map(p => new p().type));
export const ANIMAL_PRODUCTS = new Set([Dairy, Fish, Poultry, RedMeat].map(p => new p().type)); //No, I'm not counting oil... or people... :) or lab-grown meat because it doesn't require sustained animal farming. Pharmaceuticals are questionable.
export const GIFT_TYPES = new Set([BrainBrews, GleeGrenades, TurboTonics, Chocolate].map(p => new p().type));

//This is a cache for the type string of a class. It's used to avoid creating an instance of a class just to get its type. //TODO: Use this everywhere I've used the resource type ID string. Make a wrapper in City to get the city's Resource instance, too, if needed. The point is being able to see where all specific resources are used via CodeLens.
const resourceTypeCache = new Map<Function, string>(RESOURCE_TYPES.map(p => [p.constructor, p.type]));
export function getResourceType<T extends { new(...args: any[]): {} }>(cls: T): string {
    if (!resourceTypeCache.has(cls)) {
        const instance = new cls();
        resourceTypeCache.set(cls, (instance as any).type);
    }
    return resourceTypeCache.get(cls)!;
}
