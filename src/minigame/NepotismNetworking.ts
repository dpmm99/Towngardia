import { City } from "../game/City.js";
import { UIManager } from "../ui/UIManager.js";
import { NepotismNetworkingPlays } from "../game/ResourceTypes.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { Drawable } from "../ui/Drawable.js";
import { addResourceCosts, humanizeFloor, longTicksToDaysAndHours } from "../ui/UIUtil.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { PowerReward, ProductionReward, TourismReward } from "../game/EventTypes.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { Assist } from "../game/Assist.js";
import { GameState } from "../game/GameState.js";
import { drawMinigameOptions } from "../ui/MinigameOptions.js";
import { OnePracticeRun, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";

// Constants
const GRID_WIDTH = 4;
const GRID_HEIGHT = 5;
const TOTAL_ROWS = 48;
const TILE_SIZE = 96;
const MAX_FACES_PER_ROW = 8;
const SHIFT_ANIMATION_FRAMES = 10;
const GAME_DURATION = 90; // seconds
const SOURCE_X = Math.floor(GRID_WIDTH / 2);
const CONNECTIONS = [
    { dx: 0, dy: -1, fromIdx: 0, toIdx: 2 }, // top
    { dx: 1, dy: 0, fromIdx: 1, toIdx: 3 },  // right
    { dx: 0, dy: 1, fromIdx: 2, toIdx: 0 },  // bottom
    { dx: -1, dy: 0, fromIdx: 3, toIdx: 1 }  // left
];

// Types
interface Tile {
    connections: boolean[]; // [top, right, bottom, left]
    connected: boolean; // Whether this tile is connected to source
    bonus?: 'duration' | 'quantity'; // Optional bonus icon
    solved?: boolean; // The correct orientation in the solution
}

interface GridState {
    tiles: Tile[][];
    topRow: number; // Index into the full puzzle of the current top row
    shiftOffset: number; // For animation
    rowFaces: number[]; // IDs of face icons to draw to the left of the grid
    lockedInBonuses: ('duration' | 'quantity')[]; // Bonuses that the player has earned (even if they have to disconnect that tile afterward)
}

interface Position {
    x: number;
    y: number;
}

interface PuzzleGenerator {
    solution: Tile[][];
    initialState: Tile[][];
}

export class NepotismNetworking implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private howToPlayShown: boolean = false;
    private gameStarted: boolean = false;
    private winnings: TourismReward | ProductionReward | PowerReward | null = null;
    private score: number = 0; //Should be something like 10 per consecutive completed row plus 1 per connected tile below the last completed row
    private timer: number = GAME_DURATION;
    private timerTimeout: NodeJS.Timeout | null = null;
    private gridState: GridState | null = null;
    private selectedAbility: 'share' | 'advertise' | null = null;
    private appsAllowance: number = 0;
    private preloaded: boolean = false;
    private costs = [{ type: new NepotismNetworkingPlays().type, amount: 1 }];
    private userInputLocked: boolean = false;
    private isPractice: boolean = false;

    constructor(private city: City, private friendCity: City, private uiManager: UIManager, private game: GameState) { }

    private initializeGame(): void {
        this.timer = GAME_DURATION;
        this.appsAllowance = Math.floor(Math.min(3, this.city.resources.get("apps")!.amount));
        this.selectedAbility = null;
        this.gridState = this.generatePuzzle();
        this.gameStarted = true;
        this.userInputLocked = false;
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
                this.endGame();
            } else {
                this.startTimer();
            }
            this.uiManager.frameRequested = true;
        }, 1000);
    }

    private generatePuzzle(): GridState {
        const puzzle = this.generateSolvablePuzzle();
        this.traverseConnections(puzzle.initialState);
        const rowFaces: number[] = [];
        for (let i = 1; i < puzzle.initialState.length; i++) rowFaces.push(this.generateUniqueFace(rowFaces));
        return {
            tiles: puzzle.initialState,
            topRow: 0,
            shiftOffset: 0,
            rowFaces,
            lockedInBonuses: []
        };
    }

    private generateSolvablePuzzle(): PuzzleGenerator {
        // Generate full solution first
        const solution: Tile[][] = Array(TOTAL_ROWS + GRID_HEIGHT).fill(null).map(() =>
            Array(GRID_WIDTH).fill(null).map(() => ({
                connections: [false, false, false, false],
                connected: false,
                solved: false
            }))
        );

        // Create source tile in first row and keep the others empty
        for (let x = 0; x < GRID_WIDTH; x++) {
            solution[0][SOURCE_X] = {
                connections: [false, false, x === SOURCE_X, false],
                connected: true,
                solved: true
            };
        }

        // Generate solution path
        this.generateSolutionPath(solution, { x: SOURCE_X, y: 0 });

        // Create initial state by rotating tiles randomly
        const initialState = solution.map(row =>
            row.map(tile => ({
                ...tile,
                connections: this.randomRotation(tile.connections),
                connected: false,
                solved: undefined // Remove solution info
            }))
        );

        //Go back and make a second pass to reduce the likelihood of tiles being pre-connected.
        for (let y = 1; y < initialState.length; y++) for (let x = 0; x < GRID_WIDTH; x++) {
            const tile = initialState[y][x];
            const possibleConnections = tile.connections.filter(c => c).length;
            if (possibleConnections === 4) continue; //Nothing we can do about those.

            // Try all 4 possible rotations and keep track of the best one
            let minConnections = possibleConnections;
            let bestRotation = 0;

            for (let rotation = 0; rotation < 4; rotation++) {
                let connectedCount = 0;
                for (let connection of CONNECTIONS) {
                    const newX = x + connection.dx;
                    const newY = y + connection.dy;
                    if (newX >= 0 && newX < GRID_WIDTH && newY >= 0 && newY < initialState.length) {
                        const neighbor = initialState[newY][newX];
                        // Check if this tile's connection matches the neighbor's connection
                        // accounting for the current test rotation
                        const rotatedIdx = (connection.fromIdx + rotation) % 4;
                        if (tile.connections[rotatedIdx] && neighbor.connections[connection.toIdx]) {
                            connectedCount++;
                        }
                    }
                }

                if (connectedCount < minConnections) {
                    minConnections = connectedCount;
                    bestRotation = rotation;
                }

                // Early exit if we found a rotation with no connections
                if (minConnections === 0) break;
            }

            // Apply the best rotation found
            for (let i = 0; i < bestRotation; i++) {
                tile.connections.unshift(tile.connections.pop()!);
            }
        }


        // Ensure source tile is correctly oriented
        initialState[0][SOURCE_X] = {
            ...solution[0][SOURCE_X],
            solved: undefined
        };

        //Path is ready; now add some bonuses to dead-end tiles. Fixed number of each type of bonus.
        const deadEnds: Tile[] = [];
        for (let y = 1; y < initialState.length; y++) for (let x = 0; x < GRID_WIDTH; x++)
            if (initialState[y][x].connections.filter(c => c).length === 1) deadEnds.push(initialState[y][x]);
        inPlaceShuffle(deadEnds);
        //Also include straight-line tiles, because dead ends are pretty rare.
        const straightLines: Tile[] = [];
        for (let y = 1; y < initialState.length; y++) for (let x = 0; x < GRID_WIDTH; x++)
            if ((initialState[y][x].connections[0] && initialState[y][x].connections[2] && !initialState[y][x].connections[1] && !initialState[y][x].connections[3])
                || (initialState[y][x].connections[1] && initialState[y][x].connections[3] && !initialState[y][x].connections[0] && !initialState[y][x].connections[2])) straightLines.push(initialState[y][x]);
        inPlaceShuffle(straightLines);
        deadEnds.push(...straightLines);
        let i = 0;
        for (; i < Math.min(4, deadEnds.length); i++) deadEnds[i].bonus = 'duration'; //Worth one tick each
        for (; i < Math.min(4 + 5, deadEnds.length); i++) deadEnds[i].bonus = 'quantity'; //Worth 1% each

        return { solution, initialState };
    }
    
    private generateSolutionPath(solution: Tile[][], current: Position): void {
        const stack: Position[] = [current];
        const visited = new Set<string>();
        let firstRouteEnded = false;
        const currentRoute: Position[] = [];

        while (stack.length > 0) {
            current = stack.pop()!;
            const key = `${current.x},${current.y}`;

            if (!visited.has(key)) {
                visited.add(key);
                currentRoute.push(current);

                // Get valid neighbors that haven't been visited
                let neighbors = this.getValidNeighbors(current, solution)
                    .filter(n => !visited.has(`${n.x},${n.y}`) && n.y !== 0); //Don't affect the top row
                if (!neighbors.length) neighbors = this.getValidNeighbors(current, solution).filter(p => p.y !== 0);

                inPlaceShuffle(neighbors);

                // Connect to some neighbors (prefer 2 connections IN THE END STATE, not 2 each time you consider a tile, which is up to 4 times each)
                const numConnections = Math.random() < 0.8 ? 1 :
                    Math.random() < 0.90 ? 2 :
                        Math.random() < 0.96 ? 3 : 4;

                for (let i = 0; i < Math.min(numConnections, neighbors.length); i++) {
                    const neighbor = neighbors[i];
                    this.connectTiles(solution, current, neighbor);
                    stack.push(neighbor);
                }
            }

            //Pick an unvisited tile to start a new path from
            if (stack.length === 0) {
                if (firstRouteEnded) {
                    //Check if any tile on the current route can be reached from the origin. If not, add a new connection between one of this route's tiles and any visited tile that isn't in this route.
                    this.traverseConnections(solution);
                    const connected = currentRoute.find(p => solution[p.y][p.x].connected);
                    if (!connected) {
                        for (let i = 0; i < currentRoute.length; i++) {
                            const pos = currentRoute[i];
                            const neighbors = this.getValidNeighbors(pos, solution);
                            const canConnectTo = neighbors.find(n => n.y !== 0 && visited.has(`${n.x},${n.y}`) && !currentRoute.find(p => p.x === n.x && p.y === n.y));
                            if (canConnectTo) {
                                this.connectTiles(solution, pos, canConnectTo); //Now the whole path is guaranteed to be connected to the source, which means ALL visited tiles are.
                                break;
                            }
                        }
                    }
                }
                firstRouteEnded = true;
                currentRoute.length = 0;

                for (let y = 1; y < solution.length; y++) {
                    for (let x = 0; x < GRID_WIDTH; x++) {
                        if (!visited.has(`${x},${y}`)) { //Hasn't been visited, but does have a visited neighbor => it's the origin of our new path. Connect it to the existing solution.
                            const existingConnected = this.getValidNeighbors({ x, y }, solution).filter(n => visited.has(`${n.x},${n.y}`) && n.y !== 0);
                            if (existingConnected.length) {
                                stack.push({ x, y });
                                this.connectTiles(solution, { x, y }, existingConnected[Math.floor(Math.random() * existingConnected.length)]);
                                y = solution.length;
                                break;
                            }
                        }
                    }
                }
            }
        }

        //Guarantee solvability within the sliding window by starting a fresh traversal from each row's downward-connected tiles and adding new connections if the traversal doesn't fill the window. Do not check connections past the end of the window.
        for (let y = 1; y < solution.length - GRID_HEIGHT; y++) {
            const visited = new Set<string>();
            const stack: Position[] = solution[y - 1].map((t, i) => ({ x: i, y: y - 1, connected: t.connections[2] && t.connected })).filter(p => p.connected);
            let solved = false;
            while (!solved) {
                while (stack.length > 0) { //Just BFS to detect what tiles are connected.
                    const pos = stack.pop()!;
                    const key = `${pos.x},${pos.y}`;
                    if (visited.has(key)) continue;
                    visited.add(key);
                    const tile = solution[pos.y][pos.x];
                    for (const dir of CONNECTIONS) {
                        const newX = pos.x + dir.dx;
                        const newY = pos.y + dir.dy;
                        if (newX >= 0 && newX < GRID_WIDTH && newY >= y && newY < y + GRID_HEIGHT) { //Stay strictly within the window (y is the top).
                            const nextTile = solution[newY][newX];
                            if (tile.connections[dir.fromIdx] && nextTile.connections[dir.toIdx]) {
                                stack.push({ x: newX, y: newY });
                            }
                        }
                    }
                }

                //Find all disconnected tiles that are adjacent to a connected one, pick one, connect it to the connected one, then add the previously-disconnected tile to the stack for further traversal.
                const slidingWindow = solution.slice(y, y + GRID_HEIGHT);
                const candidates: { connected: Position, disconnected: Position }[] = [];
                for (let i = 0; i < GRID_WIDTH; i++) {
                    for (let j = y; j < y + GRID_HEIGHT; j++) {
                        if (visited.has(`${i},${j}`)) continue; //Looking for any disconnected tiles, not connected ones.
                        const neighbors = this.getValidNeighbors({ x: i, y: j - y }, slidingWindow); //Only check within the window--but for that, we have to adjust the input and output positions by y
                        const connected = neighbors.map(c => ({ x: c.x, y: c.y + y })).filter(c => visited.has(`${c.x},${c.y}`)); //Has to have a connected neighbor to be a candidate for making the window solvable.
                        candidates.push(...connected.map(c => ({ connected: c, disconnected: { x: i, y: j } })));
                    }
                }
                if (candidates.length) {
                    //Pick a random candidate, then pick a random connected neighbor to connect it to--it's guaranteed to have at least one usable neighbor by the above 'candidates' loop.
                    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
                    this.connectTiles(solution, candidate.connected, candidate.disconnected);
                    stack.push(candidate.disconnected);
                }
                solved = stack.length === 0;
            }
        }

        //Debug code to find any tiles that don't have connections
        //this.traverseConnections(solution);
        //for (let y = 1; y < solution.length; y++) {
        //    for (let x = 0; x < GRID_WIDTH; x++) {
        //        if (!solution[y][x].connections.some(p => p)) debugger;
        //    }
        //}
    }


    private getValidNeighbors(pos: Position, grid: Tile[][]): Position[] {
        const neighbors: Position[] = [];
        const directions = [
            { dx: 0, dy: -1 }, // top
            { dx: 1, dy: 0 },  // right
            { dx: 0, dy: 1 },  // bottom
            { dx: -1, dy: 0 }  // left
        ];

        for (const dir of directions) {
            const newX = pos.x + dir.dx;
            const newY = pos.y + dir.dy;

            if (newX >= 0 && newX < GRID_WIDTH &&
                newY >= 0 && newY < grid.length) {
                neighbors.push({ x: newX, y: newY });
            }
        }

        return neighbors;
    }

    private connectTiles(grid: Tile[][], pos1: Position, pos2: Position): void {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;

        // Determine connection indices
        let idx1: number, idx2: number;
        if (dx === 1) { idx1 = 1; idx2 = 3; }       // right-left
        else if (dx === -1) { idx1 = 3; idx2 = 1; } // left-right
        else if (dy === 1) { idx1 = 2; idx2 = 0; }  // bottom-top
        else { idx1 = 0; idx2 = 2; }                // top-bottom

        // Create tiles if they don't exist
        if (!grid[pos1.y][pos1.x]) {
            grid[pos1.y][pos1.x] = {
                connections: [false, false, false, false],
                connected: false,
                solved: true
            };
        }
        if (!grid[pos2.y][pos2.x]) {
            grid[pos2.y][pos2.x] = {
                connections: [false, false, false, false],
                connected: false,
                solved: true
            };
        }

        // Add connections
        grid[pos1.y][pos1.x].connections[idx1] = true;
        grid[pos2.y][pos2.x].connections[idx2] = true;
    }
    
    private randomRotation(connections: boolean[]): boolean[] {
        const rotations = Math.floor(Math.random() * 4);
        const result = [...connections];
        for (let i = 0; i < rotations; i++) {
            result.unshift(result.pop()!);
        }
        return result;
    }

    private checkConnections(): void {
        if (!this.gridState) return;

        // Reset all connections except source
        for (let y = 0; y < this.gridState.tiles.length; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (y === 0 && x === SOURCE_X) continue;
                this.gridState.tiles[y][x].connected = false;
            }
        }

        // Start from source and traverse
        this.traverseConnections(this.gridState.tiles);
    }

    private traverseConnections(grid: Tile[][]): void {
        const stack: Position[] = [{ x: SOURCE_X, y: 0 }];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const pos = stack.pop()!;
            const key = `${pos.x},${pos.y}`;

            if (visited.has(key)) continue;
            visited.add(key);

            const tile = grid[pos.y][pos.x];
            tile.connected = true;

            // Check all four directions
            for (const dir of CONNECTIONS) {
                const newX = pos.x + dir.dx;
                const newY = pos.y + dir.dy;

                if (newX >= 0 && newX < GRID_WIDTH &&
                    newY >= 0 && newY < grid.length) {
                    const nextTile = grid[newY][newX];
                    if (tile.connections[dir.fromIdx] &&
                        nextTile.connections[dir.toIdx]) {
                        stack.push({ x: newX, y: newY });
                    }
                }
            }
        }
    }

    private checkForRowCompletion(): void {
        if (!this.gridState) return;

        // Check if top row is fully connected
        const isTopRowComplete = this.gridState.tiles[this.gridState.topRow + 1]?.every(tile => tile.connected);

        if (isTopRowComplete) {
            // Add to lockedInBonuses if there are any bonus in that row, and remove them from the tiles
            for (const tile of this.gridState.tiles[this.gridState.topRow + 1]) {
                if (tile.bonus) {
                    this.gridState.lockedInBonuses.push(tile.bonus);
                    tile.bonus = undefined;
                }
            }

            // Start shift animation (unless you acted while it's already shifting)
            //Note: it is possible to reach the point at which it won't shift anymore; we'll end the game early in that case
            if (this.gridState.topRow < TOTAL_ROWS - GRID_HEIGHT) {
                if (this.gridState.shiftOffset === 0) {
                    this.gridState.shiftOffset = TILE_SIZE;

                    // Update grid
                    this.gridState.topRow++;

                    // Recheck connections after shift
                    this.checkConnections();
                }
            } else if (this.gridState.tiles.slice(this.gridState.topRow + 2, this.gridState.topRow + GRID_HEIGHT).every(row => row?.every(tile => tile.connected))) {
                this.endGame();
            }
        }
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
        if (this.timerTimeout) {
            clearTimeout(this.timerTimeout);
            this.timerTimeout = null;
        }
    }

    public isShown(): boolean {
        return this.shown;
    }

    public isPlaying(): boolean { return this.shown && this.gameStarted; }

    private endGame(): void {
        if (this.timerTimeout) {
            clearTimeout(this.timerTimeout);
            this.timerTimeout = null;
        }

        // Lock-in any bonuses that are 'connected' that haven't been locked in yet, starting at topRow + 1 since topRow and above have already had their bonuses locked-in
        for (let y = this.gridState!.topRow + 1; y < this.gridState!.tiles.length; y++) {
            for (const tile of this.gridState!.tiles[y]) {
                if (tile.bonus && tile.connected) {
                    this.gridState!.lockedInBonuses.push(tile.bonus);
                    tile.bonus = undefined;
                }
            }
        }

        this.calculateWinnings();
        this.city.updateLastUserActionTime();
        this.game.fullSave();
        // Freeze input and keep showing the grid for a couple seconds before returning to the main screen.
        this.userInputLocked = true;
        setTimeout(() => { this.gameStarted = false; }, 1000); //Will wait for the user to tap to continue.
    }

    private calculateWinnings(): void {
        if (!this.gridState) return;
        this.winnings = null;
        if (this.isPractice) return;

        // Calculate tourism duration and boost percentage, then add a TourismReward event to the friend city (methodology TBD) and a weaker one to the player's own city
        this.score = this.gridState.tiles.slice(this.gridState.topRow + 1).reduce((acc, row) => acc + row.filter(t => t.connected).length, 0) + 10 * this.gridState.topRow;
        //BaseScore caps around 400, but that's a bit of an absurd score. Let's say 240 is a good score for a perfect game. Apply diminishing returns to the score.
        const ticks = Math.round(LONG_TICKS_PER_DAY * 2 * (1 - Math.exp(-this.score / 240))); //Theoretical max of <2 days, most likely just 1-1.5 days for a decent player, I think.
        const quantity = 0.01 + 0.05 * (1 - Math.exp(-this.score / 240)); //Base 1%, theoretical max 5%, 2% at 5 rows, 3% at 10 rows 4% at 18 rows
        const durationBonus = this.gridState.lockedInBonuses.filter(b => b === 'duration').length; //1 tick each, max 4 ticks total
        const quantityBonus = this.gridState.lockedInBonuses.filter(b => b === 'quantity').length * 0.01; //1% each, max 5% total

        let event: TourismReward | ProductionReward | PowerReward;
        if (this.city.minigameOptions.get("nn-r") === "1") {
            event = new PowerReward(ticks + durationBonus, quantity + quantityBonus);
        } else if (this.city.minigameOptions.get("nn-r") === "2") {
            event = new ProductionReward(ticks + durationBonus, quantity + quantityBonus);
        } else {
            event = new TourismReward(ticks + durationBonus, quantity + quantityBonus);
        }
        if (event.maxDuration) { //Don't turn tourism into NaN due to division by zero if the reward was zero ticks
            this.sendAssist(event);
            this.city.events.push(event);
        }
        this.winnings = event;
        progressMinigameOptionResearch(this.city, rangeMapLinear(this.score, 0.01, 0.1, 100, 1000, 0.001));
    }

    private sendAssist(event: TourismReward | ProductionReward | PowerReward) {
        try {
            this.uiManager.game.sendAssist(new Assist(this.friendCity.id, event, Date.now(), this.friendCity.player.id.toString()));
        } catch {
            //Couldn't send the winnings to the other player.
            if (confirm("Failed to send your assistance to the other player. This is expected if you just got prompted to log in again. Press OK to try again once you've confirmed that you're connected and logged in...or press cancel to be greedy. :)")) {
                this.sendAssist(event);
            }
        }
    }

    public handleTileClick(x: number, y: number): void {
        if (!this.gameStarted || !this.gridState || this.userInputLocked) return;

        if (this.selectedAbility) {
            this.applyAbility(x, y);
        } else {
            this.rotateTile(x, y);
        }

        this.checkConnections();
        this.checkForRowCompletion();
    }


    private applyAbility(x: number, y: number): void {
        if (!this.selectedAbility || !this.gridState || this.appsAllowance <= 0) return;

        if (this.selectedAbility === 'share') {
            // Affect target tile and tiles to right and below
            const positions = [
                { x, y },
                { x: x + 1, y },
                { x, y: y + 1 },
                { x: x + 1, y: y + 1 }
            ];

            for (const pos of positions) {
                if (pos.x < GRID_WIDTH && pos.y < this.gridState.tiles.length) {
                    this.gridState.tiles[pos.y][pos.x].connections = [true, true, true, true];
                }
            }
        } else if (this.selectedAbility === 'advertise') {
            // Get surrounding tiles that have fewer than 4 connections
            const surroundingPositions: Position[] = [];
            for (let newY = Math.max(this.gridState.topRow, y - 1); newY <= Math.min(this.gridState.tiles.length - 1, y + 1); newY++) {
                for (let newX = Math.max(0, x - 1); newX <= Math.min(GRID_WIDTH, x + 1); newX++) {
                    if ((x === newX && y === newY) || this.gridState.tiles[newY][newX].connections.every(c => c)) continue;
                    surroundingPositions.push({ x: newX, y: newY });
                }
            }

            // Randomly select 4 tiles (plus always include the tapped tile)
            surroundingPositions.sort(() => Math.random() - 0.5);
            const selectedPositions = [{ x, y }, ...surroundingPositions.slice(0, 4)];

            // Add one random connection to each selected tile
            for (const pos of selectedPositions) {
                const tile = <Tile>this.gridState.tiles[pos.y][pos.x];
                const availableIndices = tile.connections
                    .map((c, i) => c ? -1 : i)
                    .filter(i => i !== -1);
                const randomIndex = availableIndices[
                    Math.floor(Math.random() * availableIndices.length)
                ];
                tile.connections[randomIndex] = true;
            }
        }

        // Deduct app usage
        this.appsAllowance--;
        this.city.resources.get("apps")!.consume(1);
        this.selectedAbility = null;

        // Update connections
        this.checkConnections();
        this.checkForRowCompletion();
    }

    private rotateTile(x: number, y: number): void {
        if (!this.gridState) return;
        const tile = this.gridState.tiles[y][x];
        // Rotate connections array right by 1
        tile.connections.unshift(tile.connections.pop()!);
    }

    private generateUniqueFace(facesSoFar: number[]): number {
        const faces = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const recent = facesSoFar.slice(-2) || []; //can't generate the same face as either of the previous two, ensuring higher variety
        const available = faces.filter(f => !recent.includes(f));
        return available[Math.floor(Math.random() * available.length)];
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const mainDrawable = new Drawable({
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "networkingGame"
        });

        if (!this.gameStarted) {
            this.drawStartOverlay(mainDrawable);
            if (!this.howToPlayShown) this.drawCloseButton(mainDrawable);
        } else {
            this.drawGameArea(mainDrawable);
        }

        // If offset is non-zero, request another frame for animation
        if (this.gridState?.shiftOffset) {
            this.gridState!.shiftOffset -= TILE_SIZE / SHIFT_ANIMATION_FRAMES;
            if (this.gridState.shiftOffset < 0.01) this.gridState.shiftOffset = 0;
            this.uiManager.frameRequested = true;
            if (this.gridState.shiftOffset === 0) { //May need to keep shifting if the new top row is also completed.
                this.checkConnections();
                this.checkForRowCompletion();
            }
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
            text: "Nepotism Networking",
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

        const costs = this.isPractice ? OnePracticeRun : this.costs;
        const unaffordable = !this.city.hasResources(costs, false);
        addResourceCosts(startButton, this.costs, 82, 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
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

        if (this.winnings) {
            //Draw the winnings from the last playthrough
            const winningsArea = overlay.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: nextY,
                width: "min(100%, 500px)",
                height: "250px",
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
                width: "calc(100% - 40px)",
                height: "32px",
                text: "Rewards attained:",
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 100,
                width: "calc(100% - 40px)",
                height: "32px",
                text: "(For both yourself and " + (this.friendCity.player.name ?? "Unknown Friend") + ")",
            }));

            winningsArea.addChild(new Drawable({
                x: 20,
                y: 142,
                width: "48px",
                height: "48px",
                image: new TextureInfo(64, 64, (this.winnings instanceof TourismReward) ? "resource/tourists" : (this.winnings instanceof ProductionReward) ? "ui/logistics" : "resource/power"),
            }));
            winningsArea.addChild(new Drawable({
                x: 80,
                y: 152,
                width: "calc(100% - 100px)",
                height: "36px",
                text: `+${humanizeFloor(this.winnings.variables[0] * 100)}% ${(this.winnings instanceof TourismReward) ? "tourism" : (this.winnings instanceof ProductionReward) ? "factory output" : "power discount"}`,
            }));

            winningsArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 200,
                width: "calc(100% - 40px)",
                height: "32px",
                text: `Decreases evenly over ${longTicksToDaysAndHours(this.winnings.duration)}`,
            }));

            nextY += 260;
        }

        nextY = drawMinigameOptions(this.city, overlay, nextY, [
            { group: "nn-r", id: "0", text: "Business Buds (+tourism)", icon: "resource/tourists" },
            { group: "nn-r", id: "1", text: "Power Pals (-power cost)", icon: "resource/power" },
            { group: "nn-r", id: "2", text: "Industrial Invitees (+production)", icon: "ui/logistics" }]);

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
            text: "Nepotism Networking Rules",
        }));

        root.onClick = () => this.toggleRules();

        parent = parent.addChild(new Drawable({
            x: 20,
            y: 80 - this.scroller.getScroll(),
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "This minigame is about building a word-of-mouth advertising network in your friend's city for mutual benefit.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Tap tiles to rotate them, building a path from the origin (the light blue line at the top of the network) through as many tiles as you can.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "When you complete a row near the top (forming a solid social connection), the whole network will shift up, revealing a new row at the bottom.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The completed row will stay on-screen, because you may need to adjust it to connect more rows below.",
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "Completed rows are more valuable than independent connected tiles (mere acquaintances).",
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "If time is about to run out, take a moment to connect any on-screen bonus tiles, which increase different aspects of the rewards:",
        }));

        //Bonus icons and labels
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            x: -80,
            y: -60,
            centerOnOwnX: true,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, 'minigame/neponetduration')
        }));
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            x: -80,
            y: -95,
            centerOnOwnX: true,
            width: "100px",
            height: "30px",
            text: "Duration",
        }));
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            x: 40,
            y: -60,
            centerOnOwnX: true,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, 'minigame/neponetquantity')
        }));
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            x: 40,
            y: -95,
            centerOnOwnX: true,
            width: "100px",
            height: "30px",
            text: "Quantity",
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -150,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You can spend one of your city's Apps to use the Share or Advertise special abilities (max 3 Apps per play).",
        }));

        //Share icon
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -20,
            y: -70,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, 'minigame/neponetshare')
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -125,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The Share ability converts the next tile you tap into a +, along with the one below it, the one to its right, and the one below that (i.e., 4 tiles in a square area).",
        }));

        //Advertise icon
        parent.addChild(new Drawable({
            anchors: ['bottom', 'centerX'],
            centerOnOwnX: true,
            x: -20,
            y: -70,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, 'minigame/neponetadvertise')
        }));
        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -125,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "The Advertise ability adds a connection to the next tile you tap and 4 of the 8 surrounding tiles at random.",
        }));

        parent = parent.addChild(new Drawable({
            anchors: ['bottom'],
            y: -50,
            width: "calc(100% - 40px)",
            height: "40px",
            wordWrap: true,
            keepParentWidth: true,
            text: "You have " + GAME_DURATION + " seconds to connect as many tiles as possible.",
        }));

        this.scroller.setChildrenSize(1500);
    }

    private drawGameArea(parent: Drawable): void {
        if (!this.gridState) return;

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
        //Something to cover the bottommost grid tile during shifting but not the timer or score area.
        gameArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 80 + GRID_HEIGHT * TILE_SIZE,
            width: "100%",
            height: TILE_SIZE + "px",
            fallbackColor: '#333333',
            id: "gridBottomCover"
        }));

        this.drawTimer(gameArea);
        this.drawCompletedFaces(gameArea);
        this.drawAbilityBar(gameArea);

        if (this.userInputLocked) {
            //Draw a "Time's up!" message with a plain background color in the center of the grid.
            gameArea.addChild(new Drawable({
                anchors: ['centerX'],
                centerOnOwnX: true,
                y: 80 + GRID_HEIGHT * TILE_SIZE / 2 - 32,
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
                        text: (this.gridState.topRow < TOTAL_ROWS - GRID_HEIGHT ||
                            !this.gridState.tiles.slice(this.gridState.topRow + 2, this.gridState.topRow + GRID_HEIGHT).every(row => row?.every(tile => tile.connected)))
                            ? "Time's up!" : "Complete!",
                    })
                ]
            }));
        } else {
            //Put a "give up" button at the top right corner
            gameArea.addChild(new Drawable({
                anchors: ['right'],
                x: 10,
                y: 10,
                width: "100px",
                height: "48px",
                fallbackColor: '#444444',
                onClick: () => this.endGame(),
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

    private drawGrid(parent: Drawable): void {
        const gridArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 80,
            width: (GRID_WIDTH * TILE_SIZE) + "px",
            height: (GRID_HEIGHT * TILE_SIZE) + "px",
            fallbackColor: '#333333',
            id: "gridArea"
        }));

        // Draw grid tiles with offset for animation
        if (!this.gridState) return;
        const yOffset = -this.gridState.shiftOffset;
        for (let y = this.gridState.topRow - (yOffset ? 1 : 0); y < this.gridState.topRow + GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.drawTile(gridArea, x, y - this.gridState.topRow, yOffset, this.gridState.tiles[y][x]);
            }

            // Also draw the face next to each row
            if (y <= this.gridState.topRow) continue; //No face for the topmost row because it's already been claimed.
            gridArea.addChild(new Drawable({
                x: -80,
                y: (y - this.gridState.topRow) * TILE_SIZE + 16 - yOffset,
                width: "64px",
                height: "64px",
                image: new TextureInfo(64, 64, `minigame/neponetface${this.gridState.rowFaces[y - 1]}`)
            }));
        }
    }

    private drawTile(parent: Drawable, tileX: number, tileY: number, yOffset: number, tile: Tile): void {
        const tileDrawable = parent.addChild(new Drawable({
            x: tileX * TILE_SIZE,
            y: tileY * TILE_SIZE - yOffset,
            width: TILE_SIZE + "px",
            height: TILE_SIZE + "px",
            fallbackColor: '#444444',
            onClick: () => this.handleTileClick(tileX, tileY + this.gridState!.topRow)
        }));

        // Draw connections
        tile.connections.forEach((connected, i) => {
            if (!connected) return;
            //Top, right, bottom, left. i = 0, 1, 2, 3. Formulaically set x and y and width and height according to i.
            tileDrawable.addChild(new Drawable({
                x: i === 3 ? 0 : TILE_SIZE * 0.45,
                y: i === 0 ? 0 : TILE_SIZE * 0.45,
                width: i % 2 === 0 ? "10%" : "55%",
                height: i % 2 === 0 ? "55%" : "10%",
                fallbackColor: tile.connected ? '#22DDFF' : '#666666'
            }));
        });

        // Draw bonus icon if present
        if (tile.bonus) {
            tileDrawable.addChild(new Drawable({
                x: TILE_SIZE * 0.25,
                y: TILE_SIZE * 0.25,
                width: "50%",
                height: "50%",
                image: new TextureInfo(32, 32, `minigame/neponet${tile.bonus}`)
            }));
        }
    }

    private drawTimer(parent: Drawable): void {
        const timerArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            noXStretch: false,
            y: GRID_HEIGHT * TILE_SIZE + 80,
            width: (GRID_WIDTH * TILE_SIZE) + "px",
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
    }

    private drawCompletedFaces(parent: Drawable): void {
        const facesArea = parent.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: GRID_HEIGHT * TILE_SIZE + 80 + 30,
            width: (MAX_FACES_PER_ROW * 40) + "px",
            height: "240px",
            fallbackColor: '#333333'
        }));

        facesArea.addChild(new Drawable({
            anchors: ['centerX'],
            centerOnOwnX: true,
            y: 0,
            width: "100%",
            height: "32px",
            text: "Reached so far:",
        }));

        this.gridState!.rowFaces.forEach((face, i) => {
            if (i >= this.gridState!.topRow) return;
            facesArea.addChild(new Drawable({
                x: (i % MAX_FACES_PER_ROW) * 40,
                y: 32 + Math.floor(i / MAX_FACES_PER_ROW) * 40,
                width: "40px",
                height: "40px",
                image: new TextureInfo(32, 32, `minigame/neponetface${face}`)
            }));
        });

        // Also draw the locked-in bonuses
        const completedFacesHeight = 32 + Math.ceil(this.gridState!.topRow / MAX_FACES_PER_ROW) * 40;
        this.gridState!.lockedInBonuses.forEach((bonus, i) => {
            facesArea.addChild(new Drawable({
                x: (i % MAX_FACES_PER_ROW) * 40,
                y: completedFacesHeight + Math.floor(i / MAX_FACES_PER_ROW) * 40,
                width: "40px",
                height: "40px",
                image: new TextureInfo(32, 32, `minigame/neponet${bonus}`)
            }));
        });
    }

    private drawAbilityBar(parent: Drawable): void {
        const abilityBar = parent.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 80,
            width: "64px",
            height: "240px",
            fallbackColor: '#333333'
        }));

        // Draw apps allowance
        addResourceCosts(abilityBar, [{ type: "apps", amount: this.appsAllowance }], 8, 0, false, false, false, 48, 8, 24);

        // Draw ability buttons
        ['share', 'advertise'].forEach((ability, i) => {
            abilityBar.addChild(new Drawable({
                y: 90 + i * 70,
                width: "64px",
                height: "64px",
                fallbackColor: i === 0 ? '#bb3300' : '#33bb00',
                image: new TextureInfo(64, 64, `minigame/neponet${ability}`),
                onClick: () => {
                    if (!this.userInputLocked && this.appsAllowance > 0) {
                        this.selectedAbility = this.selectedAbility === ability ? null : ability as 'share' | 'advertise';
                    }
                },
                grayscale: this.appsAllowance <= 0
            }));
            //If this is the selected ability, put an overlay over that button with a translucent blue color
            if (this.selectedAbility === ability) {
                abilityBar.addChild(new Drawable({
                    x: -5,
                    y: 85 + i * 70,
                    width: "74px",
                    height: "74px",
                    fallbackColor: '#0055ff88',
                }));
            }
        });
    }

    private drawCloseButton(parent: Drawable): void {
        parent.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(64, 64, "ui/x"),
            onClick: () => this.uiManager.hideRenderOnlyWindow()
        }));
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public async preloadImages(): Promise<void> {
        if (this.preloaded) return;
        const urls = {
            "minigame/neponetshare": "assets/minigame/neponetshare.png",
            "minigame/neponetadvertise": "assets/minigame/neponetadvertise.png",
            "minigame/neponetduration": "assets/minigame/neponetduration.png",
            "minigame/neponetquantity": "assets/minigame/neponetquantity.png",
            "minigame/neponetface0": "assets/minigame/neponetface0.png",
            "minigame/neponetface1": "assets/minigame/neponetface1.png",
            "minigame/neponetface2": "assets/minigame/neponetface2.png",
            "minigame/neponetface3": "assets/minigame/neponetface3.png",
            "minigame/neponetface4": "assets/minigame/neponetface4.png",
            "minigame/neponetface5": "assets/minigame/neponetface5.png",
            "minigame/neponetface6": "assets/minigame/neponetface6.png",
            "minigame/neponetface7": "assets/minigame/neponetface7.png",
            "minigame/neponetface8": "assets/minigame/neponetface8.png",
            "minigame/neponetface9": "assets/minigame/neponetface9.png",
        };
        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}