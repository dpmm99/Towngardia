import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { Effect } from "../game/Effect.js";
import { Resource } from "../game/Resource.js";
import { CityEvent } from "../game/CityEvent.js";
import { TechManager } from "../game/TechManager.js";
import { Tech } from "../game/Tech.js";
import { Achievement } from "../game/Achievement.js";
import { BLOCKER_TYPES, BUILDING_TYPES } from "../game/BuildingTypes.js";
import { RESOURCE_TYPES } from "../game/ResourceTypes.js";
import { Player } from "../game/Player.js";
import { EVENT_TYPES, EconomicBoom } from "../game/EventTypes.js";
import { Notification } from "../game/Notification.js";
import { Budget } from "../game/Budget.js";
import { AchievementTypes, TitleTypes } from "../game/AchievementTypes.js";
import { TECH_TYPES } from "../game/TechTypes.js";
import { CityFlags } from "../game/CityFlags.js";
import { Assist } from "../game/Assist.js";

//Kinda knows about everything, even private/protected fields (typecast with <any> to access those)--I WANT them to be private so I don't assign directly to them normally, but on-save/load it's a *given* that they'll be accessed.
export class CitySerializer {
    city(o: City) {
        //Note: player IS NOT serialized as part of the city JSON; it should be stored in a separate column in the database.
        const r: any = {
            _v: o.dataVersion,
            bu: o.buildings.map(p => this.building(p)),
            ub: o.unplacedBuildings.map(p => this.building(p)),
            re: Array.from(o.resources).map(p => this.resource(p[1])), //Is a map, but the keys are repeats.
            ri: o.regionID,
            rv: o.regionVersion,
            dp: o.desiredPower, //That's me!
            cd: o.createdDate,
            no: o.notifications, //There are few, they're simple, and there will never be zero, so very simple serialization is fine.
            pc: o.lastImportedPowerCost,
            cs: o.recentConstructionResourcesSold,
            pp: o.peakPopulation,
            nb: o.nextBuildingID,
            eg: this.effectGrid(o.effectGrid),
            fl: [...o.flags.values()],
            id: o.id,
            na: o.name,
            wi: o.width,
            he: o.height,
            bt: o.buildingTypes.map(p => this.building(p, true)), //Building templates, different serialization than placed/unplaced buildings
            ev: o.events.map(p => this.event(p)), //Same as eventTypes--both are stateful
            et: o.eventTypes.map(p => this.event(p)),
            tm: this.techManager(o.techManager),
            bg: o.budget, //Doesn't need anything fancy--no constants or complex objects, just numbers and strings
            dc: o.citizenDietSystem.lastDietComposition,
            ti: this.titles(o.titles),
            gr: this.grid(o.grid), //COULD be recalculated; just need to have buildings in the correct order.
            lt: o.lastLongTick,
            st: o.lastShortTick,
            tf: o.timeFreeze || undefined,
            ts: o.tutorialStepIndex == -1 ? undefined : o.tutorialStepIndex,
            as: this.assists(o.assists),
            gc: o.residenceSpawner?.globalSpawnChance ?? undefined,
            hb: [...o.happinessBreakdown],
            hx: [...o.happinessMaxima],
            mo: [...o.minigameOptions],
            uo: [...o.unlockedMinigameOptions],
            tp: o.trafficPrecalculation,
            ru: o.roadUpkeepPrecalculation,
            la: o.lastUserActionTimestamp,
            ls: o.lastSavedUserActionTimestamp,
            ap: o.altitectPlays,
        };

        return r;
    }

    assists(o: Assist[]) {
        return o.map(p => ({
            ev: p.effect instanceof CityEvent ? this.event(p.effect) : undefined,
            st: p.startAt,
            pl: p.playerId, //Should be the originating player at this point
        }));
    }

    grid(o: (Building | null)[][]) {
        return o.map(row => row.map(cell => cell?.id || 0)); //assumes 0 is an invalid ID...which is a good assumption since City starts the IDs at 1.
    }

    titles(o: Map<string, Achievement>) {
        return Array.from(o.values()).map(p => ({
            id: p.id,
            at: p.attained || undefined,
            ad: p.attainedDate || undefined,
            lp: p.lastProgress || undefined,
            dp: p.attained ? undefined : p.dataPoints,
        }));
    }

    techManager(o: TechManager) {
        return {
            fv: o.lastFriendVisitDate,
            cd: o.lastResearchCompletionDates,
            te: this.techs(o.techs)
        };
    }

    techs(o: Map<string, Tech>) {
        return Array.from(o).map(p => this.tech(p[1]));
    }

    tech(o: Tech) {
        return {
            id: o.id,
            ar: o.adoptionRate,
            ag: o.adoptionGrowth, //affected by a title
            co: o.costs, //trivial serialization is fine, maybe just a bit wordy, but really unimportant
            re: o.researched || undefined,
            un: o.unavailable,
        };
    }

    event(o: CityEvent) {
        const ev = <any>{
            ty: o.type,
            ac: o.activations,
            du: o.duration,
            md: o.type === "tourismreward" ? o.maxDuration : undefined,
            pl: o.fromPlayer !== null ? o.fromPlayer : undefined,
            ss: o.skippedStarts,
            //Entirely possible that specific event subclasses could need other data stored.
            va: o.variables.length ? o.variables : undefined,
        };
        if (o instanceof EconomicBoom) ev.co = o.chosenOnes;
        return ev;
    }

    effectGrid(effects: Effect[][][]) {
        return effects.map(row => row.map(cell => cell.filter(effect => !effect.building).map(effect => this.effect(effect)))); //Only saving effects that DIDN'T come from a building
    }

    effect(o: Effect) {
        //this is the part that's basically impossible to serialize as-is because the effects have lambda functions.
        return {
            bi: o.building?.id || undefined,
            mu: o.multiplier !== 1 ? o.multiplier : undefined, //default is 1
            ty: o.type,
            dc: o.dynamicCalculation,
        }
    }

    resource(o: Resource) {
        return {
            ty: o.type,
            am: o.amount || undefined,
            ca: o.capacity || undefined,
            cr: o.consumptionRate || undefined,
            pr: o.productionRate || undefined,
            ab: o.autoBuyBelow || undefined,
            //ac: o.autoCollect, //Might be wanted if it's an upgrade; otherwise, only used in specific resource types as a whole
            as: o.autoSellAbove !== 1 ? o.autoSellAbove : undefined, //default is 1
            ba: o.buyableAmount, //likely to be equal to buyCapacity, not as likely to be any other specific number, not much point in trying to optimize it
            bc: o.buyCapacity, //could be calculated
            bm: o.buyPriceMultiplier !== 1 ? o.buyPriceMultiplier : undefined, //default is 1
            sm: o.sellPriceMultiplier !== 1 ? o.sellPriceMultiplier : undefined, //default is 1
            //buyPrice, sellPrice should never change.
        };
    }

    building(o: Building, isTemplate: boolean = false): any {
        //Fields that apply regardless of whether it's placed, unplaced, or a template
        const r: any = {
            ty: o.type,
            or: this.buildingResources(o.outputResources), //may only need 4 fields--type, capacity, amount, productionRate. Not for templates unless there was an upgrade
            ir: this.buildingResources(o.inputResources), //same, except consumptionRate
            bv: o.businessValue || undefined, //not for templates unless there was an upgrade
            bc: o.businessPatronCap || undefined, //not for templates unless there was an upgrade
            bf: o.businessFailed || undefined, //not for templates unless there was an upgrade
            fc: o.businessFailureCounter || undefined, //not for templates unless there was an upgrade
            pe: o.patronageEfficiency !== 1 ? o.patronageEfficiency : undefined, //not for templates unless there was an upgrade; defaults to 1 so we don't need to serialize it if it's 1
            sa: (<any>o).storeAmount || undefined,
            mo: o.mods.length ? o.mods : undefined, //Direct JSON serialization of these is fine
        };
        if (isTemplate) {
            //Fields that only apply to templates
            Object.assign(r, {
                lo: o.locked, //events unlock AND re-lock buildings, so not using '|| undefined' for this
                ih: o.isHidden || undefined, //only if true--COULD be determined by events instead currently
            });
        } else {
            //Fields that apply to everything EXCEPT templates
            Object.assign(r, {
                id: o.id || undefined, //MUST NOT have conflicts when saved, but MAY not matter for unplaced buildings
                ow: o.owned, //only needed if false, really, or even better, only for buildings that don't DEFAULT to this value of owned/unowned
                le: o.lastEfficiency || undefined,
                ue: o.upkeepEfficiency,
                pt: o.poweredTimeDuringLongTick || undefined,
                de: o.damagedEfficiency === 1 ? undefined : o.damagedEfficiency,
                in: o.isNew || undefined, //would need to set to false explicitly on load, because the default is true for Building as a whole
                va: o.variant || undefined,
                bo: this.buildingSet(o.builtOn),
            });
            if ("trafficQuantity" in o) r.tq = o.trafficQuantity;

            //Fields that only apply to PLACED buildings
            if (o.x !== -1) {
                Object.assign(r, {
                    x: o.x,
                    y: o.y,
                    ab: o.affectingBuildingCount, //could just recalculate by calling addBuilding during load
                    po: o.powered ? undefined : false, //I only want to store these if they're false, for storage efficiency reasons.
                    pc: o.powerConnected ? undefined : false,
                    rc: o.roadConnected ? undefined : false,
                });
            }
        }

        return r;
    };

    buildingSet(o: Set<Building>): any {
        if (o.size === 0) return undefined; //ignore on load
        return Array.from(o).map(p => p.id);
    }

    buildingResources(resources: Resource[]): any {
        if (!resources.length) return undefined; //ignore on load
        return resources.map(o => ({
            ty: o.type,
            am: o.amount || undefined, //0 is very common, so don't serialize at all in that case. Saves a lot of space.
            ca: o.capacity,
            cr: o.consumptionRate || undefined,
            pr: o.productionRate || undefined
        }));
    }
}

export class CityDeserializer {
    private buildingTypes: Map<string, Building> = BUILDING_TYPES; //Needs replaced after loading the templates from the city JSON.
    private blockerTypes: Map<string, Building> = BLOCKER_TYPES;
    private resourceTypes: Map<string, Resource> = new Map(RESOURCE_TYPES.map(p => [p.type, p]));

    city(player: Player, o: any): City {
        this.buildingTypes = new Map(o.bt.map((p: any) => this.building(p, true)).map((p: any) => [p.type, p])); //Load building templates first

        const buildings = <Building[]>o.bu.map((p: any) => this.building(p, false)).filter((p: any) => p);
        const unplacedBuildings = <Building[]>o.ub.map((p: any) => this.building(p, false)).filter((p: any) => p);

        //Now the buildings are instantiated, but we need them to reference each other. The 'loaded' property is used to store the Building object in the input object for this second pass.
        const buildingsByID = new Map(buildings.concat(unplacedBuildings).map(p => [p.id, p]));
        o.bu.forEach((p: any) => this.buildingSecondPass(p, p.loaded, buildingsByID));
        o.ub.forEach((p: any) => this.buildingSecondPass(p, p.loaded, buildingsByID));

        const eventTypes = this.eventTypes(o.et);
        const events = this.events(o.ev, eventTypes);
        const techManager = this.techManager(o.tm);
        const budget = <Budget>Object.assign(new Budget(), o.bg);
        if (!budget.taxRates["property"]) budget.taxRates["property"] = 0.1; //Old saves won't have this value
        const dietComposition = o.dc;
        const titles = this.titles(o.ti);
        const grid = this.grid(o.gr, buildingsByID);
        const effectGrid = this.effectGrid(o.eg, buildingsByID);

        if (grid && buildings.some(p => grid[p.y]?.[p.x] != p && !grid[p.y]?.[p.x]?.builtOn.has(p))) {
            console.error(new Date().toISOString(), player.id, "Deserialization: some buildings don't match their grid locations: " + buildings.filter(p => grid[p.y][p.x] != p).map(p => p.type + "(" + p.x + "," + p.y + ")").join(" "));
            //throw new Error("Deserialization error: some buildings don't match their grid locations: " + buildings.filter(p => grid[p.y][p.x] != p).map(p => p.type + "(" + p.x + "," + p.y + ")").join(" "));
        }

        const r = new City(player, o.id + "", o.na, o.wi, o.he, [...this.buildingTypes.values()], o.re.map((p: any) => this.resource(p)), unplacedBuildings, events,
            techManager, budget, undefined, titles, grid, [...eventTypes.values()], effectGrid, buildings, o.lt, o.st, o.nb, o.ri, o.rv, o.fl ? new Set(o.fl) : new Set(), o._v ?? 0);
        if (o.ob && r.presentBuildingCount.size === 0) r.presentBuildingCount = new Map(o.ob); //Shim so players don't have to refresh the page just because I removed 'ob' from the save data.
        r.desiredPower = o.dp;
        r.createdDate = new Date(o.cd);
        r.notifications = o.no.map((p: any) => new Notification(p.title, p.body, p.icon, new Date(p.date), p.seen));
        r.lastImportedPowerCost = o.pc;
        r.recentConstructionResourcesSold = o.cs;
        r.peakPopulation = o.pp;
        r.citizenDietSystem.lastDietComposition = dietComposition;
        r.trafficPrecalculation = o.tp || 0;
        r.roadUpkeepPrecalculation = o.ru || 0;
        r.altitectPlays = o.ap || 0;

        //Old defunct storage of some flags
        if (o.pm) r.flags.add(CityFlags.PoliceProtectionMatters);
        if (o.fm) r.flags.add(CityFlags.FireProtectionMatters);
        if (o.hm) r.flags.add(CityFlags.HealthcareMatters);
        if (o.em) r.flags.add(CityFlags.EducationMatters);
        if (o.gm) r.flags.add(CityFlags.GreenhouseGasesMatter);
        if (o.bp) r.flags.add(CityFlags.BlockersPointedOut);

        r.timeFreeze = o.tf || false;
        if (o.ts !== undefined) r.tutorialStepIndex = o.ts;
        if (o.as) r.assists = this.assists(o.as, r);
        if (o.gc) r.residenceSpawner.globalSpawnChance = o.gc;
        if (o.hb) r.happinessBreakdown = new Map(o.hb);
        if (o.mo) r.minigameOptions = new Map(o.mo);
        if (o.uo) r.unlockedMinigameOptions = new Set(o.uo);
        if (r.happinessBreakdown.has("Food satisfaction")) r.happinessBreakdown.delete("Food satisfaction"); //I renamed it to "Food gratification" to match the citizen diet screen later
        if (o.hx) r.happinessMaxima = new Map(o.hx);
        if (o.la) r.lastUserActionTimestamp = o.la;
        if (o.ls) r.lastSavedUserActionTimestamp = o.ls;
        return r;
    }

    assists(o: any, city: City) {
        if (o.length === 0) return [];
        const eventTypes = new Map(city.eventTypes.map(p => [p.type, p.clone()]))
        return o.map((p: any) => new Assist("", this.events([p.ev], eventTypes)[0], p.st, p.pl));
    }

    grid(o: number[][], buildingsByID: Map<number, Building>) {
        return o.map(row => row.map(cell => cell ? buildingsByID.get(cell)! : null));
    }

    effectGrid(o: any, buildingsByID: Map<number, Building>) {
        return o.map((row: any) => row.map((cell: any) => cell.filter((effect: any) => !effect.bi).map((effect: any) => this.effect(effect, buildingsByID)))); //No longer loading effects that came from a building.
    }

    effect(o: any, buildingsByID: Map<number, Building>) {
        return new Effect(
            o.ty,
            o.mu || 1,
            buildingsByID.get(o.bi),
            o.dc
        );
    }

    eventTypes(o: any) {
        const eventTypes = new Map(EVENT_TYPES.map(p => [p.type, p.clone()]))
        o.forEach((p: any) => {
            const eventType = eventTypes.get(p.ty);
            if (eventType) {
                eventType.activations = p.ac;
                eventType.duration = p.du;
                eventType.skippedStarts = p.ss;
                eventType.variables = p.va || [];
            }
        });
        return eventTypes;
    }

    events(o: any, eventTypes?: Map<string, CityEvent>) {
        if (!eventTypes) eventTypes = new Map(EVENT_TYPES.map(p => [p.type, p.clone()]));
        return <CityEvent[]>o.map((p: any) => {
            const eventType = eventTypes!.get(p.ty);
            if (!eventType) return;
            const r = eventType.clone();
            r.activations = p.ac;
            r.duration = p.du;
            if (p.md) r.maxDuration = p.md;
            r.skippedStarts = p.ss;
            r.variables = p.va || [];
            r.fromPlayer = p.pl ?? null;
            if (r instanceof EconomicBoom) r.chosenOnes = p.co;
            return r;
        }).filter((p: any) => p)
    }

    techManager(o: any): TechManager { //TECH_TYPES is the basis
        const techTypes = new Map(TECH_TYPES.map((p: Tech) => [p.id, p]));
        const techs = <Tech[]>o.te.map((p: any) => this.tech(techTypes, p));
        const r = new TechManager(techs);
        if (o.fv) r.lastFriendVisitDate = new Date(o.fv);
        r.lastResearchCompletionDates = o.cd.map((p: any) => new Date(p));
        return r;
    }

    tech(techTypes: Map<string, Tech>, o: any): Tech {
        const r = techTypes.get(o.id)!.clone();
        r.adoptionRate = o.ar;
        r.adoptionGrowth = o.ag;
        r.costs = o.co;
        if (o.re) r.researched = o.re;
        if (o.un) r.unavailable = o.un;
        return r;
    }

    titles(o: any): Map<string, Achievement> {
        const titleTypes = new Map(Object.values(TitleTypes).map(p => [p.id, p]));
        return new Map(o.map((p: any) => [p.id, this.title(titleTypes.get(p.id)!, p)]));
    }

    title(type: Achievement, o: any): Achievement {
        const r = type.clone();
        if (o.at) r.attained = o.at;
        if (o.ad) r.attainedDate = new Date(o.ad);
        if (o.lp) r.lastProgress = o.lp;
        if (o.dp && !r.attained) r.dataPoints = o.dp;
        return r;
    }

    resource(o: any): Resource {
        const obj = {
            buyableAmount: o.ba,
            buyCapacity: o.bc,
            amount: o.am || 0,
            capacity: o.ca || 0,
            consumptionRate: o.cr || 0,
            productionRate: o.pr || 0,
            autoBuyBelow: o.ab || 0,
            autoSellAbove: o.as !== undefined ? o.as : 1,
            buyPriceMultiplier: o.bm !== undefined ? o.bm : 1,
            sellPriceMultiplier: o.sm !== undefined ? o.sm : 1,
        };
        if (obj.buyableAmount === undefined) delete obj.buyableAmount;
        if (obj.buyCapacity === undefined) delete obj.buyCapacity;
        return this.resourceTypes.get(o.ty)!.clone(obj);
    }

    building(o: any, isTemplate: boolean): Building | undefined {
        const r = (this.buildingTypes.get(o.ty) ?? this.blockerTypes.get(o.ty))?.clone();
        if (!r) {
            console.error(new Date().toISOString(), "Building type does not exist. Type: " + o.ty + "; building type list: " + [...this.buildingTypes.keys()].join(","));
            return; //Can't deserialize if the type doesn't exist anymore.
        }

        r.outputResources = this.buildingResources(o.or);
        r.inputResources = this.buildingResources(o.ir);
        if (o.bv !== undefined) r.businessValue = o.bv;
        if (o.bc !== undefined) r.businessPatronCap = o.bc;
        if (o.bf !== undefined) r.businessFailed = o.bf;
        if (o.fc !== undefined) r.businessFailureCounter = o.fc;
        r.patronageEfficiency = o.pe === undefined ? 1 : o.pe;
        if (o.va !== undefined) r.variant = o.va;
        if ("storeAmount" in r) (<any>r).storeAmount = o.sa || 0;
        if ("trafficQuantity" in r) (<any>r).trafficQuantity = o.tq || 0;
        r.mods = o.mo || [];

        if (isTemplate) { //Leave the values alone for some fields if it's a template
            if (o.lo !== undefined) r.locked = o.lo;
            r.isHidden = o.ih || r.isHidden;
        } else { //Either placed or unplaced, but not a template
            r.id = o.id || 0;
            r.owned = o.ow || false;
            r.lastEfficiency = o.le !== undefined ? o.le : 0;
            r.upkeepEfficiency = o.ue;
            r.poweredTimeDuringLongTick = o.pt !== undefined ? o.pt : 0;
            r.damagedEfficiency = o.de !== undefined ? o.de : 1;
            r.isNew = o.in || false;
            //builtOn must be done in the second pass after all Building objects are at least *created*, because they have to reference each other.
            
            if (o.x !== undefined) { //Placed building
                r.x = o.x;
                r.y = o.y;
                r.affectingBuildingCount = o.ab;
                r.powered = o.po ?? true; //Only stored if false, or if it's an old version of the data, so undefined -> true.
                r.powerConnected = o.pc ?? true;
                r.roadConnected = o.rc ?? true;
            }
        }
        return o.loaded = r; //Store the loaded building in the input object to make the second pass easy.
    }

    buildingSecondPass(o: any, r: Building, buildingsByID: Map<number, Building>) {
        if (o.bo) r.builtOn = new Set(o.bo.map((p: any) => buildingsByID.get(p)!));
        if ("onLoad" in r && typeof r.onLoad === 'function') r.onLoad();
    }

    buildingResources(o: any): Resource[] {
        if (!o) return [];
        return o.map((p: any) => {
            const obj = { amount: p.am, productionRate: p.pr, capacity: p.ca, consumptionRate: p.cr };
            if (obj.amount === undefined) delete obj.amount; //Or else you'll get 'undefined' because of clone() using Object.assign
            if (obj.capacity === undefined) delete obj.capacity;
            if (obj.consumptionRate === undefined) delete obj.consumptionRate;
            if (obj.productionRate === undefined) delete obj.productionRate;
            return this.resourceTypes.get(p.ty)!.clone(obj);
        });
    }
}

export class PlayerSerializer {
    player(o: Player, forDB: boolean = false) {
        const player = <any>{
            no: this.notifications(o.notifications),
            ac: this.achievements(o.achievements),
            ft: o.finishedTutorial === true ? undefined : o.finishedTutorial,
            la: o.lastUserActionTimestamp,
            ls: o.lastSavedUserActionTimestamp,
        };
        if (!forDB) {
            player.id = o.id;
            player.na = o.name;
            player.fr = <any[]>o.friends.map((p): any => this.player(p, forDB));
            player.ci = o.cities.map(p => ({ id: p.id, na: p.name }));
            player.av = o.avatar || undefined;
        }
        return player;
    }

    achievements(o: Achievement[]) {
        return Array.from(o.values()).map(p => ({
            id: p.id,
            at: p.attained || undefined,
            ad: p.attainedDate || undefined,
            lp: p.lastProgress || undefined,
            dp: p.attained ? undefined : p.dataPoints,
        }));
    }

    notifications(o: Notification[]) {
        return o.map(p => ({
            title: p.title,
            body: p.body,
            icon: p.icon,
            date: p.date,
            seen: p.seen,
        }));
    }
}

export class PlayerDeserializer {
    player(o: any): Player {
        const r = new Player(o.id, o.na);
        r.notifications = this.notifications(o.no);
        r.achievements = this.achievements(o.ac);
        r.friends = (o.fr || []).map((p: any) => this.player(p));
        r.cities = <City[]>(o.ci || []).map((p: any) => ({ id: p.id + "", name: p.na }));
        r.finishedTutorial = o.ft === undefined; //Undefined = true, present = false
        r.avatar = o.av || "";
        if (o.la) r.lastUserActionTimestamp = o.la;
        if (o.ls) r.lastSavedUserActionTimestamp = o.ls;
        return r;
    }

    achievements(o: any): Achievement[] {
        const achievementTypes = new Map(Object.values(AchievementTypes).map(p => [p.id, p]));
        return o ? o.map((p: any) => this.achievement(achievementTypes.get(p.id), p)).filter((p: any) => p) : [];
    }

    achievement(type: Achievement | undefined, o: any): Achievement | undefined {
        if (!type) return undefined;
        const r = type.clone();
        if (o.at) r.attained = o.at;
        if (o.ad) r.attainedDate = new Date(o.ad);
        if (o.lp) r.lastProgress = o.lp;
        if (o.dp && !r.attained) r.dataPoints = o.dp;
        return r;
    }

    notifications(o: any): Notification[] {
        return o ? o.map((p: any) => new Notification(p.title, p.body, p.icon, new Date(p.date), p.seen)) : [];
    }
}
