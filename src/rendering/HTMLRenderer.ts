import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { CityView } from "../ui/CityView.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IRenderer } from "./IRenderer.js";
import { calculateScreenPosition, domPreloadSprites, getLatePreloadSpriteURLs, screenToWorldCoordinates } from "./RenderUtil.js";

export class HTMLRenderer implements IRenderer {
    private container: HTMLElement;
    private buildingElements: Map<number, HTMLElement> = new Map();
    private windowElements: Map<string, HTMLElement> = new Map();
    private windows: IHasDrawable[] = [];
    private bottomBar: HTMLElement;
    private worldCoordinateDrawables: IHasDrawable[] = [];
    private worldCoordinateDrawableElements: Map<string, HTMLElement> = new Map();
    private cameraX: number = 0;
    private cameraY: number = 0;
    private zoom: number = 1;
    private fadeBuildingsBasedOnY: boolean = false;
    public setVisibilityMode(fade: boolean) { this.fadeBuildingsBasedOnY = fade; }
    public getVisibilityMode() { return this.fadeBuildingsBasedOnY; }

    constructor(container: HTMLElement) {
        this.container = container;
        this.bottomBar = document.createElement('div');
        this.bottomBar.className = 'bottom-bar';
        this.container.appendChild(this.bottomBar);
    }
    
    getCanvas(): HTMLCanvasElement | null {
        return null;
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
        await domPreloadSprites(city);
    }
    async loadMoreSprites(city: City, urls: { [key: string]: string }) { }
    latePreloadSprites() {
        setTimeout(async () => {
            const remainingUrls = getLatePreloadSpriteURLs();
            await domPreloadSprites(null!, remainingUrls);
        }, 1000);
    }

    drawCity(view: CityView, city: City): void {
        const sortedBuildings = city.buildings.sort((a, b) => (a.y + a.x) - (b.y + b.x));

        // Remove buildings that no longer exist
        for (const [id, element] of this.buildingElements) {
            if (!sortedBuildings.find(b => b.id === id)) {
                element.remove();
                this.buildingElements.delete(id);
            }
        }

        // Update or add buildings
        for (const building of sortedBuildings) {
            this.drawBuilding(city, building);
        }
        this.drawWindows();
    }

    private drawBuilding(city: City, building: Building): void {
        let element = this.buildingElements.get(building.id);
        if (!element) {
            element = document.createElement('div');
            element.className = 'building';
            this.container.appendChild(element);
            this.buildingElements.set(building.id, element);
        }

        const { x, y } = calculateScreenPosition(building, city);

        element.style.backgroundImage = `url(assets/building/${building.type.toLowerCase()}.png)`;
        element.style.left = `${x}px`;
        element.style.top = `${y - element.clientHeight}px`;
    }

    screenToWorldCoordinates(city: City, screenX: number, screenY: number): { x: number, y: number } { return screenToWorldCoordinates(city, screenX, screenY); }

    drawWorldCoordinateDrawables(): void {
        //TODO: world coordinates aren't implemented for HTMLRenderer; you'd just have to repeat the approach from drawBuilding and the math from calculateScreenPosition. I don't really care about HTMLRenderer at this point.
        this.drawDrawables(this.worldCoordinateDrawables.map(p => p.asDrawable()), this.worldCoordinateDrawableElements);
    }

    drawWindows() {
        this.drawDrawables(this.windows.map(p => p.asDrawable()), this.windowElements);
    }

    drawFPS(fps: number) {
        //this.renderDrawable(new Drawable({ anchors: ["right"], x: 20, text: fps.toFixed(1) }), this.container, new Map())
    }

    private drawDrawables(drawables: Drawable[], elementSet: Map<string, HTMLElement>) {
        // Remove elements that no longer exist, also deleting descendants on the assumption that their IDs start with the parent window ID plus a dot.
        for (const [id, element] of elementSet) {
            if (!this.containsId(drawables, id)) {
                element.remove();
                elementSet.delete(id);
            }
        }

        for (const drawable of drawables) {
            this.renderDrawable(drawable, this.container, elementSet);
        }
    }

    private containsId(windows: Drawable[], id: string): boolean {
        return windows.some(b => b.id === id) || windows.some(p => this.containsId(p.children, id));
    }

    private renderDrawable(drawable: Drawable, parentElement: HTMLElement, elementSet: Map<string, HTMLElement>) {
        let element = elementSet.get(drawable.id!);
        const isNew = !element;
        if (!element) {
            element = document.createElement('div');
            element.style.position = 'absolute';
            elementSet.set(drawable.id!, element);
        }

        if (drawable.anchors.includes("right")) element.style.right = `${drawable.x ?? 0}px`; else element.style.left = `${drawable.x ?? 0}px`;
        if (drawable.anchors.includes("bottom")) element.style.bottom = `${drawable.y ?? 0}px`; else element.style.top = `${drawable.y ?? 0}px`;
        element.style.width = drawable.width ?? '';
        element.style.height = drawable.height ?? '';
        element.style.backgroundImage = drawable.image?.filename ? `url(${drawable.image.filename})` : drawable.fallbackImage?.filename ? `url(${drawable.fallbackImage.filename})` : '';
        element.style.backgroundColor = drawable.fallbackColor;
        element.classList.add(...drawable.cssClasses);

        //TODO: implement borderImages

        // Render children
        drawable.children.forEach(child => this.renderDrawable(child, element!, elementSet));

        if (isNew) parentElement.appendChild(element);
    }
    
    clear(): void {
        // This method is empty, as we maintain DOM elements
    }
}
