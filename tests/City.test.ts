import { City } from "../src/game/City.js";
import { Building } from "../src/game/Building.js";
import { BuildingCategory } from "../src/game/BuildingCategory.js";

describe('City.getBuildingsInArea Unit Test', () => {
    let city: City;
    const citySize = 10;
    let unitBuilding: Building;
    let longBuilding: Building;
    let bigBuilding: Building;

    beforeEach(() => {
        city = new City("1", "Test City", citySize, citySize, []);

        unitBuilding = new Building("unit", BuildingCategory.RESIDENTIAL, 1, 1, 0, false, true, 0, 0, "b-unit");
        longBuilding = new Building("long", BuildingCategory.RESIDENTIAL, 2, 1, 0, false, true, 3, 4, "b-long");
        bigBuilding = new Building("big", BuildingCategory.RESIDENTIAL, 3, 4, 0, false, true, 6, 5, "b-big");

        // Manually set grid positions
        city.grid[0][0] = unitBuilding;
        city.grid[4][3] = longBuilding;
        city.grid[4][4] = longBuilding;
        for (let y = 5; y < 9; y++) {
            for (let x = 6; x < 9; x++) {
                city.grid[y][x] = bigBuilding;
            }
        }

        city.buildings = [unitBuilding, longBuilding, bigBuilding];
    });

    test('getBuildingsInArea returns correct buildings', () => {
        // Test case 1: Area containing only the unit building
        let result = city.getBuildingsInArea(0, 0, 1, 1, 0, 0);
        expect(result.size).toBe(1);
        expect(result.has(unitBuilding)).toBe(true);

        // Test case 2: Area containing the long building
        result = city.getBuildingsInArea(3, 4, 2, 1, 0, 0);
        expect(result.size).toBe(1);
        expect(result.has(longBuilding)).toBe(true);

        // Test case 3: Area containing part of the big building
        result = city.getBuildingsInArea(7, 6, 1, 1, 0, 0);
        expect(result.size).toBe(1);
        expect(result.has(bigBuilding)).toBe(true);

        // Test case 4: Area containing multiple buildings
        result = city.getBuildingsInArea(0, 0, 10, 10, 0, 0);
        expect(result.size).toBe(3);
        expect(result.has(unitBuilding)).toBe(true);
        expect(result.has(longBuilding)).toBe(true);
        expect(result.has(bigBuilding)).toBe(true);

        // Test case 5: Area with radius
        result = city.getBuildingsInArea(2, 3, 1, 1, 1, 1);
        expect(result.size).toBe(1);
        expect(result.has(longBuilding)).toBe(true);

        // Test case 6: Empty area
        result = city.getBuildingsInArea(1, 1, 2, 2, 0, 0);
        expect(result.size).toBe(0);
    });
});
