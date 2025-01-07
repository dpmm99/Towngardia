import { City } from "../game/City.js";
import { LONG_TICKS_PER_DAY, LONG_TICK_TIME } from "../game/FundamentalConstants.js";
import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";

export function humanizeFloor(value: number): string {
    if (value < 1000) return (Math.floor(value * 10) / 10).toLocaleString();
    if (value < 1000000) return (Math.floor(value / 100) / 10).toLocaleString() + "k";
    if (value < 1000000000) return (Math.floor(value / 100000) / 10).toLocaleString() + "M";
    if (value < 1000000000000) return (Math.floor(value / 100000000) / 10).toLocaleString() + "B";
    return (Math.floor(value / 100000000000) / 10).toLocaleString() + "T";
}

export function humanizeCeil(value: number): string {
    if (value < 1000) return (Math.ceil(value * 10) / 10).toLocaleString();
    if (value < 1000000) return (Math.ceil(value / 100) / 10).toLocaleString() + "k";
    if (value < 1000000000) return (Math.ceil(value / 100000) / 10).toLocaleString() + "M";
    if (value < 1000000000000) return (Math.ceil(value / 100000000) / 10).toLocaleString() + "B";
    return (Math.ceil(value / 100000000000) / 10).toLocaleString() + "T";
}

//Includes units, not just a letter indicating scale.
export function humanizePowerFloor(value: number): string {
    if (value < 1000) return (Math.floor(value * 10) / 10).toLocaleString() + " MW";
    if (value < 1000000) return (Math.floor(value / 100) / 10).toLocaleString() + " GW";
    return (Math.floor(value / 100000) / 10).toLocaleString() + " TW";
}
export function humanizePowerCeil(value: number): string {
    if (value < 1000) return (Math.ceil(value * 10) / 10).toLocaleString() + " MW";
    if (value < 1000000) return (Math.ceil(value / 100) / 10).toLocaleString() + " GW";
    return (Math.ceil(value / 100000) / 10).toLocaleString() + " TW";
}

export function humanizeWaterFloor(value: number): string {
    if (value < 1000) return (Math.floor(value * 10) / 10).toLocaleString() + " L";
    if (value < 1000000) return (Math.floor(value / 100) / 10).toLocaleString() + " kL";
    if (value < 1000000000) return (Math.floor(value / 100000) / 10).toLocaleString() + " ML";
    return (Math.floor(value / 100000000) / 10).toLocaleString() + " GL";
}
export function humanizeWaterCeil(value: number): string {
    if (value < 1000) return (Math.ceil(value * 10) / 10).toLocaleString() + " L";
    if (value < 1000000) return (Math.ceil(value / 100) / 10).toLocaleString() + " kL";
    if (value < 1000000000) return (Math.ceil(value / 100000) / 10).toLocaleString() + " ML";
    return (Math.ceil(value / 100000000) / 10).toLocaleString() + " GL";
}

//A function to convert a number of long ticks into a number of day(s) and hour(s), written properly with singular or plural and full words.
export function longTicksToDaysAndHours(ticks: number): string {
    const subDayTicks = ticks % LONG_TICKS_PER_DAY;
    const days = (ticks - subDayTicks) / LONG_TICKS_PER_DAY;
    const hours = subDayTicks * 24 / LONG_TICKS_PER_DAY;
    const hoursText = hours ? (hours + " hour" + (hours !== 1 ? "s" : "")) : "";
    return days
        ? (days + " day" + (days !== 1 ? "s" : "") + (hours ? " " + hoursText : ""))
        : hoursText;
}

export function addResourceCosts(parentDrawable: Drawable, costs: { type: string, amount: number, reddize?: boolean }[],
    startX: number, startY: number, biggerOnMobile: boolean = false, scaleXOnMobile: boolean = false, scaleYOnMobile: boolean = false,
    resourceIconSize = 16, resourcePadding = 2, fontHeight = 14, wrapAfter = 3, grayscale: boolean = false, reddize: boolean = false, city?: City | undefined,
    floor: boolean = false): number {

    //Only reddize the unaffordable portion, if there is one. If there isn't one, reddize them all. (Assumes the caller checked the OVERALL unaffordability beforehand.)
    let reddizeByCost = grayscale || !reddize || !city ? null : costs.map(p => !city!.hasResources([p], false)); //We don't want to reddize if we're grayscaling for another reason.
    if (reddizeByCost?.every(p => !p)) reddizeByCost.fill(true); //so the player can at least tell SOMETHING is unaffordable, even though it's not attributable to a specific resource.
    costs.forEach((cost, index) => {
        const x = startX + (index % wrapAfter) * (resourceIconSize + resourcePadding);
        const y = startY + Math.floor(index / wrapAfter) * (resourceIconSize + resourcePadding + fontHeight);
        
        // Resource icon
        parentDrawable.addChild(new Drawable({
            x: x,
            y: y,
            width: resourceIconSize + "px",
            height: resourceIconSize + "px",
            image: new TextureInfo(resourceIconSize, resourceIconSize, "resource/" + cost.type),
            biggerOnMobile: biggerOnMobile, scaleXOnMobile: scaleXOnMobile, scaleYOnMobile: scaleYOnMobile,
            grayscale: grayscale,
        }));

        // Resource amount
        parentDrawable.addChild(new Drawable({
            x: x + resourceIconSize / 2,
            y: y + resourceIconSize + resourcePadding,
            centerOnOwnX: true,
            width: resourceIconSize + "px",
            height: fontHeight + "px",
            text: floor ? humanizeFloor(cost.amount) : humanizeCeil(cost.amount), //Never show a lower cost than the actual amount
            biggerOnMobile: biggerOnMobile, scaleXOnMobile: scaleXOnMobile, scaleYOnMobile: scaleYOnMobile,
            grayscale: grayscale,
            reddize: cost.reddize || reddizeByCost?.[index],
        }));
    });

    return startX + Math.min(costs.length, wrapAfter) * (resourceIconSize + resourcePadding); //Returns the next x position
}