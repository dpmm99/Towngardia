import { City } from "../src/game/City.js";
import { Building } from "../src/game/Building.js";
import { BuildingCategory } from "../src/game/BuildingCategory.js";

describe('Building Placement Integration Test', () => {
    let city: City;
    const citySize = 10;

    beforeEach(() => {
        city = new City("1", "Test City", citySize, citySize, []);
    });

    const createBuilding = (width: number, height: number): Building => {
        return new Building(
            `TestBuilding${width}x${height}`,
            BuildingCategory.RESIDENTIAL,
            `b${width}-${height}`,
            0,
            0,
            width,
            height,
            0,
            1,
            1
        );
    };

    test('canPlace returns true for valid placements', () => {
        const building1x1 = createBuilding(1, 1);
        const building2x2 = createBuilding(2, 2);
        const building3x3 = createBuilding(3, 3);

        expect(building1x1.canPlace(city, 0, 0)).toBe(true);
        expect(building2x2.canPlace(city, 3, 3)).toBe(true);
        expect(building3x3.canPlace(city, 6, 6)).toBe(true);
    });

    test('canPlace returns false for out-of-bounds placements', () => {
        const building2x2 = createBuilding(2, 2);
        const building3x3 = createBuilding(3, 3);

        expect(building2x2.canPlace(city, 9, 9)).toBe(false);
        expect(building3x3.canPlace(city, 8, 8)).toBe(false);
    });

    test('canPlace returns false for overlapping placements', () => {
        const building2x2 = createBuilding(2, 2);
        city.addBuilding(building2x2);

        const newBuilding1x1 = createBuilding(1, 1);
        const newBuilding2x2 = createBuilding(2, 2);

        expect(newBuilding1x1.canPlace(city, 0, 0)).toBe(false);
        expect(newBuilding1x1.canPlace(city, 1, 1)).toBe(false);
        expect(newBuilding2x2.canPlace(city, 1, 1)).toBe(false);
    });

    test('addBuilding correctly places buildings on the grid', () => {
        const building1x1 = createBuilding(1, 1);
        building1x1.x = 4;
        const building2x2 = createBuilding(2, 2);
        building2x2.y = 3;
        const building3x3 = createBuilding(3, 3);

        city.addBuilding(building1x1);
        city.addBuilding(building2x2);
        city.addBuilding(building3x3);

        expect(city.buildings.length).toBe(3);
        expect(city.grid[0][0]).toBe(building3x3);
        expect(city.grid[1][1]).toBe(building3x3);
        expect(city.grid[2][2]).toBe(building3x3);
        expect(city.grid[0][4]).toBe(building1x1);
        expect(city.grid[3][0]).toBe(building2x2);
        expect(city.grid[3][1]).toBe(building2x2);
        expect(city.grid[4][1]).toBe(building2x2);
    });

    test('complex placement scenario', () => {
        const building1x1 = createBuilding(1, 1);
        const building2x2 = createBuilding(2, 2);
        const building3x3 = createBuilding(3, 3);

        expect(building1x1.canPlace(city, 0, 0)).toBe(true);
        city.addBuilding(building1x1);

        expect(building2x2.canPlace(city, 1, 1)).toBe(true);
        building2x2.x = 1; building2x2.y = 1;
        city.addBuilding(building2x2);

        expect(building3x3.canPlace(city, 0, 3)).toBe(true);
        building3x3.x = 0; building3x3.y = 3;
        city.addBuilding(building3x3);

        expect(city.grid[3][2]).toBe(building3x3);
        expect(building1x1.canPlace(city, 2, 3)).toBe(false);
        expect(building3x3.canPlace(city, 1, 0)).toBe(false);
        expect(building3x3.canPlace(city, 7, 7)).toBe(true);

        expect(city.buildings.length).toBe(3);
        expect(city.grid[0][0]).toBe(building1x1);
        expect(city.grid[2][2]).toBe(building2x2);
        expect(city.grid[5][2]).toBe(building3x3);
    });
});
