import { Building } from "./Building.js";
import { City } from "./City.js";
import { EffectType } from "./GridType.js";

/**
 * An effect that applies to one or more city tiles. Can be static or dynamic.
 * The same instance can apply to many tiles if the multiplier doesn't need to change by-tile (and if it does, then use the dynamicCalculation property).
 * @param type The type of effect.
 * @param multiplier The multiplier of the effect. Default is 1.
 * @param building The building that is causing the effect. Default is undefined (e.g., for default land value numbers). Mainly used for removing the effects when removing a building.
 * @param dynamicCalculation A function that calculates the effect dynamically. MUST be a function of the given building. If this is set, the multiplier is still considered, but it's multiplied by the result of this function. Inputs are the city, AFFECTED building, and tile position (x, y).
 * @param expirationLongTicks The number of ticks after which the effect expires. If undefined or less than 1, the effect does not expire.
 */
export class Effect {
    constructor(public type: EffectType, public multiplier: number = 1, public building?: Building, public dynamicCalculation?: string, public expirationLongTicks?: number) {
    }

    getEffect(city: City, building: Building | null, x: number, y: number) {
        return this.building && this.dynamicCalculation
            ? (<(city: City, building: Building | null, x: number, y: number) => number>((<any>this.building)[this.dynamicCalculation]))(city, building, x, y) * this.multiplier
            : this.multiplier;
    }

    clone(): Effect {
        return Object.assign(Object.create(this), this);
    }
}