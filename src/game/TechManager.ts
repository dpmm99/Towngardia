import { TitleTypes } from "./AchievementTypes.js";
import { CartersCars, getBuildingType } from "./BuildingTypes.js";
import { City } from "./City.js";
import { inPlaceShuffle } from "./MiscFunctions.js";
import { Research, FriendResearchVisits } from "./ResourceTypes.js";
import { Tech } from "./Tech.js";
import { TECH_TYPES } from "./TechTypes.js";
import { Notification } from "./Notification.js";
import { FriendResearchVisitResult } from "./GrantFreePointsResult.js";
import { LONG_TICK_TIME } from "./FundamentalConstants.js";

export class TechManager {
    public techs: Map<string, Tech> = new Map();
    public readonly fudgeFactor = 0.9995; //Be nice. Close enough. :)
    public lastFriendVisitDates: Map<string, Date> = new Map(); // PlayerID -> timestamp of last visit
    public lastResearchCompletionDates: Date[] = [];
    constructor(techs: Tech[] = TECH_TYPES) {
        techs.forEach(tech => this.techs.set(tech.id, tech.clone()));

        //Add any missing techs from TECH_TYPES
        for (const tech of TECH_TYPES.filter(tech => !this.techs.has(tech.id)))
            this.techs.set(tech.id, tech.clone());
    }

    updateAdoptionRates(city: City): void {
        this.techs.forEach(tech => {
            if (tech.researched && tech.adoptionRate < 1) {
                tech.adoptionRate = Math.min(1, tech.adoptionRate + tech.adoptionGrowth);
                if (tech.id === "autonomousvehicles") {
                    const dealershipBonus = city.buildings.filter(p => p.type === getBuildingType(CartersCars)).reduce((acc, val) => acc + val.lastEfficiency, 0);
                    tech.adoptionRate = Math.min(1, tech.adoptionRate + tech.adoptionGrowth * dealershipBonus * 0.3); //30% bonus for one dealership (reduce by ~7 days), 60% for 2 (reduce by ~11 days), 90% for 3 (reduce by ~14 days).
                }
            }
        });
    }

    getAdoption(id: string): number {
        const tech = this.techs.get(id);
        if (!tech?.researched) return 0;
        return tech.adoptionRate;
    }

    isUnlocked(techId: string): boolean {
        return !!this.techs.get(techId)?.researched;
    }

    prereqsAreResearched(tech: Tech): boolean {
        return tech.prerequisites.every(p => this.techs.get(p)?.researched);
    }

    calculateCurrentResearchableAmount(city: City, tech: Tech): number {
        return city.calculateAffordablePortion(tech.costs);
    }

    canResearchTech(city: City, tech: Tech): boolean {
        if (tech.researched || tech.isUnavailable(city) || !tech.canBecomeAvailableInRegion(city.regionID!) || !this.prereqsAreResearched(tech)) return false;
        return true;
    }

    noMoreTechs(city: City): boolean {
        return Array.from(this.techs.values()).every(tech => tech.researched || tech.isUnavailable(city) || !tech.canBecomeAvailableInRegion(city.regionID!));
    }

    /**
     * For use when you visit a friend's city for the first time in the given reset period. Not sure how I want to determine 'points' yet.
     * @param city Your city
     * @param otherCity Friend's city
     * @param points Number of research points to award (other resource costs are reduced proportionally)
     * @param visitTime The time of the visit to the friend's city--Date.now() normally, but it's a parameter for repeating the logic on the server side
     * @returns An object containing the selected tech, hours to wait instead of getting a bonus this time, whether this friend's bonus was already claimed, and integer remaining visit allowance.
     */
    static grantFreePoints(city: City, otherCity: City, points: number, visitTime: number): FriendResearchVisitResult {
        //Visit allowance stocks up for 5 days, and you can claim all the visits in one day as long as you have that many friends
        const friendVisitAllowance = city.resources.get(new FriendResearchVisits().type)!;
        if (friendVisitAllowance.amount < 1)
            return { tech: null, longTicksToWait: (1 - friendVisitAllowance.amount) / friendVisitAllowance.productionRate - (Date.now() - city.lastLongTick) / LONG_TICK_TIME, alreadyClaimedForThisFriend: false, remainingVisits: 0, points: 0 };

        //But you can only claim one bonus *per friend* per day
        const lastVisitDate = city.techManager.lastFriendVisitDates.get(otherCity.player.id);
        const currentVisitDate = new Date(visitTime);
        if (lastVisitDate && lastVisitDate.getDate() === currentVisitDate.getDate() && lastVisitDate.getMonth() === currentVisitDate.getMonth()
            && lastVisitDate.getFullYear() === currentVisitDate.getFullYear())
            return { tech: null, longTicksToWait: 0, alreadyClaimedForThisFriend: true, remainingVisits: Math.floor(friendVisitAllowance.amount), points: 0 };

        //Pick a tech
        const friendResearchedTechsSet = new Set([...otherCity.techManager.techs.values()].filter(p => p.researched).map(p => p.id)); //Techs they have researched
        const researchableTechs = Array.from(city.techManager.techs.values()).filter(tech => friendResearchedTechsSet.has(tech.id) && !tech.researched && city.techManager.prereqsAreResearched(tech) && tech.canBecomeAvailableInRegion(city.regionID!)); //Tentative rules. Techs you don't have but COULD be researching now.
        if (!researchableTechs.length) return { tech: null, longTicksToWait: 0, alreadyClaimedForThisFriend: false, remainingVisits: Math.floor(friendVisitAllowance.amount), points: 0 };
        inPlaceShuffle(researchableTechs);
        const tech = researchableTechs[0];

        //Calculate what fraction of the entire remaining cost the given number of points (research points) represents, based on the research resource in the costs.
        const cost = tech.costs.find(cost => cost.type === new Research().type);
        if (!cost) return { tech: null, longTicksToWait: 0, alreadyClaimedForThisFriend: false, remainingVisits: Math.floor(friendVisitAllowance.amount), points: 0 };
        const remainingFraction = 1 - Math.min(1, points / cost.amount);
        tech.costs.forEach(p => p.amount *= remainingFraction);

        //Possibly *complete* the tech research; be EXTRA nice by allowing a fudge factor of 1 whole resource (of whichever type requires the fewest)
        if (tech.costs.every(p => p.amount < 1)) city.techManager.researchTech(city, tech);

        //Record the visit
        city.techManager.lastFriendVisitDates.set(otherCity.player.id, currentVisitDate);
        friendVisitAllowance.consume(1);

        return { tech: tech, longTicksToWait: 0, alreadyClaimedForThisFriend: false, remainingVisits: Math.floor(friendVisitAllowance.amount), points };
    }

    randomFreeResearch(city: City, fractionToGrant: number): Tech | null {
        const researchableTechs = Array.from(this.techs.values()).filter(tech => !tech.researched && this.prereqsAreResearched(tech) && tech.canBecomeAvailableInRegion(city.regionID!));
        if (!researchableTechs.length) return null;
        inPlaceShuffle(researchableTechs);
        const tech = researchableTechs[0];

        //Calculate the remaining fraction and reduce by that amount
        const cost = tech.costs.find(cost => cost.type === new Research().type);
        if (!cost) return null;
        const originalCost = tech.originalCosts.find(cost => cost.type === new Research().type)!.amount
        let reducedToFraction = (cost.amount / originalCost - fractionToGrant) / cost.amount * originalCost; //fraction of the original cost, converted to a fraction of the current cost
        if (reducedToFraction < 0.01) reducedToFraction = 0;
        tech.costs.forEach(p => p.amount *= reducedToFraction);

        //Possibly *complete* the tech research
        if (reducedToFraction === 0) this.researchTech(city, tech);

        return tech;
    }

    /**
     * Allows PARTIAL research of a tech. Returns false if the tech can't be researched at all.
     * @param city
     * @param tech
     * @returns
     */
    researchTech(city: City, tech: Tech): boolean {
        if (!this.canResearchTech(city, tech)) return false;

        //Calculate the possible amount and spend only that much.
        const affordablePortion = this.calculateCurrentResearchableAmount(city, tech);
        if (affordablePortion <= 1 - this.fudgeFactor) return false;
        const affordableCosts = tech.costs.map(cost => ({ type: cost.type, amount: cost.amount * affordablePortion }));
        if (!city.checkAndSpendResources(affordableCosts)) return false; //SHOULD not return false.

        if (affordablePortion >= this.fudgeFactor) {
            tech.researched = true;
            tech.applyEffects(city);
            city.checkAndAwardTitle(TitleTypes.CityOfInnovators.id);

            if (!city.allResearchCompleteNotified && this.noMoreTechs(city)) {
                city.allResearchCompleteNotified = true;
                city.notify(new Notification("Research Overload", "Our researchers have hit a wall. With their heads, I mean, because they're fresh out of ideas to improve the city. To keep them from getting bored and/or turning feral, let's have them work on our skyscraper blueprints instead! You can now use research points for a flunds discount when starting a round of Altitect.", "research"));
            }
        } else {
            //Reduce the tech's costs by the fractional amount actually spent. Like adding progress, but easier to represent.
            for (let i = 0; i < tech.costs.length; i++) {
                tech.costs[i].amount -= affordableCosts[i].amount;
            }
        }
        return true;
    }
}
