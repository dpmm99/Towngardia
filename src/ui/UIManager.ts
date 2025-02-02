import { Building } from "../game/Building.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { getBuildingType, Skyscraper } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { Player } from "../game/Player.js";
import { getResourceType, Research } from "../game/ResourceTypes.js";
import { Tech } from "../game/Tech.js";
import { TechManager } from "../game/TechManager.js";
import { Altitect } from "../minigame/Altitect.js";
import { MemoryMixology } from "../minigame/MemoryMixology.js";
import { Monobrynth } from "../minigame/Monobrynth.js";
import { NepotismNetworking } from "../minigame/NepotismNetworking.js";
import { SlotMachine } from "../minigame/SlotMachine.js";
import { Starbox } from "../minigame/Starbox.js";
import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { IRenderer } from "../rendering/IRenderer.js";
import { DEVICE_PIXEL_RATIO, TILE_HEIGHT, TILE_WIDTH, worldToScreenCoordinates } from "../rendering/RenderUtil.js";
import { AchievementsMenu } from "./AchievementsMenu.js";
import { BottomBar } from "./BottomBar.js";
import { BudgetMenu } from "./BudgetMenu.js";
import { BuildTypeBar } from "./BuildTypeBar.js";
import { BuildingInfoMenu } from "./BuildingInfoMenu.js";
import { CitizenDietWindow } from "./CitizenDietWindow.js";
import { BusinessPresenceView, CityView, EducationView, EfficiencyView, FireProtectionView, GreenhouseGasesView, HealthcareView, LandValueView, LuxuryView, NoiseView, OrganizedCrimeView, ParticulatePollutionView, PettyCrimeView, PlacementGridView, PoliceView, ProvisioningView, ResidentialDesirabilityView } from "./CityView.js";
import { ConstructMenu } from "./ConstructMenu.js";
import { ContextMenu } from "./ContextMenu.js";
import { Drawable } from "./Drawable.js";
import { FriendGiftWindow } from "./FriendGiftWindow.js";
import { FriendVisitWindow } from "./FriendVisitWindow.js";
import { FriendsMenu } from "./FriendsMenu.js";
import { HappinessFactorsWindow } from "./HappinessFactorsWindow.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { MainMenu } from "./MainMenu.js";
import { MilestonesMenu } from "./MilestonesMenu.js";
import { NotificationsMenu } from "./NotificationsMenu.js";
import { ResourcesBar } from "./ResourcesBar.js";
import { RightBar } from "./RightBar.js";
import { TechTreeMenu } from "./TechTreeMenu.js";
import { TopBar } from "./TopBar.js";
import { TutorialOverlay } from "./TutorialOverlay.js";
import { ViewsBar } from "./ViewsBar.js";
import { WarningWindow } from "./WarningWindow.js";

export class UIManager {
    //Elements - all with ! because they're set in the constructor, but by calling another function that the TypeScript compiler doesn't look into
    private warningWindow!: WarningWindow;
    private bottomBar!: BottomBar;
    private buildTypeBar!: BuildTypeBar;
    private topBar!: TopBar;
    private rightBar!: RightBar;
    private resourcesBar!: ResourcesBar;
    private viewsBar!: ViewsBar;
    private constructMenu!: ConstructMenu;
    private contextMenu!: ContextMenu;
    private mainMenu!: MainMenu;
    private techMenu!: TechTreeMenu;
    private milestonesMenu!: MilestonesMenu;
    private budgetMenu!: BudgetMenu;
    private citizenDietWindow!: CitizenDietWindow;
    private achievementsMenu!: AchievementsMenu;
    private notificationsMenu!: NotificationsMenu;
    private buildingInfoMenu!: BuildingInfoMenu;
    private happinessFactorsWindow!: HappinessFactorsWindow;
    private friendsMenu!: FriendsMenu;
    private friendVisitWindow!: FriendVisitWindow;
    private friendGiftWindow!: FriendGiftWindow;
    private tutorialOverlay!: TutorialOverlay;
    public cityView!: CityView; //Set in switchRenderer, called by the constructor, but TypeScript compiler doesn't know that //TODO: Make a getter for ViewsBar, keep it public, or make the text and legend its own bar?
    private worldCoordinateDrawables: IHasDrawable[] = [];
    private windows: IHasDrawable[] = [];
    private renderOnlyWindow: IHasDrawable | null = null;
    private memoryMixology!: MemoryMixology;
    private slots!: SlotMachine;
    private starbox!: Starbox;
    private monobrynth!: Monobrynth;
    private neponet!: NepotismNetworking;
    private altitect!: Altitect;

    private city!: City; //Set in switchRenderer, called by the constructor, but TypeScript compiler doesn't know that
    public renderer!: IRenderer;
    private scale: number = 2; //Start zoomed in
    private offsetX: number = 0;
    private offsetY: number = 0;
    private isDragging: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;
    private initialX: number = 0;
    private initialY: number = 0;
    private lastTouchDistance: number = 0;
    private isConstructionMode: boolean = false;

    public frameRequested: boolean = false;
    private readonly DRAG_THRESHOLD: number = 25; //In square pixels
    private touchStartTime: number = 0;
    drawFPS: boolean = false;
    draggingElem: Drawable | null = null;
    contextMenuTimeout: NodeJS.Timeout | null = null;
    skipTouchEndClick: boolean = false;
    multitouched: boolean = false; //Ignore everything else once a multitouch starts.
    private eventListenersAddedTo: Set<HTMLCanvasElement> = new Set();

    //Friends dialog
    private dialog: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private searchButton: HTMLButtonElement | null = null;
    private searchResults: HTMLElement | null = null;
    private closeButton: HTMLButtonElement | null = null;

    constructor(public readonly game: GameState) {
        this.switchCity(game.city!, game.player!);

        //Friends dialog
        this.dialog = document.getElementById('addFriendDialog');
        this.searchInput = document.getElementById('friendSearchInput') as HTMLInputElement;
        this.searchButton = document.getElementById('searchButton') as HTMLButtonElement;
        this.searchResults = document.getElementById('searchResults');
        this.closeButton = document.getElementById('closeDialog') as HTMLButtonElement;
        this.searchButton?.addEventListener('click', () => this.searchFriend());
        this.closeButton?.addEventListener('click', () => this.hideAddFriendDialog());
        this.searchInput?.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                this.searchFriend();
            }
        });
    }

    //Must be called before the UIManager will do anything
    switchRenderer(newRenderer: IRenderer): void {
        this.renderer = newRenderer;
        this.renderer.setVisibilityMode(this.city.fadeBuildings);

        this.renderer.clearWindowsAndWorldCoordinateDrawables();
        if (this.renderOnlyWindow === null) {
            this.worldCoordinateDrawables.forEach(p => this.renderer.addWorldCoordinateDrawable(p));
            this.windows.forEach(p => this.renderer.addWindow(p));
        } else {
            this.renderer.addWindow(this.renderOnlyWindow);
        }

        if (!this.isMyCity) {
            this.buildTypeBar.expandedCategory = this.buildTypeBar.selectedBuilding = null;
            this.cityView.showCollectibles = this.cityView.showProvisioning = false;
        }

        this.addEventListeners();
        this.requestRedraw();
    }

    async switchCity(newCity: City | string, owner: Player): Promise<void> { //Input may only be a string. Gotta load the full city, which game.switchCity will do.
        await this.game.switchCity(newCity, owner);
        this.city = newCity = this.game.visitingCity || this.game.city!;
        this.cityView = new CityView(newCity, this);
        this.city.uiManager = this; //In case the city needs to trigger dialogs or whatever.
        this.hideRenderOnlyWindow();

        this.windows = [
            this.rightBar = new RightBar(owner, this.isMyCity ? newCity : null, this), //Never given another player's city--only used for showing notifications
            this.resourcesBar = new ResourcesBar(newCity, this),
            this.viewsBar = new ViewsBar(newCity, this),
            this.bottomBar = new BottomBar(newCity, this), //No reason to appear in other players' cities
            this.buildTypeBar = new BuildTypeBar(newCity, this), //No reason to appear in other players' cities
            this.topBar = new TopBar(newCity, this),
            this.happinessFactorsWindow = new HappinessFactorsWindow(newCity),
            this.citizenDietWindow = new CitizenDietWindow(newCity, this),
            this.buildingInfoMenu = new BuildingInfoMenu(newCity, this),
            this.friendVisitWindow = new FriendVisitWindow(),
            this.friendGiftWindow = new FriendGiftWindow(this.game.city!, newCity, this, this.game), //Affects BOTH your city and the other player's
        ];
        this.worldCoordinateDrawables = [
            this.constructMenu = new ConstructMenu(),
            this.contextMenu = new ContextMenu(this, this.game),
        ];

        this.bottomBar.shown = this.isMyCity;

        //Full-screen views
        this.techMenu = new TechTreeMenu(newCity, this);
        this.milestonesMenu = new MilestonesMenu(newCity, this);
        this.friendsMenu = new FriendsMenu(this.game.player!, this);
        this.budgetMenu = new BudgetMenu(newCity, this);
        this.achievementsMenu = new AchievementsMenu(owner, newCity, this);
        this.notificationsMenu = new NotificationsMenu(this.game.player!, this.game.city!, this.game, this); //NEVER changes cities/players

        //Minigames never change cities/players
        this.memoryMixology = new MemoryMixology(this.game.city!, this, this.game);
        this.slots = new SlotMachine(this.game.city!, this, this.game);
        this.starbox = new Starbox(this.game.city!, this, this.game);
        this.monobrynth = new Monobrynth(this.game.city!, this, this.game);
        this.neponet = new NepotismNetworking(this.game.city!, newCity, this, this.game); //Affects BOTH your city and the other player's
        this.altitect = new Altitect(this.game.city!, this, this.game);

        //This overlay has to be instantiated after bottomBar.shown is set, because the tutorial hides the bottom bar.
        this.windows.push(this.tutorialOverlay = new TutorialOverlay(this.game.player!, this.game.city!, this)); //Also NEVER changes cities/players
        this.windows.push(this.mainMenu = new MainMenu(this.game, this)); //Needs to be on top, so I moved it down here below tutorial overlay
        this.windows.push(this.warningWindow = new WarningWindow());

        if (this.renderer) this.switchRenderer(this.renderer);

        //If visiting a friend, possibly grant research points and show the friend visit window
        if (!this.isMyCity) {
            const resource = { type: getResourceType(Research), amount: 2 }; //TODO: How do we want to determine number of points?
            this.game.city!.applyReceiptBonus(resource); //May increase the amount of research points' worth of progress to grant
            const [tech, bonusClaimed] = TechManager.grantFreePoints(this.game.city!, this.game.visitingCity!, resource.amount, Date.now());
            if (tech) await this.techMenu.preloadImages();
            this.showFriendVisitWindow(tech, resource.amount, bonusClaimed); //TODO: also let the player choose to buy specific resources from this city (if this city has sold them recently)
            this.game.city!.updateLastUserActionTime();
            if (bonusClaimed) this.game.fullSave();
            this.frameRequested = true;
        }
    }

    get isMyCity(): boolean {
        return this.game.visitingPlayer === null;
    }

    centerOn(building: Building, retries: number = 0) : void {
        if (!this.renderer) {
            if (retries < 5) setTimeout(() => this.centerOn(building, retries + 1), 50);
            return;
        }
        const { x, y } = worldToScreenCoordinates(this.city, building.x, building.y, building.width, building.height, building.xDrawOffset, true);
        const canvas = this.renderer.getCanvas()!;
        this.offsetX = x - canvas.width / 2 / this.scale;
        this.offsetY = y - canvas.height / 2 / this.scale;
        this.requestRedraw();
    }

    private checkClickComponent(component: IHasDrawable | Drawable, x: number, y: number): boolean {
        const drawable = ('getLastDrawable' in component ? component.getLastDrawable() : component) as Drawable;
        const clicked = drawable?.getClickedDescendant(x, y); //also checks that onClick is set
        if (!clicked) return false;
        clicked.onClick!();
        return true;
    }

    //Single tap = the moment the user's finger hits the screen on mobile, even if they're going to start dragging.
    handleClick(x: number, y: number, wasSingleTap: boolean = false): boolean {
        if (this.renderOnlyWindow) {
            if (wasSingleTap) return false;
            return this.checkClickComponent(this.renderOnlyWindow, x, y);
        }
        if (this.checkClickComponent(this.warningWindow, x, y)) return true;

        if (this.tutorialOverlay.isShown() && !wasSingleTap && this.checkClickComponent(this.tutorialOverlay, x, y)) return true;
        if (this.citizenDietWindow.isShown()) return this.checkClickComponent(this.citizenDietWindow, x, y);

        if (this.friendVisitWindow.isShown() && this.checkClickComponent(this.friendVisitWindow, x, y)) return true;
        this.friendVisitWindow.shown = false;
        if (this.friendGiftWindow.isShown() && this.checkClickComponent(this.friendGiftWindow, x, y)) return true;
        this.friendGiftWindow.hide(); //Hide it if it's open and they didn't click it, unless it rejects the hide attempt because it's actively sending the assist data to the server
        if (this.happinessFactorsWindow.isShown() && this.checkClickComponent(this.happinessFactorsWindow, x, y)) return true;

        //CityViews
        for (const drawable of this.cityView.getLastWindowDrawables()) {
            if (this.checkClickComponent(drawable, x, y)) return true;
        }

        const contextMenuBuildingWas = this.contextMenu.building; //because the very next line closes that menu and resets its building
        if (this.contextMenu.isShown() && !wasSingleTap) this.contextMenu.update(this.city, -1, -1);
        if (this.checkClickComponent(this.buildingInfoMenu, x, y)) return true;
        if (this.buildingInfoMenu.isShown() && !wasSingleTap) this.buildingInfoMenu.show(undefined);
        this.requestRedraw();

        // Delegate click handling to appropriate component--we may want to do some UIManager-level actions based on what was clicked, too
        if (this.mainMenu.shown) {
            if (this.checkClickComponent(this.mainMenu, x, y)) return true;
            //Clicked anywhere outside the main menu buttons, so close the menu and don't click other things.
            this.mainMenu.shown = false;
            return true;
        }

        if (this.checkClickComponent(this.viewsBar, x, y)) return true;
        if (this.checkClickComponent(this.bottomBar, x, y)) {
            if (!this.buildTypeBar.selectedBuilding) this.isConstructionMode = false;
            return true;
        }

        if (this.checkClickComponent(this.buildTypeBar, x, y)) {
            if (this.buildTypeBar.selectedBuilding) {
                this.enterConstructionMode();
            } else this.exitConstructionMode();
            return true;
        }
        if (this.checkClickComponent(this.resourcesBar, x, y)) return true;

        if (this.checkClickComponent(this.topBar, x, y)) return true;

        if (!wasSingleTap && this.checkClickComponent(this.contextMenu, x, y)) { //We may just want to not call handleClick if wasSingleTap is going to be true anyway. I keep adding this check because of things like accidentally removing a building just because you stopped scrolling around the city.
            if (this.contextMenu.copying) {
                this.buildTypeBar.selectedBuilding = contextMenuBuildingWas!.clone(); //Need a copy or else it'd let you place it on top of the one you copied
                this.enterConstructionMode();
                this.contextMenu.copying = false;
            } else if (this.contextMenu.moving) {
                //Don't remove the building right away, but keep it in a "moving" state until the player clicks again to place it as if they had built it
                this.buildTypeBar.selectedBuilding = contextMenuBuildingWas;
                this.enterConstructionMode();
            } else if (this.contextMenu.demolishing || this.contextMenu.switchingRecipe || this.contextMenu.collecting) this.contextMenu.building = contextMenuBuildingWas; //Put it back. :)
            return true;
        }

        const otherComponents = [this.constructMenu, this.rightBar];
        if (otherComponents.find(p => this.checkClickComponent(p, x, y))) return true; //*Something* was clicked and accepts click events

        //Place the building on double tap, or exit construction mode on double tap if it can't be placed. Could be partly moved to the ConstructMenu.
        const worldCoords = this.screenToGridCoordinates(x, y);
        if (!wasSingleTap && this.isConstructionMode) {
            if (!this.constructMenu.placementStarted) {
                this.constructMenu.setStartPosition(worldCoords.x, worldCoords.y);
                this.repositionConstructionOverlay(x, y);
                return true;
            }

            this.constructMenu.update(this.city, this.renderer, this.buildTypeBar.selectedBuilding, worldCoords.x, worldCoords.y, this.contextMenu.moving);
            if (this.constructMenu.checkCanPlace(this.city, this.contextMenu.moving)) {
                this.placeBuilding(worldCoords.x, worldCoords.y);
            } else {
                this.exitConstructionMode();
            }
            return true;
        }

        if (!this.isConstructionMode) {
            //Check for a building with resources to collect, but only look in the grid a ways around the clicked location
            const nearBuildings = [...this.city.getBuildingsInArea(worldCoords.x, worldCoords.y, 9, 9, 0, 0)].filter(p => p.lastCollectibleDrawable || p.lastProvisioningDrawable);
            for (const building of nearBuildings) {
                if (this.checkClickComponent(building, x, y)) return true;
            }
        }

        return false; //Touch end event is allowed to trigger a click.
    }

    showMainMenu() {
        this.mainMenu.shown = true;
        if (this.cityView instanceof ProvisioningView) this.toggleProvisioning(); //Otherwise, it's drawn on top of the main menu.
    }

    async showTechMenu() {
        game.onLoadStart?.();
        await this.techMenu.preloadImages();
        game.onLoadEnd?.();

        this.showFullScreen(this.techMenu);
    }
    hideTechMenu() {
        this.techMenu.hide();
        this.hideRenderOnlyWindow();
    }

    async showMilestonesMenu() {
        game.onLoadStart?.();
        await this.milestonesMenu.preloadImages();
        game.onLoadEnd?.();
        this.showFullScreen(this.milestonesMenu);
    }
    hideMilestonesMenu() {
        this.milestonesMenu.hide();
        this.hideRenderOnlyWindow();
    }

    showFullScreen(menu: IHasDrawable, ...showArgs: any[]) {
        if ('show' in menu && typeof menu.show === 'function') menu.show(...showArgs);
        this.renderOnlyWindow = menu;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    showBudget() {
        this.showFullScreen(this.budgetMenu);
    }
    hideBudget() {
        this.budgetMenu.hide();
        this.hideRenderOnlyWindow();
    }
    showAchievements() {
        this.showFullScreen(this.achievementsMenu, "achievements");
    }
    showTitles() {
        this.showFullScreen(this.achievementsMenu, "titles");
    }
    hideAchievementsMenu() {
        this.achievementsMenu.hide();
        this.hideRenderOnlyWindow();
    }
    showNotifications() {
        this.showFullScreen(this.notificationsMenu);
    }
    hideNotifications() {
        this.notificationsMenu.hide();
        this.hideRenderOnlyWindow();
    }
    showFriendsMenu() {
        this.showFullScreen(this.friendsMenu);
    }
    hideFriendsMenu() {
        this.friendsMenu.hide();
        this.hideRenderOnlyWindow();
    }
    showTutorials() {
        this.tutorialOverlay.showCompletedSteps();
        if (this.cityView instanceof ProvisioningView) this.toggleProvisioning();
    }
    updateTutorialSteps() {
        this.tutorialOverlay.updateTutorialSteps();
    }
    toggleProvisioning() {
        if (!this.isMyCity) {
            this.cityView = new CityView(this.city, this);
            this.bottomBar.shown = this.cityView.showCollectibles = false;
            return;
        }
        this.cityView = this.cityView instanceof ProvisioningView ? new CityView(this.city, this) : new ProvisioningView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = !(this.cityView instanceof ProvisioningView);
        if (this.cityView instanceof ProvisioningView) this.buildTypeBar.expandedCategory = null;
        if (!(this.cityView instanceof ProvisioningView)) this.game.fullSave(); //Save when done provisioning
    }
    toggleResidentialDesirabilityView() {
        this.cityView = this.cityView instanceof ResidentialDesirabilityView ? new CityView(this.city, this) : new ResidentialDesirabilityView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleLandValueView() {
        this.cityView = this.cityView instanceof LandValueView ? new CityView(this.city, this) : new LandValueView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    togglePettyCrimeView() {
        this.cityView = this.cityView instanceof PettyCrimeView ? new CityView(this.city, this) : new PettyCrimeView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleOrganizedCrimeView() {
        this.cityView = this.cityView instanceof OrganizedCrimeView ? new CityView(this.city, this) : new OrganizedCrimeView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleGreenhouseGasesView() {
        this.cityView = this.cityView instanceof GreenhouseGasesView ? new CityView(this.city, this) : new GreenhouseGasesView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleNoiseView() {
        this.cityView = this.cityView instanceof NoiseView ? new CityView(this.city, this) : new NoiseView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleParticulatePollutionView() {
        this.cityView = this.cityView instanceof ParticulatePollutionView ? new CityView(this.city, this) : new ParticulatePollutionView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    togglePoliceView() {
        this.cityView = this.cityView instanceof PoliceView ? new CityView(this.city, this) : new PoliceView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleFireView() {
        this.cityView = this.cityView instanceof FireProtectionView ? new CityView(this.city, this) : new FireProtectionView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleHealthView() {
        this.cityView = this.cityView instanceof HealthcareView ? new CityView(this.city, this) : new HealthcareView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleEducationView() {
        this.cityView = this.cityView instanceof EducationView ? new CityView(this.city, this) : new EducationView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleLuxuryView() {
        this.cityView = this.cityView instanceof LuxuryView ? new CityView(this.city, this) : new LuxuryView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleBusinessPresenceView() {
        this.cityView = this.cityView instanceof BusinessPresenceView ? new CityView(this.city, this) : new BusinessPresenceView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleEfficiencyView() {
        this.cityView = this.cityView instanceof EfficiencyView ? new CityView(this.city, this) : new EfficiencyView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true;
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    togglePlacementGridView() {
        this.cityView = this.cityView instanceof PlacementGridView ? new CityView(this.city, this) : new PlacementGridView(this.city, this);
        this.bottomBar.shown = this.rightBar.shown = true; //TODO: Maybe a placement legend in place of the right bar for this view?
        if (!this.isMyCity) this.cityView.showCollectibles = this.bottomBar.shown = false;
    }
    toggleBuildings() {
        this.cityView.drawBuildings = !this.cityView.drawBuildings;
    }
    toggleBuildingFade() {
        this.city.fadeBuildings = !this.city.fadeBuildings;
        this.renderer.setVisibilityMode(this.city.fadeBuildings);
        if (this.renderer.getVisibilityMode()) this.cityView.drawBuildings = true; //Just to make it a bit less confusing if they click the button--it won't do *nothing* now.
    }

    showBuildingInfo(building: Building): void {
        console.log(building);
        this.buildingInfoMenu.show(building);
    }

    showReopenBusinessDialog(building: Building) {
        this.contextMenu.update(this.city, building.x, building.y);
        this.contextMenu.reopening = true;
    }

    showRepairBuildingDialog(building: Building) {
        this.contextMenu.update(this.city, building.x, building.y);
        this.contextMenu.repairing = true;
    }

    showProvisioningAlert(building: Building) {
        this.contextMenu.update(this.city, building.x, building.y);
        this.contextMenu.provisioningAlert = true;
    }

    showWarning(text: string) {
        this.warningWindow.text = text;
        this.frameRequested = true;
    }

    toggleHappinessFactorsWindow() {
        if (this.happinessFactorsWindow.isShown()) this.happinessFactorsWindow.hide();
        else this.happinessFactorsWindow.show();
    }

    showFriendVisitWindow(tech: Tech | null, techPoints: number, bonusClaimed: boolean) {
        this.friendVisitWindow.show(tech, techPoints, bonusClaimed);
    }

    showFriendGiftWindow() {
        this.friendGiftWindow.show();
    }

    showAddFriendDialog() {
        //A DOM dialog because I don't want to implement a whole text editor
        if (this.dialog) this.dialog.style.display = 'block';
    }
    private hideAddFriendDialog(): void {
        if (this.dialog) {
            this.dialog.style.display = 'none';
        }
    }
    private async searchFriend(): Promise<void> {
        const searchTerm = this.searchInput?.value.trim();
        if (!searchTerm) return;

        try {
            const friends = await this.playerSearch(searchTerm);
            this.displaySearchResults(friends);
        } catch (error) {
            console.error('Error searching for friends:', error);
            this.displaySearchResults([]);
        }
    }
    private async playerSearch(name: string): Promise<Array<{ id: string, name: string }>> {
        name = name.replace(/[^a-z0-9]/gi, "").substring(0, 32); // Remove disallowed characters and limit to max Discord username length
        if (!name) return [];

        const response = await fetch(`api/player-search?name=${encodeURIComponent(name)}`);
        if (!response.ok) {
            throw new Error('Failed to search for players');
        }
        return await response.json();
    }
    private displaySearchResults(friends: Array<{ id: string, name: string }>): void {
        if (!this.searchResults) return;

        this.searchResults.innerHTML = '';
        if (friends.length === 0) {
            this.searchResults.innerHTML = '<p>No players found.</p>';
            return;
        }

        const ul = document.createElement('ul');
        friends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.name;

            if (this.game.player!.friends.find(p => p.id == friend.id)) {
                const checkmarkSpan = document.createElement('span');
                checkmarkSpan.innerHTML = '&#10003;';
                checkmarkSpan.classList.add('checkmark');
                li.appendChild(checkmarkSpan);
            } else {
                const addButton = document.createElement('button');
                addButton.textContent = 'Add';
                addButton.addEventListener('click', () => this.addFriend(friend.id + ""));
                addButton.dataset.friendId = friend.id;
                li.appendChild(addButton);
            }
            ul.appendChild(li);
        });
        this.searchResults.appendChild(ul);
    }
    private async addFriend(friendId: string): Promise<void> {
        try {
            const response = await fetch('api/add-friend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ friendId }),
            });

            if (!response.ok) {
                throw new Error('Failed to add friend');
            }

            const addButton = document.querySelector(`button[data-friend-id="${friendId}"]`);
            if (addButton) {
                const checkmarkSpan = document.createElement('span');
                checkmarkSpan.innerHTML = '&#10003;';
                checkmarkSpan.classList.add('checkmark');
                addButton.parentNode?.replaceChild(checkmarkSpan, addButton);
            }

            await this.game.refreshFriendData(friendId);
        } catch (error) {
            console.error('Error adding friend:', error);
            alert('Failed to add friend. Please try again.');
        }
    }

    async toggleResources() { //Async because it may trigger a save
        if (this.resourcesBar.isShown()) await this.resourcesBar.hide();
        else {
            this.resourcesBar.show();
            if (this.viewsBar.shown) this.toggleViews(); //Don't need to await here because it's *not* going to trigger a save
        }
    }

    showCitizenDietWindow() {
        this.citizenDietWindow.show();
        if (this.cityView instanceof ProvisioningView) this.toggleProvisioning();
    }

    async toggleViews() {
        if (this.cityView instanceof ProvisioningView) this.toggleProvisioning();
        this.cityView = new CityView(this.city, this); //Turn off the special view if there was one; also unhides the buildings.
        this.viewsBar.shown = !this.viewsBar.shown;
        if (this.viewsBar.shown) await this.resourcesBar.hide();
        if (!this.isMyCity) this.cityView.showCollectibles = false;
    }

    //For starting the tutorial. Minimize what the user can see at once initially.
    hideAllBars() {
        this.topBar.shown = false;
        this.rightBar.shown = false;
        this.bottomBar.shown = false;
    }
    showBottomBar() {
        this.bottomBar.shown = true;
    }
    showTopBar() {
        this.topBar.shown = true;
    }
    showRightBar() {
        this.rightBar.shown = true;
    }
    resourcesBarShown() { return this.resourcesBar.isShown(); }
    viewsBarShown() { return this.viewsBar.shown; }
    techMenuShown() { return this.techMenu.isShown(); }
    milestonesMenuShown() { return this.milestonesMenu.isShown(); } //TODO: May want a tutorial step for that
    isProvisioning() { return this.cityView instanceof ProvisioningView; }
    isConstructing() { return this.isConstructionMode; }
    inTutorial() { return this.tutorialOverlay.isShown(); }

    buildTypeBarShown() {
        return this.buildTypeBar.expandedCategory !== null;
    }

    enterFullscreen() {
        this.renderer.getCanvas()?.requestFullscreen().catch((err) => {
            //Fullscreen not available
        });
    }
    
    async showMemoryMixologyMinigame(): Promise<void> {
        game.onLoadStart?.();
        await this.memoryMixology.preloadImages();
        game.onLoadEnd?.();

        this.memoryMixology.show();
        this.renderOnlyWindow = this.memoryMixology;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    async showSlotsMinigame(): Promise<void> {
        game.onLoadStart?.();
        await this.slots.preloadImages();
        game.onLoadEnd?.();

        this.slots.show();
        this.renderOnlyWindow = this.slots;
        this.cityView.drawBuildings = false;
        //Start rendering according to the slots game's needs
        this.switchRenderer(this.renderer);
    }

    async showStarboxMinigame(): Promise<void> {
        game.onLoadStart?.();
        await this.starbox.preloadImages();
        game.onLoadEnd?.();

        this.starbox.show();
        this.renderOnlyWindow = this.starbox;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    async showMonobrynthMinigame(): Promise<void> {
        game.onLoadStart?.();
        await this.monobrynth.preloadImages();
        game.onLoadEnd?.();

        this.monobrynth.show();
        this.renderOnlyWindow = this.monobrynth;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    async showNeponetMinigame(): Promise<void> {
        game.onLoadStart?.();
        await this.neponet.preloadImages();
        game.onLoadEnd?.();

        this.neponet.show();
        this.renderOnlyWindow = this.neponet;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    async showAltitectMinigame(building: Building): Promise<void> {
        game.onLoadStart?.();
        await this.altitect.preloadImages();
        game.onLoadEnd?.();

        this.altitect.show(building);
        this.renderOnlyWindow = this.altitect;
        this.cityView.drawBuildings = false;
        this.switchRenderer(this.renderer);
    }

    hideRenderOnlyWindow() {
        if (this.renderOnlyWindow && 'hide' in this.renderOnlyWindow && typeof this.renderOnlyWindow.hide === 'function') this.renderOnlyWindow.hide();
        this.cityView = new CityView(this.city, this);
        this.renderOnlyWindow = null;
        if (this.renderer) this.switchRenderer(this.renderer); //Reset rendering to draw all the bars and such
    }

    isPlayingMinigame() {
        //Detect if any of the minigames are actively being played--not just shown, but actually playing. In such a case, we don't want to auto-refresh.
        return this.starbox.isPlaying() || this.neponet.isPlaying() || this.memoryMixology.isPlaying() || this.monobrynth.isPlaying() || this.slots.isPlaying() || this.altitect.isPlaying();
    }

    //Because screenToWorldCoordinates doesn't round/truncate
    private screenToGridCoordinates(x: number, y: number): { x: number, y: number } {
        const worldCoords = this.renderer.screenToWorldCoordinates(this.city, x - this.scale * TILE_WIDTH / 2, y + this.scale * TILE_HEIGHT);
        return { x: Math.floor(worldCoords.x), y: Math.floor(worldCoords.y) };
    }

    public getSelectedBuildCategory(): BuildingCategory | null {
        return this.buildTypeBar.expandedCategory;
    }

    public selectBuildCategory(category: BuildingCategory | null, toggle: boolean = false): void {
        this.contextMenu.moving = false; //If you were moving a building, clicking to place another building would remove a building from the city and cause an error, so we need to reset moving=false.
        this.constructMenu.update(this.city, this.renderer, null, 0, 0, false); //Remove the construction overlay

        this.buildTypeBar.expandedCategory = toggle && this.buildTypeBar.expandedCategory === category ? null : category;
        this.buildTypeBar.resetScroll();
        this.buildTypeBar.selectBuildingType(""); //Reset scroll and selection in the other bar
    }

    private enterConstructionMode(): void {
        if (this.contextMenu.moving || this.buildTypeBar.selectedBuilding?.isPlaceable(this.city, false)) {
            this.isConstructionMode = true;
            const canvas = this.renderer.getCanvas();

            const { x, y } = this.screenToGridCoordinates((canvas?.width ?? 0) / 2, (canvas?.height ?? 0) / 2);
            this.constructMenu.update(this.city, this.renderer, this.buildTypeBar.selectedBuilding!, x, y, this.contextMenu.moving);
        } else {
            //TODO: Show a message that the player can't place the building
        }
    }

    private placeBuilding(x: number, y: number): void {
        if (!this.buildTypeBar.selectedBuilding) return;

        //First, check if you're about to build on top of a Skyscraper that has mods. If you are, prompt to confirm if you want to demolish it, because you prooobably don't.
        const placingOn = this.city.getBuildingsInArea(x, y, this.buildTypeBar.selectedBuilding.width, this.buildTypeBar.selectedBuilding.height, 0, 0, false, true);
        if ([...placingOn].some(p => p.type === getBuildingType(Skyscraper) && p.mods.length)) {
            if (!confirm("You're about to build on top of an Altitect-modified Skyscraper. Are you sure you want to do that?")) { //TODO: Replace with a more in-game dialog
                return;
            }
        }

        //Get one from inventory or make a new copy, and subtract building costs at the same time
        //Record the offsets of the ridingAlong buildings relative to the main building before we remove them for-move
        const ridingAlongOffsets = this.contextMenu.moving ? this.contextMenu.ridingAlong.map(p => ({ x: p.x - this.buildTypeBar.selectedBuilding!.x, y: p.y - this.buildTypeBar.selectedBuilding!.y })) : [];
        if (this.contextMenu.moving) { //If we're moving a building, put it in the inventory and then immediately take it back out
            this.contextMenu.ridingAlong.forEach(p => this.city.removeBuilding(p, false, true)); //Do the same for the buildings that were on top of it
            this.city.removeBuilding(this.buildTypeBar.selectedBuilding, false, true);
        }

        const copies = this.constructMenu.getCopies();
        if (!this.contextMenu.moving && !this.city.canAffordBuildings(this.buildTypeBar.selectedBuilding, copies.length)) { //Double-check the cost because things can change by the time the user clicks, e.g., they wanted to place 2+ copies in a row
            //TODO: Show a message that the player can't afford the building
            return;
        }

        copies.forEach(segment => {
            const building = this.city.subtractBuildingCosts(this.buildTypeBar.selectedBuilding!);
            this.city.addBuilding(building, segment.x, segment.y);
        });
        if (this.contextMenu.moving) {
            //Put the built-on-top buildings on top of the moved main building again at the correct relative locations
            for (let x = 0; x < this.contextMenu.ridingAlong.length; x++) {
                const building = this.city.subtractBuildingCosts(this.contextMenu.ridingAlong[x]);
                this.city.addBuilding(building, this.buildTypeBar.selectedBuilding.x + ridingAlongOffsets[x].x, this.buildTypeBar.selectedBuilding.y + ridingAlongOffsets[x].y);
            }
            this.contextMenu.moving = false;
        }

        this.city.updateLastUserActionTime();
        this.exitConstructionMode();
        this.game.fullSave();
    }

    private exitConstructionMode(): void {
        this.isConstructionMode = false;
        this.buildTypeBar.selectedBuilding = null;

        // Remove construction overlay and footprint stamp
        this.constructMenu.update(this.city, this.renderer, this.buildTypeBar.selectedBuilding, 0, 0, false);
    }

    private repositionConstructionOverlay(clientX: number, clientY: number) {
        if (this.isConstructionMode && this.buildTypeBar.selectedBuilding) {
            const { x, y } = this.screenToGridCoordinates(clientX, clientY);
            this.constructMenu.update(this.city, this.renderer, this.buildTypeBar.selectedBuilding, x, y, this.contextMenu.moving);
            this.requestRedraw();
        }
    }

    public collectedResources(building: Building) {
        this.contextMenu.update(this.city, building.x, building.y); //Make sure it doesn't recall its previous state since we're overwriting it
        this.contextMenu.building = building; //Also make sure it has the right building since some can be placed on top of each other
        this.contextMenu.collecting = true; //But we want the context menu to just show the collected resources
        this.contextMenu.collectedResources = building.outputResources.map(p => ({ type: p.type, amount: p.amount }));
    }

    private addEventListeners() {
        const canvas = this.renderer.getCanvas();
        if (!canvas) return; //This will probably not be a valid approach for the HTML renderer
        if (this.eventListenersAddedTo.has(canvas)) return;
        this.eventListenersAddedTo.add(canvas);
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('contextmenu', this.onRightClick.bind(this)); // Handle right-click
        canvas.addEventListener('wheel', this.onWheel.bind(this));
        canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
        canvas.addEventListener('click', (e) => {
            const wasSingleTap = Math.abs(e.clientX * DEVICE_PIXEL_RATIO - this.initialX) >= 10 || Math.abs(e.clientY * DEVICE_PIXEL_RATIO - this.initialY) >= 10;
            if (!wasSingleTap) this.handleClick(e.clientX * DEVICE_PIXEL_RATIO, e.clientY * DEVICE_PIXEL_RATIO, wasSingleTap);
            if (!wasSingleTap && this.tutorialOverlay.isShown()) this.tutorialOverlay.onAction();
            this.requestRedraw();
        });
        addEventListener("resize", this.adjustDragDueToResize.bind(this));
        addEventListener("resize", this.requestRedraw.bind(this));
        addEventListener("keydown", (event: KeyboardEvent) => { this.starbox.onKeyDown(event); }); //Can't use bind because Starbox gets reinstantiated when you switch cities
    }
    
    private requestRedraw() {
        this.renderer.setZoom(this.scale);
        this.renderer.setCameraPosition(this.offsetX, this.offsetY);
        this.frameRequested = true;
    }

    //Always sets isDragging = true and cancels the context menu timer, but may or may not set draggingElem if there's nothing to drag (other than the city view itself).
    private checkDragStart(x: number, y: number): Drawable | null {
        this.isDragging = true;
        if (this.multitouched) return null; //Allow scrolling around the city without fully letting go after zooming, but don't allow any other interaction
        if (this.contextMenuTimeout) clearTimeout(this.contextMenuTimeout);
        if (this.draggingElem) return this.draggingElem;

        if (this.renderOnlyWindow) {
            return this.draggingElem = this.renderOnlyWindow.getLastDrawable()?.getClickedDescendant(x, y, true) || null;
        }

        for (const draggable of this.tutorialOverlay.getLastDraggables()) {
            if (draggable?.checkDrag(x, y)) return this.draggingElem = draggable;
        }

        for (const draggable of this.cityView.getLastWindowDraggables()) {
            this.draggingElem = draggable?.getClickedDescendant(x, y, true);
            if (this.draggingElem?.onDrag) return this.draggingElem;
        }

        //Plug in other draggable (mainly for scrolling) elements here.
        const draggables: IHasDrawable[] = [this.citizenDietWindow, this.happinessFactorsWindow, this.buildingInfoMenu, this.buildTypeBar, this.topBar, this.bottomBar, this.resourcesBar, this.viewsBar, this.rightBar];
        for (const draggable of draggables) {
            this.draggingElem = draggable.getLastDrawable()?.getClickedDescendant(x, y, true) ?? null;
            if (this.draggingElem?.onDrag) return this.draggingElem;
        }

        return this.draggingElem;
    }

    private adjustDragDueToResize() {
        const draggables: IOnResizeEvent[] = [this.citizenDietWindow, this.happinessFactorsWindow, this.buildingInfoMenu, this.buildTypeBar, this.topBar, this.bottomBar, this.resourcesBar, this.viewsBar, this.rightBar, this.tutorialOverlay];
        for (const draggable of draggables) {
            draggable.onResize();
        }
        if (this.renderOnlyWindow && 'onResize' in this.renderOnlyWindow) (this.renderOnlyWindow as IOnResizeEvent).onResize();
    }

    private endDrag() {
        // Start momentum scrolling
        let lastTime = Date.now();
        const startVelocityX = this.dragVelocityX;
        const startVelocityY = this.dragVelocityY;
        const friction = 0.97; // Adjust this value to change how quickly scrolling slows down
        let velocityMultiplier = 1;
        const minVelocity = 0.03; // Minimum velocity before stopping (per millisecond)
        const draggingElem = this.draggingElem;
        const expectedFrameRate = 16; // Roughly 60fps, but we don't KNOW the browser's actual frame rate
        let dragX = this.lastX;
        let dragY = this.lastY;

        const momentumStep = () => {
            const elapsed = Date.now() - lastTime;
            lastTime = Date.now();
            velocityMultiplier *= Math.pow(friction, elapsed / expectedFrameRate);
            const currentVelocityX = startVelocityX * velocityMultiplier;
            const currentVelocityY = startVelocityY * velocityMultiplier;

            if (Math.abs(currentVelocityX) < 2 && Math.abs(currentVelocityY) < 2) { //Extra deceleration when it's going slow, because I didn't like the purely exponential formula--took too long to stop completely.
                velocityMultiplier = Math.max(0, velocityMultiplier - 0.01 * elapsed / expectedFrameRate);
            }

            // Stop if velocity is too low or new touch/click started
            if (Math.abs(currentVelocityX) < minVelocity && Math.abs(currentVelocityY) < minVelocity
                //progress >= 1
                || this.momentumAnimationId === null) { //In a perfect world, the draggingElem.onDragEnd would be called instantly at the beginning of the next touchstart/mousedown call
                this.momentumAnimationId = null;
                if (draggingElem?.onDragEnd) draggingElem.onDragEnd();
                return;
            }

            // Apply momentum movement
            if (!draggingElem) {
                this.offsetX += -(currentVelocityX * expectedFrameRate) / this.scale;
                this.offsetY += -(currentVelocityY * expectedFrameRate) / this.scale;
            } else if (draggingElem.onDrag) {
                dragX += currentVelocityX * expectedFrameRate;
                dragY += currentVelocityY * expectedFrameRate;
                draggingElem.onDrag?.(dragX, dragY); //Have to be positions, not velocities
            }
            this.requestRedraw();
            this.momentumAnimationId = requestAnimationFrame(momentumStep);
        };

        // Only start momentum if there's enough velocity
        if (Math.abs(startVelocityX) > minVelocity * 10 || Math.abs(startVelocityY) > minVelocity * 10) { //Initial velocity has to be much higher than min velocity after momentum scrolling starts.
            this.momentumAnimationId = requestAnimationFrame(momentumStep);
        } else {
            if (this.draggingElem?.onDragEnd) this.draggingElem.onDragEnd();
        }

        this.isDragging = false;
        this.draggingElem = null;
    }

    private onMouseDown(e: MouseEvent) {
        this.initialX = e.clientX * DEVICE_PIXEL_RATIO;
        this.initialY = e.clientY * DEVICE_PIXEL_RATIO;
        this.lastX = this.initialX;
        this.lastY = this.initialY;

        // Cancel any existing momentum animation
        if (this.momentumAnimationId !== null) this.momentumAnimationId = null; //Will be cancelled by the next frame (because it has a local variable that needs onEndDrag to be called at the moment)
    }

    //Stationary long-tap or right-click to open another menu for a building, which contains a 'move' button and a 'store' button...except roads, which should let you store the whole X or Y series.
    private showContextMenu(clientX: number, clientY: number): boolean {
        let clicked = this.buildTypeBar.getLastDrawable()?.getClickedDescendant(clientX, clientY) ?? null;
        if (clicked && clicked.onLongTap) { //Some windows have a long-tap action somewhere in them. Those are required to have long-tap actions as well.
            clicked.onLongTap();
            this.requestRedraw();
            return true;
        }

        if (!this.isConstructionMode) {
            const { x, y } = this.screenToGridCoordinates(clientX, clientY);
            if (x >= 0 && y >= 0 && x < this.city.width && y < this.city.height) {
                this.contextMenu.update(this.city, x, y);
                this.requestRedraw();
            } else if (this.contextMenu.isShown()) {
                this.contextMenu.update(this.city, -1, -1);
                this.requestRedraw();
            }
            return this.contextMenu.isShown();
        }
        return false;
    }
    private onMouseMove(e: MouseEvent) {
        this.repositionConstructionOverlay(e.clientX * DEVICE_PIXEL_RATIO, e.clientY * DEVICE_PIXEL_RATIO);

        if (!this.isDragging && e.buttons) {
            const dx = e.clientX * DEVICE_PIXEL_RATIO - this.initialX;
            const dy = e.clientY * DEVICE_PIXEL_RATIO - this.initialY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > this.DRAG_THRESHOLD) this.checkDragStart(this.initialX, this.initialY);
        }

        if (e.buttons === 0 && this.isDragging) this.endDrag(); //If the mouse button is released outside the window, we should stop dragging
        if (this.isDragging) {
            const dx = e.clientX * DEVICE_PIXEL_RATIO - this.lastX;
            const dy = e.clientY * DEVICE_PIXEL_RATIO - this.lastY;
            this.lastX = e.clientX * DEVICE_PIXEL_RATIO;
            this.lastY = e.clientY * DEVICE_PIXEL_RATIO;
            this.calculateDragVelocity(dx, dy);
            if (!this.draggingElem) {
                this.offsetX += -dx / this.scale; //Inverted dx and dy because dragging the mouse right should move the camera right, not move the world right. This is opposite the behavior of the touch events.
                this.offsetY += -dy / this.scale;
                this.requestRedraw();
            } else if (this.draggingElem.onDrag) {
                this.draggingElem.onDrag(this.lastX, this.lastY);
                this.requestRedraw();
            }
        }
    }

    private onMouseUp(e: MouseEvent) {
        if (this.isDragging) this.endDrag();
    }

    private onRightClick(e: MouseEvent) {
        e.preventDefault(); // Prevent the default context menu from showing
        this.showContextMenu(e.clientX * DEVICE_PIXEL_RATIO, e.clientY * DEVICE_PIXEL_RATIO);
    }

    private onWheel(e: WheelEvent) {
        const zoomFactor = 1 - e.deltaY * 0.001;
        this.zoom(zoomFactor, e.clientX * DEVICE_PIXEL_RATIO, e.clientY * DEVICE_PIXEL_RATIO);

        //Snap to 1x if the user is zooming *toward* 1x but isn't *quite* there. Graphics just look a bit nicer at native resolution.
        if ((this.scale < 1.1 && this.scale > 1 && zoomFactor < 1) || (this.scale > 0.9 && this.scale < 1 && zoomFactor > 1))
            this.zoom(1 / this.scale, e.clientX * DEVICE_PIXEL_RATIO, e.clientY * DEVICE_PIXEL_RATIO);
    }

    private onTouchStart(e: TouchEvent) {
        if (e.touches.length === 1) {
            if (this.multitouched) return;
            this.isDragging = false;
            this.initialX = e.touches[0].clientX * DEVICE_PIXEL_RATIO;
            this.initialY = e.touches[0].clientY * DEVICE_PIXEL_RATIO;
            this.lastX = this.initialX;
            this.lastY = this.initialY;
            this.touchStartTime = Date.now();
            this.contextMenuTimeout = setTimeout(() => {
                if (!this.isDragging) {
                    if (this.showContextMenu(this.lastX, this.lastY) && 'vibrate' in navigator) navigator.vibrate(100);;
                }
            }, 500);
            this.repositionConstructionOverlay(this.lastX, this.lastY);
        } else if (e.touches.length === 2) {
            this.lastTouchDistance = this.getTouchDistance(e.touches);
            this.isDragging = false;
        }
        if (e.touches.length > 1 || (e.touches.length > 0 && e.touches[0].clientY > 10)) e.preventDefault();

        // Cancel any existing momentum animation
        if (this.momentumAnimationId !== null) this.momentumAnimationId = null; //Will be cancelled by the next frame (because it has a local variable that needs onEndDrag to be called at the moment)

        this.requestRedraw();
    }

    private lastDragTime: number = 0;
    private readonly DRAG_VELOCITY_HISTORY_SIZE = 5; // Keep last 5 velocity samples
    private dragVelocityHistoryX: number[] = [];
    private dragVelocityHistoryY: number[] = [];
    private dragVelocityX: number = 0;
    private dragVelocityY: number = 0;
    private momentumAnimationId: number | null = null;

    private calculateDragVelocity(dx: number, dy: number) {
        const timeElapsed = Date.now() - this.lastDragTime;
        this.lastDragTime = Date.now();
        if (timeElapsed > 0 && timeElapsed < 500) { // Calculate velocity in pixels per millisecond
            const currentVelocityX = dx / timeElapsed;
            const currentVelocityY = dy / timeElapsed;

            // Add to history, maintain fixed size
            this.dragVelocityHistoryX.push(currentVelocityX);
            this.dragVelocityHistoryY.push(currentVelocityY);
            if (this.dragVelocityHistoryX.length > this.DRAG_VELOCITY_HISTORY_SIZE) {
                this.dragVelocityHistoryX.shift();
                this.dragVelocityHistoryY.shift();
            }

            // Calculate weighted average favoring more recent samples--I do this to deal with the unstable positions caused by lifting a finger off of a touchscreen
            let totalWeight = 0;
            let sumX = 0;
            let sumY = 0;
            for (let i = 0; i < this.dragVelocityHistoryX.length; i++) {
                const weight = i + 1; // More recent samples get higher weight
                totalWeight += weight;
                sumX += this.dragVelocityHistoryX[i] * weight;
                sumY += this.dragVelocityHistoryY[i] * weight;
            }

            this.dragVelocityX = sumX / totalWeight;
            this.dragVelocityY = sumY / totalWeight;
        } else this.dragVelocityX = this.dragVelocityY = this.dragVelocityHistoryX.length = this.dragVelocityHistoryY.length = 0;
    }

    private onTouchMove(e: TouchEvent) {
        if (e.touches.length === 1) {
            if (!this.isDragging) {
                const dx = e.touches[0].clientX * DEVICE_PIXEL_RATIO - this.initialX;
                const dy = e.touches[0].clientY * DEVICE_PIXEL_RATIO - this.initialY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > this.DRAG_THRESHOLD) this.checkDragStart(this.initialX, this.initialY);
            }

            if (this.isDragging) {
                const dx = e.touches[0].clientX * DEVICE_PIXEL_RATIO - this.lastX;
                const dy = e.touches[0].clientY * DEVICE_PIXEL_RATIO - this.lastY;
                this.lastX = e.touches[0].clientX * DEVICE_PIXEL_RATIO;
                this.lastY = e.touches[0].clientY * DEVICE_PIXEL_RATIO;
                this.calculateDragVelocity(dx, dy);

                if (!this.draggingElem) {
                    this.offsetX += -dx / this.scale;
                    this.offsetY += -dy / this.scale;
                    this.requestRedraw();
                } else if (this.draggingElem.onDrag) {
                    this.draggingElem.onDrag(this.lastX, this.lastY);
                    this.requestRedraw();
                }
            }

            this.repositionConstructionOverlay(this.lastX, this.lastY);
        } else if (e.touches.length === 2) {
            if (this.isDragging) this.endDrag();
            const touchDistance = this.getTouchDistance(e.touches);
            const zoomFactor = touchDistance / this.lastTouchDistance;
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            this.zoom(zoomFactor, centerX * DEVICE_PIXEL_RATIO, centerY * DEVICE_PIXEL_RATIO);
            this.lastTouchDistance = touchDistance;
            this.multitouched = true;
            if (this.contextMenuTimeout) clearTimeout(this.contextMenuTimeout);
        }
        //Disable browser scroll and zoom
        if (e.touches.length > 1 || (e.touches.length > 0 && e.touches[0].clientY > 10)) e.preventDefault();
    }

    private onTouchEnd(e: TouchEvent) {
        if (e.touches.length === 0) {
            this.multitouched = false;
            if (!this.isDragging) {
                const timeElapsed = Date.now() - this.touchStartTime;
                if (timeElapsed <= 500) { //Skip if the context menu was triggered
                    if (this.contextMenuTimeout) clearTimeout(this.contextMenuTimeout);
                    //Consider it a double-tap click if the tap had nearly no movement (weird, but I named things badly)
                    if (!this.skipTouchEndClick) {
                        const wasDoubleTap = Math.abs(this.lastX - this.initialX) < 20 && Math.abs(this.lastY - this.initialY) < 20;
                        this.handleClick(this.lastX, this.lastY, !wasDoubleTap);
                        if (wasDoubleTap && this.tutorialOverlay.isShown()) this.tutorialOverlay.onAction();
                    }
                    this.skipTouchEndClick = false;
                }
            }
            else this.endDrag();
            this.requestRedraw();

            if (this.scale < 1.08 && this.scale > 0.92) this.zoom(1 / this.scale, this.lastX * DEVICE_PIXEL_RATIO, this.lastX * DEVICE_PIXEL_RATIO); //Snap to native resolution when near it
        } else if (e.touches.length === 1) {
            this.lastX = e.touches[0].clientX * DEVICE_PIXEL_RATIO; //Continue scrolling smoothly after zooming, rather than jumping suddenly
            this.lastY = e.touches[0].clientY * DEVICE_PIXEL_RATIO;
        }
    }

    private getTouchDistance(touches: TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private zoom(factor: number, centerX: number, centerY: number) {
        const canvas = this.renderer.getCanvas();
        if (!canvas) return;
        const oldScale = this.scale;
        this.scale = Math.max(0.2, Math.min(this.scale * factor, 3)); // Limit zoom levels

        //Ensure the point under the cursor stays under the cursor after zooming. So the initial formula is "world units cursor coord before = world units cursor coord after."
        //world units cursor coord before = (centerX / oldScale + this.offsetX)
        //world units cursor coord after = (centerX / newScale + updated offsetX)
        //centerX / oldScale + this.offsetX = centerX / newScale + updated offsetX, and solving for "updated offsetX" just requires subtracting centerX / newScale from both sides
        this.offsetX = centerX / oldScale + this.offsetX - centerX / this.scale;
        this.offsetY = centerY / oldScale + this.offsetY - centerY / this.scale;

        this.requestRedraw();
    }

    draw() {
        this.renderer.drawCity(this.cityView, this.city);
    }

    async renderCityToNewCanvas(): Promise<HTMLCanvasElement | undefined> {
        if (!(this.renderer instanceof CanvasRenderer)) return; //Not supported.

        // Create temporary canvas sized to fit the city
        const border = 5; //Some extra pixels on all sides for buildings that stick out and some inexactness
        const extraPixelsAtTop = 190; //Some extra pixels in case there are tall buildings in the top row.
        const canvas = document.createElement('canvas');
        canvas.width = this.city.width * TILE_WIDTH + border * 2;
        canvas.height = this.city.height * TILE_HEIGHT + extraPixelsAtTop + border * 2;

        // Create partial clone of renderer
        const tempRenderer = await (this.renderer as CanvasRenderer).cloneForSnapshot(canvas);

        // Position camera to fit the entire city in the canvas
        tempRenderer.setCameraPosition(TILE_WIDTH / 2 - border, -border - extraPixelsAtTop - TILE_HEIGHT);
        tempRenderer.setZoom(1);

        // Create default view and render
        const view = new CityView(this.city, this);
        tempRenderer.drawCity(view, this.city, true);

        return canvas;
    }

    async saveCityImage(format: 'png' | 'webp') {
        const canvas = await this.renderCityToNewCanvas();
        if (!canvas) return;

        //Save the canvas as a file immediately
        const dataURL = canvas.toDataURL('image/' + format, 1);
        const a = document.createElement('a');
        a.href = dataURL;
        const cityName = this.city.name.replace(/[^a-z0-9_()]/gi, '_');
        a.download = cityName + '_' + new Date().toISOString().replace(/:/g, '-') + '.' + format;
        a.click();
    }
}
