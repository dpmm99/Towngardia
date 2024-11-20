import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { Resource } from "../game/Resource.js";
import { Copper, Flunds, Iron, Research, Silicon, StarboxPlays, Stone, Tritium, Uranium } from "../game/ResourceTypes.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts } from "../ui/UIUtil.js";

export class Starbox implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: Resource[] = [];
    private tileSize: number = 64;
    private gridWidth: number = 7;
    private normalStarTypes: number = 6; //7 is the max, though--I just decided to try to make it a bit easier.
    private gridHeight: number = 12;
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

    constructor(private city: City, private uiManager: UIManager, private game: GameState) {
        this.initializeGame();
    }

    private initializeGame(): void {
        this.gameBoard = Array(this.gridHeight).fill(null).map(() => Array(this.gridWidth).fill(0));
        this.nextPieces = this.nextPieces.map(p => this.generatePiece());
        this.currentPiece = this.generatePiece();
        this.currentPiecePosition = { x: Math.floor(this.gridWidth / 2) - 1, y: 0 };
        this.timer = this.maxTime;
        this.blackHoles = 0;
        this.usingBlackHole = false;
        this.chainReactionCount = 0;
        this.totalStarsDestroyed = 0;
        this.starsDestroyedThisChain = 0;
        this.explosions = [];
        this.fallingStars = [];
        this.userInputLocked = false;

        // Distribute initial 35 stars
        let starsPlaced = 0;
        let placedByX: number[] = Array(this.gridWidth).fill(0);
        while (starsPlaced < 35) {
            const x = Math.floor(Math.random() * this.gridWidth);
            const y = this.gridHeight - 1 - placedByX[x];
            if (y < 4) continue; //Don't stack too high or the player won't even be able to start (give 1 layer of buffer, anyway)
            placedByX[x]++;

            //Rotate through the different piece types until you're certain this won't cause a match immediately at game start
            //Due to the placement technique, you only have to check below and then 2 to the left, 1 on either side, and 2 to the right to be sure that it won't cause a match.
            let chosenPiece = Math.floor(Math.random() * this.normalStarTypes) + 1;
            while ((y < this.gridHeight - 2 && chosenPiece === this.gameBoard[y + 1][x] && chosenPiece === this.gameBoard[y + 2][x]) ||
                (x >= 2 && chosenPiece == this.gameBoard[y][x - 2] && chosenPiece == this.gameBoard[y][x - 1]) ||
                (x >= 1 && x < this.gridWidth - 1 && chosenPiece == this.gameBoard[y][x - 1] && chosenPiece == this.gameBoard[y][x + 1]) ||
                (x < this.gridWidth - 2 && chosenPiece == this.gameBoard[y][x + 1] && chosenPiece == this.gameBoard[y][x + 2]))
                chosenPiece = (chosenPiece % this.normalStarTypes) + 1;

            this.gameBoard[y][x] = chosenPiece;
            starsPlaced++;
        }

        this.startTimer();
    }

    private generatePiece(): number[] {
        const ret = Array(3).fill(0).map(() => Math.floor(Math.random() * this.normalStarTypes) + 1);
        if (Math.random() < 0.5) ret[0] = ret[Math.floor(Math.random() * 2) + 1]; //Be nice: grant a slightly higher chance to get 2 or 3 of the same piece.
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
        this.winnings = [];
        const rewardFlunds = new Flunds();
        if (this.totalStarsDestroyed > 40) this.winnings.push(new Silicon(Math.min(4, Math.floor((this.totalStarsDestroyed - 30) / 10))));
        if (this.totalStarsDestroyed > 60) this.winnings.push(new Stone(Math.min(4, Math.floor((this.totalStarsDestroyed - 50) / 10))));
        if (this.totalStarsDestroyed > 80) this.winnings.push(new Iron(Math.min(4, Math.floor((this.totalStarsDestroyed - 70) / 10))));
        if (this.totalStarsDestroyed > 100) this.winnings.push(new Copper(Math.min(4, Math.floor((this.totalStarsDestroyed - 90) / 10))));
        if (this.totalStarsDestroyed > 120) this.winnings.push(new Research(Math.min(2, (this.totalStarsDestroyed - 120) / 30))); //A smoother increase but lower limit--research points were way too easy to earn
        if (this.totalStarsDestroyed > 140) {
            if (this.city.resources.get(new Uranium().type)?.capacity) this.winnings.push(new Uranium(Math.min(4, Math.floor((this.totalStarsDestroyed - 115) / 4))));
            else rewardFlunds.amount += Math.min(10, Math.floor(this.totalStarsDestroyed - 118));
        }
        if (this.totalStarsDestroyed > 160) {
            if (this.city.resources.get(new Tritium().type)?.capacity) this.winnings.push(new Tritium(Math.min(4, Math.floor((this.totalStarsDestroyed - 125) / 3))));
            else rewardFlunds.amount += Math.min(20, Math.floor((this.totalStarsDestroyed - 128) * 1.2));
        }
        if (this.totalStarsDestroyed > 180) rewardFlunds.amount += 20;
        if (this.totalStarsDestroyed > 200) rewardFlunds.amount += 20;
        if (this.totalStarsDestroyed > 220) rewardFlunds.amount += 20;
        if (rewardFlunds.amount > 0) this.winnings.push(rewardFlunds);
        this.city.transferResourcesFrom(this.winnings.map(p => p.clone()), "earn");

        this.game.fullSave();
        this.userInputLocked = true;
        setTimeout(() => { this.gameStarted = false; }, 2000); //Will wait for the user to tap to continue.
    }

    onResize(): void {
        // Handle resize if needed
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
                    y: 100 + this.gridHeight * this.tileSize / 2 - 32,
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
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth - 2; x++) {
                if (this.gameBoard[y][x] !== 0 &&
                    this.gameBoard[y][x] === this.gameBoard[y][x + 1] &&
                    this.gameBoard[y][x] === this.gameBoard[y][x + 2]) {
                    matches.push({ x, y }, { x: x + 1, y }, { x: x + 2, y });
                    // Check for longer matches
                    let nextX = x + 3;
                    while (nextX < this.gridWidth && this.gameBoard[y][nextX] === this.gameBoard[y][x]) {
                        matches.push({ x: nextX, y });
                        nextX++;
                    }
                    x = nextX - 1; //Don't count the same pieces twice
                }
            }
        }

        // Check vertical matches
        for (let x = 0; x < this.gridWidth; x++) {
            for (let y = 0; y < this.gridHeight - 2; y++) {
                if (this.gameBoard[y][x] !== 0 &&
                    this.gameBoard[y][x] === this.gameBoard[y + 1][x] &&
                    this.gameBoard[y][x] === this.gameBoard[y + 2][x]) {
                    matches.push({ x, y }, { x, y: y + 1 }, { x, y: y + 2 });
                    // Check for longer matches
                    let nextY = y + 3;
                    while (nextY < this.gridHeight && this.gameBoard[nextY][x] === this.gameBoard[y][x]) {
                        matches.push({ x, y: nextY });
                        nextY++;
                    }
                    y = nextY - 1; //Don't count the same pieces twice
                }
            }
        }

        //Check for black holes
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.gameBoard[y][x] === 8) {
                    //Black hole
                    matches.push({ x, y });
                    if (x > 0 && this.gameBoard[y][x - 1]) matches.push({ x: x - 1, y });
                    if (x < this.gridWidth - 1 && this.gameBoard[y][x + 1]) matches.push({ x: x + 1, y });
                    if (y > 0 && this.gameBoard[y - 1][x]) matches.push({ x, y: y - 1 });
                    if (y < this.gridHeight - 1 && this.gameBoard[y + 1][x]) matches.push({ x, y: y + 1 });
                }
            }
        }

        //Only return the distinct results
        return matches.filter((match, index) => matches.findIndex(m => m.x === match.x && m.y === match.y) === index);
    }

    private applyGravity(): void {
        for (let x = 0; x < this.gridWidth; x++) {
            let bottomY = this.gridHeight - 1;
            for (let y = this.gridHeight - 1; y >= 0; y--) {
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
        this.currentPiecePosition = { x: Math.floor(this.gridWidth / 2) - 1, y: 0 };

        // Check for game over (no space for new piece)
        if (this.currentPiece.some((color, i) => this.gameBoard[this.currentPiecePosition.y + i][this.currentPiecePosition.x] !== 0)) {
            this.endGame();
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
        if (this.currentPiecePosition.x < this.gridWidth - 1 && !this.pieceCollision(1, 0) && this.currentPiece.length > 0) {
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
            return newX < 0 || newX >= this.gridWidth || newY >= this.gridHeight || (newY >= 0 && this.gameBoard[newY][newX] !== 0);
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
            width: (this.gridWidth * this.tileSize) + "px",
            height: (this.gridHeight * this.tileSize) + "px",
            fallbackColor: '#333333',
            id: "gameArea",
            centerOnOwnX: true
        }));

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
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
            width: (this.gridWidth * this.tileSize) + "px",
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
        const buttonHeight = 48;

        const controlsArea = parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            biggerOnMobile: true,
            scaleYOnMobile: true,
            y: 10,
            width: "min(" + (this.gridWidth * this.tileSize) + "px, 100%)",
            height: (buttonHeight * 2 + 10) + "px",
            fallbackColor: '#444444',
            id: "controlsArea"
        }));

        // Black Hole button
        controlsArea.addChild(new Drawable({
            width: "50%",
            height: buttonHeight + "px",
            biggerOnMobile: true,
            fallbackColor: '#444444',
            onClick: () => this.useBlackHole(),
            id: "blackHoleButton",
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    y: 5,
                    width: "100%",
                    height: "100%",
                    text: `Black Hole (${this.blackHoles})`,
                    centerOnOwnX: true,
                    grayscale: this.blackHoles === 0,
                })
            ]
        }));

        // Drop button
        controlsArea.addChild(new Drawable({
            anchors: ['right'],
            width: "50%",
            height: buttonHeight + "px",
            biggerOnMobile: true,
            fallbackColor: '#444444',
            onClick: () => this.dropPiece(),
            id: "dropButton",
            children: [
                new Drawable({
                    anchors: ['centerX'],
                    y: 5,
                    width: "100%",
                    height: "100%",
                    text: "Drop",
                    centerOnOwnX: true,
                    biggerOnMobile: true,
                    scaleYOnMobile: true,
                })
            ]
        }));

        // Move and rotate buttons
        const smallButtonWidth = (this.gridWidth * this.tileSize) / 4.5;
        const controls = [
            { text: String.fromCharCode(0x219E), action: () => this.moveLeft() },
            { text: String.fromCharCode(0x21BA), action: () => this.rotateCounterclockwise() }, //Actually just rotates the tiles of the piece, doesn't rotate the piece to be horizontal
            { text: String.fromCharCode(0x21BB), action: () => this.rotateClockwise() },
            { text: String.fromCharCode(0x21A0), action: () => this.moveRight() }
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
                fallbackColor: '#444444',
                onClick: control.action,
                children: [
                    new Drawable({
                        anchors: ['centerX'],
                        width: "100%",
                        height: "100%",
                        text: control.text,
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
            y: this.gridHeight * this.tileSize + 110,
            width: (this.gridWidth * this.tileSize) + "px",
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
        if (this.city.checkAndSpendResources(this.costs)) {
            this.gameStarted = true;
            this.initializeGame();
            this.game.fullSave();
        }
    }

    private drawStartOverlay(parent: Drawable): void {
        const overlay = parent.addChild(new Drawable({
            anchors: ["centerX"],
            centerOnOwnX: true,
            width: "min(100%, 600px)",
            height: "100%",
            fallbackColor: '#000000CC',
            id: "startOverlay",
        }));

        if (this.howToPlayShown) {
            overlay.onClick = () => this.howToPlayShown = false;
            let parent = overlay;
            parent.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 10,
                width: "100%",
                height: "48px",
                text: "Starbox Rules",
            }));

            parent.addChild(parent = new Drawable({
                y: 88,
                x: 20,
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
            return;
        }

        //Title
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "100%",
            height: "48px",
            text: "Starbox",
        }));

        //Slot
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 80,
            width: "128px",
            height: "128px",
            image: new TextureInfo(128, 128, "minigame/starcoinslot"),
            id: "coinSlot",
            onClick: () => this.startGame(),
        }));

        //Arrow pointing to slot
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 210,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/stararrowup"),
            id: "arrowUp",
            onClick: () => this.startGame(),
        }));

        //Start button
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 280,
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
        this.costs[0].reddize = !this.city.hasResources(this.costs, false);
        addResourceCosts(overlay.children[overlay.children.length - 1], this.costs, 86, 58, false, false, false, 48, 10, 32);

        //How to play button
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 450,
            width: "220px",
            height: "48px",
            fallbackColor: '#444444',
            onClick: () => { this.howToPlayShown = true; },
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

        if (this.winnings.length) {
            //Draw the winnings from the last playthrough
            const winningsArea = overlay.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 510,
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
        }
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
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}