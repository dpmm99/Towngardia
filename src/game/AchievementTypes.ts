import { City } from "./City.js";
import { Player } from "./Player.js";
import { Achievement } from "./Achievement.js";
import { Building } from "./Building.js";
import * as ResourceTypes from "./ResourceTypes.js";
import { AIDiagnostics, AILogistics, ARShopping, AdvancedRobotics, AutonomousVehicles, BrainComputerInterface, CoalPowerScrubbers, DroneDelivery, FoodServiceRobots, GMCrops, GrapheneBatteries, Hydrolox, HydroponicGardens, NanomedicineResearch, PerovskiteSolarCells, RetainingSoil, RooftopSolar, SmartHomeSystems, ThermalRecovery, ThreeDPrinting, VRClassrooms, VacuumInsulatedWindows, VerticalFarming, WindTurbineLattice } from "./TechTypes.js";
import { Bar, Casino, College, ElementarySchool, Farm, FishFarm, GregsGrogBarr, MuseumOfFutureArts, Portal, Ranch, TreeFarm, VerticalFarm, getBuildingType } from "./BuildingTypes.js";
import { EffectType } from "./GridType.js";
import { LONG_TICKS_PER_DAY } from "./FundamentalConstants.js";
import { GREENHOUSE_GASES_MIN_POPULATION } from "./GameplayConstants.js";
import { CityFlags } from "./CityFlags.js";

const AchievementTypes =
{
    CarbonNation: new Achievement("carbonnation", "Carbon Nation", `Hear the hippies' concerns fizzle out. Maintain net-zero carbon emissions for a week in a city with at least ${GREENHOUSE_GASES_MIN_POPULATION} population.`, (me: Achievement, player: Player, city: City): number => {
        if (!city.flags.has(CityFlags.GreenhouseGasesMatter)) return 0;
        if (city.getCityAverageGreenhouseGases() > 0) {
            me.dataPoints = (me.dataPoints || []).filter(dp =>
                typeof dp === 'object' && dp.cityId !== city.id);
            return 0;
        }

        if (!me.dataPoints || !me.dataPoints.length) me.dataPoints = [city.lastShortTick];

        // Convert legacy format--dataPoints used to be an array of numbers; it's an array of objects with cityId and startTime now.
        if (me.dataPoints.length && typeof me.dataPoints[0] === 'number') {
            me.dataPoints = [{ cityId: city.id, startTime: me.dataPoints[0] }];
        }

        const cityData = me.dataPoints.find(dp => dp.cityId === city.id);
        if (!cityData) {
            me.dataPoints.push({ cityId: city.id, startTime: city.lastShortTick });
            return 0;
        }
        return (city.lastShortTick - cityData.startTime) / 604800000;
    }),
    CrimeIsOutlawed: new Achievement("crimeisoutlawed", "Crime is Outlawed", "Keep all types of crime at minimal levels for a week in a city with at least 1000 population.", (me: Achievement, player: Player, city: City): number => {
        if (city.resources.get("population")!.amount < 1000) return 0;
        for (let x = 0; x < city.width; x++) for (let y = 0; y < city.height; y++) {
            if (city.grid[y][x]?.owned && (city.getNetOrganizedCrime(x, y) > 0.05 || city.getNetPettyCrime(x, y) > 0.05)) { //Making it a bit easier: crime doesn't affect blockers and empty tiles.
                me.dataPoints = (me.dataPoints || []).filter(dp =>
                    typeof dp === 'object' && dp.cityId !== city.id);
                return 0;
            }
        }

        if (!me.dataPoints || !me.dataPoints.length) me.dataPoints = [city.lastShortTick];

        // Convert legacy format--same deal as CarbonNation.
        if (me.dataPoints.length && typeof me.dataPoints[0] === 'number') {
            me.dataPoints = [{ cityId: city.id, startTime: me.dataPoints[0] }];
        }

        const cityData = me.dataPoints.find(dp => dp.cityId === city.id);
        if (!cityData) {
            me.dataPoints.push({ cityId: city.id, startTime: city.lastShortTick });
            return 0;
        }
        return (city.lastShortTick - cityData.startTime) / 604800000;
    }),
    FarmVile: new Achievement("farmvile", "Farm Vile", "Have very high particulate pollution affecting a Farm, Fish Farm, Ranch, Tree Farm, or Vertical Farm.", (me: Achievement, player: Player, city: City): number => {
        const farms = city.buildings.filter(p => p instanceof Farm || p instanceof FishFarm || p instanceof Ranch || p instanceof TreeFarm || p instanceof VerticalFarm);
        if (!farms.length) return 0;

        const worstPolluted = Math.max(...farms.map(p => p.getHighestEffect(city, EffectType.ParticulatePollution))); //Deliberately chose to ignore the particulatePollutionMultiplier factor here.
        return worstPolluted / 0.7; //0.7 is considered very high in this case.
    }),
    FusionHa: new Achievement("fusionha", "Fuuusion...Ha!", "Obliterate 300 stars in Starbox on Hard.", (me: Achievement, player: Player, city: City): number => {
        return (me.dataPoints?.[0] || 0) / 300; //Set directly in Starbox just so I don't need another city-level variable to temporarily store it for the split second it takes to call checkAndAwardAchievement.
    }),
    NoAdultLeftADolt: new Achievement("noadultleftadolt", "No Adult Left A Dolt", "Have colleges covering all residences in a city with at least 1000 population", (me: Achievement, player: Player, city: City): number => {
        if (city.resources.get("population")!.amount < 1000) return 0;
        const residences = city.buildings.filter(p => p.isResidence && p.roadConnected);
        if (!residences.length) return 0;
        const collegeType = getBuildingType(College);
        const touched = residences.filter(p => p.isAffectedBy(city, collegeType)).length;
        return touched / residences.length;
    }),
    NoiseEnthusiast: new Achievement("noiseenthusiast", "Noise Enthusiast", "Have a single residence affected by 5 noisy buildings (not counting roads).", (me: Achievement, player: Player, city: City): number => {
        const residences = city.buildings.filter(p => p.isResidence && p.roadConnected);
        if (!residences.length) return 0;
        let max = 0;
        for (const residence of residences) {
            let current = 0;
            for (const effect of residence.getAllEffects(city)) if (effect.type === EffectType.Noise && !effect.building?.isRoad) current++;
            max = Math.max(max, current);
            if (max >= 5) break;
        }
        return max / 5;
    }),
    OopsAllParks: new Achievement("oopsallparks", "Oops, All Parks!", "Completely fill a 5x5 area with parks", (me: Achievement, player: Player, city: City): number => { //would optimally only be checked when adding a building
        //Logic is in City instead because of the need (for optimality) to pass in a Building when one is placed. Could be moved, could be refactored.
        return 1;
    }),
    PartyThroughBlackout: new Achievement("partythroughblackout", "Party Through the Blackout", "Keep at least 5 entertainment venues powered while at least 10 homes are experiencing a blackout.", (me: Achievement, player: Player, city: City): number => {
        const homes = city.buildings.filter(p => p.isResidence && p.roadConnected && p.powerConnected && !p.powered).length;
        if (homes === 0) return 0;
        const entertainment = city.buildings.filter(p => p.isEntertainment && p.roadConnected && p.powerConnected && p.powered).length;
        return Math.min(1, homes / 10) * 0.667 + 0.334 * Math.min(1, entertainment / 5);
    }),
    PlainsAndAstralPlanes: new Achievement("plainsandastralplanes", "Plains and Astral Planes", "An end-goal for your first city. A large, well-educated population is bound to make incredible discoveries, especially with a Museum of Future Arts at hand. Unlock regions and realms by building a Portal in your city. Requires a population of 30,000 and four Colleges.", (me: Achievement, player: Player, city: City): number => {
        const populationPart = Math.min(1, city.resources.get("population")!.amount / 30000);
        const collegePart = Math.min(4, city.presentBuildingCount.get(getBuildingType(College)) ?? 0);
        const museumPart = Math.min(1, city.presentBuildingCount.get(getBuildingType(MuseumOfFutureArts)) ?? 0);
        const portalPart = city.presentBuildingCount.get(getBuildingType(Portal)) ? Math.min(1, city.buildings.find(p => p.type === getBuildingType(Portal))?.lastEfficiency ?? 0) : 0;
        return (populationPart * 4 + collegePart + museumPart + portalPart) / 10;
    }),
    ResourceTycoon: new Achievement("resourcetycoon", "Resource Tycoon", "Collect and sell 30 types of resource in a single day.", (me: Achievement, player: Player, city: City): number => {
        if (!me.dataPoints) me.dataPoints = [];

        // Convert legacy format--used to be an array of numbers; it's now an array of objects that each have cityId plus the same kind of number array as before.
        if (me.dataPoints.length && !me.dataPoints[0].cityId) {
            const oldData = [...me.dataPoints];
            me.dataPoints = [{
                cityId: city.id,
                data: oldData
            }];
        }

        // Ensure there's a slot for this city in dataPoints.
        let cityData = me.dataPoints.find(dp => dp.cityId === city.id);
        if (!cityData) {
            cityData = { cityId: city.id, data: [] };
            me.dataPoints.push(cityData);
        }

        //Note: resourceEvents reset every TICK. I need an entire DAY worth. So I have to store the two lists of resource types in dataPoints and delimit them into sections.
        if (cityData.data.length > LONG_TICKS_PER_DAY) cityData.data.shift();

        const producedTypes = new Set(city.resourceEvents.filter(p => p.event === "produce" && p.amount > 0).map(p => p.type));
        const soldTypes = new Set(city.resourceEvents.filter(p => p.event === "sell" && p.amount > 0).map(p => p.type));
        cityData.data.push([[...producedTypes], [...soldTypes]]);
        const allProducedTypes = new Set(cityData.data.flatMap((p: any) => p[0]));
        const allSoldTypes = new Set(cityData.data.flatMap((p: any) => p[1]));

        return Math.min(1, (allProducedTypes.size + allSoldTypes.size) / 60);
    }),
    SelfSufficiencity: new Achievement("selfsufficiencity", "Self-Sufficiencity", "Maintain a budget surplus, all services at maximum budget allocation, and no water, power, or fuel purchases for a week in a city with at least 1000 population. (Fuel includes coal, oil, uranium, and tritium.)", (me: Achievement, player: Player, city: City): number => {
        if (city.resources.get("population")!.amount < 1000) return 0;
        if (city.flunds.consumptionRate > city.flunds.productionRate //Balanced budget check. Doesn't count whatever they sell off between ticks, but it's not too important, and it's probably better that way because constructing shouldn't count as the budget being imbalanced.
            || Object.values(city.budget.serviceAllocations).some(p => p < 1) //All budget allocations at max
            || city.lastImportedPowerCost > 0 //No power imported
            || city.lastImportedWaterCost > 0
        ) {
            me.dataPoints = (me.dataPoints || []).filter(dp =>
                typeof dp === 'object' && dp.cityId !== city.id);
            return 0;
        }

        //Check for fuel purchases
        const fuelTypes = new Set([ResourceTypes.Coal, ResourceTypes.Oil, ResourceTypes.Uranium, ResourceTypes.Tritium].map(p => (new p()).type));
        if (city.resourceEvents.find(p => fuelTypes.has(p.type) && p.event === "buy")) {
            me.dataPoints = (me.dataPoints || []).filter(dp =>
                typeof dp === 'object' && dp.cityId !== city.id);
            return 0;
        }

        if (!me.dataPoints || !me.dataPoints.length) me.dataPoints = [city.lastShortTick];
        // Convert legacy format
        if (me.dataPoints.length && typeof me.dataPoints[0] === 'number') {
            me.dataPoints = [{ cityId: city.id, startTime: me.dataPoints[0] }];
        }

        const cityData = me.dataPoints.find(dp => dp.cityId === city.id);
        if (!cityData) {
            me.dataPoints.push({ cityId: city.id, startTime: city.lastShortTick });
            return 0;
        }
        return (city.lastShortTick - cityData.startTime) / 604800000;
    }),
    TrafficChaosTheory: new Achievement("trafficchaostheory", "Traffic Chaos Theory", "Completely fill a 3x3 area with roads.", (me: Achievement, player: Player, city: City): number => {
        let best = 0;
        for (let x = 0; x < city.width - 2; x++) for (let y = 0; y < city.height - 2; y++) {
            if (city.grid[y][x]?.isRoad) {
                let current = 0;
                for (let nx = x; nx < x + 3; nx++) for (let ny = y; ny < y + 3; ny++) {
                    if (city.grid[ny][nx]?.isRoad && city.grid[ny][nx]!.roadConnected) current++;
                }
                best = Math.max(best, current);
                if (best >= 9) break;
            }
        }
        return best / 9;
    }),
    UrbanPlannerExtraordinaire: new Achievement("urbanplannerextraordinaire", "Urban Planner Extraordinaire", "This whole urban design thing ain't so hard! Have at least three elementary schools that neighbor a bar or casino", (me: Achievement, player: Player, city: City): number => {
        const schools = city.buildings.filter(p => p instanceof ElementarySchool);
        if (schools.length < 3) return 0;
        let count = 0;
        for (const school of schools) {
            const neighbors = [...city.getBuildingsInArea(school.x, school.y, school.width, school.height, 2, 2, true, true)]; //Allow them to be 1 tile away--I'm counting it even if it's across a single road tile.
            if (neighbors.some(p => p instanceof Bar || p instanceof GregsGrogBarr || p instanceof Casino)) count++;
        }

        return count / 3;
    }),
    WattsUpDoc: new Achievement("wattsupdoc", "Watts Up, Doc", "Provide 10% more power than necessary in a city with at least 1000 population.", (me: Achievement, player: Player, city: City): number => {
        if (city.resources.get("population")!.amount < 1000) return 0;
        const power = city.resources.get("power")!;
        const excessPower = power.productionRate - power.consumptionRate;
        if (excessPower <= 0 || power.consumptionRate === 0) return 0;
        return 10 * excessPower / power.consumptionRate;
    }),
    Xenocide: new Achievement("xenocide", "Xenocide", "Without any mistakes, clear every tile in Monobrynth on Hard after finding scanner goggles and revealing that one of the tiles has an alien but no rewards. You know you don't HAVE to do that, right...?", (me: Achievement, player: Player, city: City): number => {
        return 1; //Only checked directly in Monobrynth, so nothing to do here.
    }),
};

const TitleTypes = {
    AsbestosIntentions: new Achievement("asbestosintentions", "Asbestos Intentions", "Where there's smoke, there's mayor! Repair 100 damaged buildings.", (me: Achievement, player: Player, city: City): number => {
        //Only checked when a building is repaired.
        if (!me.dataPoints) me.dataPoints = [0];
        me.dataPoints[0]++;
        return me.dataPoints[0] / 100;
    }, "reduced fire hazard for all buildings"),
    Carnivorism: new Achievement("carnivorism", "Carnivorism", "It's hard to tell whether you like it or hate it when your stockpile is enormous... Have a sum of 1000 units of red meat, fish, poultry, and/or lab-grown meat in stock at one time.", (me: Achievement, player: Player, city: City): number => {
        return (
            (city.resources.get(new ResourceTypes.RedMeat().type)?.amount ?? 0) +
            (city.resources.get(new ResourceTypes.Fish().type)?.amount ?? 0) +
            (city.resources.get(new ResourceTypes.Poultry().type)?.amount ?? 0) +
            (city.resources.get(new ResourceTypes.LabGrownMeat().type)?.amount ?? 0)
        ) / 1000;
    }, "efficiency bonus for ranches, fish farms, and carnicultivators"),
    CityOfInnovators: new Achievement("cityofinnovators", "City of Innovators", "The think tank is truckin'! Complete two research options within 24 hours of each other.", (me: Achievement, player: Player, city: City): number => {
        //Only runs when the player completes a research item.
        city.techManager.lastResearchCompletionDates.push(new Date()); //Note: Could store on the achievement itself. I just stuck with it after I added it to TechManager.
        if (city.techManager.lastResearchCompletionDates.length < 2) return 0;
        while (city.techManager.lastResearchCompletionDates.length > 2) city.techManager.lastResearchCompletionDates.shift();
        return (city.techManager.lastResearchCompletionDates[1].getTime() - city.techManager.lastResearchCompletionDates[0].getTime()) <= 86400000 ? 1 : 0;
    }, "research point generation rate bonus"),
    CulinaryCapital: new Achievement("culinarycapital", "Culinary Capital", "It's quite a feat to pass that street without stopping to eat. Have 6 restaurants that each share a wall with one of the others.", (me: Achievement, player: Player, city: City): number => {
        const desiredCount = 6;
        const isRestaurant = (p: Building): boolean => p.isRestaurant;
        //loop through each restaurant and do a DFS on them.
        const buildings = city.buildings.filter(isRestaurant);
        let bestSet = 0;
        const pastVisitedBuildings = new Set<Building>();
        while (buildings.length) {
            const building = buildings.pop()!;
            if (pastVisitedBuildings.has(building)) continue;

            const visitedTiles = new Set<number>();
            city.dfs(isRestaurant, building.x, building.y, visitedTiles);

            const visitedBuildings = city.visitedSetToBuildings(visitedTiles);
            if (visitedBuildings.size >= desiredCount) return 1;
            bestSet = Math.max(bestSet, visitedBuildings.size);
            //Remove from the 'buildings' list to save a lot of time in the loop
            
            visitedBuildings.forEach(pastVisitedBuildings.add, pastVisitedBuildings);
        }

        const progress = bestSet / desiredCount;
        if (progress >= 1) { //Achieved! Adjust the buildings directly.
            for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => p.isRestaurant)) {
                const tourism = building.outputResources.find(p => p.type === new ResourceTypes.Tourists().type);
                if (tourism) tourism.capacity *= 1.1;
            }
        }
        return progress;
    }, "efficiency and tourism bonus for restaurants"),
    Pioneergreen: new Achievement("pioneergreen", "Pioneergreen", "Boldly go where no tree-hugger has gone before. Research two eco-friendly technologies before reaching 1000 population.", (me: Achievement, player: Player, city: City): number => {
        //Only checked upon researching an eco-friendly tech, so it doesn't need to *check* the techs. Also remember the condition is only checked if !me.attained.
        if (city.peakPopulation < 1000) {
            //Apply effects to techs
            city.techManager.techs.get(new VacuumInsulatedWindows().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new RooftopSolar().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new SmartHomeSystems().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new CoalPowerScrubbers().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new PerovskiteSolarCells().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new WindTurbineLattice().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new ThreeDPrinting().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new HydroponicGardens().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new GMCrops().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new RetainingSoil().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new GrapheneBatteries().id)!.adoptionGrowth *= 1.2;

            return 1;
        }
        return 0;
    }, "increases the rate at which most eco-friendly technologies are adopted."),
    SmartCityShowcase: new Achievement("smartcityshowcase", "Smart City Showcase", "The fridge is calling to say it's empty again... Research Smart Home Systems, Advanced Robotics, VR Classrooms, and AR Shopping, then boost tourism via a minigame.", (me: Achievement, player: Player, city: City): number => {
        const count = [
            city.techManager.techs.get(new SmartHomeSystems().id)?.researched,
            city.techManager.techs.get(new AdvancedRobotics().id)?.researched,
            city.techManager.techs.get(new VRClassrooms().id)?.researched,
            city.techManager.techs.get(new ARShopping().id)?.researched,
        ].filter(p => p).length;
        const progress = count === 4 ? 1 : count / 5; //Out of 5 because the minigame is the last step. But if all are researched, then the minigame must've been played, so count of 4 results in returning 1.
        if (progress >= 1) {
            city.techManager.techs.get(new AIDiagnostics().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new AILogistics().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new ARShopping().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new AdvancedRobotics().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new AutonomousVehicles().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new BrainComputerInterface().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new DroneDelivery().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new FoodServiceRobots().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new GrapheneBatteries().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new NanomedicineResearch().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new SmartHomeSystems().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new VRClassrooms().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new ThermalRecovery().id)!.adoptionGrowth *= 1.2;
            city.techManager.techs.get(new Hydrolox().id)!.adoptionGrowth *= 1.2;
        }
        return progress;
    }, "increases adoption rate of high-tech upgrades"),
    TheGreatFilter: new Achievement("thegreatfilter", "The Great Filter", "No, I'm not talking about the Fermi Paradox explanation of the same name. Well, I mean, I could be. It IS pretty dumb of the species to live in an area of extreme volcanic activity like this. But anyway... Attain this by building enough Carbon Capture Plants to reduce accumulated greenhouse gases to zero.", (me: Achievement, player: Player, city: City): number => {
        //Progress only starts displaying once you get under 0.2 accumulated greenhouse gases.
        return city.regionID === "volcanic" && city.flags.has(CityFlags.GreenhouseGasesMatter) ? Math.max(0, 1 - 5 * Math.min(0.2, city.resources.get(ResourceTypes.getResourceType(ResourceTypes.GreenhouseGases))!.amount)) : 0;
    }, "efficiency bonus for Carbon Capture Plants"),
    VeganRetreat: new Achievement("veganretreat", "Vegan Retreat", "The citizens are furiously debating whether honey and yeast are vegan. Within 7 days, collect at least 250 food and avoid producing any animal products.", (me: Achievement, player: Player, city: City): number => {
        //Is only checked once per long tick.
        if (city.resourceEvents.some(p => ResourceTypes.ANIMAL_PRODUCTS.has(p.type) && p.event === "produce")) {
            me.dataPoints = [];
            return 0;
        }
        const foodsCollected = city.resourceEvents.filter(p => ResourceTypes.FOOD_TYPES.has(p.type) && p.event === "produce").reduce((acc, cur) => acc + cur.amount, 0);
        if (!me.dataPoints) me.dataPoints = [];
        me.dataPoints.push({ time: city.lastLongTick, amount: foodsCollected });
        me.dataPoints = me.dataPoints.filter(p => p.time > city.lastLongTick - 604800000); //Remove any data points older than a week.

        return me.dataPoints.reduce((acc, cur) => acc + cur.amount, 0) / 250;
    }, "efficiency bonus for farms, vertical farms, and plant milk plants"),
};

export { AchievementTypes, TitleTypes };