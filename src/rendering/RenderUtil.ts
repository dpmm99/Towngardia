import { Building } from "../game/Building.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { BLOCKER_TYPES, BUILDING_TYPES } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { FootprintType } from "../game/FootprintType.js";

const TILE_WIDTH : number = 64;
const TILE_HEIGHT: number = 32;
const DEVICE_PIXEL_RATIO: number = ((globalThis.devicePixelRatio || 1) + 1) / 2;
const INVERSE_DEVICE_PIXEL_RATIO: number = 1 / DEVICE_PIXEL_RATIO;
const BIGGER_MOBILE_RATIO: number = (globalThis.devicePixelRatio === 1 ? 1 :
    (/iPad|iPhone|iPod/.test(globalThis.navigator?.platform ?? "") || (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator.maxTouchPoints > 1)) ? 1.45 //iPhones with their nonstandard jank make the text way too big. Friend still has an iPhone 11.
        : 1.8);
const INVERSE_BIGGER_MOBILE_RATIO: number = 1 / BIGGER_MOBILE_RATIO;
export { TILE_WIDTH, TILE_HEIGHT, DEVICE_PIXEL_RATIO, INVERSE_DEVICE_PIXEL_RATIO, BIGGER_MOBILE_RATIO, INVERSE_BIGGER_MOBILE_RATIO };

//Gives you the BOTTOM left corner of the building
export function calculateScreenPosition(building: Building, city: City): { x: number, y: number } {
    return worldToScreenCoordinates(city, building.x, building.y, building.width, building.height, building.xDrawOffset, true);
}

export function worldToScreenCoordinates(city: City, x: number, y: number, width: number, height: number, xDrawOffset: number = 0, dimensionsInTiles: boolean = false): { x: number, y: number } {
    const baseX = (x - y) * TILE_WIDTH / 2;
    const baseY = (x + y) * TILE_HEIGHT / 2;

    const cityOffsetX = (city.width + city.height) * TILE_WIDTH / 4;
    const offsetX = dimensionsInTiles ? (height - 1) * TILE_WIDTH / 2 : 0;
    const offsetY = dimensionsInTiles ? (width - 1) * -TILE_HEIGHT + (width - height) * TILE_HEIGHT / 2 : height;

    return {
        x: baseX + cityOffsetX + xDrawOffset - offsetX,
        y: baseY - offsetY
    };
}

//Roughly reverse the math of calculateScreenPosition to get a world coordinate from a screen coordinate. Not rounded to the nearest tile. Doesn't consider presence of actual buildings (e.g., skyscrapers). Only gets you the ground-level tile position.
export function screenToWorldCoordinates(city: City, x: number, y: number): { x: number, y: number } {
    const cityOffsetX = (city.width + city.height) * TILE_WIDTH / 4;
    const baseX = x - cityOffsetX;
    const tileX = (baseX * 2 / TILE_WIDTH + y * 2 / TILE_HEIGHT) / 2;
    const tileY = (y * 2 / TILE_HEIGHT - baseX * 2 / TILE_WIDTH) / 2;
    return {
        x: tileX,
        y: tileY
    };
}

function getBuildingCategoryNames(): string[] {
    return Object.keys(BuildingCategory).filter(key => isNaN(Number(key)));
}

function getFootprintTypeNames(): string[] {
    return Object.keys(FootprintType).filter(key => isNaN(Number(key)));
}

export function getInUseSpriteURLs(city: City): { [key: string]: string } {
    const urls: { [key: string]: string } = {};
    //for (const buildingType of [...BUILDING_TYPES.values(), ...BLOCKER_TYPES.values()]) {
    //    urls["building/" + buildingType.type] = `assets/building/${buildingType.type.toLowerCase()}.png`;
    //    //Variants are optional; the default one (above) never has a number appended.
    //    for (let i = 1; i <= buildingType.maxVariant; i++) {
    //        urls["building/" + buildingType.type + i] = `assets/building/${buildingType.type.toLowerCase()}${i}.png`;
    //    }
    //}

    //Like that, except only look at PLACED buildings, and distinctify them first. Saves us a lot of time in small cities AND we never have to load out-of-region buildings or variants.
    const buildingTypes = new Set<string>(['unloaded1x1', 'unloaded2x2', 'unloaded3x3', 'unloaded4x4', 'unloaded2x3', 'unloaded3x2', 'unloaded1x2', 'unloaded2x1']);
    for (const building of city.buildings.values()) {
        buildingTypes.add(building.type + (building.variant || "")); //Include only the in-use variants; the default one (above) never has a number appended.
    }
    
    for (const building of buildingTypes) {
        urls["building/" + building] = `assets/building/${building.toLowerCase()}.png`;
    }

    for (const category of getBuildingCategoryNames()) {
        urls["category/" + category] = `assets/category/${category.toLowerCase()}.png`;
    }

    urls["footprint/EMPTY"] = "assets/footprint/empty.png"; //Instead of loading all footprints, just load one up-front to use as a fallback, and the others can be loaded when needed.
    for (const resource of [...city.resources.values()]
        .filter(p => p.capacity > 0 || p.isSpecial)) { //Tentatively, only preloading resources that the city HAS. Others will be loaded on demand.
        urls["resource/" + resource.type] = `assets/resource/${resource.type}.png`;
    }
    urls["achievements/generic"] = "assets/achievements/generic.png";
    urls["titles/generic"] = "assets/titles/generic.png";
    urls["resource/power"] = "assets/resource/power.png";
    urls["resource/weight"] = "assets/resource/weight.png";
    urls["resource/generic"] = "assets/resource/generic.png";

    //No longer loading all UI elements up front. Here's a narrowed down list--just the things that are visible as soon as you start the game... aaand some warnings and resource and danger backdrops because the placeholders would look really out-of-place.
    const otherSprites = [
        'friends', 'research', 'notifications', 'notificationson', 'titles', 'achievements', 'views', 'budget', 'resources', 'menu', 'progressbg', 'progressfg',
        'noroad', 'nopower', 'outage', 'woutage', 'warningbackdrop', 'collectionbackdrop', 'milestones',
    ];

    for (const sprite of otherSprites) {
        urls["ui/" + sprite] = `assets/ui/${sprite}.png`;
    }
    if (city.tutorialStepIndex !== -1 && !city.player?.finishedTutorial) urls["ui/majorsalience"] = `assets/ui/majorsalience.png`;

    //Techs are loaded when opening the tech tree menu, other than this one (it takes a moment to load and redraw upon opening the window the first time).
    urls["tech/generic"] = "assets/tech/generic.png";

    //TODO: Move these to the regions, or just use region ID + the Region needs a number for how many background tiles there are for that region. Definitely don't want to load them all up-front.
    //Only load the background for your city's region
    const backgroundImages = city.regionID === "plains" ? ['grass1', 'grass2'] : city.regionID === "volcanic" ? ['rock1', 'rock2', 'rock3', 'rock4', 'rock5'] : [];
    for (const bg of backgroundImages) urls["background/" + bg] = `assets/background/${bg}.png`;
    //for (const region of ['plains', 'volcanic']) { //Not referencing REGIONS directly because Webpack won't find an appropriate order for the imports.
    //    urls["region/" + region] = `assets/region/${region}.png`;
    //}

    //Exception for files we KNOW aren't available yet, to save some unnecessary 404s.
    delete urls["category/BLOCKER"];
    delete urls["category/NATURAL_RESOURCE"];
    delete urls["resource/crime"];
    delete urls["resource/education"];
    delete urls["resource/foodsufficiency"];
    delete urls["resource/foodsatisfaction"];
    delete urls["resource/foodhealth"];
    delete urls["resource/health"];
    delete urls["resource/greenhousegases"];
    delete urls["resource/prodeff"];
    delete urls["resource/untappedpatronage"];
    delete urls["resource/doebonus"];
    delete urls["resource/elbonus"];
    delete urls["resource/timeslips"];
    delete urls["resource/powercosts"];
    delete urls["resource/miniresearch"];
    delete urls["resource/friendresearch"];

    return urls;
}

export function getLatePreloadSpriteURLs(): { [key: string]: string } {
    const urls: { [key: string]: string } = {};

    const otherSprites = [
        /*right bar*/ 'addfriend', 'newcity', 'provisionview', 'memorymixology', 'slots', 'starbox', 'monobrynth', 'neponet', 'gift',
        /*AchievementsMenu*/ 'title1', 'title2', 'title3', //TODO: Rename if you actually use them; must match achievement/title names
        /*top bar*/ 'diet', 'foodsufficiency', 'foodsatisfaction', 'foodhealth',
        /*resource bar*/ 'tradesettingson', 'tradesettingsoff', 'autobuyhandle', 'autosellhandle', 'arrowleft', 'arrowright',
        /*ConstructMenu*/ 'ok', 'x',
        /*ContextMenu*/ 'info', 'move', 'remove', 'demolish', 'demolishnobg', 'buildcopy', 'switch', 'switchnobg', 'fastforward', 'fastforwardnobg', 'altitect', 'appealestate',
        /*BudgetMenu*/ 'incometax', 'propertytax', 'salestax', 'budgetok', "fireprotection", "policeprotection", "healthcare", "education", "environment", "infrastructure", //Services might be resources, dunno
        /*TechTreeMenu*/ 'completeresearch', 'progressresearch', 'cannotresearch', 'adoptionrate',
        /*NotificationsMenu*/ 'unread', 'notice', 'advisor', 'logistics', 'minigames', 'depro',
        /*Events (could be automatic/generic)*/ 'coldsnap', 'blackout', 'epidemic',
        /*Views bar*/ 'residentialdesirability', 'landvalue', 'luxury', 'businesspresence', 'pettycrime', 'organizedcrime', 'noise', 'particulatepollution', 'greenhousegases', 'placementgrid', 'efficiencyview', 'hidebuildings', 'fadebuildings', 'businessvalue', //Others Copilot spat out, some of which I likely do want: 'firehazard', 'healthhazard', 'unemployment', 'traffic', 'infrastructure', 'happiness', 'population'
        /*errors and view-specific icons on any building*/ 'fire', 'provision', 'cannotprovision', 'reopen', 'errorbackdrop', 'resourceborder', 'willupgrade', 'publictransport',
        /*Multiple minigames*/ 'checked', 'unchecked',
    ];

    for (const sprite of otherSprites) {
        urls["ui/" + sprite] = `assets/ui/${sprite}.png`;
    }

    for (const footprintType of getFootprintTypeNames()) {
        urls["footprint/" + footprintType] = `assets/footprint/${footprintType.toLowerCase()}.png`;
    }
    delete urls["footprint/EMPTY"]; //Leave out EMPTY because we preloaded it earlier.
    delete urls["footprint/ALL"];
    delete urls["footprint/MUST_BE_ON"];

    return urls;
}

export async function domPreloadSprites(city: City, urls: { [key: string]: string } = getInUseSpriteURLs(city)): Promise<{ id: string, img: HTMLImageElement }[]> {
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.display = 'none';
    document.body.appendChild(hiddenContainer);

    // Create an array of promises for loading all images
    const loadImage = (key: string, url: string): Promise<{ id: string, img: HTMLImageElement }> => {
        return new Promise((resolve, reject) => {
            const img = document.createElement('img');
            img.src = url;
            img.onload = () => {
                // Clean up after loading
                img.onload = null; // Remove the onload handler
                hiddenContainer.removeChild(img); // Remove from DOM
                resolve({ id: key, img });
            };
            img.onerror = () => {
                // Clean up and handle error
                img.onerror = null; // Remove the onerror handler
                hiddenContainer.removeChild(img); // Remove from DOM
                console.error(`Failed to load image at ${url}`);
                resolve({ id: "", img });
            };
            hiddenContainer.appendChild(img); // Append to hidden container
        });
    };

    // Create an array of promises to load all images
    const loadPromises = Object.entries(urls).filter(([key, url]) => url).map(([key, url]) => loadImage(key, url));

    // Wait for all images to be loaded
    return await Promise.all(loadPromises);
}

export function cssDimToPixels(dim: string | undefined, canvasDim: number, calcBiggerOnMobile = false, isCalc = false): number | null {
    if (dim === undefined || dim === null) return null;
    if (dim.endsWith("px")) return parseInt(dim.replace("px", "")) * (isCalc && calcBiggerOnMobile ? BIGGER_MOBILE_RATIO : 1);
    if (dim.endsWith("%")) return canvasDim * parseInt(dim.replace("%", "")) / 100;
    if (dim.startsWith("calc")) { //Split "calc(a + b)" or "calc(a - b)" where a or b can be a % or px number. It will ONLY have two parts.
        const parts = dim.trimEnd().slice(4, -1).replace("(", "").split(/\+|-/).map(p => p.trim());
        if (dim.includes('-')) return (cssDimToPixels(parts[0], canvasDim, calcBiggerOnMobile, true) ?? 0) - (cssDimToPixels(parts[1], canvasDim, calcBiggerOnMobile, true) ?? 0);
        return (cssDimToPixels(parts[0], canvasDim, calcBiggerOnMobile, true) ?? 0) + (cssDimToPixels(parts[1], canvasDim, calcBiggerOnMobile, true) ?? 0);
    }
    if (dim.startsWith("min")) { //Works just like calc() except picking whichever side is smaller. Also only allows ONE comma to appear inside it--can't nest like min(min(5,7), min(3,4)).
        const parts = dim.trimEnd().slice(3, -1).replace("(", "").split(',').map(p => p.trim());
        return Math.min(cssDimToPixels(parts[0], canvasDim, calcBiggerOnMobile, true) ?? 0, cssDimToPixels(parts[1], canvasDim, calcBiggerOnMobile, true) ?? 0);
    }
    if (dim.startsWith("max")) { //Same. In fact, almost identical code to 'min'.
        const parts = dim.trimEnd().slice(3, -1).replace("(", "").split(',').map(p => p.trim());
        return Math.max(cssDimToPixels(parts[0], canvasDim, calcBiggerOnMobile, true) ?? 0, cssDimToPixels(parts[1], canvasDim, calcBiggerOnMobile, true) ?? 0);
    }
    return parseInt(dim);
}

export function hexToRgb(hex: string): Float32Array {
    let r: number, g: number, b: number, a: number = 255;
    const bigint = parseInt(hex.slice(1), 16);
    if (hex.length === 7) { // #RRGGBB format
        r = (bigint >> 16) & 255;
        g = (bigint >> 8) & 255;
        b = bigint & 255;
    } else if (hex.length === 9) { // #RRGGBBAA format
        r = (bigint >> 24) & 255;
        g = (bigint >> 16) & 255;
        b = (bigint >> 8) & 255;
        a = bigint & 255;
    } else {
        throw new Error('Invalid hex color format');
    }

    return new Float32Array([r / 255, g / 255, b / 255, a / 255]);
}
