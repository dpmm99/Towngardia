import { AchievementTypes } from "../game/AchievementTypes.js";
import { City } from "../game/City.js";
import { CityFlags } from "../game/CityFlags.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { Milestone } from "./Milestone.js";
import { StandardScroller } from "./StandardScroller.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";

export class MilestonesMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scrollerX = new StandardScroller(true, false);
    private scrollerY = new StandardScroller(true, true);
    private descScroller = new StandardScroller(true, true);
    private selectedMilestone: Milestone | null = null;
    private markerHeight = 40;
    private milestoneSize = 96;
    private padding = 20;
    private outerPadding = 200;
    private preloaded: boolean = false;

    constructor(
        private city: City,
        private uiManager: UIManager,
        private milestones: Milestone[] = []
    ) {
        this.milestones.push(new Milestone(
            CityFlags.PoliceProtectionMatters,
            "Police Protection",
            "Reach 100 population to unlock police services", //TODO: One source of truth for the population numbers
            0, 200,
            [],
            [],
            "police"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedStarbox,
            "Starbox",
            "Reach 175 population to unlock the Starbox minigame",
            200, 200,
            [CityFlags.PoliceProtectionMatters],
            [],
            "starbox"
        ));

        this.milestones.push(new Milestone(
            CityFlags.FireProtectionMatters,
            "Fire Protection",
            "Reach 250 population to unlock fire services",
            400, 200,
            [CityFlags.UnlockedStarbox],
            [],
            "fire"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedInformationCenter,
            "Information Center",
            "Reach 400 population to unlock the Information Center",
            600, 200,
            [CityFlags.FireProtectionMatters],
            [],
            "infocenter"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedSlots,
            "Slots Minigame",
            "Reach 400 population and build a Casino to unlock the Slots minigame",
            600, 400,
            [CityFlags.UnlockedInformationCenter],
            [],
            "slots"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedTourism,
            "Tourism",
            "Build an Information Center to unlock Tourism and the Nepotism Networking minigame",
            600, 0,
            [CityFlags.UnlockedInformationCenter],
            [],
            "tourism"
        ));

        this.milestones.push(new Milestone(
            CityFlags.FoodMatters,
            "Dietary Diversity",
            "Reach 500 population to unlock new food requirements",
            800, 200,
            [CityFlags.UnlockedInformationCenter],
            [],
            "diet1"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedPost,
            "Post Office",
            "Reach 650 population to unlock the Post Office",
            1000, 200,
            [CityFlags.FoodMatters],
            [],
            "mail"
        ));

        this.milestones.push(new Milestone(
            CityFlags.EducationMatters,
            "Education",
            "Reach 800 population to unlock educational facilities",
            1200, 200,
            [CityFlags.UnlockedPost],
            [],
            "education"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedGameDev,
            "High-Tech Facilities",
            "Achieve an average education level of 0.9 to unlock various high-tech buildings",
            1200, 400,
            [CityFlags.EducationMatters],
            [],
            "hightech"
        ));

        this.milestones.push(new Milestone(
            CityFlags.DataAvailable,
            "Processing Power",
            "Keep a Data Center running at >90% efficiency, enabling a new line of research as long as it stays that way",
            1200, 600,
            [CityFlags.UnlockedGameDev],
            [],
            "data"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedTeleportationPod,
            "Public Teleportation",
            "Complete a perfect game of Monobrynth after unlocking high-tech buildings to unlock Teleportation Pod",
            1400, 400,
            [CityFlags.UnlockedGameDev],
            [],
            "teleport"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedMuseumOfFutureArts,
            "The Future Now",
            "Keep a Quantum Computing Lab running for a while after unlocking Teleportation Pod to unlock Museum of Future Arts",
            1600, 400,
            [CityFlags.UnlockedTeleportationPod],
            [],
            "futurearts"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedSandsOfTime,
            "The Future Even Now-er",
            "Keep a Museum of Future Arts running for a while to unlock the Sands of Time monument",
            1800, 400,
            [CityFlags.UnlockedMuseumOfFutureArts],
            [],
            "sandsoftime"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedPortal,
            "Otherworldly Portal",
            "Keep a Sands of Time monument running for a while to unlock the Portal",
            2000, 400,
            [CityFlags.UnlockedSandsOfTime],
            [],
            "portal"
        ));

        this.milestones.push(new Milestone(
            AchievementTypes.PlainsAndAstralPlanes.id,
            "Regions and Realms",
            "Keep four Colleges and a Museum of Future Arts running, reach 30,000 population, and bring a Portal up to max efficiency to unlock alternative regions and realms, applicable account-wide when starting a new city",
            3200, 400, //To the right of the Greenhouse Gases one because you can't reach 30k without reaching 8k first (and vertically aligning them makes it unclear which one was required for which)
            [CityFlags.UnlockedPortal, CityFlags.GreenhouseGasesMatter],
            ["plains"],
            "realms"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedLogisticsCenter,
            "Logistics Center",
            "Reach 1000 population to unlock the Logistics Center.",
            1400, 200,
            [CityFlags.EducationMatters],
            [],
            "logistics"
        ));

        this.milestones.push(new Milestone(
            CityFlags.WaterMatters,
            "Water Supply",
            "Reach 1100 population to unlock water needs and management.",
            1600, 200,
            [CityFlags.UnlockedLogisticsCenter],
            [],
            "water"
        ));

        this.milestones.push(new Milestone(
            CityFlags.HealthcareMatters,
            "Healthcare",
            "Reach 1400 population to unlock healthcare needs and facilities.",
            1800, 200,
            [CityFlags.WaterMatters],
            [],
            "health"
        ));

        this.milestones.push(new Milestone(
            CityFlags.WaterTreatmentMatters,
            "Clean Water",
            "Reach 1600 population to start treating your water supply for citizens' health.",
            2000, 200,
            [CityFlags.HealthcareMatters],
            [],
            "watertreat"
        ));

        this.milestones.push(new Milestone(
            CityFlags.B12Matters,
            "Long-Term Diet",
            "Reach 1800 population to unlock greater food demands and algae farms.",
            2200, 200,
            [CityFlags.WaterTreatmentMatters],
            [],
            "diet2"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedMinigameLab,
            "Minigame Lab",
            "Reach 2000 population to unlock the Minigame Minilab.",
            2400, 200,
            [CityFlags.B12Matters],
            [],
            "minigame"
        ));

        this.milestones.push(new Milestone(
            CityFlags.CitizenDietFullSwing,
            "Maximum Diet Requirements",
            "Reach 2500 population for the citizens' final food demands.",
            2600, 200,
            [CityFlags.UnlockedMinigameLab],
            [],
            "diet3"
        ));

        this.milestones.push(new Milestone(
            CityFlags.UnlockedAltitect,
            "Altitect",
            "Reach 3000 population, have 4+ skyscrapers, and have 1000+ flunds left from the previous update to unlock the Altitect minigame.",
            2800, 200,
            [CityFlags.CitizenDietFullSwing],
            [],
            "altitect"
        ));

        this.milestones.push(new Milestone(
            CityFlags.GreenhouseGasesMatter,
            "Environmental Concerns",
            `Reach ${city.getGreenhouseGasesMinPopulation()} population to realize the effects of greenhouse gases.`,
            3000, 200,
            [CityFlags.UnlockedAltitect],
            [],
            "ghg"
        ));

        this.milestones.push(new Milestone(
            CityFlags.GeothermalAvailable,
            "Venting",
            "Experience an earthquake that triggers the formation of a Geothermal Vent (fumarole), enabling a new line of research.",
            0, 400,
            [],
            ["plains"],
            "geothermal"
        ));
    }

    onResize(): void {
        this.scrollerX.onResize();
        this.scrollerY.onResize();
        this.descScroller.onResize();
    }

    private renderConnections(drawable: Drawable): void {
        this.milestones.forEach(milestone => {
            if (!milestone.canShowInRegion(this.city.regionID!)) return;

            milestone.prerequisites.forEach(prereqId => {
                const prereq = this.milestones.find(m => m.id === prereqId);
                if (!prereq || !prereq.canShowInRegion(this.city.regionID!)) return;

                const lineColor = prereq.isAttained(this.city) ? '#aaaaaa' : '#666666';
                const startX = milestone.displayX - this.scrollerX.getScroll();
                const startY = milestone.displayY + this.markerHeight / 2 + 2 - this.scrollerY.getScroll();
                const endX = prereq.displayX - this.scrollerX.getScroll();
                const endY = prereq.displayY + this.markerHeight / 2 + 2 - this.scrollerY.getScroll();

                // Draw horizontal line
                drawable.addChild(new Drawable({
                    x: this.outerPadding + Math.min(startX, endX),
                    y: this.outerPadding + startY,
                    width: Math.abs(endX - startX) + 5 + "px",
                    height: "5px",
                    fallbackColor: lineColor,
                    scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                }));

                // Draw vertical line
                drawable.addChild(new Drawable({
                    x: this.outerPadding + endX,
                    y: this.outerPadding + Math.min(startY, endY),
                    width: "5px",
                    height: Math.abs(endY - startY) + 5 + "px",
                    fallbackColor: lineColor,
                    scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                }));
            });
        });
    }

    private generateBottomBar(): Drawable {
        const bar = new Drawable({
            anchors: ['bottom'],
            y: -200 + this.descScroller.getScroll(),
            width: "100%",
            height: "400px",
            fallbackColor: '#333333',
            biggerOnMobile: true,
            scaleYOnMobile: true,
            onDrag: (x: number, y: number) => this.descScroller.handleDrag(y, bar.screenArea),
            onDragEnd: () => this.descScroller.resetDrag(),
        });

        bar.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "calc(100% - 20px)",
            height: "30px",
            text: this.selectedMilestone ? this.selectedMilestone.name : "No Milestone Selected",
            biggerOnMobile: true,
        }));

        bar.addChild(new Drawable({
            x: 10,
            y: 50,
            width: "calc(100% - 20px)",
            height: "22px",
            text: this.selectedMilestone ? this.selectedMilestone.description : "Select a milestone to see its description",
            wordWrap: true,
            biggerOnMobile: true,
            scaleYOnMobile: true,
        }));

        this.descScroller.setChildrenSize(600); //Random guess since I don't (think I) have a way to measure the text

        return bar;
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        const milestonesDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "milestones",
            onDrag: (x: number, y: number) => {
                this.scrollerX.handleDrag(x, milestonesDrawable.screenArea);
                this.scrollerY.handleDrag(y, milestonesDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scrollerX.resetDrag();
                this.scrollerY.resetDrag();
            }
        });

        let maxX = 0;
        let maxY = 0;

        this.renderConnections(milestonesDrawable);

        this.milestones.forEach(milestone => {
            if (!milestone.canShowInRegion(this.city.regionID!)) return;

            maxX = Math.max(maxX, milestone.displayX + this.outerPadding);
            maxY = Math.max(maxY, milestone.displayY + this.outerPadding);
            const x = milestone.displayX + this.outerPadding - this.scrollerX.getScroll();
            const y = milestone.displayY + this.outerPadding - this.scrollerY.getScroll();

            //I both liked and disliked this. :) const prereqsAttained = milestone.prerequisites.map(prereqId => this.milestones.find(m => m.id === prereqId)).every(p => p?.isAttained(this.city));
            const thisAttained = milestone.isAttained(this.city);

            const marker = milestonesDrawable.addChild(new Drawable({
                centerOnOwnX: true,
                x: x,
                y: y,
                image: new TextureInfo(this.milestoneSize, this.milestoneSize, "milestone/milestone"),
                onClick: () => this.selectedMilestone = milestone,
                grayscale: !thisAttained, //Note: it's pretty much gray to begin with
                scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
            }));

            if (thisAttained) { //The following condition goes with the above "liked and disliked" comment: || prereqsAttained
                marker.addChild(new Drawable({
                    anchors: ['bottom', 'centerX'],
                    y: this.markerHeight / 2 + 10,
                    centerOnOwnX: true, //Use natural image size
                    image: new TextureInfo(0, 0, "milestone/" + milestone.imageFile),
                    onClick: () => this.selectedMilestone = milestone,
                    //Also goes with the above "liked and disliked" comment: grayscale: !thisAttained,
                    scaleXOnMobile: true, scaleYOnMobile: true, biggerOnMobile: true,
                }));
            }
        });

        this.scrollerX.setChildrenSize(maxX + this.milestoneSize + this.padding + this.outerPadding);
        this.scrollerY.setChildrenSize(maxY + this.milestoneSize + this.padding + this.outerPadding + 300);

        // Title and close button
        milestonesDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/milestones")
        }));

        milestonesDrawable.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Milestones",
            width: "250px",
            height: "32px"
        }));

        milestonesDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.uiManager.hideMilestonesMenu(),
        }));

        const container = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#00000000',
        });
        container.addChild(milestonesDrawable);
        container.addChild(this.generateBottomBar());

        return this.lastDrawable = container;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    public show(): void {
        this.scrollerX.resetScroll();
        this.scrollerY.resetScroll();
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

        const urls: { [key: string]: string } = {};
        urls["milestone/milestone"] = "assets/milestone/milestone.png";
        for (const milestone of this.milestones) {
            urls["milestone/" + milestone.imageFile] = `assets/milestone/${milestone.imageFile}.png`;
        }

        await this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, urls);
        this.preloaded = true;
    }
}
