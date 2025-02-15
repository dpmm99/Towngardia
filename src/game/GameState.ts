import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { FilteredImageCache } from "../rendering/FilteredImageCache.js";
import { HTMLRenderer } from "../rendering/HTMLRenderer.js";
import { IRenderer } from "../rendering/IRenderer.js";
import { WebGLRenderer } from "../rendering/WebGLRenderer.js";
import { IStorage } from "../storage/IStorage.js";
import { UIManager } from "../ui/UIManager.js";
import { AchievementTypes } from "./AchievementTypes.js";
import { Assist } from "./Assist.js";
import { Building } from "./Building.js";
import { BUILDING_TYPES, BigBoulder, GeothermalVent, MediumBoulder, OilSeep, Road, SmallBoulder } from "./BuildingTypes.js";
import { City } from "./City.js";
import { Effect } from "./Effect.js";
import { LONG_TICK_TIME, SHORT_TICK_TIME } from "./FundamentalConstants.js";
import { EffectType } from "./GridType.js";
import { Notification } from "./Notification.js";
import { Player } from "./Player.js";
import * as ResourceTypes from "./ResourceTypes.js";
import { HeatPumps } from "./TechTypes.js";

export class GameState {
    player: Player | null = null; //ALWAYS the player...after initial load.
    city: City | null = null; //ALWAYS one of this player's own cities.
    visitingCity: City | null = null; //NEVER one of this player's own cities.
    visitingPlayer: Player | null = null; //Not used yet
    public renderer: IRenderer | null = null;
    private buildingTypes: Building[] = [...BUILDING_TYPES.values()];
    saveWhenHiding: boolean = true;
    loading: boolean = false;
    saving: boolean = false;
    isGMing: boolean = false;

    constructor(
        public storage: IStorage,
        private canvas?: HTMLCanvasElement,
        public uiManager?: UIManager,
        public onLoadStart?: () => void,
        public onLoadEnd?: () => void
    ) {
    }

    startGMing() { //Note: once you start, you can't stop. You have to reload the game to get out of GM mode.
        this.isGMing = true;
        this.city = this.visitingCity;
        this.visitingCity = null;
        this.player = this.visitingPlayer;
        this.visitingPlayer = null;
    }

    //Must be called in order for it to start drawing
    async switchRenderer(): Promise<void> {
        if (!this.canvas) throw new Error("No canvas element to render to.");
        if (!this.city) throw new Error("City not yet loaded.");
        this.canvas.height = this.canvas.clientHeight; //Need the dimensions set up-front or I can't call uiManager.centerOn
        this.canvas.width = this.canvas.clientWidth;

        try {
            if (this.renderer) this.rebuildCanvas();
            this.renderer = this.renderer instanceof CanvasRenderer ? new WebGLRenderer(this.canvas) : new CanvasRenderer(this.canvas, new FilteredImageCache()); //Initially null -> CanvasRenderer--WebGL has way worse performance on bad computers
        } catch (e) {
            try {
                this.rebuildCanvas();
                this.renderer = new CanvasRenderer(this.canvas, new FilteredImageCache());
            } catch { //Not properly supported anymore.
                this.renderer = new HTMLRenderer(document.getElementById('game-container') as HTMLDivElement);
            }
        }

        this.onLoadStart?.();
        await this.renderer.preloadSprites(this.city);
        this.onLoadEnd?.();

        this.uiManager?.switchRenderer(this.renderer);
        this.uiManager?.centerOn(this.city.buildings.findLast(p => p.owned || this.city?.networkRoot === p)!);
        this.renderer.latePreloadSprites();
    }

    //Call from the UIManager's switchCity method if running in a UI.
    async switchCity(toCity: City | string, owner: Player): Promise<void> {
        if (!this.city) throw new Error("City not yet loaded.");

        if (!(toCity instanceof City)) {
            const cityID = toCity.toString();
            this.onLoadStart?.();
            this.loading = true;
            try {
                console.log("Loading in switchCity");
                toCity = (await this.storage.loadCity(owner, cityID))!;
            } catch (err) {
                console.error('Failed to load city:', err);
                if (err?.toString().includes("SyntaxError")) {
                    if (confirm("Your session expired or the server is down. Open the login page in another tab?")) window.open("index.html"); //Need to log back in
                    else throw err; //Prevent the UIManager from switching cities.
                }
                return;
            }
            this.loading = false; //DO NOT reset if it failed to load, because that means we probably don't want to save.
            this.onLoadEnd?.();

            //Put it in the player's city list. Add or replace.
            const existingIndex = owner.cities.findIndex(p => p.id === cityID);
            if (existingIndex !== -1) owner.cities[existingIndex] = toCity; else owner.addCity(toCity);
        }
        if (owner?.id == this.player?.id) {
            //Switching to one of my own other cities.
            this.city = toCity;
            this.city.game = this; //Enables city to call back to this object for things like saving
            this.visitingCity = null;
            this.visitingPlayer = null;
        } else {
            this.visitingCity = toCity;
            this.visitingPlayer = owner;
        }
    }

    async refreshFriendData(newFriendId: string): Promise<void> {
        try {
            const me = await this.storage.getPlayerAndFriends("default");
            const newFriendData = me?.friends.find(p => p.id == newFriendId); //Don't want to overwrite the city data we already have loaded, so just add this new friend
            if (newFriendData) {
                this.player!.friends.push(new Player(
                    newFriendData.id,
                    newFriendData.name,
                    newFriendData.cities,
                    newFriendData.notifications,
                    newFriendData.achievements,
                    undefined,
                    newFriendData.finishedTutorial,
                    newFriendData.avatar
                ));
            } else {
                console.error('Failed to fetch new friend data');
            }
        } catch (error) {
            console.error('Error refreshing friend data:', error);
        }
    }

    async sendAssist(assist: Assist): Promise<void> {
        try {
            await this.storage.sendAssist(assist);
        } catch (err) {
            console.error('Failed to send assist:', err);
            if (err?.toString().includes("SyntaxError")) {
                if (confirm("Your session expired or the server is down. Open the login page in another tab?")) window.open("index.html"); //Need to log back in
            }
            throw err;
        }
    }

    rebuildCanvas() {
        if (!this.canvas) throw new Error("No canvas element to render to.");

        //Have to rebuild the canvas because it won't allow a second call to getContext
        var newCvs = this.canvas.cloneNode(false) as HTMLCanvasElement;
        this.canvas.parentNode!.replaceChild(newCvs, this.canvas);
        this.canvas = newCvs;
    }

    async initialize(): Promise<void> {
        this.player = (await this.storage.getPlayerAndFriends("default")) || new Player("", "You"); //Player SHOULD already exist at this point. They were created upon login.
        //When player records are created in the DB, they don't have all the achievement types entered, so add those.
        for (const achievement of Object.values(AchievementTypes)) {
            if (!this.player.achievements.find(p => p.id === achievement.id)) this.player.achievements.push(achievement.clone());
        }

        const cityID = this.player.cities.length ? this.player.cities[this.player.cities.length - 1].id : "";
        //const testCity = new City(this.player, cityID, "Test City", 50, 50, this.buildingTypes);
        //this.player.addCity(testCity);
        //await this.generateTestCity(testCity);

        //Player does not necessarily have any cities to start off. Create one if so. Otherwise, load their first city.
        this.onLoadStart?.();
        this.loading = true;
        console.log("Loading in initialize");
        this.city = await this.storage.loadCity(this.player, cityID);
        if (this.city && !this.city.id) this.city.id = cityID;
        if (!this.city) {
            this.city = new City(this.player, "", "Towngardia", 50, 50, this.buildingTypes);
            this.city.startNew();
        }
        this.city.game = this; //Enables city to call back to this object for things like saving
        const cityIndex = this.player.cities.findIndex(c => c.id == this.city!.id); //ID might be numeric when deserialized from the server.
        if (cityIndex >= 0) this.player.cities[cityIndex] = this.city; else this.player.addCity(this.city);
        this.loading = false;
        this.onLoadEnd?.();

        //Has to be done after the city is loaded
        if (!this.uiManager && this.canvas) this.uiManager = new UIManager(this);
    }
    
    private async generateTestCity(city: City) {
        city.startNew();

        city.flunds.amount = 3000;
        city.resources.get(new ResourceTypes.Wood().type)!.capacity = 100;
        city.resources.get(new ResourceTypes.Wood().type)!.amount = 50;
        city.resources.get(new ResourceTypes.Concrete().type)!.capacity = 20;
        city.resources.get(new ResourceTypes.Concrete().type)!.amount = 35;
        city.resources.get(new ResourceTypes.Research().type)!.amount = 400;
        city.resources.get(new ResourceTypes.LabGrownMeat().type)!.capacity = 50;
        city.resources.get(new ResourceTypes.Poultry().type)!.capacity = 80;
        city.resources.get(new ResourceTypes.Legumes().type)!.capacity = 100;
        city.resources.get(new ResourceTypes.Grain().type)!.capacity = 100;
        city.resources.get(new ResourceTypes.LeafyGreens().type)!.capacity = 80;
        city.resources.get(new ResourceTypes.Dairy().type)!.capacity = 40;
        city.resources.get(new ResourceTypes.RedMeat().type)!.capacity = 50;
        city.resources.get(new ResourceTypes.Berries().type)!.capacity = 100;
        city.resources.get(new ResourceTypes.Apples().type)!.capacity = 60;
        city.resources.get(new ResourceTypes.RootVegetables().type)!.capacity = 40;
        city.resources.get(new ResourceTypes.Wood().type)!.capacity = 20;
        city.resources.get(new ResourceTypes.Iron().type)!.capacity = 20;
        city.resources.get(new ResourceTypes.Sand().type)!.capacity = 20;
        city.resources.get(new ResourceTypes.Clay().type)!.capacity = 20;
        city.resources.get(new ResourceTypes.Bricks().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Steel().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Concrete().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Copper().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Glass().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Coal().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.Fish().type)!.capacity = 10;
        city.resources.get(new ResourceTypes.PlantBasedDairy().type)!.capacity = 10;
        city.spreadEffect(new Effect(EffectType.LandValue, 0.5), 5, 5, true, 0, 0);
        for (let x = 0; x < 8; x++) { //Just a few splotches of randomly higher land value
            city.spreadEffect(new Effect(EffectType.LandValue, Math.random()), Math.floor(Math.random() * 5 + 2), Math.floor(Math.random() * 5 + 2), true, Math.floor(Math.random() * city.width), Math.floor(Math.random() * city.height));
        }
        //A little bit of road
        city.addBuilding(new Road().clone(), 0, 3);
        city.addBuilding(new Road().clone(), 1, 3);
        city.addBuilding(new Road().clone(), 2, 3);
        city.addBuilding(new Road().clone(), 3, 3);
        city.addBuilding(new Road().clone(), 4, 3);
        city.addBuilding(new Road().clone(), 4, 2);
        //Test notifications
        city.notifications.push(new Notification("City Test Title", "City test body but it's a wall of text this time, quite long and exciting and full of letters and spaces and words and just about no punctuation, but hey, whatcha gonna do when they come for you? Bad boys, bad boys...", undefined, [], new Date("2036-01-01")));
        city.notifications.push(new Notification("City Test Title 2", "City test body 2", undefined, [], new Date("2024-09-08")));

        const adjustedBuildingTypes = [...this.buildingTypes.filter(p => !p.isResidence && p.canStowInInventory), new Road(), new Road(), new Road(), new SmallBoulder(), new MediumBoulder(), new BigBoulder(), new GeothermalVent(), new OilSeep()]; //Make roads a higher probability
        for (let x = 0; x < city.width; x++) {
            for (let y = 0; y < city.height; y++) {
                if (x < 12 && y < 12) continue; //Leave my top-left corner alone so the City Hall and network root can be placed there and there's room for some other stuff
                if (Math.random() < 0.7) { // 70% chance to place a building
                    const type = adjustedBuildingTypes[Math.floor(Math.random() * adjustedBuildingTypes.length)];
                    if (type.canPlace(city, x, y)) city.addBuilding(type.clone(), x, y);
                }
            }
        }
    }

    private async generateTestFriend() {
        const testFriend = new Player("testplayer2", "Test Player 2");
        this.player!.friends.push(testFriend);
        testFriend.addCity(new City(testFriend, "2", "Test City 2", 20, 20, this.buildingTypes));
        await this.generateTestCity(testFriend.cities[0]);
        testFriend.cities[0].techManager.techs.get(new HeatPumps().id)!.researched = true;
    }

    public async fullSave() {
        if (!this.city) throw new Error("City not yet loaded.");
        if (this.loading) throw new Error("City load is still in progress or failed.");
        if (this.saving) { //Still saving from the previous time--we don't want data inconsistencies between the player and city, so delay the save a bit.
            setTimeout(() => this.fullSave(), 1000);
            return;
        }
        this.saving = true;
        try {
            console.log("Saving fully."); //Removed stack trace because it was making it hard to debug other things. :)
            const playerActionTimeWhenSaveStarted = this.player!.lastUserActionTimestamp; //because it's async; user could keep doing stuff
            await this.storage.updatePlayer(this.player!.id, this.player!);
            this.player!.lastSavedUserActionTimestamp = playerActionTimeWhenSaveStarted;
            const cityActionTimeWhenSaveStarted = this.city.lastUserActionTimestamp;
            await this.storage.saveCity(this.player!.id, this.city);
            this.city.lastSavedUserActionTimestamp = cityActionTimeWhenSaveStarted;
        } catch (err) { //TODO: Break up the error into at least 3 parts: 1. session expired, 2. mandatory client version update, 3. unexpected server error
            if (err?.toString().includes("Tried to save outdated version")) {
                //this.uiManager?.showWarning("Reloaded your city because it was older than what was on the server. Tap this message to hide it.");
                //Refresh the whole page instead of switching to the same city because the PLAYER data would also be outdated (due to non-city-specific things, namely achievements).
                //Plus the server may have been updated, too.
                this.loading = true; //Make sure it doesn't try to resave while refreshing
                window.location.reload();
                return;
            }
            else if (err?.toString().includes("SyntaxError")) {
                if (confirm("Your session expired or the server is down. Open the login page in another tab?")) window.open("index.html"); //Need to log back in
            }
            this.uiManager?.showWarning("Save failed. Open a new tab to log in again, then save via the menu. Tap this message to hide it.");
        } finally { this.saving = false; }
    }

    private shortTick(untilTime: number) {
        if (!this.city) throw new Error("City not yet loaded.");
        let ticked = false;
        while (untilTime - this.city.lastShortTick >= SHORT_TICK_TIME) {
            this.city.lastShortTick += SHORT_TICK_TIME;
            this.city.onShortTick();
            ticked = true;
            if (this.uiManager) this.uiManager.frameRequested = true;
        }
        return ticked;
    }

    tick(): boolean {
        if (!this.city) throw new Error("City not yet loaded.");
        const now = Date.now();
        if (this.isGMing) return false; //Don't advance time when GMing someone else's city
        if (this.city.timeFreeze) {
            this.city.lastShortTick = this.city.lastLongTick = now;
            return false;
        }

        let longTickCount = 0;
        while (now - this.city.lastLongTick >= LONG_TICK_TIME && longTickCount < 4) {
            this.city.lastLongTick += LONG_TICK_TIME;
            longTickCount++;

            // Make sure the exact appropriate number of short ticks occur before the long tick. This ensures building efficiency changes are simulated at the right time.
            this.shortTick(this.city.lastLongTick);

            this.city.onLongTick();
            if (now - this.city.lastLongTick < LONG_TICK_TIME) { //Don't save while fast-forwarding.
                try {
                    this.fullSave();
                } catch (err) {
                    console.error('Failed to save:', err);
                }
            }
            if (this.uiManager) this.uiManager.frameRequested = true;
        }

        // If no more long ticks are needed, do the short ticks up to the current time.
        const moreLongTicksPending = now - this.city.lastLongTick >= LONG_TICK_TIME;
        if (!moreLongTicksPending) {
            if (this.shortTick(now)) {
                try {
                    this.fullSave();
                } catch (err) {
                    console.error('Failed to save:', err);
                }
            }
        }

        // Return true if there are more long ticks to run, false otherwise.
        return moreLongTicksPending;
    }
}
