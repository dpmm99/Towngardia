import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { Resource } from "../game/Resource.js";
import { Coal, Copper, Electronics, Grain, Iron, Oil, Research, Silicon, StarboxPlays, Stone, Tritium, Uranium, Wood } from "../game/ResourceTypes.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts } from "../ui/UIUtil.js";
import { OnePracticeRun, filterConvertAwardWinnings, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultySettings { //Could also feasibly adjust ease of earning black holes and chance of superior pieces
    gridWidth: number;
    gridHeight: number;
    playCost: number;
    rewardMultiplier: number;
    normalStarTypes: number;
    startingStars: number;
    superiorPieceChance: number;
}

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
    easy: { gridWidth: 7, gridHeight: 12, playCost: 1, rewardMultiplier: 1, normalStarTypes: 6, startingStars: 35, superiorPieceChance: 0.5 },
    medium: { gridWidth: 7, gridHeight: 11, playCost: 1, rewardMultiplier: 1.1, normalStarTypes: 6, startingStars: 25, superiorPieceChance: 0.2 }, //10% more rewards but chance of 2 of the same piece is lowered by 30 percentage points
    hard: { gridWidth: 7, gridHeight: 11, playCost: 1, rewardMultiplier: 1.3, normalStarTypes: 7, startingStars: 15, superiorPieceChance: 0.5 }, //30% more rewards but there's a 7th star type
};

export class Starbox implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: Resource[] = [];
    private tileSize: number = 64;
    private nextPieces: number[][] = [[], []];
    private gameBoard: number[][] = [];
    private currentPiece: number[] = [];
    private currentPiecePosition: { x: number, y: number } = { x: 0, y: 0 };
    private maxTime: number = 180;
    private timer: number = this.maxTime;
    private timerTimeout: NodeJS.Timeout | null = null;
    private blackHoles: number = 0;
    private usingBlackHole: boolean = false;
    private chainReactionCount: number = 0;
    private totalStarsDestroyed: number = 0;
    private starsDestroyedThisChain: number = 0;
    private explosions: { x: number, y: number, frame: number }[] = [];
    private fallingStars: { x: number, y: number, targetY: number, color: number }[] = [];
    private preloaded: boolean = false;
    private costs = [{ type: new StarboxPlays().type, amount: 1, reddize: false }];
    private userInputLocked: boolean = false;
    private isPractice: boolean = false;
    private selectedDifficulty: Difficulty = 'easy';

    constructor(private city: City, private uiManager: UIManager, private game: GameState) {
        this.initializeGame();
    }

    public isPlaying(): boolean { return this.shown && this.gameStarted; }

    public onKeyDown(event: KeyboardEvent): void {
        if (this.shown && this.gameStarted && !this.userInputLocked) {
            switch (event.key) { //I just configured it for both Dvorak and Qwerty. Probably will never try to support arbitrary setups.
                case "a": case "ArrowLeft": this.moveLeft(); break;
                case "d": case "e": case "ArrowRight": this.moveRight(); break;
                case "w": case ",": case "ArrowUp": this.rotateClockwise(); break;
                case "s": case "o": case "ArrowDown": this.rotateCounterclockwise(); break;
                case " ": this.dropPiece(); break;
                case "b": case "x": case "q": this.useBlackHole(); break;
            }
            this.uiManager.frameRequested = true;
        }
    }

    private get difficulty(): DifficultySettings { return DIFFICULTY_SETTINGS[this.selectedDifficulty]; }

    private initializeGame(): void {
        this.gameBoard = Array(this.difficulty.gridHeight).fill(null).map(() => Array(this.difficulty.gridWidth).fill(0));
        this.nextPieces = this.nextPieces.map(p => this.generatePiece());
        this.currentPiece = this.generatePiece();
        this.currentPiecePosition = { x: Math.floor(this.difficulty.gridWidth / 2) - 1, y: 0 };
        this.timer = this.maxTime;
        this.blackHoles = 0;
        this.usingBlackHole = false;
        this.chainReactionCount = 0;
        this.totalStarsDestroyed = 0;
        this.starsDestroyedThisChain = 0;
        this.explosions = [];
        this.fallingStars = [];
        this.userInputLocked = false;

        // Distribute initial stars
        let starsPlaced = 0;
        let placedByX: number[] = Array(this.difficulty.gridWidth).fill(0);
        while (starsPlaced < this.difficulty.startingStars) {
            const x = Math.floor(Math.random() * this.difficulty.gridWidth);
            const y = this.difficulty.gridHeight - 1 - placedByX[x];
            if (y < 4) continue; //Don't stack too high or the player won't even be able to start (give 1 layer of buffer, anyway)
            placedByX[x]++;

            //Rotate through the different piece types until you're certain this won't cause a match immediately at game start
            //Due to the placement technique, you only have to check below and then 2 to the left, 1 on either side, and 2 to the right to be sure that it won't cause a match.
            let chosenPiece = Math.floor(Math.random() * this.difficulty.normalStarTypes) + 1;
            while ((y < this.difficulty.gridHeight - 2 && chosenPiece === this.gameBoard[y + 1][x] && chosenPiece === this.gameBoard[y + 2][x]) ||
                (x >= 2 && chosenPiece == this.gameBoard[y][x - 2] && chosenPiece == this.gameBoard[y][x - 1]) ||
                (x >= 1 && x < this.difficulty.gridWidth - 1 && chosenPiece == this.gameBoard[y][x - 1] && chosenPiece == this.gameBoard[y][x + 1]) ||
                (x < this.difficulty.gridWidth - 2 && chosenPiece == this.gameBoard[y][x + 1] && chosenPiece == this.gameBoard[y][x + 2]))
                chosenPiece = (chosenPiece % this.difficulty.normalStarTypes) + 1;

            this.gameBoard[y][x] = chosenPiece;
            starsPlaced++;
        }

        this.startTimer();
    }

    private generatePiece(): number[] {
        const ret = Array(3).fill(0).map(() => Math.floor(Math.random() * this.difficulty.normalStarTypes) + 1);
        if (Math.random() < this.difficulty.superiorPieceChance) ret[0] = ret[Math.floor(Math.random() * 2) + 1]; //Be nice: grant a slightly higher chance to get 2 or 3 of the same piece.
        return ret;
    }

    private startTimer(): void {
        this.timerTimeout = setTimeout(() => {
            if (!this.gameStarted) return; //Just in case
            this.timer--;
            if (this.timer <= 0) {
                this.endGame();
            } else {
                this.startTimer();
            }
            this.uiManager.frameRequested = true; //So it's basically 1 FPS plus another frame whenever the user acts or a star is falling.
        }, 1000);
    }

    private endGame(): void {
        if (this.timerTimeout) {
            clearTimeout(this.timerTimeout);
        }

        this.calculateWinnings();
        this.userInputLocked = true;
        setTimeout(() => { this.gameStarted = false; }, 1000); //Will wait for the user to tap to continue.
    }

    private calculateWinnings(): void {
        this.winnings = [];
        if (this.isPractice) return;
        let extraFlunds = 0;

        //Note: My score tends to be about 260-280, and I like to think I'm pretty good, so rewards should cap around 220-240.
        //This minigame has a higher skill cap than most of them, so the rewards are much more meaningful than the others.
        if (this.city.minigameOptions.get("sb-r") === "1") {
            //"Star Fuel" reward set--higher minimum, just nuclear fuel, lower total flunds value
            this.winnings.push(new Uranium(rangeMapLinear(this.totalStarsDestroyed, 0.5, 6, 70, 220, 0.1))); //6*9=54
            this.winnings.push(new Tritium(rangeMapLinear(this.totalStarsDestroyed, 0.5, 6, 110, 240, 0.1))); //6*12=72. Sum of all: 126 flunds
        } else if (this.city.minigameOptions.get("sb-r") === "2") {
            //"Fermi Paradox" reward set: silicon, a few plants, coal, oil, electronics, research points
            this.winnings.push(new Silicon(rangeMapLinear(this.totalStarsDestroyed, 0.1, 5, 30, 100, 0.1))); //5*7=35
            this.winnings.push(new Grain(rangeMapLinear(this.totalStarsDestroyed, 0.1, 16, 40, 180, 0.1))); //16*1=16
            this.winnings.push(new Wood(rangeMapLinear(this.totalStarsDestroyed, 0.1, 20, 80, 260, 0.1))); //20*1=20
            this.winnings.push(new Coal(rangeMapLinear(this.totalStarsDestroyed, 0.1, 6, 100, 220, 0.1))); //4*6=24
            this.winnings.push(new Oil(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 120, 240, 0.1))); //4*5=20
            this.winnings.push(new Electronics(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 140, 280, 0.1))); //4*8.5=34. Sum of all: 149 flunds
            this.winnings.push(new Research(rangeMapLinear(this.totalStarsDestroyed, 0.1, 2, 160, 280, 0.1))); //A lower limit--research points were way too easy to earn
        } else {
            //"Elements" reward set
            this.winnings.push(new Silicon(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 30, 80, 0.1))); //4*7=28
            this.winnings.push(new Stone(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 40, 110, 0.1))); //4*3=12
            this.winnings.push(new Iron(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 60, 140, 0.1))); //4*2=8
            this.winnings.push(new Copper(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 100, 160, 0.1))); //4*3=12
            this.winnings.push(new Research(rangeMapLinear(this.totalStarsDestroyed, 0.1, 2, 120, 280, 0.1))); //A lower limit--research points were way too easy to earn
            this.winnings.push(new Uranium(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 150, 220, 0.1))); //4*9=36
            this.winnings.push(new Tritium(rangeMapLinear(this.totalStarsDestroyed, 0.1, 4, 170, 240, 0.1))); //4*12=48. Sum of all: 144 flunds
        }

        this.winnings = filterConvertAwardWinnings(this.city, this.winnings, extraFlunds);
        const multiplier = this.difficulty.rewardMultiplier;
        this.winnings.forEach(p => p.amount *= multiplier);
        progressMinigameOptionResearch(this.city, multiplier * rangeMapLinear(this.totalStarsDestroyed, 0.01, 0.07, 100, 300, 0.001));
        this.city.updateLastUserActionTime();
        this.game.fullSave();
    }

    onResize(): void {
        this.scroller.onResize();
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "starboxGame"
        });

        if (!this.gameStarted) {
            this.drawStartOverlay(mainDrawable);
            if (!this.howToPlayShown) this.drawCloseButton(mainDrawable);
        } else {
            this.updateGameState();
            this.drawGameArea(mainDrawable);
            this.drawNextPieces(mainDrawable);
            this.drawControls(mainDrawable);
            this.drawTimer(mainDrawable);

            if (this.userInputLocked) {
                //Draw a "Time's up!" message with a plain background color in the center of the grid.
                mainDrawable.addChild(new Drawable({
                    anchors: ['centerX'],
                    centerOnOwnX: true,
                    y: 100 + this.difficulty.gridHeight * this.tileSize / 2 - 32,
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
                            text: "Time's up!",
                        })
                    ]
                }));
            }
        }

        this.lastDrawable = mainDrawable;
        return mainDrawable;
    }

    private updateGameState(): void {
        if (this.explosions.length > 0) {
            this.updateExplosions();
        } else if (this.fallingStars.length > 0) {
            this.updateFallingStars();
        } else {
            this.checkForMatches();
        }
    }

    private updateExplosions(): void {
        this.explosions.forEach(explosion => explosion.frame++);
        this.explosions = this.explosions.filter(explosion => explosion.frame < 3);
        if (this.explosions.length === 0) {
            this.applyGravity();
        }
        this.uiManager.frameRequested = true;
    }

    private updateFallingStars(): void {
        let allSettled = true;
        this.fallingStars.forEach(star => {
            if (star.y < star.targetY) {
                star.y++;
                allSettled = false;
            }
        });
        //this.fallingStars = this.fallingStars.filter(star => star.y < star.targetY); //seems like a stupid idea to do this :)
        if (allSettled) {
            this.fallingStars.forEach(star => {
                this.gameBoard[star.targetY][star.x] = star.color;
            });
            this.fallingStars = [];
            this.checkForMatches();
        } else {
            this.uiManager.frameRequested = true;
        }
    }

    private checkForMatches(): void {
        const matches = this.findMatches();
        if (matches.length > 0) {
            this.chainReactionCount++;
            this.starsDestroyedThisChain += matches.length;
            this.totalStarsDestroyed += matches.length;

            // Add time based on simultaneous matches
            const timeToAdd = Math.max(0, Math.min(matches.length - 3, 9)); // Max 14 matches at once, so max 11 seconds added
            this.timer = Math.min(this.timer + timeToAdd, this.maxTime);

            // Create explosions
            this.explosions = matches.map(match => ({ x: match.x, y: match.y, frame: 0 }));

            // Remove matched stars from the board
            matches.forEach(match => {
                this.gameBoard[match.y][match.x] = 0;
            });

            this.uiManager.frameRequested = true;
        } else if (!this.currentPiece.length) {
            // Grant black hole reward for 5+ in a row or in a chain reaction
            this.blackHoles += Math.max(0, Math.floor(this.starsDestroyedThisChain / 5) - (this.usingBlackHole ? 1 : 0)); //Not so many freebies in response to black holes.

            this.chainReactionCount = 0;
            this.starsDestroyedThisChain = 0;
            this.spawnNewPiece();
        }
    }

    private findMatches(): { x: number, y: number }[] {
        const matches: { x: number, y: number }[] = [];

        // Check horizontal matches
        for (let y = 0; y < this.difficulty.gridHeight; y++) {
            for (let x = 0; x < this.difficulty.gridWidth - 2; x++) {
                if (this.gameBoard[y][x] !== 0 &&
                    this.gameBoard[y][x] === this.gameBoard[y][x + 1] &&
                    this.gameBoard[y][x] === this.gameBoard[y][x + 2]) {
                    matches.push({ x, y }, { x: x + 1, y }, { x: x + 2, y });
                    // Check for longer matches
                    let nextX = x + 3;
                    while (nextX < this.difficulty.gridWidth && this.gameBoard[y][nextX] === this.gameBoard[y][x]) {
                        matches.push({ x: nextX, y });
                        nextX++;
                    }
                    x = nextX - 1; //Don't count the same pieces twice
                }
            }
        }

        // Check vertical matches
        for (let x = 0; x < this.difficulty.gridWidth; x++) {
            for (let y = 0; y < this.difficulty.gridHeight - 2; y++) {
                if (this.gameBoard[y][x] !== 0 &&
                    this.gameBoard[y][x] === this.gameBoard[y + 1][x] &&
                    this.gameBoard[y][x] === this.gameBoard[y + 2][x]) {
                    matches.push({ x, y }, { x, y: y + 1 }, { x, y: y + 2 });
                    // Check for longer matches
                    let nextY = y + 3;
                    while (nextY < this.difficulty.gridHeight && this.gameBoard[nextY][x] === this.gameBoard[y][x]) {
                        matches.push({ x, y: nextY });
                        nextY++;
                    }
                    y = nextY - 1; //Don't count the same pieces twice
                }
            }
        }

        //Check for black holes
        for (let y = 0; y < this.difficulty.gridHeight; y++) {
            for (let x = 0; x < this.difficulty.gridWidth; x++) {
                if (this.gameBoard[y][x] === 8) {
                    //Black hole
                    matches.push({ x, y });
                    if (x > 0 && this.gameBoard[y][x - 1]) matches.push({ x: x - 1, y });
                    if (x < this.difficulty.gridWidth - 1 && this.gameBoard[y][x + 1]) matches.push({ x: x + 1, y });
                    if (y > 0 && this.gameBoard[y - 1][x]) matches.push({ x, y: y - 1 });
                    if (y < this.difficulty.gridHeight - 1 && this.gameBoard[y + 1][x]) matches.push({ x, y: y + 1 });
                }
            }
        }

        //Only return the distinct results
        return matches.filter((match, index) => matches.findIndex(m => m.x === match.x && m.y === match.y) === index);
    }

    private applyGravity(): void {
        for (let x = 0; x < this.difficulty.gridWidth; x++) {
            let bottomY = this.difficulty.gridHeight - 1;
            for (let y = this.difficulty.gridHeight - 1; y >= 0; y--) {
                if (this.gameBoard[y][x] !== 0) {
                    if (y !== bottomY) {
                        this.fallingStars.push({ x, y, targetY: bottomY, color: this.gameBoard[y][x] });
                        this.gameBoard[y][x] = 0;
                    }
                    bottomY--;
                }
            }
        }
        if (this.fallingStars.length > 0) {
            this.uiManager.frameRequested = true;
        } else {
            this.checkForMatches();
        }
    }

    private spawnNewPiece(): void {
        this.usingBlackHole = false;
        this.currentPiece = this.nextPieces.shift()!;
        this.nextPieces.push(this.generatePiece());
        this.currentPiecePosition = { x: Math.floor(this.difficulty.gridWidth / 2) - 1, y: 0 };

        // Check for game over (no space for new piece)
        if (this.currentPiece.some((color, i) => this.gameBoard[this.currentPiecePosition.y + i][this.currentPiecePosition.x] !== 0)) {
            //First, if they have a black hole, try using that.
            if (this.blackHoles > 0) {
                this.useBlackHole();
            }
            //If they don't have a black hole, or if they do but the current piece is still blocked, end the game.
            if (this.currentPiece.some((color, i) => this.gameBoard[this.currentPiecePosition.y + i][this.currentPiecePosition.x] !== 0)) this.endGame();
        }
    }

    private moveLeft(): void {
        if (this.userInputLocked) return;
        if (this.currentPiecePosition.x > 0 && !this.pieceCollision(-1, 0) && this.currentPiece.length > 0) {
            this.currentPiecePosition.x--;
        }
    }

    private moveRight(): void {
        if (this.userInputLocked) return;
        if (this.currentPiecePosition.x < this.difficulty.gridWidth - 1 && !this.pieceCollision(1, 0) && this.currentPiece.length > 0) {
            this.currentPiecePosition.x++;
        }
    }

    private rotateClockwise(): void {
        if (this.userInputLocked) return;
        if (this.currentPiece.length < 3) return;
        const newPiece = [this.currentPiece[2], this.currentPiece[0], this.currentPiece[1]];
        this.currentPiece = newPiece;
    }

    private rotateCounterclockwise(): void {
        if (this.userInputLocked) return;
        if (this.currentPiece.length < 3) return;
        const newPiece = [this.currentPiece[1], this.currentPiece[2], this.currentPiece[0]];
        this.currentPiece = newPiece;
    }

    private dropPiece(): void {
        if (this.userInputLocked) return;
        //Stamp the piece on the board and add the whole piece to fallingStars via applyGravity
        for (let i = 0; i < this.currentPiece.length; i++) {
            this.gameBoard[i][this.currentPiecePosition.x] = this.currentPiece[i];
        }
        this.currentPiece = []; //Clear it so we know the player can't do any more movements/rotations/black holes at this point
        this.applyGravity();
    }

    private pieceCollision(dx: number, dy: number, piece: number[] = this.currentPiece): boolean {
        const { x, y } = this.currentPiecePosition;
        return piece.some((color, i) => {
            const newX = x + dx;
            const newY = y + i + dy;
            return newX < 0 || newX >= this.difficulty.gridWidth || newY >= this.difficulty.gridHeight || (newY >= 0 && this.gameBoard[newY][newX] !== 0);
        });
    }

    private useBlackHole(): void {
        if (this.userInputLocked) return;
        if (this.blackHoles > 0 && this.currentPiecePosition.y === 0 && !this.fallingStars.length && this.currentPiece.length > 1) {
            this.blackHoles--;
            this.currentPiece = [8]; //The black hole...or magic 8 ball :)
            this.usingBlackHole = true;
        }
    }

    private getStarFallbackColor(starType: number): string {
        switch (starType) {
            case 1: return '#ff0000'; //Red
            case 2: return '#00ff00'; //Green
            case 3: return '#0000ff'; //Blue
            case 4: return '#ffff00'; //Yellow
            case 5: return '#ff00ff'; //Magenta
            case 6: return '#00ffff'; //Cyan
            case 7: return '#ffffff'; //White
            case 8: return '#000000'; //Black 'hole'
            default: return '#555555'; //Gray
        }
    }

    private drawStar(x: number, y: number, type: number): Drawable {
        return new Drawable({
            x: x * this.tileSize - 0.2 * this.tileSize,
            y: y * this.tileSize - 0.2 * this.tileSize,
            width: (this.tileSize * 1.4) + "px",
            height: (this.tileSize * 1.4) + "px",
            image: new TextureInfo(48, 48, `minigame/star${type}`),
            fallbackColor: this.getStarFallbackColor(type),
        });
    }

    private drawGameArea(parent: Drawable): void {
        const gameArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            y: 100,
            width: (this.difficulty.gridWidth * this.tileSize) + "px",
            height: (this.difficulty.gridHeight * this.tileSize) + "px",
            fallbackColor: '#333333',
            id: "gameArea",
            centerOnOwnX: true
        }));

        for (let y = 0; y < this.difficulty.gridHeight; y++) {
            for (let x = 0; x < this.difficulty.gridWidth; x++) {
                const starType = this.gameBoard[y][x];
                if (starType > 0) {
                    gameArea.addChild(this.drawStar(x, y, starType));
                }
            }
        }

        // Draw current piece
        for (let i = 0; i < this.currentPiece.length; i++) {
            gameArea.addChild(this.drawStar(this.currentPiecePosition.x, this.currentPiecePosition.y + i, this.currentPiece[i]));
        }

        // Draw falling stars
        this.fallingStars.forEach(star => gameArea.addChild(this.drawStar(star.x, star.y, star.color)));
    }

    private drawNextPieces(parent: Drawable): void {
        const nextPiecesArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 20,
            width: (this.difficulty.gridWidth * this.tileSize) + "px",
            height: "48px",
            fallbackColor: '#444444',
            id: "nextPiecesArea"
        }));

        for (let turnsUntil = 0; turnsUntil < this.nextPieces.length; turnsUntil++) {
            for (let pieceIndex = 0; pieceIndex < this.nextPieces[turnsUntil].length; pieceIndex++) {
                nextPiecesArea.addChild(new Drawable({
                    x: (turnsUntil * 3 + pieceIndex) * this.tileSize + turnsUntil * 30,
                    y: -0.2 * this.tileSize,
                    width: (this.tileSize * 1.4) + "px",
                    height: (this.tileSize * 1.4) + "px",
                    image: new TextureInfo(64, 64, `minigame/star${this.nextPieces[turnsUntil][pieceIndex]}`),
                    fallbackColor: this.getStarFallbackColor(this.nextPieces[turnsUntil][pieceIndex]),
                }));
            }
        }
    }

    private drawControls(parent: Drawable): void {
        const buttonHeight = 72;

        const controlsArea = parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            biggerOnMobile: true,
            scaleYOnMobile: true,
            y: 10,
            width: "min(" + (this.difficulty.gridWidth * this.tileSize) + "px, 100%)",
            height: (buttonHeight * 2 + 10) + "px",
            fallbackColor: '#00000000',
            id: "controlsArea"
        }));

        // Black Hole button
        controlsArea.addChild(new Drawable({
            width: "50%",
            height: buttonHeight + "px",
            biggerOnMobile: true,
            fallbackColor: '#44444444', //Now transparent, which is slow but doesn't cover the stars
            onClick: () => this.useBlackHole(),
            id: "blackHoleButton",
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    width: "100%",
                    height: "100%",
                    image: new TextureInfo(128, 64, "minigame/starblackhole"),
                    centerOnOwnX: true,
                    grayscale: this.blackHoles === 0,
                    children: [new Drawable({ //Just the count
                        anchors: ['centerX'],
                        centerOnOwnX: true,
                        y: 19,
                        width: "64px",
                        height: "48px",
                        text: this.blackHoles.toString(),
                        grayscale: this.blackHoles === 0,
                        biggerOnMobile: true,
                        scaleYOnMobile: true,
                    })]
                })
            ]
        }));

        // Drop button
        controlsArea.addChild(new Drawable({
            anchors: ['right'],
            width: "50%",
            height: buttonHeight + "px",
            biggerOnMobile: true,
            fallbackColor: '#44444444',
            onClick: () => this.dropPiece(),
            id: "dropButton",
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    width: "100%",
                    height: "100%",
                    image: new TextureInfo(128, 64, "minigame/stardrop"),
                    centerOnOwnX: true,
                    biggerOnMobile: true,
                })
            ]
        }));

        // Move and rotate buttons
        const smallButtonWidth = (this.difficulty.gridWidth * this.tileSize) / 4.5;
        const controls = [
            { image: "minigame/starleft", action: () => this.moveLeft() },
            { image: "minigame/starup", action: () => this.rotateCounterclockwise() }, //Actually just rotates the tiles of the piece, doesn't rotate the piece to be horizontal
            { image: "minigame/stardown", action: () => this.rotateClockwise() },
            { image: "minigame/starright", action: () => this.moveRight() }
        ];

        controls.forEach((control, index) => {
            controlsArea.addChild(new Drawable({
                anchors: ['centerX'],
                y: buttonHeight,
                x: (index - 2) * smallButtonWidth,
                biggerOnMobile: true,
                scaleXOnMobile: true,
                scaleYOnMobile: true,
                width: "22%",
                height: buttonHeight + "px",
                fallbackColor: '#44444444',
                onClick: control.action,
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        width: "100%",
                        height: "100%",
                        image: new TextureInfo(96, 96, control.image),
                        centerOnOwnX: true
                    })
                ]
            }));
        });
    }

    private drawTimer(parent: Drawable): void {
        const timerArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: this.difficulty.gridHeight * this.tileSize + 110,
            width: (this.difficulty.gridWidth * this.tileSize) + "px",
            noXStretch: false,
            height: "30px",
            fallbackColor: '#666666',
            image: new TextureInfo(200, 20, "ui/progressbg"),
            id: "timerArea",
            children: [
                new Drawable({
                    width: "100%",
                    clipWidth: 0.03 + (this.timer / this.maxTime) * 0.94,
                    noXStretch: false,
                    height: "100%",
                    fallbackColor: '#00ff11',
                    image: new TextureInfo(200, 20, "ui/progressfg"),
                    id: "timerProgress",
                    reddize: this.timer < 5
                })
            ]
        }));
    }

    private drawCloseButton(parent: Drawable): void {
        if (this.howToPlayShown) return; //It's just kinda confusing.
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

    private startGame(): void {
        if (this.city.checkAndSpendResources(this.isPractice ? OnePracticeRun : this.costs)) {
            this.gameStarted = true;
            this.initializeGame();
            this.city.updateLastUserActionTime();
            this.game.fullSave();
        }
    }

    private toggleRules(): void {
        this.howToPlayShown = !this.howToPlayShown;
        if (this.howToPlayShown) {
            this.scroller.resetScroll();
        }
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
            overlay.onClick = () => this.toggleRules();
            let parent = overlay;
            parent.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 10 - this.scroller.getScroll(),
                width: "100%",
                height: "48px",
                text: "Starbox Rules",
            }));

            parent = parent.addChild(new Drawable({
                x: 20,
                y: 88 - this.scroller.getScroll(),
                width: "calc(100% - 40px)",
                height: "40px",
                text: "Move and swap your stars before pressing Drop.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            //Three star images in a row, before the next text line
            parent.addChild(new Drawable({
                anchors: ['centerX', 'bottom'],
                centerOnOwnX: true,
                x: -10,
                y: -20 - this.tileSize * 1.4,
                width: (this.tileSize * 4) + "px",
                height: (this.tileSize * 1.4) + "px",
                fallbackColor: '#00000000',
                keepParentWidth: true,
                children: [
                    new Drawable({
                        anchors: ['bottom'],
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star1"),
                    }),
                    new Drawable({
                        anchors: ['bottom'],
                        x: this.tileSize * 1.2,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star1"),
                    }),
                    new Drawable({
                        anchors: ['bottom'],
                        x: this.tileSize * 2.4,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star1"),
                    }),
                ]
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -60 - this.tileSize * 1.4,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "Match 3 or more stars in a row horizontally or vertically to destroy them.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            parent.addChild(new Drawable({
                anchors: ['centerX', 'bottom'],
                centerOnOwnX: true,
                x: -10,
                y: -20 - this.tileSize * 1.4,
                width: (this.tileSize * 6.4) + "px",
                height: (this.tileSize * 1.4) + "px",
                fallbackColor: '#00000000',
                keepParentWidth: true,
                children: [
                    new Drawable({
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star2"),
                    }),
                    new Drawable({
                        x: this.tileSize * 1.2,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star2"),
                    }),
                    new Drawable({
                        x: this.tileSize * 2.4,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star2"),
                    }),
                    new Drawable({
                        x: this.tileSize * 3.6,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star2"),
                    }),
                    new Drawable({
                        x: this.tileSize * 4.8,
                        width: (this.tileSize * 1.4) + "px",
                        height: (this.tileSize * 1.4) + "px",
                        image: new TextureInfo(64, 64, "minigame/star2"),
                    }),
                ]
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -60 - this.tileSize * 1.4,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "Destroy 5 or more stars with one move to earn a black hole.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            //Draw just one black hole, centerX and centerOnOwnX and this.tileSize x 1.4 pixels each dimension.
            parent.addChild(new Drawable({
                anchors: ['centerX', 'bottom'],
                centerOnOwnX: true,
                x: -20,
                y: -this.tileSize * 1.2,
                width: (this.tileSize * 1.4) + "px",
                height: (this.tileSize * 1.4) + "px",
                image: new TextureInfo(64, 64, "minigame/star8"),
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -40 - this.tileSize * 1.4, //Not using the previous as a parent because its width is too small
                width: "calc(100% - 40px)",
                height: "40px",
                text: "A black hole destroys cardinally adjacent stars (left, right, and below) when it lands.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            parent.addChild(new Drawable({ //Also not used as a parent because of the size
                anchors: ['centerX', 'bottom'],
                centerOnOwnX: true,
                x: -20,
                y: -74,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, "resource/tritium"),
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -114,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "Destroy more stars to earn better rewards.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -60,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "You have 3 minutes to play; destroy more than three stars with one move for a little bonus time.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -60,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "Take a moment to plan your move and whether to use a black hole. The top of the screen shows a preview of your next two pieces.",
                wordWrap: true,
                keepParentWidth: true,
            }));

            parent.addChild(parent = new Drawable({
                anchors: ['bottom'],
                y: -60,
                width: "calc(100% - 40px)",
                height: "40px",
                text: "That's all there is to it! Go fuse some stars and earn some metal!",
                wordWrap: true,
            }));

            this.scroller.setChildrenSize(1200);
            return;
        }

        //Title
        let nextY = 10 - this.scroller.getScroll();
        const baseY = nextY;
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "100%",
            height: "48px",
            text: "Starbox",
        }));
        nextY += 70;

        //Slot
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "128px",
            height: "128px",
            image: new TextureInfo(128, 128, "minigame/starcoinslot"),
            id: "coinSlot",
            onClick: () => this.startGame(),
        }));
        nextY += 140;

        //Arrow pointing to slot
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/stararrowup"),
            id: "arrowUp",
            onClick: () => this.startGame(),
        }));
        nextY += 70;

        //Start button
        overlay.addChild(new Drawable({
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

        //Play cost (one starbox token)
        const costs = this.isPractice ? OnePracticeRun : this.costs;
        const unaffordable = !this.city.hasResources(costs, false);
        addResourceCosts(overlay.children[overlay.children.length - 1], costs, 86, 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
        nextY += 170;

        if (this.city.unlockedMinigameOptions.has("sb-s1")) nextY = this.drawDifficultySelector(overlay, nextY);

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
            onClick: () => this.toggleRules(),
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
                text: "Stars destroyed: " + this.totalStarsDestroyed,
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
            { group: "sb-r", id: "0", text: "Elements (+elements, research)", icon: "resource/silicon" },
            { group: "sb-r", id: "1", text: "Star Fuel (+uranium, tritium)", icon: "resource/tritium" },
            { group: "sb-r", id: "2", text: "Fermi Paradox (+organics, electronics, research)", icon: "resource/oil" }]);

        this.scroller.setChildrenSize(nextY - baseY);
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
            const affordable = this.city.hasResources([{ type: new StarboxPlays().type, amount: this.difficulty.playCost }], false);
            selector.addChild(new Drawable({
                anchors: [index === 0 ? 'left' : index === 1 ? 'centerX' : 'right'],
                centerOnOwnX: index === 1,
                x: index === 1 ? 0 : 10,
                width: index === 1 ? "38%" : "28%",
                height: "58px",
                fallbackColor: this.selectedDifficulty === difficulty ? '#666666' : '#444444',
                onClick: () => {
                    this.selectedDifficulty = difficulty as Difficulty;
                    this.costs.find(p => p.type === new StarboxPlays().type)!.amount = this.difficulty.playCost;
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

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public show(): void {
        this.shown = true;
    }

    public hide(): void {
        this.shown = false;
        this.gameStarted = false;
    }

    public isShown(): boolean {
        return this.shown;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;
        const urls = {
            "minigame/star1": "assets/minigame/star1.png",
            "minigame/star2": "assets/minigame/star2.png",
            "minigame/star3": "assets/minigame/star3.png",
            "minigame/star4": "assets/minigame/star4.png",
            "minigame/star5": "assets/minigame/star5.png",
            "minigame/star6": "assets/minigame/star6.png",
            "minigame/star7": "assets/minigame/star7.png",
            "minigame/star8": "assets/minigame/star8.png",
            "minigame/starcoinslot": "assets/minigame/starcoinslot.png",
            "minigame/stararrowup": "assets/minigame/stararrowup.png",
            "minigame/stardown": "assets/minigame/stardown.png",
            "minigame/starup": "assets/minigame/starup.png",
            "minigame/starblackhole": "assets/minigame/starblackhole.png",
            "minigame/stardrop": "assets/minigame/stardrop.png", //Not a Stardew Valley reference. :)
            "minigame/starleft": "assets/minigame/starleft.png",
            "minigame/starright": "assets/minigame/starright.png",
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}