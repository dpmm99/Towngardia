import { TitleTypes } from "../game/AchievementTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { ProductionReward, TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { GameState } from "../game/GameState.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { Resource } from "../game/Resource.js";
import { BarPlays, Flunds, Paper } from "../game/ResourceTypes.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts, longTicksToDaysAndHours } from "../ui/UIUtil.js";
import { OnePracticeRun, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";

interface Recipe {
    name: string;
    ingredients: string[];
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultySettings { //Could also feasibly adjust ease of earning black holes and chance of superior pieces
    fourIngredientRecipes: number; //2 for all three difficulties, but could be reduced for harder difficulties, as it's easier if you're guessing randomly.
    groupByType: boolean; //If true, all ingredients of the same type are grouped together on the board (but the GROUPS are still in a random order). If false, the entire board is shuffled.
    wildcards: number; //Number of "wildcard" ingredients that get added to the end of the board. They match any ingredient in any recipe and are always revealed.
    playCost: number;
    rewardMultiplier: number;
}

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
    easy: { fourIngredientRecipes: 2, groupByType: true, wildcards: 2, playCost: 1, rewardMultiplier: 1 },
    medium: { fourIngredientRecipes: 2, groupByType: false, wildcards: 2, playCost: 1, rewardMultiplier: 1.25 }, //The reward multiplier is a bit insensitive since the output is discrete and only up to 8 normally, or I'd make it more like 1.2.
    hard: { fourIngredientRecipes: 2, groupByType: false, wildcards: 0, playCost: 1, rewardMultiplier: 1.5 }
}

export class MemoryMixology implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: Resource[] = [];
    private wonTourismTicks: number = 0;
    private wonProductionTicks: number = 0;
    private score: number = 0;
    private cardSize: { width: number, height: number } = { width: 128, height: 192 };
    private gridSize: { width: number, height: number } = { width: 5, height: 3 };
    private ingredients: string[] = [
        "absinthe", "cranberry", "gin", "grenadine", "lime",
        "maraschino", "pineapple", "rum", "syrup", "tequila",
        "triplesec", "vodka"
    ];
    private recipes: Recipe[] = [
        //Ones with 4 ingredients
        { name: "Imposter Syndrome", ingredients: ["vodka", "cranberry", "lime", "syrup"] },
        { name: "Panic Attack", ingredients: ["tequila", "triplesec", "lime", "syrup"] },
        { name: "Existential Crisis", ingredients: ["rum", "maraschino", "lime", "syrup"] },
        //Ones with 3 ingredients
        { name: "Procrastinator's Punch", ingredients: ["rum", "pineapple", "grenadine"] },
        { name: "Debugger's Delight", ingredients: ["vodka", "cranberry", "lime"] },
        { name: "Awkward First Date", ingredients: ["gin", "syrup", "lime"] },
        { name: "Midlife Crisis Margarita", ingredients: ["tequila", "triplesec", "lime"] },
        { name: "Green-Eyed Monster", ingredients: ["gin", "absinthe", "lime"] },
        { name: "Social Media Influencer", ingredients: ["vodka", "cranberry", "grenadine"] },
        { name: "Passive-Aggressive Note", ingredients: ["gin", "triplesec", "lime"] }
    ];
    private currentRecipe: Recipe | null = null;
    private upcomingRecipes: Recipe[] = [];
    private board: string[] = [];
    private flippedCards: number[] = [];
    private matchedCards: number[] = [];
    private currentRoundMatchedCards: number[] = [];
    private userInputLocked: boolean = true;
    private preloaded: boolean = false;
    private paperToUse: number = 0;
    private costs = [{ type: new BarPlays().type, amount: 1, reddize: false }, { type: new Paper().type, amount: 0 }];
    private isPractice: boolean = false;
    private selectedDifficulty: Difficulty = 'easy';

    private readonly countdownSteps = [8, 7, 6, 5, 4, 3, 2, 1, "GO"];
    private countdownStep = 0;

    constructor(private city: City, private uiManager: UIManager, private game: GameState) { }

    private get difficulty(): DifficultySettings { return DIFFICULTY_SETTINGS[this.selectedDifficulty]; }

    public isPlaying(): boolean { return this.shown && this.gameStarted; }

    private initializeGame(): void {
        this.score = 0;
        this.flippedCards = [];
        this.matchedCards = [];
        this.currentRoundMatchedCards = [];
        this.userInputLocked = true;
        //Select a set of DISTINCT recipes--two with 4 ingredients and two with 3 ingredients--then select ingredients for those. That leaves 4 cards on the board at the end.
        this.upcomingRecipes = [];
        for (let i = 0; i < this.difficulty.fourIngredientRecipes; i++) this.addInitialRecipe(4);
        for (let i = 0; i < 4 - this.difficulty.fourIngredientRecipes; i++) this.addInitialRecipe(3); //Always init to 4 total recipes
        this.board = this.upcomingRecipes.flatMap(p => p.ingredients); //Start with those required ingredients on the board, then add the rest at random
        while (this.board.length < 18) this.board.push(this.ingredients[Math.floor(Math.random() * this.ingredients.length)]);
        inPlaceShuffle(this.board);
        if (this.difficulty.groupByType) {
            //Group by type, but shuffle the groups. Track the index of the first appearance of each ingredient and move the later matching ingredients to that index, increasing later indices along the way as you normally would with a move-element-within-array algorithm.
            //TODO: Consider grid-width awareness, so grouping might put two at the far right and then another one or two at the far right of the next row to keep them together.
            const ingredientIndices: Record<string, number> = {};
            for (let index = 0; index < this.board.length; index++) {
                const ingredient = this.board[index];
                if (ingredientIndices[ingredient] === undefined) ingredientIndices[ingredient] = index;
                else {
                    let i = index;
                    while (i > ingredientIndices[ingredient]) {
                        this.board[i] = this.board[i - 1];
                        i--;
                    }
                    this.board[ingredientIndices[ingredient]] = ingredient;
                    //EVERY entry of ingredientIndices needs to be updated to reflect the move, not just the one for the current ingredient.
                    Object.keys(ingredientIndices).forEach(p => {
                        if (ingredientIndices[p] >= ingredientIndices[ingredient]) {
                            ingredientIndices[p]++;
                        }
                    });
                }
            }
        }
        for (let i = 0; i < this.difficulty.wildcards; i++) this.board.push("wildcard");
        this.currentRecipe = this.getNextRecipe();

        this.startCountdown();
    }

    private addInitialRecipe(ingredientCount: number): void {
        //Get a recipe we haven't already added to the list
        const recipeOptions = this.recipes.filter(recipe => recipe.ingredients.length === ingredientCount && !this.upcomingRecipes.some(p => p.name === recipe.name));
        this.upcomingRecipes.push(recipeOptions[Math.floor(Math.random() * recipeOptions.length)]);
    }

    private getNextRecipe(): Recipe {
        //Use the pregenerated recipe list until it runs out, THEN either pick a valid recipe using what's left on the board or end the game if there are no valid possibilites.
        this.currentRoundMatchedCards = [];
        if (this.upcomingRecipes.length) return this.upcomingRecipes.shift()!;

        //Find a recipe that can be made with the current board--try to avoid the same recipe as the current one, unless that's the only remaining option.
        let validRecipes = this.getValidRemainingRecipes();
        if (validRecipes.length > 1) validRecipes = validRecipes.filter(p => p.name !== this.currentRecipe!.name);
        if (!validRecipes.length) throw new Error("Shouldn't have made it to the point of needing to pick a recipe with no valid options.");
        return validRecipes[Math.floor(Math.random() * validRecipes.length)];
    }

    private getValidRemainingRecipes() {
        const remainingIngredients = this.board.filter((_, i) => !this.matchedCards.includes(i));
        const remainingWildcards = this.board.filter((ingredient, i) => ingredient === "wildcard" && !this.matchedCards.includes(i)).length;
        //Get recipes you can complete with the current exact ingredients
        let bestRecipeOptions = this.recipes.filter(recipe =>
            recipe.ingredients.length < 4 && //Don't give the player any easy recipes as they near the end
            recipe.ingredients.every(ingredient => remainingIngredients.includes(ingredient))
        );
        if (!bestRecipeOptions.length) { //Same logic except allow for wildcards to fill in the gaps
            bestRecipeOptions = this.recipes.filter(recipe =>
                recipe.ingredients.length < 4 &&
                recipe.ingredients.filter(ingredient => remainingIngredients.includes(ingredient)).length >= recipe.ingredients.length - remainingWildcards
            );
        }
        return bestRecipeOptions;
    }

    onResize(): void {
        this.scroller.onResize();
    }

    private startCountdown(): void {
        this.revealAllCards();
        const showCountdown = () => {
            this.countdownStep++;
            if (this.countdownStep < this.countdownSteps.length) {
                setTimeout(showCountdown, 1500);
            }
            if (this.countdownStep === this.countdownSteps.length - 1) { //Hide the cards and let the player act as soon as "GO" appears, but keep "GO" up there for a second.
                this.hideIngredients();
                this.userInputLocked = false;
            }
            this.uiManager.frameRequested = true;
        };

        this.countdownStep = -1;
        showCountdown();
    }

    private revealAllCards(): void {
        this.flippedCards = [...Array(this.board.length).keys()];
        this.uiManager.frameRequested = true;
    }

    private hideIngredients(): void {
        this.flippedCards = this.flippedCards.filter(p => this.board[p] !== "wildcard" && !this.matchedCards.includes(p)).slice(0, this.paperToUse) //Keep the first paperToUse cards flipped as long as needed
            .concat(this.board.map((p, i) => p === "wildcard" ? i : -1).filter(p => p !== -1)); //Always reveal wildcards
        this.uiManager.frameRequested = true;
    }

    private handleCardClick(index: number): void {
        if (this.userInputLocked || this.matchedCards.includes(index)) { //Now allows flipped cards to be clicked, because some are allowed to be flipped permanently.
            return;
        }

        if (!this.flippedCards.includes(index)) this.flippedCards.push(index); //Don't put it in the list a second time if it's already there, e.g., for wildcards and the "take notes" ability.

        if ((this.currentRecipe!.ingredients.includes(this.board[index]) && !this.currentRoundMatchedCards.some(p => this.board[p] === this.board[index])) //is a match AND not already matched this round
            || this.board[index] === "wildcard") { //or a wildcard always matches something
            this.matchedCards.push(index);
            this.currentRoundMatchedCards.push(index);
            if (this.currentRoundMatchedCards.length === this.currentRecipe!.ingredients.length) this.completeRound();
        } else {
            this.userInputLocked = true;
            //First, show that card for one second, then show it plus the surrounding 4 cards for 3 seconds.
            setTimeout(() => {
                if (index % this.gridSize.width > 0 && !this.matchedCards.includes(index - 1)) this.flippedCards.push(index - 1);
                if (index % this.gridSize.width < this.gridSize.width - 1 && !this.matchedCards.includes(index + 1)) this.flippedCards.push(index + 1);
                if (index >= this.gridSize.width && !this.matchedCards.includes(index - this.gridSize.width)) this.flippedCards.push(index - this.gridSize.width);
                if (index < this.board.length - this.gridSize.width && !this.matchedCards.includes(index + this.gridSize.width)) this.flippedCards.push(index + this.gridSize.width);
                this.uiManager.frameRequested = true;

                setTimeout(() => {
                    this.completeRound();
                    this.userInputLocked = false;
                    this.uiManager.frameRequested = true;
                }, 3000);
            }, 1000);
        }

        this.uiManager.frameRequested = true;
    }

    private completeRound(): void {
        if (this.currentRoundMatchedCards.length === 4) {
            this.score += 15;
        } else if (this.currentRoundMatchedCards.length === 3) {
            this.score += 10;
        } else if (this.currentRoundMatchedCards.length === 2) {
            this.score += 6;
        } else if (this.currentRoundMatchedCards.length === 1) {
            this.score += 2;
        } else if (this.currentRoundMatchedCards.length === 0) {
            //If they did so badly that they didn't match ANY of the ingredients, they lose a few points.
            //A little harsh because there's no timer and they could just look at all the ingredients again otherwise.
            this.score -= 3;
        }
        this.hideIngredients();
        if (this.isGameOver()) this.endGame();
        else this.switchRecipe();
    }

    private switchRecipe(): void {
        this.currentRecipe = this.getNextRecipe();
        this.uiManager.frameRequested = true;
    }

    private isGameOver(): boolean {
        const remainingIngredients = this.board.filter((_, i) => !this.matchedCards.includes(i));
        if (remainingIngredients.length < 6 || !this.getValidRemainingRecipes().length) return true; //End if there are 5 or fewer cards left on the board or no more possible recipes
        return !this.recipes.some(recipe =>
            recipe.ingredients.every(ingredient => remainingIngredients.includes(ingredient))
        );
    }

    private endGame(): void {
        this.gameStarted = false;
        this.calculateWinnings();
        this.city.updateLastUserActionTime();
        this.game.fullSave();
    }

    private calculateWinnings(): void {
        this.winnings = [];
        if (this.isPractice) return;
        const multiplier = this.difficulty.rewardMultiplier;

        //Early game, you just get a tiny bit of flunds. Once you unlock tourism, it gives you a temporary tourism boost.
        if (this.score >= 10) this.winnings.push(new Flunds(this.score)); //Theoretical max score with the game rules: 2 * 15 (four-ingredient recipes) + 2 * 10 (three-ingredient recipes) = 50. If you mess up on one of the 4-ingredient ones, 15 + 3 * 10 = 45. Mess up both and you can score 50 again, though... 5 * 10 = 50 because it'd leave 6 cards at the end.
        if (this.score >= 30) this.winnings[0].amount += 10;
        if (this.score >= 50) this.winnings[0].amount += 20;
        this.winnings[0].amount *= multiplier;
        this.city.transferResourcesFrom(this.winnings.map(p => p.clone()), "earn");

        this.wonTourismTicks = this.wonProductionTicks = 0;
        if (this.city.minigameOptions.get("mm-r") === "1" || !this.city.flags.has(CityFlags.UnlockedTourism)) { //Default reward before tourism is unlocked, but also selectable later on
            this.wonProductionTicks = rangeMapLinear(this.score, 1, LONG_TICKS_PER_DAY * 2, 5, 50, 1, multiplier);
            if (this.wonProductionTicks) this.city.events.push(new ProductionReward(this.wonProductionTicks, 0.05));
        } else {
            this.wonTourismTicks = rangeMapLinear(this.score, 1, LONG_TICKS_PER_DAY * 2, 5, 50, 1, multiplier); //Up to 2 days worth of a tourism boost
            if (this.wonTourismTicks) {
                this.city.events.push(new TourismReward(this.wonTourismTicks, 0.05));
                this.city.checkAndAwardTitle(TitleTypes.SmartCityShowcase.id);
            }
        }

        progressMinigameOptionResearch(this.city, rangeMapLinear(this.score, 0.01, 0.05, 25, 50, 0.001, multiplier));
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "cocktailMemoryGame"
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

    private drawGameArea(parent: Drawable): void {
        const gameArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            y: 20,
            width: (this.gridSize.width * this.cardSize.width) + "px",
            height: "100%",
            fallbackColor: '#333333',
            id: "gameArea",
            centerOnOwnX: true
        }));

        if (this.countdownStep >= this.countdownSteps.length - 1 && !this.userInputLocked) this.drawRecipe(gameArea);
        this.drawCards(gameArea);
        this.drawScore(gameArea);
        this.drawCountdown(gameArea);
    }

    private drawRecipe(parent: Drawable): void {
        const recipeArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "100%",
            height: "180px",
            fallbackColor: '#444444',
            id: "recipeArea"
        }));

        recipeArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "100%",
            height: "40px",
            text: this.currentRecipe!.name,
        }));

        const ingredientWidth = 100;
        const ingredientPadding = 20;
        const ingredientArea = recipeArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 60,
            width: (this.currentRecipe!.ingredients.length - 1) * (ingredientWidth + ingredientPadding) + ingredientWidth + "px",
            height: "80px",
            fallbackColor: '#00000000',
        }));

        const matchedIngredients = this.currentRoundMatchedCards.map(i => this.board[i]);
        this.currentRecipe!.ingredients.forEach((ingredient, index) => {
            const isMatched = matchedIngredients.includes(ingredient);

            const ingredientDrawable = ingredientArea.addChild(new Drawable({
                centerOnOwnX: true,
                x: index * (ingredientWidth + ingredientPadding) + ingredientWidth / 2,
                width: `${ingredientWidth}px`,
                height: "100%",
                noXStretch: true,
                image: new TextureInfo(0, 0, `minigame/bar${ingredient}`),
                grayscale: isMatched,
            }));
            if (isMatched) {
                //Draw a checkmark on the ingredient
                ingredientDrawable.addChild(new Drawable({
                    anchors: ['right'],
                    width: "32px",
                    height: "32px",
                    image: new TextureInfo(32, 32, "ui/ok"),
                }));
            }
        });
        
        //Draw mini "barwildcard" images according to how many matchedIngredients are "wildcard"
        const wildcardCount = matchedIngredients.filter(p => p === "wildcard").length;
        for (let i = 0; i < wildcardCount; i++) {
            const ingredientDrawable = recipeArea.addChild(new Drawable({
                anchors: ['right'],
                x: 10,
                y: 60 + i * 40,
                width: `${ingredientWidth * 0.5}px`,
                height: "40px",
                noXStretch: true,
                image: new TextureInfo(0, 0, `minigame/barwildcard`),
            }));
            ingredientDrawable.addChild(new Drawable({
                anchors: ['right'],
                width: "24px",
                height: "24px",
                image: new TextureInfo(32, 32, "ui/ok"),
            }));
        }

        recipeArea.addChild(new Drawable({
            y: 150,
            width: "100%",
            height: "4px",
            fallbackColor: '#aaaaaa',
        }));
    }

    private drawCards(parent: Drawable): void {
        const cardArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 200,
            width: (this.gridSize.width * this.cardSize.width) + "px",
            height: (this.gridSize.height * this.cardSize.height) + "px",
            fallbackColor: '#00000000',
            id: "cardArea"
        }));

        this.board.forEach((ingredient, index) => {
            if (this.matchedCards.includes(index)) return; //Don't draw matched cards anymore
            const x = (index % this.gridSize.width) * this.cardSize.width;
            const y = Math.floor(index / this.gridSize.width) * this.cardSize.height;

            const card = cardArea.addChild(new Drawable({
                x,
                y,
                width: this.cardSize.width + "px",
                height: this.cardSize.height + "px",
                image: new TextureInfo(128, 192, "minigame/barcard"),
                onClick: () => this.handleCardClick(index),
            }));

            if (this.flippedCards.includes(index)) {
                card.addChild(new Drawable({
                    anchors: ['bottom', 'centerX'],
                    centerOnOwnX: true,
                    y: 32,
                    image: new TextureInfo(0, 0, `minigame/bar${ingredient}`),
                }));
            }
        });
    }

    private drawScore(parent: Drawable): void {
        parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            y: 40,
            width: "200px",
            height: "40px",
            text: `Score: ${this.score}`,
        }));
    }

    private drawCountdown(parent: Drawable): void {
        if (this.countdownStep < this.countdownSteps.length) {
            //A backdrop for the countdown
            parent.addChild(parent = new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 210 + this.gridSize.height * this.cardSize.height / 2 + this.countdownStep * 24,
                width: "80px",
                height: "64px",
                fallbackColor: '#222222',
            }));

            parent.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                noXStretch: true,
                y: 14,
                width: "100%",
                height: "48px",
                text: this.countdownSteps[this.countdownStep] + "",
            }));
        }
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
                this.uiManager.hideRenderOnlyWindow();
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
            text: "Memory Mixology",
        }));
        nextY += 70;

        if (this.city.resources.get(new Paper().type)?.capacity) nextY = this.drawPaperSelector(overlay, nextY);
        nextY = this.drawDifficultySelector(overlay, nextY);

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

        const costs = this.isPractice ? OnePracticeRun : this.costs;
        const unaffordable = !this.city.hasResources(costs, false);
        addResourceCosts(overlay.children[overlay.children.length - 1], costs, 86, 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
        nextY += 160;

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/bararrowdown"),
            id: "arrowDown",
            onClick: () => this.startGame(),
        }));
        nextY += 80;

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: nextY,
            width: "128px",
            height: "128px",
            image: new TextureInfo(128, 128, "minigame/bartipjar"),
            id: "tipJar",
            onClick: () => this.startGame(),
        }));
        nextY += 140;

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
                height: "320px",
                fallbackColor: '#444444',
                id: "winningsArea"
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 10,
                width: "250px",
                height: "32px",
                text: "Score: " + this.score,
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
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
            }));
            addResourceCosts(winningsArea.children[winningsArea.children.length - 1], this.winnings, 0, 0, false, false, false, 64, 10, 32, 4);

            let nextWY = 220;
            if (this.wonTourismTicks) {
                //Only show the tourism reward if they won one
                winningsArea.addChild(new Drawable({
                    x: 20,
                    y: nextWY,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, "resource/tourists"),
                }));
                winningsArea.addChild(new Drawable({
                    x: 80,
                    y: nextWY + 10,
                    width: "390px",
                    height: "36px",
                    text: `+5% tourism`,
                }));
                nextWY += 58;
                winningsArea.addChild(new Drawable({
                    anchors: ['centerX'],
                    centerOnOwnX: true,
                    y: nextWY,
                    width: "calc(100% - 40px)",
                    height: "32px",
                    text: `Decreases evenly over ${longTicksToDaysAndHours(this.wonTourismTicks)}`,
                }));
                nextWY += 42;
            }
            if (this.wonProductionTicks) {
                winningsArea.addChild(new Drawable({
                    x: 20,
                    y: nextWY,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, "ui/resources"),
                }));
                winningsArea.addChild(new Drawable({
                    x: 80,
                    y: nextWY + 10,
                    width: "390px",
                    height: "36px",
                    text: "+5% factory output",
                }));
                nextWY += 58;
                winningsArea.addChild(new Drawable({
                    anchors: ['centerX'],
                    centerOnOwnX: true,
                    y: nextWY,
                    width: "calc(100% - 40px)",
                    height: "32px",
                    text: `Decreases evenly over ${longTicksToDaysAndHours(this.wonProductionTicks)}`,
                }));
                nextWY += 42;
            }
            nextY += 350;
        }

        nextY = drawMinigameOptions(this.city, overlay, nextY, [
            { group: "mm-r", id: "0", text: "Pressuring Patrons (+tourism)", icon: "resource/tourists" },
            { group: "mm-r", id: "1", text: "Napkin Notes (+production)", icon: "ui/resources" }]);

        this.scroller.setChildrenSize(nextY - baseY);
    }

    private drawPaperSelector(parent: Drawable, nextY: number): number {
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
            text: "Paper (+reveal)",
        }));

        if (this.paperToUse > 0)
            selector.addChild(new Drawable({
                width: "48px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => this.changePaper(-1),
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

        if (this.paperToUse < 5)
            selector.addChild(new Drawable({
                anchors: ['right'],
                width: "48px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => this.changePaper(1),
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

    private changePaper(change: number): void {
        this.paperToUse = Math.max(0, Math.min(5, this.paperToUse + change));
        this.costs.find(p => p.type === new Paper().type)!.amount = this.paperToUse;
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
            const affordable = this.city.hasResources([{ type: new BarPlays().type, amount: DIFFICULTY_SETTINGS[difficulty as Difficulty].playCost }], false);
            selector.addChild(new Drawable({
                anchors: [index === 0 ? 'left' : index === 1 ? 'centerX' : 'right'],
                centerOnOwnX: index === 1,
                x: index === 1 ? 0 : 10,
                width: index === 1 ? "38%" : "28%",
                height: "58px",
                fallbackColor: this.selectedDifficulty === difficulty ? '#666666' : '#444444',
                onClick: () => {
                    this.selectedDifficulty = difficulty as Difficulty;
                    this.costs.find(p => p.type === new BarPlays().type)!.amount = this.difficulty.playCost;
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
            text: "Memory Mixology Rules",
        }));

        root.onClick = () => this.toggleRules();

        parent = parent.addChild(new Drawable({
            x: 20,
            y: 80 - this.scroller.getScroll(),
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Memorize the ingredient cards' locations as the timer counts down.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "A recipe then appears at the top of the screen.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Try to tap the cards that match the recipe's ingredients.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If you choose incorrectly, the surrounding cards are revealed for a few seconds, but that card is not removed.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The more you choose correctly, the more points you earn for that recipe.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "On the other hand, you lose a few points if your first choice is incorrect.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You start a new drink if you make a mistake or complete a recipe.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The game stops if you make a mistake or complete a recipe and either there are no more possible recipes or fewer than 6 cards remain.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: this.city.resources.get(new Paper().type)?.capacity ? "Before playing, you can spend a number of Paper units to keep that same number of cards revealed."
                : "Once you unlock Paper, you can spend some before starting the game to keep that number of cards revealed.",
        }));

        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -20,
            y: -80,
            width: "100%",
            height: "48px",
            text: "Ingredients",
        }));

        let nextX = 60;
        let nextY = -200;
        for (let ingredient of this.ingredients) {
            parent.addChild(new Drawable({
                anchors: ['bottom'],
                centerOnOwnX: true,
                x: nextX,
                y: nextY,
                width: "96px",
                height: "96px",
                image: new TextureInfo(64, 64, `minigame/bar${ingredient}`),
            }));
            parent.addChild(new Drawable({
                anchors: ['bottom'],
                centerOnOwnX: true,
                x: nextX,
                y: nextY - 30,
                width: "116px",
                height: "32px",
                text: ingredient.replace("triplesec", "triple sec"),
            }));
            if (ingredient === "maraschino") {
                parent.addChild(new Drawable({
                    anchors: ['bottom'],
                    centerOnOwnX: true,
                    x: nextX,
                    y: nextY - 60,
                    width: "116px",
                    height: "32px",
                    text: "liqueur",
                }));
            }

            nextX += 140;
            if (nextX > 480) {
                nextX = 60;
                nextY -= 150;
            }
        }
        //Draw the wildcard last in the center
        parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            x: -20,
            y: nextY,
            width: "96px",
            height: "96px",
            image: new TextureInfo(64, 64, `minigame/barwildcard`),
        }));
        parent.addChild(new Drawable({
            anchors: ['centerX', 'bottom'],
            centerOnOwnX: true,
            x: -20,
            y: nextY - 30,
            width: "calc(100% - 20px)",
            height: "32px",
            text: "Bag of airplane bottles (wildcard)",
        }));
        this.scroller.setChildrenSize(1650);
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
            "minigame/barabsinthe": "assets/minigame/barabsinthe.png",
            "minigame/barcard": "assets/minigame/barcard.png",
            "minigame/barcranberry": "assets/minigame/barcranberry.png",
            "minigame/bargin": "assets/minigame/bargin.png",
            "minigame/bargrenadine": "assets/minigame/bargrenadine.png",
            "minigame/barlime": "assets/minigame/barlime.png",
            "minigame/barmaraschino": "assets/minigame/barmaraschino.png",
            "minigame/barpineapple": "assets/minigame/barpineapple.png",
            "minigame/barrum": "assets/minigame/barrum.png",
            "minigame/barsyrup": "assets/minigame/barsyrup.png",
            "minigame/bartequila": "assets/minigame/bartequila.png",
            "minigame/bartriplesec": "assets/minigame/bartriplesec.png",
            "minigame/barvodka": "assets/minigame/barvodka.png",
            "minigame/barwildcard": "assets/minigame/barwildcard.png",
            "minigame/bartipjar": "assets/minigame/bartipjar.png",
            "minigame/bararrowdown": "assets/minigame/bararrowdown.png",
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}