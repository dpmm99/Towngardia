import { Building } from "./Building.js";
import { ActiveVolcano, AlienMonolith, BigBoulder, CleanPond, CrystalMountain, DryWoods, GemBoulder, GeothermalVent, HotSpring, Ignimbrite, LakeOfFire, LithiumPlateau, MediumBoulder, Mountain, MysteriousRubble, ObstructingGrove, OilSeep, PondFilth, PrettyPond, SandBar, SmallBoulder } from "./BuildingTypes.js";
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
                    .forEach(b => city.removeBuilding(b, true));
            }
        });

        city.regionID = this.id;
        city.regionVersion = this.latestVersion;

        //Modify techs
        city.techManager.techs.forEach(tech => tech.applyRegionEffects(this.id));
    }
}

//Handy code for making new layouts: game.city.buildings.filter(p => !p.owned && !p.isRoad).sort((a, b) => a.x + a.y - b.x - b.y).map(p => "[" + p.constructor.name + ", " + p.x + ", " + p.y + ", 1]").join(", ")
export const REGIONS = [
    new Region("plains", "Plains", 64, 64, 4, [[Mountain, 7, 0, 1], [SandBar, 0, 10], [ObstructingGrove, 0, 4, 1], //ObstructingGrove.getDemolitionCosts has the exact coordinates (0, 4), so be careful if you change them.
        [ObstructingGrove, 4, 30, 1], [ObstructingGrove, 29, 0, 1], [ObstructingGrove, 16, 25, 1], [ObstructingGrove, 37, 18, 1], [ObstructingGrove, 24, 44, 1], [SmallBoulder, 21, 3, 1], [MediumBoulder, 32, 6, 1], [MediumBoulder, 11, 33, 1], [MediumBoulder, 37, 30, 1], [BigBoulder, 3, 42, 1], [BigBoulder, 18, 50, 1], [BigBoulder, 51, 31, 1], [BigBoulder, 44, 3, 1], [BigBoulder, 44, 54, 1], [BigBoulder, 57, 41, 1], [BigBoulder, 38, 53, 1], [BigBoulder, 45, 35, 1], [BigBoulder, 54, 8, 1], [ObstructingGrove, 28, 33, 1], [MediumBoulder, 39, 12, 1], [MediumBoulder, 24, 34, 1], [MediumBoulder, 36, 22, 1], [MediumBoulder, 48, 9, 1], [MediumBoulder, 53, 3, 1], [MediumBoulder, 58, 33, 1], [MediumBoulder, 27, 53, 1], [MediumBoulder, 0, 48, 1], [ObstructingGrove, 0, 37, 1], [ObstructingGrove, 40, 0, 1], [OilSeep, 21, 13, 1], [OilSeep, 14, 33, 1], [SmallBoulder, 19, 12, 1], [SmallBoulder, 13, 31, 1], [SmallBoulder, 30, 29, 1], [SmallBoulder, 33, 13, 1], [SmallBoulder, 29, 21, 1], [SmallBoulder, 38, 5, 1], [SmallBoulder, 34, 1, 1], [SmallBoulder, 42, 18, 1], [SmallBoulder, 48, 14, 1], [SmallBoulder, 44, 26, 1], [SmallBoulder, 38, 36, 1], [SmallBoulder, 8, 44, 1], [SmallBoulder, 14, 46, 1], [SmallBoulder, 10, 48, 1], [SmallBoulder, 6, 54, 1], [SmallBoulder, 13, 40, 1],
        [SmallBoulder, 19, 62, 1], [SmallBoulder, 13, 56, 1], [SmallBoulder, 37, 62, 1], [SmallBoulder, 50, 55, 1], [SmallBoulder, 60, 47, 1], [SmallBoulder, 56, 18, 1], [SmallBoulder, 26, 5, 1], [MediumBoulder, 11, 19, 1], [MediumBoulder, 61, 20, 1], [MediumBoulder, 61, 61, 1], [Mountain, 0, 26, 1], [SmallBoulder, 4, 27, 1], [SandBar, 44, 0, 1], [SandBar, 36, 0, 1], [SandBar, 38, 0, 1], [SandBar, 0, 24, 1], [SandBar, 21, 0, 1], [OilSeep, 42, 53, 1], [OilSeep, 42, 13, 1], [CrystalMountain, 6, 27, 1], [ObstructingGrove, 7, 23, 1], [SmallBoulder, 9, 27, 1], [PrettyPond, 21, 29, 1], [PrettyPond, 37, 15, 1],
        [CleanPond, 18, 17, 2], [PondFilth, 18, 17, 2],
        [LithiumPlateau, 37, 38, 3],
        [AlienMonolith, 26, 0, 4], [MysteriousRubble, 26, 0, 4],
    ]),
    new Region("volcanic", "Volcanic Desert", 64, 64, 1, [[DryWoods, 7, 7, 1], [Ignimbrite, 0, 14, 1], [ActiveVolcano, 11, 4, 1], [Ignimbrite, 14, 1, 1], [GeothermalVent, 17, 1, 1], [Ignimbrite, 18, 0, 1], [SmallBoulder, 3, 16, 1], [ActiveVolcano, 6, 16, 1], [SmallBoulder, 4, 18, 1], [ActiveVolcano, 23, 0, 1], [GemBoulder, 15, 10, 1], [SmallBoulder, 10, 15, 1], [DryWoods, 12, 13, 1], [SmallBoulder, 1, 25, 1], [GemBoulder, 7, 20, 1], [GeothermalVent, 11, 18, 1], [Ignimbrite, 10, 19, 1], [SmallBoulder, 25, 4, 1], [Ignimbrite, 27, 3, 1], [SmallBoulder, 21, 10, 1], [HotSpring, 5, 26, 1], [Ignimbrite, 7, 24, 1],
        [GeothermalVent, 30, 2, 1], [Ignimbrite, 32, 1, 1], [DryWoods, 4, 30, 1], [DryWoods, 12, 22, 1], [Ignimbrite, 27, 9, 1], [GemBoulder, 9, 28, 1], [Ignimbrite, 26, 12, 1], [Ignimbrite, 22, 17, 1], [GemBoulder, 32, 7, 1], [LakeOfFire, 30, 10, 1], [Ignimbrite, 13, 27, 1], [DryWoods, 2, 39, 1], [Ignimbrite, 25, 16, 1], [Ignimbrite, 16, 25, 1], [ActiveVolcano, 24, 20, 1], [Ignimbrite, 42, 2, 1], [LakeOfFire, 15, 30, 1], [ActiveVolcano, 41, 5, 1], [DryWoods, 19, 27, 1], [SmallBoulder, 14, 33, 1], [SmallBoulder, 8, 39, 1], [GeothermalVent, 45, 3, 1], [Ignimbrite, 11, 37, 1], [GeothermalVent, 10, 40, 1], [GemBoulder, 26, 24, 1], [SmallBoulder, 28, 22, 1], [DryWoods, 1, 50, 1], [Ignimbrite, 35, 17, 1], [GemBoulder, 43, 9, 1], [Ignimbrite, 51, 2, 1], [DryWoods, 7, 46, 1], [SmallBoulder, 48, 5, 1], [GemBoulder, 12, 42, 1], [Ignimbrite, 27, 27, 1], [ActiveVolcano, 39, 16, 1], [DryWoods, 20, 35, 1], [Ignimbrite, 43, 14, 1], [Ignimbrite, 54, 3, 1], [DryWoods, 35, 22, 1], [SmallBoulder, 52, 5, 1], [DryWoods, 18, 39, 1], [MysteriousRubble, 24, 35, 1], [AlienMonolith, 24, 35, 1], [ActiveVolcano, 60, 0, 1], [GeothermalVent, 46, 14, 1], [Ignimbrite, 32, 28, 1], [SmallBoulder, 50, 10, 1], [SmallBoulder, 41, 20, 1], [GeothermalVent, 31, 31, 1], [GemBoulder, 43, 19, 1], [DryWoods, 5, 57, 1], [SmallBoulder, 11, 51, 1],
        [LakeOfFire, 53, 11, 1], [GeothermalVent, 8, 56, 1], [GemBoulder, 56, 8, 1], [DryWoods, 19, 45, 1], [LithiumPlateau, 12, 53, 1], [Ignimbrite, 30, 35, 1], [SmallBoulder, 26, 40, 1], [Ignimbrite, 29, 38, 1], [DryWoods, 16, 51, 1], [SmallBoulder, 53, 14, 1], [GeothermalVent, 25, 44, 1], [Ignimbrite, 37, 32, 1], [SmallBoulder, 11, 58, 1], [DryWoods, 26, 44, 1], [LakeOfFire, 40, 31, 1], [Ignimbrite, 57, 14, 1], [Ignimbrite, 50, 22, 1], [GemBoulder, 32, 40, 1], [SmallBoulder, 37, 35, 1], [Ignimbrite, 49, 25, 1], [DryWoods, 15, 59, 1], [SmallBoulder, 23, 51, 1], [DryWoods, 31, 43, 1], [SmallBoulder, 28, 48, 1], [Ignimbrite, 59, 18, 1], [GemBoulder, 56, 24, 1], [GemBoulder, 46, 34, 1], [SmallBoulder, 50, 30, 1], [LakeOfFire, 53, 28, 1], [DryWoods, 26, 55, 1], [DryWoods, 43, 39, 1], [GeothermalVent, 52, 32, 1], [GeothermalVent, 42, 43, 1], [DryWoods, 41, 44, 1], [Ignimbrite, 61, 24, 1], [SmallBoulder, 58, 28, 1], [DryWoods, 36, 51, 1], [SmallBoulder, 30, 58, 1], [SmallBoulder, 40, 51, 1], [DryWoods, 57, 35, 1], [SmallBoulder, 45, 47, 1], [Ignimbrite, 53, 41, 1], [Ignimbrite, 50, 44, 1], [DryWoods, 37, 58, 1], [DryWoods, 42, 53, 1], [GemBoulder, 49, 49, 1], [HotSpring, 53, 46, 1], [SmallBoulder, 56, 46, 1], [SmallBoulder, 47, 57, 1], [DryWoods, 55, 50, 1], [DryWoods, 53, 54, 1], [DryWoods, 50, 60, 1], [DryWoods, 59, 53, 1], [SmallBoulder, 55, 58, 1],
    ]),
];