import { Building } from "../game/Building.js";
import { BLOCKER_TYPES, BUILDING_TYPES, CityHall, InformationCenter } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { FootprintType } from "../game/FootprintType.js";
import { EffectType } from "../game/GridType.js";
import { CityView } from "../ui/CityView.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { FilteredImageCache } from "./FilteredImageCache.js";
import { IRenderer } from "./IRenderer.js";
import { DEVICE_PIXEL_RATIO, INVERSE_BIGGER_MOBILE_RATIO, TILE_HEIGHT, TILE_WIDTH, calculateScreenPosition, domPreloadSprites, getLatePreloadSpriteURLs, screenToWorldCoordinates, worldToScreenCoordinates } from "./RenderUtil.js";
import { TextRenderer } from "./TextRenderer.js";

const BACKGROUND_TILE_WIDTH = 8;
export class CanvasRenderer implements IRenderer {
    private ctx: CanvasRenderingContext2D;
    private windows: IHasDrawable[] = [];
    private worldCoordinateDrawables: IHasDrawable[] = [];
    private view: CityView | undefined; //Just so it's not passed around a bunch
    private sprites: Map<string, HTMLImageElement> = new Map();
    private pendingOrFailedSpriteLoads: Set<string> = new Set();
    private cameraX: number = 0;
    private cameraY: number = 0;
    private zoom: number = 1;
    private fadeBuildingsBasedOnY: boolean = false;
    private yFadeZone: number = 0;
    private postTileDrawables: { x: number, y: number, width: number, height: number, drawable: Drawable }[] = []; //A weird one... stuff I want to draw on buildings but *after* the buildings and grid tiles are drawn.
    public setVisibilityMode(fade: boolean) { this.fadeBuildingsBasedOnY = fade; }
    public getVisibilityMode() { return this.fadeBuildingsBasedOnY; }

    private textRenderer: TextRenderer;

    constructor(private canvas: HTMLCanvasElement, private filteredImageCache: FilteredImageCache) {
        this.ctx = <CanvasRenderingContext2D>canvas.getContext('2d', { preserveDrawingBuffer: true })!;
        this.textRenderer = new TextRenderer();
    }

    getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }
    
    async cloneForSnapshot(targetCanvas: HTMLCanvasElement): Promise<CanvasRenderer> {
        // Create new renderer reusing sprites and image cache so it doesn't try to load more images (they should all be loaded already)
        const clone = new CanvasRenderer(targetCanvas, this.filteredImageCache);
        clone.sprites = this.sprites;
        clone.pendingOrFailedSpriteLoads = this.pendingOrFailedSpriteLoads;
        return clone;
    }

    addWorldCoordinateDrawable(drawable: IHasDrawable): void {
        this.worldCoordinateDrawables.push(drawable);
    }

    addWindow(window: IHasDrawable): void {
        this.windows.push(window);
    }

    clearWindowsAndWorldCoordinateDrawables(): void {
        this.windows = [];
        this.worldCoordinateDrawables = [];
    }

    setCameraPosition(x: number, y: number): void {
        this.cameraX = x;
        this.cameraY = y;
    }

    setZoom(zoom: number): void {
        this.zoom = zoom;
    }

    async preloadSprites(city: City): Promise<void> {
        const sprites = await domPreloadSprites(city);
        this.sprites = new Map(sprites.filter(p => p.id !== "").map(sprite => [sprite.id, sprite.img]));
    }
    async loadMoreSprites(city: City, urls: { [key: string]: string }) {
        //Check if they're present first. Only call domPreloadSprites with the ones that aren't.
        const missingUrls = Object.fromEntries(
            Object.entries(urls).filter(([key]) => !this.sprites.has(key))
        );
        if (Object.keys(missingUrls).length) {
            Object.keys(missingUrls).forEach(imageID => this.pendingOrFailedSpriteLoads.add(imageID)); //To stop the responsive auto-load from loading player avatars
            const sprites = await domPreloadSprites(city, missingUrls);
            for (const sprite of sprites) this.sprites.set(sprite.id, sprite.img);
        }
    }
    latePreloadSprites() {
        setTimeout(async () => {
            const remainingUrls = getLatePreloadSpriteURLs();
            await this.loadMoreSprites(this.view!.city, remainingUrls);
        }, 1000);
    }

    drawCity(view: CityView, city: City, skipResize: boolean = false): void {
        this.view = view; //just so it's not passed around a bunch
        this.clear(skipResize);
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.cameraX, -this.cameraY);

        //Draw background first: just large tiles, like 8x8 buildings. Draw across the diagonal (y=x).
        for (let x = 0; x < city.width; x += BACKGROUND_TILE_WIDTH) {
            for (let y = 0; y < city.height; y += BACKGROUND_TILE_WIDTH) {
                this.drawBackgroundTile(city, x, y);
            }
        }

        if (view.drawBuildings) {
            for (const building of city.sortBuildingsIsometric()) {
                this.drawBuilding(view, city, building);
            }
        }

        if (view.drawResidentialDesirability) this.drawTiles(city, city.getResidentialDesirability, city.isRoadAdjacentAndNotRoad);
        if (view.drawLandValue) this.drawTiles(city, city.getLandValue);
        if (view.drawLuxury) this.drawTiles(city, city.getLuxury);
        if (view.drawBusiness) this.drawTiles(city, city.getBusinessDensity);
        if (view.drawPettyCrime) this.drawTiles(city, city.getNetPettyCrime);
        if (view.drawOrganizedCrime) this.drawTiles(city, city.getNetOrganizedCrime);
        if (view.drawGreenhouseGases) this.drawTiles(city, city.getGreenhouseGases);
        if (view.drawNoise) this.drawTiles(city, city.getNoise);
        if (view.drawParticulatePollution) this.drawTiles(city, city.getParticulatePollution);
        if (view.drawPoliceCoverage) this.drawTiles(city, city.getPoliceProtection);
        if (view.drawFireCoverage) this.drawTiles(city, city.getFireProtection);
        if (view.drawHealthCoverage) this.drawTiles(city, city.getHealthcare);
        if (view.drawEducation) this.drawTiles(city, city.getEducation);
        if (view.drawEfficiency) this.drawTiles(city, city.getEfficiency, (x, y) => {
            const building = city.grid[y][x];
            return building !== null && !(building instanceof CityHall || building instanceof InformationCenter || building.isRoad || !building.owned); //Buildings without a meaningful efficiency.
        });
        if (view.drawGrid) this.drawGridTiles(city);

        for (const drawable of this.postTileDrawables) { //TODO: Clean up if you can by putting the final position and size into the Drawable instead of having it relative to the building position.
            this.ctx.save();
            this.ctx.translate(drawable.x, drawable.y);
            this.renderDrawable(drawable.drawable, drawable.width, drawable.height);
            this.ctx.restore();
        }
        this.postTileDrawables.length = 0;

        this.drawWorldCoordinateDrawables(city);
        this.ctx.restore();
        this.drawWindows();

        this.filteredImageCache.advanceFrame();
    }

    private drawTiles(city: City, getter: (x: number, y: number) => number, condition?: (x: number, y: number) => boolean): void {
        for (let y = 0; y < city.height; y++) {
            for (let x = 0; x < city.width; x++) {
                if (condition && !condition.bind(city)(x, y)) continue; //Some tiles need not be drawn.
                const value = Math.max(0, Math.min(1, getter.bind(city)(x, y)));
                this.drawTile(city, x, y, this.view!.getColorString(value));
            }
        }
    }

    private drawGridTiles(city: City) {
        const drawable = new Drawable({
            width: TILE_WIDTH + "px",
            height: TILE_HEIGHT + "px",
            isDiamond: true,
        });
        for (let y = 0; y < city.height; y++) {
            for (let x = 0; x < city.width; x++) {
                const value = city.getCellType(x, y);
                drawable.image = new TextureInfo(TILE_WIDTH, TILE_HEIGHT, "footprint/" + FootprintType[value]);

                const coords = worldToScreenCoordinates(city, x, y, 1, 1, 0, true);
                drawable.x = coords.x;
                drawable.y = coords.y - TILE_HEIGHT;

                this.renderDrawable(drawable, this.ctx.canvas.width, this.ctx.canvas.height);
            }
        }
    }

    private drawTile(city: City, tileX: number, tileY: number, color: string): void {
        const { x, y } = worldToScreenCoordinates(city, tileX - 1, tileY - 1, 1, 1, 0, true);

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.fillStyle = color;
        this.renderDiamond();
        this.ctx.restore();
    }

    private calculateOpacity(baseY: number): number {
        if (!this.fadeBuildingsBasedOnY) return 1;

        if (baseY <= this.yFadeZone) return 1;
        if (baseY >= this.yFadeZone + 100) return 0;
        
        return 1 - (baseY - this.yFadeZone) / 100;
    }

    private drawBackgroundTile(city: City, tileX: number, tileY: number): void {
        const { x, y } = worldToScreenCoordinates(city, tileX, tileY, BACKGROUND_TILE_WIDTH, BACKGROUND_TILE_WIDTH, 0, true);
        //TODO: put background tiles in the city but shorten to just one or two digits for minimal waste, orrr store them in the *regions*. Though alternating through the tiles doesn't look so bad.
        let bgID = "background/grass" + ((tileX + tileY) % 2 + 1);
        if (city.regionID === "volcanic") bgID = "background/rock" + ((tileX + tileY) % 5 + 1);
        const image = this.getSprite(bgID, undefined);
        if (!image) return;
        const height = BACKGROUND_TILE_WIDTH * TILE_HEIGHT;

        this.ctx.save();
        this.ctx.translate(x, y - height);
        this.ctx.drawImage(image, 0, 0);
        this.ctx.restore();
    }

    private drawBuilding(view: CityView, city: City, building: Building): void {
        const { x, y } = calculateScreenPosition(building, city);

        const buildingImageID = "building/" + building.type + (building.variant || "");
        let img = this.getSprite(buildingImageID, undefined);
        const height = img?.height ?? (building.height * TILE_HEIGHT);
        const width = img?.width ?? (building.width * TILE_WIDTH);

        this.ctx.save();
        this.ctx.translate(x, y - height);

        if (img) {
            const opacity = this.calculateOpacity((y - this.cameraY) * this.zoom);
            if (opacity > 0) { //Makes up for efficiency loss just a bit by not drawing some buildings at all :)
                this.ctx.globalAlpha = opacity;
                this.ctx.drawImage(img, 0, 0); //The image height is variable, and so is the width
                this.ctx.globalAlpha = 1; //Reset alpha because we DO still want to see the icons--that's the most helpful part of fading the buildings, in fact.
            }
        }

        //Warnings about the building's status
        if ((!building.roadConnected && building.needsRoad) || ((!building.powerConnected || (!building.powered && !building.isNew)) && building.needsPower)) {
            const self = this;
            function drawWarning(name: string) {
                const sprite = self.sprites.get("ui/" + name);
                if (sprite) {
                    const left = (width - TILE_HEIGHT) / 2;
                    self.ctx.drawImage(sprite, left, height - TILE_HEIGHT, TILE_HEIGHT, TILE_HEIGHT);
                }
            }

            //In order of precedence
            if (!building.roadConnected && building.needsRoad) drawWarning("noroad");
            else if (!building.powerConnected && building.needsPower) drawWarning("nopower");
            else if (!building.powered && building.needsPower && !building.isNew) drawWarning("outage");
            else if (!building.watered && building.needsWater && !building.isNew) drawWarning("woutage");
        }

        let drewCollectibles = false;
        if (view.showCollectibles) {
            const resources = building.collectiblesAsDrawable(city);
            if (resources) {
                resources.x = width / 2 - TILE_HEIGHT; //Assuming these icons are twice TILE_HEIGHT x TILE_HEIGHT for now...
                resources.y = height / 2 - TILE_HEIGHT;
                this.renderDrawable(resources, width, height);
                drewCollectibles = true;
            }
        }
        if (view.showProvisioning || (view.showCollectibles && !drewCollectibles)) { //Nothing to collect -> it's okay to show the provisioning arrow even though the view doesn't say so.
            const resources = building.provisioningAsDrawable(city, view);
            if (resources) {
                resources.x = (width - TILE_HEIGHT) / 2;
                resources.y = (height - TILE_HEIGHT) / 2;
                this.renderDrawable(resources, width, height);
            }
        }
        if (view.drawBusiness && building.isResidence && city.residenceSpawner.getWillUpgrade(building)) {
            const willUpgradeIcon = new Drawable({
                anchors: ['bottom'],
                x: width / 2 - 16,
                y: height / 2 - 16,
                width: "32px",
                height: "32px",
                image: new TextureInfo(64, 64, "ui/willupgrade"),
            });
            this.postTileDrawables.push({ x: x, y: y - height, width, height, drawable: willUpgradeIcon});
        }
        if (view.drawFireCoverage && building.owned && building.getFireHazard(city) > building.getHighestEffect(city, EffectType.FireProtection)) {
            const dangerIcon = new Drawable({
                anchors: ['bottom'],
                x: width / 2 - 16,
                y: height / 2 - 16,
                width: "32px",
                height: "32px",
                image: new TextureInfo(64, 64, "ui/fire"),
            });
            this.postTileDrawables.push({ x: x, y: y - height, width, height, drawable: dangerIcon });
        }
        
        this.ctx.restore();
    }

    screenToWorldCoordinates(city: City, screenX: number, screenY: number): { x: number, y: number } {
        return screenToWorldCoordinates(city, screenX / this.zoom + this.cameraX, screenY / this.zoom + this.cameraY);
    }

    drawWorldCoordinateDrawables(city: City): void {
        for (const hasDrawable of this.worldCoordinateDrawables) {
            const drawable = hasDrawable.asDrawable();

            //Convert the topmost parent's coordinates to world coordinates. I guess we'll leave the children in relative screen coordinates.
            const sprite = ((drawable.image && this.sprites.get(drawable.image.id)) || (drawable.fallbackImage && this.sprites.get(drawable.fallbackImage.id)));
            const width = drawable.getWidth(sprite, this.ctx.canvas.width);
            const height = drawable.getHeight(sprite, this.ctx.canvas.height);
            const dimensionsAreTiles = !!drawable.tileWidth && !!drawable.tileHeight;

            const { x, y } = worldToScreenCoordinates(city, drawable.x || 0, drawable.y || 0, drawable.tileWidth ?? width, drawable.tileHeight ?? height, 0, dimensionsAreTiles);
            drawable.x = x;
            drawable.y = y - (dimensionsAreTiles ? height : 0);

            this.renderDrawable(drawable, this.ctx.canvas.width, this.ctx.canvas.height);
        }
    }

    drawWindows(): void {
        for (const window of this.windows) {
            this.renderDrawable(window.asDrawable(), this.ctx.canvas.width, this.ctx.canvas.height);
        }
        this.view?.getWindowDrawables().forEach(window => this.renderDrawable(window, this.ctx.canvas.width, this.ctx.canvas.height));
    }

    drawFPS(fps: number) {
        this.renderDrawable(new Drawable({ anchors: ["right"], x: 20, text: fps.toFixed(1) }), this.ctx.canvas.width, this.ctx.canvas.height)
    }

    getCorrectedWidth(sprite: HTMLImageElement | HTMLCanvasElement, width: number, height: number, maxRatio: number = 1): number {
        const expectedXOverY = sprite.width / sprite.height * maxRatio;
        const actualXOverY = width / height;
        if (actualXOverY > expectedXOverY) return height * expectedXOverY;
        return width;
    }

    private getSprite(imageId: string | undefined, fallbackImageId: string | undefined): HTMLImageElement | HTMLCanvasElement | undefined {
        if (!imageId) return undefined;

        let sprite: HTMLImageElement | HTMLCanvasElement | undefined = this.sprites.get(imageId) || (fallbackImageId && this.sprites.get(fallbackImageId)) || undefined;

        //Handle building sprites specifically--they have an automatic fallback system, but it requires a City reference.
        if (!sprite) {
            if (imageId.startsWith("building/")) {
                // Try size-based fallback if dimensions provided
                const buildingID = imageId.replace("building/", "").replace(/\d$/, ""); //The imageId can end with 1 digit to represent a variant; if it does, remove the digit. Also means no actual building ID can end with a digit.
                const building = BUILDING_TYPES.values().find(p => p.type === buildingID) || BLOCKER_TYPES.values().find(p => p.type === buildingID);
                if (!building) return undefined;

                // Fallback to 1x1 if there's no placeholder for those exact dimensions
                sprite = this.sprites.get(`building/unloaded${building.width}x${building.height}`) || this.sprites.get("building/unloaded1x1");
            } else if (imageId.startsWith("resource/") || imageId.startsWith("ui/") || imageId.startsWith("region/")) {
                //Simple "?" icon
                sprite = this.sprites.get("resource/generic");
            } else if (imageId.startsWith("footprint/")) { //Other footprints just default to empty for a split second--could actually make the footprints render a diamond and cache it instead of loading images.
                sprite = this.sprites.get("footprint/EMPTY");
            } else if (imageId.startsWith("tech/")) {
                sprite = this.sprites.get("tech/generic");
            } else if (imageId.startsWith("background/")) {
                //Just make a 1x1 pixel transparent image while backgrounds load
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 1;
                sprite = canvas;
            }

            // Request actual sprite load if not already pending or previously failed
            if (!this.pendingOrFailedSpriteLoads.has(imageId)) {
                this.pendingOrFailedSpriteLoads.add(imageId);
                //Debounce so the frame can render
                requestAnimationFrame(async () => {
                    await this.loadMoreSprites(this.view!.city, { [imageId!]: "assets/" + imageId.toLowerCase() + ".png" });
                    if (this.sprites.get(imageId!)) {
                        this.pendingOrFailedSpriteLoads.delete(imageId!); //Load succeeded
                        if (this.view) this.view.uiManager.frameRequested = true; //First time I've needed to request a frame from the frame renderer!
                    }
                });
            }
        }

        return sprite;
    }

    private renderDrawable(drawable: Drawable, parentWidth: number, parentHeight: number) {
        let sprite: HTMLImageElement | HTMLCanvasElement | undefined | "" = (drawable.image?.id && this.getSprite(drawable.image.id, drawable.fallbackImage?.id));

        let sumHeight: number | null = null;
        let moreLinesOfTextSprites: (HTMLImageElement | HTMLCanvasElement | undefined)[] = []; //Note: Didn't implement any of this new text stuff in the WebGL renderer (wordWrap, noXStretch, rightAlign, keepParentWidth)
        if (drawable.text) {
            if (drawable.wordWrap) {
                const wordWrapInfo = this.textRenderer.calculateWordWrap(drawable.text, "bolder 18px verdana,arial", drawable.getWidth(null, parentWidth) * (drawable.biggerOnMobile ? INVERSE_BIGGER_MOBILE_RATIO : 1)); //TODO: Cache this
                sprite = this.textRenderer.getTextTexture(wordWrapInfo.lines[0], "bolder 18px verdana,arial")?.image;
                moreLinesOfTextSprites = wordWrapInfo.lines.slice(1).map(line => this.textRenderer.getTextTexture(line, "bolder 18px verdana,arial")?.image);
            } else {
                sprite = this.textRenderer.getTextTexture(drawable.text, "bolder 18px verdana,arial")?.image; //Uses a cache, so performance worries aren't too bad!
            }
        }

        let width = drawable.getWidth(sprite, parentWidth);
        const height = drawable.getHeight(sprite, parentHeight);
        let x = drawable.getX(width, parentWidth);
        let y = drawable.getY(height, parentHeight);

        //noXStretch: Don't stretch text width more than you stretched its height
        const correctedWidth = sprite && drawable.noXStretch ? this.getCorrectedWidth(sprite, width, height) : width;
        //Right-align, e.g., for resources "x/y" the x should be right-aligned to the "/capacity"... not quite the same as anchor, as it doesn't depend on the parent, just on itself.
        if (drawable.text && sprite && drawable.rightAlign) {
            if (!drawable.anchors.includes('right')) x += width - correctedWidth;
            else if (drawable.noXStretch) x = drawable.getX(correctedWidth, parentWidth);
        } else if (sprite && drawable.rightAlign) {
            if (!drawable.anchors.includes('right')) x -= correctedWidth;
        }
        
        width = correctedWidth; //After the X positioning because if it's anchored to the right, I want to subtract the full width from the parent's right.
        if (drawable.anchors.includes('centerX')) x += parentWidth / 2; //Can't be part of getX because of the width adjustment that happens afterward for noXStretch text.
        if (drawable.centerOnOwnX) x -= width / 2;

        if (drawable.anchors.includes('selfBottom')) y -= height; //Meant for buildings in ConstructMenu mainly

        //Calculate stretch ratio based on the first line's width and drawable.getNaturalWidth if it's a text sprite with word wrap.
        const lineStretchRatio = (drawable.text && sprite && drawable.wordWrap) ? (width / height * drawable.getNaturalHeight(sprite, parentWidth) / drawable.getNaturalWidth(sprite, parentWidth)) : 1;

        this.ctx.save();
        this.ctx.translate(x, y);

        if (sprite && (sprite instanceof HTMLCanvasElement || sprite.src)) {
            this.renderSprite(drawable, sprite, width, height, parentWidth, parentHeight);
            if (moreLinesOfTextSprites.length) { //This loop is solely because of word wrap
                sumHeight = height;
                const limitedWidth = drawable.getWidth(sprite, parentWidth); //Have to recalculate width since noXStretch might have reduced the first line's width.
                for (const extraLineSprite of moreLinesOfTextSprites) {
                    let lineWidth = limitedWidth; //so the final output width isn't set to the width of the last line, but of the first line. Still kinda sloppy...and probably not needed
                    if (extraLineSprite && extraLineSprite.width) {
                        //Reapply noXStretch logic
                        //I was assuming all lines other than the final one should be justified like this: && moreLinesOfTextSprites.indexOf(extraLineSprite) === moreLinesOfTextSprites.length - 1
                        if (drawable.noXStretch) lineWidth = this.getCorrectedWidth(extraLineSprite, limitedWidth, height, lineStretchRatio);
                        this.renderSprite(drawable, extraLineSprite, lineWidth, height, parentWidth, parentHeight, sumHeight);
                    }
                    sumHeight += height;
                }
            }
        } else if (drawable.fallbackColor != "#00000000") {
            this.ctx.fillStyle = drawable.fallbackColor;
            if (drawable.isDiamond) { //Basically the same as drawTile. Not implemented in WebGLRenderer
                this.renderDiamond(width, height);
            } else {
                this.ctx.fillRect(0, 0, width * (drawable.clipWidth ?? 1), height);
            }
        }

        sumHeight ??= height; //Word wrap will set this to the total height of all lines; everything else will just set it to the height of the one and only sprite
        if ((drawable.onClick || drawable.onDrag) && width && sumHeight) this.setDrawableScreenArea(drawable, width, sumHeight);

        // Render children
        drawable.children.forEach(child => this.renderDrawable(child, drawable.keepParentWidth ? parentWidth : width, sumHeight!));

        this.ctx.restore();
    }

    //Smoothness testing (execute in devtools, then look at noise): for (let x = 0; x < 64; x++) game.city.effectGrid[63][x].push({ type: 5, multiplier: x / 64, building: undefined, dynamicCalculation: undefined, getEffect: game.city.effectGrid[0][0][0].getEffect })
    private renderDiamond(width: number = TILE_WIDTH, height: number = TILE_HEIGHT) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, halfHeight);
        this.ctx.lineTo(halfWidth, 0);
        this.ctx.lineTo(TILE_WIDTH, halfHeight);
        this.ctx.lineTo(halfWidth, TILE_HEIGHT);
        this.ctx.closePath();
        this.ctx.fill();
    }

    private renderSprite(drawable: Drawable, sprite: HTMLCanvasElement | HTMLImageElement, width: number, height: number, parentWidth: number, parentHeight: number, yOffset: number = 0) {
        if (drawable.grayscale) sprite = this.filteredImageCache.getOrCreateFilteredImage(sprite, "grayscale(1) brightness(0.75)"); //Could also improve text performance specifically by rendering in red/gray in the first place.
        else if (drawable.reddize) sprite = this.filteredImageCache.getOrCreateFilteredImage(sprite, "brightness(0.6) sepia(1) hue-rotate(-50deg) saturate(3)"); //NOT good performance, but the cache makes it better (after the first slow frame).
        if (drawable.clipWidth === undefined) this.ctx.drawImage(sprite, 0, 0 + yOffset, width, height); //Easy peasy
        else {
            //clipWidth is a ratio of the stretched-out texture's width to actually draw; mostly for progress bars. We still have to stretch the image, BUT we pull less from the source.
            //This isn't compatible with every other Drawable setting.
            const fraction = Math.max(0, Math.min(1, drawable.clipWidth));
            this.ctx.drawImage(
                sprite,
                0, 0, fraction * drawable.getNaturalWidth(sprite, parentWidth), drawable.getNaturalHeight(sprite, parentHeight),
                0, yOffset, fraction * width, height
            );
        }
        if (drawable.grayscale || drawable.reddize) this.ctx.filter = "none";
    }

    private setDrawableScreenArea(drawable: Drawable, width: number, height: number) {
        const matrix = this.ctx.getTransform();
        const topLeft = matrix.transformPoint(new DOMPoint(0, 0));
        const bottomRight = matrix.transformPoint(new DOMPoint(width, height));
        drawable.screenArea = [topLeft.x, topLeft.y, bottomRight.x, bottomRight.y];
    }

    clear(skipResize: boolean = false): void {
        if (!skipResize && this.canvas.height != this.canvas.clientHeight * DEVICE_PIXEL_RATIO) this.canvas.height = this.canvas.clientHeight * DEVICE_PIXEL_RATIO;
        if (!skipResize && this.canvas.width != this.canvas.clientWidth * DEVICE_PIXEL_RATIO) this.canvas.width = this.canvas.clientWidth * DEVICE_PIXEL_RATIO;
        this.yFadeZone = this.canvas.height * 0.7;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
