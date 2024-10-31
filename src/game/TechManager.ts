import { TitleTypes } from "./AchievementTypes.js";
import { City } from "./City.js";
import { inPlaceShuffle } from "./MiscFunctions.js";
import { Research } from "./ResourceTypes.js";
import { Tech } from "./Tech.js";
import { TECH_TYPES } from "./TechTypes.js";

export class TechManager {
    public techs: Map<string, Tech> = new Map();
    public readonly fudgeFactor = 0.9995; //Be nice. Close enough. :)
    public lastFriendVisitDate: Date | null = null;
    public lastResearchCompletionDates: Date[] = [];
    constructor(techs: Tech[] = TECH_TYPES) {
        techs.forEach(tech => this.techs.set(tech.id, tech.clone()));

        //Add any missing techs from TECH_TYPES
        for (const tech of TECH_TYPES.filter(tech => !this.techs.has(tech.id)))
            this.techs.set(tech.id, tech.clone());
    }

    updateAdoptionRates(): void {
        this.techs.forEach(tech => {
            if (tech.researched && tech.adoptionRate < 1) {
                tech.adoptionRate = Math.min(1, tech.adoptionRate + tech.adoptionGrowth);
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
        if (tech.researched || tech.isUnavailable(city) || !this.prereqsAreResearched(tech)) return false;
        return true;
    }

    /**
     * For use when you visit a friend's city for the first time in the given reset period. Not sure how I want to determine 'points' yet.
     * @param city Your city
     * @param otherCity Friend's city
     * @param points Number of research points to award (other resource costs are reduced proportionally)
     * @param visitTime The time of the visit to the friend's city--Date.now() normally, but it's a parameter for repeating the logic on the server side
     * @returns An array. First element is the tech that was chosen to grand research points for, or null if none was. Second element is true if bonus already claimed today, or false otherwise.
     */
    grantFreePoints(city: City, otherCity: City, points: number, visitTime: number): [Tech | null, boolean] {
        if (this.lastFriendVisitDate && this.lastFriendVisitDate.getDate() === new Date(visitTime).getDate()
            && this.lastFriendVisitDate.getMonth() === new Date(visitTime).getMonth() && this.lastFriendVisitDate.getFullYear() === new Date(visitTime).getFullYear())
            return [null, true]; //Only once per day (for now; may consider 5x every 5 days like most things, but then I kinda want to track *which* friends were visited already each day and require 5 distinct friend visits every 5 days)

        //Pick a tech
        const friendResearchedTechsSet = new Set([...otherCity.techManager.techs.values()].filter(p => p.researched).map(p => p.id)); //Techs they have researched
        const researchableTechs = Array.from(this.techs.values()).filter(tech => friendResearchedTechsSet.has(tech.id) && !tech.researched && this.prereqsAreResearched(tech)); //Tentative rules. Techs you don't have but COULD be researching now.
        if (!researchableTechs.length) return [null, false];
        inPlaceShuffle(researchableTechs);
        const tech = researchableTechs[0];

        //Calculate what fraction of the entire remaining cost the given number of points (research points) represents, based on the research resource in the costs.
        const cost = tech.costs.find(cost => cost.type === new Research().type);
        if (!cost) return [null, false];
        const remainingFraction = 1 - Math.min(1, points / cost.amount);
        tech.costs.forEach(p => p.amount *= remainingFraction);

        //Possibly *complete* the tech research
        if (tech.costs.every(p => p.amount < 1)) this.researchTech(city, tech); //Be EXTRA nice. :)
        this.lastFriendVisitDate = new Date();
        return [tech, false];
    }

    randomFreeResearch(city: City, fractionToGrant: number): Tech | null {
        const researchableTechs = Array.from(this.techs.values()).filter(tech => !tech.researched && this.prereqsAreResearched(tech));
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
        } else {
            //Reduce the tech's costs by the fractional amount actually spent. Like adding progress, but easier to represent.
            for (let i = 0; i < tech.costs.length; i++) {
                tech.costs[i].amount -= affordableCosts[i].amount;
            }
        }
        return true;
    }
}
