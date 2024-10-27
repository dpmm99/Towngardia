import { Building } from "./Building.js";
import { AlienMonolith, BigBoulder, CleanPond, CrystalMountain, LithiumPlateau, MediumBoulder, Mountain, MysteriousRubble, ObstructingGrove, OilSeep, PondFilth, PrettyPond, SandBar, SmallBoulder } from "./BuildingTypes.js";
import { City } from "./City.js";

// Type for storing building information in a region
type RegionBuilding = {
    buildingType: new () => Building;
    x: number;
    y: number;
    addedInVersion: number;
    removedInVersion: number | null;
};

export class Region {
    private buildings: RegionBuilding[];
    constructor(public id: string, public displayName: string, public width: number, public height: number, public latestVersion: number, public buildingTypes: any[][]) {
        this.buildings = buildingTypes.map(p => ({ buildingType: p[0], x: p[1], y: p[2], addedInVersion: p[3], removedInVersion: p[4] || null })); //Using an array of 'any' for brevity.
    }

    apply(city: City): void {
        const cityRegionVersion = city.regionVersion || 0;

        this.buildings.forEach(building => {
            if (building.addedInVersion > cityRegionVersion && building.removedInVersion === null) {
                const newBuilding = new building.buildingType();
                if (newBuilding.canPlace(city, building.x, building.y, true)) {
                    city.addBuilding(newBuilding, building.x, building.y);
                }
            } else if (building.removedInVersion && cityRegionVersion < building.removedInVersion) { //Remove if it exists
                [...city.getBuildingsInArea(building.x, building.y, 1, 1, 0, 0)]
                    .filter(p => p instanceof building.buildingType && p.x === building.x && p.y === building.y)
                    .forEach(b => city.removeBuilding(b));
            }
        });

        city.regionID = this.id;
        city.regionVersion = this.latestVersion;
    }
}

export const REGIONS = [
    new Region("plains", "Plains", 64, 64, 4, [[ObstructingGrove, 4, 30, 1], [ObstructingGrove, 29, 0, 1], [ObstructingGrove, 16, 25, 1], [ObstructingGrove, 37, 18, 1], [ObstructingGrove, 24, 44, 1], [SmallBoulder, 21, 3, 1], [MediumBoulder, 32, 6, 1], [MediumBoulder, 11, 33, 1], [MediumBoulder, 37, 30, 1], [BigBoulder, 3, 42, 1], [BigBoulder, 18, 50, 1], [BigBoulder, 51, 31, 1], [BigBoulder, 44, 3, 1], [BigBoulder, 44, 54, 1], [BigBoulder, 57, 41, 1], [BigBoulder, 38, 53, 1], [BigBoulder, 45, 35, 1], [BigBoulder, 54, 8, 1], [ObstructingGrove, 28, 33, 1], [MediumBoulder, 39, 12, 1], [MediumBoulder, 24, 34, 1], [MediumBoulder, 36, 22, 1], [MediumBoulder, 48, 9, 1], [MediumBoulder, 53, 3, 1], [MediumBoulder, 58, 33, 1], [MediumBoulder, 27, 53, 1], [MediumBoulder, 0, 48, 1], [ObstructingGrove, 0, 37, 1], [ObstructingGrove, 40, 0, 1], [OilSeep, 21, 13, 1], [OilSeep, 14, 33, 1], [SmallBoulder, 19, 12, 1], [SmallBoulder, 13, 31, 1], [SmallBoulder, 30, 29, 1], [SmallBoulder, 33, 13, 1], [SmallBoulder, 29, 21, 1], [SmallBoulder, 38, 5, 1], [SmallBoulder, 34, 1, 1], [SmallBoulder, 42, 18, 1], [SmallBoulder, 48, 14, 1], [SmallBoulder, 44, 26, 1], [SmallBoulder, 38, 36, 1], [SmallBoulder, 8, 44, 1], [SmallBoulder, 14, 46, 1], [SmallBoulder, 10, 48, 1], [SmallBoulder, 6, 54, 1], [SmallBoulder, 13, 40, 1], [SmallBoulder, 19, 62, 1], [SmallBoulder, 13, 56, 1], [SmallBoulder, 37, 62, 1], [SmallBoulder, 50, 55, 1], [SmallBoulder, 60, 47, 1], [SmallBoulder, 56, 18, 1], [SmallBoulder, 26, 5, 1], [MediumBoulder, 11, 19, 1], [MediumBoulder, 61, 20, 1], [MediumBoulder, 61, 61, 1], [Mountain, 0, 26, 1], [SmallBoulder, 4, 27, 1], [SandBar, 44, 0, 1], [SandBar, 36, 0, 1], [SandBar, 38, 0, 1], [SandBar, 0, 24, 1], [SandBar, 21, 0, 1], [OilSeep, 42, 53, 1], [OilSeep, 42, 13, 1], [CrystalMountain, 6, 27, 1], [ObstructingGrove, 7, 23, 1], [SmallBoulder, 9, 27, 1], [PrettyPond, 21, 29, 1], [PrettyPond, 37, 15, 1], [CleanPond, 18, 17, 2], [PondFilth, 18, 17, 2], [LithiumPlateau, 37, 38, 3], [AlienMonolith, 26, 0, 4], [MysteriousRubble, 26, 0, 4]])
];