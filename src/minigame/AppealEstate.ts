import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { EffectType } from "../game/GridType.js";
import { GameState } from "../game/GameState.js";
import { inPlaceShuffle } from "../game/MiscFunctions.js";
import { Resource } from "../game/Resource.js";
import { AppealEstatePlays, Flunds, getResourceType } from "../game/ResourceTypes.js";
import { Anchor, Drawable } from "../ui/Drawable.js";
import { IHasDrawable } from "../ui/IHasDrawable.js";
import { IOnResizeEvent } from "../ui/IOnResizeEvent.js";
import { StandardScroller } from "../ui/StandardScroller.js";
import { TextureInfo } from "../ui/TextureInfo.js";
import { UIManager } from "../ui/UIManager.js";
import { addResourceCosts, humanizeCeil, humanizeFloor, longTicksToDaysAndHours } from "../ui/UIUtil.js";
import { OnePracticeRun, progressMinigameOptionResearch, rangeMapLinear } from "./MinigameUtil.js";
import { Effect } from "../game/Effect.js";
import { LONG_TICKS_PER_DAY } from "../game/FundamentalConstants.js";
import { BuildingCategory } from "../game/BuildingCategory.js";
import { getBuildingType, Skyscraper } from "../game/BuildingTypes.js";

class PropertyAbility {
	constructor(
		public id: string,
		public name: string,
		public description: string,
		public category: AbilityCategory,
		public resourceCosts: { type: string, amount: number }[],
		public effects: AbilityEffect[],
		public economicPhase?: EconomicPhase, // When this ability is most effective
		public usageCount: number = 1, // How many times this ability can be used (usually 1)
		public canBank: boolean = true // Whether this ability can be banked for later use (usually true)
	) {
	}
}

type AbilityEffect = StatEffect | AreaEffect;

class StatEffect {
	constructor(public type: EffectTargetType, public value: number, public description: string) {
	}
}

class AreaEffect { // Main game area effect
	constructor(public type: EffectType, public value: number, public description: string) {
	}
}

interface ComboBonus {
	id: number;
	abilityIds: string[];
	name: string;
	description: string;
	bonusEffects: AbilityEffect[];
}

interface TenantApplication {
	name: string;
	value: number; // How much this tenant contributes to victory
	minAppeal: number;
	specialRequirements?: string[]; // Special conditions this tenant needs
	sideEffects?: AbilityEffect[]; // Negative consequences of accepting this tenant
	rejectionPenalty?: number; // Reputation hit for rejecting
}

enum AbilityCategory {
	Construction = "construction",
	TenantAttraction = "tenant_attraction",
	Marketing = "marketing",
	SocialEngineering = "social_engineering",
	Financial = "financial"
}

enum EffectTargetType {
	AppealPoints = "appeal_points",
	ConstructionProgress = "construction_progress",
	Reputation = "reputation",
	Flunds = "flunds",
	Resources = "resources" // Other resource generation
}

enum EconomicPhase {
	Early = "early", // Turns 1-4, construction focus
	Mid = "mid",     // Turns 5-8, marketing focus  
	Late = "late",    // Turns 9-12, financial focus
	BehindSchedule = "behind schedule" // Turns 13+, costs rise
}

interface PropertyDevelopmentState {
	// Core minigame resources
	appealPoints: number;
	constructionProgress: number;
	reputation: number;

	// Game progression
	currentTurn: number;
	economicPhase: EconomicPhase;
	phaseDuration: number;

	// Available abilities (3-7 random ones each turn)
	availableAbilities: PropertyAbility[];
	usedAbilities: { ability: PropertyAbility, buffStrength: number, debuffStrength: number }[];
	bankedAbility: PropertyAbility | null;
	bankedTurnsRemaining: number; // Auto-execute at 50% after 4 turns

	// Tenant management
	tenantApplications: TenantApplication[];
	acceptedTenants: TenantApplication[];

	// Combo tracking
	lastUsedAbility: PropertyAbility | null;
	discoveredCombos: ComboBonus[];

	// Victory thresholds (based on building type)
	constructionThreshold: number;
	appealThreshold: number;
	tenantValueThreshold: number;

	// Flags and values for specific abilities/combos/tenants that there was no reason to try to generalize
	guaranteedTenantApplication: boolean;
	instantTenantApplication: boolean;
	loanPaybackTurns: number;

	// UI State
	expandedAbilityIndex: number | null;
	lastTriggeredCombo: ComboBonus | null;
	lastTriggeredComboWasNew: boolean;
}

const NEGATIVE_EFFECT_TYPES = new Set<EffectType>([
	EffectType.PettyCrime,
	EffectType.OrganizedCrime,
	EffectType.ParticulatePollution,
	EffectType.GreenhouseGases,
	EffectType.Noise,
	EffectType.FireHazard,
]);

const effectTypeIconMap = new Map<EffectType, string>([[EffectType.PoliceProtection, "ui/policeprotection"], [EffectType.Luxury, "ui/luxury"], [EffectType.Noise, "ui/noise"],
	[EffectType.BusinessPresence, "ui/businesspresence"], [EffectType.BusinessValue, "ui/businessvalue"], [EffectType.FireProtection, "ui/fireprotection"],
	[EffectType.LandValue, "ui/landvalue"], [EffectType.ParticulatePollution, "ui/particulatepollution"], [EffectType.OrganizedCrime, "ui/organizedcrime"],
	[EffectType.PublicTransport, "ui/publictransport"], [EffectType.Healthcare, "ui/healthcare"]]);

//TODO: Boring. Best ideas so far: random events like doubling costs for a turn, locking you out of a specific resource, or adjusting effectiveness. More abilities could have negative numbers for construction, appeal, reputation.
export class AppealEstate implements IHasDrawable, IOnResizeEvent {
	// Standard minigame properties
	private userInputLocked: boolean = false;
	private building: Building | null = null;
	private isPractice: boolean = false;
	private endReason: string = "";
	private gameStarted: boolean = false;
	private shown: boolean = false;
	private lastDrawable: Drawable | null = null;
	private howToPlayShown: boolean = false;
	private preloaded: boolean = false;
	private winnings: {
		upgraded: boolean;
		areaEffects: { type: EffectType; value: number }[];
	} | null = null;
	private score: number = 0;
	private showCombos: boolean = true;
	private showAllCombos: boolean = false;

	// Timers
	private animationTimeout: NodeJS.Timeout | null = null;

	// UI components
	private scroller: StandardScroller;

	// Game state
	private state!: PropertyDevelopmentState;

	// Ability definitions (to be populated with actual data later)
	private allAbilities: PropertyAbility[] = [];
	private comboBonuses: ComboBonus[] = [];

	// Constants
	private static readonly ABILITIES_PER_TURN = 3; //TODO: Making some abilities let you draw an extra one like a board game would be great for making the game feel more strategic.
	private static readonly BANK_TURNS_LIMIT = 4;
	private static readonly AREA_EFFECT_RADIUS = 3;
	private static readonly AREA_EFFECT_LONG_TICKS = 2 * LONG_TICKS_PER_DAY; // How long area effects last
	private static readonly DEFAULT_REJECTION_PENALTY = 2;

	private static readonly REPUTATION_MAX = 100;
	private static readonly PHASE_MATCH_BONUS = 0.25;
	private static readonly BEHIND_SCHEDULE_PENALTY = 1.0; // Doubles costs in the Behind Schedule phase
	private static readonly TENANCE_RECURRENCE_RATE = 0.2; // 20% chance for a tenant to reappear each turn after first acceptance

	private static readonly LOAN_AMOUNT = 50;
	private static readonly LOAN_REPAYMENT_COST = 60;
	private static readonly LOAN_REPAYMENT_TURNS = 3; // How many turns to pay back the loan
	private static readonly CRYPTOCURRENCY_MIN_VALUATION = -10;
	private static readonly CRYPTOCURRENCY_MAX_VALUATION = 25;

	// Victory thresholds by building type
	private static readonly BUILDING_THRESHOLDS = {
		smallhouse: { construction: 160, appeal: 140, tenantValue: 130, phaseDuration: 4 },
		quadplex: { construction: 200, appeal: 180, tenantValue: 200, phaseDuration: 5 }, //About the same upgrade difficulty as Small Apartment
		smallapartment: { construction: 190, appeal: 170, tenantValue: 180, phaseDuration: 5 },
		highrise: { construction: 300, appeal: 240, tenantValue: 250, phaseDuration: 6 }
	};

	constructor(
		private city: City,
		private uiManager: UIManager,
		private game: GameState
	) {
		this.scroller = new StandardScroller(false, true); // Vertical scrolling
		this.initializeAbilities();
		this.initializeCombos();
	}

	// Core minigame interface methods
	public show(building?: Building): void {
		this.building = building || null;
		this.shown = true;
		this.scroller.resetScroll();
		this.preloadImages();
	}

	public hide(): void {
		this.shown = false;
		this.endGame();
	}

	public isPlaying(): boolean { return this.shown && this.gameStarted; }

	public getCosts(): { type: string, amount: number }[] {
		return this.isPractice ? OnePracticeRun : [{ type: getResourceType(AppealEstatePlays), amount: 1 }];
	}

	public startGame(): void {
		if (this.city.checkAndSpendResources(this.getCosts())) {
			this.initializeGame();
			this.city.updateLastUserActionTime();
			this.game.fullSave();
		}
	}

	private initializeGame(): void {
		this.gameStarted = true;
		this.userInputLocked = false;
		this.endReason = "";
		this.score = 0;
		this.winnings = null;

		// Initialize game state based on building type
		const buildingType = this.getBuildingType();
		const thresholds = AppealEstate.BUILDING_THRESHOLDS[buildingType];

		this.state = {
			appealPoints: 0,
			constructionProgress: 0,
			reputation: 50, // Start with neutral reputation
			currentTurn: 1,
			economicPhase: EconomicPhase.Early,
			phaseDuration: thresholds.phaseDuration,
			availableAbilities: [],
			usedAbilities: [],
			bankedAbility: null,
			bankedTurnsRemaining: 0,
			tenantApplications: [],
			acceptedTenants: [],
			lastUsedAbility: null,
			discoveredCombos: this.comboBonuses.filter(p => this.city.appealEstateDiscoveredCombos.has(p.id)), // Saved and loaded with the rest of the city
			constructionThreshold: thresholds.construction,
			appealThreshold: thresholds.appeal,
			tenantValueThreshold: thresholds.tenantValue,
			expandedAbilityIndex: null,
			lastTriggeredCombo: null,
			lastTriggeredComboWasNew: false,
			guaranteedTenantApplication: false,
			instantTenantApplication: false,
			loanPaybackTurns: 0,
		};

		this.generateAvailableAbilities();
	}

	private endGame(): void {
		if (this.gameStarted) {
			this.calculateWinnings();
			this.applyAreaEffects();
			this.game.fullSave();
		}

		if (this.animationTimeout) {
			clearTimeout(this.animationTimeout);
			this.animationTimeout = null;
		}

		this.userInputLocked = true;
		this.scroller.resetScroll();
		setTimeout(() => { this.gameStarted = false; this.endReason = ""; this.userInputLocked = false; }, 1000); //Will wait for the user to tap to continue.
	}

	private calculateWinnings(): void {
		// Calculate score based on final state
		this.score = Math.min(1, this.state.constructionProgress / this.state.constructionThreshold) +
			Math.min(1, this.state.appealPoints / this.state.appealThreshold) +
			Math.min(1, this.state.reputation / AppealEstate.REPUTATION_MAX) +
			Math.min(1, this.state.acceptedTenants.reduce((sum, tenant) => sum + tenant.value, 0) / this.state.tenantValueThreshold);

		this.winnings = {
			upgraded: false,
			areaEffects: []
		};

		//Allowing minigame research progress even in practice mode.
		progressMinigameOptionResearch(this.city, rangeMapLinear(this.score, 0.01, 0.05, 1.5, 3.5, 0.1));
	}

	private applyAreaEffects(): void {
		if (!this.building || this.isPractice) return;

		// Apply area effects to the city based on abilities used
		const effects: { [key in EffectType]?: number } = {};

		this.state.usedAbilities.forEach(ability => {
			ability.ability.effects.forEach(effect => {
				if (effect instanceof AreaEffect) {
					effects[effect.type] = (effects[effect.type] || 0) + effect.value * (this.isNegativeEffectType(effect) ? ability.debuffStrength : ability.buffStrength);
				}
			});
		});

		// Store area effects in winnings
		if (this.winnings) {
			this.winnings.areaEffects = Object.entries(effects).map(([type, value]) => ({
				type: parseInt(type) as EffectType, //type is EffectType here, except as a numeric string, while EffectType should really be an int (once compiled).
				value: Math.round(100 * value!) / 100
			}));
			this.winnings.areaEffects = this.winnings.areaEffects.filter(p => p.value != 0);
		}

		// Upgrade building if thresholds met
		const upgraded = this.checkVictoryConditions();
		if (upgraded) {
			this.upgradeBuildingIfPossible();
		}
		if (this.winnings) {
			this.winnings.upgraded = upgraded;
		}

		// Apply effects to the area around the building
		Object.entries(effects).forEach(([effectType, value]) => {
			if (value === 0) return;
			this.city.spreadEffect(new Effect(
				parseInt(effectType) as EffectType, value, undefined, undefined, AppealEstate.AREA_EFFECT_LONG_TICKS),
				AppealEstate.AREA_EFFECT_RADIUS + this.building!.width - 1,
				AppealEstate.AREA_EFFECT_RADIUS + this.building!.height - 1,
				true,
				Math.floor(this.building!.x + this.building!.width / 2),
				Math.floor(this.building!.y + this.building!.height / 2)
			);
		});
	}

	// Game logic methods
	private getBuildingType(): keyof typeof AppealEstate.BUILDING_THRESHOLDS {
		const type = this.building?.type;
		if (type && type in AppealEstate.BUILDING_THRESHOLDS) {
			return type as keyof typeof AppealEstate.BUILDING_THRESHOLDS;
		}
		return "smallhouse"; // Fallback for practice mode or unknown building types
	}

	private generateAvailableAbilities(): void {
		// Filter available abilities (has more uses)
		const unusedAbilities = this.allAbilities.filter(ability =>
			this.state.usedAbilities.filter(p => p.ability === ability).length + this.state.availableAbilities.filter(p => p === ability).length < ability.usageCount
		);

		while (this.state.availableAbilities.length < AppealEstate.ABILITIES_PER_TURN) {
			//take a random one from unusedAbilities
			const randomIndex = Math.floor(Math.random() * unusedAbilities.length);
			const ability = unusedAbilities[randomIndex];
			this.state.availableAbilities.push(ability);
			unusedAbilities.splice(randomIndex, 1); // Remove to avoid duplicates (only meaningful if you generate >1 in a single call to generateAvailableAbilities(), i.e., at game init)
		}
	}

	private hasAffordableAbilities(): boolean {
		return this.state.availableAbilities.some(ability => this.isAbilityAffordable(ability));
	}

	private isAbilityAffordable(ability: PropertyAbility): boolean {
		if (this.isPractice) return true;
		const phaseCostMultiplier = this.getPhaseCostMultiplier(ability);
		const finalCosts = ability.resourceCosts.map(p => ({ type: p.type, amount: p.amount * phaseCostMultiplier }));
		return this.city.hasResources(finalCosts, false);
	}

	private generateTenantApplications(): void {
		// Clear existing applications
		this.state.tenantApplications = [];

		const possibleTenants: TenantApplication[] = [
			{
				name: "Young Family",
				value: 20,
				minAppeal: 90,
				specialRequirements: ["pet_friendly_setup"],
				sideEffects: [new AreaEffect(EffectType.Noise, 0.02, "Children can be a bit noisy")]
			},
			{
				name: "Tech Startup Founder",
				value: 15,
				minAppeal: 70,
				specialRequirements: ["tech_showcase"]
			},
			{
				name: "Wealthy Couple",
				value: 30,
				minAppeal: 120,
				specialRequirements: ["luxury_amenities"],
				sideEffects: [new AreaEffect(EffectType.LandValue, 0.02, "Increases neighborhood prestige")]
			},
			{
				name: "Dog Owner",
				value: 10,
				minAppeal: 50,
				specialRequirements: ["pet_friendly_setup"],
				sideEffects: [new AreaEffect(EffectType.Noise, 0.02, "Occasional barking...or loud, curt meowing")]
			},
			{
				name: "College Student",
				value: 7,
				minAppeal: 20,
				specialRequirements: ["utility_subsidies"]
			},
			{
				name: "Retiree",
				value: 13,
				minAppeal: 60,
				specialRequirements: ["charity_drive"],
				sideEffects: [new AreaEffect(EffectType.PoliceProtection, 0.02, "Watchful presence takes just a tiny nibble out of crime")]
			},
			{
				name: "Remote Worker",
				value: 17,
				minAppeal: 60,
				specialRequirements: ["coworking_space"],
				sideEffects: [new AreaEffect(EffectType.BusinessValue, 0.01, "Contributes to local economy juuust a bit")]
			},
			{
				name: "Eco Family",
				value: 25,
				minAppeal: 80,
				specialRequirements: ["rooftop_garden", "community_support"]
			},
			{
				name: "Crypto Enthusiast",
				value: 19,
				minAppeal: 75,
				specialRequirements: ["cryptocurrency_payments", "tech_showcase"],
				sideEffects: [new StatEffect(EffectTargetType.Reputation, -4, "Neighbors suspicious of 'new money'")]
			},
			{
				name: "Safety Conscious Parent",
				value: 21,
				minAppeal: 85,
				specialRequirements: ["security_system", "neighborhood_watch"]
			},
			{
				name: "Foodie",
				value: 14,
				minAppeal: 55,
				specialRequirements: ["food_truck_event", "community_bbq"]
			},
			{
				name: "Furry Barista",
				value: 12,
				minAppeal: 55,
				specialRequirements: ["pet_friendly_setup", "blueprint_refinement"],
				sideEffects: [new StatEffect(EffectTargetType.Reputation, -2, "Unusual lifestyle raises eyebrows")]
			},
			{
				name: "Void Cat Collective",
				value: 13,
				minAppeal: 55,
				specialRequirements: ["pet_friendly_setup", "permit_expediting"]
			},
			{
				name: "Startup Incubator",
				value: 28,
				minAppeal: 100,
				specialRequirements: ["coworking_space", "tech_showcase", "bulk_material_orders"],
				sideEffects: [new AreaEffect(EffectType.BusinessPresence, 0.05, "Contributes to tech hub development")]
			},
			{
				name: "Influencer Roommates",
				value: 24,
				minAppeal: 130,
				specialRequirements: ["influencer_partnership", "virtual_tours", "premium_listing"]
			},
			{
				name: "Paranoid Millionaire",
				value: 45,
				minAppeal: 150,
				specialRequirements: ["security_system", "insurance_partnerships", "political_connections"],
                sideEffects: [new AreaEffect(EffectType.PoliceProtection, 0.02, "Slips flunds into the security guards' pockets...for *more* security")]
			},
			{
				name: "Court of Night Owls",
				value: 27,
				minAppeal: 80,
				specialRequirements: ["night_shift_construction", "security_system", "political_connections"],
				sideEffects: [new AreaEffect(EffectType.OrganizedCrime, 0.05, "Who knows what these people are up to in the shadows")]
			},
			{
				name: "Urban Farmers Guild",
				value: 24,
				minAppeal: 95,
				specialRequirements: ["rooftop_garden", "bulk_material_orders", "community_support"]
			},
			{
				name: "Conspiracy Theorists Union",
				value: 27,
				minAppeal: 70,
				specialRequirements: ["rumor_network", "security_system", "political_connections"]
			},
			{
				name: "Advertising Enthusiasts Club",
				value: 22,
				minAppeal: 60,
				specialRequirements: ["billboard_campaign", "premium_listing", "referral_program"],
				sideEffects: [new AreaEffect(EffectType.Luxury, -0.02, "They put up a lot of flyers")]
			},
			{
				name: "Luxury Pigeon Fanciers",
				value: 32,
				minAppeal: 100,
				specialRequirements: ["luxury_amenities", "rooftop_garden", "pet_friendly_setup"],
				sideEffects: [new AreaEffect(EffectType.Noise, 0.02, "Coo, coo")]
			},
			{
				name: "Coffee Startup Night Market",
				value: 38,
				minAppeal: 110,
				specialRequirements: ["night_shift_construction", "food_truck_event", "local_business_partnerships"]
			},
			{
				name: "Time Travelers Association",
				value: 42,
				minAppeal: 120,
				specialRequirements: ["blueprint_refinement", "permit_expediting", "renovation_loans"],
				sideEffects: [new AreaEffect(EffectType.Education, 0.05, "Shares historical knowledge")]
			},
			{
				name: "Nocturnal Gourmet Ferret Collective",
				value: 25,
				minAppeal: 85,
				specialRequirements: ["night_shift_construction", "pet_friendly_setup", "community_bbq"],
				sideEffects: [new StatEffect(EffectTargetType.Reputation, -5, "Name invites confusion; they're not eating the ferrets")]
			},
			{
				name: "Retired Timeshare Magicians",
				value: 37,
				minAppeal: 110,
				specialRequirements: ["virtual_tours", "luxury_amenities", "permit_expediting"],
				sideEffects: [new StatEffect(EffectTargetType.AppealPoints, 10, "The community appreciates the occasional tasteful illusion")]
			},
			{
				name: "Urban Knights of the Square Table of Ni",
				value: 31,
				minAppeal: 120,
				specialRequirements: ["community_support", "investor_dinner", "billboard_campaign"]
			},
			{
				name: "Cryptocurrency Astrologers Guild",
				value: 44,
				minAppeal: 130,
				specialRequirements: ["cryptocurrency_payments", "political_connections", "premium_listing"],
                sideEffects: [new AreaEffect(EffectType.OrganizedCrime, 0.05, "Shady characters all around")]
			},
			{
				name: "Mongolian Throat Singing Clowns",
				value: 25,
				minAppeal: 70,
				specialRequirements: ["community_bbq", "rumor_network", "billboard_campaign"],
				sideEffects: [new AreaEffect(EffectType.Noise, 0.05, "It's the honking")]
			},
			{
				name: "Hyperactive Garden Gnome Society",
				value: 32,
				minAppeal: 90,
				specialRequirements: ["rooftop_garden", "pet_friendly_setup", "community_support"],
				sideEffects: [new AreaEffect(EffectType.LandValue, 0.02, "Whimsical garden displays amuse passers-by")]
			},
			{
				name: "Militant Cheese Sculptors Union",
				value: 39,
				minAppeal: 105,
				specialRequirements: ["material_delivery", "food_truck_event", "permit_expediting", "luxury_amenities"],
				sideEffects: [new StatEffect(EffectTargetType.Reputation, -5, "A persistent dairy fan often comes by to protest violence against soft cheese")],
			},
			{
				name: "Competitive Elevator Musicians",
				value: 33,
				minAppeal: 95,
				specialRequirements: ["night_shift_construction", "social_media_campaign", "community_bbq", "prefab_assembly"],
				sideEffects: [new AreaEffect(EffectType.Education, 0.02, "Promotes musical appreciation")]
			},
			{
				name: "Interpretive Tax Preparers League",
				value: 26,
				minAppeal: 80,
				specialRequirements: ["professional_staging", "move_in_incentives", "virtual_tours", "coworking_space"],
				sideEffects: [new AreaEffect(EffectType.BusinessValue, -0.01, "Promotes fanciful financial approaches, causing more audits")]
			},
			{
				name: "Reformed Pirates Retirement Home",
				value: 34,
				minAppeal: 100,
				specialRequirements: ["security_system", "charity_drive", "rooftop_garden", "move_in_incentives"],
				sideEffects: [new AreaEffect(EffectType.OrganizedCrime, 0.05, "Old habits die hard")]
			},
			{
				name: "Aristocratic Bubble Wrap Connoisseurs",
				value: 52,
				minAppeal: 140,
				specialRequirements: ["luxury_amenities", "material_delivery", "investor_dinner", "political_connections"]
			},
			{
				name: "Speed Reading Mime Troupe",
				value: 23,
				minAppeal: 75,
				specialRequirements: ["community_bbq", "billboard_campaign", "social_media_campaign", "referral_program"],
				sideEffects: [new AreaEffect(EffectType.Education, 0.05, "Promotes literacy and performance arts")]
			},
			{
				name: "Competitive Napkin-Folding Surgeons",
				value: 44,
				minAppeal: 135,
				specialRequirements: ["professional_staging", "luxury_amenities", "insurance_partnerships", "permit_expediting"],
				sideEffects: [new AreaEffect(EffectType.Healthcare, 0.05, "Medical expertise improves emergency response")]
			},
			{
				name: "Midnight Origami Emergency Response Team",
				value: 30,
				minAppeal: 115,
				specialRequirements: ["night_shift_construction", "material_delivery", "social_media_campaign", "security_system"]
			},
			{
				name: "Therapeutic Yodeling Venture Capitalists",
				value: 65,
				minAppeal: 130,
				specialRequirements: ["investor_dinner", "luxury_amenities", "political_connections", "premium_listing"],
				sideEffects: [new AreaEffect(EffectType.Noise, 0.02, "The yodeling is...not that bad, really, but it *is* still noise")]
			},
			{
				name: "Synchronized Doorbell Ringing Championship Committee",
				value: 30,
				minAppeal: 90,
				specialRequirements: ["neighborhood_watch", "community_support", "social_media_campaign", "referral_program"],
                sideEffects: [new StatEffect(EffectTargetType.Reputation, -5, "Other tenants are terrified that they might have to answer the door")]
			},
		];
		//Other ideas Gemini gave for some negative traits: Noisy Party Animals reduces reputation each turn, Demanding HOA President requires use of a Social Engineering ability every 3 turns or you lose the tenant, and Slobs decrease appeal. Another idea of mine: some tenants could give you an extra ability to pick from, reduce your hand count, or force you to discard some.
		//I also considered having a maximum count, but then you have to be able to see the existing ones and retroactively reject them, or you could dig yourself into a hole easily. If they don't have special effects, could just show a cumulative tenant list without having to accept them, on the other hand.

		// Filter tenants based on current appeal and used abilities
		const qualifiedTenants = possibleTenants.filter(tenant => {
			if (this.state.appealPoints < tenant.minAppeal) return false;

			const pastAppearances = this.state.acceptedTenants.filter(t => t.name === tenant.name).length;
			if (pastAppearances && Math.random() >= Math.pow(AppealEstate.TENANCE_RECURRENCE_RATE, pastAppearances)) return false; // 20% chance if accepted once; 4% if accepted twice.

			// Check if special requirements are met
			if (tenant.specialRequirements) {
				return tenant.specialRequirements.every(requirement =>
					this.state.usedAbilities.some(ability => ability.ability.id === requirement)
				);
			}
			return true;
		});

		if (this.state.guaranteedTenantApplication && qualifiedTenants.length === 0) {
			// Find the tenant with the lowest appeal requirement to force-add
			const fallbackTenant = [...possibleTenants].sort((a, b) => a.minAppeal - b.minAppeal)[0];
			if (fallbackTenant) {
				qualifiedTenants.push(fallbackTenant);
			}
		}
		this.state.guaranteedTenantApplication = false; // Reset the flag after its potential use

		// Randomly select 2-4 applications
		inPlaceShuffle(qualifiedTenants);
		this.state.tenantApplications = qualifiedTenants.slice(0, Math.min(4, qualifiedTenants.length));
	}

	private hasUsedAbility(abilityId: string): boolean {
		return this.state.usedAbilities.some(ability => ability.ability.id === abilityId);
	}

	private getAbilityById(id: string): PropertyAbility | null {
		return this.allAbilities.find(ability => ability.id === id) || null;
	}

	private checkVictoryConditions(): boolean {
		return this.state.constructionProgress >= this.state.constructionThreshold ||
			(this.state.appealPoints >= this.state.appealThreshold && this.state.reputation >= AppealEstate.REPUTATION_MAX) ||
			this.getTotalTenantValue() >= this.state.tenantValueThreshold;
	}

	private getTotalTenantValue(): number {
		return this.state.acceptedTenants.reduce((sum, tenant) => sum + tenant.value, 0);
	}

	private upgradeBuildingIfPossible(): void {
		if (this.building && !this.isPractice) {
			const details = this.city.residenceSpawner.getResidenceUpgradeDetails(this.building);
			if (details) { // Should never be null here, but maybe the player kept the minigame open so long that it already upgraded, was removed, or had its space taken up by a higher-tier residence.
				const upgradeTo = this.city.buildingTypesByCategory.get(BuildingCategory.RESIDENTIAL)!.find(p => p.type === details.nextTierType)!;
				this.building = upgradeTo.clone();
				this.city.addBuilding(this.building, details.x, details.y);
			}
		}
	}

	private updateEconomicPhase(): void {
		if (this.state.currentTurn <= this.state.phaseDuration) {
			this.state.economicPhase = EconomicPhase.Early;
		} else if (this.state.currentTurn <= this.state.phaseDuration * 2) {
			this.state.economicPhase = EconomicPhase.Mid;
		} else if (this.state.currentTurn <= this.state.phaseDuration * 3) {
			this.state.economicPhase = EconomicPhase.Late;
		} else {
			this.state.economicPhase = EconomicPhase.BehindSchedule;
		}
	}

	private getPhaseMultiplier(ability: PropertyAbility): number {
		if (ability.economicPhase === this.state.economicPhase) {
			return 1 + AppealEstate.PHASE_MATCH_BONUS;
		}
		return 1;
	}

	private getPhaseCostMultiplier(ability: PropertyAbility): number {
		if (this.state.economicPhase === EconomicPhase.BehindSchedule) return 1 + AppealEstate.BEHIND_SCHEDULE_PENALTY;
		return 1;
	}

	// User interaction handlers
	public handleAbilityClick(ability: PropertyAbility, index: number): void {
		if (this.userInputLocked || !this.gameStarted) return;

		if (!this.isAbilityAffordable(ability)) return;

		//Reject any pending tenant applications before executing an ability.
		for (const tenant of this.state.tenantApplications) {
			this.handleRejectTenant(tenant);
		}

		this.executeAbility(ability, index);
		this.handleEndTurn();
	}

	public handleBankAbility(ability: PropertyAbility, index: number): void {
		if (this.userInputLocked || !this.gameStarted) return;
		if (!ability.canBank || this.state.bankedAbility) return;

		// You must spend the cost immediately when banking an ability.
		if (!this.isAbilityAffordable(ability)) return;
		this.spendAbilityResources(ability);

		this.state.bankedAbility = ability;
		this.state.bankedTurnsRemaining = AppealEstate.BANK_TURNS_LIMIT;
		this.removeFromAvailable(index);
		this.generateAvailableAbilities();
		this.handleEndTurn();
	}

	public handleExecuteBankedAbility(): void {
		if (!this.state.bankedAbility) return;

		const effectiveness = this.state.bankedTurnsRemaining > 0 ? 1.0 : 0.5;
		this.executeAbility(this.state.bankedAbility, -1, effectiveness, effectiveness, true);
		this.state.bankedAbility = null;
		this.state.bankedTurnsRemaining = 0;
		this.checkEndConditions();
	}

    // Social engineering and marketing abilities can be 50% to 150% effective depending on reputation (50 reputation = 1.0x). Only the positive effects, though.
	private getReputationMultiplier(ability: PropertyAbility): number {
		if (ability.category !== AbilityCategory.SocialEngineering && ability.category !== AbilityCategory.Marketing) return 1.0;
		const rep = Math.max(0, Math.min(this.state.reputation, AppealEstate.REPUTATION_MAX));
		return 0.5 + (rep / AppealEstate.REPUTATION_MAX);
	}

	public handleAcceptTenant(tenant: TenantApplication): void {
		if (this.userInputLocked || !this.gameStarted) return;

		this.state.acceptedTenants.push(tenant);
		this.state.tenantApplications = this.state.tenantApplications.filter(t => t !== tenant);
		//TODO: Find a nicer way to fix the scroll. this.scroller.resetDrag();

		// If tenant has negative effects, treat them as a "used ability" to be processed at the end
		if (tenant.sideEffects) {
			const fakeAbility = new PropertyAbility(
				`tenant_${tenant.name.replace(/\s/g, '_')}`,
				`Side effects of ${tenant.name}`,
				'Effects from accepting this tenant.',
				AbilityCategory.SocialEngineering,
				[],
				tenant.sideEffects,
				undefined, 0, false
			);
			this.state.usedAbilities.push({ ability: fakeAbility, buffStrength: 1.0, debuffStrength: 1.0 });
		}

		// Check if we've reached tenant value threshold
		this.checkEndConditions();
	}

	public handleRejectTenant(tenant: TenantApplication): void {
		if (this.userInputLocked || !this.gameStarted) return;

		this.state.tenantApplications = this.state.tenantApplications.filter(t => t !== tenant);

		// Small reputation hit for rejecting tenants
		this.state.reputation = Math.max(0, this.state.reputation - (tenant.rejectionPenalty ?? AppealEstate.DEFAULT_REJECTION_PENALTY));
		//TODO: Find a nicer way to fix the scroll. this.scroller.resetDrag();
	}

	public handleEndTurn(): void {
		if (this.userInputLocked || !this.gameStarted) return;

		this.state.expandedAbilityIndex = null; // Collapse all cards

		this.state.currentTurn++;
		this.updateEconomicPhase();

		// Update banked ability countdown
		if (this.state.bankedAbility && this.state.bankedTurnsRemaining > 0) {
			this.state.bankedTurnsRemaining--;
			if (this.state.bankedTurnsRemaining <= 0) {
				this.handleExecuteBankedAbility();
			}
		}

		this.generateTenantApplications();
		this.generateAvailableAbilities();
		this.checkEndConditions();

		// Loan must be repaid with interest, even if the game ended
		if (!this.isPractice && this.state.loanPaybackTurns > 0) {
			this.state.loanPaybackTurns--;
			if (this.userInputLocked || this.state.loanPaybackTurns === 0) {
				this.city.consume(getResourceType(Flunds), AppealEstate.LOAN_REPAYMENT_COST);
			}
        }
	}

	private spendAbilityResources(ability: PropertyAbility): void {
		if (this.isPractice) return; // In practice mode, no main game resources are spent.

		const phaseCostMultiplier = this.getPhaseCostMultiplier(ability);
		ability.resourceCosts.forEach(cost => {
			this.city.consume(cost.type, cost.amount * phaseCostMultiplier);
		});
	}

	private executeAbility(ability: PropertyAbility, index: number, buffStrength: number = 1.0, debuffStrength: number = 1.0, skipCost: boolean = false): void {
		// Spend resources
		if (!skipCost) this.spendAbilityResources(ability);

		// Phase multiplier only affects positive effects.
		buffStrength *= this.getPhaseMultiplier(ability);
		buffStrength *= this.getReputationMultiplier(ability);

		if (ability.id === 'move_in_incentives') {
			this.state.guaranteedTenantApplication = true;
		} else if (ability.id == 'renovation_loans') {
            this.state.loanPaybackTurns = AppealEstate.LOAN_REPAYMENT_TURNS + 1; // +1 because using this ability ends the CURRENT turn, which subtracts 1 from that counter.
		}

		ability.effects.forEach(effect => {
			if (effect instanceof StatEffect) {
				let value = Math.floor(effect.value * (effect.value < 0 ? debuffStrength : buffStrength));
				if (ability.id === 'cryptocurrency_payments' && effect.type === EffectTargetType.Flunds) {
					value = Math.floor(Math.random() * (AppealEstate.CRYPTOCURRENCY_MAX_VALUATION - AppealEstate.CRYPTOCURRENCY_MIN_VALUATION + 1)) + AppealEstate.CRYPTOCURRENCY_MIN_VALUATION;
				}
				this.applyEffect(effect.type, value);
			}
		});

		// Check for combo with last used ability
		this.checkForCombo(ability);

		// Update state
		this.state.lastUsedAbility = ability;
		this.state.usedAbilities.push({ ability, buffStrength, debuffStrength });
		ability.usageCount--;

		this.removeFromAvailable(index);
		this.generateAvailableAbilities();
		//TODO: Find a nicer way to fix the scroll. this.scroller.resetDrag();
	}

	private applyEffect(effectType: EffectTargetType, value: number): void {
		switch (effectType) {
			case EffectTargetType.AppealPoints:
				this.state.appealPoints += value;
				break;
			case EffectTargetType.ConstructionProgress:
				this.state.constructionProgress += value;
				break;
			case EffectTargetType.Reputation:
				this.state.reputation += value;
				break;
			case EffectTargetType.Flunds:
				if (!this.isPractice) this.city.transferResourcesFrom([{ type: getResourceType(Flunds), amount: value }], "earn");
				break;
			// Additional effect types would be handled here
		}
	}

	private checkForCombo(currentAbility: PropertyAbility): void {
		if (!this.state.lastUsedAbility) return;

		const combo = this.comboBonuses.find(combo =>
			combo.abilityIds.includes(this.state.lastUsedAbility!.id) &&
			combo.abilityIds.includes(currentAbility.id)
		);

		this.state.lastTriggeredComboWasNew = false;
		if (combo) {
			if (!this.state.discoveredCombos.includes(combo)) {
				this.state.discoveredCombos.push(combo);
				this.city.appealEstateDiscoveredCombos.add(combo.id); // Save discovered combo to the city state, too. Yes, even in practice mode. Discovered is discovered. :)
				this.state.lastTriggeredComboWasNew = true;
			}

			// Apply combo bonus effects
			combo.bonusEffects.forEach(effect => {
				if (effect instanceof StatEffect) {
					const value = Math.floor(effect.value * this.getPhaseMultiplier(currentAbility));
					this.applyEffect(effect.type, value);
				}
			});

			if (combo.id === 6) { // Model Home Effect
				this.state.instantTenantApplication = true;
			}
		}

		this.state.lastTriggeredCombo = combo ?? null;
	}

	private hasPotentialComboToDisplay(ability: PropertyAbility): boolean { //Only show DISCOVERED combos.
		if (!this.state.lastUsedAbility) return false;

		// A combo is between the last used ability and the one about to be used.
		return this.comboBonuses.filter(p => this.state.discoveredCombos.includes(p)).some(combo =>
			combo.abilityIds.includes(this.state.lastUsedAbility!.id) &&
			combo.abilityIds.includes(ability.id)
		);
	}

	private removeFromAvailable(index: number): void {
		if (index !== -1) {
			this.state.availableAbilities.splice(index, 1);
		}
	}

	private checkEndConditions(): void {
		if (this.checkVictoryConditions()) {
			if (this.state.constructionProgress >= this.state.constructionThreshold) this.endReason = "Housing erected!";
			else if (this.getTotalTenantValue() >= this.state.tenantValueThreshold) this.endReason = "Agreement signed!";
			else this.endReason = "Investors approved!";
			this.endGame();
		} else if (!this.hasAffordableAbilities() && this.state.availableAbilities.length === 0) {
			this.endReason = "Project failed!";
			this.endGame();
		}
	}

	private initializeAbilities(): void {
		this.allAbilities = [
			// 🏗️ CONSTRUCTION ABILITIES
			new PropertyAbility("blueprint_refinement", "Panic with Pythagorean Passion", "Optimize building plans for efficiency via blueprint refinement.",
				AbilityCategory.Construction,
				[{ type: "paper", amount: 1 }, { type: "flunds", amount: 10 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 25, "Boost construction progress"),
					new AreaEffect(EffectType.Noise, 0.05, "Creates noise pollution")
				],
				EconomicPhase.Early,
				2,
			),
			new PropertyAbility("crane_operations", "Summon the Sky Giraffes", "Heavy machinery for major construction--crane operations accelerate progress.",
				AbilityCategory.Construction,
				[{ type: "steel", amount: 1 }, { type: "flunds", amount: 10 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 50, "Major construction progress boost"),
					new AreaEffect(EffectType.Noise, 0.1, "Creates major noise pollution"),
					new AreaEffect(EffectType.ParticulatePollution, 0.05, "Creates particulate pollution")
				],
				EconomicPhase.Early,
				2,
			),
			new PropertyAbility("material_delivery", "Deploy Concrete Cavalry", "Steady supply of building materials via material delivery.",
				AbilityCategory.Construction,
				[{ type: "lumber", amount: 1 }, { type: "concrete", amount: 1 }, { type: "bricks", amount: 1 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 30, "Steady construction progress"),
					new AreaEffect(EffectType.ParticulatePollution, 0.02, "Creates minor particulate pollution")
				],
				EconomicPhase.Early,
			),
			new PropertyAbility("permit_expediting", "Bribe the Bureaucratic Ballet", "Fast-track bureaucratic approvals by expediting permits.",
				AbilityCategory.Construction,
				[{ type: "flunds", amount: 30 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 20, "Skip bureaucratic delays"),
					new StatEffect(EffectTargetType.Reputation, -5, "Slight reputation hit")
				],
				EconomicPhase.Early,
				1,
				false
			),
			new PropertyAbility("bulk_material_orders", "Unleash Wholesale Hoarding", "Discounted materials through bulk material orders.",
				AbilityCategory.Construction,
				[{ type: "flunds", amount: 20 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 35, "Accelerated construction from bulk materials"),
					new AreaEffect(EffectType.BusinessPresence, 0.05, "Creates business presence")
				],
				EconomicPhase.Early,
			),
			new PropertyAbility("community_support", "Kidnap Willing Volunteers", "The local community assists with construction... for free!",
				AbilityCategory.Construction,
				[{ type: "lumber", amount: 1 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 15, "Community effort boosts progress"),
					new StatEffect(EffectTargetType.Reputation, 10, "Reputation boost from community involvement")
				],
				EconomicPhase.Early,
			),
			new PropertyAbility("prefab_assembly", "Activate Hex Wrench Revenge Mode", "Factory-made prefabs for rapid construction.",
				AbilityCategory.Construction,
				[{ type: "steel", amount: 1 }, { type: "concrete", amount: 1 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 40, "Rapid assembly progress"),
					new StatEffect(EffectTargetType.AppealPoints, -20, "Reduces uniqueness appeal")
				],
				EconomicPhase.Early,
			),
			new PropertyAbility("night_shift_construction", "Awaken Vampire Contractors", "Round-the-clock building construction operations.",
				AbilityCategory.Construction,
				[{ type: "flunds", amount: 35 }, { type: "electronics", amount: 1 }],
				[
					new StatEffect(EffectTargetType.ConstructionProgress, 50, "Greatly accelerated construction timeline"),
					new AreaEffect(EffectType.Noise, 0.1, "Creates major nighttime noise pollution"),
					new StatEffect(EffectTargetType.Reputation, -10, "Neighborhood complaints")
				],
				EconomicPhase.Early,
				2,
			),

			// 👥 TENANT ATTRACTION ABILITIES
			new PropertyAbility("professional_staging", "Install Fake Life Simulator", "Professional staging of high-end furnishings for family appeal.",
				AbilityCategory.TenantAttraction,
				[{ type: "furniture", amount: 1 }, { type: "textiles", amount: 2 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 40, "High appeal boost for families"),
					new AreaEffect(EffectType.Luxury, 0.05, "Creates luxury appeal")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("tech_showcase", "Seduce with Silicon Valley", "Modern amenities for young professionals at a tech showcase event.",
				AbilityCategory.TenantAttraction,
				[{ type: "electronics", amount: 1 }, { type: "apps", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 35, "Appeal boost for young professionals"),
					new AreaEffect(EffectType.Noise, 0.05, "Creates noise pollution")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("luxury_amenities", "Pamper Plutocrat Prospects", "Premium features for wealthy tenants--they love their luxury amenities.",
				AbilityCategory.TenantAttraction,
				[{ type: "gemstones", amount: 1 }, { type: "furniture", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 60, "High appeal for wealthy tenants"),
					new AreaEffect(EffectType.Luxury, 0.1, "Creates major luxury appeal"),
					new AreaEffect(EffectType.PettyCrime, 0.1, "Creates major petty crime risk")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("pet_friendly_setup", "Appease Furry Overlords", "Accommodations for pet owners.",
				AbilityCategory.TenantAttraction,
				[{ type: "apples", amount: 2 }, { type: "toys", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 25, "Appeal boost for pet owners"),
					new AreaEffect(EffectType.Noise, 0.02, "Creates minor noise pollution")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("rooftop_garden", "Cast Vertical Veggie Voodoo", "Rooftop garden space for eco-conscious residents.",
				AbilityCategory.TenantAttraction,
				[{ type: "flunds", amount: 15 }, { type: "leafygreens", amount: 2 }, { type: "wood", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 30, "Appeal for eco-conscious tenants"),
					new AreaEffect(EffectType.GreenhouseGases, -0.02, "Minor greenhouse gas reduction"),
					new AreaEffect(EffectType.LandValue, 0.02, "Minor land value increase")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("coworking_space", "Establish Laptop Warrior Base", "Shared office for remote workers.",
				AbilityCategory.TenantAttraction,
				[{ type: "flunds", amount: 20 }, { type: "furniture", amount: 1 }, { type: "electronics", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 35, "Strong appeal for remote workers"),
					new AreaEffect(EffectType.BusinessValue, 0.02, "Creates minor business value"),
					new AreaEffect(EffectType.Education, 0.05, "Promotes learning")
				],
				EconomicPhase.Mid,
			),

			// 📱 MARKETING ABILITIES
			new PropertyAbility("premium_listing", "Advertise with Golden Toilets", "High-visibility property advertising with a premium listing.",
				AbilityCategory.Marketing,
				[{ type: "flunds", amount: 20 }, { type: "electronics", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 30, "Attract high-quality tenants"),
					new AreaEffect(EffectType.LandValue, 0.05, "Land value increase")
				],
				EconomicPhase.Late,
			),
			new PropertyAbility("social_media_campaign", "Deploy Digital Desperation", "Social media campaign for broad marketing reach.",
				AbilityCategory.Marketing, [{ type: "apps", amount: 1 }, { type: "flunds", amount: 10 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 25, "Broad appeal increase"),
					new StatEffect(EffectTargetType.Reputation, -5, "Slight reputation vulnerability")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("food_truck_event", "Summon Mobile Grease Traps", "Community event to attract attention the easy way--a food truck.",
				AbilityCategory.Marketing,
				[{ type: "poultry", amount: 1 }, { type: "flunds", amount: 10 }], //TODO: Maybe alternate costs--the ones that use meat could be LabGrownMeat or RedMeat or Poultry.
				[
					new StatEffect(EffectTargetType.AppealPoints, 40, "Massive appeal boost"), //TODO: "temporary" - have a second type of appeal and show it in the stat bar separately?
					new AreaEffect(EffectType.BusinessValue, 0.05, "Creates business presence"),
					new AreaEffect(EffectType.Noise, 0.05, "Creates noise pollution")
				],
				EconomicPhase.Mid,
				2,
			),
			new PropertyAbility("influencer_partnership", "Negotiate with Narcissists", "Celebrity endorsement for credibility--if an influencer counts.",
				AbilityCategory.Marketing,
				[{ type: "clothing", amount: 1 }, { type: "electronics", amount: 1 }],
				[
					new StatEffect(EffectTargetType.Reputation, 15, "Reputation boost"),
					new StatEffect(EffectTargetType.AppealPoints, 20, "Appeal increase")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("virtual_tours", "Project Holographic Hallucinations", "3D virtual tours showcase the property from afar.",
				AbilityCategory.Marketing,
				[{ type: "electronics", amount: 1 }, { type: "apps", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 25, "Attracts remote prospects"),
					new AreaEffect(EffectType.BusinessPresence, 0.02, "Creates minor business presence")
				],
				EconomicPhase.Late,
			),
			new PropertyAbility("referral_program", "Exploit Friendship Networks", "Tenant referral program for bringing friends.",
				AbilityCategory.Marketing,
				[{ type: "flunds", amount: 35 }, { type: "toys", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 25, "Word-of-mouth marketing boost"),
					new StatEffect(EffectTargetType.Reputation, 10, "Builds community reputation")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("billboard_campaign", "Erect Highway Eyesores", "High-visibility roadside billboards bring all the boys to the building.",
				AbilityCategory.Marketing,
				[{ type: "flunds", amount: 30 }, { type: "paper", amount: 2 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 20, "Modest appeal boost"),
					new AreaEffect(EffectType.Luxury, -0.02, "Creates minor visual pollution")
				],
				EconomicPhase.Late,
			),

			// 🤝 SOCIAL ENGINEERING ABILITIES
			new PropertyAbility("rumor_network", "Activate Gossip Goblins", "Build a rumor network via neighborhood connections.",
				AbilityCategory.SocialEngineering,
				[{ type: "flunds", amount: 20 }],
				[
					new StatEffect(EffectTargetType.Reputation, 20, "Build neighborhood reputation"),
					new AreaEffect(EffectType.OrganizedCrime, 0.05, "Increases organized crime")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("community_bbq", "Host Carnivorous Networking", "Neighborhood gathering for goodwill and good BBQ",
				AbilityCategory.SocialEngineering,
				[{ type: "poultry", amount: 1 }, { type: "redmeat", amount: 1 }], //TODO: Alternate cost: Poultry + LabGrownMeat.
				[
					new StatEffect(EffectTargetType.Reputation, 25, "Reputation boost"),
					new AreaEffect(EffectType.ParticulatePollution, 0.02, "Creates minor particulate pollution")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("charity_drive", "Generate Guilt-Induced Goodwill", "Community charity drive for positive image.",
				AbilityCategory.SocialEngineering,
				[{ type: "pharmaceuticals", amount: 1 }, { type: "clothing", amount: 1 }], //TODO: Alternate cost: 3 of either?
				[
					new StatEffect(EffectTargetType.Reputation, 30, "Strong reputation boost"),
					new AreaEffect(EffectType.BusinessValue, 0.02, "Creates minor business value")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("investor_dinner", "Launch Checkbook Charm Offensive", "Attract co-funding from partners via an investor dinner.",
				AbilityCategory.SocialEngineering,
				[{ type: "dairy", amount: 1 }, { type: "fish", amount: 1 }, { type: "flunds", amount: 10 }], //TODO: Alternate cost: PlantBasedDairy + LabGrownMeat + Flunds.
				[
					new StatEffect(EffectTargetType.Flunds, 25, "Attract co-funding"),
					new AreaEffect(EffectType.Luxury, 0.05, "Creates luxury appeal")
				],
				EconomicPhase.Late,
			),
			new PropertyAbility("local_business_partnerships", "Initiate Symbiosis Protocol", "Collaborate with neighborhood shops to form local business partnerships.",
				AbilityCategory.SocialEngineering,
				[{ type: "flunds", amount: 50 }],
				[
					new StatEffect(EffectTargetType.Reputation, 20, "Builds local business relationships"),
					new AreaEffect(EffectType.BusinessValue, 0.05, "Strengthens local economy"),
					new StatEffect(EffectTargetType.AppealPoints, 15, "Convenience appeal")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("neighborhood_watch", "Mobilize Curtain Twitchers", "Community safety initiative--the classic neighborhood watch.",
				AbilityCategory.SocialEngineering,
				[{ type: "electronics", amount: 1 }, { type: "flunds", amount: 15 }],
				[
					new StatEffect(EffectTargetType.Reputation, 20, "Safety reputation boost"),
					new AreaEffect(EffectType.PettyCrime, -0.05, "Petty crime reduction")
				],
				EconomicPhase.Mid,
			),
			new PropertyAbility("political_connections", "Execute Handshake Hustle", "Cultivate relationships with local politicians.",
				AbilityCategory.SocialEngineering,
				[{ type: "flunds", amount: 25 }, { type: "gemstones", amount: 1 }],
				[
					new StatEffect(EffectTargetType.Reputation, 15, "Political influence reputation"),
					new AreaEffect(EffectType.PublicTransport, 0.08, "Influence public transport development"),
					new AreaEffect(EffectType.OrganizedCrime, 0.05, "Attracts organized crime attention")
				],
				EconomicPhase.Late,
			),

			// 💰 FINANCIAL ABILITIES
			new PropertyAbility("move_in_incentives", "Set Tenant Trapping Treats", "Guaranteed tenant applications via move-in incentives.",
				AbilityCategory.Financial,
				[{ type: "flunds", amount: 30 }],
				[new StatEffect(EffectTargetType.AppealPoints, 20, "Guaranteed tenant applications")],
				EconomicPhase.Late,
			),
			new PropertyAbility("utility_subsidies", "Activate Bill-Paying Benevolence", "Cover some tenant utility costs with subsidies.",
				AbilityCategory.Financial,
				[{ type: "batteries", amount: 1 }, { type: "flunds", amount: 20 }],
				[new StatEffect(EffectTargetType.AppealPoints, 35, "Higher appeal through subsidies")],
				EconomicPhase.Late,
			),
			new PropertyAbility("renovation_loans", "Procure Future Poverty", "Borrow against future profits with renovation loans.",
				AbilityCategory.Financial,
				[],
				[new StatEffect(EffectTargetType.Flunds, AppealEstate.LOAN_AMOUNT, `Immediate funding, but pay it back with ${humanizeCeil(100 * (AppealEstate.LOAN_REPAYMENT_COST - 1) / AppealEstate.LOAN_AMOUNT)}% interest after 3 turns`)],
				EconomicPhase.Late,
			),
			new PropertyAbility("insurance_partnerships", "Negotiate Disaster Discounts", "Reduced tenant costs through insurance partnerships.",
				AbilityCategory.Financial,
				[{ type: "flunds", amount: 20 }, { type: "paper", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 15, "Financial appeal for tenants"),
					new AreaEffect(EffectType.FireProtection, 0.05, "Improved fire safety measures")
				],
				EconomicPhase.Late,
			),
			new PropertyAbility("cryptocurrency_payments", "Accept Board Game Money", "Accept digital currency rent payments.",
				AbilityCategory.Financial,
				[{ type: "electronics", amount: 1 }, { type: "apps", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 10, "Appeals to tech-savvy tenants"),
					new StatEffect(EffectTargetType.Flunds, 15, "Highly volatile appreciation gains"),
					new StatEffect(EffectTargetType.Reputation, -5, "Regulatory uncertainty risk")
				],
				EconomicPhase.Late,
			),
			new PropertyAbility("security_system", "Install Big Brother's Blessing", "Security system featuring advanced surveillance and access control.",
				AbilityCategory.Financial,
				[{ type: "electronics", amount: 2 }, { type: "steel", amount: 1 }],
				[
					new StatEffect(EffectTargetType.AppealPoints, 30, "Safety appeal for tenants"),
					new AreaEffect(EffectType.PettyCrime, -0.1, "Major reduction to petty crime")
				],
				EconomicPhase.Mid,
			),

		];
	}

	private initializeCombos(): void {
		this.comboBonuses = [
			// CONSTRUCTION SYNERGIES
			{
				id: 0,
				abilityIds: ["blueprint_refinement", "crane_operations"],
				name: "Optimized Construction",
				description: "Efficient planning reduces crane noise",
				bonusEffects: [
					new StatEffect(EffectTargetType.ConstructionProgress, 20, "Construction progress"),
					new AreaEffect(EffectType.Noise, -0.03, "Reduces noise pollution")
				]
			},
			{
				id: 1,
				abilityIds: ["material_delivery", "permit_expediting"],
				name: "Streamlined Process",
				description: "Fast permits eliminate delivery delays",
				bonusEffects: [
					new StatEffect(EffectTargetType.ConstructionProgress, 15, "Eliminates bureaucratic delays"),
					new StatEffect(EffectTargetType.Reputation, 5, "Removes reputation hit")
				]
			},
			{
				id: 2,
				abilityIds: ["bulk_material_orders", "blueprint_refinement"],
				name: "Cost-Effective Planning",
				description: "Bulk orders enhance blueprint efficiency",
				bonusEffects: [
					new StatEffect(EffectTargetType.Flunds, 20, "Additional material savings")
				]
			},
			{
				id: 3,
				abilityIds: ["night_shift_construction", "crane_operations"],
				name: "24/7 Heavy Construction",
				description: "Round-the-clock heavy machinery maximizes progress",
				bonusEffects: [
					new StatEffect(EffectTargetType.ConstructionProgress, 30, "Maximum construction efficiency"),
					new AreaEffect(EffectType.Noise, 0.05, "Additional noise from constant operations")
				]
			},

			// MARKETING SYNERGIES
			{
				id: 4,
				abilityIds: ["social_media_campaign", "influencer_partnership"],
				name: "Viral Marketing",
				description: "Influencer amplifies social media reach",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 15, "Viral effect increases reputation gain"),
					new StatEffect(EffectTargetType.AppealPoints, 10, "Extended reach")
				]
			},
			{
				id: 5,
				abilityIds: ["food_truck_event", "community_bbq"],
				name: "Festival Atmosphere",
				description: "Combined events create community celebration",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 30, "Massive appeal boost"), //TODO: Temporary??
					new StatEffect(EffectTargetType.Reputation, 10, "Community goodwill")
				]
			},
			{
				id: 6,
				abilityIds: ["premium_listing", "professional_staging"],
				name: "Model Home Effect",
				description: "Perfect staging with premium marketing",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 25, "Attracts premium tenants instantly")
				]
			},
			{
				id: 7,
				abilityIds: ["billboard_campaign", "premium_listing"],
				name: "Total Market Saturation",
				description: "Combined advertising dominates all channels",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 30, "Omnipresent marketing appeal"),
					new AreaEffect(EffectType.Luxury, 0.02, "Offsets visual pollution with visibility")
				]
			},
			{
				id: 8,
				abilityIds: ["referral_program", "community_bbq"],
				name: "Word-of-Mouth Network",
				description: "BBQ guests become referral advocates",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 15, "Organic referral growth"),
					new StatEffect(EffectTargetType.Reputation, 10, "Authentic community endorsement")
				]
			},
			{
				id: 9,
				abilityIds: ["influencer_partnership", "virtual_tours"],
				name: "Celebrity Showcase",
				description: "Influencers create premium virtual content",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 10, "Celebrity-endorsed virtual experience"),
					new StatEffect(EffectTargetType.Reputation, 10, "Enhanced credibility from quality content")
				]
			},

			// SOCIAL ENGINEERING SYNERGIES
			{
				id: 10,
				abilityIds: ["charity_drive", "rumor_network"],
				name: "Community Champion",
				description: "Charity work spreads through network",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 20, "Positive reputation spreads faster")
				]
			},
			{
				id: 11,
				abilityIds: ["community_bbq", "investor_dinner"],
				name: "Networking Event",
				description: "BBQ attracts multiple investors",
				bonusEffects: [
					new StatEffect(EffectTargetType.Flunds, 40, "Attracts multiple investors")
				]
			},
			{
				id: 12,
				abilityIds: ["local_business_partnerships", "neighborhood_watch"],
				name: "Community Alliance",
				description: "Business partnerships strengthen neighborhood watch",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 15, "Strong community leadership"),
					new AreaEffect(EffectType.BusinessPresence, 0.05, "Additional business presence")
				]
			},
			{
				id: 13,
				abilityIds: ["political_connections", "local_business_partnerships"],
				name: "Economic Development Coalition",
				description: "Political influence accelerates business growth",
				bonusEffects: [
					new AreaEffect(EffectType.BusinessValue, 0.05, "Business value boost"),
					new AreaEffect(EffectType.LandValue, 0.02, "Minor increased land value")
				]
			},
			{
				id: 14,
				abilityIds: ["rumor_network", "political_connections"],
				name: "Information Broker",
				description: "Neighborhood intel enhances political influence",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 10, "Well-connected community insider"),
					new AreaEffect(EffectType.OrganizedCrime, -0.02, "Minor organized crime reduction through information")
				]
			},
			{
				id: 15,
				abilityIds: ["charity_drive", "local_business_partnerships"],
				name: "Community Stewardship",
				description: "Charity work strengthens business relationships",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 20, "Respected community leader"),
					new AreaEffect(EffectType.BusinessValue, 0.05, "Charitable business network boost")
				]
			},

			// FINANCIAL SYNERGIES
			{
				id: 16,
				abilityIds: ["renovation_loans", "crane_operations"],
				name: "Debt Leveraging",
				description: "Borrowed funds maximize construction impact",
				bonusEffects: [
					new StatEffect(EffectTargetType.ConstructionProgress, 25, "Construction progress from leveraging")
				]
			},
			{
				id: 17,
				abilityIds: ["move_in_incentives", "utility_subsidies"],
				name: "Complete Package",
				description: "Combined incentives eliminate future expectations",
				bonusEffects: [
					new StatEffect(EffectTargetType.Flunds, 20, "Eliminates future cost expectations")
				]
			},
			{
				id: 18,
				abilityIds: ["insurance_partnerships", "security_system"],
				name: "Comprehensive Safety Package",
				description: "Security systems earn insurance discounts",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 15, "Complete peace of mind"),
					new StatEffect(EffectTargetType.Flunds, 10, "Insurance cost savings")
				]
			},

			// CROSS-CATEGORY SYNERGIES
			{
				id: 19,
				abilityIds: ["tech_showcase", "social_media_campaign"],
				name: "Tech-Savvy Marketing",
				description: "Tech audience amplifies online presence",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 20, "Tech-savvy audience engagement")
				]
			},
			{
				id: 20,
				abilityIds: ["luxury_amenities", "investor_dinner"],
				name: "Luxury Networking",
				description: "Luxury setting impresses investors",
				bonusEffects: [
					new StatEffect(EffectTargetType.Flunds, 50, "Reduced co-funding requirements")
				]
			},
			{
				id: 21,
				abilityIds: ["pet_friendly_setup", "charity_drive"],
				name: "Animal Welfare Advocate",
				description: "Pet-friendly charity work boosts reputation",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 15, "Animal welfare angle boosts community reputation")
				]
			},
			{
				id: 22,
				abilityIds: ["cryptocurrency_payments", "tech_showcase"],
				name: "Tech-Forward Property",
				description: "Crypto payments perfectly complement tech amenities",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 10, "Attracts tech early adopters"),
					new StatEffect(EffectTargetType.Reputation, 5, "Reduces regulatory uncertainty perception")
				]
			},
			{
				id: 23,
				abilityIds: ["coworking_space", "virtual_tours"],
				name: "Remote Work Hub",
				description: "Virtual tours highlight coworking amenities",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 15, "Perfect remote work positioning"),
					new AreaEffect(EffectType.Education, 0.02, "Additional learning environment boost")
				]
			},
			{
				id: 24,
				abilityIds: ["rooftop_garden", "community_bbq"],
				name: "Garden-to-Table Community",
				description: "Fresh garden produce enhances BBQ events",
				bonusEffects: [
					new StatEffect(EffectTargetType.Reputation, 10, "Sustainable community living"),
					new AreaEffect(EffectType.Luxury, 0.05, "Luxury boost from the fragrance")
				]
			},
			{
				id: 25,
				abilityIds: ["security_system", "luxury_amenities"],
				name: "Secure Luxury Living",
				description: "Security systems protect high-value amenities",
				bonusEffects: [
					new StatEffect(EffectTargetType.AppealPoints, 10, "Premium security appeal"),
					new AreaEffect(EffectType.PettyCrime, -0.05, "Additional crime deterrent from visible luxury protection")
				]
			},
		];
	}

	private toggleRules(): void {
		this.howToPlayShown = !this.howToPlayShown;
		this.scroller.resetScroll();
	}

	public onResize(): void {
		this.scroller.onResize();
	}

	public asDrawable(): Drawable {
		if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

		const mainDrawable = new Drawable({
			width: "100%",
			height: "100%",
			fallbackColor: '#222222',
			onDrag: (x: number, y: number) => { if (this.gameStarted || this.howToPlayShown) this.scroller.handleDrag(y, mainDrawable.screenArea); },
			onDragEnd: () => { if (this.gameStarted || this.howToPlayShown) this.scroller.resetDrag(); },
		});

		if (!this.gameStarted) {
			this.drawStartOverlay(mainDrawable);
			if (!this.howToPlayShown) this.drawCloseButton(mainDrawable);
		} else {
			this.drawGameArea(mainDrawable);
		}
		if (this.endReason) this.drawEndGameOverlay(mainDrawable);

		this.lastDrawable = mainDrawable;
		return mainDrawable;
	}

	public getLastDrawable(): Drawable | null {
		return this.lastDrawable;
	}

	private drawStartOverlay(parent: Drawable): void {
		const overlay = parent.addChild(new Drawable({
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
			text: "Appeal Estate",
		}));
		nextY += 134;

		const canUpgrade = this.building && this.city!.residenceSpawner.getWillUpgrade(this.building);
		const startButton = overlay.addChild(new Drawable({
			anchors: ['centerX'],
			centerOnOwnX: true,
			y: nextY,
			width: canUpgrade ? "220px" : "500px",
			height: "48px",
			fallbackColor: '#444444',
			onClick: canUpgrade ? () => this.startGame() : undefined,
			children: [
				new Drawable({
					anchors: ["centerX"],
					y: 5,
					width: "calc(100% - 10px)",
					height: "100%",
					text: canUpgrade ? "Start Game" :
						this.building?.type === getBuildingType(Skyscraper) ? "Building reached max level" : "Building cannot upgrade right now",
					centerOnOwnX: true,
					reddize: !canUpgrade
				})
			]
		}));

		const unaffordable = !this.city.hasResources(this.getCosts(), false);
		addResourceCosts(startButton, this.getCosts(), 82 + (canUpgrade ? 0 : (500 - 220) / 2), 58, false, false, false, 48, 10, 32, undefined, undefined, unaffordable, this.city);
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

		//TODO: Draw a "select next <applicable> building" button like Altitect

		// Draw winnings/results if available
		if (this.winnings && (this.winnings.upgraded || this.winnings.areaEffects.length > 0)) {
			let resultY = nextY;
			const resultsArea = overlay.addChild(new Drawable({
				anchors: ['centerX'],
				centerOnOwnX: true,
				y: resultY,
				width: "min(100%, 600px)",
				fallbackColor: '#444444',
				id: "winningsArea"
			}));

			let innerY = 10;
			// Upgrade result
			resultsArea.addChild(new Drawable({
				anchors: ['centerX'],
				centerOnOwnX: true,
				y: innerY,
				width: "calc(100% - 40px)",
				height: "32px",
				text: this.winnings.upgraded
					? "Building upgraded successfully!"
					: "Building was not upgraded.",
			}));
			innerY += 40;

			// Area effects header
			if (this.winnings.areaEffects.length > 0) {
				resultsArea.addChild(new Drawable({
					anchors: ['centerX'],
					centerOnOwnX: true,
					y: innerY,
					width: "calc(100% - 40px)",
					height: "32px",
					text: `Local effects for ${longTicksToDaysAndHours(AppealEstate.AREA_EFFECT_LONG_TICKS)}:`,
				}));
				innerY += 40;

				// List effects, two columns like Altitect
				this.winnings.areaEffects.forEach((w, i) => {
					const icon = resultsArea.addChild(new Drawable({
						anchors: [i % 2 === 0 ? 'left' : 'centerX'],
						x: i % 2 === 0 ? 10 : 0,
						y: innerY,
						width: "48px",
						height: "48px",
						keepParentWidth: true,
						image: new TextureInfo(64, 64, "ui/" + EffectType[w.type].toLowerCase()),
					}));
					icon.addChild(new Drawable({
						x: 58,
						y: 10,
						width: "calc(50% - 78px)",
						height: "36px",
						text: `${w.value >= 0 ? "+" : ""}${w.value}${EffectType[w.type].replace(/([A-Z])/g, ' $1')}`,
					}));
					if (i % 2 === 1 || i === this.winnings!.areaEffects.length - 1) innerY += 58;
				});
				innerY += 10;
			}

			resultsArea.height = innerY + 10 + "px";
			nextY += innerY + 20;
		}

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
			text: "Appeal Estate Rules",
		}));

		root.onClick = () => this.toggleRules();

		let nextY = 80 - this.scroller.getScroll();

		//TODO: May include other info like the specific abilities and discovered combos.
		const rules = "Your goal is to upgrade a residential building by meeting one of three victory conditions: complete Construction, max out both Appeal and Reputation, or reach the Tenant Value threshold.";
		parent = parent.addChild(new Drawable({
			x: 10, y: nextY, width: "calc(100% - 20px)", wordWrap: true, height: "40px",
			text: rules, keepParentWidth: true,
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "You will be presented with a set of " + AppealEstate.ABILITIES_PER_TURN + " abilities at the start. Using an ability costs resources from your city and has various effects on the minigame and the area around the building in the main game.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -50,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "- Construction Progress: How close the building is to being physically complete.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -50,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "- Appeal Points: How desirable the property is. High appeal attracts more tenant applications.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -50,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "- Reputation: Higher reputation means stronger positive effects from social and marketing abilities.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "The ability you use or bank each turn will be replaced by a new one, so you always have the same number of abilities to pick from.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "Phases: The game has three economic phases (Early, Mid, Late) where certain ability categories are " + (100 * AppealEstate.PHASE_MATCH_BONUS).toFixed(0) + "% more effective. However, after that, you reach the Behind Schedule phase, where all costs increase " + (100 * AppealEstate.BEHIND_SCHEDULE_PENALTY).toFixed(0) + "%.",
		}));
		//TODO: Draw BANK button
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "Banking: You can 'Bank' one ability to use on a later turn, but you must pay the cost immediately. Be careful! If you don't use it within 4 turns, it will auto-execute at 50% effectiveness. Then again, that might be what you want, if its negative effects don't appeal to you.",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "Combos: Using certain abilities consecutively can trigger powerful bonus effects. Experiment to discover them!",
		}));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: `Tenants: Some tenants require higher Reputation, but all require Appeal. Some also have negative effects, similar to abilities. Rejecting them usually costs ${AppealEstate.DEFAULT_REJECTION_PENALTY} Reputation, and using an ability auto-rejects any remaining tenant applications.`,
        }));
		parent = parent.addChild(new Drawable({
			anchors: ['bottom'],
			y: -60,
			width: "calc(100% - 40px)",
			height: "40px",
			wordWrap: true,
			keepParentWidth: true,
			text: "The game ends when you achieve a victory condition or if you can no longer afford any of the available actions.",
		}));

		this.scroller.setChildrenSize(1680); // Estimate height for scrolling
	}

	private drawGameArea(parent: Drawable): void {
		const gameArea = parent.addChild(new Drawable({
			anchors: ['centerX'],
			width: "min(100%, 600px)",
			height: "100%",
			fallbackColor: '#333333',
			id: "gameArea",
			centerOnOwnX: true
		}));

		const baseY = 10 - this.scroller.getScroll();
		let nextY = baseY;

		nextY = this.drawDashboard(gameArea, nextY);
		nextY = this.drawLastComboArea(gameArea, nextY);
		nextY = this.drawLastUsedAbilityArea(gameArea, nextY);
		nextY = this.drawBankedAbilityArea(gameArea, nextY);
		nextY = this.drawAbilitiesArea(gameArea, nextY);
		nextY = this.drawTenantArea(gameArea, nextY);
		nextY = this.drawDiscoveredCombos(gameArea, nextY);

		this.scroller.setChildrenSize(nextY - baseY + 40);
	}

	private drawDashboard(parent: Drawable, y: number): number {
		const container = parent.addChild(new Drawable({
			x: 10, y: y, width: "calc(100% - 20px)", fallbackColor: "#222222"
		}));
		let nextY = 10;

		container.addChild(new Drawable({ x: 10, y: nextY, text: `Turn: ${this.state.currentTurn} (${this.state.economicPhase})`, height: "18px" }));
		nextY += 25;

		nextY = this.drawResourceBar(container, 10, nextY, "Construction", this.state.constructionProgress, this.state.constructionThreshold, "#FFA500");
		nextY = this.drawResourceBar(container, 10, nextY, "Appeal", this.state.appealPoints, this.state.appealThreshold, "#FFC0CB");
		nextY = this.drawResourceBar(container, 10, nextY, "Reputation", this.state.reputation, AppealEstate.REPUTATION_MAX, "#ADD8E6");
		nextY = this.drawResourceBar(container, 10, nextY, "Tenants", this.getTotalTenantValue(), this.state.tenantValueThreshold, "#90EE90");

		container.height = (nextY + 5) + "px";
		return y + nextY + 15;
	}

	private drawResourceBar(parent: Drawable, x: number, y: number, label: string, current: number, max: number, color: string): number {
		const progress = Math.min(1, max > 0 ? current / max : 0);
		parent.addChild(new Drawable({
			x: x, y: y, text: `${label}: ${humanizeFloor(current)} / ${humanizeFloor(max)}`, height: "16px"
		}));
		parent.addChild(new Drawable({
			x: x, y: y + 18, width: "calc(100% - 20px)", height: "10px", fallbackColor: "#111111",
			children: [new Drawable({ width: "100%", height: "100%", clipWidth: progress, fallbackColor: color })]
		}));
		return y + 35;
	}

	private drawLastComboArea(parent: Drawable, y: number): number {
		if (!this.state.lastTriggeredCombo) return y;

		const combo = this.state.lastTriggeredCombo;
		const container = parent.addChild(new Drawable({
			x: 10, y: y, width: "calc(100% - 20px)", fallbackColor: "#d4af3733" // Gold-ish transparent background
		}));

		let innerY = 10;
		container.addChild(new Drawable({ x: 10, y: innerY, text: `${this.state.lastTriggeredComboWasNew ? '🌈 New! ' : ''}Combo bonus! ${combo.name}`, height: "20px" }));
		innerY += 25;

		container.addChild(new Drawable({ x: 10, y: innerY, width: "calc(100% - 20px)", text: combo.description, height: "16px", wordWrap: true, keepParentWidth: true }));
		innerY += 35;

		combo.bonusEffects.forEach(effect => {
			if (effect instanceof StatEffect) {
				const text = `${effect.value >= 0 ? '+' : ''}${effect.value} ${effect.type.replace(/_/g, ' ')}`;
				container.addChild(new Drawable({ x: 10, y: innerY, text: text, height: "16px" }));
				innerY += 20;
			} else if (effect instanceof AreaEffect) {
				const text = `${effect.value >= 0 ? '+' : ''}${effect.value} ${EffectType[effect.type].replace(/_/g, ' ')}`;
				container.addChild(new Drawable({
					x: 10, y: innerY, text: text, height: "16px", reddize: this.isNegativeEffectType(effect)
				}));
				innerY += 20;
			}
		});

		container.height = (innerY + 5) + "px";
		return y + innerY + 15;
	}

	private drawLastUsedAbilityArea(parent: Drawable, y: number): number {
		if (!this.state.lastUsedAbility) return y;

		parent.addChild(new Drawable({ x: 10, y: y, text: "Last Used Ability", height: "20px" }));
		const container = parent.addChild(new Drawable({
			x: 10, y: y + 25, width: "calc(100% - 20px)", height: `60px`, fallbackColor: "#222222"
		}));

		const ability = this.state.lastUsedAbility; //TODO: Do we want to show the last TWO used abilities if a banked one executed the same turn? Probz
		container.addChild(new Drawable({ x: 5, y: 5, text: ability.name, height: "20px" }));
		container.addChild(new Drawable({ x: 5, y: 30, width: "calc(140% - 10px)", text: ability.description, height: "16px", wordWrap: true, keepParentWidth: true }));

		return y + 25 + 60 + 10;
	}

	private drawBankedAbilityArea(parent: Drawable, y: number): number {
		parent.addChild(new Drawable({ x: 10, y: y, text: "Banked Ability", height: "20px" }));
		const container = parent.addChild(new Drawable({
			x: 10, y: y + 25, width: "calc(100% - 20px)", fallbackColor: "#222222"
		}));

		let containerHeight = 32;
		if (this.state.bankedAbility) {
			const card = this.drawAbilityCard(container, this.state.bankedAbility, -1, 10, 10, true, true);
			const finalCardHeight = parseInt(card.height!.replace("px", "")) + 20;
			card.height = `${finalCardHeight}px`;
			const turnsLeftText = this.state.bankedTurnsRemaining > 1 ?
				`Auto-executes in ${this.state.bankedTurnsRemaining} turns. Tap Execute to use it now.` :
				`Auto-executes at 50% effectiveness next turn! Use it or lose half of it!`;
			card.addChild(new Drawable({ anchors: ["bottom"], x: 5, y: 30, text: turnsLeftText, height: "15px", reddize: this.state.bankedTurnsRemaining === 1 }));

			containerHeight = finalCardHeight + 20;
		} else {
			container.addChild(new Drawable({ x: 10, y: 10, text: "No ability banked. Tap 'Bank' on an eligible ability.", height: "18px" }));
		}

		container.height = `${containerHeight}px`;
		return y + 25 + containerHeight + 20;
	}

	private drawAbilitiesArea(parent: Drawable, y: number): number {
		parent.addChild(new Drawable({ x: 10, y: y, text: "Available Abilities", height: "20px" }));
		y += 25;

		if (this.state.availableAbilities.length === 0) {
			const container = parent.addChild(new Drawable({ x: 10, y: y, width: "calc(100% - 20px)", height: "50px", fallbackColor: "#222222" }));
			container.addChild(new Drawable({ x: 10, y: 10, text: "No abilities available.", fallbackColor: "#888888", height: "18px" }));
			return y + 50 + 10;
		}

		const container = parent.addChild(new Drawable({
			x: 10, y: y, width: "calc(100% - 20px)", fallbackColor: "#222222"
		}));

		let cardY = 10;
		this.state.availableAbilities.forEach((ability, index) => {
			const isExpanded = this.state.expandedAbilityIndex === index;
			const card = this.drawAbilityCard(container, ability, index, 10, cardY, isExpanded, false);
			cardY += parseInt(card.height!.replace("px", "")) + 10;
		});

		container.height = `${cardY}px`;
		return y + cardY + 10;
	}

	private isNegativeEffectType(effect: AreaEffect): boolean {
		return NEGATIVE_EFFECT_TYPES.has(effect.type) === effect.value > 0;
	}

	private drawAbilityCard(parent: Drawable, ability: PropertyAbility, index: number, x: number, y: number, isExpanded: boolean, isBanked: boolean): Drawable {
		const isAffordable = this.isAbilityAffordable(ability);

		const card = parent.addChild(new Drawable({
			x: x, y: y, width: `calc(100% - 20px)`, fallbackColor: "#333333",
			onClick: () => { this.state.expandedAbilityIndex = isExpanded ? null : index; },
			grayscale: !isAffordable,
		}));

		let nextY = 5;
		//TODO: Ability icon to the left of the name
		const potentialCombo = this.hasPotentialComboToDisplay(ability);
		if (potentialCombo) card.addChild(new Drawable({ x: 5, y: nextY, text: '✨', width: '20px', height: "24px" }));
		card.addChild(new Drawable({ x: potentialCombo ? 25 : 5, y: nextY, text: ability.name, height: "20px" }));
		//TODO: Maybe ability category icon at the right
		//card.addChild(new Drawable({ x: 5, y: nextY, text: `(${ability.category})`, height: "18px", rightAlign: true, width: "calc(100% - 10px)" }));
		nextY += 25;

		if (!isBanked) {
			const phaseCostMultiplier = this.getPhaseCostMultiplier(ability);
			const finalCosts = ability.resourceCosts.map(p => ({ type: p.type, amount: p.amount * phaseCostMultiplier }));
			if (finalCosts.length) {
				addResourceCosts(card, finalCosts, 10, nextY, false, false, false, 40, 6, 24, undefined, undefined, !isAffordable, this.city);
				nextY += 70; // Space after costs
			} else {
				card.addChild(new Drawable({ x: 10, y: nextY, text: "Free!", height: "18px", fallbackColor: "#888888" }));
				nextY += 30;
			}
		}

		if (isExpanded) {
			//TODO: Word wrap is bugged for text smaller than 24px (the base rendered font size) so we set the width to 140% for 16px font.
			card.addChild(new Drawable({ x: 5, y: nextY, width: "calc(140% - 10px)", text: ability.description, height: "16px", wordWrap: true, keepParentWidth: true }));
			nextY += 35;

			const buffStrength = this.getPhaseMultiplier(ability); // Don't forget to show the ACTUAL effect
			const statEffects = ability.effects.filter(p => p instanceof StatEffect);
			const colCount = 3;
			const colWidth = "30%";
			const colAnchors: Anchor[][] = [['left'], ['centerX'], ['right']];
			const colXs = [5, undefined, 5]; // left column x, centerX handled by anchor, right column handled by anchor and x
			const colCenterSelfs = [false, true, false];
			let maxColHeight = 0;
			for (let col = 0; col < colCount; col++) {
				const colEffects = statEffects.filter((_, i) => i % colCount === col);
				if (colEffects.length === 0) continue;
				let colHeight = 0;
				colEffects.forEach(e => {
					const reddize = e.value < 0; // All stat effects are positive, so negative values should be reddized
					let text = `${e.value >= 0 ? '+' : ''}${humanizeFloor(e.value * (reddize ? 1 : buffStrength))} ${e.type.replace(/_/g, ' ')}`;
					if (ability.id === 'cryptocurrency_payments' && e.type === EffectTargetType.Flunds) {
						text = `${AppealEstate.CRYPTOCURRENCY_MIN_VALUATION} to ${AppealEstate.CRYPTOCURRENCY_MAX_VALUATION} flunds`;
					}
					card.addChild(new Drawable({
						anchors: colAnchors[col], x: colXs[col], y: nextY + colHeight,
						width: colWidth, height: "16px", centerOnOwnX: colCenterSelfs[col],
						text, reddize
					}));
					colHeight += 20;
					if (colHeight > maxColHeight) maxColHeight = colHeight;
				});
			}
			nextY += maxColHeight;

			// Split area effects into 3 columns //TODO: if columns don't look nice, revert to a single column.
			const areaEffects = ability.effects.filter(p => p instanceof AreaEffect);
			maxColHeight = 0;
			for (let col = 0; col < colCount; col++) {
				const colEffects = areaEffects.filter((_, i) => i % colCount === col);
				if (colEffects.length === 0) continue;
				let colHeight = 0;
				colEffects.forEach(e => {
					const reddize = this.isNegativeEffectType(e); //bad type and positive sign, or good type and negative sign
					const text = `${e.value >= 0 ? '+' : ''}${humanizeFloor(e.value * (reddize ? 1 : buffStrength))}${EffectType[e.type].replace(/([A-Z])/g, ' $1')}`;
					card.addChild(new Drawable({
						anchors: colAnchors[col], x: colXs[col], y: nextY + colHeight,
						width: colWidth, height: "16px", centerOnOwnX: colCenterSelfs[col],
						text, reddize
					}));
					colHeight += 20;
					if (colHeight > maxColHeight) maxColHeight = colHeight;
				});
			}
			nextY += maxColHeight;

			const buttonX = 10;
			const buttonY = 5;
			card.addChild(new Drawable({
				anchors: ["bottom"], x: buttonX, y: buttonY, width: "100px", height: "20px", fallbackColor: isAffordable ? "#4CAF50" : "#555555",
				children: [new Drawable({ anchors: ["centerX"], centerOnOwnX: true, y: 5, text: "Execute", height: "16px" })],
				onClick: isAffordable ? isBanked ? () => this.handleExecuteBankedAbility() : () => this.handleAbilityClick(ability, index) : undefined,
			}));

			if (!isBanked && ability.canBank && !this.state.bankedAbility) {
				card.addChild(new Drawable({
					anchors: ["right", "bottom"], x: buttonX, y: buttonY, width: "100px", height: "20px", fallbackColor: isAffordable ? "#2196F3" : "#555555",
					children: [new Drawable({ anchors: ["centerX"], centerOnOwnX: true, y: 5, text: "Bank", height: "16px" })],
					onClick: isAffordable ? () => this.handleBankAbility(ability, index) : undefined,
				}));
			}
			nextY += 20;
		}

		card.height = (nextY + 10) + "px";
		return card;
	}

	private drawTenantArea(parent: Drawable, y: number): number {
		parent.addChild(new Drawable({ x: 10, y: y, text: "Tenant Applications", height: "20px" }));
		y += 25;

		if (this.state.tenantApplications.length === 0) {
			const container = parent.addChild(new Drawable({ x: 10, y: y, width: "calc(100% - 20px)", height: "50px", fallbackColor: "#222222" }));
			container.addChild(new Drawable({ x: 10, y: 10, text: "No new applications. Keep using abilities to find more.", height: "18px" }));
			return y + 50 + 10;
		}

		const container = parent.addChild(new Drawable({
			x: 10, y: y, width: "calc(100% - 20px)", fallbackColor: "#222222"
		}));

		let totalHeight = 10;
		this.state.tenantApplications.forEach(tenant => {
			const card = this.drawTenantCard(container, tenant, 10, totalHeight);
			totalHeight += parseInt(card.height!.replace('px', '')) + 10;
		});
		container.height = `${totalHeight}px`;

		return y + totalHeight + 10;
	}

	private drawTenantCard(parent: Drawable, tenant: TenantApplication, x: number, y: number): Drawable {
		const cardWidth = `calc(100% - 20px)`;

		const card = parent.addChild(new Drawable({
			x: x, y: y, width: cardWidth, fallbackColor: "#333333"
		}));

		let nextY = 5;
		card.addChild(new Drawable({ x: 5, y: nextY, text: `${tenant.name}`, height: "18px" }));
		nextY += 20;
		card.addChild(new Drawable({ x: 5, y: nextY, text: `+${tenant.value} value`, height: "16px" }));
		nextY += 20;

		if (tenant.sideEffects && tenant.sideEffects.length > 0) {
			tenant.sideEffects.forEach(effect => {
				card.addChild(new Drawable({ x: 5, y: nextY, width: "calc(100% - 10px)", text: effect.description, height: "16px" }));
				nextY += 20;
				const effectLine = card.addChild(new Drawable({ x: 15, y: nextY, height: "16px" }));
				if (effect instanceof StatEffect) {
					effectLine.text = `${effect.value} ${effect.type.replace(/_/g, ' ')}`;
					effectLine.reddize = effect.value < 0;
				} else if (effect instanceof AreaEffect) {
					effectLine.text = `${effect.value > 0 ? '+' : ''}${effect.value}${EffectType[effect.type].replace(/([A-Z])/g, ' $1')}`;
					effectLine.reddize = this.isNegativeEffectType(effect);
				}
				nextY += 20;
			});
		}

		card.addChild(new Drawable({
			anchors: ['bottom'], x: 5, y: 5, width: "80px", height: "24px", fallbackColor: "#4CAF50",
			children: [new Drawable({ anchors: ["centerX"], centerOnOwnX: true, y: 5, text: "Accept", height: "18px" })],
			onClick: () => this.handleAcceptTenant(tenant)
		}));

		card.addChild(new Drawable({
			anchors: ['bottom'], x: 90, y: 5, width: "80px", height: "24px", fallbackColor: "#f44336",
			children: [new Drawable({ anchors: ["centerX"], centerOnOwnX: true, y: 5, text: "Reject", height: "18px" })],
			onClick: () => this.handleRejectTenant(tenant)
		}));

		card.height = `${nextY + 35}px`;
		return card;
	}

	private drawDiscoveredCombos(parent: Drawable, y: number): number {
		if (this.state.discoveredCombos.length === 0) return y;

		parent.addChild(new Drawable({ x: 10, y: y, text: `${this.showCombos ? '▼' : '▶'} Discovered Combos`, height: "20px", onClick: () => { this.showCombos = !this.showCombos; }, }));
		y += 25;

		if (!this.showCombos) return y; // If collapsed, we're done here.

		const container = parent.addChild(new Drawable({
			x: 10, y: y, width: "calc(100% - 20px)", fallbackColor: "#222222", onClick: () => { this.showCombos = !this.showCombos; },
		}));

		let combosToDisplay;
		// Get all ability IDs that are currently relevant to the player
		const relevantAbilityIds = new Set(this.state.availableAbilities.map(a => a.id));
		if (this.state.bankedAbility) relevantAbilityIds.add(this.state.bankedAbility.id);
		if (this.state.lastUsedAbility) relevantAbilityIds.add(this.state.lastUsedAbility.id);
		if (this.showAllCombos) {
			combosToDisplay = this.state.discoveredCombos;
		} else {
			// Filter combos to only those containing at least one relevant ability
			combosToDisplay = this.state.discoveredCombos.filter(combo => combo.abilityIds.some((id: string) => relevantAbilityIds.has(id)));
		}

		combosToDisplay.sort((a, b) => {
			const aCount = a.abilityIds.filter(id => relevantAbilityIds.has(id)).length;
			const bCount = b.abilityIds.filter(id => relevantAbilityIds.has(id)).length;
			if (aCount !== bCount) return bCount - aCount; // Sort by count descending
			return a.name.localeCompare(b.name); // Then by name ascending
		});

		let comboY = 5;
		combosToDisplay.forEach(combo => {
			const textDrawable = container.addChild(new Drawable({
				x: 5, y: comboY, width: "calc(100% - 10px)", height: "20px",
				text: `⭐ ${combo.name}`,
			}));
			comboY += 24;

			//container.addChild(new Drawable({
			//	x: 5, y: comboY, width: "calc(100% - 10px)", height: "16px",
			//	text: combo.description,
			//}));
			//comboY += 20;

			for (const abilityId of combo.abilityIds) {
				const abilityName = this.getAbilityById(abilityId)?.name ?? "Bug!";
				container.addChild(new Drawable({ x: 30, y: comboY, width: "calc(100% - 40px)", text: abilityName, height: "18px", reddize: !relevantAbilityIds.has(abilityId) }));
				comboY += 20;
			}
			comboY += 4;
		});

		//Display "+ More to discover!" if there are more combos to be discovered (either in general or for the current ability choices).
		if (this.showAllCombos
			? combosToDisplay.length < this.state.discoveredCombos.length
			: combosToDisplay.length < this.comboBonuses.filter(c => c.abilityIds.some(id => relevantAbilityIds.has(id))).length) {
			container.addChild(new Drawable({
				x: 5, y: comboY, width: "calc(100% - 10px)", height: "20px",
				text: combosToDisplay.length > 0 ? "+ more to discover!" : this.showAllCombos ? "No combos discovered yet!" : "There are undiscovered combos for these!",
			}));
			comboY += 24;
		}

		container.addChild(new Drawable({
			anchors: ['centerX', 'bottom'],
			centerOnOwnX: true,
			y: 5,
			width: "280px",
			height: "48px",
			fallbackColor: '#00000000',
			onClick: () => { this.showAllCombos = !this.showAllCombos; },
			children: [
				new Drawable({
					x: 5,
					width: "48px",
					height: "48px",
					image: new TextureInfo(64, 64, this.showAllCombos ? "ui/checked" : "ui/unchecked"),
				}),
				new Drawable({
					anchors: ["right"],
					rightAlign: true,
					x: 5,
					y: 7,
					width: "calc(100% - 55px)",
					height: "100%",
					text: "Show All",
				}),
			]
		}));
		comboY += 60;

		container.height = `${comboY}px`;
		return y + comboY + 10;
	}

	private drawEndGameOverlay(parent: Drawable): void {
		parent.addChild(new Drawable({
			width: "100%",
			height: "100%",
			fallbackColor: '#00000077', // Darken the background because it's hard to tell that the game is over
		}));

		parent.addChild(new Drawable({
			anchors: ['centerX'],
			centerOnOwnX: true,
			y: 400,
			width: "min(400px, 100%)",
			height: "64px",
			fallbackColor: '#444444',
			children: [
				new Drawable({
					anchors: ['centerX'],
					centerOnOwnX: true,
					y: 12,
					width: "100%",
					height: "48px",
					text: this.endReason,
				})
			]
		}));
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

	public async preloadImages(): Promise<void> {
		if (this.preloaded) return;

		const urls: { [key: string]: string } = {
			// Image URLs will be defined when we create the actual ability assets
			//TODO: should have one per AbilityCategory, maybe EffectTargetType, TenantType, probably even EconomicPhase...and one per ability.
			//e.g., "minigame/aeempty": "assets/minigame/aeempty.png",
		};

		await this.uiManager.renderer.loadMoreSprites(this.city, urls);
		this.preloaded = true;
	}
}