//Map from "lowest value, highest value" + "range start, range end" to 0 if below the range, highest value if above the range, or the interpolated value if within the range. Used for rewards.

import { MinigameMinilab, getBuildingType } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { Notification } from "../game/Notification.js";
import { Resource } from "../game/Resource.js";
import { Flunds, MinigameOptionResearch, PracticeRuns, Tritium, Uranium, getResourceType } from "../game/ResourceTypes.js";

export const OnePracticeRun = [{ type: getResourceType(PracticeRuns), amount: 1 }];

//roundTo should be 0.1 if you want to round to the nearest 0.1, 0.5 if you want to round to the nearest 0.5...pretty clean.
//Added outputMultiplier so you can apply a factor before rounding without writing "multiplier * " twice for every call to one of these functions.
export function rangeMapLinear(value: number, lowEndOutput: number, highEndOutput: number, rangeLower: number, rangeUpper: number, roundTo: number, outputMultiplier: number = 1) {
    if (value < rangeLower) return 0;
    if (value >= rangeUpper) return highEndOutput;
    return Math.round((lowEndOutput + (highEndOutput - lowEndOutput) * (value - rangeLower) / (rangeUpper - rangeLower)) * outputMultiplier / roundTo) * roundTo;
}

//Same thing, but with a curve-bending factor (exponent, but the number is 0-1, so if exponent > 1, the output approaches the maximum faster at the lower end).
export function rangeMapExp(value: number, lowEndOutput: number, highEndOutput: number, rangeLower: number, rangeUpper: number, exponent: number, roundTo: number, outputMultiplier: number = 1) {
    if (value < rangeLower) return 0;
    if (value >= rangeUpper) return highEndOutput;
    return Math.round((lowEndOutput + (highEndOutput - lowEndOutput) * Math.pow((value - rangeLower) / (rangeUpper - rangeLower), exponent)) * outputMultiplier / roundTo) * roundTo;
}

//Only return the winnings that have a nonzero amount, and convert uranium or tritium to flunds (LESS than the normal sell rate because it'd be early-game, when flunds are much more valuable) if there's nowhere to put them.
export function filterConvertAwardWinnings(city: City, winnings: Resource[], extraFlunds: number = 0) {
    const flunds = winnings.find(p => p.type === getResourceType(Flunds)) ?? winnings[winnings.push(new Flunds()) - 1];
    flunds.amount += extraFlunds;
    if (!city.resources.get(getResourceType(Uranium))?.capacity) {
        const uranium = winnings.find(p => p.type === getResourceType(Uranium));
        if (uranium) {
            flunds.amount += uranium.amount * new Uranium().sellPrice * 0.75;
            uranium.amount = 0;
        }
    }
    if (!city.resources.get(getResourceType(Tritium))?.capacity) {
        const tritium = winnings.find(p => p.type === getResourceType(Tritium));
        if (tritium) {
            flunds.amount += tritium.amount * new Tritium().sellPrice * 0.75;
            tritium.amount = 0;
        }
    }

    const result = winnings.filter(p => p.amount > 0);
    city.transferResourcesFrom(result.map(p => p.clone()), "earn");
    return result;
}

export function progressMinigameOptionResearch(city: City, amount: number) {
    const lab = <MinigameMinilab | undefined>city.buildings.find(p => p.type === getBuildingType(MinigameMinilab));
    if (!lab) return;
    const researchItem = lab.getCurrentResearch(city);
    if (!researchItem) return;
    const resource = city.resources.get(getResourceType(MinigameOptionResearch));
    if (!resource) return;

    resource.amount += amount * lab.lastEfficiency;
    if (resource.amount > 1) {
        resource.amount -= 1;
        city.unlockedMinigameOptions.add(researchItem.id);
        city.notify(new Notification(`Minigame Minilab breakthrough`, `You have unlocked the ${researchItem.name} option for ${researchItem.game}!`, "minigames"));
        if (!lab.getCurrentResearch(city)) resource.amount = 0; //We can zero it out when it's no longer needed
    }
}