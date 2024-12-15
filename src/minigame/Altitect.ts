import { City } from "../game/City.js";
import { UIManager } from "../ui/UIManager.js";
import { Flunds, PracticeRuns, getResourceType } from "../game/ResourceTypes.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { Drawable } from "../ui/Drawable.js";
import { addResourceCosts, humanizeFloor } from "../ui/UIUtil.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { GameState } from "../game/GameState.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { OnePracticeRun, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";
import { EffectType } from "../game/GridType.js";
import { Building, BuildingMod, BuildingModEffectType } from "../game/Building.js";

const FLOOR_WIDTH = 8;
const GAME_DURATION = 120; // seconds
const TRASH_CAN_COST = 3; // seconds
const BASE_FUNDS = 5000;
const FUNDS_VARIATION = 500;
const BASE_POWER = 500;
const POWER_VARIATION = 50;
const BASE_WATER = 250;
const WATER_VARIATION = 15;
const BASE_WEIGHT = 600;
const WEIGHT_VARIATION = 60;
const WEIGHT_THRESHOLD_1 = 0.3;
const WEIGHT_THRESHOLD_2 = 0.6;
const WEIGHT_THRESHOLD_3 = 0.9;
const SELECTOR_ROOM_COUNT = 5;
const TILE_SIZE = 64; // Assuming a tile size of 64px for drawing

class Room {
    constructor(public id: string, //for drawing
        public displayName: string,
        public size: number,
        public cost: number, public power: number, public water: number, public weight: number, public effects: BuildingMod[],
        public appearanceRate: number = 10, //Weighted chance of this room type appearing in the currentRoomTypes selector
        public immovable: boolean = false,
        public x: number = -1 //integer. -1 for unplaced rooms
    ) {
    }
    clone(withX?: number | undefined): Room {
        return new Room(this.id, this.displayName, this.size, this.cost, this.power, this.water, this.weight, this.effects, this.appearanceRate, this.immovable, withX ?? this.x);
    }
}

interface FloorState {
    rooms: Room[];
}

interface TowerState {
    flunds: number;
    maxFlunds: number;
    power: number;
    maxPower: number;
    water: number;
    maxWater: number;
    weight: number;
    maxWeight: number;
    weightThresholds: number[];
    currentFloor: number;
    floors: FloorState[]; //has 1 entry at the start; a new one is added each time the player completely fills a floor
    selectedRoom: Room | null;
    currentRoomTypes: Room[];
    nextRoomTypes: Room[];
    drawOffset: number; //for use when scrolling the floor up after the player completes the current floor. Player can't edit the completed floor while scrolling.
}

const effectTypeIconMap = new Map<BuildingModEffectType, string>([[EffectType.PoliceProtection, "ui/policeprotection"], [EffectType.Luxury, "ui/luxury"], [EffectType.Noise, "ui/noise"],
    [EffectType.BusinessPresence, "ui/businesspresence"], [EffectType.FireHazard, "ui/fire"], [EffectType.Education, "ui/education"], [EffectType.Healthcare, "ui/healthcare"],
    ["research", "resource/research"], ["population", "resource/population"],
    ["storage", "ui/resources"]]);
const effectTextMap = new Map<BuildingModEffectType, (magnitude: number) => string>([
    [EffectType.PoliceProtection, (m) => `+${Math.round(m * 100) / 100} police protection`],
    [EffectType.Luxury, (m) => `+${Math.round(m * 100) / 100} luxury`],
    [EffectType.Noise, (m) => `+${Math.round(m * 100) / 100} noise`],
    [EffectType.BusinessPresence, (m) => `+${Math.round(m * 100) / 100} business presence`],
    [EffectType.FireHazard, (m) => `${Math.round(m * 100) / 100} fire hazard`], //Already negative
    [EffectType.Education, (m) => `+${Math.round(m * 100) / 100} education`],
    [EffectType.Healthcare, (m) => `+${Math.round(m * 100) / 100} healthcare`],
    ["research", (m) => `+${Math.round(m * 100) / 100} research/day`],
    ["population", (m) => `${m >= 0 ? "+" : ""}${humanizeFloor(m)} population`],
    ["storage", (m) => `+${Math.round(m * 100) / 100} storage (misc)`],
]);
function effectTypeToStringForSort(type: BuildingModEffectType): string {
    return typeof type === 'string' ? type : EffectType[type].toLocaleLowerCase();
}

export class Altitect implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: BuildingMod[] | null = null;
    private timer: number = GAME_DURATION;
    private timerTimeout: NodeJS.Timeout | null = null;
    private animateTimeout: NodeJS.Timeout | null = null;
    private towerState: TowerState | null = null;
    private selectedRoom: Room | null = null;
    private preloaded: boolean = false;
    private userInputLocked: boolean = false;
    private building: Building | null = null;
    private endReason: string = "";
    private deciding: boolean = false;
    private isPractice: boolean = false;

    // Define room types here
    private readonly SupportPillar: Room = new Room("pillar", "Support Pillar", 1, 0, 0, 0, 0, [], 0, true);
    private readonly Hallway: Room = new Room("hallway", "Hallway", 1, 20, 0, 0, 1, [], 4);
    private readonly RoomTypes: Room[] = [
        new Room("lab",             "Lab",              4, 250,  30,  8, 25, [{ type: "research", magnitude: 0.03 }, { type: "population", magnitude: 2 }], 3),
        new Room("suite",           "Luxury Suite",     3, 130,  12, 15, 12, [{ type: EffectType.Luxury, magnitude: 0.03 }, { type: "population", magnitude: 6 }], 8),
        new Room("store",           "Retail Outlet",    3, 145,  15, 10, 15, [{ type: EffectType.BusinessPresence, magnitude: 0.05 }, { type: "population", magnitude: 3 }]),
        new Room("office",          "Office",           3, 215,  20, 10, 15, [{ type: EffectType.BusinessPresence, magnitude: 0.07 }, { type: "population", magnitude: 4 }], 8),
        new Room("restaurant",      "Restaurant",       3, 110,  17, 20, 15, [{ type: EffectType.BusinessPresence, magnitude: 0.05 }, { type: "population", magnitude: 3 }], 7),
        new Room("gym",             "Gym",              3, 190,  16,  3, 15, [{ type: EffectType.Luxury, magnitude: 0.05 }, { type: EffectType.Healthcare, magnitude: 0.04 }], 6),
        new Room("recroom",         "Rec Room",         3, 230,  22,  3, 20, [{ type: EffectType.Luxury, magnitude: 0.08 }], 5), //A very good thing
        new Room("securityroom",    "Security Room",    3, 170,  25,  0,  5, [{ type: EffectType.PoliceProtection, magnitude: 0.1 }], 5),
        new Room("apartment",       "Flat",             2, 100,  10, 10, 10, [{ type: "population", magnitude: 5 }]), //Everything will be balanced around this being the "average" room
        new Room("warehouse",       "Warehouse",        2,  80,   6,  0, 20, [{ type: "storage", magnitude: 1 }], 8),
        new Room("library",         "Library",          2, 155,   8,  1, 20, [{ type: EffectType.Education, magnitude: 0.08 }], 6),
        new Room("sprinkler",       "Sprinkler System", 2,  90,   1, 10,  5, [{ type: EffectType.FireHazard, magnitude: -0.05 }], 6),
        new Room("boilerroom",      "Boiler Room",      2, 135, -10,  0, 10, [], 6), //Just free power, but you probably won't ever be low on power
        new Room("maintenanceroom", "Maintenance Room", 2,  70,   4,  0, 10, [{ type: EffectType.Noise, magnitude: 0.05 }], 5), //A bad thing //TODO: could recover up to 4% damage a day or something (not 4% OF damage, 4% of total)
        new Room("fireescape",      "Fire Escape",      1,  45,   1,  0,  2, [{ type: EffectType.FireHazard, magnitude: -0.03 }], 8), //Usually not a helpful thing
        new Room("reservoir",       "Reservoir",        1,  85,   1, -5, 15, [{ type: EffectType.FireHazard, magnitude: -0.07 }], 5),
        new Room("restroom",        "Restroom",         1,  40,   1,  5,  2, [{ type: EffectType.Luxury, magnitude: 0.02 }]),
        new Room("closet",          "Closet",           1,  15,   0,  0,  2, [{ type: "storage", magnitude: 0.2 }]),
        this.SupportPillar,
        this.Hallway,
    ]; //For consideration: Secret Stash (+organized crime but costs negative flunds)

    constructor(private city: City, private uiManager: UIManager, private game: GameState) { }

    private getCosts(): { type: string, amount: number }[] {
        return this.isPractice ? OnePracticeRun : [{ type: getResourceType(Flunds), amount: Math.min(25000, 1000 + 1000 * this.city.altitectPlays) }];
    }

    private initializeGame(): void {
        this.timer = GAME_DURATION;
        this.gameStarted = true;
        this.userInputLocked = false;
        this.towerState = this.generateInitialTowerState();
        this.towerState.floors.push(this.generateFloor());
        this.selectedRoom = null;
        this.endReason = "";
        this.selectRandomRoomTypes();
        this.startTimer();
    }

    onResize(): void {
        this.scroller.onResize();
    }

    private startTimer(): void {
        this.timerTimeout = setTimeout(() => {
            if (!this.gameStarted) return;
            this.timer--;
            if (this.timer <= 0) {
                this.endReason = "Time's up!";
                this.endGame();
            } else {
                this.startTimer();
            }
            this.uiManager.frameRequested = true;
        }, 1000);
    }

    private generateInitialTowerState(): TowerState {
        const maxFunds = BASE_FUNDS + Math.floor(Math.random() * FUNDS_VARIATION);
        const maxPower = BASE_POWER + Math.floor(Math.random() * POWER_VARIATION);
        const maxWater = BASE_WATER + Math.floor(Math.random() * WATER_VARIATION);
        const maxWeight = BASE_WEIGHT + Math.floor(Math.random() * WEIGHT_VARIATION);
        const weightThresholds = [
            maxWeight * WEIGHT_THRESHOLD_1,
            maxWeight * WEIGHT_THRESHOLD_2,
            maxWeight * WEIGHT_THRESHOLD_3
        ];

        return {
            flunds: maxFunds,
            maxFlunds: maxFunds,
            power: maxPower,
            maxPower: maxPower,
            water: maxWater,
            maxWater: maxWater,
            weight: 0,
            maxWeight: maxWeight,
            weightThresholds: weightThresholds,
            currentFloor: 0,
            floors: [],
            selectedRoom: null,
            currentRoomTypes: [],
            nextRoomTypes: [],
            drawOffset: 0,
        };
    }

    private generateFloor(): FloorState {
        return {
            rooms: this.generateSupportPillars().map(p => this.SupportPillar.clone(p)),
        };
    }

    private generateSupportPillars(): number[] {
        const supportPillars: number[] = [];
        if (this.towerState!.weight < this.towerState!.weightThresholds[0]) { //Randomly in the middle 50%
            supportPillars.push(Math.floor(Math.random() * FLOOR_WIDTH / 2) + Math.floor(FLOOR_WIDTH / 4));
        } else if (this.towerState!.weight < this.towerState!.weightThresholds[1]) { //Two, randomly anywhere except the edges and not adjacent to each other
            const left = Math.floor(Math.random() * (FLOOR_WIDTH - 2)) + 1;
            let right = left;
            while (Math.abs(left - right) < 2) right = Math.floor(Math.random() * (FLOOR_WIDTH - 2)) + 1;
            supportPillars.push(left, right);
        } else if (this.towerState!.weight < this.towerState!.weightThresholds[2]) { //One in each third
            const third1 = Math.floor(FLOOR_WIDTH / 3);
            const third2 = Math.floor(2 * FLOOR_WIDTH / 3);
            const left = Math.floor(Math.random() * third1);
            let middle = left;
            while (middle === left) middle = Math.floor(third1 + Math.random() * third1);
            let right = middle;
            while (right === middle) right = Math.floor(third2 + Math.random() * third1);
            supportPillars.push(left, middle, right);
        } else { //Two in each half
            const half = Math.floor(FLOOR_WIDTH / 2);
            const left1 = Math.floor(Math.random() * half);
            let left2 = left1;
            while (left2 === left1) left2 = Math.floor(Math.random() * half);
            const right1 = Math.floor(half + Math.random() * half);
            let right2 = right1;
            while (right2 === right1) right2 = Math.floor(half + Math.random() * half);
            supportPillars.push(left1, left2, right1, right2);
        }

        return supportPillars;
    }

    public startGame(): void {
        if (this.building && this.building.x !== -1 && this.city.checkAndSpendResources(this.getCosts())) {
            this.initializeGame();
            this.city.altitectPlays++;
            this.city.updateLastUserActionTime();
            this.game.fullSave();
        }
    }

    public show(building: Building | null = null): void {
        this.building = building;
        //Show the effects that you applied to the building the last time you played for THAT specific building.
        this.winnings = building?.mods.map(p => ({ type: p.type, magnitude: p.magnitude })) ?? null; //cloning just in case I modify them somewhere, which I don't plan to
        this.shown = true;
    }

    public hide(): void {
        this.shown = false;
        this.clearTimers();
    }

    public isShown(): boolean {
        return this.shown;
    }

    public isPlaying(): boolean { return this.shown && this.gameStarted; }

    private clearTimers() {
        if (this.timerTimeout) {
            clearTimeout(this.timerTimeout);
            this.timerTimeout = null;
        }
        if (this.animateTimeout) {
            clearTimeout(this.animateTimeout);
            this.animateTimeout = null;
        }
    }

    private endGame(): void {
        this.clearTimers();

        this.calculateWinnings();
        if (!this.deciding) this.returnToStartScreen();
    }

    private returnToStartScreen(): void {
        this.city.updateLastUserActionTime();
        this.game.fullSave();
        this.userInputLocked = true;
        setTimeout(() => { this.gameStarted = false; }, 1000);
    }

    private calculateWinnings(): void {
        if (!this.towerState) return;

        this.selectedRoom = null; //or else How To Play will show a highlight square
        if (this.isPractice) {
            this.winnings = [];
            return;
        }

        //Aggregate the effects by type
        const winnings = this.towerState.floors.flatMap(p => p.rooms).flatMap(p => p.effects)
            .reduce((totals, effect) => totals.set(effect.type, (totals.get(effect.type) ?? 0) + effect.magnitude), new Map<BuildingModEffectType, number>());
        this.winnings = [...winnings.entries()].map(p => ({ type: p[0], magnitude: p[1] }));

        //Let the player pick between the existing mods and the new mods, if they've played before for the same Skyscraper.
        if (this.building?.mods?.length && this.winnings.length) this.deciding = true;
        else if (this.winnings.length) this.building?.applyMods(this.city, this.winnings);

        //Calculate a score based on remaining amounts of resources and time. Best case might be like... 0 seconds, 550~650 weight, and 75~150 of each resource left. 550 - 50 - 100 - 75*1.5 + 0*4 = 287.5, so I set 300 to the max research points.
        const optionScore = Math.floor(this.towerState.weight - this.towerState.flunds / 3 - this.towerState.power - this.towerState.water * 1.5 + this.timer * 4);
        progressMinigameOptionResearch(this.city, rangeMapLinear(optionScore, 0.01, 0.1, 0, 300, 0.001));
    }

    public handleRoomClick(room: Room): void { //Clicked on a placed room or an unplaced room type in the 'currentRoomTypes' selector
        if (!this.gameStarted || !this.towerState || this.userInputLocked) return;

        if (this.selectedRoom === room) {
            this.selectedRoom = null;
        } else {
            this.selectedRoom = room;
        }
    }

    public handleFloorClick(x: number): void {
        if (!this.gameStarted || !this.towerState || this.userInputLocked || !this.selectedRoom || this.selectedRoom.immovable) return;

        const room = this.selectedRoom;
        const floor = this.towerState.floors[this.towerState.currentFloor];
        const canPlace = this.canPlaceRoom(floor, x, room); //Try to place centered on the clicked tile
        if (canPlace.can) {
            if (!this.towerState.currentRoomTypes.includes(room)) { //Was already placed; we just moved it
                room.x = canPlace.at;
                return;
            }
            this.placeRoom(floor, canPlace.at, room);
        }
    }

    private isAffordable(room: Room): boolean {
        if (!this.towerState) return false;
        return this.towerState.flunds >= room.cost &&
            this.towerState.power >= room.power &&
            this.towerState.water >= room.water &&
            this.towerState.weight + room.weight <= this.towerState.maxWeight;
    }

    private canPlaceRoom(floor: FloorState, x: number, room: Room): { can: boolean, at: number } {
        if (!this.towerState) return { can: false, at: x };

        //If truly adding a room, not just moving an already-placed room, check if it's affordable
        if (room.x === -1 && !this.isAffordable(room)) return { can: false, at: x };

        // Check if room placement overlaps with existing rooms or is out-of-bounds, ignoring the room itself if it's just being moved
        let positionOK = true;
        const xIfCentered = x - Math.floor(room.size / 2);
        if (xIfCentered >= 0) { //Given position could be negative depending on implementation details
            for (let i = xIfCentered; i < xIfCentered + room.size; i++) {
                if (i >= FLOOR_WIDTH || floor.rooms.some(r => r !== room && i >= r.x && i < r.x + r.size)) {
                    positionOK = false;
                    break;
                }
            }
            if (positionOK) { //Exact user-given position is valid
                return { can: true, at: xIfCentered };
            }
        } else positionOK = false; //Out of bounds on the left side

        // Align to edge of nearest room if exact given position is invalid
        const nearestWallOnLeft = floor.rooms.filter(r => r !== room && r.x < x).sort((a, b) => b.x - a.x)[0];
        const nearestWallOnRight = floor.rooms.filter(r => r !== room && r.x + r.size >= x).sort((a, b) => a.x - b.x)[0];
        const positionsToTry = [(nearestWallOnRight ? nearestWallOnRight.x : FLOOR_WIDTH) - room.size,
            nearestWallOnLeft ? nearestWallOnLeft.x + nearestWallOnLeft.size : 0]
            .sort((a, b) => Math.abs(a - x) - Math.abs(b - x)); //Sort those by whichever position is closest to the given x--we prefer to move less rather than more
        for (const p of positionsToTry.filter(p => p >= 0 && Math.abs(p - x) < 3)) { //Can only shift 2 tiles at most.
            positionOK = true;
            for (let i = p; i < p + room.size; i++) {
                if (i >= FLOOR_WIDTH || floor.rooms.some(r => r !== room && i >= r.x && i < r.x + r.size)) {
                    positionOK = false;
                    break;
                }
            }
            if (positionOK) {
                return { can: true, at: p };
            }
        }
        
        return { can: false, at: x };
    }

    private placeRoom(floor: FloorState, x: number, room: Room, skipCheck: boolean = false): void {
        if (!this.towerState) return;

        // Place the room
        floor.rooms.push(room.clone(x));
        this.selectedRoom = null;
        this.updateRoomTypes(room);

        // Update totals
        this.towerState.flunds -= room.cost;
        this.towerState.power -= room.power;
        this.towerState.water -= room.water;
        this.towerState.weight += room.weight;

        //TODO: As a gameplay complication, I could put some extra flunds in tight spaces, and you can only obtain them if you fill the spot yourself, not if the auto-fill does it.

        // Fill up the remaining space if the player has no valid actions left, then check if every slot in the current floor is filled
        if (!skipCheck) this.checkFloorCompletion(floor);
    }

    private checkFloorCompletion(floor: FloorState) {
        if (!this.towerState) return;
        if (this.fillFloorOrEndGameIfNoValidMoves(floor) && this.isFloorComplete(floor)) {
            this.towerState.drawOffset = 1;
            this.userInputLocked = true;
            this.towerState.floors.push(this.generateFloor());
            this.animateTimeout = setTimeout(() => {
                this.towerState!.currentFloor++;
                this.towerState!.drawOffset = 0;
                this.userInputLocked = false;
                //Check that there's a move available for the next floor, too. Will loop and keep filling up floors as long as there's no room.
                this.checkFloorCompletion(this.towerState!.floors[this.towerState!.currentFloor]);
            }, 400);
        }
    }

    private fillFloorOrEndGameIfNoValidMoves(floor: FloorState): boolean { //Returns true if it fills up the floor with Hallway and the game should continue
        if (!this.towerState) return false;

        //Check if the floor CAN be filled more by the player (i.e., there are NO empty spaces smaller than ALL of the currentRoomTypes). If not, fill the remaining slots with copies of Hallway.
        const emptySpaces: number[] = [];
        let biggestEmptySpace = 0;
        let currentEmptySpace = 0;
        for (let i = 0; i < FLOOR_WIDTH; i++) {
            if (!floor.rooms.some(r => i >= r.x && i < r.x + r.size)) { //No room at this position -> grow the current empty space
                emptySpaces.push(i);
                currentEmptySpace++;
                if (currentEmptySpace > biggestEmptySpace) biggestEmptySpace = currentEmptySpace;
            } else {
                currentEmptySpace = 0;
            }
        }

        //Check if the player has any more valid moves--differentiating between valid moves left *for this floor* and valid moves left *in the game* (a room is affordable but won't fit on the current floor).
        if (biggestEmptySpace > 0 && this.towerState.currentRoomTypes.some(r => r.size <= biggestEmptySpace && this.isAffordable(r))) return false;
        if (this.towerState.currentRoomTypes.every(r => !this.isAffordable(r))) {
            this.endReason = "Limits reached!";
            this.endGame();
            return false;
        }

        const hallway = this.Hallway; //Fill remaining slots with Hallway
        for (const space of emptySpaces) {
            this.placeRoom(floor, space, hallway, true);
        }
        return true;
    }

    private removeRoom(floor: FloorState, room: Room): void {
        if (!this.towerState) return;

        // Remove the room
        floor.rooms = floor.rooms.filter(r => r !== room);

        // Update totals
        this.towerState.flunds += room.cost;
        this.towerState.power += room.power;
        this.towerState.water += room.water;
        this.towerState.weight -= room.weight;
    }

    private handleTrashCanClick(): void {
        if (!this.gameStarted || !this.towerState || this.userInputLocked) return;

        if (this.selectedRoom && !this.selectedRoom.immovable) {
            const floor = this.towerState.floors[this.towerState.currentFloor];
            if (this.selectedRoom.x !== -1) this.removeRoom(floor, this.selectedRoom); // Don't "remove" it unless it's actually *placed* on the floor
            this.updateRoomTypes(this.selectedRoom); //Update the available room types if this room was in that selector
            this.selectedRoom = null;
            if (this.timer >= TRASH_CAN_COST) { // Trashing is a freebie when you have nearly no time left.
                this.timer -= TRASH_CAN_COST;
            }
            this.checkFloorCompletion(floor); //If you toss out your last 1-tile room, the floor should auto-fill so you don't get stuck hunting for another 1-tile room
        }
    }

    public asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
        });

        if (!this.gameStarted) {
            this.drawStartOverlay(mainDrawable);
            if (!this.howToPlayShown) this.drawCloseButton(mainDrawable);
        } else {
            this.drawGameArea(mainDrawable);
            if (this.deciding) this.drawDecisionDialog(mainDrawable);
        }

        this.lastDrawable = mainDrawable;
        return mainDrawable;
    }

    private drawStartOverlay(parent: Drawable): void {
        const overlay = parent.addChild(new Drawable({ //TODO: make sure I didn't use getScroll on any of the backdrops in any minigame, because you lose the ability to scroll if you scroll up far enough since the onDrag event belongs to this!
            anchors: ["centerX"],
            centerOnOwnX: true,
            width: "min(100%, 600px)",
            height: "100%",
            fallbackColor: '#111111',
            id: "startOverlay",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, overlay.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
        }));

        if (this.howToPlayShown) {
            this.drawHowToPlay(overlay, parent);
            return;
        }

        let nextY = 10 - this.scroller.getScroll();
        let baseY = nextY;
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "48px",
            text: "Altitect", //Other names I had in mind: Vertical Vision, Blueprint Builder, Load Layer, Tower Turner.
        }));
        nextY += 134;

        const startButton = overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "220px",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => this.startGame(),
            children: [
                new Drawable({
                    anchors: ["centerX"],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: "Start Game",
                    centerOnOwnX: true
                })
            ]
        }));

        const unaffordable = !this.city.hasResources(this.getCosts(), false);
        addResourceCosts(startButton, this.getCosts(), 82, 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
        nextY += 176;

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "500px",
            height: "48px",
            fallbackColor: '#00000000',
            onClick: () => { this.isPractice = !this.isPractice; },
            children: [
                new Drawable({
                    x: 5,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, this.isPractice ? "ui/checked" : "ui/unchecked"),
                }),
                new Drawable({
                    anchors: ["right"],
                    rightAlign: true,
                    x: 5,
                    y: 7,
                    width: "calc(100% - 60px)",
                    height: "100%",
                    text: "Practice Run (no rewards)",
                }),
            ]
        }));
        nextY += 60;

        // How to play button
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "220px",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => { this.toggleRules(); },
            children: [
                new Drawable({
                    anchors: ["centerX"],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: "How to Play",
                    centerOnOwnX: true
                })
            ]
        }));
        nextY += 60;

        if (this.winnings?.length) {
            // Draw the winnings from the last playthrough
            const winningsArea = overlay.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: nextY,
                width: "min(100%, 600px)",
                fallbackColor: '#444444',
                id: "winningsArea"
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 10,
                width: "calc(100% - 40px)",
                height: "32px",
                text: "Tower Modifications:",
            }));

            let innerNextY = 50;
            this.winnings.forEach((w, i) => { //i for alternating left half and right half
                const icon = winningsArea.addChild(new Drawable({
                    anchors: [i % 2 === 0 ? 'left' : 'centerX'],
                    x: i % 2 === 0 ? 10 : 0,
                    y: innerNextY,
                    width: "48px",
                    height: "48px",
                    keepParentWidth: true,
                    image: new TextureInfo(64, 64, effectTypeIconMap.get(w.type) ?? "ui/info"),
                }));
                icon.addChild(new Drawable({
                    x: 58,
                    y: 10,
                    width: "calc(50% - 78px)", //Half the space minus the icon width, border, text-icon padding, and left-right halves padding. Note: this should end up coming out to about 162.
                    height: "36px",
                    text: effectTextMap.get(w.type)?.(w.magnitude) ?? `${w.magnitude >= 0 ? "+" : ""}${humanizeFloor(w.magnitude)} unknown `,
                }));
                if (i % 2 === 1 || i === this.winnings!.length - 1) innerNextY += 58;
            });

            innerNextY += 10;
            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: innerNextY,
                width: "calc(100% - 40px)",
                height: "32px",
                text: "...to the selected skyscraper.",
            }));
            innerNextY += 40;

            winningsArea.height = innerNextY + 10 + "px";
            nextY += innerNextY + 20;
        }

        //nextY = drawMinigameOptions(this.city, overlay, nextY, [ //TODO: Design options for this Skyscraper-modifying minigame. Maybe one option gives you more weight but adds a steel cost to play. Maybe one increases the budget for a higher Flunds cost.
        //    { group: "aa-r", id: "0", text: "Business Buds (+tourism)", icon: "resource/tourists" },
        //    { group: "aa-r", id: "1", text: "Power Pals (-power cost)", icon: "resource/power" },
        //    { group: "aa-r", id: "2", text: "Industrial Invitees (+production)", icon: "ui/logistics" }]);

        this.scroller.setChildrenSize(nextY - baseY);
    }

    private toggleRules(): void {
        this.howToPlayShown = !this.howToPlayShown;
        if (this.howToPlayShown) {
            this.scroller.resetScroll();
        }
    }

    private drawHowToPlay(overlay: Drawable, root: Drawable): void {
        let parent = overlay;
        parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10 - this.scroller.getScroll(),
            width: "100%",
            height: "48px",
            text: "Altitect Rules",
        }));

        root.onClick = () => this.toggleRules();

        //Mock tower state for demonstrating the controls and such
        this.towerState = {
            flunds: BASE_FUNDS, maxFlunds: BASE_FUNDS, power: BASE_POWER, maxPower: BASE_POWER, water: BASE_WATER, maxWater: BASE_WATER, weight: 0, maxWeight: BASE_WEIGHT,
            currentFloor: 0, drawOffset: 0, floors: [], weightThresholds: [], selectedRoom: null,
            currentRoomTypes: [this.RoomTypes[0], this.RoomTypes[3], this.RoomTypes[7], this.RoomTypes[13], this.RoomTypes[9]],
            nextRoomTypes: [this.RoomTypes[17], this.RoomTypes[12], this.RoomTypes[3], this.RoomTypes[10], this.RoomTypes[3]],
        };

        parent = parent.addChild(new Drawable({
            x: 20,
            y: 80 - this.scroller.getScroll(),
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "This minigame is about redesigning a skyscraper floor by floor, placing rooms within the given constraints.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You are given " + SELECTOR_ROOM_COUNT + " rooms to pick from. You can also see the next room that will become available in each column once the current one is used.",
        }));

        const selectorBox = parent.addChild(new Drawable({
            anchors: ['bottom'],
            x: 30, //offset a bit more because the selector is normally centered around an off-center point anyway
            y: -10,
            width: "100%",
            height: "0px",
        }));
        this.drawRoomSelector(selectorBox, 0, true);
        selectorBox.addChild(new Drawable({
            x: -30,
            y: 22,
            width: "170px",
            height: "40px",
            text: "Current options:",
        }));
        selectorBox.addChild(new Drawable({
            x: -30,
            y: 45 + TILE_SIZE,
            width: "170px",
            height: "40px",
            text: "Upcoming options:",
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -240,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you don't like one of the rooms, either already placed in the tower or in the room selector below that, you can tap the trash can to get rid of it... for a cost of " + TRASH_CAN_COST + " seconds.",
        }));
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -10,
            y: -80,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/altitrash"),
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -150,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You can also move floors after placing them by simply tapping the floor and then an empty space.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If none of your choices fit in the current floor's free space, the empty spaces fill with hallways so you never get stuck.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Once a floor is full, you automatically move on to the next one, and you cannot move on to the next floor without filling all spaces in the current one.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Immovable support pillars appear on each floor. More weight means more pillars, so later floors will have less space for rooms, especially bigger rooms.",
        }));
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -10,
            y: -90,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/alti" + this.SupportPillar.id),
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -155,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The tower's current weight is shown as a bar on the right, with each tick indicating an increase in the number of support pillars.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Different rooms have different permanent effects on the Skyscraper you entered the game from.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Try to balance your play speed with the tower's constraints, or go all-in on whatever effect types you care about the most.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you run out of time or can no longer afford any rooms, the game ends, and the rooms' effects are applied to the tower.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You can play Altitect as many times as you like for each Skyscraper, but the cost increases with every playthrough.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -60,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you play for the same Skyscraper multiple times, after the game ends, you get to choose whether you like the old or the new version of the tower better.",
        }));

        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -10,
            y: -80,
            width: "calc(100% - 40px)",
            height: "48px",
            text: "Room types",
        }));
        parent = parent.addChild(new Drawable({ //Just a blank space to align the room types to
            anchors: ['bottom'],
            y: -90,
            width: "calc(100% - 40px)",
            height: "0px",
            keepParentWidth: true,
            fallbackColor: '#00000000',
        }));

        //Loop through all room types and their effects, and draw their icons, names, costs (where nonzero), and effects
        let nextY = 0; //starting at the base of the blank space
        for (const room of this.RoomTypes.filter(p => p !== this.SupportPillar)) {
            parent.addChild(new Drawable({
                y: nextY,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, "minigame/alti" + room.id + "i"),
            }));
            parent.addChild(new Drawable({
                x: 74,
                y: nextY + 18,
                width: "calc(100% - 94px)",
                height: "40px",
                text: room.displayName + ":",
            }));
            nextY += 74;

            const costs = [{ type: "flunds", amount: room.cost }, { type: "power", amount: room.power }, { type: "water", amount: room.water }, { type: "weight", amount: room.weight }].filter(p => p.amount);
            const nextX = addResourceCosts(parent, costs, 20, nextY, false, false, false, 48, 6, 28, 4);
            parent.addChild(new Drawable({
                x: nextX + 10,
                y: nextY + 12,
                width: "calc(100% - " + (nextX + 10) + "px)",
                height: "40px",
                text: "Size: " + room.size,
            }));
            nextY += 84;
            for (const effect of room.effects) {
                parent.addChild(new Drawable({
                    x: 20,
                    y: nextY,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, effectTypeIconMap.get(effect.type) ?? "ui/info"),
                }));
                parent.addChild(new Drawable({
                    x: 80,
                    y: nextY + 8,
                    width: "calc(100% - 100px)",
                    height: "40px",
                    text: effectTextMap.get(effect.type)?.(effect.magnitude) ?? `${effect.magnitude >= 0 ? "+" : ""}${humanizeFloor(effect.magnitude)} unknown `,
                }));
                nextY += 58;
            }
            nextY += 15;
        }

        this.scroller.setChildrenSize(2080 + nextY); //Sized for the ultra-small iPhone 12 screen.
    }

    private drawGameArea(parent: Drawable): void {
        if (!this.towerState) return;

        const gameArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            y: 20,
            width: "min(100%, 600px)",
            height: "100%",
            fallbackColor: '#333333',
            id: "gameArea",
            centerOnOwnX: true
        }));

        let nextY = this.drawFloor(gameArea, 80);
        this.drawWeightBar(gameArea);
        nextY = this.drawTimer(gameArea, nextY);
        this.drawTrashCan(gameArea, nextY);
        this.drawNextIndicator(gameArea, nextY + TILE_SIZE + 45);
        nextY = this.drawRoomSelector(gameArea, nextY);
        nextY = this.drawEffects(gameArea, nextY);
        nextY = this.drawResources(gameArea, nextY);

        if (this.userInputLocked && this.endReason) {
            gameArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 80 + FLOOR_WIDTH * TILE_SIZE / 2 - 32,
                width: "300px",
                height: "64px",
                fallbackColor: '#444444',
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        centerOnOwnX: true,
                        y: 10,
                        width: "100%",
                        height: "48px",
                        text: this.endReason,
                    })
                ]
            }));
        } else if (!this.deciding) {
            gameArea.addChild(new Drawable({
                anchors: ['right'],
                x: 10,
                y: 10,
                width: "100px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => { this.endReason = "Gave up!"; this.endGame(); },
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        y: 5,
                        width: "calc(100% - 10px)",
                        height: "100%",
                        text: "Give Up",
                        centerOnOwnX: true
                    })
                ]
            }));
        }
    }

    private drawDecisionDialog(parent: Drawable): void { //Note: userInputLocked is true while deciding, so all inputs outside this window are ignored. Don't check userInputLocked here.
        if (!this.towerState || !this.building || !this.winnings) return;

        //A darkening semitransparent backdrop just above the 170 point
        parent.addChild(new Drawable({
            width: "100%",
            height: "170px",
            fallbackColor: '#00000099',
            onClick: () => { }, //Ignore clicks on backdrop
        }));

        const backdrop = parent.addChild(new Drawable({
            y: 170, //Just so you can see the tower a bit :)
            width: "100%",
            height: "100%",
            fallbackColor: '#00000000',
            id: "decisionDialog",
            onClick: () => { }, //Ignore clicks on backdrop
        }));
        const dialog = backdrop.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: -this.scroller.getScroll(),
            width: "min(100%, 600px)",
            height: "min(100%, 800px)",
            fallbackColor: '#222222',
            id: "decisionDialog",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, dialog.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
        }));

        let nextY = 10;
        dialog.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "calc(100% - 20px)",
            height: "40px",
            fallbackColor: '#00000000',
            text: "Keep Old or Apply New Modifications",
        }));
        nextY += 50;

        //Sort and align a copy of the old mods and the new mods for display
        const oldMods = <(BuildingMod | null)[]>this.building.mods.slice().sort((a, b) => effectTypeToStringForSort(a.type).localeCompare(effectTypeToStringForSort(b.type)));
        const newMods = <(BuildingMod | null)[]>this.winnings.slice().sort((a, b) => effectTypeToStringForSort(a.type).localeCompare(effectTypeToStringForSort(b.type)));
        for (let i = 0; i < Math.max(this.building.mods.length, this.winnings.length); i++) {
            const oldMod = oldMods[i];
            const newMod = newMods[i];
            if (oldMod && newMod && oldMod.type === newMod.type) {
                //No action needed; they're in order and aligned
            } else if (!oldMod || (newMod && effectTypeToStringForSort(newMod.type) < effectTypeToStringForSort(oldMod.type))) {
                oldMods.splice(i, 0, null); //Insert a blank in the oldMods array
            } else {
                newMods.splice(i, 0, null); //Insert a blank in the newMods array
            }
        }

        //"Keep" column on left, "Apply" column on right. One loop going through both at once so we only need to maintain one nextY.
        for (let i = 0; i < oldMods.length; i++) {
            const oldMod = oldMods[i];
            const newMod = newMods[i];

            function drawMod(parent: Drawable, mod: BuildingMod) {
                parent.addChild(new Drawable({
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, effectTypeIconMap.get(mod.type) ?? "ui/info"),
                }));
                parent.addChild(new Drawable({
                    x: 58,
                    y: 10,
                    width: "calc(100% - 73px)",
                    height: "40px",
                    text: effectTextMap.get(mod.type)?.(mod.magnitude) ?? `${mod.magnitude >= 0 ? "+" : ""}${humanizeFloor(mod.magnitude)} unknown `,
                }));
            }

            if (oldMod) {
                const left = dialog.addChild(new Drawable({
                    x: 10,
                    y: nextY,
                    width: "calc(50% - 15px)",
                    height: "48px",
                    fallbackColor: '#00000000',
                }));
                drawMod(left, oldMod);
            }
            if (newMod) {
                const right = dialog.addChild(new Drawable({
                    anchors: ['centerX'],
                    x: 5,
                    y: nextY,
                    width: "calc(50% - 15px)",
                    height: "48px",
                    fallbackColor: '#00000000',
                }));
                drawMod(right, newMod);
            }
            nextY += 58;
        }

        //Keep and Apply buttons at the bottom aligned along the same axes
        dialog.addChild(new Drawable({
            y: nextY,
            width: "calc(50% - 15px)",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => {
                this.deciding = false;
                this.returnToStartScreen();
            },
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: "Keep Old",
                    centerOnOwnX: true
                })
            ]
        }));
        dialog.addChild(new Drawable({
            anchors: ['centerX'],
            x: 5,
            y: nextY,
            width: "calc(50% - 15px)",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => {
                this.building?.applyMods(this.city, this.winnings!);
                this.deciding = false;
                this.returnToStartScreen();
            },
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: "Apply New",
                    centerOnOwnX: true
                })
            ]
        }));
        nextY += 58;
        this.scroller.setChildrenSize(nextY + 170);
    }

    private drawFloor(parent: Drawable, nextY: number): number {
        if (!this.towerState) return nextY;

        if (this.towerState.drawOffset > 0 && this.towerState.drawOffset < TILE_SIZE) {
            this.towerState.drawOffset += 2; //Upward-scrolling animation
            this.uiManager.frameRequested = true;
        }

        let innerNextY = nextY - this.towerState.drawOffset;
        let currentFloorArea: Drawable;
        for (let i = this.towerState.currentFloor; i < this.towerState.floors.length; i++) {
            const floorArea = parent.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: innerNextY,
                width: (FLOOR_WIDTH * TILE_SIZE) + "px",
                height: (FLOOR_WIDTH * TILE_SIZE) + "px",
                fallbackColor: '#333333',
                id: "floorArea"
            }));
            if (i === this.towerState.currentFloor) currentFloorArea = floorArea;

            //Draw rooms
            const floor = this.towerState.floors[i];
            for (let x = 0; x < FLOOR_WIDTH; x++) {
                const room = floor.rooms.find(r => r.x <= x && r.x + r.size > x);
                if (room) { //Don't draw a backdrop if a room is covering this spot
                    //Only draw the room once, at its x position
                    if (room.x === x) floorArea.addChild(new Drawable({
                        x: x * TILE_SIZE,
                        width: room.size * TILE_SIZE + "px",
                        height: TILE_SIZE + "px",
                        fallbackColor: this.hashRoomColor(room.id),
                        image: new TextureInfo(200, 20, "minigame/alti" + room.id),
                        onClick: () => this.handleRoomClick(room)
                    }));
                } else { // Draw the floor backdrops only where there is no room.
                    floorArea.addChild(new Drawable({
                        x: x * TILE_SIZE,
                        width: TILE_SIZE + "px",
                        height: TILE_SIZE + "px",
                        fallbackColor: '#444444',
                        image: new TextureInfo(64, 64, "minigame/altiempty"), //A tileable image for an unfinished interior, darkened so it doesn't stick out too much
                        onClick: () => this.handleFloorClick(x)
                    }));
                }
            }
            innerNextY += TILE_SIZE;
        }

        // Draw a highlight around the currently selected room if there is one and it's not in the selector area.
        if (this.selectedRoom && this.selectedRoom?.x !== -1) {
            const pad = 10;
            const roomX = this.selectedRoom.x * TILE_SIZE;
            const roomWidth = TILE_SIZE * this.selectedRoom.size;
            currentFloorArea!.addChild(new Drawable({
                x: roomX - pad,
                y: -pad,
                width: roomWidth + 2 * pad + "px",
                height: pad + "px",
                fallbackColor: '#BBFF22',
                onClick: () => this.handleRoomClick(this.selectedRoom!)
            }));
            currentFloorArea!.addChild(new Drawable({
                x: roomX - pad,
                y: TILE_SIZE,
                width: roomWidth + 2 * pad + "px",
                height: pad + "px",
                fallbackColor: '#BBFF22',
                onClick: () => this.handleRoomClick(this.selectedRoom!)
            }));
            currentFloorArea!.addChild(new Drawable({
                x: roomX - pad,
                y: 0,
                width: pad + "px",
                height: TILE_SIZE + "px",
                fallbackColor: '#BBFF22',
                onClick: () => this.handleRoomClick(this.selectedRoom!)
            }));
            currentFloorArea!.addChild(new Drawable({
                x: roomX + roomWidth,
                y: 0,
                width: pad + "px",
                height: TILE_SIZE + "px",
                fallbackColor: '#BBFF22',
                onClick: () => this.handleRoomClick(this.selectedRoom!)
            }));
        }
        return nextY + TILE_SIZE + 10;
    }

    private drawRoomSelector(parent: Drawable, nextY: number, mock: boolean = false): number {
        if (!this.towerState) return nextY;

        const selectorArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            x: 37, // Offset so trash can can be directly to the left of them
            y: nextY,
            width: SELECTOR_ROOM_COUNT * (TILE_SIZE + 10) - 10 + "px",
            height: "138px",
            fallbackColor: '#00000000',
            id: "selectorArea"
        }));

        const self = this;
        const dotWidth = TILE_SIZE / 5; //Max room size is 4 since I divided by 5.
        function drawRoomButton(room: Room, index: number, selectable: boolean) {
            const button = selectorArea.addChild(new Drawable({
                x: index * (TILE_SIZE + 10),
                y: selectable ? 0 : TILE_SIZE + dotWidth + 10,
                width: TILE_SIZE + "px",
                height: TILE_SIZE + dotWidth + 2 + "px",
                fallbackColor: '#444444',
                onClick: () => !mock && selectable ? self.handleRoomClick(room) : undefined
            }));
            button.addChild(new Drawable({
                y: Math.round((TILE_SIZE - TILE_SIZE / room.size) / 2), //Basically Y-centering in its space
                width: TILE_SIZE + "px",
                height: Math.round(TILE_SIZE / room.size) + "px",
                fallbackColor: self.hashRoomColor(room.id),
                image: new TextureInfo(200, 20, "minigame/alti" + room.id),
            }));
            button.addChild(new Drawable({ //Icon representing the room
                width: TILE_SIZE + "px",
                height: TILE_SIZE + "px",
                fallbackColor: '#00000000',
                image: new TextureInfo(64, 64, "minigame/alti" + room.id + "i"),
            }));
            //Draw same number of dots as the room's size, to indicate how big it is (at least temporary until I have images for all the rooms)
            const dotSpace = (TILE_SIZE - room.size * dotWidth) / (room.size + 1);
            const dotColor = selectable ? self.isAffordable(room) ? '#44FF55' : '#CC0000' : '#CCCCCC';
            for (let i = 0; i < room.size; i++) {
                button.addChild(new Drawable({
                    anchors: ['bottom'],
                    x: dotSpace + i * (dotWidth + dotSpace),
                    width: dotWidth + "px",
                    height: dotWidth + "px",
                    fallbackColor: dotColor,
                }));
            }
        }

        this.towerState.currentRoomTypes.forEach((room, index) => drawRoomButton(room, index, true));
        //TODO: Would be good to draw a little arrow pointing up between each current-next pair.
        this.towerState.nextRoomTypes.forEach((room, index) => drawRoomButton(room, index, false));

        // Draw a highlight around the currently selected room if there is one and it's in the selector area.
        if (this.selectedRoom && this.selectedRoom.x === -1) {
            const pad = 5;
            const roomX = this.towerState.currentRoomTypes.indexOf(this.selectedRoom) * (TILE_SIZE + 10);
            const roomY = 0;
            selectorArea.addChild(new Drawable({
                x: roomX - pad,
                y: roomY - pad,
                width: TILE_SIZE + 2 * pad + "px",
                height: TILE_SIZE + dotWidth + 2 + 2 * pad + "px",
                fallbackColor: '#BBFF2255', //TODO: Use border, not highlight, or use a highlight image because it's more efficient than a solid color in Canvas2D for whatever reason
                onClick: () => mock ? this.handleRoomClick(this.selectedRoom!) : undefined
            }));
        }

        return nextY + 2 * (TILE_SIZE + dotWidth + 10) + 12;
    }

    private hashRoomColor(id: string): string { //A function to hash the room ID (a short string) into a fallback color, for use until I have images for all the rooms.
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return "#" + "00000".substring(0, 6 - c.length) + c;
    }

    private drawTrashCan(parent: Drawable, nextY: number): void {
        parent.addChild(new Drawable({
            anchors: ['left'],
            x: 10,
            y: nextY,
            width: "64px",
            height: "64px",
            fallbackColor: '#444444',
            image: new TextureInfo(64, 64, "minigame/altitrash"),
            onClick: () => this.handleTrashCanClick(),
            grayscale: !this.selectedRoom
        }));
    }

    private drawNextIndicator(parent: Drawable, nextY: number): void {
        parent.addChild(new Drawable({
            anchors: ['left'],
            x: 10,
            y: nextY,
            width: "64px",
            height: "32px",
            text: "Next:",
        }));
    }

    private drawTimer(parent: Drawable, nextY: number): number {
        const timerArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            noXStretch: false,
            y: nextY,
            width: (FLOOR_WIDTH * TILE_SIZE) + "px",
            height: "30px",
            fallbackColor: '#666666',
            image: new TextureInfo(200, 20, "ui/progressbg"),
            children: [
                new Drawable({
                    clipWidth: 0.03 + (this.timer / GAME_DURATION) * 0.94,
                    width: "100%",
                    height: "100%",
                    noXStretch: false,
                    fallbackColor: '#00ff11',
                    image: new TextureInfo(200, 20, "ui/progressfg"),
                    reddize: this.timer < 5
                })
            ]
        }));
        return nextY + 40;
    }

    private drawWeightBar(parent: Drawable): void {
        const weightBar = parent.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 80,
            width: "30px",
            height: FLOOR_WIDTH * TILE_SIZE + "px",
            fallbackColor: '#222222'
        }));

        const weight = this.towerState!.weight;
        const maxWeight = this.towerState!.maxWeight;
        weightBar.addChild(new Drawable({
            x: 1,
            y: FLOOR_WIDTH * TILE_SIZE - (weight / maxWeight) * FLOOR_WIDTH * TILE_SIZE,
            width: "28px",
            height: (weight / maxWeight) * FLOOR_WIDTH * TILE_SIZE + "px",
            fallbackColor: '#FF8811'
        }));

        // Draw the added weight if this.selectedRoom is set and it's not placed yet
        if (this.selectedRoom && this.selectedRoom.x === -1) {
            const roomWeight = this.selectedRoom.weight;
            weightBar.addChild(new Drawable({
                x: 1,
                y: FLOOR_WIDTH * TILE_SIZE - ((weight + roomWeight) / maxWeight) * FLOOR_WIDTH * TILE_SIZE,
                width: "28px",
                height: (roomWeight / maxWeight) * FLOOR_WIDTH * TILE_SIZE + "px",
                fallbackColor: '#FF1166'
            }));
        }

        // Draw weight notches
        this.towerState!.weightThresholds.forEach((threshold, i) => {
            weightBar.addChild(new Drawable({
                y: FLOOR_WIDTH * TILE_SIZE - (threshold / maxWeight) * FLOOR_WIDTH * TILE_SIZE,
                width: "30px",
                height: "4px",
                fallbackColor: '#999999'
            }));
        });

        //Draw "Wt." text
        weightBar.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: FLOOR_WIDTH * TILE_SIZE + 5,
            width: "50px",
            height: "36px",
            text: "Wt."
        }));
    }

    private drawResources(parent: Drawable, nextY: number): number {
        if (!this.towerState) return nextY;

        const resourcesArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "190px",
            fallbackColor: '#00000000'
        }));

        function drawResource(x: number, y: number, icon: string, towerAmount: number, selectionAmount: number | undefined): void {
            const space = resourcesArea.addChild(new Drawable({
                x: x,
                y: y,
                width: "440px",
                height: "48px",
                fallbackColor: '#00000000'
            }));
            space.addChild(new Drawable({
                y: -7,
                width: "48px",
                height: "48px",
                image: new TextureInfo(64, 64, icon),
            }));
            space.addChild(new Drawable({
                x: 60,
                width: "140px",
                height: "50px",
                rightAlign: true,
                text: towerAmount.toString(), //Decided to leave off the "/max" part
            }));
            //To the right of that, draw the resource amount that's about to be used up if this.selectedRoom is set and it's not placed yet
            if (selectionAmount !== undefined) {
                space.addChild(new Drawable({
                    x: 210,
                    width: "120px",
                    height: "50px",
                    rightAlign: true,
                    text: selectionAmount < 0 ? "+" + -selectionAmount : (-selectionAmount).toString(), //Inverting the sign //Opposite version: (this.selectedRoom.water > 0 ? "+" : "") + this.selectedRoom.water, //Just adding a sign
                    reddize: selectionAmount > towerAmount
                }));
            }
        }

        drawResource(10, 10, "resource/flunds", this.towerState!.flunds, this.selectedRoom?.x === -1 ? this.selectedRoom.cost : undefined);
        drawResource(10, 70, "resource/power", this.towerState!.power, this.selectedRoom?.x === -1 ? this.selectedRoom.power : undefined);
        drawResource(10, 130, "resource/water", this.towerState!.water, this.selectedRoom?.x === -1 ? this.selectedRoom.water : undefined);

        return nextY + 190;
    }

    private drawEffects(parent: Drawable, nextY: number): number {
        if (!this.towerState || !this.selectedRoom) return nextY;

        const effectsArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: (FLOOR_WIDTH * TILE_SIZE) + "px",
            height: "94px",
            fallbackColor: '#00000000',
            id: "effectsArea"
        }));

        effectsArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 20,
            width: "calc(100% - 80px)",
            height: "40px",
            text: `Selection: ${this.selectedRoom?.displayName ?? "None"}`
        }));

        //Draw the selected room's effects. (Probably only 1-2 of them.)
        const effects = this.selectedRoom.effects;
        let innerNextY = 60;
        for (const effect of effects) {
            effectsArea.addChild(new Drawable({
                x: 10,
                y: innerNextY,
                width: "calc(100% - 20px)",
                height: "32px",
                text: effectTextMap.get(effect.type)?.(effect.magnitude) ?? `${effect.magnitude >= 0 ? "+" : ""}${humanizeFloor(effect.magnitude)} unknown `,
            }));
            innerNextY += 42;
        }

        //TODO: If there is no selected room, or if there's room for everything at once, draw any global in-minigame effects if you make those, and if you don't, then draw totals just like the winnings code.
        return nextY + innerNextY;
    }

    private drawCloseButton(parent: Drawable): void {
        parent.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(64, 64, "ui/x"),
            onClick: () => this.uiManager.hideMinigame()
        }));
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;
        const urls: { [key: string]: string } = {
            "minigame/altitrash": "assets/minigame/altitrash.png",
            "minigame/altiempty": "assets/minigame/altiempty.png",
        };

        this.RoomTypes.forEach(room => {
            urls[`minigame/alti${room.id}`] = `assets/minigame/alti${room.id}.png`;
            if (room !== this.SupportPillar) urls[`minigame/alti${room.id}i`] = `assets/minigame/alti${room.id}i.png`;
        });

        await this.uiManager.renderer.loadMoreSprites(this.city, urls);
        this.preloaded = true;
    }

    private selectRandomRoomTypes(): void {
        if (!this.towerState) return;
        while (this.towerState.currentRoomTypes.length < SELECTOR_ROOM_COUNT) this.towerState.currentRoomTypes.push(this.generateRandomRoomType());
        while (this.towerState.nextRoomTypes.length < SELECTOR_ROOM_COUNT) this.towerState.nextRoomTypes.push(this.generateRandomRoomType());
    }

    private generateRandomRoomType(): Room {
        const allRoomTypes = [...this.RoomTypes];
        inPlaceShuffle(allRoomTypes);
        let selection = Math.random() * allRoomTypes.reduce((a, b) => a + b.appearanceRate, 0);
        for (const type of allRoomTypes) {
            selection -= type.appearanceRate;
            if (selection <= 0) return type.clone();
        }
        return allRoomTypes[allRoomTypes.length - 1].clone();
    }

    private updateRoomTypes(placedRoom: Room): void {
        if (!this.towerState) return;

        const index = this.towerState.currentRoomTypes.indexOf(placedRoom);
        if (index === -1) return;

        this.towerState.currentRoomTypes[index] = this.towerState.nextRoomTypes[index];
        this.towerState.nextRoomTypes[index] = this.generateRandomRoomType();
    }

    private isFloorComplete(floor: FloorState): boolean {
        const occupiedSlots = new Set<number>();
        floor.rooms.forEach(room => {
            for (let i = room.x; i < room.x + room.size; i++) {
                occupiedSlots.add(i);
            }
        });

        return occupiedSlots.size === FLOOR_WIDTH;
    }
}
