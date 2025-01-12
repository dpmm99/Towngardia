import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";

export class Milestone {
    constructor(
        public readonly id: CityFlags | string, //If it's a string, it's an Achievement ID. (Not a title.)
        public readonly name: string,
        public readonly description: string,
        public readonly displayX: number,
        public readonly displayY: number,
        public readonly prerequisites: CityFlags[] = [],
        public readonly regionIds: string[] = [], // Empty means available in all regions
        public readonly imageFile: string,
    ) {}

    canShowInRegion(regionId: string): boolean {
        return this.regionIds.length === 0 || this.regionIds.includes(regionId);
    }

    isAttained(city: City): boolean {
        return typeof this.id === "string" ? city.player.achievements.some(p => p.attained && p.id === this.id) : city.flags.has(this.id);
    }
}
