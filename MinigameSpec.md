# Minigame Template Specification
This document attempts to distill the implementation of minigames in Towngardia, a TypeScript city builder, for generation of new minigames without needing to look through an entire example implementation.

## 1. **Class and Interface Structure**

### Key Classes or Interfaces
- **`The minigame`**: A class implementing `IHasDrawable` and `IOnResizeEvent`. Manages core game logic, state, and UI.
- **`Minigame state`**: Representation of game state (e.g., `TowerState`, `LevelState`) as needed.
- **`Minigame elements`**: Representations of game entities (e.g., `Room`, `Item`, `Entity`) as needed.

### External Interfaces
- **`IHasDrawable`**: Requires `asDrawable()` method for UI rendering.
- **`IOnResizeEvent`**: Handles resize events via `onResize()`.
These are both imported from `../ui/`

### Design Philosophy
- **Encapsulation**: Game logic and state are encapsulated within the base class.
- **Modularity**: Separation of concerns between game mechanics, UI, and state management. Drawing functions are defined last.
- **Magic numbers**: Use constants for things like tile dimensions and gameplay values, but maybe not UI elements' pixel dimensions and offsets.
- **No draw loop**: Redraws occur after each user interaction, without the code having to request it. For changes that occur because of a timer, trigger redraw via `this.uiManager.frameRequested = true;`.

---

## 2. **Minigame State Management**

### State Representation
- **State Class**: Central state object may contain properties such as:
  - Resources: e.g., `resources`, `currency`, `energy`, etc.
  - Game progress: e.g., `currentLevel`, `timer`, `score`, etc.
  - UI state: e.g., `selectedElement`, `activeMenu`, etc.
- **Minigame Class**: More general state such as:
  - userInputLocked: For preventing user interaction, accidental or otherwise, e.g., during intro countdown or notification sequence
  - building: If the minigame affects a specific building, this would point to it
  - isPractice: All minigames have a practice mode with a cost of OnePracticeRun (imported from `./MinigameUtil.js`)
  - endReason: String so the reason the game ended only needs evaluated once no matter how many times it redraws
  - Timeouts: Use NodeJS.Timeout to hold the return value of any call to setTimeout, such as for a brief animation or for a game timer
  - preloaded: Checked at the start of preloadImages and set to true at the end
  - winnings: Results of the last completed playthrough, set in calculateWinnings, which is called by endGame; this is usually a `Resource[]`
  - score: Many minigames use a simple score to base the winnings calculation on
  - gameStarted: The game is running
  - scroller: Generally, a StandardScroller(false, true) (which makes it vertical) is needed for the UI
  - shown: State for show() and hide()
  - lastDrawable: Set by asDrawable so getLastDrawable can return it; asDrawable always starts with `if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });`
  - howToPlayShown: Menu state like this is also stored directly in the main class for that minigame
  - selectedDifficulty: If the minigame has difficulty options, this might be a string like "easy"
  - countdownSteps: Array of strings for display at game start
  - countdownStep: Current index in that array
  - paperToUse, copperToUse, or similar: If the minigame allows the player to spend a main-game resource for an in-minigame bonus, this indicates the current setting, for use by getCosts()
  - selectedAbility: UI state like the player's current selection would generally be properties of the minigame class

### State Updates
- **Immutability**: Methods may create new state snapshots to avoid side effects, depending on the minigame complexity.
- **Event-Driven**: State changes are triggered by user actions (e.g., item placement) and possibly timing (timer updates).

---

## 3. **UI Components and Drawing**

### Drawable Hierarchy
- **`Drawable`**: Base class for UI elements with properties like `width`, `height`, `image`, and `onClick`.
- **Nested Structure**: Complex UIs are built by nesting `Drawable` objects (e.g., a menu contains buttons and icons; how-to-play text is often nested with anchor: 'bottom' because word wrap makes it impossible to calculate the next Y position).

### Layout Techniques
- **Positioning**: Absolute positioning with `x`, `y`, and `anchors` for responsive design. Nesting is used instead of relative positions; there is no clipping outside a Drawable's bounds.
- **Scrolling**: `StandardScroller` from `../ui/StandardScroller.js` handles one- or two-directional scrolling for long content (e.g., rules, inventory).

### Example UI Elements
- **Selector Menu**: 
  ```typescript
	selectorArea.addChild(new Drawable({
		x: index * (TILE_SIZE + 10),
		y: 0,
		width: TILE_SIZE + "px",
		height: TILE_SIZE + "px",
		onClick: () => this.handleSelect(element)
	}));
  ```
- **Timer or Progress Bar**: 
  ```typescript
	parent.addChild(new Drawable({
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
	}))
  ```

---

## 4. **Game Mechanics**

### Core System Examples
- **Resource Management** (for gameplay that involves resources):
  - **Costs**: Elements may consume resources from the minigame (e.g., `currency`, `energy`) or even from the main game (e.g., `Flunds`, `Copper`).
  - **Affordability Check**: `isAffordable()` validates resource constraints.
- **Placement System** (for gameplay that involves placing objects):
  - **Collision Detection**: Ensures elements don't overlap.
  - **Auto-Fill**: Default elements fill empty spaces if no valid moves remain.
- **Timer System** (for gameplay that requires a timer):
  - **Countdown**: `startTimer()` may use setTimeout to trigger an update every second.
  - **End Conditions**: Time runs out or no valid moves remain.

### Example Mechanics
- **Trash Can**:
  ```typescript
	private handleTrashClick(): void {
		if (this.selectedElement) {
			this.removeElement(this.selectedElement);
			this.state.currency -= TRASH_COST;
		}
	}
  ```
- **Timer**:
  ```typescript
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
  ```

---

## 5. **Patterns and Best Practices**

### Design Patterns
- **State Pattern**: Minigame state class(es) may encapsulate game state transitions.
- **Strategy Pattern**: Game mechanics (e.g., effects, placement rules) may be managed via configurable strategies, e.g., so images and constants for similar objects can all be defined in one place.

### Best Practices
- **Constants for Configuration**: 
  ```typescript
  const LEVEL_WIDTH_TILES = 10;
  const GAME_DURATION = 120; // seconds
  ```
- **Units**: Units like tiles, seconds, and Watts are generally placed at the end of the constant or property name if they're likely to be confusing; otherwise, at least include the unit in a comment by the member definition.
- **Helper Functions**: Encapsulate complex logic (e.g., `canPlaceElement()`, `isLevelComplete()`).
- **Type Safety**: Interfaces enforce data structure consistency.

---

## 6. **Extensibility and Customization**

### Defining Gameplay Objects
- **Element Definition Example**:
  ```typescript
  new MyGameElement("newItem", "New Item", 2, 100, 10, 5, [{ type: "bonus", magnitude: 0.02 }], 5)
  ```
  - If different functions are needed for certain elements (e.g., behavior overrides where most elements have a simple behavior), reference those functions by name so the data is easily readable, then define them later.

### Customizing Game Parameters
- **Adjust Constants**: Constants like `BASE_CURRENCY`, `GAME_DURATION`, or `TRASH_COST` should be near the header for easy modification.

---

## 7. **Event Handling and User Interaction**

### Scrolling
- **Scroller Class**: `StandardScroller` handles drag-and-scroll interactions for content like rules or inventory. Use it like this:
  - Always handle window resizes:
  ```typescript
  onResize(): void {
    this.scroller.onResize();
  }
  ```
  - For a scrollable area of the screen:
  ```typescript
  const overlay = parent.addChild(new Drawable({
    anchors: ["centerX"],
    centerOnOwnX: true,
    width: "min(100%, 600px)",
    height: "100%",
    fallbackColor: '#111111',
    onDrag: (x: number, y: number) => { this.scroller.handleDrag(y, overlay.screenArea); },
    onDragEnd: () => { this.scroller.resetDrag(); },
  }));
  ```
  - Before adding any scrollable drawable elements:
  ```typescript
  let nextY = 10 - this.scroller.getScroll();
  ```
  - After setting up all drawable elements:
  ```typescript
  this.scroller.setChildrenSize(nextY - baseY);
  ```
  - For the toggleRules function:
  ```typescript
  private toggleRules(): void {
    this.howToPlayShown = !this.howToPlayShown;
    if (this.howToPlayShown) {
        this.scroller.resetScroll();
    }
  }
  ```

### Click/Tap Handling
- **Click Event Example**: 
  ```typescript
  onClick: () => this.handleSelect(myGameElement)
  ```

### State-Driven UI
- **Conditional Rendering**: UI elements (e.g., "Give Up" button) may appear based on properties like `userInputLocked` and `gameStarted`.

---

## 8. **Animation**

### Animations
- **Example**:
  - Initiate the animation in the gameplay logic with a simple estimate of the animation duration:
  ```typescript
  this.state.drawOffset = 1;
  this.animateTimeout = setTimeout(() => {
    this.state.currentLevel++;
    this.state.drawOffset = 0;
  }, 400);
  ```
  - But apply the visual change somewhere in the asDrawable call tree:
  ```
  if (this.state.drawOffset > 0 && this.state.drawOffset < TILE_SIZE) {
    this.state.drawOffset += 2; // Somewhat fast upward-scrolling animation
    this.uiManager.frameRequested = true; // Because it only draws when needed, to save power on mobile devices
  }
  ```

---

## 9. **Error Handling and Edge Cases**

### Validation Examples
- **Resource Checks**: `isAffordable()` prevents invalid actions.
- **Boundary Checks**: Ensures elements stay within game boundaries.

### Game Over Condition Examples
- **Timer Expiry**: Sets endReason and triggers `endGame()`.
- **No Valid Moves**: Triggers a fallback state (e.g., "No moves left!").

---

## 10. **asDrawable Structure and Layout**

### Method Organization
- **`asDrawable()`**: Main method that delegates to helper methods like `drawGameArea()`, `drawStartOverlay()`, `drawHowToPlay()`, and `drawTimer()` (these examples are common exact names), which often have the signature `(parent: Drawable, nextY: number): number`.
- **Y Coordinate Management**: Helper methods return the next Y coordinate to make it easy for the designer to reorder them or add more padding.

#### Example:
```typescript
public asDrawable(): Drawable {
  if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

  const mainDrawable = new Drawable({ /* ... */ });
  if (!this.gameStarted) {
    this.drawStartOverlay(mainDrawable);
  } else {
    this.drawGameArea(mainDrawable);
  }
  return mainDrawable;
}

private drawGameArea(parent: Drawable): void {
  let nextY = this.drawLevel(parent, 80);
  this.drawProgressBar(parent);
  nextY = this.drawTimer(parent, nextY);
  // ...
}
```

---

## 11. **Common Generic Functions and Their Purposes**

### Core Functions
| Function         | Purpose |
|------------------|---------|
| `toggleRules()` | Toggles the visibility of game rules or instructions. |
| `preloadAssets()` | Loads assets (e.g., images, sounds) for the minigame. |
| `show()` | Initializes the minigame and prepares it for display. |
| `calculateRewards()` | Computes rewards or effects based on minigame state. |
| `getCosts()` | Returns resource costs for starting or continuing the game. Many minigames offer the player the option to use a specific resource for extra gameplay effects. |
| `endGame()` | Handles game termination and post-game logic. |
| `initializeGame()` | Sets up initial minigame state and resources. |
| `startGame()` | Begins the game, validating resources and initializing state. |

### Example Implementations
```typescript
private getCosts(): { type: string, amount: number }[] {
  return this.isPractice ? OnePracticeRun : 
    this.useResearch ? [{ type: "research", amount: 10 }, { type: "flunds", amount: 200 }] :
      [{ type: "flunds", amount: 1000 }];
}

public startGame(): void {
  if (this.city.checkAndSpendResources(this.getCosts())) {
    this.initializeGame();
    this.city.updateLastUserActionTime();
    this.game.fullSave();
  }
}
```

---

## 12. **Example Minigame Template**

### Structure
```typescript
// Lots of imports; common ones include:
import { TitleTypes } from "../game/AchievementTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { ProductionReward, TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { UIManager } from "../ui/UIManager.js";
import { Resource } from "../game/Resource.js";
import { Flunds, getResourceType } from "../game/ResourceTypes.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { Drawable } from "../ui/Drawable.js";
import { addResourceCosts, humanizeFloor, longTicksToDaysAndHours } from "../ui/UIUtil.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { GameState } from "../game/GameState.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { OnePracticeRun, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";
import { EffectType } from "../game/GridType.js";

// Maybe some state classes/interfaces and minigame options like these
interface Recipe {
    name: string;
    ingredients: string[];
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultySettings {
    fourIngredientRecipes: number;
    groupByType: boolean;
    wildcards: number;
    playCost: number;
    rewardMultiplier: number;
}

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
    easy: { fourIngredientRecipes: 2, groupByType: true, wildcards: 2, playCost: 1, rewardMultiplier: 1 },
    medium: { fourIngredientRecipes: 2, groupByType: false, wildcards: 2, playCost: 1, rewardMultiplier: 1.25 },
    hard: { fourIngredientRecipes: 2, groupByType: false, wildcards: 0, playCost: 1, rewardMultiplier: 1.5 }
}

export class MyMinigame implements IHasDrawable, IOnResizeEvent {
  private state: MyMinigameState;
  private uiManager: UIManager;

  constructor(private city: City, private uiManager: UIManager) {}

  // Add game-specific implementations of functions like startGame(), initializeGame(), getCosts(), calculateRewards(), and endGame() here

  // Add game-specific logic functions here

  asDrawable(): Drawable {
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
        addResourceCosts(startButton, this.getCosts(), 86 - (this.spendResearch ? 28 : 0), 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
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

        //Options, depending on the minigame design
        //nextY = drawMinigameOptions(this.city, overlay, nextY, [
        //    { group: "aa-r", id: "0", text: "Business Buds (+tourism)", icon: "resource/tourists" },
        //    { group: "aa-r", id: "1", text: "Power Pals (-power cost)", icon: "resource/power" },
        //    { group: "aa-r", id: "2", text: "Industrial Invitees (+production)", icon: "ui/logistics" }]);

        this.scroller.setChildrenSize(nextY - baseY);
    }

    private drawHowToPlay(overlay: Drawable, root: Drawable): void {
        let parent = overlay;
        parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 10 - this.scroller.getScroll(),
            width: "100%",
            height: "48px",
            text: "This Minigame Rules",
        }));

        root.onClick = () => this.toggleRules();

        parent = parent.addChild(new Drawable({
            x: 20,
            y: 80 - this.scroller.getScroll(),
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "One sentence.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Another sentence.",
        }));
    
        // ... More rules go here

        this.scroller.setChildrenSize(1500); // Very rough estimate
    }

  // Add game-specific UI functions here, such as drawStartOverlay, drawGameArea, drawTimer, drawResources, and drawCloseButton
  
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

  getLastDrawable(): Drawable | null {
    return this.lastDrawable;
  }
}
```

### Key Components to Implement
- **State Management**: Define interfaces for minigame state.
- **UI Drawing**: Use `Drawable` for buttons, timers, and game elements.
- **Event Handlers**: Link user actions to game logic (e.g., clicks, drags).