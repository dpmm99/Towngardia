import { City } from "../game/City.js";
import { UIManager } from "./UIManager.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { Player } from "../game/Player.js";
import { Grain } from "../game/ResourceTypes.js";
import { CementMill, CornerStore, Farm, MountainIronMine, ObstructingGrove, Quadplex, Quarry, Road, SmallHouse, TUTORIAL_COMPLETION_BUILDING_UNLOCKS, TreeFarm, WindTurbine, getBuildingType } from "../game/BuildingTypes.js";
import { BIGGER_MOBILE_RATIO } from "../rendering/RenderUtil.js";
import { TextureInfo } from "./TextureInfo.js";
import { StandardScroller } from "./StandardScroller.js";
import { CityFlags } from "../game/CityFlags.js";
import { HIGH_TECH_UNLOCK_EDU } from "../game/HappinessCalculator.js";

type TutorialStep = {
    title: string;
    charsPerPage: number;
    type: 'button' | 'auto';
    content: Partial<Drawable>;
    nextButton: Partial<Drawable>;
    backdropMods?: Partial<Drawable> | undefined;
    advancementCriteria: () => boolean;
    onStart: () => void;
    onStop: () => void;
};

export class TutorialOverlay implements IHasDrawable {
    private steps: TutorialStep[];
    private lastDrawable: Drawable | null = null;
    private stepStartTime: number = 0;
    private isViewingCompleted: boolean = false;
    private completedViewIndex: number = -1;
    private currentPage: number = 0;
    private leftScroller = new StandardScroller(false, true); //For the "view completed tutorials" view
    private rightScroller = new StandardScroller(true, true); //For the full tutorial text in that view
    private minimized: boolean = false;

    constructor(private player: Player, private city: City, private uiManager: UIManager) {
        this.steps = this.defineTutorialSteps();
        if (!player.finishedTutorial) this.start();
        else if (city.timeFreeze) { //Must be a new city. Needs things unlocked.
            this.start();
            while (this.city.tutorialStepIndex !== -1) this.nextStep(true); //The final step will still save the city and player data.
        }
    }

    private grantCopy<T extends { new(...args: any[]): {} }>(cls: T) {
        const building = this.city.buildingTypes.find(p => p.type === getBuildingType(cls))!;
        //building.locked = false;
        //I was originally doing this: this.city.transferResourcesFrom(building.getCosts(this.city)); //Full cost of the building for free
        //But then I realized the player could soft-lock themselves by building roads! So now I will simply grant them a copy of the building.
        this.city.unplacedBuildings.push(building.clone());
    }

    public updateTutorialSteps() {
        this.steps = this.defineTutorialSteps();
    }

    //TODO: All the steps that affect the UI should be repeated when reloading the city.
    private defineTutorialSteps(): TutorialStep[] {
        // Define your tutorial steps here
        const steps = <TutorialStep[]>[
            {
                title: "Welcome to Towngardia!",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    y: 150,
                    text: "Welcome to your very own Towngardian village, aspiring city planner-mayor-despot! Ready to turn this patch of dirt into a thriving metropolis? No pressure, but the fate of thousands of virtual citizens rests in your hands. Tap anywhere to get started!",
                },
                nextButton: {
                    text: "Let's go!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => {
                    this.uiManager.hideAllBars();
                },
                onStop: () => { },
            },
            {
                title: "Solar Panels: Your Shiny Friends",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    y: 150,
                    text: "See those solar panels behind City Hall? They're not just for show! Houses are power-hungry beasts--and money-hungry if you're importing the juice. Keep them around and connected to the power network (roads and other buildings), or your wallet might start feeling lighter than a feather in a hurricane.",
                },
                nextButton: {
                    text: "Enlightening!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Building Stalking 101",
                charsPerPage: 600,
                backdropMods: {
                    x: 10, y: 10, width: "min(70%, 600px)", height: "600px", biggerOnMobile: true,
                },
                content: {
                    text: "Want to know a building's deepest secrets? Long-tap or right-click it! It's like social media stalking, but for infrastructure. Power producers will even spill the tea on the whole power network! Try it out on the solar panels, if you'd like.",
                },
                nextButton: {
                    text: "I'm nosy!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Show Me The Money!",
                charsPerPage: 300,
                backdropMods: {
                    x: 10, y: 10, width: "min(90%, 1000px)", height: "300px", biggerOnMobile: true,
                },
                content: {
                    text: "See that flunds icon at City Hall? It looks like an 'f', but upside-down and backwards, and it represents Towngardian currency. It's not just pretty bling--tap it to collect your hard-earned cash!",
                },
                nextButton: {
                    text: "Yay flunds!",
                },
                type: "auto",
                advancementCriteria: () => this.city.cityHall.flunds.amount < 1,
                onStart: () => { this.city.frozenAdvanceLongTick(); },
                onStop: () => { },
            },
            {
                title: "For the Hoard",
                charsPerPage: 350, //Narrow!
                backdropMods: {
                    x: 170, y: 70, width: "min(calc(100% - 170px), 1000px)", height: "min(600px, calc(100% - 80px))", scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "There, now you can see your collected flunds in the top bar! As a housewarming present, you've been given some wood--I know you're itching to build with it, but there's more to learn. See that bar that just appeared at the top of your screen? Tap the pile of objects at the left end to peek at your resource stash. Keep it open and tap the below text when you're done looking.",
                },
                nextButton: {
                    text: "I have concrete, too!",
                },
                type: "button",
                advancementCriteria: () => this.uiManager.resourcesBarShown(),
                onStart: () => { this.uiManager.showTopBar(); },
                onStop: () => { this.uiManager.toggleResources(); },
            },
            {
                title: "No Views Barred",
                charsPerPage: 1000,
                backdropMods: {
                    x: 10, y: 70, width: "min(90%, 1000px)", height: "calc(100% - 80px)", scaleYOnMobile: true,
                },
                content: {
                    text: "Now we want to build some roads, but it's hard to see where we want to put them, so let's clear the view first. Tap the magnifying glass in the top bar. Note: If your screen is narrow, you can drag that bar sideways to scroll through it.",
                },
                nextButton: {
                    text: "Eye see!",
                },
                type: "auto",
                advancementCriteria: () => this.uiManager.viewsBarShown(),
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Sights to See",
                charsPerPage: 490,
                backdropMods: {
                    x: 10, y: 170, width: "min(90%, 1000px)", height: "400px", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Now tap the faded house icon at the left. That toggles a mode in which buildings fade out near the bottom of your screen. Drag the screen up and down a bit, and after you've checked out that fancy-schmancy visual, channel your inner lumberjack and bulldoze that pesky grove (long-tap it, then tap the bulldozer). Voila! From obstruction to resource!",
                },
                nextButton: {
                    text: "I saw wood!",
                },
                type: "auto",
                advancementCriteria: () => !this.city.buildings.find(p => p.type === getBuildingType(ObstructingGrove) && p.x === 0 && p.y === 4),
                onStart: () => { },
                onStop: () => { if (this.uiManager.viewsBarShown()) this.uiManager.toggleViews(); },
            },
            {
                title: "Road Tip",
                charsPerPage: 600,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "500px", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Now that we have some room, let's build a little bit more road. Long-tap the road tile by the house and tap the copy button. Alternatively, you can tap the bus stop (representing the Infrastructure category) in the bottom bar, then tap the Road icon that appears above that. You may have to drag the bottom bar sideways to see the category--it's the one after the barn.",
                },
                nextButton: {
                    text: "And then...",
                },
                type: "auto",
                advancementCriteria: () => this.uiManager.isConstructing(),
                onStart: () => {
                    this.city.unlock(getBuildingType(Road)); //If we unlocked it earlier, Build Copy would let the player soft-lock themselves.
                    this.city.buildings.forEach(p => { if (p.isRoad) p.locked = false });
                    this.uiManager.showBottomBar();
                },
                onStop: () => { },
            },
            {
                title: "Road Stretch",
                charsPerPage: 738,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "600px", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Let's build some road! You can drag the screen a bit to see exactly where you're about to build something once you're in construction mode. Tap once next to the road in the free space, and tap again 3~5 tiles away to build at least three more road tiles. Make sure the new road segment connects to the existing road! You can build directly on top of the house if it's in your way (like this text is), too.",
                },
                nextButton: {
                    text: "The road has been stretched!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.filter(p => p.type === getBuildingType(Road) && p.roadConnected && p.owned).length > 4,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "City Hall Shuffle",
                charsPerPage: 500,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(680px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Your City Hall isn't just a pretty face--it's a land value booster! Long-tap it to move it around like it's playing musical chairs. And guess what? Moving buildings is FREE. It's not magic, it's... okay, it might be magic. Move City Hall away from the edge of the map, but still adjacent to a road, to continue. Again, you can drag the screen a bit before tapping to get the placement just right.",
                },
                nextButton: {
                    text: "Abracadabra!",
                },
                type: "auto",
                advancementCriteria: () => this.city.cityHall.roadConnected && (this.city.cityHall.x != 1 || this.city.cityHall.y != 0),
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Producing Product Producers",
                charsPerPage: 372,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(680px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Time to get your hands dirty! Farms are the bread and butter of your city--well, grains, anyway. They'll help keep both your citizens and your coffers full. And hey, they're pretty cheap to build. The bottom bar shows various categories of buildings you can construct. Tap the barn-looking Agriculture category, then tap the Farm icon and place one alongside a road. You can build a bit more road first, if you like! You also probably want to reconnect the solar panels to the power grid (place them adjacent to any building or road). Power imports are expensive.",
                },
                nextButton: {
                    text: "No farm, no food, no fun!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(Farm) && p.roadConnected),
                onStart: () => {
                    this.uiManager.showBottomBar();
                    this.grantCopy(Farm);
                },
                onStop: () => {
                    //Check both placed and unplaced buildings because you get to skip the tutorial after the first time.
                    this.city.buildings.concat(this.city.unplacedBuildings).find(p => p.type === getBuildingType(Farm))!.outputResources[0] = new Grain(0, 3);
                }, //Set the farm to produce 3 grain; it's a random resource by default.
            },
            {
                title: "The Gathering",
                charsPerPage: 295,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(480px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Now tap the food icon on your farm to collect its produce. Note that if you collect resources above your storage capacity (which is currently zero for food), the excess gets auto-sold faster than you can say 'cha-ching!'",
                },
                nextButton: {
                    text: "I can count to 0!",
                },
                type: "auto",
                advancementCriteria: () => (this.city.buildings.find(p => p.type === getBuildingType(Farm))?.outputResources[0].amount ?? 2) < 1,
                onStart: () => { this.city.frozenAdvanceLongTick(); },
                onStop: () => { },
            },
            {
                title: "The Devouring",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    y: 150,
                    text: "Citizens automatically consume food from your hoard like a bunch of apes. As your city grows, your produce will have a greater effect on their happiness and health, but for now, grains are a sufficient diet. You need about 1 unit of food a day per 100 citizens. Your businesses, especially restaurants, will also underperform if they have to import food because you're not producing enough for everyone.",
                },
                nextButton: {
                    text: "Nom nom nom!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Home Sweet...Demolished Home?",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "Psst! Need to free up some space? Demolish a few homes! It's free real estate... dismantling. Don't worry, they'll rebuild faster than you can say 'urban renewal.' You cannot be stopped, buuut it is a bit of a setback. Again, you can also just plop your new buildings directly on top of residences. Tap anywhere to continue.",
                },
                nextButton: {
                    text: "Sorry, not sorry!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "The Infestation",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "Speaking of homes, you don't build those! They're like mushrooms, popping up here and there on their own and having an unpleasant texture. The trick? Make your city more attractive than a puppy in a bowtie. Use the views bar to spy on your city's hotness factors: land value, luxury, safety--all the stuff that makes citizens swoon. And keep the current residents happy, or they might just pack up and move somewhere with more llamas!",
                },
                nextButton: {
                    text: "Home is where THEY make it!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Concrete, The Unsung Hero",
                charsPerPage: 350,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(580px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Roads are cool, but importing the material is like buying designer shoes for your pet rock--expensive and pointless. Build a cement mill and become a concrete tycoon! But remember, factories are like needy pets--they need resources to function. Feed them wisely!",
                },
                nextButton: {
                    text: "Solid tip!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(CementMill) && p.roadConnected),
                onStart: () => { this.grantCopy(CementMill); },
                onStop: () => { },
            },
            {
                title: "Rock On with Quarries",
                charsPerPage: 445,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(680px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Oops! Speaking of resources for your cement mill... Build a quarry and start mining that sweet, sweet stone. It's like buying stone at a perpetual discount--who doesn't love a good deal? After the first 50 stone, it's pure profit, baby! Make sure you connect it to a road, too. Only select buildings in the 'Luxury' category (the statue icon) or the 'Power' category don't require roads.",
                },
                nextButton: {
                    text: "Let's rock and roll!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(Quarry) && p.roadConnected),
                onStart: () => { this.grantCopy(Quarry); },
                onStop: () => { this.city.frozenAdvanceLongTick(); },
            },
            {
                title: "Stone Cold Collection",
                charsPerPage: 500,
                backdropMods: {
                    x: 100, y: 70, width: "min(calc(100% - 110px), 1000px)", height: "calc(100% - 160px)", scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Tap the stone icon on your quarry to collect that stone. Then tap the arrow on the cement mill to enter provisioning mode. In this mode, collectible resources are hidden, and you can feed the buildings that need resources in order to do their jobs. You can also enter this mode by tapping the top-left button in the resources panel, in case you don't want to collect your resources just yet.",
                },
                nextButton: {
                    text: "This is heavy!",
                },
                type: "auto",
                advancementCriteria: () => this.city.resources.get("stone")!.amount > 0 && this.uiManager.isProvisioning(), //I locked the auto-trade sliders during the tutorial so the player can't softlock here.
                onStart: () => { this.city.flunds.amount += 10; }, //Give them just a bit of money so they can provision a few ticks' worth if they want.
                onStop: () => { },
            },
            {
                title: "Concrete Evidence of Progress",
                charsPerPage: 300,
                backdropMods: {
                    x: 10, y: 370, width: "min(calc(100% - 20px), 1000px)", height: "calc(100% - 380px)", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Finally, your cement mill can strut its stuff! Tap the arrow on it to feed it stone like it's a hungry hippo, and watch it churn out concrete. It's not exactly riveting TV, but hey, it's honest work. And remember, concrete is the backbone of your city--use it wisely!",
                },
                nextButton: {
                    text: "Wait--not cement?",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.find(p => p.type === getBuildingType(CementMill))!.inputResources[0].amount >= 1,
                onStart: () => { },
                onStop: () => {
                    if (this.uiManager.resourcesBarShown()) this.uiManager.toggleResources();
                    if (this.uiManager.isProvisioning()) this.uiManager.toggleProvisioning(); //Only have to check because the tutorial is skippable
                    this.city.buildings.concat(this.city.unplacedBuildings).find(p => p.type === getBuildingType(CementMill))!.outputResources[0].amount = 21; //Lots extra for roads
                },
            }, //TODO: Right bar may become visible during the tutorial. Prevent that until we ASK for it.
            {
                title: "Shopping Spree",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "Short on resources? No sweat! Your city's got a freight line, and it's not afraid to use it. As you place buildings, you'll see the REAL cost, including the flunds for any materials you're about to auto-buy from the market. But don't go crazy, because the market restocks slower than a sloth on vacation (5 days to fully restock). It's also not bottomless--the initial limit is a measly 20 for most resources. You can find this data in the auto-trade section of the resources bar. Tap anywhere to continue.",
                },
                nextButton: {
                    text: "Cash: the universal resource!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Resource Juggling Act",
                charsPerPage: 300,
                backdropMods: {
                    x: 180, y: 70, width: "min(calc(100% - 190px), 1000px)", height: "calc(100% - 160px)", scaleYOnMobile: true, scaleXOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Similarly, the city can auto-trade to keep your stockpile in your desired range, e.g., so you can stock up during a temporary price drop. The auto-trade settings are shown by a switch at the top-right of the resources panel. Each bar represents at what fraction of your storage capacity auto-buy (the left handle) and auto-sell (the right handle) should trigger. To change the settings, you can drag those handles like you're DJ-ing your city's future. Tap the following text to continue.",
                },
                nextButton: {
                    text: "Boom, baby!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { if (!this.uiManager.resourcesBarShown()) this.uiManager.toggleResources(); },
                onStop: () => { if (this.uiManager.resourcesBarShown()) this.uiManager.toggleResources(); },
            },
            {
                title: "Budget Balancing for Dummies",
                charsPerPage: 720,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "calc(100% - 160px)", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Oops! Bought too much, and your flunds dipped below zero? Don't panic! It's not bankruptcy, it's... a financial adventure! Yeah! Wait for City Hall to print more money, or get creative: slash budgets, remove service buildings, sell resources, or knock down houses if they aren't worth the power import costs. Remember, unhappy citizens might leave, but hey, that's just fewer mouths to feed, right? It's not like they're your main source of income or anything! Collect revenue from City Hall to continue.",
                },
                nextButton: {
                    text: "Suddenly, I'm a math lover!",
                },
                type: "auto",
                advancementCriteria: () => {
                    if (this.city.cityHall.flunds.amount < 11 && this.city.flunds.amount < 1) this.city.cityHall.flunds.amount = 11; //Auto-fix Eabrace's city
                    return this.city.flunds.amount > 0;
                },
                onStart: () => {
                    this.city.cityHall.flunds.amount += this.city.flunds.amount;
                    this.city.cityHall.flunds.capacity = this.city.cityHall.flunds.amount;
                    this.city.flunds.amount = -10;
                    if (this.city.cityHall.flunds.amount < 15) this.city.cityHall.flunds.amount = 15;
                },
                onStop: () => { },
            },
            {
                title: "Business 101",
                charsPerPage: 332,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "min(590px, calc(100% - 240px))", scaleYOnMobile: true,
                },
                content: {
                    text: "Time to put on your business hat! Businesses are like catnip for apartments, and apartments are money machines. And businesses give citizens a place to fork over more flunds! But remember, Rome wasn't built in a day, and neither was this game. Let's start small: build a modest Corner Store. If you go overboard, you'll end up with derelict businesses that need big flund infusions to reopen. Residences can upgrade from house to apartment to highrise to skyscraper eventually if they are within range of enough businesses. The blue region that appears when placing/moving a business indicates the business's reach.",
                },
                nextButton: {
                    text: "Ka-ching!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.businessPatronCap),
                onStart: () => { this.grantCopy(CornerStore); },
                onStop: () => { },
            },
            {
                title: "Iron, Man!",
                charsPerPage: 760,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    text: "See that mountain? It's not just for show--it's an iron goldmine! With iron, you're one step closer to windmills, and one giant leap towards energy (and other resource) independence! You'll probably need to rearrange your city a bit and build some roads to get to the iron mine. Tap this text to get this metal party started.",
                },
                nextButton: {
                    text: "Fe-nomenal!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "Iron Is Mine!",
                charsPerPage: 160,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "220px", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Build an iron mine on the eastern foothills and connect it to the city roads.",
                },
                nextButton: {
                    text: "I've ironed it out!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(MountainIronMine) && p.roadConnected),
                onStart: () => {
                    this.grantCopy(MountainIronMine);
                    for (let x = 0; x < 10; x++) this.grantCopy(Road); //It's easy to get softlocked if you give them the cash.
                },
                onStop: () => { this.city.frozenAdvanceLongTick(); },
            },
            {
                title: "Gone with the Wind(mill)",
                charsPerPage: 500,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "calc(100% - 300px)", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Windmills: they may bonk some birds, but fossil fuels bonk 19x as many! Collect that iron and build a wind turbine to power about 6 homes. But watch out--you might not be a BIG FAN of their upkeep costs. No power deficit? If you long-tap it, you can pack it up like a fancy picnic basket and save it for later. It's not hoarding if it's useful, right?",
                },
                nextButton: {
                    text: "Facts blowin' me away!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(WindTurbine) && p.powerConnected),
                onStart: () => {
                    this.city.resources.get("iron")!.capacity = 10; //Need some capacity to hold the iron. :)
                    this.city.buildings.concat(this.city.unplacedBuildings).find(p => p.type === getBuildingType(MountainIronMine))!.outputResources[0].amount = 10;
                    this.grantCopy(WindTurbine);
                },
                onStop: () => {
                    this.city.resources.get("iron")!.capacity = 10;
                },
            },
            {
                title: "The Heat is On... Pumps",
                charsPerPage: 600,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 100px), 1000px)", height: "calc(100% - 160px)", scaleYOnMobile: true,
                },
                content: {
                    text: "Want to make your residents love you? Research Heat Pumps! Actually, forget the citizens--your wallet will thank you, since YOU'RE the one footing the electric bill for some reason. Check the deets in the research menu, which you can access via the head/magnifying glass icon in the right side bar.",
                },
                nextButton: {
                    y: 64,
                    text: "Pump it up!",
                },
                type: "auto",
                advancementCriteria: () => this.uiManager.techMenuShown(),
                onStart: () => { this.uiManager.showRightBar(); },
                onStop: () => { },
            },
            {
                title: "Reachin' for Research",
                charsPerPage: 170,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "340px", scaleYOnMobile: true,
                },
                content: {
                    text: "Tap on a tech to view its details. If you can make some progress but not complete it with your current resources and research points, you'll see a 'drop in the bucket' button at the bottom right.",
                },
                nextButton: {
                    y: 0,
                    text: "I've researched about research!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { if (this.uiManager.techMenuShown()) this.uiManager.hideTechMenu(); },
            },
            {
                title: "Pioneergreen",
                charsPerPage: 1000,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "If you're a fan of both the environment and pioneering new technology, take note. If you research a second eco-friendly tech before hitting 1000 population, you'll earn a city title, which comes with a permanent bonus. But if you don't like bonuses, hey, nobody will make you! You can tap the paper scroll in the right bar at any time to see city titles that you have earned or can earn.",
                },
                nextButton: {
                    text: "I'll leaf that for later.",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { if (this.uiManager.resourcesBarShown()) this.uiManager.toggleResources(); }, //make sure it's readable
                onStop: () => { },
            },
            {
                title: "Branching Out",
                charsPerPage: 500,
                backdropMods: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", height: "calc(100% - 290px)", scaleYOnMobile: true, biggerOnMobile: true,
                },
                content: {
                    text: "Speaking of green, I'll help you with one last building! Don't wait for trees to grow--that's so last century. Build a Tree Farm and become the lumber lord you've always dreamed of being. It's like printing money, but greener and with more splinters! And wood isn't worth much money, but you DO need it for construction. As mentioned earlier, you can only import so much in a given time frame.",
                },
                nextButton: {
                    text: "It's taken root!",
                },
                type: "auto",
                advancementCriteria: () => this.city.buildings.some(p => p.type === getBuildingType(TreeFarm) && p.roadConnected),
                onStart: () => { this.grantCopy(TreeFarm); },
                onStop: () => { },
            },
            {
                title: "The Long Game",
                charsPerPage: 805,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "Let's be real for a moment here. Towngardia is designed from the ground up to keep your interest over a long period without encouraging addictive gaming behaviors. Throughout this tutorial, time has advanced as you followed the instructions, but normally, progress happens only four times a day. Resources and flunds trickle in, residences pop up, and ingredients are consumed on that timer, while power updates every five minutes. Buildings generally have 5 days of capacity for ingredients and products. It's like meal prepping, but for an entire city, and it takes five days to start spoiling! ...hmm... Anyway, the same logic applies to your minigame allowance. Enjoy at a casual pace, but don't neglect things too long: the city must grow!",
                },
                nextButton: {
                    text: "Slow and steady!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { },
            },
            {
                title: "End of Starter Tutorial",
                charsPerPage: 805,
                backdropMods: {
                    fallbackColor: '#000000bb',
                },
                content: {
                    x: 10, y: 70, width: "min(calc(100% - 20px), 1000px)", scaleYOnMobile: true,
                    text: "You've graduated from City Planning 101! Remember, Towngardia is a marathon, not a sprint. Unless you're running from an angry mob of taxpayers... Then it's definitely a sprint. Happy building, fellow Towngardian! Check the Tutorials option in the main menu (the gear icon) to review the tutorial and get more tips.",
                },
                nextButton: {
                    text: "I'm ready!",
                },
                type: "button",
                advancementCriteria: () => true,
                onStart: () => { },
                onStop: () => { this.city.timeFreeze = false; },
            },
        ];

        //Extra tutorial steps that won't ever actually appear in the tutorial, only in the Tutorials menu.
        const fieldsNotNeededForExtras = <TutorialStep>{ charsPerPage: 1000, nextButton: {}, type: "button", advancementCriteria: () => true, onStart: () => { }, onStop: () => { } };
        if (this.player.finishedTutorial) {
            //More tips and strategy info that technically applies from the start of the game
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Road Racket",
                content: {
                    text: `Initially, roads are cheap to maintain and produce very little noise and pollution. However, as the first few dozen residents move in, the upkeep cost rises rapidly and then starts to stabilize. Nearby businesses lead to more traffic, which increases the noise and pollution coming from your roads. If you see high noise pollution, you can build public transportation nearby to reduce it, with diminishing returns for each nearby public transportation facility. There are also research options that reduce road noise and pollution throughout the entire city.`,
                }
            });
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Residential Rise",
                content: {
                    text: `The keys to growing your population are happiness, good business coverage, and leaving road-adjacent 2x2 spaces open for apartments, highrises, and skyscrapers to be built. A distinct icon will appear on residences in the Business Presence view if they will eventually upgrade on their own. If there's enough space around a residence without such an icon, then either happiness or business presence is too low. A single tile is only enough room for a Small House (up to ${new SmallHouse().outputResources[0].capacity} residents) or a Quadplex (up to ${new Quadplex().outputResources[0].capacity} residents). Residences will upgrade in-place if there's enough business presence and local residential desirability. Your citizens' happiness and local residential desirability both factor into whether residences will spawn and/or upgrade. You can sell construction resources (${[...this.city.constructionResourceTypes].map(p => this.city.resources.get(p)!.displayName).join(", ")}) for a minor boost to the residence spawn/upgrade chance. For example, selling 50 flunds worth in one day will max out the boost at +5%, and 5% of the sold resources are consumed every tick, or 18.5% a day. In other words, if you have a 5% boost one day, you'll still have at least a 4% boost the next day and only need to sell 9 more flunds' worth at the most to bring the bonus back up to the maximum. Furniture stores ("Sit Happens") offer an even bigger boost if you can keep them running, but each additional furniture store gives a smaller amount of benefit.`,
                }
            });
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Industrial Impact",
                content: {
                    text: `Resources are relatively cheap compared to structures, but the market limits how fast you can obtain and consume them. Thus, industrial buildings are worth having, not because you can sell the resources, but because they enable you to consume resources beyond the market's limits. The costs of services, roads, upkeep, and input resources for factories may be higher than the amount of flunds they produce, so if you're trying to optimize your gameplay, you may stash them when you have plenty of resources in your warehouses. On the other hand, research coupled with economic boom events may make factories directly profitable. Also note that most resource types are only available for purchase once you build storage for them.`,
                }
            });
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Power Optimization",
                content: {
                    text: `Power plants are expensive to run, but even the least cost-effective one is cheaper than importing power from outside the city. Fossil fuels pollute heavily but are cheaper over the long term than your run-of-the-mill wind turbine or solar power plant. Oil, coal, nuclear, and fusion power plants require you to provide resources directly to them, which is risky if you aren't around to manage the city every day, but you can pay a little extra for a fuel truck to keep them going non-stop. Also important to note is that power plants always run at their max capacity, so if you're not using the power, you're throwing away flunds. Because of that, an effective approach is stashing your wind turbines when you build a more efficient facility, then taking them out and placing them again as you begin to run into a power deficit.`,
                }
            });
        }
        if (this.city.flags.has(CityFlags.PoliceProtectionMatters)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Police Protection",
                content: {
                    text: "Citizens demand police coverage even if there's no crime around, and happiness will suffer without it. Crime is broken into two types, petty and organized. Petty crime is more common but does less damage to citizens' happiness--and less damage to your flunds if someone burglarizes City Hall. Organized crime takes more police resources and can lead to a proper (costly!) heist. Police coverage also reduces the number of damaged buildings if the citizens riot due to low total happiness. You can slightly adjust the police budget in the budget menu, but just a 10% budget cut has closer to a 20% impact on the police protection quality. Note: city services only need to cover one tile of a building for the entire building to be considered covered. Also note that low-strength coverage (e.g., a single Police Box at 80% budget) is far better than no coverage.",
                }
            });
        }
        if (this.city.flags.has(CityFlags.FireProtectionMatters)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Fire Protection",
                content: {
                    text: "Buildings are always at risk of burning down, so neither citizens nor your coffers will be happy without complete firefighting service coverage. If a fire breaks out, the building that started it will take the most damage, but it will damage several surrounding buildings as well. Note that industrial and high-tech buildings may not be sufficiently protected by a mere Fire Bay. Fire protection also reduces the amount of damage done if the citizens riot due to low total happiness. Similar to police and other city services, you have some control over the budget, but the impact on services is about twice as big as the reduction in cost.",
                }
            });
        }
        if (this.city.flags.has(CityFlags.UnlockedTourism)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Tourism",
                content: {
                    text: "Tourism is a great way to boost your city's income, unlocked by building an Information Center. Various types of building attract tourists, including some natural formations. Tourists act as patrons in your city's businesses, drawing in flunds via sales tax. Visit a friend's city and play the Nepotism Networking minigame via the right side bar to boost both your and your friend's tourism by a small percentage for up to a few days. You can see all your active tourism boosts by checking the Information Center's info bar. Tourism boosts are multiplicative and gradually decrease until their time limits, so it's more effective to pile them all on at once--if your businesses have the capacity!",
                },
            });
        }
        if (this.city.flags.has(CityFlags.FoodMatters)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Food and Diet",
                content: {
                    text: "As your city grows, citizens require a greater and greater variety of food to keep them happy and healthy. Tap the pie icon in the right-side bar to view the Citizen Diet window, which shows if your food is enough to feed everyone (Sufficiency), how much it affects their happiness (Gratification), and how much it affects their health (Healthiness). Insufficient food leads to businesses--especially restaurants--producing less revenue, while your citizens will just order it from outside the city. You can only serve your citizens' diet needs by having the necessary food in your city's storage. Grain is kept in a Silo, while most other food requires Cold Storage. Random seasonal events--Drought and Cold Snap--can affect the growth rate of farmed food, so always keep a little extra in stock.",
                }
            });
        }
        if (this.city.flags.has(CityFlags.EducationMatters)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Education",
                content: {
                    text: "Education is a key factor in your citizens' happiness, but on top of that, the higher the average education level, the more research points the city earns each day. Furthermore, many high-tech buildings require a high-quality education--try to get a fully-funded College covering at least " + (Math.ceil(HIGH_TECH_UNLOCK_EDU * 100) / 100) + "% of your residences, for example, and your construction options will expand immensely.",
                }
            });

        }
        if (this.city.flags.has(CityFlags.HealthcareMatters)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Healthcare",
                content: {
                    text: "Healthcare coverage helps protect citizens from the harmful effects of pollution, but even if the air is clean, they still need it. A healthy diet also improves the quality of healthcare provided by Clinics and Hospitals. Low health also leads to epidemics, which can cause a hefty reduction in population over a short time period.",
                }
            });
        }
        if (this.city.flags.has(CityFlags.GreenhouseGasesMatter)) {
            steps.push({
                ...fieldsNotNeededForExtras,
                title: "Greenhouse Gases",
                content: {
                    text: "Greenhouse gases are a type of pollution produced by Ranches and by burning fossil fuels, such as in power plants, Steel Mills, and Space Launch Sites. Unlike other pollution and crime, greenhouse gases build up slowly over a long time, so make sure you have plenty of plant life and perhaps even Carbon Capture Plants to counteract the buildup. As greenhouse gases accumulate in your city, harmful weather events such as Heatwaves, Droughts, and Cold Snaps become more frequent and longer-lasting.",
                }
            });
        }

        //Not a perfectly accurate solution, but "on PC", let's replace "[Ll]ong-tap" and then "[Tt]ap" with "[Rr]ight-click" and "[Cc]lick".
        if (navigator.maxTouchPoints === 0) {
            steps.filter(p => p.content.text).forEach(p => {
                p.content.text = p.content.text!
                    .replace(/\blong-tapping\b/g, "right-clicking").replace(/\bLong-tapping\b/g, "Right-clicking")
                    .replace(/\blong-tap\b/g, "right-click").replace(/\bLong-tap\b/g, "Right-click")
                    .replace(/\btapping\b/g, "clicking").replace(/\bTapping\b/g, "Clicking")
                    .replace(/\btap\b/g, "click").replace(/\bTap\b/g, "Click");
            });
        }

        return steps;
    }

    public start(): void {
        if (this.city.tutorialStepIndex !== -1) {
            //Actually continuing.
            this.stepStartTime = Date.now();
            this.uiManager.hideAllBars();
            if (this.city.tutorialStepIndex > 3) this.uiManager.showTopBar(); //TODO: better way? onStartUIOnly for each step?
            if (this.city.tutorialStepIndex > 6) this.uiManager.showBottomBar();
            if (this.city.tutorialStepIndex > 25) this.uiManager.showRightBar();
        } else {
            this.city.tutorialStepIndex = 0;
            this.stepStartTime = Date.now();
            this.steps[this.city.tutorialStepIndex].onStart();
        }
    }

    public stop(): void { //NOT to be used for skipping; it doesn't run the onStart, onStop of all the remaining steps, which could affect the game state.
        if (this.city.tutorialStepIndex >= 0) {
            this.steps[this.city.tutorialStepIndex].onStop();

            //Unlock a lot of buildings
            this.city.buildingTypes.filter(p => TUTORIAL_COMPLETION_BUILDING_UNLOCKS.has(p.type)).forEach(p => p.locked = false);
            this.city.tutorialStepIndex = -1;
            this.player.finishedTutorial = true;
            this.uiManager.game.fullSave();
        }
    }

    public nextStep(fastForward: boolean = false): void {
        this.currentPage = 0;
        if (this.city.tutorialStepIndex >= 0 && this.city.tutorialStepIndex < this.steps.length - 1) {
            this.steps[this.city.tutorialStepIndex].onStop();
            this.city.tutorialStepIndex++;
            this.stepStartTime = Date.now();
            this.steps[this.city.tutorialStepIndex].onStart();
            this.minimized = false;
            if (!fastForward) {
                this.uiManager.game.fullSave(); //Make sure the player's progress gets saved each step of the way.
            }
        } else if (this.city.tutorialStepIndex === this.steps.length - 1) {
            this.stop();
        }
    }

    public onAction() {
        if (this.steps[this.city.tutorialStepIndex]?.type === "auto") this.maybeAdvance();
    }

    public maybeAdvance() {
        const currentStep = this.steps[this.city.tutorialStepIndex];
        const timeSinceStart = Date.now() - this.stepStartTime;

        if (timeSinceStart < 2000) return;
        if (!currentStep.advancementCriteria()) return;

        this.nextStep();
    }

    public showCompletedSteps(): void {
        this.isViewingCompleted = true;
        this.completedViewIndex = -1;
    }

    public hideCompletedSteps(): void {
        this.isViewingCompleted = false;
    }

    public isShown(): boolean {
        return this.city.tutorialStepIndex >= 0 || this.isViewingCompleted;
    }

    public getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public asDrawable(): Drawable {
        if (this.isViewingCompleted) {
            return this.createCompletedStepsDrawable();
        }

        if (this.city.tutorialStepIndex === -1) {
            return this.lastDrawable = new Drawable({ width: "0px" });
        }

        const currentStep = this.steps[this.city.tutorialStepIndex];
        const stepDrawable = this.createContentDrawable(currentStep);

        this.lastDrawable = stepDrawable;
        return stepDrawable;
    }

    onResize(): void { this.leftScroller.onResize(); this.rightScroller.onResize(); }

    getLastDraggables(): Drawable[] {
        return (this.isViewingCompleted ? this.lastDrawable?.children : []) ?? [];
    }

    private createCompletedStepsDrawable(): Drawable {
        const mainDrawable = new Drawable({
            width: "0px",
            keepParentWidth: true,
        });
        const listDrawable = new Drawable({
            width: "320px",
            height: "100%",
            fallbackColor: '#444444',
            onDrag: (x: number, y: number) => {
                this.leftScroller.handleDrag(y, listDrawable.screenArea);
            },
            onDragEnd: () => {
                this.leftScroller.resetDrag();
            },
        });
        mainDrawable.addChild(listDrawable);

        let nextY = 10 - this.leftScroller.getScroll();
        const baseY = nextY;
        this.steps.forEach((step, index) => {
            const stepTitle = new Drawable({
                x: 10,
                y: nextY,
                width: "300px",
                height: "40px",
                text: step.title,
                onClick: () => {
                    this.completedViewIndex = index;
                    this.rightScroller.resetScroll();
                },
            });
            listDrawable.addChild(stepTitle);
            nextY += 48;
        });
        this.leftScroller.setChildrenSize(nextY - baseY + 10);

        mainDrawable.addChild(this.createTextContentDrawable());

        const closeButton = new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.hideCompletedSteps(),
        });
        mainDrawable.addChild(closeButton);

        this.lastDrawable = mainDrawable;
        return mainDrawable;
    }

    private createTextContentDrawable(): Drawable {
        const contentDrawable = new Drawable({
            x: 320,
            width: "calc(100% - 320px)",
            height: "100%",
            fallbackColor: '#333333',
            onDrag: (x: number, y: number) => {
                this.rightScroller.handleDrag(y, contentDrawable.screenArea);
            },
            onDragEnd: () => {
                this.rightScroller.resetDrag();
            },
        });

        if (this.completedViewIndex !== -1) {
            const selectedStep = this.steps[this.completedViewIndex];
            const stepContent = new Drawable({
                text: selectedStep.content.text,
                x: 10,
                y: 68 - this.rightScroller.getScroll(),
                width: "calc(100% - 20px)",
                height: "32px",
                wordWrap: true,
                biggerOnMobile: true,
                scaleYOnMobile: true,
            });

            this.rightScroller.setChildrenSize(1400); //TODO: *can* I make it dynamic?
            contentDrawable.addChild(stepContent);
        } else this.rightScroller.resetScroll();

        return contentDrawable;
    }

    private createContentDrawable(currentStep: TutorialStep): Drawable {
        const stepDrawable = new Drawable(this.minimized
            ? { anchors: ['centerX'], centerOnOwnX: true, width: "180px", height: "64px", fallbackColor: '#000000bb' }
            : { width: "100%", height: "100%", fallbackColor: '#00000055', ...currentStep.backdropMods, });

        if (!this.minimized) {
            const contentText = currentStep.content.text || "";
            const pageSize = Math.floor(currentStep.charsPerPage / BIGGER_MOBILE_RATIO);
            const pages = this.paginateText(contentText, pageSize); //TODO: cache

            if (currentStep.type === 'button' && this.currentPage === pages.length - 1) stepDrawable.onClick = () => this.maybeAdvance();

            const contentDrawable = new Drawable({
                x: 10, y: 70, //Some room for the 'hide' button
                width: "calc(100% - 20px)",
                height: "48px",
                wordWrap: true,
                noXStretch: true,
                biggerOnMobile: true,
                fallbackColor: '#333333AA',
                ...currentStep.content,
                text: pages[this.currentPage],
                id: "tutorialContent",
            });
            stepDrawable.addChild(contentDrawable);

            if (this.currentPage > 0) {
                const prevButton = new Drawable({
                    anchors: ['left', 'bottom'],
                    width: "64px",
                    height: "64px",
                    x: 10,
                    y: 10,
                    fallbackColor: '#4CAF50',
                    text: "< Back",
                    id: "prevButton",
                    onClick: () => { this.currentPage--; },
                });
                stepDrawable.addChild(prevButton);
            }

            if (this.currentPage < pages.length - 1) {
                const nextPageButton = new Drawable({
                    anchors: ['right', 'bottom'],
                    width: "64px",
                    height: "64px",
                    x: 10,
                    y: 10,
                    fallbackColor: '#4CAF50',
                    text: "More >",
                    id: "nextPageButton",
                    onClick: () => { this.currentPage++; },
                });
                stepDrawable.addChild(nextPageButton);
            }

            if (this.currentPage === pages.length - 1) {
                const nextButton = new Drawable({
                    anchors: ['right', 'bottom'],
                    width: "400px",
                    height: "64px",
                    y: this.currentPage === 0 && stepDrawable.height !== "100%" ? 0 : 64,
                    fallbackColor: '#4CAF50',
                    rightAlign: true,
                    noXStretch: true,
                    scaleYOnMobile: true, //actually to give room for the pagination buttons
                    reddize: !currentStep.advancementCriteria(),
                    ...currentStep.nextButton,
                    id: "nextButton",
                });
                stepDrawable.addChild(nextButton);
            }
        }

        const minimizeTutorialButton = new Drawable({
            anchors: ['centerX'],
            width: "160px",
            height: "64px",
            y: 10,
            centerOnOwnX: true,
            fallbackColor: '#4CAF50',
            text: (this.minimized ? "Show" : "Hide") + " tutorial",
            id: "minimizeButton",
            onClick: () => { this.minimized = !this.minimized; },
        });
        stepDrawable.addChild(minimizeTutorialButton);

        return stepDrawable;
    }

    private paginateText(text: string, pageSize: number): string[] {
        const words = text.split(/([ -])/); // Split by space or hyphen and keep the separator
        const pages: string[] = [];
        let currentPage = '';

        for (const word of words) {
            if ((currentPage + word).length > pageSize) {
                pages.push(currentPage.trim());
                currentPage = '';
            }
            currentPage += word;
        }

        if (currentPage.trim()) {
            pages.push(currentPage.trim());
        }

        return pages;
    }
}