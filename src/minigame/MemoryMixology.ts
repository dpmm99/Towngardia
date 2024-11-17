import { TitleTypes } from "../game/AchievementTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { Resource } from "../game/Resource.js";
import { BarPlays, Flunds } from "../game/ResourceTypes.js";
import { Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts } from "../ui/UIUtil.js";

interface Recipe {
    name: string;
    ingredients: string[];
}

export class MemoryMixology implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: Resource[] = [];
    private wonTourismTicks: number = 0;
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
    private costs = [{ type: new BarPlays().type, amount: 1, reddize: false }];

    private readonly countdownSteps = [8, 7, 6, 5, 4, 3, 2, 1, "GO"];
    private countdownStep = 0;

    constructor(private city: City, private uiManager: UIManager) { }

    private initializeGame(): void {
        this.score = 0;
        this.flippedCards = [];
        this.matchedCards = [];
        this.currentRoundMatchedCards = [];
        this.userInputLocked = true;
        //Select a set of DISTINCT recipes--two with 4 ingredients and two with 3 ingredients--then select ingredients for those. That leaves 4 cards on the board at the end.
        this.upcomingRecipes = [];
        this.addInitialRecipe(4); this.addInitialRecipe(4); this.addInitialRecipe(3); this.addInitialRecipe(3);
        this.board = this.upcomingRecipes.flatMap(p => p.ingredients); //Start with those required ingredients on the board, then add the rest at random
        while (this.board.length < 18) this.board.push(this.ingredients[Math.floor(Math.random() * this.ingredients.length)]);
        inPlaceShuffle(this.board);
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
        return this.recipes.filter(recipe =>
            recipe.ingredients.length < 4 && //Don't give the player any easy recipes as they near the end
            recipe.ingredients.every(ingredient => remainingIngredients.includes(ingredient))
        );
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
        this.flippedCards = [];
        this.uiManager.frameRequested = true;
    }

    private handleCardClick(index: number): void {
        if (this.userInputLocked || this.flippedCards.includes(index) || this.matchedCards.includes(index)) {
            return;
        }

        this.flippedCards.push(index);

        if (this.currentRecipe!.ingredients.includes(this.board[index]) && !this.currentRoundMatchedCards.some(p => this.board[p] === this.board[index])) { //is a match AND not already matched this round
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
        this.flippedCards = [];
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
        this.winnings = [];
        //Early game, you just get a tiny bit of flunds. Once you unlock tourism, it gives you a temporary tourism boost.
        if (this.score >= 10) this.winnings.push(new Flunds(this.score)); //Theoretical max score with the game rules: 2 * 15 (four-ingredient recipes) + 2 * 10 (three-ingredient recipes) = 50. If you mess up on one of the 4-ingredient ones, 15 + 3 * 10 = 45. Mess up both and you can score 50 again, though... 5 * 10 = 50 because it'd leave 6 cards at the end.
        if (this.score >= 30) this.winnings[0].amount += 10;
        if (this.score >= 50) this.winnings[0].amount += 20;
        this.city.transferResourcesFrom(this.winnings.map(p => p.clone()), "earn");

        if (this.city.flags.has(CityFlags.UnlockedTourism) && this.score >= 10) {
            this.wonTourismTicks = Math.ceil(LONG_TICKS_PER_DAY * this.score / 25); //Up to 2 days worth of a tourism boost
            this.city.events.push(new TourismReward(this.wonTourismTicks));
            this.city.checkAndAwardTitle(TitleTypes.SmartCityShowcase.id);
        }
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
                this.uiManager.hideMinigame();
            }
        }));
    }

    private startGame(): void {
        if (this.city.checkAndSpendResources(this.costs)) {
            this.gameStarted = true;
            this.initializeGame();
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
            this.drawHowToPlay(overlay, parent);
            return;
        }

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10,
            width: "100%",
            height: "48px",
            text: "Memory Mixology",
        }));

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 80,
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

        this.costs[0].reddize = !this.city.hasResources(this.costs, false);
        addResourceCosts(overlay.children[overlay.children.length - 1], this.costs, 86, 58, false, false, false, 48, 10, 32);

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 240,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "minigame/bararrowdown"),
            id: "arrowDown",
            onClick: () => this.startGame(),
        }));

        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 320,
            width: "128px",
            height: "128px",
            image: new TextureInfo(128, 128, "minigame/bartipjar"),
            id: "tipJar",
            onClick: () => this.startGame(),
        }));

        //How to play button
        overlay.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 460,
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

        if (this.winnings.length) {
            //Draw the winnings from the last playthrough
            const winningsArea = overlay.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 520,
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

            if (this.wonTourismTicks) {
                //Only show the tourism reward if they won one
                winningsArea.addChild(new Drawable({
                    x: 20,
                    y: 220,
                    width: "48px",
                    height: "48px",
                    image: new TextureInfo(64, 64, "resource/tourists"),
                    scaleYOnMobile: true,
                }));
                winningsArea.addChild(new Drawable({
                    x: 80,
                    y: 230,
                    width: "390px",
                    height: "36px",
                    text: `${this.wonTourismTicks * (24 / LONG_TICKS_PER_DAY)} hours of slightly boosted tourism`,
                    scaleYOnMobile: true,
                }));
            }
        }
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
        root.onDrag = (x: number, y: number) => { this.scroller.handleDrag(y, root.screenArea); };
        root.onDragEnd = () => { this.scroller.resetDrag(); };

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
        this.scroller.setChildrenSize(1400);
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
            "minigame/bartipjar": "assets/minigame/bartipjar.png",
            "minigame/bararrowdown": "assets/minigame/bararrowdown.png",
        };

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}