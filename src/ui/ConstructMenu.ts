import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { FootprintType } from "../game/FootprintType.js";
import { IRenderer } from "../rendering/IRenderer.js";
import { TILE_HEIGHT, TILE_WIDTH } from "../rendering/RenderUtil.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { addResourceCosts } from "./UIUtil.js";

export class ConstructMenu implements IHasDrawable {
    private x = 0;
    private y = 0;
    private startX = -1;
    private startY = -1;
    private canPlace = false;
    private buildingType: Building | null = null;
    private lastDrawable: Drawable | null = null;
    private isMultiPlacing = false;
    private copies: { x: number, y: number }[] = [];
    private city: City | null = null;
    private moving: boolean = false;

    update(city: City, renderer: IRenderer, selectedBuildingType: Building | null, x: number, y: number, moving: boolean): void {
        this.city = city;
        this.moving = moving;
        this.buildingType = selectedBuildingType;
        if (!selectedBuildingType) {
            this.startY = this.startX = -1;
            return;
        }

        this.isMultiPlacing = selectedBuildingType.isRoad && !moving;

        //Get the nearest potentially allowed position (fully within city bounds)
        x = Math.max(0, Math.min(city.width - selectedBuildingType.width, x));
        y = Math.max(0, Math.min(city.height - selectedBuildingType.height, y));

        this.x = x;
        this.y = y;
        
        this.updateCopies(city);
        this.canPlace = this.checkCanPlace(city, moving);
    }

    private updateCopies(city: City): void {
        if (!this.buildingType) return;

        this.copies = [];
        const dx = Math.abs(this.x - this.startX);
        const dy = Math.abs(this.y - this.startY);
        const isHorizontal = dx > dy;

        let currentX = this.startX === -1 ? this.x : this.startX;
        let currentY = this.startY === -1 ? this.y : this.startY;
        const step = isHorizontal ? Math.sign(this.x - this.startX) * this.buildingType.width : (Math.sign(this.y - this.startY) * this.buildingType.height);

        do {
            this.copies.push({ x: currentX, y: currentY });
            if (isHorizontal) {
                currentX += step;
            } else {
                currentY += step;
            }
        } while ((isHorizontal && currentX !== this.x + step) || (!isHorizontal && currentY !== this.y + step));
    }

    public checkCanPlace(city: City, moving: boolean): boolean {
        if (!this.buildingType) return false;
        const locationsOK = this.copies.every(segment => this.buildingType!.canPlace(city, segment.x, segment.y));
        return locationsOK && (moving || city.canAffordBuildings(this.buildingType!, this.copies.length));
    }

    get placementStarted(): boolean { return !this.isMultiPlacing || this.startX !== -1; }

    getCopies(): { x: number, y: number }[] {
        return this.copies;
    }

    setStartPosition(x: number, y: number): void {
        this.startX = x;
        this.startY = y;
    }

    getPos(): { x: number, y: number } {
        return { x: this.x, y: this.y };
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    asDrawable(): Drawable {
        if (!this.buildingType) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing

        // Create parent Drawable with height 0 for easy placement
        const parentDrawable = new Drawable({
            x: this.x, //World coordinates
            y: this.y,
            width: "0px",
            height: "0px",
            id: "constructMenu",
        });

        this.copies.forEach((segment, index) => {
            const x = segment.x - this.x;
            const y = segment.y - this.y;
            //Math taken from worldToScreenCoordinates; just needed the cityOffsetX part to be left out
            const offsetX = (this.buildingType!.height - 1) * TILE_WIDTH / 2;
            const offsetY = (this.buildingType!.width - 1) * -TILE_HEIGHT + (this.buildingType!.width - this.buildingType!.height) * TILE_HEIGHT / 2;

            parentDrawable.addChild(new Drawable({
                anchors: ['selfBottom'],
                x: (x - y) * TILE_WIDTH / 2 - offsetX,
                y: (x + y) * TILE_HEIGHT / 2 - offsetY,
                tileWidth: this.buildingType!.width,
                tileHeight: this.buildingType!.height,
                image: new TextureInfo(64, 64, "building/" + this.buildingType!.type),
                id: `constructMenu.roadSegment.${index}`,
            }));
        });

        //Footprint goes here
        this.copies.forEach((copy, index) => {
            this.addFootprintToDrawable(parentDrawable, copy.x - this.x, copy.y - this.y, index);
            this.addEffectAreaDrawable(parentDrawable, copy.x, copy.y, index);
        });

        parentDrawable.addChild(new Drawable({
            x: this.buildingType!.width * -10,
            y: this.buildingType!.height * -5,
            width: "32px",
            height: "32px",
            image: new TextureInfo(32, 32, this.canPlace ? "ui/ok" : "ui/x"),
            id: parentDrawable.id + ".confirm",
        }));
        
        //TODO: Maybe I should just show the final cost in the bottom bar and, instead of "For sale:", show "Buying:" + the amount you're actually buying + a slash + the current buy limit (which is currently showing under "For sale:")... 
        if (!this.moving && !this.city?.hasUnplacedBuilding(this.buildingType)) {
            const costBackdrop = new Drawable({
                x: 15,
                y: 25,
                width: "100px",
                height: "74px",
                fallbackColor: "#00000066",
                id: parentDrawable.id + ".costBackground",
            });
            parentDrawable.addChild(costBackdrop);
            const finalCost = this.city?.calculateFinalCosts(this.buildingType.getCosts(this.city), this.copies.length) ?? [];
            const nextX = addResourceCosts(costBackdrop, finalCost, 10, 5, false, false, false, 32, 10, 32, 8);
            costBackdrop.width = nextX + "px";
        }

        this.lastDrawable = parentDrawable;
        return parentDrawable;
    }

    private addFootprintToDrawable(parentDrawable: Drawable, offsetX: number, offsetY: number, index: number): void {
        const footprint = this.buildingType!.checkFootprint;

        const width = footprint[0].length;
        const height = footprint.length;

        for (let gridY = 0; gridY < height; gridY++) {
            for (let gridX = 0; gridX < width; gridX++) {
                const buildingTile = footprint[gridY][gridX];
                if (buildingTile === FootprintType.ALL) continue; //Building doesn't care what's in this cell. (Should be equivalent to checking if stampFootprint is EMPTY.)

                //Show compatibility with the building's footprint, not just show the city footprint where the building is non-empty
                const cellType = this.city!.getCellTypeUnderBuilding(this.x + offsetX + gridX, this.y + offsetY + gridY, this.buildingType!);
                const footprintIsCompatible = (buildingTile & cellType) !== 0;
                const imgId = footprintIsCompatible ? FootprintType[FootprintType.EMPTY] : (FootprintType[buildingTile] ? FootprintType[buildingTile] : FootprintType[FootprintType.OCCUPIED]); //If the building requires just one tile type, this should work okay, and it should otherwise show the OCCUPIED tile color.
                parentDrawable.addChild(new Drawable({
                    x: (offsetX + gridX - offsetY - gridY) * TILE_WIDTH / 2, //Taken from worldToScreenCoordinates
                    y: (offsetX + gridX + offsetY + gridY) * TILE_HEIGHT / 2 - TILE_HEIGHT, //Ditto, but an extra TILE_HEIGHT subtracted
                    width: TILE_WIDTH + "px",
                    height: TILE_HEIGHT + "px",
                    image: new TextureInfo(TILE_WIDTH, TILE_HEIGHT, "footprint/" + imgId), //TODO: should draw a meaningful image in the colorful tiles
                    fallbackColor: footprintIsCompatible ? '#00FF0077' : cellType === FootprintType.OCCUPIED ? '#FF000077' : '#FFFF0077', //TODO: other types, other colors
                    isDiamond: true,
                    id: `footprintStamp.cell.${index}.${gridX}.${gridY}`,
                }));
            }
        }
    }

    private addEffectAreaDrawable(parentDrawable: Drawable, xPos: number, yPos: number, index: number): void {
        if (this.buildingType && this.buildingType.areaIndicatorRadiusX > 0 && this.buildingType.areaIndicatorRadiusY > 0) {
            const radiusBonus = this.buildingType.getRadiusUpgradeAmount(this.city!);
            const areaIndicator = this.city!.getTilesInArea(xPos, yPos, this.buildingType.width, this.buildingType.height, this.buildingType.areaIndicatorRadiusX + radiusBonus, this.buildingType.areaIndicatorRadiusY + radiusBonus, this.buildingType.areaIndicatorRounded);
            for (const tile of areaIndicator) {
                //Skip the tiles that the building itself covers, or we can't see the footprint
                if (tile.x >= xPos && tile.x < xPos + this.buildingType.width && tile.y >= yPos && tile.y < yPos + this.buildingType.height) continue;

                parentDrawable.addChild(new Drawable({
                    x: (tile.x - tile.y - this.x + this.y) * TILE_WIDTH / 2,
                    y: (tile.x + tile.y - this.y - this.x) * TILE_HEIGHT / 2 - TILE_HEIGHT,
                    width: TILE_WIDTH + "px",
                    height: TILE_HEIGHT + "px",
                    fallbackColor: '#0000FF55',
                    isDiamond: true,
                    id: `footprintStamp.aoe.${index}.${tile.x}.${tile.y}`,
                }));
            }
        }
    }
}