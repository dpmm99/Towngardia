import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts } from "../ui/UIUtil.js";
import { progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";

enum Face {
    FatCat,
    PrivateJet,
    LuxuryYacht,
    DiamondRing,
    GoldCoin,
    FancyCigar,
    ChampagneBottle,
}

interface ScoringRule {
    name: string;
    face: Face;
    multiplier: number;
}

export class SlotMachine implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private reels: Face[][] = [[], [], []];
    private spinningFrames: number[] = [0, 0, 0];
    private readonly baseBet: number = 10;
    private currentBet: number = this.baseBet;
    private showScoringInfo: boolean = false;
    private winnings: number = 0;
    private readonly machineWidth: number = 681;
    private readonly machineHeight: number = 993;
    private preloaded: boolean = false;
    private slowRoll: boolean = false;

    private readonly scoringRules: ScoringRule[] = [
        { name: "The Snoop Catt", face: Face.FatCat, multiplier: 420 },
        { name: "The Mutual", face: Face.PrivateJet, multiplier: 69 },
        { name: "The DiCaprio", face: Face.LuxuryYacht, multiplier: 25 },
        { name: "The Unaging", face: Face.DiamondRing, multiplier: 17 },
        { name: "The Unlucky", face: Face.GoldCoin, multiplier: 13 },
        { name: "The Lucky", face: Face.FancyCigar, multiplier: 7 },
        { name: "The Sucky", face: Face.ChampagneBottle, multiplier: 5 },
        { name: "The Mulligan", face: Face.FatCat, multiplier: 1 }, // Using FatCat as a placeholder for "Any 2"
        { name: "The Jack", face: Face.FatCat, multiplier: 0 } // Using FatCat as a placeholder for "No matches"
    ];

    constructor(private city: City, private uiManager: UIManager, private game: GameState) {
        this.initializeReels();
    }

    onResize(): void {
        this.scroller.onResize();
    }

    private initializeReels(): void {
        for (let i = 0; i < 3; i++) {
            this.reels[i] = this.generateRandomReel();
        }
    }

    private generateRandomReel(): Face[] {
        const arr = [
            Face.FatCat, //0.1%
            Face.FatCat,
            Face.PrivateJet, //0.1%
            Face.PrivateJet,
            Face.LuxuryYacht, //0.1%
            Face.LuxuryYacht,
            Face.DiamondRing, //0.3375%
            Face.DiamondRing,
            Face.DiamondRing,
            Face.GoldCoin, //0.3375%
            Face.GoldCoin,
            Face.GoldCoin,
            Face.FancyCigar, //0.8%
            Face.FancyCigar,
            Face.FancyCigar,
            Face.FancyCigar,
            Face.ChampagneBottle, //0.8%
            Face.ChampagneBottle,
            Face.ChampagneBottle,
            Face.ChampagneBottle
        ]; //Simulated average winnings: 9.8%
        return inPlaceShuffle(arr);
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "slotMachine"
        });

        const machineArea = new Drawable({
            anchors: ['centerX'],
            width: this.machineWidth + "px",
            height: this.machineHeight + "px",
            fallbackColor: '#00000000',
            id: "machineBackdrop",
            centerOnOwnX: true,
        });
        mainDrawable.addChild(machineArea);
        this.drawSpool(machineArea);
        this.drawFaces(machineArea);
        machineArea.addChild(new Drawable({
            width: "100%",
            height: "100%",
            image: new TextureInfo(681, 993, "minigame/slotmachine"),
            fallbackColor: '#333333',
            id: "machineFrame",
            noXStretch: true,
        }));

        this.drawButtons(machineArea);

        // Draw scoring info if requested
        if (this.showScoringInfo) {
            this.drawScoringInfo(mainDrawable);
        }

        // Advance animation
        if (this.spinningFrames.some(p => p > 0)) {
            this.advanceAnimation();
            this.uiManager.frameRequested = true;
        } else if (!this.showScoringInfo) this.drawCloseButton(mainDrawable);

        this.lastDrawable = mainDrawable;
        return mainDrawable;
    }

    private drawSpool(parent: Drawable): void {
        parent.addChild(new Drawable({
            width: (this.machineWidth / 681 * 481) + "px",
            height: (this.machineHeight / 993 * 506) + "px",
            image: new TextureInfo(481, 506, "minigame/slotspool"),
            fallbackColor: '#444444',
            id: "spool"
        }));
    }

    //Just for generating distinct fallback colors
    private faceColorHash(face: Face): string {
        const asStr = Face[face];
        let hash = 0;
        for (let i = 0; i < asStr.length; i++) {
            hash = asStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16);
        return "#" + "00000".substring(0, 6 - c.length) + c;
    }

    private drawFaces(parent: Drawable): void {
        const faceSize = (this.machineWidth / 681 * 89) + "px";
        const smallerFaceSize = (this.machineWidth / 681 * 75) + "px";
        const faceY = this.machineHeight / 993 * 350;
        const faceXPositions = [this.machineWidth / 681 * 189, this.machineWidth / 681 * 287, this.machineWidth / 681 * 391];

        for (let i = 0; i < 3; i++) {
            const face = this.reels[i][0];
            parent.addChild(new Drawable({
                x: faceXPositions[i],
                y: faceY,
                width: faceSize,
                height: faceSize,
                image: new TextureInfo(128, 128, `minigame/slot${Face[face].toLowerCase()}`),
                fallbackColor: this.faceColorHash(face),
            }));

            const faceAbove = this.reels[i][19];
            parent.addChild(new Drawable({
                x: faceXPositions[i] - 8 * (i - 1),
                y: faceY - (this.machineHeight / 993 * 110),
                width: smallerFaceSize,
                height: smallerFaceSize,
                image: new TextureInfo(128, 128, `minigame/slot${Face[faceAbove].toLowerCase()}`),
                fallbackColor: this.faceColorHash(faceAbove),
            }));

            const faceBelow = this.reels[i][1];
            parent.addChild(new Drawable({
                x: faceXPositions[i] - 8 * (i - 1),
                y: faceY + (this.machineHeight / 993 * 110),
                width: smallerFaceSize,
                height: smallerFaceSize,
                image: new TextureInfo(128, 128, `minigame/slot${Face[faceBelow].toLowerCase()}`),
                fallbackColor: this.faceColorHash(faceBelow),
            }));
        }
    }

    private drawButtons(parent: Drawable): void {
        const buttonY = this.machineHeight / 993 * 528;
        const buttonSize = Math.round(0.15 * this.machineWidth);
        const buttons = [
            { x: this.machineWidth / 681 * 120, label: "1x", action: () => this.spin(1) },
            { x: this.machineWidth / 681 * 228, label: "5x", action: () => this.spin(5) },
            { x: this.machineWidth / 681 * 336, label: "20x", action: () => this.spin(20) },
            { x: this.machineWidth / 681 * 444, label: "Info", action: () => this.toggleScoringInfo() }
        ];

        for (let i = 0; i < 4; i++) {
            const canAfford = buttons[i].label === "Info" || (this.city.resources.get('flunds')!.amount >= this.baseBet * parseInt(buttons[i].label) &&
                this.city.resources.get('slotsplays')!.amount >= 1);
            parent.addChild(new Drawable({
                x: buttons[i].x,
                y: buttonY,
                width: buttonSize + "px",
                height: buttonSize + "px",
                image: new TextureInfo(128, 128, `minigame/slotbutton${i + 1}`),
                fallbackColor: canAfford ? '#FFFFFF' : '#888888',
                onClick: buttons[i].action,
                grayscale: !canAfford
            }));
            parent.addChild(new Drawable({
                x: buttons[i].x + buttonSize / 2,
                y: buttonY + buttonSize + 5,
                width: buttonSize + "px",
                height: "32px",
                text: buttons[i].label,
                centerOnOwnX: true,
            }));
        }

        // Display current bet and winnings
        parent.addChild(new Drawable({
            x: this.machineWidth / 681 * 178,
            y: this.machineHeight / 993 * 726,
            width: (this.machineWidth / 681 * 200) + "px",
            height: "40px",
            text: "Last bet:"
        }));

        const costs = [{ type: 'flunds', amount: this.currentBet }, { type: 'slotsplays', amount: 1 }];
        addResourceCosts(parent, costs, this.machineWidth / 681 * 388, this.machineHeight / 993 * 710, false, false, false, 40, 10, 32);

        if (this.winnings > 0) {
            parent.addChild(new Drawable({
                x: this.machineWidth / 681 * 178,
                y: this.machineHeight / 993 * 811,
                width: (this.machineWidth / 681 * 200) + "px",
                height: "40px",
                text: "You won:"
            }));

            const winnings = [{ type: 'flunds', amount: this.winnings }];
            addResourceCosts(parent, winnings, this.machineWidth / 681 * 388, this.machineHeight / 993 * 795, false, false, false, 40, 10, 32);
        } else {
            //Show the player's assets
            parent.addChild(new Drawable({
                x: this.machineWidth / 681 * 178,
                y: this.machineHeight / 993 * 811,
                width: (this.machineWidth / 681 * 200) + "px",
                height: "40px",
                text: "Assets:"
            }));
            const assets = [this.city.resources.get('flunds')!.clone(), this.city.resources.get('slotsplays')!.clone()];
            if (assets[0].amount < this.baseBet) (<any>assets[0]).reddize = true;
            if (assets[1].amount < 1) (<any>assets[1]).reddize = true;
            addResourceCosts(parent, assets, this.machineWidth / 681 * 388, this.machineHeight / 993 * 795, false, false, false, 40, 10, 32, 2, false, false, undefined, true);
        }
    }

    private drawCloseButton(parent: Drawable): void {
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

    private drawScoringInfo(parent: Drawable): void {
        const infoDrawable = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            width: "min(100%, 620px)",
            height: "min(100%, 490px)",
            fallbackColor: '#000000CC',
            id: "scoringInfo",
            onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, infoDrawable.screenArea); },
            onDragEnd: () => { this.scroller.resetDrag(); },
            onClick: () => { this.toggleScoringInfo(); }
        }));

        let nextY = 20 - this.scroller.getScroll();
        const baseY = nextY;
        this.scoringRules.forEach((rule, index) => {
            // Rule name
            infoDrawable.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "190px",
                height: "32px",
                text: rule.name + ":",
            }));

            if (rule.multiplier > 1)
                infoDrawable.addChild(new Drawable({
                    x: 210,
                    y: nextY - 10,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(128, 128, `minigame/slot${Face[rule.face].toLowerCase()}`),
                }));

            let description: string;
            let x = 210;
            if (rule.name === "The Mulligan") description = "Any 2 matches = 1x bet";
            else if (rule.name === "The Jack") description = "No matches = Lose bet";
            else {
                description = `x3 = ${rule.multiplier}x bet`;
                x += 60;
            }

            infoDrawable.addChild(new Drawable({
                x: x,
                y: nextY,
                width: "320px",
                height: "32px",
                text: description,
            }));

            nextY += 54;
        });

        this.scroller.setChildrenSize(nextY - baseY + 10);
    }

    private advanceAnimation(): void {
        for (let i = 0; i < 3; i++) {
            if (this.spinningFrames[i] === 0) continue;
            this.spinningFrames[i]--;
            if (this.spinningFrames[i] % (this.slowRoll ? 5 : 2)) {
                this.reels[i].unshift(this.reels[i].pop()!);
            }
        }
        //If the first and second reels have stopped on the same symbol and the third has no frames left but DOESN'T match them, give it a chance to go two more frames. Just to be nice. ;)
        if (this.spinningFrames[0] === 0 && this.spinningFrames[1] === 0 && this.spinningFrames[2] === 0 && this.reels[0][0] === this.reels[1][0] && this.reels[0][0] !== this.reels[2][0] && Math.random() < 0.6) {
            this.spinningFrames[2] += 20;
            this.slowRoll = true;
        }
        if (this.spinningFrames.every(p => p === 0)) {
            this.calculateWinnings();
        }
    }

    private calculateWinnings(): void {
        const result = this.reels.map(reel => reel[0]);
        const uniqueFaces = new Set(result);

        if (uniqueFaces.size === 1) { //3 matching faces
            const multiplier = this.scoringRules.find(p => p.face === result[0])!.multiplier;
            this.winnings = this.currentBet * multiplier;
            //Progress the other minigames' options research: 5x win yields 5.0%-11.4%. 17x win yields 18.9%-43.4%. 69x win yields 29.9%-68.9%. Absolute max win is 99.2%.
            progressMinigameOptionResearch(this.city, rangeMapLinear(Math.log10(multiplier - 3) * Math.log(this.currentBet), 0, 1, 0, 14, 0.001));
        } else if (uniqueFaces.size === 2) { //Any pair
            this.winnings = this.currentBet;
            progressMinigameOptionResearch(this.city, 0.005); //+0.5% if you come out even
        } else { //No match
            this.winnings = 0;
            progressMinigameOptionResearch(this.city, 0.001); //+0.1% if you lose
        }

        this.city.resources.get('flunds')!.amount += this.winnings;
        this.city.updateLastUserActionTime();
        this.game.fullSave();
    }

    private spin(multiplier: number): void {
        if (this.spinningFrames.some(p => p > 0)) return;

        this.slowRoll = false;
        this.currentBet = this.baseBet * multiplier;
        const costs = [{ type: 'flunds', amount: this.currentBet }, { type: 'slotsplays', amount: 1 }];
        if (this.city.checkAndSpendResources(costs)) {
            this.winnings = 0;
            this.spinningFrames[2] = 80 + Math.floor(Math.random() * 40);
            this.spinningFrames[1] = this.spinningFrames[2] - 5 - Math.floor(Math.random() * 30);
            this.spinningFrames[0] = this.spinningFrames[1] - 5 - Math.floor(Math.random() * 30);
            this.initializeReels();
            this.city.updateLastUserActionTime();
            this.game.fullSave();
        }
    }

    private toggleScoringInfo(): void {
        this.showScoringInfo = !this.showScoringInfo;
        if (this.showScoringInfo) {
            this.scroller.resetScroll();
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
    }

    public isShown(): boolean {
        return this.shown;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;
        const urls = {
            "minigame/slotmachine": "assets/minigame/slotmachine.png",
            "minigame/slotspool": "assets/minigame/slotspool.png",
            "minigame/slotgoldcoin": "assets/minigame/slotgoldcoin.png",
            "minigame/slotdiamondring": "assets/minigame/slotdiamondring.png",
            "minigame/slotluxuryyacht": "assets/minigame/slotluxuryyacht.png",
            "minigame/slotprivatejet": "assets/minigame/slotprivatejet.png",
            "minigame/slotfancycigar": "assets/minigame/slotfancycigar.png",
            "minigame/slotchampagnebottle": "assets/minigame/slotchampagnebottle.png",
            "minigame/slotfatcat": "assets/minigame/slotfatcat.png",
            "minigame/slotbutton1": "assets/minigame/slotbutton1.png",
            "minigame/slotbutton2": "assets/minigame/slotbutton2.png",
            "minigame/slotbutton3": "assets/minigame/slotbutton3.png",
            "minigame/slotbutton4": "assets/minigame/slotbutton4.png",
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}