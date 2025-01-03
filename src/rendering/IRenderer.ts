import { City } from "../game/City.js";
import { CityView } from "../ui/CityView.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";

export interface IRenderer {
    setVisibilityMode(fade: boolean): void;
    getVisibilityMode(): boolean;
    getCanvas(): HTMLCanvasElement | null;
    preloadSprites(city: City): Promise<void>;
    latePreloadSprites(): void;
    addWindow(window: IHasDrawable): void;
    setCameraPosition(x: number, y: number): void;
    screenToWorldCoordinates(city: City, screenX: number, screenY: number): { x: number, y: number };
    addWorldCoordinateDrawable(drawable: IHasDrawable): void;
    setZoom(zoom: number): void;
    drawCity(view: CityView, city: City): void;
    drawWorldCoordinateDrawables(city: City): void;
    drawWindows(): void;
    drawFPS(fps: number): void;
    clear(): void;
    clearWindowsAndWorldCoordinateDrawables(): void;
    loadMoreSprites(city: City, urls: { [key: string]: string }): Promise<void>;
}
