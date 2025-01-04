import { City } from "../game/City.js";
import { UIManager } from "../ui/UIManager.js";
import { Resource } from "../game/Resource.js";
import { Clothing, Coal, Copper, Electronics, Flunds, Gemstones, Iron, Lithium, MonobrynthPlays, Oil, Research, Silicon, Steel, Tritium, Uranium, getResourceType } from "../game/ResourceTypes.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { Drawable } from "../ui/Drawable.js";
import { addResourceCosts } from "../ui/UIUtil.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { CityFlags } from "../game/CityFlags.js";
import { TeleportationPod, getBuildingType } from "../game/BuildingTypes.js";
import { Notification } from "../game/Notification.js";
import { GameState } from "../game/GameState.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { OnePracticeRun, filterConvertAwardWinnings, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";

const SYMBOL_COUNT = 6;
const GRID_TILE_SIZE = 96;
const SYMBOL_BUTTON_SIZE = 128;
const MEMORIZATION_SEQUENCE_SIZE = 64;
const HP_ICON_SIZE = 64;

type Difficulty = 'easy' | 'medium' | 'hard';

interface Tile {
    difficulty: Difficulty;
    content: ('treasure' | 'monster')[];
    visibility: 'hidden' | 'seen' | 'revealed';
}

interface TreasureType {
    type: 'artifact' | 'shield' | 'map';
    value: number;
}

interface DifficultySettings {
    gridWidth: number;
    gridHeight: number;
    minTreasures: number;
    memorizationTime: number;
    playCost: number;
    rewardMultiplier: number;
    allowedDifficulties: Difficulty[];
}

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
    easy: {
        gridWidth: 5,
        gridHeight: 5,
        minTreasures: 7,
        memorizationTime: 6000,
        playCost: 1,
        rewardMultiplier: 1,
        allowedDifficulties: ['easy', 'medium', 'hard']
    },
    medium: {
        gridWidth: 4,
        gridHeight: 5,
        minTreasures: 8,
        memorizationTime: 5500,
        playCost: 2,
        rewardMultiplier: 2, //No direct reward bonus because the score potential is actually higher on medium.
        allowedDifficulties: ['medium', 'hard']
    },
    hard: {
        gridWidth: 3,
        gridHeight: 5,
        minTreasures: 10,
        memorizationTime: 5000,
        playCost: 3,
        rewardMultiplier: 3.1, //A small direct reward bonus because if you're good, you can easily cap out the score-based rewards on hard.
        allowedDifficulties: ['hard']
    }
};

export class Monobrynth implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private memorizeTimeout: NodeJS.Timeout | null = null;
    private gameStarted: boolean = false;
    private winnings: Resource[] = [];
    private collectingTreasures: TreasureType[] | null = null;
    private score: number = 0;
    private noneFailed: boolean = true;
    private reachedEnd: boolean = false;
    private hp: ('clothing' | 'shield')[] = [];
    private grid: Tile[][] = [];
    private playerPosition: [number, number] = [0, 0];
    private clothingToUse: number = 0;
    private currentSequence: number[] = [];
    private currentSequenceIndex: number = 0;
    private userInputLocked: boolean = false;
    private sequenceVisible: boolean = false;
    private sequenceFailed: boolean = false;
    private preloaded: boolean = false;
    private costs = [{ type: new MonobrynthPlays().type, amount: 1 }, { type: new Clothing().type, amount: 0 }];
    private isPractice: boolean = false;
    private selectedDifficulty: Difficulty = 'easy';
    private metXenocideRequirements: boolean = false;

    constructor(private city: City, private uiManager: UIManager, private game: GameState) { }

    private initializeGame(): void {
        this.score = 0;
        this.noneFailed = true;
        this.hp = new Array(1 + this.clothingToUse).fill('clothing');
        this.grid = this.generateGrid();
        this.playerPosition = [0, -1]; //Player isn't drawn at first
        this.reachedEnd = false;
        this.gameStarted = true;
        this.userInputLocked = false;
    }

    onResize(): void {
        this.scroller.onResize();
    }

    private get difficulty(): DifficultySettings { return DIFFICULTY_SETTINGS[this.selectedDifficulty]; }

    private generateGrid(): Tile[][] {
        const grid: Tile[][] = [];
        for (let i = 0; i < this.difficulty.gridHeight; i++) {
            grid[i] = [];
            for (let j = 0; j < this.difficulty.gridWidth; j++) {
                grid[i][j] = this.generateTile();
                if (i === 0) grid[i][j].visibility = 'seen';
            }
        }

        //Ensure there are at least 7 treasures. If not, add more to random tiles without treasure.
        let treasureCount = grid.flat().reduce((acc, tile) => acc + tile.content.filter(p => p === 'treasure').length, 0);
        while (treasureCount < this.difficulty.minTreasures) {
            const x = Math.floor(Math.random() * this.difficulty.gridWidth);
            const y = Math.floor(Math.random() * this.difficulty.gridHeight);
            if (!grid[y][x].content.filter(p => p === 'treasure').length) {
                grid[y][x].content.push('treasure');
                treasureCount++;
            }
        }

        return grid;
    }

    private generateTile(): Tile {
        const allowedDifficulties = this.difficulty.allowedDifficulties;
        const difficulty = allowedDifficulties.length === 3 ? (Math.random() < 0.4 ? allowedDifficulties[0] : Math.random() < 0.75 ? allowedDifficulties[1] : allowedDifficulties[2]) //40-35-25
            : allowedDifficulties.length === 2 ? (Math.random() < 0.65 ? allowedDifficulties[0] : allowedDifficulties[1]) : allowedDifficulties[0]; //65-35
        const content = this.determineContent(difficulty);
        return { difficulty, content, visibility: "hidden" };
    }

    private determineContent(difficulty: 'easy' | 'medium' | 'hard'): ('treasure' | 'monster')[] {
        const content: ('treasure' | 'monster')[] = [];
        switch (difficulty) {
            case 'easy':
                if (Math.random() < 0.5) content.push('monster');
                if (Math.random() < 0.2) content.push('treasure');
                break;
            case 'medium':
                if (Math.random() < 0.8) content.push('monster');
                if (Math.random() < 0.4) content.push('treasure');
                break;
            case 'hard':
                if (Math.random() < 0.9) content.push('monster');
                if (Math.random() < (this.selectedDifficulty === "easy" ? 0.95 : 0.9)) content.push('treasure'); //Slightly reduced chance on higher difficulties due to higher numbers of hard squares... but also for the achievement. :)
                if (Math.random() < 0.1) content.push('treasure');
                break;
        }
        return content;
    }

    private generateSequence(length: number): number[] {
        return Array.from({ length }, () => Math.floor(Math.random() * SYMBOL_COUNT));
    }

    private generateTreasure(difficulty: 'easy' | 'medium' | 'hard'): TreasureType {
        const rand = Math.random();
        if (rand < 0.6) {
            return { type: 'artifact', value: difficulty === 'easy' ? 4 : 5 };
        } else if (rand < 0.8) {
            return { type: 'shield', value: 3 };
        } else {
            return { type: 'map', value: 3 };
        }
    }

    private handleTileContent(tile: Tile): void {
        let i = 0;
        for (const content of tile.content) {
            if (content === 'treasure') {
                this.collectTreasure(this.collectingTreasures?.[i++] ?? this.generateTreasure(tile.difficulty));
            }
        }
        this.collectingTreasures = null;
        tile.content = [];
        tile.visibility = 'revealed';
    }

    private collectTreasure(treasure: TreasureType): void {
        this.score += treasure.value;
        if (treasure.type === 'shield') {
            this.hp.push('shield');
        } else if (treasure.type === 'map') {
            //Reveal contents of the surrounding 3x3 tiles
            const [x, y] = this.playerPosition;
            for (let i = Math.max(0, x - 1); i < Math.min(this.difficulty.gridWidth, x + 2); i++) {
                for (let j = Math.max(0, y - 1); j < Math.min(this.difficulty.gridHeight, y + 2); j++) {
                    //First requirement for an achievement; second is "cleared all tiles with no failures"
                    if (this.grid[j][i].visibility !== 'revealed' && this.grid[j][i].content.includes('monster') && !this.grid[j][i].content.includes('treasure')) this.metXenocideRequirements = true;

                    this.grid[j][i].visibility = 'revealed';
                }
            }

            //Also mark the ones surrounding that as 'seen' if they're still hidden, since the player is able to travel to them anyway--without the corners instead of the whole 5x5 area since the corners stay unreachable.
            for (let i = Math.max(0, x - 1); i < Math.min(this.difficulty.gridWidth, x + 2); i++) { //Horizontal strips of three tiles
                if (y > 1 && this.grid[y - 2][i].visibility === 'hidden') this.grid[y - 2][i].visibility = 'seen';
                if (y < this.difficulty.gridHeight - 2 && this.grid[y + 2][i].visibility === 'hidden') this.grid[y + 2][i].visibility = 'seen';
            }
            for (let j = Math.max(0, y - 1); j < Math.min(this.difficulty.gridHeight, y + 2); j++) { //Vertical strips of three tiles
                if (x > 1 && this.grid[j][x - 2].visibility === 'hidden') this.grid[j][x - 2].visibility = 'seen';
                if (x < this.difficulty.gridWidth - 2 && this.grid[j][x + 2].visibility === 'hidden') this.grid[j][x + 2].visibility = 'seen';
            }
        }
    }

    private startBattle(difficulty: 'easy' | 'medium' | 'hard'): void {
        const sequenceLength = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 7 : 8;
        this.currentSequence = this.generateSequence(sequenceLength);
        this.currentSequenceIndex = 0;
        this.sequenceFailed = false;
        this.showSequence();
    }

    private checkSymbol(input: number): void {
        if (input === this.currentSequence[this.currentSequenceIndex]) {
            this.currentSequenceIndex++;
            if (this.currentSequence.length === this.currentSequenceIndex) {
                this.resolveBattle(true);
            }
        } else {
            this.resolveBattle(false);
        }
    }

    private resolveBattle(success: boolean): void {
        const currentTile = this.grid[this.playerPosition[1]][this.playerPosition[0]];
        currentTile.visibility = 'revealed';
        if (success) {
            this.showBattleSuccess(currentTile);
        } else {
            currentTile.content = [];
            this.showFailureSequence();
        }
    }

    private showBattleSuccess(currentTile: Tile): void {
        this.userInputLocked = true;
        this.sequenceVisible = true;
        this.collectingTreasures = currentTile.content.filter(p => p === 'treasure').map(p => this.generateTreasure(currentTile.difficulty));

        if (this.playerPosition[1] === this.difficulty.gridHeight - 1 && !this.reachedEnd) {
            this.reachedEnd = true;
            this.score += 7;
        }

        if (!this.collectingTreasures.length) {
            this.hideSequence();
            this.currentSequence = [];
            this.collectingTreasures = null;
            currentTile.content = [];
            currentTile.visibility = 'revealed';
            this.endGameIfAllVisited();
        } else {
            this.memorizeTimeout = setTimeout(() => {
                this.hideSequence();
                this.currentSequence = [];
                this.handleTileContent(currentTile);
                this.endGameIfAllVisited();
            }, 1000);
        }
    }

    public showSequence(): void {
        this.sequenceVisible = true;
        this.userInputLocked = true;
        this.memorizeTimeout = setTimeout(() => {
            this.hideSequence();
        }, this.difficulty.memorizationTime);
    }

    private hideSequence(): void {
        this.sequenceVisible = false;
        this.uiManager.frameRequested = true;
        this.userInputLocked = false;
    }

    public showFailureSequence(): void {
        this.userInputLocked = true;
        this.sequenceVisible = true;
        this.sequenceFailed = true;
        this.noneFailed = false;
        this.memorizeTimeout = setTimeout(() => {
            this.hideSequence();
            this.currentSequence = [];
            this.hp.pop();
            if (!this.hp.length) this.endGame();
        }, 1000);
    }

    private endGameIfAllVisited(): void {
        if (this.grid.every(row => row.every(tile => !tile.content.length && tile.visibility === 'revealed'))) {
            if (this.selectedDifficulty === 'hard' && this.metXenocideRequirements && this.noneFailed) {
                this.city.checkAndAwardAchievement("xenocide");
            }

            this.endGame();
            if (this.city.flags.has(CityFlags.UnlockedGameDev) && this.noneFailed && this.city.buildingTypes.find(p => p.type === getBuildingType(TeleportationPod))?.locked) {
                this.city.unlock(getBuildingType(TeleportationPod));
                this.city.notify(new Notification("Telewhat!?", "Breaking news: Thanks to you bringing so many artifacts back from the Monobrynth, your city's smartypants scientists have figured out how to turn people into temporary particle clouds! They insist it's \"perfectly safe\" and only has a 0.0001% chance of accidentally creating an evil doppelganger. You'll find the Teleportation Pod in the Infrastructure construction category.", "monobrynth"));
            }
        }
    }

    private endGame(): void {
        this.gameStarted = false;
        this.calculateWinnings();
        this.city.updateLastUserActionTime();
        this.game.fullSave();
    }

    private getBestFuelType(): string {
        const coal = this.city.buildings.filter(p => p.inputResources.some(q => q.type === getResourceType(Coal))).length;
        const oil = this.city.buildings.filter(p => p.inputResources.some(q => q.type === getResourceType(Oil))).length;
        const uranium = this.city.buildings.filter(p => p.inputResources.some(q => q.type === getResourceType(Uranium))).length;
        const tritium = this.city.buildings.filter(p => p.inputResources.some(q => q.type === getResourceType(Tritium))).length;
        const best = Math.max(coal, oil, uranium, tritium);
        return best === tritium ? getResourceType(Tritium) : best === uranium ? getResourceType(Uranium) : best === oil ? getResourceType(Oil) : getResourceType(Coal);
    }

    private calculateWinnings(): void {
        this.winnings = [];
        if (this.isPractice) return;
        const multiplier = this.difficulty.rewardMultiplier;

        //This minigame has a fairly low skill cap, so the rewards aren't too high. Note: minimum possible score is 28 if you play it perfectly and get unlucky with the artifact types.
        if (this.city.minigameOptions.get("mb-r") === "1") {
            //"Scraps" reward set--much more metals, fewer electronics, no research
            this.winnings.push(new Copper(rangeMapLinear(this.score, 0.1, 6, 5, 20, 0.1, multiplier))); //6*3=18
            this.winnings.push(new Silicon(rangeMapLinear(this.score, 0.1, 7, 10, 35, 0.1, multiplier))); //7*7=49
            this.winnings.push(new Iron(rangeMapLinear(this.score, 0.1, 8, 15, 35, 0.1, multiplier))); //8*2=16
            this.winnings.push(new Steel(rangeMapLinear(this.score, 0.1, 3, 25, 30, 0.1, multiplier))); //3*5=15
            this.winnings.push(new Gemstones(rangeMapLinear(this.score, 0.1, 1, 25, 45, 0.1, multiplier))); //1*9.5=9.5
            this.winnings.push(new Lithium(rangeMapLinear(this.score, 0.1, 4, 30, 40, 0.1, multiplier))); //4*5=20
            this.winnings.push(new Electronics(rangeMapLinear(this.score, 0.1, 3, 30, 40, 0.1, multiplier))); //3*8.5=25.5. Total: 153 (but no research)
            if (this.score > 45) this.winnings[this.winnings.length - 2].amount += rangeMapLinear(this.score, 0, 2, 45, 80, 0.1, multiplier); //Diminished returns for extreme scores (probably on Hard)
        } else if (this.city.minigameOptions.get("mb-r") === "2") {
            //"Fuel Replicator" reward set--just fuel, equivalent to 100 flunds worth at 50 points, depending on what fuel you're currently using the most (defaults to Coal)
            const rewardType = this.city.resources.get(this.getBestFuelType())?.clone() ?? new Coal();
            rewardType.amount = rangeMapLinear(this.score, 0.1, 100, 15, 50, 0.1, multiplier) / rewardType.sellPrice; //100 flunds worth at 50 points
            this.winnings.push(new Research(rangeMapLinear(this.score, 0.1, 2, 20, 50, 0.1, multiplier))); //Making up for the rest with research points
            if (this.score > 50) this.winnings[this.winnings.length - 1].amount += rangeMapLinear(this.score, 0, 1, 50, 80, 0.1, multiplier); //Diminished returns for extreme scores (probably on Hard)
            this.winnings.push(rewardType);
        } else {
            //"Artifacts" reward set--mainly valuables
            this.winnings.push(new Silicon(rangeMapLinear(this.score, 0.1, 4, 5, 20, 0.1, multiplier))); //4*7=28
            this.winnings.push(new Electronics(rangeMapLinear(this.score, 0.1, 4, 10, 25, 0.1, multiplier))); //4*8.5=34
            this.winnings.push(new Gemstones(rangeMapLinear(this.score, 0.1, 4, 15, 45, 0.1, multiplier))); //4*9.5=38
            this.winnings.push(new Tritium(rangeMapLinear(this.score, 0.1, 4, 20, 35, 0.1, multiplier))); //4*12=48. Total: 148
            this.winnings.push(new Research(rangeMapLinear(this.score, 0.1, 1.5, 25, 50, 0.1, multiplier))); //A lower limit--research points were way too easy to earn
            if (this.score > 50) this.winnings[this.winnings.length - 1].amount += rangeMapLinear(this.score, 0, 1, 50, 80, 0.1, multiplier); //Diminished returns for extreme scores (probably on Hard)
        }

        this.winnings = filterConvertAwardWinnings(this.city, this.winnings);
        progressMinigameOptionResearch(this.city, rangeMapLinear(this.score, 0.01, 0.06, 28, 78, 0.001, multiplier));
    }

    public startGame(): void {
        if (this.city.checkAndSpendResources(this.isPractice ? OnePracticeRun : this.costs)) {
            this.initializeGame();
            this.city.updateLastUserActionTime();
            this.game.fullSave();
        }
    }

    public show(): void {
        this.shown = true;
    }

    public hide(): void {
        this.shown = false;
        if (this.memorizeTimeout !== null) {
            clearTimeout(this.memorizeTimeout);
            this.memorizeTimeout = null;
        }
    }

    public isShown(): boolean {
        return this.shown;
    }

    public isPlaying(): boolean { return this.shown && this.gameStarted; }

    public handleMove(x: number, y: number): void {
        if (!this.gameStarted || !this.isReachable(x, y) || this.userInputLocked || this.currentSequence.length) return;

        this.playerPosition = [x, y];
        const currentTile = this.grid[y][x];

        if (currentTile.content.includes('monster')) {
            this.startBattle(currentTile.difficulty);
        } else {
            this.showBattleSuccess(currentTile);
        }

        this.updateTileVisibility();
    }

    private updateTileVisibility(): void {
        const [x, y] = this.playerPosition;
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

        directions.forEach(([dx, dy]) => {
            const newX = x + dx;
            const newY = y + dy;
            if (newX >= 0 && newX < this.difficulty.gridWidth && newY >= 0 && newY < this.difficulty.gridHeight) {
                if (this.grid[newY][newX].visibility === 'hidden') {
                    this.grid[newY][newX].visibility = 'seen';
                }
            }
        });
    }

    private isReachable(x: number, y: number): boolean {
        //Reachable if any adjacent tile is cleared or if this one is on the top row
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            if (x + dx < 0 || x + dx >= this.difficulty.gridWidth || y + dy >= this.difficulty.gridHeight) continue;
            if (y + dy < 0 || this.grid[y + dy][x + dx].visibility === 'revealed') return true;
        }
        return false;
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "alienGame"
        });

        if (!this.gameStarted) {
            this.drawStartOverlay(mainDrawable);
            if (!this.howToPlayShown) this.drawCloseButton(mainDrawable);
        } else {
            this.drawGameArea(mainDrawable);
        }

        this.lastDrawable = mainDrawable;
        return mainDrawable;
    }

    private drawStartOverlay(parent: Drawable): void {
        const overlay = parent.addChild(new Drawable({
            anchors: ["centerX"],
            centerOnOwnX: true,
            width: "min(100%, 600px)",
            height: "100%", //Has to be 100% for the drag-to-scroll to work.
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
        const baseY = nextY;
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "48px",
            text: "Monobrynth",
        }));
        nextY += 70;

        nextY = this.drawClothingSelector(overlay, nextY);
        if (this.city.unlockedMinigameOptions.has("mb-s1")) nextY = this.drawDifficultySelector(overlay, nextY);

        const startButton = overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "220px",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => this.startGame(),
            id: "startButton",
            children: [
                new Drawable({
                    anchors: ["centerX"],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: this.winnings.length ? "Play Again" : "Start Game",
                    centerOnOwnX: true
                })
            ]
        }));

        const costs = this.isPractice ? OnePracticeRun : this.costs;
        const unaffordable = !this.city.hasResources(costs, false);
        addResourceCosts(startButton, costs, 110 - 24 * costs.length, 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
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

        //How to play button
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

        if (this.winnings.length) {
            //Draw the winnings from the last playthrough
            const winningsArea = overlay.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: nextY,
                width: "min(100%, 500px)",
                height: "500px",
                fallbackColor: '#444444',
                id: "winningsArea"
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                biggerOnMobile: true,
                scaleYOnMobile: true,
                y: 10,
                width: "250px",
                height: "32px",
                text: "Score: " + this.score,
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                biggerOnMobile: true,
                scaleYOnMobile: true,
                y: 58,
                width: "250px",
                height: "32px",
                text: "Rewards attained:",
            }));
            winningsArea.addChild(new Drawable({
                x: 107,
                y: 100,
                width: "100%",
                fallbackColor: '#00000000',
                scaleYOnMobile: true
            }));
            addResourceCosts(winningsArea.children[winningsArea.children.length - 1], this.winnings, 0, 0, false, false, false, 64, 10, 32, 4);
            nextY += 510;
        }

        nextY = drawMinigameOptions(this.city, overlay, nextY, [
            { group: "mb-r", id: "0", text: "Artifacts (+silicon, electronics, gemstones, tritium, research)", icon: "resource/electronics" },
            { group: "mb-r", id: "1", text: "Scraps (+metals, gemstones, electronics)", icon: "resource/steel" },
            { group: "mb-r", id: "2", text: "Fuel Replicator (+needed fuel, research)", icon: "resource/" + this.getBestFuelType() }]);

        this.scroller.setChildrenSize(nextY - baseY);
    }

    private drawClothingSelector(parent: Drawable, nextY: number): number {
        const selector = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "360px",
            height: "48px",
            fallbackColor: '#00000000',
        }));

        selector.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 9,
            width: "240px",
            height: "38px",
            text: "Clothing (+HP)",
        }));

        if (this.clothingToUse > 0)
            selector.addChild(new Drawable({
                width: "48px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => this.changeClothing(-1),
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        centerOnOwnX: true,
                        y: 9,
                        width: "32px",
                        height: "38px",
                        text: "-",
                    })
                ]
            }));

        if (this.clothingToUse < 3)
            selector.addChild(new Drawable({
                anchors: ['right'],
                width: "48px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => this.changeClothing(1),
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        centerOnOwnX: true,
                        y: 9,
                        width: "32px",
                        height: "38px",
                        text: "+",
                    })
                ]
            }));

        return nextY + 64;
    }

    private changeClothing(change: number): void {
        this.clothingToUse = Math.max(0, Math.min(3, this.clothingToUse + change));
        this.costs.find(p => p.type === new Clothing().type)!.amount = this.clothingToUse;
    }

    private drawDifficultySelector(overlay: Drawable, nextY: number): number {
        const selector = overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "58px",
            fallbackColor: '#00000000'
        }));

        ['easy', 'medium', 'hard'].forEach((difficulty, index) => {
            const affordable = this.city.hasResources([{ type: new MonobrynthPlays().type, amount: DIFFICULTY_SETTINGS[difficulty as Difficulty].playCost }], false);
            selector.addChild(new Drawable({
                anchors: [index === 0 ? 'left' : index === 1 ? 'centerX' : 'right'],
                centerOnOwnX: index === 1,
                x: index === 1 ? 0 : 10,
                width: index === 1 ? "38%" : "28%",
                height: "58px",
                fallbackColor: this.selectedDifficulty === difficulty ? '#666666' : '#444444',
                onClick: () => {
                    this.selectedDifficulty = difficulty as Difficulty;
                    this.costs.find(p => p.type === new MonobrynthPlays().type)!.amount = this.difficulty.playCost;
                },
                children: [
                    new Drawable({
                        anchors: ["centerX"],
                        y: 11,
                        width: "calc(100% - 10px)",
                        height: "90%",
                        reddize: !affordable,
                        text: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
                        centerOnOwnX: true
                    })
                ]
            }));
        });

        return nextY + 73;
    }

    private drawCloseButton(parent: Drawable): void {
        if (this.howToPlayShown) return;
        parent.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(64, 64, "ui/x"),
            id: "closeButton",
            onClick: () => {
                this.uiManager.hideMinigame();
            }
        }));
    }

    private toggleRules(): void {
        this.howToPlayShown = !this.howToPlayShown;
        if (this.howToPlayShown) {
            this.scroller.resetScroll();
        }
    }

    drawHowToPlay(overlay: Drawable, root: Drawable): void {
        let parent = overlay;
        parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10 - this.scroller.getScroll(),
            width: "100%",
            height: "48px",
            text: "Monobrynth Rules",
        }));

        root.onClick = () => this.toggleRules();
        root.onDrag = (x: number, y: number) => { this.scroller.handleDrag(y, root.screenArea); };
        root.onDragEnd = () => { this.scroller.resetDrag(); };

        parent = parent.addChild(new Drawable({
            x: 20,
            y: 80 - this.scroller.getScroll(),
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Choose your route through the alien labyrinth.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Each space may have a monster, a treasure, both, or neither.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You can move to any space cardinally adjacent to an empty one.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Each space has its own difficulty, and harder spaces have a higher chance for both treasure and a monster.",
        }));

        //Show easy, medium, and hard tiles with the labels.
        const difficulties = ['easy', 'medium', 'hard'];
        difficulties.forEach((difficulty, index) => {
            parent.addChild(new Drawable({
                anchors: ['bottom', 'centerX'],
                centerOnOwnX: true,
                x: (index - 1) * 100,
                y: -50,
                width: "48px",
                height: "48px",
                image: new TextureInfo(64, 64, `minigame/alien${difficulty}`),
            }));
            parent.addChild(new Drawable({
                anchors: ['bottom', 'centerX'],
                centerOnOwnX: true,
                x: (index - 1) * 100,
                y: -95,
                width: "80px",
                height: "30px",
                text: difficulty,
            }));
        });

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -145,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You get 6 seconds to memorize the rune sequence. Repeat it to defeat monsters.",
        }));

        //Render the six symbols
        for (let i = 0; i < SYMBOL_COUNT; i++) {
            parent.addChild(new Drawable({
                anchors: ['bottom', 'centerX'],
                centerOnOwnX: true,
                x: (i - 2.5) * 80,
                y: -50,
                width: "48px",
                height: "48px",
                image: new TextureInfo(64, 64, `minigame/aliensymbol${i}`),
            }));
        }

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -110,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you mess up, the monster melts your clothes.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you run out of clothes, you return to the city in shame... and probably get arrested.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Bring extra sets of clothes to defend yourself from the slimy monsters.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Collect artifacts to raise your score.",
        }));

        //Treasure names and icons
        const treasures = ['artifact', 'shield', 'map'];
        treasures.forEach((treasure, index) => {
            parent.addChild(new Drawable({
                anchors: ['bottom', 'centerX'],
                centerOnOwnX: true,
                x: (index - 1) * 100,
                y: -50,
                width: "48px",
                height: "48px",
                image: new TextureInfo(64, 64, `minigame/alien${treasure}`),
            }));
            parent.addChild(new Drawable({
                anchors: ['bottom', 'centerX'],
                centerOnOwnX: true,
                x: (index - 1) * 100,
                y: -95,
                width: "80px",
                height: "30px",
                text: treasure === 'artifact' ? 'relic' : treasure === 'shield' ? 'shield' : 'scanner',
            }));
        });

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -145,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Reach the bottom for bonus points.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You can end the game by leaving the labyrinth instead of visiting a new space.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Increase your score for better rewards.",
        }));

        this.scroller.setChildrenSize(1300);
    }

    private drawGameArea(parent: Drawable): void {
        const gameArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            y: 20,
            width: "min(100%, 600px)",
            height: "100%",
            fallbackColor: '#333333',
            id: "gameArea",
            centerOnOwnX: true
        }));

        this.drawGrid(gameArea);
        this.drawHP(gameArea);
        this.drawScore(gameArea);

        gameArea.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 10,
            width: "96px",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => { if (!this.userInputLocked) this.endGame(); },
            children: [
                new Drawable({
                    anchors: ["centerX"],
                    y: 5,
                    width: "calc(100% - 10px)",
                    height: "100%",
                    text: this.reachedEnd ? "Exit" : "Escape",
                    centerOnOwnX: true
                })
            ]
        }));

        if (this.currentSequence.length) this.drawBattleScreen(gameArea);

        this.drawTreasures(gameArea);
    }

    private drawScore(parent: Drawable): void {
        parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            y: 20,
            width: "200px",
            height: "40px",
            text: `Score: ${this.score}`,
        }));
    }

    private drawGrid(parent: Drawable): void {
        const gridArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: HP_ICON_SIZE + 80,
            width: (this.difficulty.gridWidth * GRID_TILE_SIZE) + "px",
            height: (this.difficulty.gridHeight * GRID_TILE_SIZE) + "px",
            fallbackColor: '#333333',
            id: "gridArea"
        }));

        this.grid.forEach((row, y) => {
            row.forEach((tile, x) => {
                const tileDrawable = gridArea.addChild(new Drawable({
                    x: x * GRID_TILE_SIZE,
                    y: y * GRID_TILE_SIZE,
                    width: GRID_TILE_SIZE + "px",
                    height: GRID_TILE_SIZE + "px",
                    fallbackColor: tile.visibility === "hidden" ? '#333333' : tile.visibility === "revealed" ? "#555555" : tile.difficulty === 'easy' ? '#00FF0055' : tile.difficulty === 'medium' ? '#FFFF0055' : '#FF000055',
                    image: new TextureInfo(GRID_TILE_SIZE, GRID_TILE_SIZE, "minigame/alien" + (tile.visibility === "hidden" ? "grid" : tile.visibility === "revealed" ? "gridrevealed" : tile.difficulty)),
                    onClick: this.currentSequence.length ? undefined : () => this.handleMove(x, y), //Can't move when in battle, and it interferes with the symbol-tapping without this condition.
                }));

                if (tile.visibility === 'revealed') {
                    const revealedItemSize = GRID_TILE_SIZE / 2;
                    tile.content.forEach((content, index) => {
                        tileDrawable.addChild(new Drawable({
                            x: (index % 2) * revealedItemSize, //Up to 4 can fit
                            y: Math.floor(index / 2) * revealedItemSize,
                            width: revealedItemSize + "px",
                            height: revealedItemSize + "px",
                            fallbackColor: content === 'treasure' ? '#00FF00' : '#FF0000',
                            image: new TextureInfo(32, 32, `minigame/alien${content}`),
                        }));
                    });
                }

                if (this.playerPosition[0] === x && this.playerPosition[1] === y) {
                    tileDrawable.addChild(new Drawable({
                        x: GRID_TILE_SIZE * 0.25,
                        y: GRID_TILE_SIZE * 0.25,
                        width: "50%",
                        height: "50%",
                        fallbackColor: '#0066FF',
                        image: new TextureInfo(GRID_TILE_SIZE, GRID_TILE_SIZE, "minigame/alienplayer"),
                    }));
                }
            });
        });
    }

    private drawHP(parent: Drawable): void {
        //Icons squish to fit if there are more than 7 (so there's room for the Escape/Exit button by them)
        const MAX_WIDE = 7;
        const HP_ICON_WIDTH = Math.min(HP_ICON_SIZE, MAX_WIDE * HP_ICON_SIZE / Math.max(1, this.hp.length));
        const hpArea = parent.addChild(new Drawable({
            x: 10,
            y: 10,
            width: HP_ICON_WIDTH + "px",
            height: HP_ICON_SIZE + "px",
            fallbackColor: '#00000000',
            id: "hpArea"
        }));
        
        for (let i = 0; i < this.hp.length; i++) {
            hpArea.addChild(new Drawable({
                x: i * HP_ICON_WIDTH,
                width: HP_ICON_WIDTH + "px",
                height: HP_ICON_SIZE + "px",
                image: new TextureInfo(HP_ICON_SIZE, HP_ICON_SIZE, this.hp[i] === 'clothing' ? "resource/clothing" : "minigame/alienshield"),
            }));
        }
    }

    private drawSymbolButtons(parent: Drawable): void {
        const buttonArea = parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            y: 20,
            width: (SYMBOL_BUTTON_SIZE * 3) + "px",
            height: (SYMBOL_BUTTON_SIZE * 2) + "px",
            fallbackColor: '#00000000',
            id: "symbolButtonArea"
        }));

        for (let i = 0; i < SYMBOL_COUNT; i++) {
            const x = (i % 3) * SYMBOL_BUTTON_SIZE;
            const y = Math.floor(i / 3) * SYMBOL_BUTTON_SIZE;
            buttonArea.addChild(new Drawable({
                x,
                y,
                width: SYMBOL_BUTTON_SIZE + "px",
                height: SYMBOL_BUTTON_SIZE + "px",
                image: new TextureInfo(SYMBOL_BUTTON_SIZE, SYMBOL_BUTTON_SIZE, `minigame/aliensymbol${i}`),
                onClick: () => this.checkSymbol(i),
            }));
        }
    }

    private drawBattleScreen(parent: Drawable): void {
        const battleArea = parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            y: 100,
            width: "min(100%, 500px)",
            height: "500px",
            fallbackColor: '#000000CC',
            id: "battleArea"
        }));

        battleArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 30 + MEMORIZATION_SEQUENCE_SIZE,
            x: -64,
            width: "96px",
            height: "96px",
            image: new TextureInfo(64, 64, "minigame/alienplayer"),
        }));
        battleArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 30 + MEMORIZATION_SEQUENCE_SIZE,
            x: 64,
            width: "96px",
            height: "96px",
            image: new TextureInfo(64, 64, "minigame/alienmonster"),
        }));

        if (!this.sequenceFailed) {
            //Draw a wall (using just fallbackColor) between them according to currentSequenceIndex / currentSequence.length
            const wallHeight = 48 * Math.max(0.1, this.currentSequenceIndex) / this.currentSequence.length;
            battleArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 30 + MEMORIZATION_SEQUENCE_SIZE,
                width: "16px",
                height: wallHeight + "px",
                fallbackColor: '#666666',
            }));
            battleArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 30 + MEMORIZATION_SEQUENCE_SIZE + 96 - wallHeight,
                width: "16px",
                height: wallHeight + "px",
                fallbackColor: '#666666',
            }));
        }

        this.drawMemorizationSequence(battleArea);
        if (!this.sequenceVisible) this.drawSymbolButtons(battleArea);
    }

    private drawMemorizationSequence(parent: Drawable): void {
        const sequenceArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 20,
            width: (MEMORIZATION_SEQUENCE_SIZE * this.currentSequence.length) + "px",
            height: MEMORIZATION_SEQUENCE_SIZE + "px",
            fallbackColor: '#00000000',
            id: "sequenceArea"
        }));

        this.currentSequence.forEach((symbol, index) => {
            if (this.sequenceVisible || this.currentSequenceIndex > index) {
                const symbolDrawable = sequenceArea.addChild(new Drawable({
                    x: index * MEMORIZATION_SEQUENCE_SIZE,
                    width: MEMORIZATION_SEQUENCE_SIZE + "px",
                    height: MEMORIZATION_SEQUENCE_SIZE + "px",
                    image: new TextureInfo(MEMORIZATION_SEQUENCE_SIZE, MEMORIZATION_SEQUENCE_SIZE, `minigame/aliensymbol${symbol}`),
                }));

                if (this.sequenceFailed && index === this.currentSequenceIndex) {
                    symbolDrawable.reddize = true;
                }
            }
        });
    }

    private drawTreasures(parent: Drawable): void {
        if (!this.collectingTreasures || !this.collectingTreasures.length) return;
        const treasureArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 340,
            width: 20 + this.collectingTreasures.length * 64 + "px",
            height: "126px",
            fallbackColor: '#000000CC',
            id: "treasureArea"
        }));

        treasureArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "calc(100% - 20px)",
            height: "32px",
            text: "Found",
        }));

        this.collectingTreasures.forEach((treasure, index) => {
            treasureArea.addChild(new Drawable({
                x: 10 + index * 64,
                y: 52,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, `minigame/alien${treasure.type}`),
            }));
        });
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;
        const urls = {
            "minigame/aliensymbol0": "assets/minigame/aliensymbol0.png",
            "minigame/aliensymbol1": "assets/minigame/aliensymbol1.png",
            "minigame/aliensymbol2": "assets/minigame/aliensymbol2.png",
            "minigame/aliensymbol3": "assets/minigame/aliensymbol3.png",
            "minigame/aliensymbol4": "assets/minigame/aliensymbol4.png",
            "minigame/aliensymbol5": "assets/minigame/aliensymbol5.png",
            "minigame/alienplayer": "assets/minigame/alienplayer.png", //Definitely have to show where the player is
            "minigame/alienmonster": "assets/minigame/alienmonster.png", //Enemy
            "minigame/alientreasure": "assets/minigame/alientreasure.png", //Unknown treasure type
            "minigame/alienartifact": "assets/minigame/alienartifact.png", //Artifact treasure
            "minigame/alienshield": "assets/minigame/alienshield.png", //Shield treasure
            "minigame/alienmap": "assets/minigame/alienmap.png", //Map treasure
            "minigame/aliengrid": "assets/minigame/aliengrid.png", //Grid tiles
            "minigame/aliengridrevealed": "assets/minigame/aliengridrevealed.png",
            "minigame/alieneasy": "assets/minigame/alieneasy.png",
            "minigame/alienmedium": "assets/minigame/alienmedium.png",
            "minigame/alienhard": "assets/minigame/alienhard.png",
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}